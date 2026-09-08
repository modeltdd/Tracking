/**
 * จุดเข้าใช้งาน Web App — doGet/doPost
 *
 * สถานะ: เชลล์เจ้าหน้าที่ (bottom-nav 3 ปุ่ม + Dashboard), รับเอกสารใหม่, ค้นหา + รายละเอียดงาน (Timeline),
 * สแกน QR รับงาน + ปุ่ม action ทั้ง 8 (docs/DESIGN.md ตาราง 3.2), โซนประชาชน (ตรวจสอบสถานะ + revision detail, Part 6),
 * โซนผู้ดูแลระบบ (Admin): จัดการ Workflow/ผู้ใช้งาน, Dashboard ผู้บริหาร, Audit Log, รายงาน CSV (Part 7) พร้อมใช้งานแล้ว
 */
function doGet(e) {
  if (!isSystemInstalled_()) {
    return renderPage_('ยังไม่ได้ติดตั้งระบบ', htmlNotInstalled_());
  }

  var params = (e && e.parameter) || {};
  var ss = getSpreadsheet_();

  // Session.getActiveUser() คืนค่าว่างเสมอสำหรับ Gmail ส่วนตัว (ยืนยันแล้วด้วย debug page — ดู docs/DESIGN.md
  // A19) — fallback ไปตรวจ Google ID token จาก Google Identity Services แทน (GIS_AUTH_SCRIPT_ ฝัง token
  // ต่อท้ายทุกลิงก์/ฟอร์มภายในให้อัตโนมัติหลัง sign-in ครั้งแรกที่ renderAuthBootstrapPage_)
  var email = getCurrentUserEmail_() || verifyAuthToken_(ss, params.auth);

  if (!email) {
    // เครื่องมือ debug ชั่วคราว (?debug=1) — เก็บไว้เผื่อวิเคราะห์ปัญหา login เพิ่มเติมในอนาคต
    if (params.debug === '1') {
      return renderPage_('Debug: สถานะ Login', '' +
        '<p><b>Session.getActiveUser().getEmail()</b> และ Google ID token (ถ้ามี) ต่างคืนค่าว่างทั้งคู่</p>' +
        '<p>ถ้าเป็นบัญชี Gmail ส่วนตัว ให้เข้าทาง <a href="' + getWebAppUrl_() + '?staff=1">ลิงก์ Sign-In สำหรับเจ้าหน้าที่</a> แทนลิงก์ปกติ — ลิงก์ปกติตั้งใจให้เป็นโซนสาธารณะเสมอ (ประชาชนไม่ต้อง Google Sign-In)</p>');
    }
    // เข้าทางลิงก์เจ้าหน้าที่โดยเฉพาะ (?staff=1) หรือมี token ค้าง/หมดอายุอยู่แล้ว (?auth=...) = ตั้งใจจะเป็น
    // เจ้าหน้าที่ → ลอง Google Sign-In ก่อน ไม่ใช่ผู้เยี่ยมชมทั่วไป
    if (params.staff === '1' || params.auth) {
      return renderAuthBootstrapPage_(ss, getWebAppUrl_(), e.queryString || '');
    }
    // ผู้เยี่ยมชมไม่ได้ Login → โซนสาธารณะ (ตรวจสอบสถานะด้วยเลขติดตาม+last4, PublicTrack.gs) — พฤติกรรมเดิมทุกประการ
    return handlePublicTrackGet_(e);
  }

  var user = findUserByEmail_(email);
  if (!user) {
    return renderPage_('ไม่มีสิทธิ์เข้าใช้งาน', htmlAccessDenied_(email));
  }

  return routeStaffPage_(e, user);
}

/** เจ้าหน้าที่ผ่านการตรวจสอบสิทธิ์แล้ว — เลือกหน้าตาม ?page= (ค่าเริ่มต้น dashboard) */
function routeStaffPage_(e, user) {
  var params = (e && e.parameter) || {};
  // ไม่ระบุ ?page= และไม่ได้มาจากลิงก์ QR (?t=) เลย = เพิ่ง login เข้ามาตรงๆ — ผู้รับผิดชอบเข้าทะเบียนผลงาน
  // เป็นหน้าแรกทันที (งานประจำวันคือดูทะเบียน+อัปเดตสถานะ) ส่วน Admin ยังเข้า Dashboard/ภาพรวมก่อนเหมือนเดิม
  var defaultPage = user.role === 'Admin' ? 'dashboard' : 'registry';
  var page = params.page || (params.t ? 'scan' : defaultPage);
  var ss = getSpreadsheet_();
  var baseUrl = getWebAppUrl_();

  switch (page) {
    case 'admin':
      return renderAdminRoute_(ss, user, params, baseUrl);
    case 'scan':
      return renderScanRoute_(ss, user, params, baseUrl);
    case 'forward':
      var forwardWorks = getForwardableWorks_(ss, user.organization);
      return renderStaffPage_('ส่งต่อ', renderForwardListBody_(user.organization, forwardWorks, getStationsMap_(ss), baseUrl), user, 'forward', baseUrl);
    case 'registry':
      return renderRegistryRoute_(ss, user, params, baseUrl, '');
    case 'search':
      var query = params.q || '';
      var results = searchWorks_(ss, user.organization, query);
      return renderStaffPage_('ค้นหา', renderSearchBody_(user.organization, query, results, baseUrl), user, 'search', baseUrl);
    case 'detail':
      var work = findWorkById_(ss, params.id);
      if (!work) {
        return renderStaffPage_('ไม่พบรายการ', renderStubBody_('ไม่พบงานที่ระบุ (work_id: ' + params.id + ')', baseUrl), user, 'search', baseUrl);
      }
      var workHistory = getHistoryForWork_(ss, params.id);
      if (!canViewWorkDetail_(work, user, workHistory)) {
        return renderStaffPage_('ไม่มีสิทธิ์เข้าถึง', renderStubBody_('งานนี้ไม่เกี่ยวข้องกับหน่วยงานของท่าน จึงไม่สามารถดูรายละเอียดได้', baseUrl), user, 'search', baseUrl);
      }
      var stationsMap = getStationsMap_(ss);
      return renderStaffPage_('รายละเอียดผลงาน', renderWorkDetailBody_(work, workHistory, stationsMap, baseUrl), user, 'search', baseUrl);
    case 'qrprint':
      var qrWork = findWorkById_(ss, params.id);
      if (!qrWork) {
        return renderStaffPage_('ไม่พบรายการ', renderStubBody_('ไม่พบงานที่ระบุ (work_id: ' + params.id + ')', baseUrl), user, 'search', baseUrl);
      }
      if (!canViewWorkDetail_(qrWork, user, getHistoryForWork_(ss, qrWork.work_id))) {
        return renderStaffPage_('ไม่มีสิทธิ์เข้าถึง', renderStubBody_('งานนี้ไม่เกี่ยวข้องกับหน่วยงานของท่าน', baseUrl), user, 'search', baseUrl);
      }
      return renderStaffPage_('พิมพ์ QR', renderQrPrintBody_(qrWork, buildQrImageUrl_(ss, qrWork.qr_token), baseUrl), user, 'search', baseUrl);
    case 'register':
      return renderStaffPage_('รับเอกสารใหม่', renderRegisterFormBody_(ss, {}, [], baseUrl), user, 'register', baseUrl);
    case 'dashboard':
    default:
      var metrics = computeDashboardMetrics_(ss, user.organization);
      return renderStaffPage_('แดชบอร์ดเจ้าหน้าที่', renderDashboardBody_(user, metrics, baseUrl), user, 'dashboard', baseUrl);
  }
}

function doPost(e) {
  var formAction = e && e.parameter && e.parameter.form_action;
  var ss = getSpreadsheet_();

  if (formAction === 'track_status') {
    // โซนสาธารณะ ไม่ต้อง Login — ตรวจสอบสิทธิ์ก่อนหน้านี้จะบล็อกผู้เยี่ยมชมทั่วไปออกไปโดยไม่ตั้งใจ
    return handlePublicTrackPost_(ss, e);
  }

  // เหมือน doGet — Session.getActiveUser() ใช้ไม่ได้กับ Gmail ส่วนตัว fallback ไป Google ID token
  // (GIS_AUTH_SCRIPT_ ฝัง hidden field "auth" ต่อท้ายทุกฟอร์มให้อัตโนมัติแล้ว)
  var email = getCurrentUserEmail_() || verifyAuthToken_(ss, e.parameter.auth);
  var user = email ? findUserByEmail_(email) : null;
  if (!user) {
    return renderPage_('ไม่มีสิทธิ์เข้าใช้งาน', '' +
      '<p>บัญชี <b>' + escapeHtml_(email || '(ไม่ได้ Login)') + '</b> ยังไม่ได้รับสิทธิ์เข้าใช้งานระบบ หรือ session/การ sign-in หมดอายุแล้ว</p>' +
      '<p><a href="' + getWebAppUrl_() + '?staff=1">&larr; กลับไป sign-in ใหม่</a></p>');
  }

  var baseUrl = getWebAppUrl_();

  if (formAction === 'register_work') {
    var result = registerNewWork_(ss, user, e);
    if (!result.ok) {
      return renderStaffPage_('รับเอกสารใหม่', renderRegisterFormBody_(ss, result.values, result.errors, baseUrl), user, 'register', baseUrl);
    }
    return renderStaffPage_('ลงทะเบียนสำเร็จ', renderRegisterSuccessBody_(result, baseUrl), user, 'register', baseUrl);
  }

  if (formAction === 'work_action') {
    var token = e.parameter.qr_token || '';
    var actionResult = performWorkAction_(ss, user, e);
    if (!actionResult.ok) {
      var work = findWorkById_(ss, e.parameter.work_id);
      var stationsMap = getStationsMap_(ss);
      var station = work ? stationsMap[work.current_station_key] : null;
      if (!work) {
        return renderStaffPage_('สแกน QR', renderScanEntryBody_(baseUrl, 'ไม่พบงานที่ระบุ'), user, 'scan', baseUrl);
      }
      return renderStaffPage_('สแกน QR',
        renderActionFormBody_(ss, work, station, e.parameter.action, baseUrl, token, actionResult.errors, e.parameter),
        user, 'scan', baseUrl);
    }
    return renderStaffPage_('บันทึกสำเร็จ', renderActionSuccessBody_(actionResult, baseUrl), user, 'scan', baseUrl);
  }

  if (formAction === 'state_transition') {
    var transToken = e.parameter.qr_token || '';
    var transResult = performStateTransition_(ss, user, e);
    if (!transResult.ok) {
      var transWork = transResult.work || findWorkById_(ss, e.parameter.work_id);
      if (!transWork) {
        return renderStaffPage_('สแกน QR', renderScanEntryBody_(baseUrl, 'ไม่พบงานที่ระบุ'), user, 'scan', baseUrl);
      }
      var stationsMapErr = getStationsMap_(ss);
      var stateDefErr = stationsMapErr[transWork.current_station_key];
      var eligibleErr = computeEligibleTransitions_(ss, transWork, stateDefErr, user);
      var reTransition = null;
      for (var i = 0; i < eligibleErr.length; i++) {
        if (eligibleErr[i].transition_id === e.parameter.transition_id) { reTransition = eligibleErr[i]; break; }
      }
      if (!reTransition) {
        return renderStaffPage_('สแกน QR', renderScanWorkBody_(transWork, stateDefErr, computeEligibleActions_(transWork, stateDefErr, user),
          eligibleErr, baseUrl, transToken, transResult.errors), user, 'scan', baseUrl);
      }
      return renderStaffPage_('สแกน QR',
        renderTransitionFormBody_(transWork, reTransition, baseUrl, transToken, transResult.errors, e.parameter), user, 'scan', baseUrl);
    }
    return renderStaffPage_('บันทึกสำเร็จ', renderActionSuccessBody_(transResult, baseUrl), user, 'scan', baseUrl);
  }

  if (formAction === 'admin_station_save' || formAction === 'admin_user_save') {
    if (user.role !== 'Admin') {
      return renderStaffPage_('ไม่มีสิทธิ์', renderStubBody_('เฉพาะผู้ดูแลระบบ (Admin) เท่านั้น', baseUrl), user, 'admin', baseUrl);
    }
    if (formAction === 'admin_station_save') {
      var stationResult = performAdminStationSave_(ss, user, e);
      if (!stationResult.ok) {
        var editStation = stationResult.isNew ? null : findStationByKey_(ss, stationResult.values.station_key);
        return renderStaffPage_('จัดการ Workflow',
          renderStationFormBody_(ss, editStation, baseUrl, stationResult.errors, stationResult.values), user, 'admin', baseUrl);
      }
      return renderStaffPage_('จัดการ Workflow', renderAdminStationsBody_(listStationsSorted_(ss), baseUrl), user, 'admin', baseUrl);
    }
    var userResult = performAdminUserSave_(ss, user, e);
    if (!userResult.ok) {
      var editUser = userResult.isNew ? null : findUserByEmailRaw_(ss, userResult.values.user_email);
      return renderStaffPage_('จัดการผู้ใช้งาน',
        renderUserFormBody_(editUser, baseUrl, userResult.errors, userResult.values), user, 'admin', baseUrl);
    }
    return renderStaffPage_('จัดการผู้ใช้งาน', renderAdminUsersBody_(listUsersSorted_(ss), baseUrl), user, 'admin', baseUrl);
  }

  return ContentService
    .createTextOutput(JSON.stringify({ ok: false, error: 'not_implemented', message: 'ฟังก์ชันนี้จะพัฒนาในลำดับถัดไป' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function isSystemInstalled_() {
  return !!PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
}

/* ---------- placeholder pages นอกโซนเจ้าหน้าที่ (จะถูกแทนที่ทีละหน้าใน Part ถัดไป) ---------- */

function htmlNotInstalled_() {
  return '' +
    '<p>ยังไม่พบฐานข้อมูลของระบบ</p>' +
    '<p>ผู้ดูแลระบบต้องรันฟังก์ชัน <code>installSystem</code> จาก Apps Script Editor ก่อนใช้งานครั้งแรก ' +
    '(ดูขั้นตอนในคอมเมนต์ต้นไฟล์ <code>Setup.gs</code>)</p>';
}

function htmlAccessDenied_(email) {
  return '' +
    '<p>บัญชี <b>' + escapeHtml_(email) + '</b> ยังไม่ได้รับสิทธิ์เข้าใช้งานระบบ</p>' +
    '<p>กรุณาติดต่อผู้ดูแลระบบเพื่อเพิ่มชื่อในชีต <code>Users</code></p>';
}

/** ครอบหน้าด้วยสไตล์พื้นฐาน (Sarabun, โทนน้ำเงิน-เขียวอมฟ้า) — ใช้กับหน้านอกโซนเจ้าหน้าที่ (ไม่ติดตั้ง/สาธารณะ/ไม่มีสิทธิ์) */
function renderPage_(title, bodyHtml) {
  var html = '' +
    '<!doctype html><html><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">' +
    '<title>' + escapeHtml_(title) + '</title>' +
    '<style>' +
    'body{font-family:"Sarabun",sans-serif;background:#eef4f6;color:#1c2b3a;margin:0;padding:24px;}' +
    '.card{max-width:640px;margin:0 auto;background:#fff;border:1px solid #dde3e8;border-radius:12px;padding:20px 24px;box-shadow:0 1px 2px rgba(20,40,55,.08);}' +
    'h1{font-size:1.2rem;color:#1f3b54;margin:0 0 14px;}' +
    'table{width:100%;border-collapse:collapse;margin-top:10px;font-size:.9rem;}' +
    'th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #e8edf0;}' +
    '.tnum{font-variant-numeric:tabular-nums;}' +
    'code{background:#eef1f4;padding:1px 5px;border-radius:4px;}' +
    '</style></head><body><div class="card"><h1>' + escapeHtml_(title) + '</h1>' + bodyHtml + '</div></body></html>';
  return HtmlService.createHtmlOutput(html)
    .setTitle(title)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function escapeHtml_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
