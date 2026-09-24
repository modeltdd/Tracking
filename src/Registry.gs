/**
 * ทะเบียนผลงานทั้งหมด — หน้าเฉพาะบัญชี role "ผู้รับผิดชอบ"/"Admin" (เจ้าหน้าที่ล็อกอินทุกคน เพราะระบบมีแค่ 2 role นี้)
 * เห็นงานทุกหน่วยงานในระบบเดียว ค้นหา/กรองได้ 4 มิติ (State/ผู้รับผิดชอบ/หน่วยงาน/ผลการพิจารณา)/แบ่งหน้าได้
 *
 * "จัดการ" ของแต่ละแถวลิงก์ไปหน้าสแกน QR เดียวกับที่ใช้สแกนจริง (page=scan&t=<qr_token>) — ไม่มีฟอร์มแก้ไข
 * แยกต่างหากอีกต่อไป (2026-09-08 เปลี่ยนจากที่เคยแก้สถานะอิสระไม่เช็คหน่วยงาน) ปุ่มเปลี่ยนสถานะที่หน้านั้น
 * คำนวณจาก computeEligibleTransitions_ (Actions.gs) เหมือนกันทุกที่ — เห็นได้ทุกงาน แต่แก้ได้เฉพาะ state ที่
 * หน่วยงานตนรับผิดชอบ ณ ขณะนั้นเท่านั้น (ไม่ใช่ Admin ก็ตาม) ไม่ใช่ state ของตนจะเห็นแค่อ่านอย่างเดียว
 *
 * ไม่กระทบ Dashboard/ค้นหา/สแกน QR/โซนสาธารณะที่ยัง scope ตาม organization เหมือนเดิมทุกอย่าง
 */

var REGISTRY_PER_PAGE_OPTIONS_ = [10, 25, 50, 100];
var REGISTRY_RESULT_OPTIONS_ = ['ผ่าน', 'ไม่ผ่าน', 'แก้ไข 2 เดือน', 'แก้ไข 6 เดือน'];

/** เฉพาะบัญชี staff ที่ login แล้ว (Admin หรือ ผู้รับผิดชอบ — ระบบมีแค่ 2 role นี้ตั้งแต่รวม role 2026-09-08) */
function canAccessRegistry_(user) {
  return user.role === 'Admin' || user.role === 'ผู้รับผิดชอบ';
}

/** งานทั้งหมดในระบบ ไม่ scope ตามหน่วยงาน (ต่างจาก searchWorks_ ที่ scope ตาม org) — ใช้เฉพาะหน้าทะเบียนนี้
 *  เรียงล่าสุดขึ้นก่อนด้วยวันที่รับเอกสาร (received_date desc), เสมอกันไล่ตามเลขทะเบียน (tracking_no desc) */
function getAllWorksForRegistry_(ss) {
  var works = readSheetAsObjects_(ss.getSheetByName(SHEET.WORKS));
  return works.sort(function (a, b) {
    var byReceived = new Date(b.received_date).getTime() - new Date(a.received_date).getTime();
    if (byReceived !== 0) return byReceived;
    return String(b.tracking_no).localeCompare(String(a.tracking_no));
  });
}

/** สรุปตัวเลข 4 กลุ่มสำหรับ tile บนหัวหน้าทะเบียน (คลิกกรองได้) — ค้างนานคำนวณด้วย dueBucketFor_ เดิม (Dashboard.gs) */
function computeRegistryBuckets_(ss, works) {
  var history = readSheetAsObjects_(ss.getSheetByName(SHEET.STATUS_HISTORY));
  var stationsMap = getStationsMap_(ss);
  var buckets = { all: works.length, progress: 0, revision: 0, done: 0, overdue: 0 };
  var overdueIds = {};
  works.forEach(function (w) {
    if (w.current_status_public === 'need_revision') buckets.revision++;
    else if (TERMINAL_STATUSES_.indexOf(w.current_status_public) !== -1) buckets.done++;
    else buckets.progress++;
    var station = stationsMap[w.current_station_key];
    if (dueBucketFor_(history, w, station) === 'overdue') { buckets.overdue++; overdueIds[w.work_id] = true; }
  });
  return { counts: buckets, overdueIds: overdueIds };
}

/** กรองด้วยคำค้น (เลขทะเบียน/ชื่อเจ้าของผลงาน/ชื่อผลงาน/หน่วยงาน) + state/ผู้รับผิดชอบ/หน่วยงาน/ผลการพิจารณา/bucket tile
 *  overdueIds: ผลลัพธ์จาก computeRegistryBuckets_().overdueIds — ต้องคำนวณแยกล่วงหน้าเพราะ overdue ต้องใช้ StatusHistory */
function filterRegistryWorks_(works, rp, overdueIds) {
  var needle = String(rp.q || '').trim().toLowerCase();
  return works.filter(function (w) {
    if (rp.state && w.current_station_key !== rp.state) return false;
    if (rp.resp && w.current_owner_org !== rp.resp) return false;
    if (rp.org && w.org_from !== rp.org) return false;
    if (rp.result && w.evaluation_result !== rp.result) return false;
    if (rp.bucket === 'revision' && w.current_status_public !== 'need_revision') return false;
    if (rp.bucket === 'done' && TERMINAL_STATUSES_.indexOf(w.current_status_public) === -1) return false;
    if (rp.bucket === 'progress' && (w.current_status_public === 'need_revision' || TERMINAL_STATUSES_.indexOf(w.current_status_public) !== -1)) return false;
    if (rp.bucket === 'overdue' && !(overdueIds && overdueIds[w.work_id])) return false;
    if (!needle) return true;
    var ownerName = ((w.title_name || '') + (w.first_name || '') + ' ' + (w.last_name || '')).toLowerCase();
    return String(w.tracking_no || '').toLowerCase().indexOf(needle) !== -1 ||
      ownerName.indexOf(needle) !== -1 ||
      String(w.work_title || '').toLowerCase().indexOf(needle) !== -1 ||
      String(w.current_owner_org || '').toLowerCase().indexOf(needle) !== -1 ||
      String(w.org_from || '').toLowerCase().indexOf(needle) !== -1;
  });
}

/** คอลัมน์ที่หัวตารางทะเบียนกดเรียงได้ (2026-09-24 ตามที่ผู้ใช้ขอ) — 'owner'/'state' ไม่ใช่ field ตรงๆ ของ Works
 *  คำนวณ key เปรียบเทียบเองใน sortRegistryWorks_ (owner จาก title_name+first_name+last_name จริง, state จาก
 *  station_order จริงใน WorkflowStates ไม่ใช่เรียงตามตัวอักษรชื่อ state ซึ่งไม่ตรงลำดับ workflow จริง) */
var REGISTRY_SORTABLE_COLUMNS_ = ['tracking_no', 'work_title', 'org_from', 'owner', 'state', 'current_owner_org', 'updated_at'];

/** เรียงผลลัพธ์ทะเบียนตาม rp.sort/rp.dir (ไม่มี rp.sort = ไม่เรียง คงลำดับเดิมจาก getAllWorksForRegistry_
 *  คือ received_date desc) เรียกหลัง filterRegistryWorks_ ก่อนแบ่งหน้าเสมอ */
function sortRegistryWorks_(list, rp, stationsMap) {
  if (!rp.sort || REGISTRY_SORTABLE_COLUMNS_.indexOf(rp.sort) === -1) return list;
  var dir = rp.dir === 'asc' ? 1 : -1;
  function keyOf(w) {
    if (rp.sort === 'owner') return ((w.title_name || '') + (w.first_name || '') + ' ' + (w.last_name || '')).trim();
    if (rp.sort === 'state') {
      var st = stationsMap[w.current_station_key];
      return st ? parseFloat(st.station_order) : 0;
    }
    if (rp.sort === 'updated_at') return new Date(w.updated_at).getTime() || 0;
    return String(w[rp.sort] || '');
  }
  return list.slice().sort(function (a, b) {
    var ka = keyOf(a), kb = keyOf(b);
    if (typeof ka === 'number' && typeof kb === 'number') return (ka - kb) * dir;
    return String(ka).localeCompare(String(kb), 'th') * dir;
  });
}

/** ตัดหน้า (pagination) แบบทั่วไป — คืน items ของหน้านั้น + สรุปตัวเลขไว้ทำ footer */
function paginateList_(list, page, perPage) {
  var per = REGISTRY_PER_PAGE_OPTIONS_.indexOf(perPage) !== -1 ? perPage : REGISTRY_PER_PAGE_OPTIONS_[1];
  var totalItems = list.length;
  var totalPages = Math.max(1, Math.ceil(totalItems / per));
  var p = Math.min(Math.max(1, page || 1), totalPages);
  var start = (p - 1) * per;
  return { items: list.slice(start, start + per), page: p, perPage: per, totalItems: totalItems, totalPages: totalPages };
}

/** อ่าน query params ของหน้าทะเบียน */
function parseRegistryParams_(params) {
  return {
    q: String(params.q || '').trim(),
    state: String(params.state || '').trim(),
    resp: String(params.resp || '').trim(),
    org: String(params.org || '').trim(),
    result: String(params.result || '').trim(),
    bucket: String(params.bucket || '').trim(),
    sort: String(params.sort || '').trim(),
    dir: params.dir === 'asc' ? 'asc' : 'desc',
    p: parseInt(params.p, 10) || 1,
    per: parseInt(params.per, 10) || REGISTRY_PER_PAGE_OPTIONS_[1],
  };
}

/** เส้นทางหน้าทะเบียนผลงานทั้งหมด (GET) — สรุปตัวเลข (tile) + ลิสต์ + ค้นหา/กรอง + แบ่งหน้า (แก้ไขไปที่หน้าสแกน QR แทน) */
function renderRegistryRoute_(ss, user, params, baseUrl, flashMessage) {
  if (!canAccessRegistry_(user)) {
    return renderStaffPage_('ไม่มีสิทธิ์เข้าถึง', renderStubBody_('เฉพาะบัญชีผู้รับผิดชอบ/ผู้ดูแลระบบเท่านั้นที่เข้าหน้านี้ได้', baseUrl), user, 'dashboard', baseUrl);
  }

  var rp = parseRegistryParams_(params);
  var all = getAllWorksForRegistry_(ss);
  var bucketData = computeRegistryBuckets_(ss, all);
  var filtered = filterRegistryWorks_(all, rp, bucketData.overdueIds);
  filtered = sortRegistryWorks_(filtered, rp, getStationsMap_(ss));
  var pageResult = paginateList_(filtered, rp.p, rp.per);
  return renderStaffPage_('ทะเบียนผลงานทั้งหมด',
    renderRegistryListBody_(ss, pageResult, rp, all.length, bucketData.counts, baseUrl, flashMessage), user, 'registry', baseUrl);
}

/** ต่อ query string จาก parseRegistryParams_() บวก override เฉพาะจุด — ใช้สร้างลิงก์แบ่งหน้า/tile */
function buildRegistryQuery_(rp, overrides) {
  var merged = { q: rp.q, state: rp.state, resp: rp.resp, org: rp.org, result: rp.result, bucket: rp.bucket, sort: rp.sort, dir: rp.dir, p: rp.p, per: rp.per };
  Object.keys(overrides || {}).forEach(function (k) { merged[k] = overrides[k]; });
  var parts = ['page=registry'];
  if (merged.q) parts.push('q=' + encodeURIComponent(merged.q));
  if (merged.state) parts.push('state=' + encodeURIComponent(merged.state));
  if (merged.resp) parts.push('resp=' + encodeURIComponent(merged.resp));
  if (merged.org) parts.push('org=' + encodeURIComponent(merged.org));
  if (merged.result) parts.push('result=' + encodeURIComponent(merged.result));
  if (merged.bucket) parts.push('bucket=' + encodeURIComponent(merged.bucket));
  if (merged.sort) {
    parts.push('sort=' + encodeURIComponent(merged.sort));
    parts.push('dir=' + (merged.dir === 'asc' ? 'asc' : 'desc'));
  }
  if (merged.p && merged.p !== 1) parts.push('p=' + merged.p);
  if (merged.per && merged.per !== REGISTRY_PER_PAGE_OPTIONS_[1]) parts.push('per=' + merged.per);
  return parts.join('&');
}
