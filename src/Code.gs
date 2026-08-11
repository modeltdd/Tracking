/**
 * จุดเข้าใช้งาน Web App — doGet/doPost
 *
 * สถานะ Part 1: ยังเป็นเพียง skeleton สำหรับตรวจสอบว่าติดตั้ง+เดินสายถูกต้อง
 * หน้าตาจริงของ Public/Staff/Admin portal จะมาใน Part 2 เป็นต้นไป (แทนที่ renderStatusPage_)
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

  // เจ้าหน้าที่ผ่านการตรวจสอบสิทธิ์แล้ว → โซนเจ้าหน้าที่/Admin (หน้าตาจริงจะพัฒนาใน Part 2 เป็นต้นไป)
  return renderPage_('ระบบสำหรับเจ้าหน้าที่', htmlStaffPlaceholder_(user));
}

function doPost(e) {
  // การดำเนินการจริง (รับเอกสาร/ส่งต่อ/ตรวจสอบสถานะ ฯลฯ) จะเพิ่มใน Part ถัดไปทีละส่วน
  return ContentService
    .createTextOutput(JSON.stringify({ ok: false, error: 'not_implemented', message: 'ฟังก์ชันนี้จะพัฒนาในลำดับถัดไป' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function isSystemInstalled_() {
  return !!PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
}

/* ---------- placeholder pages (Part 1 เท่านั้น — จะถูกแทนที่ทีละหน้าใน Part ถัดไป) ---------- */

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

function htmlStaffPlaceholder_(user) {
  var ss = getSpreadsheet_();
  var rows = [];
  Object.keys(SHEET).forEach(function (key) {
    var sheetName = SHEET[key];
    var sheet = ss.getSheetByName(sheetName);
    var count = sheet ? Math.max(sheet.getLastRow() - 1, 0) : 0;
    rows.push('<tr><td>' + sheetName + '</td><td class="tnum">' + count + '</td></tr>');
  });
  return '' +
    '<p>เข้าสู่ระบบสำเร็จในฐานะ <b>' + escapeHtml_(user.display_name || user.user_email) + '</b> ' +
    '(' + escapeHtml_(user.role) + ' · ' + escapeHtml_(user.organization) + ')</p>' +
    '<p>เมนู/แดชบอร์ดจริงจะพัฒนาใน Part 2 เป็นต้นไป ขณะนี้แสดงสถานะฐานข้อมูลเพื่อยืนยันว่า Part 1 ทำงานถูกต้อง:</p>' +
    '<table><thead><tr><th>ชีต</th><th>จำนวนแถวข้อมูล</th></tr></thead><tbody>' + rows.join('') + '</tbody></table>' +
    '<p><a href="' + ss.getUrl() + '" target="_blank">เปิด Spreadsheet ฐานข้อมูล →</a></p>';
}

/** ครอบหน้าด้วยสไตล์พื้นฐาน (Sarabun, โทนน้ำเงิน-เขียวอมฟ้า) — ยังไม่ใช่ดีไซน์เต็มรูปแบบ ใช้ยืนยันการเดินสายเท่านั้น */
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
