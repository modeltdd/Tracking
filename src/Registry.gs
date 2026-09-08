/**
 * ทะเบียนผลงานทั้งหมด — หน้าเฉพาะบัญชี role "ผู้รับผิดชอบ"/"Admin" (เจ้าหน้าที่ล็อกอินทุกคน เพราะระบบมีแค่ 2 role นี้)
 * เห็นงานทุกหน่วยงานในระบบเดียว ค้นหา/กรองสถานะ/แบ่งหน้าได้ และแก้ current_status_public ตรง ๆ
 * ผ่านฟอร์ม (ไม่ผ่าน action ปกติที่ผูกกับ org/next_station_key) — ใช้กรณีต้องแก้ไขสถานะให้ตรงกับความเป็นจริง
 *
 * ไม่กระทบ Dashboard/ค้นหา/สแกน QR/โซนสาธารณะที่ยัง scope ตาม organization เหมือนเดิมทุกอย่าง — เป็นเส้นทาง
 * page=registry แยกต่างหาก reuse โครงสร้างข้อมูลเดิมทั้งหมด (Works/StatusHistory, updateWorkRow_,
 * findWorkById_, writeAuditLog_) ไม่มีการเพิ่ม/เปลี่ยนคอลัมน์ในชีตใด ๆ
 */

var REGISTRY_PER_PAGE_OPTIONS_ = [10, 25, 50, 100];

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

/** กรองด้วยคำค้น (เลขทะเบียน/ชื่อเจ้าของผลงาน/ชื่อผลงาน/หน่วยงานที่รับผิดชอบ) + ตัวกรองสถานะ */
function filterRegistryWorks_(works, query, statusFilter) {
  var needle = String(query || '').trim().toLowerCase();
  var status = String(statusFilter || '').trim();
  return works.filter(function (w) {
    if (status && w.current_status_public !== status) return false;
    if (!needle) return true;
    var ownerName = ((w.title_name || '') + (w.first_name || '') + ' ' + (w.last_name || '')).toLowerCase();
    return String(w.tracking_no || '').toLowerCase().indexOf(needle) !== -1 ||
      ownerName.indexOf(needle) !== -1 ||
      String(w.work_title || '').toLowerCase().indexOf(needle) !== -1 ||
      String(w.current_owner_org || '').toLowerCase().indexOf(needle) !== -1;
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

/** อ่าน query params ของหน้าทะเบียน — ใช้ทั้งตอนแสดงลิสต์และตอนสร้างลิงก์กลับหลังแก้ไข/บันทึก */
function parseRegistryParams_(params) {
  return {
    q: String(params.q || '').trim(),
    status: String(params.status || '').trim(),
    p: parseInt(params.p, 10) || 1,
    per: parseInt(params.per, 10) || REGISTRY_PER_PAGE_OPTIONS_[1],
  };
}

/** เส้นทางหน้าทะเบียนผลงานทั้งหมด (GET) — แสดงลิสต์ หรือฟอร์มแก้ไข 1 รายการถ้ามี ?edit=<work_id> */
function renderRegistryRoute_(ss, user, params, baseUrl, flashMessage) {
  if (!canAccessRegistry_(user)) {
    return renderStaffPage_('ไม่มีสิทธิ์เข้าถึง', renderStubBody_('เฉพาะบัญชีผู้รับผิดชอบ/ผู้ดูแลระบบเท่านั้นที่เข้าหน้านี้ได้', baseUrl), user, 'dashboard', baseUrl);
  }

  var rp = parseRegistryParams_(params);
  var editId = String(params.edit || '').trim();

  if (editId) {
    var work = findWorkById_(ss, editId);
    if (!work) {
      return renderStaffPage_('ทะเบียนผลงานทั้งหมด', renderStubBody_('ไม่พบงานที่ระบุ', baseUrl), user, 'registry', baseUrl);
    }
    return renderStaffPage_('อัปเดตสถานะ', renderRegistryEditBody_(work, rp, baseUrl, [], {}), user, 'registry', baseUrl);
  }

  var all = getAllWorksForRegistry_(ss);
  var filtered = filterRegistryWorks_(all, rp.q, rp.status);
  var pageResult = paginateList_(filtered, rp.p, rp.per);
  return renderStaffPage_('ทะเบียนผลงานทั้งหมด',
    renderRegistryListBody_(pageResult, rp, all.length, baseUrl, flashMessage), user, 'registry', baseUrl);
}

/** ประมวลผลบันทึกอัปเดตสถานะจากฟอร์มแก้ไข (POST form_action=registry_status_update)
 *  อัปเดตเฉพาะ work_id ที่เลือก (updateWorkRow_ เดิม), ไม่สร้างแถวงานใหม่ — เพิ่มแค่ StatusHistory 1 แถวเป็นบันทึกการเปลี่ยนสถานะ */
function performRegistryStatusUpdate_(ss, user, e) {
  var p = (e && e.parameter) || {};
  var workId = String(p.work_id || '').trim();
  var newStatus = String(p.new_status || '').trim();
  var note = String(p.note || '').trim();
  var actionDateInput = String(p.action_date || '').trim();

  var work = findWorkById_(ss, workId);
  if (!work) return { ok: false, errors: ['ไม่พบงานที่ระบุ'] };
  if (!PUBLIC_STATUS_LABELS.hasOwnProperty(newStatus)) return { ok: false, errors: ['สถานะที่เลือกไม่ถูกต้อง'], work: work };

  var actionDate = actionDateInput ? new Date(actionDateInput) : now_();
  if (isNaN(actionDate.getTime())) return { ok: false, errors: ['วันที่ดำเนินการไม่ถูกต้อง'], work: work };

  var oldStatus = work.current_status_public;
  updateWorkRow_(ss, workId, { current_status_public: newStatus, updated_at: actionDate });

  appendRowByHeader_(ss.getSheetByName(SHEET.STATUS_HISTORY), SHEET_HEADERS[SHEET.STATUS_HISTORY], {
    history_id: Utilities.getUuid(), work_id: work.work_id, tracking_no: work.tracking_no,
    action: 'status_updated', from_station: work.current_station_key, to_station: work.current_station_key,
    from_org: work.current_owner_org, to_org: work.current_owner_org,
    action_by: user.user_email, action_by_org: user.organization, action_date: actionDate,
    note: note, revision_reasons: '', revision_due_date: '', attachment_url: '', created_at: now_(),
  });

  if (oldStatus !== newStatus) {
    writeAuditLog_(user.user_email, 'registry_status_update', work.work_id, 'current_status_public', oldStatus, newStatus);
  }

  return { ok: true, work_id: workId };
}

/** ต่อ query string จาก parseRegistryParams_() บวก override เฉพาะจุด — ใช้สร้างลิงก์แบ่งหน้า/กลับจากฟอร์มแก้ไขโดยรักษาตัวกรองเดิม */
function buildRegistryQuery_(rp, overrides) {
  var merged = { q: rp.q, status: rp.status, p: rp.p, per: rp.per, edit: '' };
  Object.keys(overrides || {}).forEach(function (k) { merged[k] = overrides[k]; });
  var parts = ['page=registry'];
  if (merged.q) parts.push('q=' + encodeURIComponent(merged.q));
  if (merged.status) parts.push('status=' + encodeURIComponent(merged.status));
  if (merged.p && merged.p !== 1) parts.push('p=' + merged.p);
  if (merged.per && merged.per !== REGISTRY_PER_PAGE_OPTIONS_[1]) parts.push('per=' + merged.per);
  if (merged.edit) parts.push('edit=' + encodeURIComponent(merged.edit));
  return parts.join('&');
}
