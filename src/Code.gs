/**
 * จุดเข้าใช้งาน Web App — doGet/doPost
 *
 * สถานะ: เชลล์เจ้าหน้าที่ (bottom-nav 3 ปุ่ม + Dashboard), รับเอกสารใหม่, ค้นหา + รายละเอียดงาน (Timeline) พร้อมใช้งานแล้ว
 * หน้า "สแกน QR" (รับเอกสาร/สิ้นสุดขั้นตอน) ยังเป็น stub รอ Part ถัดไป
 */
function doGet(e) {
  if (!isSystemInstalled_()) {
    return renderPage_('ยังไม่ได้ติดตั้งระบบ', htmlNotInstalled_());
  }

  var email = getCurrentUserEmail_();
  if (!email) {
    // ผู้เยี่ยมชมไม่ได้ Login → โซนสาธารณะ (หน้า Tracking จะพัฒนาใน Part 6)
    return renderPage_('ตรวจสอบสถานะผลงานวิชาการ', htmlPublicPlaceholder_());
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
  var page = params.page || (params.t ? 'scan' : 'dashboard');
  var ss = getSpreadsheet_();
  var baseUrl = getWebAppUrl_();

  switch (page) {
    case 'scan':
      var scanMsg = params.t
        ? 'สแกน QR token "' + params.t + '" แล้ว — หน้ารับเอกสาร/สิ้นสุดขั้นตอนจะพัฒนาใน Part 4'
        : 'หน้าสแกน QR เพื่อรับเอกสาร/สิ้นสุดขั้นตอน จะพัฒนาใน Part 4';
      return renderStaffPage_('สแกน QR', renderStubBody_(scanMsg, baseUrl), user, 'scan', baseUrl);
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
      var stationsMap = getStationsMap_(ss);
      return renderStaffPage_('รายละเอียดผลงาน', renderWorkDetailBody_(work, workHistory, stationsMap, baseUrl), user, 'search', baseUrl);
    case 'register':
      return renderStaffPage_('รับเอกสารใหม่', renderRegisterFormBody_(ss, {}, [], baseUrl), user, 'register', baseUrl);
    case 'dashboard':
    default:
      var metrics = computeDashboardMetrics_(ss, user.organization);
      return renderStaffPage_('แดชบอร์ดเจ้าหน้าที่', renderDashboardBody_(user, metrics, baseUrl), user, 'dashboard', baseUrl);
  }
}

function doPost(e) {
  var email = getCurrentUserEmail_();
  var user = email ? findUserByEmail_(email) : null;
  if (!user) {
    return renderPage_('ไม่มีสิทธิ์เข้าใช้งาน', htmlAccessDenied_(email || '(ไม่ได้ Login)'));
  }

  var formAction = e && e.parameter && e.parameter.form_action;
  var ss = getSpreadsheet_();
  var baseUrl = getWebAppUrl_();

  if (formAction === 'register_work') {
    var result = registerNewWork_(ss, user, e);
    if (!result.ok) {
      return renderStaffPage_('รับเอกสารใหม่', renderRegisterFormBody_(ss, result.values, result.errors, baseUrl), user, 'register', baseUrl);
    }
    return renderStaffPage_('ลงทะเบียนสำเร็จ', renderRegisterSuccessBody_(result, baseUrl), user, 'register', baseUrl);
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

function htmlPublicPlaceholder_() {
  return '' +
    '<p>ส่วนตรวจสอบสถานะสำหรับประชาชนกำลังอยู่ระหว่างพัฒนา (Part 6)</p>' +
    '<p>ขณะนี้ยืนยันได้ว่า: ผู้เยี่ยมชมที่ไม่ได้ Login จะเห็นหน้านี้ถูกต้องตามที่ออกแบบไว้</p>';
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
