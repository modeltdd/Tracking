/**
 * ตรวจสอบสิทธิ์เจ้าหน้าที่ — เทียบอีเมลบัญชี Google กับชีต Users
 * (ข้อกำหนดความปลอดภัย #1 ใน docs/DESIGN.md)
 */

/** คืนอีเมลผู้ใช้ปัจจุบัน หรือ '' ถ้าเป็นผู้เยี่ยมชมแบบไม่ Login (หน้า Tracking สาธารณะ) */
function getCurrentUserEmail_() {
  try {
    return Session.getActiveUser().getEmail() || '';
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
