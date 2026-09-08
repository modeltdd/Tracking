/**
 * โซนผู้ดูแลระบบ (Admin) — docs/DESIGN.md ลำดับพัฒนา #7
 * จัดการ Workflow (WorkflowStates, โมเดล 24-state), ผู้ใช้งาน, Dashboard ผู้บริหาร (ทุกหน่วยงาน), Audit Log, รายงาน CSV
 * เข้าถึงได้เฉพาะ user.role === 'Admin' เท่านั้น — ตรวจซ้ำทั้งจุดเข้า GET (renderAdminRoute_) และทุกจุดเข้า POST (Code.gs)
 */

var ADMIN_ROLE_OPTIONS_ = ['Admin', 'ผู้รับผิดชอบ'];

/** จุดเข้าโซน Admin ทั้งหมด (?page=admin) — แยกหน้าย่อยด้วย ?tab= */
function renderAdminRoute_(ss, user, params, baseUrl) {
  if (user.role !== 'Admin') {
    return renderStaffPage_('ไม่มีสิทธิ์', renderStubBody_('เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่เข้าหน้านี้ได้', baseUrl), user, 'admin', baseUrl);
  }

  var tab = params.tab || 'overview';

  if (tab === 'report' && params.format === 'csv') {
    return buildAdminCsvResponse_(ss, params.type || 'works');
  }
  if (tab === 'station_form') {
    var station = params.key ? findStationByKey_(ss, params.key) : null;
    return renderStaffPage_('จัดการ Workflow', renderStationFormBody_(ss, station, baseUrl, [], null), user, 'admin', baseUrl);
  }
  if (tab === 'user_form') {
    var editUser = params.email ? findUserByEmailRaw_(ss, params.email) : null;
    return renderStaffPage_('จัดการผู้ใช้งาน', renderUserFormBody_(editUser, baseUrl, [], null), user, 'admin', baseUrl);
  }
  if (tab === 'stations') {
    return renderStaffPage_('จัดการ Workflow', renderAdminStationsBody_(listStationsSorted_(ss), baseUrl), user, 'admin', baseUrl);
  }
  if (tab === 'users') {
    return renderStaffPage_('จัดการผู้ใช้งาน', renderAdminUsersBody_(listUsersSorted_(ss), baseUrl), user, 'admin', baseUrl);
  }
  if (tab === 'audit') {
    return renderStaffPage_('Audit Log', renderAdminAuditBody_(listRecentAuditLog_(ss, 200), baseUrl), user, 'admin', baseUrl);
  }
  if (tab === 'report') {
    return renderStaffPage_('รายงาน CSV', renderAdminReportBody_(baseUrl), user, 'admin', baseUrl);
  }

  var metrics = computeExecMetrics_(ss);
  return renderStaffPage_('แดชบอร์ดผู้บริหาร', renderAdminOverviewBody_(metrics, baseUrl), user, 'admin', baseUrl);
}

/* ---------- Dashboard ผู้บริหาร (ทุกหน่วยงาน) ---------- */

/** เหมือน computeDashboardMetrics_ (Dashboard.gs) แต่รวมทุกหน่วยงานในครั้งเดียว ไม่กรองเฉพาะ org เดียว */
function computeExecMetrics_(ss) {
  var works = readSheetAsObjects_(ss.getSheetByName(SHEET.WORKS));
  var history = readSheetAsObjects_(ss.getSheetByName(SHEET.STATUS_HISTORY));
  var stationByKey = getStationsMap_(ss);

  var statusCounts = {};
  Object.keys(PUBLIC_STATUS_LABELS).forEach(function (k) { statusCounts[k] = 0; });

  var orgRows = {};
  function orgRow(org) {
    if (!orgRows[org]) orgRows[org] = { org: org, pendingReceive: 0, inProgress: 0, nearDue: 0, overdue: 0 };
    return orgRows[org];
  }

  works.forEach(function (w) {
    if (w.current_status_public in statusCounts) statusCounts[w.current_status_public]++;
    var station = stationByKey[w.current_station_key];

    if (w.handoff_pending) {
      if (station) orgRow(station.org).pendingReceive++;
    } else if (TERMINAL_STATUSES_.indexOf(w.current_status_public) === -1 && w.current_owner_org) {
      var row = orgRow(w.current_owner_org);
      row.inProgress++;
      var dueBucket = dueBucketFor_(history, w, station);
      if (dueBucket === 'overdue') row.overdue++;
      else if (dueBucket === 'near') row.nearDue++;
    }
  });

  var orgList = Object.keys(orgRows).map(function (k) { return orgRows[k]; })
    .sort(function (a, b) { return b.inProgress - a.inProgress; });

  return { totalWorks: works.length, statusCounts: statusCounts, orgList: orgList };
}

/* ---------- จัดการ Workflow (WorkflowStates) ---------- */

function listStationsSorted_(ss) {
  return readSheetAsObjects_(ss.getSheetByName(SHEET.WORKFLOW_STATES))
    .sort(function (a, b) { return Number(a.station_order) - Number(b.station_order); });
}

function findStationByKey_(ss, key) {
  var stations = readSheetAsObjects_(ss.getSheetByName(SHEET.WORKFLOW_STATES));
  for (var i = 0; i < stations.length; i++) {
    if (stations[i].station_key === key) return stations[i];
  }
  return null;
}

/** สร้าง/แก้ไขสถานี — station_key เป็น key คงที่ (แก้ไม่ได้หลังสร้าง) กันงานเดิมที่อ้าง key นี้อยู่พัง
 * คืน { ok:true } หรือ { ok:false, errors, values, isNew } ให้แสดงฟอร์มเดิมพร้อมข้อมูลที่กรอกไว้อีกครั้ง */
function performAdminStationSave_(ss, user, e) {
  var p = (e && e.parameter) || {};
  var isNew = p.is_new === '1';
  var values = {
    station_key: String(p.station_key || '').trim(),
    station_order: String(p.station_order || '').trim(),
    station_name: String(p.station_name || '').trim(),
    org: String(p.org || '').trim(),
    standard_days: String(p.standard_days || '').trim(),
    public_status: String(p.public_status || '').trim(),
    receive_role: String(p.receive_role || '').trim(),
    approve_role: String(p.approve_role || '').trim(),
    notify_method: String(p.notify_method || '').trim(),
    active: p.active === '1',
  };

  var errors = [];
  if (!/^[a-zA-Z0-9_]+$/.test(values.station_key)) errors.push('รหัสสถานี (station_key) ต้องเป็นตัวอักษรอังกฤษ/ตัวเลข/underscore เท่านั้น');
  if (!values.station_name) errors.push('ชื่อสถานีห้ามว่าง');
  if (!values.org) errors.push('หน่วยงานห้ามว่าง');
  if (!values.station_order || isNaN(Number(values.station_order))) errors.push('ลำดับสถานีต้องเป็นตัวเลข');
  if (!values.standard_days || isNaN(Number(values.standard_days))) errors.push('จำนวนวันมาตรฐานต้องเป็นตัวเลข');
  if (!PUBLIC_STATUS_LABELS[values.public_status]) errors.push('สถานะสาธารณะที่เลือกไม่ถูกต้อง');

  var existing = findStationByKey_(ss, values.station_key);
  if (isNew && existing) errors.push('มีรหัสสถานีนี้อยู่แล้ว: ' + values.station_key);
  if (!isNew && !existing) errors.push('ไม่พบสถานีที่ระบุ');

  if (errors.length) return { ok: false, errors: errors, values: values, isNew: isNew };

  values.station_order = Number(values.station_order);
  values.standard_days = Number(values.standard_days);

  if (isNew) {
    appendRowByHeader_(ss.getSheetByName(SHEET.WORKFLOW_STATES), SHEET_HEADERS[SHEET.WORKFLOW_STATES], values);
  } else {
    logFieldChanges_(user.user_email, 'edited_station', values.station_key, existing, values,
      ['station_order', 'station_name', 'org', 'standard_days', 'public_status', 'receive_role', 'approve_role', 'notify_method', 'active']);
    updateWorkStationRow_(ss, values.station_key, values);
  }
  return { ok: true, isNew: isNew, station_key: values.station_key };
}

function updateWorkStationRow_(ss, stationKey, fields) {
  var sheet = ss.getSheetByName(SHEET.WORKFLOW_STATES);
  var headers = SHEET_HEADERS[SHEET.WORKFLOW_STATES];
  var keyCol = headers.indexOf('station_key') + 1;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) throw new Error('ไม่พบสถานี (ชีต WorkflowStates ว่างเปล่า)');
  var keys = sheet.getRange(2, keyCol, lastRow - 1, 1).getValues();
  for (var i = 0; i < keys.length; i++) {
    if (keys[i][0] !== stationKey) continue;
    var rowNum = i + 2;
    Object.keys(fields).forEach(function (k) {
      var col = headers.indexOf(k) + 1;
      if (col > 0) sheet.getRange(rowNum, col).setValue(fields[k]);
    });
    return;
  }
  throw new Error('ไม่พบสถานี station_key: ' + stationKey);
}

/* ---------- จัดการผู้ใช้งาน (Users) ---------- */

function listUsersSorted_(ss) {
  return readSheetAsObjects_(ss.getSheetByName(SHEET.USERS))
    .sort(function (a, b) { return String(a.display_name).localeCompare(String(b.display_name), 'th'); });
}

/** ต่างจาก findUserByEmail_ ใน Auth.gs ตรงที่คืนผู้ใช้แม้ active=false — Admin ต้องแก้ไข/เปิดใช้งานผู้ใช้ที่ถูกปิดไว้ได้ */
function findUserByEmailRaw_(ss, email) {
  var users = readSheetAsObjects_(ss.getSheetByName(SHEET.USERS));
  var needle = String(email || '').toLowerCase();
  for (var i = 0; i < users.length; i++) {
    if (String(users[i].user_email).toLowerCase() === needle) return users[i];
  }
  return null;
}

/** สร้าง/แก้ไขผู้ใช้ — user_email เป็น key คงที่ (แก้ไม่ได้หลังสร้าง)
 * กันตนเองถอดสิทธิ์ Admin/ปิดบัญชีตนเองจนล็อกตัวเองออกจากระบบ */
function performAdminUserSave_(ss, actingUser, e) {
  var p = (e && e.parameter) || {};
  var isNew = p.is_new === '1';
  var values = {
    user_email: String(p.user_email || '').trim().toLowerCase(),
    display_name: String(p.display_name || '').trim(),
    role: String(p.role || '').trim(),
    organization: String(p.organization || '').trim(),
    active: p.active === '1',
  };

  var errors = [];
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.user_email)) errors.push('อีเมลไม่ถูกต้อง');
  if (!values.display_name) errors.push('ชื่อที่แสดงห้ามว่าง');
  if (ADMIN_ROLE_OPTIONS_.indexOf(values.role) === -1) errors.push('บทบาท (role) ที่เลือกไม่ถูกต้อง');
  if (!values.organization) errors.push('หน่วยงานห้ามว่าง');

  var existing = findUserByEmailRaw_(ss, values.user_email);
  if (isNew && existing) errors.push('มีผู้ใช้อีเมลนี้อยู่แล้ว: ' + values.user_email);
  if (!isNew && !existing) errors.push('ไม่พบผู้ใช้ที่ระบุ');

  var isSelf = !!existing && actingUser.user_email.toLowerCase() === values.user_email;
  if (isSelf && (!values.active || values.role !== 'Admin')) {
    errors.push('ไม่สามารถถอดสิทธิ์ผู้ดูแลระบบ หรือปิดการใช้งานบัญชีของตนเองได้ (ให้ Admin คนอื่นดำเนินการแทน)');
  }

  if (errors.length) return { ok: false, errors: errors, values: values, isNew: isNew };

  if (isNew) {
    appendRowByHeader_(ss.getSheetByName(SHEET.USERS), SHEET_HEADERS[SHEET.USERS], values);
  } else {
    logFieldChanges_(actingUser.user_email, 'edited_user', values.user_email, existing, values,
      ['display_name', 'role', 'organization', 'active']);
    updateUserRow_(ss, values.user_email, values);
  }
  return { ok: true, isNew: isNew, user_email: values.user_email };
}

function updateUserRow_(ss, email, fields) {
  var sheet = ss.getSheetByName(SHEET.USERS);
  var headers = SHEET_HEADERS[SHEET.USERS];
  var keyCol = headers.indexOf('user_email') + 1;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) throw new Error('ไม่พบผู้ใช้ (ชีต Users ว่างเปล่า)');
  var keys = sheet.getRange(2, keyCol, lastRow - 1, 1).getValues();
  for (var i = 0; i < keys.length; i++) {
    if (String(keys[i][0]).toLowerCase() !== email.toLowerCase()) continue;
    var rowNum = i + 2;
    Object.keys(fields).forEach(function (k) {
      var col = headers.indexOf(k) + 1;
      if (col > 0) sheet.getRange(rowNum, col).setValue(fields[k]);
    });
    return;
  }
  throw new Error('ไม่พบผู้ใช้ user_email: ' + email);
}

/** บันทึก AuditLog ทีละฟิลด์ที่เปลี่ยนจริงเท่านั้น (ข้อกำหนดความปลอดภัย #8, #11) */
function logFieldChanges_(userEmail, action, refId, oldObj, newObj, fields) {
  fields.forEach(function (f) {
    var oldVal = oldObj[f];
    var newVal = newObj[f];
    if (String(oldVal) === String(newVal)) return;
    writeAuditLog_(userEmail, action, refId, f, oldVal, newVal);
  });
}

/* ---------- Audit Log viewer ---------- */

function listRecentAuditLog_(ss, limit) {
  var logs = readSheetAsObjects_(ss.getSheetByName(SHEET.AUDIT_LOG));
  logs.sort(function (a, b) { return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(); });
  return logs.slice(0, limit);
}

/* ---------- รายงาน CSV ---------- */

var WORKS_CSV_COLUMNS_ = [
  'tracking_no', 'title_name', 'first_name', 'last_name', 'position', 'current_level', 'requested_level',
  'work_type', 'work_title', 'org_from', 'citizen_id_last4', 'phone', 'email', 'received_date',
  'current_station_key', 'current_status_public', 'handoff_pending', 'current_owner_org',
  'current_handler_name', 'updated_at', 'next_step_text', 'created_by', 'created_at', 'evaluation_result',
];
var AUDIT_CSV_COLUMNS_ = ['timestamp', 'user_email', 'action', 'work_id', 'field_changed', 'old_value', 'new_value'];

/** คืน TextOutput ชนิด CSV พร้อม BOM (ให้ Excel เปิดภาษาไทยถูกต้อง) — เฉพาะ Admin เท่านั้น (ตรวจสิทธิ์ที่ renderAdminRoute_ แล้ว) */
function buildAdminCsvResponse_(ss, type) {
  var csv = type === 'audit' ? buildAuditLogCsv_(ss) : buildWorksCsv_(ss);
  var bom = String.fromCharCode(0xFEFF);
  return ContentService.createTextOutput(bom + csv).setMimeType(ContentService.MimeType.CSV);
}

function buildWorksCsv_(ss) {
  var works = readSheetAsObjects_(ss.getSheetByName(SHEET.WORKS));
  var rows = [WORKS_CSV_COLUMNS_].concat(works.map(function (w) {
    return WORKS_CSV_COLUMNS_.map(function (col) { return csvValue_(w[col]); });
  }));
  return rows.map(function (r) { return r.map(csvEscape_).join(','); }).join('\r\n');
}

function buildAuditLogCsv_(ss) {
  var logs = listRecentAuditLog_(ss, 5000);
  var rows = [AUDIT_CSV_COLUMNS_].concat(logs.map(function (l) {
    return AUDIT_CSV_COLUMNS_.map(function (col) { return csvValue_(l[col]); });
  }));
  return rows.map(function (r) { return r.map(csvEscape_).join(','); }).join('\r\n');
}

function csvValue_(v) {
  if (v instanceof Date) return formatDateTh_(v);
  return v == null ? '' : String(v);
}

function csvEscape_(s) {
  s = String(s);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
