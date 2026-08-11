/**
 * ฟังก์ชันช่วยเหลือทั่วไป — ใช้ร่วมกันทุกส่วนของระบบ
 */

/** ปี พ.ศ. จากวันที่ที่กำหนด (ค.ศ. + 543) */
function getBuddhistYear_(date) {
  return date.getFullYear() + 543;
}

/** วันที่-เวลาปัจจุบัน (สำหรับบันทึกลงชีต ใช้ Date object ตรงๆ ให้ Sheets จัดรูปแบบเอง) */
function now_() {
  return new Date();
}

/**
 * คืน Spreadsheet ของระบบ — สร้างใหม่อัตโนมัติถ้ายังไม่มี (เก็บ ID ไว้ใน Script Properties)
 * เรียกจาก installSystem() เป็นหลัก ฟังก์ชันอื่นควรเรียกผ่าน getSpreadsheet_() เสมอ ห้าม hardcode ID
 */
function getSpreadsheet_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('SPREADSHEET_ID');
  if (id) {
    try {
      return SpreadsheetApp.openById(id);
    } catch (err) {
      throw new Error('เปิด Spreadsheet ด้วย SPREADSHEET_ID ที่บันทึกไว้ไม่สำเร็จ (' + id + '): ' + err.message);
    }
  }
  var ss = SpreadsheetApp.create('ระบบติดตามสถานะผลงานวิชาการ - ฐานข้อมูล (เขตสุขภาพที่ 11)');
  props.setProperty('SPREADSHEET_ID', ss.getId());
  return ss;
}

/** คืน Sheet ตามชื่อ — สร้างใหม่พร้อมหัวตารางถ้ายังไม่มี ไม่แตะข้อมูลถ้ามีอยู่แล้ว */
function ensureSheet_(ss, sheetName, headers) {
  var sheet = ss.getSheetByName(sheetName);
  var isNew = false;
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    isNew = true;
  }
  if (isNew || sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  }
  return sheet;
}

/** อ่านชีตทั้งหมด (ไม่รวมหัวตาราง) เป็น array ของ object ตาม header แถวแรก */
function readSheetAsObjects_(sheet) {
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2) return [];
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  return values.map(function (row) {
    var obj = {};
    headers.forEach(function (h, i) { obj[h] = row[i]; });
    return obj;
  });
}

/** ต่อท้ายแถวใหม่ตามลำดับ header ของชีต (กันพลาดลำดับคอลัมน์เวลาคนแก้ schema ทีหลัง) */
function appendRowByHeader_(sheet, headers, rowObj) {
  var row = headers.map(function (h) { return (h in rowObj) ? rowObj[h] : ''; });
  sheet.appendRow(row);
}

/** สร้างรหัสสุ่มสำหรับ QR token / session token ฯลฯ (ตัวอักษร+ตัวเลข ตัดตัวที่อ่านสับสนออก) */
function randomToken_(length) {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // ตัด O/0, I/1 กันอ่านผิด
  var out = '';
  for (var i = 0; i < length; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

/** log ไปยัง AuditLog เมื่อ Admin แก้ไขข้อมูล — เรียกใช้จากทุกจุดที่มีการแก้ไขค่าที่บันทึกแล้ว */
function writeAuditLog_(userEmail, action, workId, fieldChanged, oldValue, newValue) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(SHEET.AUDIT_LOG);
  appendRowByHeader_(sheet, SHEET_HEADERS[SHEET.AUDIT_LOG], {
    audit_id: Utilities.getUuid(),
    timestamp: now_(),
    user_email: userEmail,
    action: action,
    work_id: workId,
    field_changed: fieldChanged,
    old_value: oldValue,
    new_value: newValue,
  });
}
