/**
 * ฟังก์ชันช่วยเหลือทั่วไป — ใช้ร่วมกันทุกส่วนของระบบ
 */

/** ปี พ.ศ. จากวันที่ที่กำหนด (ค.ศ. + 543) */
function getBuddhistYear_(date) {
  return date.getFullYear() + 543;
}

/** ปี พ.ศ. แบบ 2 หลักท้าย (เช่น 2569 -> "69") — ใช้แสดงในเลขทะเบียนตามที่ผู้ใช้ขอ 2026-09-23 (ไม่ใช้กับ
 *  Settings key ภายใน เช่น last_seq_<ปี> ที่ยังคงเก็บปีเต็ม 4 หลักเหมือนเดิม กันชนข้ามศตวรรษ) */
function shortBuddhistYear_(fullYear) {
  return String(fullYear).slice(-2);
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

/**
 * ต่อท้ายแถวใหม่ตามลำดับ header "แถวจริงบนชีต" เสมอ (2026-10-06 แก้บั๊กจริงที่เจอ) — เดิมใช้ลำดับจาก
 * SHEET_HEADERS ในโค้ด (`headers` param) ตรงๆ โดยไม่เช็คว่าชีตจริงเรียงคอลัมน์ตรงกันหรือไม่ พบว่าชีต Works จริง
 * เรียงคอลัมน์ไม่ตรงกับโค้ดมานานแล้ว (evaluation_result อยู่คอลัมน์ 35 จริง แต่โค้ดคาดว่าอยู่ 29 — ดู
 * diagnoseWorksColumnAlignment() ใน Setup.gs) ทำให้ค่าที่เขียนไปตกคอลัมน์ผิดช่องมาตลอดตั้งแต่เกิดการเหลื่อม
 * readSheetAsObjects_ อ่านด้วยชื่อ header อยู่แล้วไม่กระทบ แต่ appendRow เดิมเขียนตามตำแหน่งล้วนๆ จึงพัง —
 * แก้ให้ map ตามชื่อ header ของแถวจริงบนชีตแทน (สมมาตรกับฝั่งอ่าน) ปลอดภัยไม่ว่าชีตจริงจะเรียงคอลัมน์ต่างจาก
 * โค้ดแค่ไหนก็ตาม — `headers` param ยังใช้เป็น fallback เฉพาะกรณีชีตว่างเปล่าไม่มี header แถวแรกเลย (เช่น
 * ensureSheet_ สร้างชีตใหม่ปกติจะเขียน header ก่อนอยู่แล้ว กรณีนี้แทบไม่เกิด)
 */
function appendRowByHeader_(sheet, headers, rowObj) {
  var lastCol = sheet.getLastColumn();
  var liveHeaders = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  var cols = liveHeaders.some(function (h) { return h; }) ? liveHeaders : headers;
  var row = cols.map(function (h) { return (h && h in rowObj) ? rowObj[h] : ''; });
  sheet.appendRow(row);
}

/** จำนวนวันเต็มระหว่างสองวันที่ (ปัดลง) — ใช้คำนวณ "ใกล้ครบกำหนด/เกินกำหนด" ตาม docs/DESIGN.md A9 */
function daysBetween_(earlier, later) {
  var msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((new Date(later).getTime() - new Date(earlier).getTime()) / msPerDay);
}

/** เติมเลข 0 ด้านหน้าให้ครบความยาวที่กำหนด (เช่น เลขลำดับในเลขติดตามเอกสาร) */
function padLeft_(num, width) {
  var s = String(num);
  while (s.length < width) s = '0' + s;
  return s;
}

/**
 * URL เต็มของ Web App ที่ deploy อยู่ — ใช้สร้างลิงก์ภายในแบบ absolute เสมอ
 * (HtmlService render เนื้อหาอยู่ใน iframe sandbox คนละ origin กับ URL ที่เห็นบน address bar —
 * ลิงก์ relative อย่าง href="?page=x" จะ resolve ผิด origin แล้วเงียบ/ว่างเปล่า ต้องใช้ URL เต็มคู่กับ target="_top" เสมอ)
 */
function getWebAppUrl_() {
  try {
    return ScriptApp.getService().getUrl() || '';
  } catch (err) {
    return '';
  }
}

/** จัดรูปแบบวันที่-เวลาให้อ่านง่าย (dd/MM/yyyy HH:mm ตาม timezone ของสคริปต์) — ใช้บน Timeline หน้ารายละเอียดงาน */
function formatDateTh_(date) {
  if (!date) return '-';
  try {
    return Utilities.formatDate(new Date(date), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
  } catch (err) {
    return String(date);
  }
}

/** จัดรูปแบบวันที่-เวลาแบบไทยอ่านง่าย "24 ก.ย. 2569 เวลา 10.15 น." (2026-09-24, ใช้เฉพาะการ์ด "สถานะปัจจุบัน"/
 *  Timeline หน้าติดตามผลงานตามที่ผู้ใช้ขอ — formatDateTh_ เดิม 24 ชม./คั่นด้วย : ยังใช้ที่อื่นทั่วระบบเหมือนเดิม
 *  ไม่แตะ) ใช้ getBuddhistYear_/padLeft_ เดิม รูปแบบเดียวกับที่ใช้ทั่วโปรเจกต์ (ปี พ.ศ. จาก Date object ตรงๆ) */
function formatDateThShort_(date) {
  if (!date) return '-';
  try {
    var d = new Date(date);
    var day = d.getDate();
    var month = THAI_MONTHS_SHORT_[d.getMonth()];
    var year = getBuddhistYear_(d);
    var hh = padLeft_(d.getHours(), 2);
    var mm = padLeft_(d.getMinutes(), 2);
    return day + ' ' + month + ' ' + year + ' เวลา ' + hh + '.' + mm + ' น.';
  } catch (err) {
    return String(date);
  }
}

/** วันที่แบบ dd/mm/yyyy ปี พ.ศ. ไม่มีเวลา (2026-10-12 ตามที่ผู้ใช้ขอ — บรรทัด "วันที่ :: ..." การ์ดผลการ
 *  พิจารณา หน้า Owner Dashboard) วัน/เดือนมี 2 หลักเสมอ (ใช้ padLeft_/getBuddhistYear_ เดิม) คืนค่าว่าง ''
 *  ถ้าไม่มีวันที่จริง/invalid — ให้ผู้เรียกซ่อนบรรทัดทั้งหมด ห้ามแสดง "-"/"null"/"Invalid Date" */
function formatDateDDMMYYYYBuddhist_(date) {
  if (!date) return '';
  var d = new Date(date);
  if (isNaN(d.getTime())) return '';
  var day = padLeft_(d.getDate(), 2);
  var month = padLeft_(d.getMonth() + 1, 2);
  var year = getBuddhistYear_(d);
  return day + '/' + month + '/' + year;
}

/** ปกปิดชื่อ-สกุลสำหรับแสดงบนหน้าสาธารณะ (docs/DESIGN.md A10) — 2 ตัวอักษรแรกของชื่อ/สกุล ตามด้วย "***"
 *  เช่น "นาย นภ*** ทุม***" — คำนำหน้าไม่ใช่ข้อมูลระบุตัวตน แสดงเต็มได้ ใช้กับหน้าติดตามสถานะสาธารณะเท่านั้น
 *  (หน้าเจ้าหน้าที่/Admin ยังเห็นชื่อเต็มตามเดิม ไม่เปลี่ยน) */
function maskNameForPublic_(titleName, firstName, lastName) {
  function maskPart(s) {
    s = String(s || '').trim();
    if (!s) return '-';
    return s.slice(0, 2) + '***';
  }
  return String(titleName || '').trim() + ' ' + maskPart(firstName) + ' ' + maskPart(lastName);
}

/** เทียบ station_order สำหรับเรียงลำดับสถานี Workflow — เก็บเป็น text (รองรับ "3.1"/"8.4") แต่ต้อง
 *  เทียบเชิงตัวเลขจริง (parseFloat) ไม่ใช่เทียบ string ตรง ๆ ที่จะทำให้ "10" มาก่อน "2" ผิดลำดับ */
function compareStationOrder_(a, b) {
  return parseFloat(a) - parseFloat(b);
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

/** อัปเดตบางคอลัมน์ของแถวงานเดียวใน Works ด้วย work_id (เติม updated_at ให้อัตโนมัติถ้าไม่ได้ส่งมาเอง) — ใช้โดย Actions.gs ทุก action */
function updateWorkRow_(ss, workId, fields) {
  var sheet = ss.getSheetByName(SHEET.WORKS);
  var headers = SHEET_HEADERS[SHEET.WORKS];
  var idCol = headers.indexOf('work_id') + 1;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) throw new Error('ไม่พบงาน (ชีต Works ว่างเปล่า)');

  var ids = sheet.getRange(2, idCol, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (ids[i][0] !== workId) continue;
    var rowNum = i + 2;
    var merged = {};
    Object.keys(fields).forEach(function (k) { merged[k] = fields[k]; });
    if (!('updated_at' in merged)) merged.updated_at = now_();
    Object.keys(merged).forEach(function (key) {
      var col = headers.indexOf(key) + 1;
      if (col > 0) sheet.getRange(rowNum, col).setValue(merged[key]);
    });
    return;
  }
  throw new Error('ไม่พบงาน work_id: ' + workId);
}

/**
 * อัปเดตบางคอลัมน์ของ 1 แถวในชีตใดก็ได้ ด้วยชื่อคอลัมน์ที่ใช้เป็น key (เช่น transition_id, position_code)
 * เขียนตาม header แถวจริงของชีต (ไม่ใช่ SHEET_HEADERS คงที่) — ใช้กับ migration และ Admin master-data CRUD
 * (pattern เดียวกับ updateWorkStationRow_ ใน Admin.gs แต่ generic ใช้กับชีตไหนก็ได้ ไม่ต้อง copy ซ้ำทุกชีต)
 */
function updateSheetRowByKey_(sheet, keyField, keyValue, fields) {
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var keyCol = headers.indexOf(keyField) + 1;
  if (keyCol === 0) throw new Error('ไม่พบคอลัมน์ ' + keyField + ' ในชีต ' + sheet.getName());
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) throw new Error('ชีต ' + sheet.getName() + ' ว่างเปล่า');

  var keys = sheet.getRange(2, keyCol, lastRow - 1, 1).getValues();
  for (var i = 0; i < keys.length; i++) {
    if (keys[i][0] !== keyValue) continue;
    var rowNum = i + 2;
    Object.keys(fields).forEach(function (k) {
      var col = headers.indexOf(k) + 1;
      if (col > 0) sheet.getRange(rowNum, col).setValue(fields[k]);
    });
    return true;
  }
  return false;
}

/** log การค้นหาสถานะจากหน้าสาธารณะทุกครั้ง (สำเร็จ/ล้มเหลว) — เก็บแค่ last4 ไม่เก็บเลขบัตรเต็ม (docs/DESIGN.md 4.7) */
function writeSearchLog_(ss, trackingNoAttempt, last4Attempt, success, sessionToken) {
  var sheet = ss.getSheetByName(SHEET.SEARCH_LOG);
  appendRowByHeader_(sheet, SHEET_HEADERS[SHEET.SEARCH_LOG], {
    log_id: Utilities.getUuid(),
    timestamp: now_(),
    tracking_no_attempt: trackingNoAttempt,
    citizen_id_last4_attempt: last4Attempt,
    success: success,
    session_token: sessionToken,
  });
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
