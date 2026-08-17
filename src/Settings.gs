/**
 * อ่านค่า Settings แบบใช้งานทั่วไป (Setup.gs มี getSettingValue_ ไว้ใช้เฉพาะตอนติดตั้งเท่านั้น)
 */

/** อ่านค่า Settings ทั้งหมดเป็น object เดียว (key -> value) */
function getSettingsMap_(ss) {
  var sheet = ss.getSheetByName(SHEET.SETTINGS);
  var rows = readSheetAsObjects_(sheet);
  var map = {};
  rows.forEach(function (row) { map[row.setting_key] = row.setting_value; });
  return map;
}

/** อ่านค่า Settings ตัวเดียว คืน fallback ถ้าไม่พบหรือค่าว่าง */
function getSetting_(ss, key, fallback) {
  var map = getSettingsMap_(ss);
  var val = map[key];
  return (val === undefined || val === null || val === '') ? fallback : val;
}

/** แปลงค่า Settings แบบคั่นจุลภาค (เช่น revision_reason_options) เป็น array ที่ตัดช่องว่างหัวท้ายแล้ว */
function getSettingList_(ss, key, fallbackArr) {
  var raw = getSetting_(ss, key, '');
  if (!raw) return fallbackArr || [];
  return String(raw).split(',').map(function (s) { return s.trim(); }).filter(function (s) { return s; });
}

/** เขียนค่า Settings ทับ/เพิ่มใหม่ — ใช้ตอนระบบปรับค่าเอง (เช่น เลขลำดับล่าสุด) ไม่ใช่ Admin UI (ยังไม่มีใน Part นี้) */
function setSetting_(ss, key, value, description) {
  var sheet = ss.getSheetByName(SHEET.SETTINGS);
  var headers = SHEET_HEADERS[SHEET.SETTINGS];
  var lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    var keyCol = headers.indexOf('setting_key') + 1;
    var keys = sheet.getRange(2, keyCol, lastRow - 1, 1).getValues();
    for (var i = 0; i < keys.length; i++) {
      if (keys[i][0] === key) {
        var rowNum = i + 2;
        var valueCol = headers.indexOf('setting_value') + 1;
        var updatedCol = headers.indexOf('updated_at') + 1;
        sheet.getRange(rowNum, valueCol).setValue(value);
        sheet.getRange(rowNum, updatedCol).setValue(now_());
        return;
      }
    }
  }
  appendRowByHeader_(sheet, headers, {
    setting_key: key,
    setting_value: value,
    description: description || '',
    updated_at: now_(),
  });
}
