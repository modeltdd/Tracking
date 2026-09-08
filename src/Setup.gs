/**
 * ติดตั้งระบบ — สร้าง Spreadsheet + ชีตทั้ง 7 + seed ข้อมูลตั้งต้น
 *
 * วิธีรัน (ครั้งแรกเท่านั้น):
 *   1. เปิดโปรเจกต์นี้ใน Apps Script Editor (script.google.com) ด้วยบัญชีที่จะเป็นผู้ดูแลระบบ
 *   2. เลือกฟังก์ชัน installSystem จากแถบด้านบน แล้วกด Run
 *   3. อนุญาตสิทธิ์ (OAuth consent) ตามที่ระบบขอ
 *   4. ดู Log (Ctrl+Enter หรือ View > Logs) จะพบลิงก์ Spreadsheet ที่สร้างขึ้น
 * รันซ้ำได้อย่างปลอดภัย — ฟังก์ชันนี้ไม่เขียนทับข้อมูลที่มีอยู่แล้ว (idempotent)
 */
function installSystem() {
  var ss = getSpreadsheet_();

  var summary = [];
  Object.keys(SHEET).forEach(function (key) {
    var sheetName = SHEET[key];
    var headers = SHEET_HEADERS[sheetName];
    var sheet = ensureSheet_(ss, sheetName, headers);
    summary.push(sheetName + ': ' + sheet.getLastRow() + ' แถว (รวมหัวตาราง)');
  });

  seedWorkStations_(ss);
  seedSettings_(ss);
  seedFirstAdminUser_(ss);
  removeDefaultBlankSheet_(ss);

  Logger.log('ติดตั้งระบบสำเร็จ');
  Logger.log('Spreadsheet URL: ' + ss.getUrl());
  summary.forEach(function (line) { Logger.log(line); });

  return {
    spreadsheetId: ss.getId(),
    spreadsheetUrl: ss.getUrl(),
    sheets: summary,
  };
}

/** seed สถานี Workflow ตั้งต้น — ใส่เฉพาะตอนชีตยังว่าง (แค่หัวตาราง) ไม่ทับของที่ Admin ปรับแก้ไปแล้ว */
function seedWorkStations_(ss) {
  var sheet = ss.getSheetByName(SHEET.WORK_STATIONS);
  if (sheet.getLastRow() > 1) return; // มีข้อมูลอยู่แล้ว ข้าม
  var headers = SHEET_HEADERS[SHEET.WORK_STATIONS];
  WORKSTATIONS_SEED.forEach(function (st) {
    appendRowByHeader_(sheet, headers, {
      station_key: st.key,
      station_order: st.order,
      station_name: st.name,
      org: st.org,
      standard_days: st.days,
      next_station_key: st.next,
      public_status: st.pub,
      receive_role: st.receiveRole,
      approve_role: st.approveRole,
      notify_method: st.notify,
      active: true,
    });
  });
}

/**
 * ย้ายชีต WorkStations จากชุดเดิมมาเป็น WORKSTATIONS_SEED ปัจจุบัน (กระบวนการจริงที่ตกลงกัน 2026-09-02)
 * รันด้วยตนเองจาก Apps Script Editor ครั้งเดียว — ล้างชีต WorkStations ทั้งหมดแล้วสร้างใหม่
 *
 * คำเตือน: งานที่มีอยู่แล้วในชีต Works ซึ่งอ้าง station_key ชุดเดิม (received/checking/propose/review/
 * approve/announce/closed) จะหาไม่เจอสถานีอีกต่อไปหลังรันฟังก์ชันนี้ (findStationByKey_/getStationsMap_
 * คืน null/undefined) ควรเคลียร์ข้อมูลทดสอบก่อน (clearSampleData()) หรือย้ายงานจริงด้วยตนเองก่อนรัน —
 * ฟังก์ชันนี้จะแค่เตือนใน Log ไม่ได้บล็อกการรัน (ผู้ดูแลระบบต้องตรวจสอบเอง)
 */
function migrateWorkStationsToRealProcess() {
  var ss = getSpreadsheet_();
  var existingWorks = readSheetAsObjects_(ss.getSheetByName(SHEET.WORKS));
  if (existingWorks.length > 0) {
    Logger.log('คำเตือน: พบงานอยู่ในระบบ ' + existingWorks.length + ' รายการ — งานเหล่านี้อ้างอิง station_key ' +
      'ชุดเดิม ถ้าไม่ใช่ข้อมูลทดสอบที่เคลียร์ได้ ให้หยุดและตรวจสอบก่อน (สถานีเดิมจะหายไปหลังรันฟังก์ชันนี้)');
  }

  var sheet = ss.getSheetByName(SHEET.WORK_STATIONS);
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();

  var headers = SHEET_HEADERS[SHEET.WORK_STATIONS];
  WORKSTATIONS_SEED.forEach(function (st) {
    appendRowByHeader_(sheet, headers, {
      station_key: st.key,
      station_order: st.order,
      station_name: st.name,
      org: st.org,
      standard_days: st.days,
      next_station_key: st.next,
      public_status: st.pub,
      receive_role: st.receiveRole,
      approve_role: st.approveRole,
      notify_method: st.notify,
      active: true,
    });
  });
  Logger.log('ตั้งค่าสถานี Workflow ใหม่ตามกระบวนการจริงเรียบร้อย (' + WORKSTATIONS_SEED.length + ' สถานี) — ' +
    'ตรวจสอบผลที่หน้า Admin > จัดการ Workflow');
}

/**
 * ย้าย role ในชีต Users จากชุดเดิม 4 แบบ (Admin/เจ้าหน้าที่รับเอกสาร/เจ้าหน้าที่ผู้รับผิดชอบ/ผู้ดูข้อมูลอย่างเดียว)
 * มาเป็น 2 แบบ (Admin/ผู้รับผิดชอบ) ตามโครงสร้างผู้ใช้งานใหม่ที่ตกลงกัน 2026-09-08 — บทบาทเดิมไม่เคยมีผลต่อ
 * สิทธิ์กดปุ่ม action จริง (อิงจาก organization เป็นหลัก, role มีผลแค่ Admin เท่านั้น) จึงรวมเหลือ role เดียวได้
 * โดยไม่กระทบการทำงาน — รันด้วยตนเองจาก Apps Script Editor ครั้งเดียว
 */
function migrateUserRolesToResponsible() {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(SHEET.USERS);
  var users = readSheetAsObjects_(sheet);
  var changed = 0;
  users.forEach(function (u) {
    if (u.role !== 'Admin' && u.role !== 'ผู้รับผิดชอบ') {
      updateUserRow_(ss, u.user_email, { role: 'ผู้รับผิดชอบ' });
      changed++;
    }
  });
  Logger.log('แก้ไข role ผู้ใช้งานเป็น "ผู้รับผิดชอบ" แล้ว ' + changed + ' บัญชี (จากทั้งหมด ' + users.length + ' บัญชี)');
}

/**
 * เคลียร์ข้อมูลงาน/ประวัติทั้งหมด เพื่อเริ่มลงทะเบียนงานจริงใหม่ตั้งแต่ต้น — ลบถาวร กู้คืนไม่ได้
 * ล้างเฉพาะ Works, StatusHistory, AuditLog, SearchLog — ไม่แตะ WorkStations (สถานี 7 ขั้นตอน),
 * Users (บัญชี Admin/ผู้รับผิดชอบ), Settings (ค่าตั้งค่าระบบ) ยังอยู่ครบเหมือนเดิม
 * รันด้วยตนเองจาก Apps Script Editor ครั้งเดียว
 */
function clearAllWorkData() {
  var ss = getSpreadsheet_();
  [SHEET.WORKS, SHEET.STATUS_HISTORY, SHEET.AUDIT_LOG, SHEET.SEARCH_LOG].forEach(function (sheetName) {
    var sheet = ss.getSheetByName(sheetName);
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();
  });
  setSetting_(ss, 'sample_data_seeded', 'false', 'เคลียร์ข้อมูลทั้งหมดแล้ว (clearAllWorkData) — seedSampleData() รันใหม่ได้ถ้าต้องการ');
  Logger.log('เคลียร์ Works/StatusHistory/AuditLog/SearchLog เรียบร้อย — เริ่มลงทะเบียนงานจริงใหม่ได้เลย ' +
    '(สถานี Workflow/ผู้ใช้งาน/Settings ยังอยู่เหมือนเดิม ไม่ถูกลบ)');
}

/** seed ค่าตั้งต้นของ Settings — เติมเฉพาะ key ที่ยังไม่มี (ไม่ทับค่าที่ Admin ตั้งไปแล้ว) */
function seedSettings_(ss) {
  var sheet = ss.getSheetByName(SHEET.SETTINGS);
  var existing = readSheetAsObjects_(sheet);
  var existingKeys = {};
  existing.forEach(function (row) { existingKeys[row.setting_key] = true; });

  var headers = SHEET_HEADERS[SHEET.SETTINGS];
  getSettingsSeed_().forEach(function (rowArr) {
    var key = rowArr[0];
    if (existingKeys[key]) return;
    appendRowByHeader_(sheet, headers, {
      setting_key: key,
      setting_value: rowArr[1],
      description: rowArr[2],
      updated_at: now_(),
    });
  });
}

/** ผู้ติดตั้งระบบกลายเป็น Admin คนแรกโดยอัตโนมัติ — ถ้า Users ว่างอยู่เท่านั้น กันทับสิทธิ์ที่ตั้งไปแล้ว */
function seedFirstAdminUser_(ss) {
  var sheet = ss.getSheetByName(SHEET.USERS);
  if (sheet.getLastRow() > 1) return; // มีผู้ใช้อยู่แล้ว ข้าม
  var email = Session.getEffectiveUser().getEmail();
  if (!email) {
    Logger.log('คำเตือน: ไม่พบอีเมลผู้ติดตั้ง — ข้ามการสร้าง Admin คนแรก กรุณาเพิ่มแถวในชีต Users ด้วยตนเอง');
    return;
  }
  var orgName = getSettingValue_(ss, 'org_name') || 'สำนักงานเขตสุขภาพที่ 11';
  appendRowByHeader_(sheet, SHEET_HEADERS[SHEET.USERS], {
    user_email: email,
    display_name: email.split('@')[0],
    role: 'Admin',
    organization: orgName,
    active: true,
  });
  Logger.log('เพิ่ม ' + email + ' เป็น Admin คนแรกแล้ว — แก้ไข display_name ในชีต Users ได้ภายหลัง');
}

/**
 * Spreadsheet ที่สร้างใหม่มักมีชีตว่างติดมาด้วย 1 แผ่น (ชื่อขึ้นกับภาษาบัญชี Google ของผู้ติดตั้ง เช่น
 * "Sheet1" ในบัญชีอังกฤษ, "ชีต1" ในบัญชีไทย — ห้าม hardcode ชื่อ) ลบทิ้งเฉพาะชีตที่ไม่ใช่ชีตของระบบเราและว่างจริง
 */
function removeDefaultBlankSheet_(ss) {
  var ourSheetNames = {};
  Object.keys(SHEET).forEach(function (key) { ourSheetNames[SHEET[key]] = true; });

  ss.getSheets().forEach(function (sheet) {
    if (ourSheetNames[sheet.getName()]) return;
    var isEmpty = sheet.getLastRow() === 0 && sheet.getLastColumn() === 0;
    if (isEmpty && ss.getSheets().length > 1) ss.deleteSheet(sheet);
  });
}

/** อ่านค่า Settings ตัวเดียวแบบสะดวก (ใช้ตอน install เท่านั้น — ส่วนอื่นควรใช้ getSetting() ใน Settings.gs ที่จะเพิ่มใน Part ถัดไป) */
function getSettingValue_(ss, key) {
  var sheet = ss.getSheetByName(SHEET.SETTINGS);
  var rows = readSheetAsObjects_(sheet);
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].setting_key === key) return rows[i].setting_value;
  }
  return null;
}
