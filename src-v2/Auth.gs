/**
 * ตรวจสอบสิทธิ์เจ้าหน้าที่ — เทียบอีเมลบัญชี Google กับชีต Users
 * (ข้อกำหนดความปลอดภัย #1 ใน docs/DESIGN.md)
 */

/** คืนอีเมลผู้ใช้ปัจจุบัน หรือ '' ถ้าเป็นผู้เยี่ยมชมแบบไม่ Login (หน้า Tracking สาธารณะ)
 *  หมายเหตุ (2026-09-08): Session.getActiveUser().getEmail() คืนค่าว่างเสมอสำหรับผู้เข้าดูที่เป็น Gmail
 *  ส่วนตัว (ไม่ใช่ Google Workspace โดเมนเดียวกับผู้ deploy) ภายใต้ executeAs=USER_DEPLOYING ที่ระบบนี้ใช้อยู่ —
 *  เป็นข้อจำกัดของแพลตฟอร์ม Google เอง (ดู docs/DESIGN.md A19) ไม่ใช่บั๊ก — ฟังก์ชันนี้จึงเหลือความหมายแค่
 *  "ลองใช้ก่อนถ้าใช้ได้" (เช่น กรณีมี Workspace โดเมนจริง) จุดระบุตัวตนจริงย้ายไปที่ doGet/doPost (Code.gs)
 *  ซึ่งจะ fallback ไปใช้ verifyAuthToken_() ต่อถ้าฟังก์ชันนี้คืนค่าว่าง */
function getCurrentUserEmail_() {
  try {
    return Session.getActiveUser().getEmail() || '';
  } catch (err) {
    return '';
  }
}

/**
 * ตรวจสอบ Google ID token ที่ได้จาก Google Identity Services ฝั่ง client (GIS_AUTH_SCRIPT_, Views.gs)
 * ผ่าน tokeninfo endpoint ของ Google เอง (ไม่ต้องเขียน crypto verify เอง) — คืนอีเมลที่ยืนยันแล้วถ้าผ่านทุกเงื่อนไข
 * ไม่งั้นคืน '' เสมอ (ห้าม throw ป้องกันเว็บพังตอน token เสีย/หมดอายุ/เครือข่ายมีปัญหา)
 *
 * เงื่อนไขที่ต้องผ่านครบ (ความปลอดภัย — ขาดข้อใดข้อหนึ่งไม่ได้):
 *   - เรียก endpoint สำเร็จ (network/token format ผิดพลาด = ปฏิเสธ)
 *   - `aud` (audience) ต้องตรงกับ Settings.google_oauth_client_id ที่ Admin ตั้งไว้เป๊ะ — กัน token จากแอปอื่น
 *     หรือของปลอมที่ไม่ได้ออกให้เว็บนี้โดยเฉพาะมาสวมรอย (จุดตรวจสำคัญที่สุด)
 *   - `email_verified` ต้องเป็น true (Google ยืนยันว่าอีเมลนี้เป็นของบัญชีจริง ไม่ใช่แค่ claim เฉยๆ)
 *   - `exp` (expiry) ต้องไม่หมดอายุ ณ เวลาที่ตรวจ
 */
function verifyAuthToken_(ss, idToken) {
  var token = String(idToken || '').trim();
  if (!token) return '';
  var clientId = getSetting_(ss, 'google_oauth_client_id', '');
  if (!clientId) return ''; // ยังไม่ได้ตั้งค่า Client ID — ปฏิเสธเสมอ กัน verify แบบไม่มี audience ให้เทียบ

  try {
    var resp = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token), {
      muteHttpExceptions: true,
    });
    if (resp.getResponseCode() !== 200) return '';
    var payload = JSON.parse(resp.getContentText());

    if (payload.aud !== clientId) return '';
    if (payload.email_verified !== 'true' && payload.email_verified !== true) return '';
    if (!payload.exp || Number(payload.exp) * 1000 < Date.now()) return '';

    return String(payload.email || '').toLowerCase();
  } catch (err) {
    return '';
  }
}

/** ค้นหาผู้ใช้จากชีต Users ด้วยอีเมล — คืน null ถ้าไม่พบหรือไม่ใช่ผู้ใช้ที่ active */
function findUserByEmail_(email) {
  if (!email) return null;
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(SHEET.USERS);
  var rows = readSheetAsObjects_(sheet);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].user_email).toLowerCase() === email.toLowerCase()) {
      return rows[i].active ? rows[i] : null;
    }
  }
  return null;
}
