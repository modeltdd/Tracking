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

/** ปีงบประมาณไทย (ต.ค.-ก.ย.) ของวันที่ใดๆ — ตั้งชื่อตามปีปลาย (เช่น ต.ค.2568-ก.ย.2569 = ปีงบ 2569) ใช้กับ
 *  filter "ปีงบประมาณ" ของมุมมอง Excel (2026-09-25) และ buildMonthlyStateSnapshot_ */
function fiscalYearOfDate_(date) {
  var d = new Date(date);
  var beYear = getBuddhistYear_(d);
  return (d.getMonth() + 1) >= 10 ? beYear + 1 : beYear;
}

/** กรองด้วยคำค้น (เลขทะเบียน/ชื่อเจ้าของผลงาน/ชื่อผลงาน/หน่วยงาน) + state/ผู้รับผิดชอบ/หน่วยงาน/ผลการพิจารณา/bucket tile
 *  + ตำแหน่ง/ด้าน/จังหวัด/ปีงบประมาณ/เดือน (2026-09-25 เพิ่มสำหรับมุมมอง Excel — ใช้ร่วมกับมุมมองการ์ดเดิมได้ด้วย)
 *  overdueIds: ผลลัพธ์จาก computeRegistryBuckets_().overdueIds — ต้องคำนวณแยกล่วงหน้าเพราะ overdue ต้องใช้ StatusHistory */
function filterRegistryWorks_(works, rp, overdueIds) {
  var needle = String(rp.q || '').trim().toLowerCase();
  return works.filter(function (w) {
    if (rp.state && w.current_station_key !== rp.state) return false;
    if (rp.resp && w.current_owner_org !== rp.resp) return false;
    if (rp.org && w.org_from !== rp.org) return false;
    if (rp.result && w.evaluation_result !== rp.result) return false;
    if (rp.position && w.position !== rp.position) return false;
    if (rp.specialty && w.specialty !== rp.specialty) return false;
    if (rp.province && w.province !== rp.province) return false;
    if (rp.fy && String(fiscalYearOfDate_(w.received_date)) !== rp.fy) return false;
    if (rp.month && (new Date(w.received_date).getMonth() + 1) !== Number(rp.month)) return false;
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
var REGISTRY_SORTABLE_COLUMNS_ = ['tracking_no', 'work_title', 'org_from', 'owner', 'state', 'current_owner_org', 'updated_at', 'received_date'];

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
    if (rp.sort === 'updated_at' || rp.sort === 'received_date') return new Date(w[rp.sort]).getTime() || 0;
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

/** อ่าน query params ของหน้าทะเบียน (2026-09-25 เพิ่ม view/position/specialty/province/fy/month/monthly
 *  สำหรับมุมมอง Excel — ไม่กระทบ default ของมุมมองการ์ดเดิมเลย เพราะทุกตัวว่าง = ไม่กรอง/ปิดเหมือนเดิม) */
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
    view: params.view === 'excel' ? 'excel' : 'card',
    position: String(params.position || '').trim(),
    specialty: String(params.specialty || '').trim(),
    province: String(params.province || '').trim(),
    fy: String(params.fy || '').trim(),
    month: String(params.month || '').trim(),
    monthly: params.monthly === '1' ? '1' : '',
  };
}

/**
 * เส้นทางหน้าทะเบียนผลงานทั้งหมด (GET) — สรุปตัวเลข (tile) + ลิสต์ + ค้นหา/กรอง + แบ่งหน้า (แก้ไขไปที่หน้าสแกน QR แทน)
 * 2026-09-25: เพิ่มมุมมอง Excel (rp.view==='excel') — ใช้ข้อมูล/filter/sort/permission ชุดเดียวกับมุมมอง
 * การ์ดเดิมทุกประการ (ไม่มีฐานข้อมูล/permission ใหม่ ตามที่ผู้ใช้ขอ) ต่างแค่การแสดงผลเป็นตารางกว้างคอลัมน์เยอะขึ้น
 * + Monthly Snapshot ทางเลือก (rp.monthly==='1', คำนวณจาก StatusHistory จริงเท่านั้น ไม่เดา)
 */
function renderRegistryRoute_(ss, user, params, baseUrl, flashMessage) {
  if (!canAccessRegistry_(user)) {
    return renderStaffPage_('ไม่มีสิทธิ์เข้าถึง', renderStubBody_('เฉพาะบัญชีผู้รับผิดชอบ/ผู้ดูแลระบบเท่านั้นที่เข้าหน้านี้ได้', baseUrl), user, 'dashboard', baseUrl);
  }

  var rp = parseRegistryParams_(params);
  var all = getAllWorksForRegistry_(ss);
  var bucketData = computeRegistryBuckets_(ss, all);
  var filtered = filterRegistryWorks_(all, rp, bucketData.overdueIds);
  var stationsMap = getStationsMap_(ss);
  filtered = sortRegistryWorks_(filtered, rp, stationsMap);
  var pageResult = paginateList_(filtered, rp.p, rp.per);

  if (rp.view === 'excel') {
    var fy = rp.fy || String(fiscalYearOfDate_(now_()));
    var monthlySnapshot = rp.monthly === '1' ? buildMonthlyStateSnapshot_(ss, pageResult.items, fy) : null;
    var fyOptions = distinctValues_(all.map(function (w) { return { fy: String(fiscalYearOfDate_(w.received_date)) }; }), 'fy').sort().reverse();
    return renderStaffPage_('ทะเบียนผลงานทั้งหมด (มุมมอง Excel)',
      renderRegistryExcelViewBody_(ss, pageResult, rp, all.length, bucketData.counts, baseUrl, flashMessage, stationsMap, monthlySnapshot, fyOptions),
      user, 'registry', baseUrl);
  }

  return renderStaffPage_('ทะเบียนผลงานทั้งหมด',
    renderRegistryListBody_(ss, pageResult, rp, all.length, bucketData.counts, baseUrl, flashMessage), user, 'registry', baseUrl);
}

/**
 * Export CSV ของหน้าทะเบียน (2026-09-25) — ตามเงื่อนไข filter/sort ปัจจุบันทั้งหมด (ไม่ใช่แค่หน้าที่กำลังดูอยู่
 * เอาทุกแถวที่ตรงเงื่อนไข) คืน ContentService ตรงๆ (ไม่ผ่าน renderStaffPage_ — ไม่ใช่หน้า HTML) BOM นำหน้ากัน
 * Excel อ่านภาษาไทยเพี้ยน ใช้ field จริงทั้งหมด ไม่มีคอลัมน์ใหม่ที่ไม่มีอยู่ในระบบจริง
 */
function exportRegistryCsv_(ss, user, params) {
  var rp = parseRegistryParams_(params);
  var all = getAllWorksForRegistry_(ss);
  var bucketData = computeRegistryBuckets_(ss, all);
  var filtered = filterRegistryWorks_(all, rp, bucketData.overdueIds);
  var stationsMap = getStationsMap_(ss);
  filtered = sortRegistryWorks_(filtered, rp, stationsMap);

  var headers = ['ลำดับ', 'เลขทะเบียน', 'ชื่อ-สกุล', 'ตำแหน่ง', 'ด้าน', 'จังหวัด', 'วันที่ลงรับ', 'ทีม', 'เลขา',
    'หน่วยงาน', 'State ปัจจุบัน', 'ผู้รับผิดชอบปัจจุบัน', 'วันที่อัปเดตล่าสุด'];
  var monthlySnapshot = null;
  if (rp.monthly === '1') {
    var fy = rp.fy || String(fiscalYearOfDate_(now_()));
    monthlySnapshot = buildMonthlyStateSnapshot_(ss, filtered, fy);
    headers = headers.concat(monthlySnapshot.months);
  }

  // csvValue_/csvEscape_ (Admin.gs) — reuse ของเดิมเป๊ะ ไม่เขียน escape logic ซ้ำ
  var lines = [headers.map(csvEscape_).join(',')];
  filtered.forEach(function (w, i) {
    var station = stationsMap[w.current_station_key];
    var ownerName = ((w.title_name || '') + (w.first_name || '') + ' ' + (w.last_name || '')).trim();
    var row = [
      i + 1, w.tracking_no, ownerName, w.position, w.specialty, w.province,
      formatDateTh_(w.received_date), w.legacy_team, w.secretary, w.org_from,
      station ? (station.station_order + ' ' + station.station_name) : w.current_station_key,
      w.current_owner_org, formatDateTh_(w.updated_at),
    ].map(csvValue_);
    if (monthlySnapshot) {
      row = row.concat((monthlySnapshot.rows[w.work_id] || monthlySnapshot.months.map(function () { return ''; })).map(csvValue_));
    }
    lines.push(row.map(csvEscape_).join(','));
  });

  var bom = String.fromCharCode(0xFEFF);
  var csv = bom + lines.join('\r\n');
  return ContentService.createTextOutput(csv).setMimeType(ContentService.MimeType.CSV);
}

/**
 * State ของแต่ละงาน ณ สิ้นเดือน ตลอดปีงบประมาณที่ระบุ (2026-09-25, Monthly Snapshot ตามที่ผู้ใช้ขอ) — คำนวณจาก
 * StatusHistory จริงเท่านั้น (ห้ามเดา): เดินประวัติของแต่ละงานเรียงตามเวลาจริงครั้งเดียว (ไม่ใช่ query ซ้ำ 12
 * รอบต่องาน) แล้วจับ state ล่าสุด ณ จุดตัดสิ้นเดือนนั้นๆ งานที่ยังไม่มีประวัติถึงเดือนนั้น (ยังไม่ลงทะเบียน) = null
 * (แสดง "-" ไม่ใช่เดา) ปีงบประมาณนับ ต.ค.(ปี-1) ถึง ก.ย.(ปี) ตามปีงบประมาณไทย
 */
function buildMonthlyStateSnapshot_(ss, works, fiscalYearBE) {
  var historyByWork = {};
  readSheetAsObjects_(ss.getSheetByName(SHEET.STATUS_HISTORY)).forEach(function (h) {
    if (!h.to_station) return;
    if (h.action !== 'registered' && h.action !== 'transition' && h.action !== 'reassigned') return;
    (historyByWork[h.work_id] = historyByWork[h.work_id] || []).push(h);
  });
  Object.keys(historyByWork).forEach(function (wid) {
    historyByWork[wid].sort(function (a, b) { return new Date(a.action_date).getTime() - new Date(b.action_date).getTime(); });
  });

  var stationsMap = getStationsMap_(ss);
  var ceEndYear = Number(fiscalYearBE) - 543; // ปีปฏิทินของ ม.ค.-ก.ย. (ปลายปีงบ)
  var monthDefs = [];
  [9, 10, 11].forEach(function (m) { monthDefs.push({ ceYear: ceEndYear - 1, monthIndex0: m }); }); // ต.ค.-ธ.ค.
  [0, 1, 2, 3, 4, 5, 6, 7, 8].forEach(function (m) { monthDefs.push({ ceYear: ceEndYear, monthIndex0: m }); }); // ม.ค.-ก.ย.
  monthDefs.forEach(function (md) {
    md.cutoff = new Date(md.ceYear, md.monthIndex0 + 1, 0, 23, 59, 59);
    md.label = THAI_MONTHS_SHORT_[md.monthIndex0];
  });

  var rows = {};
  works.forEach(function (w) {
    var hist = historyByWork[w.work_id] || [];
    var row = [];
    var hi = 0;
    var lastStationKey = null;
    monthDefs.forEach(function (md) {
      while (hi < hist.length && new Date(hist[hi].action_date).getTime() <= md.cutoff.getTime()) {
        lastStationKey = hist[hi].to_station;
        hi++;
      }
      if (!lastStationKey) { row.push(null); return; }
      var st = stationsMap[lastStationKey];
      row.push(st ? st.station_order : lastStationKey);
    });
    rows[w.work_id] = row;
  });
  return { months: monthDefs.map(function (md) { return md.label; }), rows: rows };
}

/** ต่อ query string จาก parseRegistryParams_() บวก override เฉพาะจุด — ใช้สร้างลิงก์แบ่งหน้า/tile/toggle view */
function buildRegistryQuery_(rp, overrides) {
  var merged = {
    q: rp.q, state: rp.state, resp: rp.resp, org: rp.org, result: rp.result, bucket: rp.bucket,
    sort: rp.sort, dir: rp.dir, p: rp.p, per: rp.per, view: rp.view, position: rp.position,
    specialty: rp.specialty, province: rp.province, fy: rp.fy, month: rp.month, monthly: rp.monthly,
  };
  Object.keys(overrides || {}).forEach(function (k) { merged[k] = overrides[k]; });
  var parts = ['page=registry'];
  if (merged.q) parts.push('q=' + encodeURIComponent(merged.q));
  if (merged.state) parts.push('state=' + encodeURIComponent(merged.state));
  if (merged.resp) parts.push('resp=' + encodeURIComponent(merged.resp));
  if (merged.org) parts.push('org=' + encodeURIComponent(merged.org));
  if (merged.result) parts.push('result=' + encodeURIComponent(merged.result));
  if (merged.bucket) parts.push('bucket=' + encodeURIComponent(merged.bucket));
  if (merged.position) parts.push('position=' + encodeURIComponent(merged.position));
  if (merged.specialty) parts.push('specialty=' + encodeURIComponent(merged.specialty));
  if (merged.province) parts.push('province=' + encodeURIComponent(merged.province));
  if (merged.fy) parts.push('fy=' + encodeURIComponent(merged.fy));
  if (merged.month) parts.push('month=' + encodeURIComponent(merged.month));
  if (merged.monthly) parts.push('monthly=' + encodeURIComponent(merged.monthly));
  if (merged.sort) {
    parts.push('sort=' + encodeURIComponent(merged.sort));
    parts.push('dir=' + (merged.dir === 'asc' ? 'asc' : 'desc'));
  }
  if (merged.view && merged.view !== 'card') parts.push('view=' + encodeURIComponent(merged.view));
  if (merged.p && merged.p !== 1) parts.push('p=' + merged.p);
  if (merged.per && merged.per !== REGISTRY_PER_PAGE_OPTIONS_[1]) parts.push('per=' + merged.per);
  return parts.join('&');
}
