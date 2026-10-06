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

/**
 * สร้าง+seed ชีต WorkflowStates/WorkflowTransitions (โมเดล 24-state รองรับแตกสาย/วนกลับ, 2026-09-08)
 * แทนที่ชีต WorkStations เดิม (7 สถานีเส้นตรง) — ไม่ลบ WorkStations ทิ้ง (ห้ามลบข้อมูลเดิม) แค่เลิกใช้งาน
 * รันด้วยตนเองจาก Apps Script Editor ครั้งเดียว — ปลอดภัยรันซ้ำได้ (ข้ามถ้าชีตมีข้อมูลอยู่แล้ว)
 *
 * คำเตือน: งานที่มีอยู่แล้วในชีต Works ซึ่งอ้าง station_key ชุดเดิม (received/checking/... จาก
 * WORKSTATIONS_SEED) จะหาสถานีไม่เจอในระบบใหม่ (getStationsMap_ อ่านจาก WorkflowStates แล้ว) —
 * ควรเคลียร์ข้อมูลทดสอบก่อน (clearAllWorkData()) หรือย้ายงานจริงด้วยตนเองก่อนรัน ฟังก์ชันนี้แค่เตือนใน Log
 */
function migrateToWorkflowStates() {
  var ss = getSpreadsheet_();
  var existingWorks = readSheetAsObjects_(ss.getSheetByName(SHEET.WORKS));
  if (existingWorks.length > 0) {
    Logger.log('คำเตือน: พบงานอยู่ในระบบ ' + existingWorks.length + ' รายการ — งานเหล่านี้อ้างอิง station_key ' +
      'ชุดเดิม (7 สถานี) ถ้าไม่ใช่ข้อมูลทดสอบที่เคลียร์ได้ ให้หยุดและตรวจสอบก่อน (สถานีเดิมจะหาไม่เจอในระบบใหม่)');
  }

  var statesSheet = ensureSheet_(ss, SHEET.WORKFLOW_STATES, SHEET_HEADERS[SHEET.WORKFLOW_STATES]);
  if (statesSheet.getLastRow() <= 1) {
    WORKFLOW_STATES_SEED.forEach(function (st) {
      appendRowByHeader_(statesSheet, SHEET_HEADERS[SHEET.WORKFLOW_STATES], {
        station_key: st.key, station_order: st.order, station_name: st.name, org: st.org,
        standard_days: st.days, public_status: st.pub, receive_role: '', approve_role: '', notify_method: '', active: true,
        public_hint: st.hint || '',
      });
    });
  } else {
    Logger.log('ชีต WorkflowStates มีข้อมูลอยู่แล้ว — ข้ามการ seed (ลบแถวเองแล้วรันใหม่ถ้าต้องการ reset)');
  }

  var transSheet = ensureSheet_(ss, SHEET.WORKFLOW_TRANSITIONS, SHEET_HEADERS[SHEET.WORKFLOW_TRANSITIONS]);
  if (transSheet.getLastRow() <= 1) {
    WORKFLOW_TRANSITIONS_SEED.forEach(function (t) {
      appendRowByHeader_(transSheet, SHEET_HEADERS[SHEET.WORKFLOW_TRANSITIONS], {
        transition_id: t.id, from_state: t.from, to_state: t.to, button_label: t.label,
        requires_note: t.note, result_value: t.result, active: true,
      });
    });
  } else {
    Logger.log('ชีต WorkflowTransitions มีข้อมูลอยู่แล้ว — ข้ามการ seed (ลบแถวเองแล้วรันใหม่ถ้าต้องการ reset)');
  }

  Logger.log('ตั้งค่า Workflow แบบ 24-state เรียบร้อย (' + WORKFLOW_STATES_SEED.length + ' state, ' +
    WORKFLOW_TRANSITIONS_SEED.length + ' เส้นทาง) — ตรวจสอบผลที่หน้า Admin > จัดการ Workflow');
}

/**
 * ตั้งค่า Settings.web_app_base_url ให้อัตโนมัติจาก URL ของ Web App ที่ deploy อยู่ตอนนี้ (ScriptApp.getService().getUrl())
 * แก้ปัญหา QR ไม่มี URL เต็ม (กล้องอ่านได้แค่ "t=XXXXXXXX" เป็นข้อความค้นหา ไม่ใช่ลิงก์) — รันครั้งเดียวจาก Editor
 * หลังรันแล้ว QR เก่าที่พิมพ์ไปแล้วยังผิดอยู่ (qr_token เดิมไม่เปลี่ยน) ต้องพิมพ์ใหม่ทีละใบ (ปุ่ม "พิมพ์ QR ใหม่")
 */
function fixWebAppBaseUrl() {
  var ss = getSpreadsheet_();
  var url = getWebAppUrl_();
  if (!url) {
    Logger.log('หา URL ของ Web App ไม่เจอ (ScriptApp.getService().getUrl() คืนค่าว่าง) — ต้อง Deploy เป็น Web App ก่อนอย่างน้อย 1 ครั้ง');
    return;
  }
  setSetting_(ss, 'web_app_base_url', url, 'URL ของ Web App หลัง Deploy ครั้งแรก — ใช้สร้างลิงก์ QR Code');
  Logger.log('ตั้งค่า web_app_base_url = ' + url + ' เรียบร้อย — QR ใหม่จะมีลิงก์ครบถ้วน ' +
    'QR เก่าที่พิมพ์ไปแล้วต้องเปิดงานนั้นแล้วกด "พิมพ์ QR ใหม่" ทีละใบ');
}

/**
 * แก้ไข station_order + public_hint ของชีต WorkflowStates ที่มีอยู่แล้วให้ตรงกับ WORKFLOW_STATES_SEED ปัจจุบัน —
 * (1) station_order เป็นเลขลำดับย่อยแบบทศนิยม เช่น "3.1"/"8.4" แทนเลขเต็มซ้ำกัน (2026-09-08 รอบแรก)
 * (2) public_hint ข้อความ "สิ่งที่ต้องดำเนินการ" ต่อ state ที่หน้าตรวจสอบสถานะสาธารณะใช้แสดง (2026-09-08 รอบสอง)
 * แก้เฉพาะ 2 คอลัมน์นี้ทีละแถวด้วย station_key เดิม ไม่แตะคอลัมน์อื่น/ไม่กระทบ Works หรือ StatusHistory
 * ปลอดภัยรันซ้ำได้ — รันครั้งเดียวจาก Editor (จำเป็นเฉพาะกรณีเคยรัน migrateToWorkflowStates() ไปแล้วก่อนแก้ไขนี้)
 */
function fixWorkflowStateOrders() {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(SHEET.WORKFLOW_STATES);
  if (!sheet) {
    Logger.log('ไม่พบชีต WorkflowStates — ยังไม่เคยรัน migrateToWorkflowStates() ไม่ต้องรันฟังก์ชันนี้ (seed ใหม่ถูกต้องอยู่แล้ว)');
    return;
  }
  var byKey = {};
  WORKFLOW_STATES_SEED.forEach(function (st) { byKey[st.key] = st; });

  // เขียนทับทุกแถวเสมอ (ไม่เช็คว่าค่าตรงกันแล้วข้าม) เพราะถึงค่าตัวเลขจะตรงกันแล้ว (เช่น 7 vs "7") เซลล์เดิม
  // อาจยังเป็น Number อยู่ ไม่ใช่ Text ตามที่ต้องการ — บังคับเขียนใหม่ทุกครั้งให้ชัวร์ว่าเป็น string จริง
  var updated = 0;
  var existing = readSheetAsObjects_(sheet);
  existing.forEach(function (row) {
    var st = byKey[row.station_key];
    if (st) {
      updateWorkStationRow_(ss, row.station_key, { station_order: st.order, public_hint: st.hint || '' });
      updated++;
    }
  });
  Logger.log('แก้ไข station_order/public_hint เรียบร้อย ' + updated + ' แถว (จากทั้งหมด ' + existing.length + ' state) — ' +
    'ตรวจสอบผลที่หน้า Admin > จัดการ Workflow');
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

/**
 * Migration รวม 2026-09-15 — ลดฟิลด์ลงทะเบียน + ตำแหน่ง/ข้อมูลแพทย์แบบ Master Data + เพิ่มขั้นตอน "ส่งต่อผู้ว่า"
 * ที่ตกหล่นตอนสร้าง WORKFLOW_STATES_SEED ชุดแรก — รันด้วยตนเองจาก Apps Script Editor ครั้งเดียวบนชีตจริง
 * ปลอดภัยรันซ้ำได้ (idempotent ทุกขั้นย่อย) รวม 3 ส่วนย่อยไว้ในฟังก์ชันเดียวให้รันจบในคลิกเดียว
 */
function migratePart10Updates() {
  migrateAddWorksColumns_();
  migrateAddMasterDataSheets_();
  seedSettings_(getSpreadsheet_()); // idempotent — เติมเฉพาะ key ที่ยังไม่มี เช่น district11_provinces ที่เพิ่มรอบ 2
  Logger.log('migratePart10Updates() เสร็จสมบูรณ์ — ตรวจสอบผลที่ชีต Works (คอลัมน์ท้ายสุด), ' +
    'MasterPositions/MasterSpecialties, และ Settings (district11_provinces)');
}

/**
 * แก้ชื่อสาขา "โสต ศอ นาสิก" (เดาไว้ก่อนเจอไฟล์คณะกรรมการจริง) เป็น "โสต นาสิก ลาริงซ์วิทยา" (ตรงกับ
 * 1อวช140969.xlsx จริง) ในชีต MasterSpecialties — จำเป็นสำหรับ auto-suggest คณะกรรมการตอนลงทะเบียน (2026-09-21)
 * ให้จับคู่ "ด้าน/สาขา" กับ ChairMaster.specialty ได้ตรงเป๊ะ รันเองจาก Editor ครั้งเดียว ปลอดภัยรันซ้ำได้
 */
function migrateFixDoctorSpecialtyName() {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(SHEET.MASTER_SPECIALTIES);
  if (!sheet) { Logger.log('ยังไม่มีชีต MasterSpecialties — รัน migratePart10Updates() ก่อน'); return; }
  var row = readSheetAsObjects_(sheet).filter(function (r) {
    return r.position_code === 'DOCTOR' && r.specialty_name === 'โสต ศอ นาสิก';
  })[0];
  if (!row) { Logger.log('ไม่พบแถว "โสต ศอ นาสิก" ของ DOCTOR — อาจแก้ไปแล้ว หรือยังไม่เคย seed'); return; }
  updateSheetRowByKey_(sheet, 'specialty_code', row.specialty_code, { specialty_name: 'โสต นาสิก ลาริงซ์วิทยา' });
  Logger.log('แก้ไขชื่อสาขาเรียบร้อย: "โสต ศอ นาสิก" -> "โสต นาสิก ลาริงซ์วิทยา" (specialty_code=' + row.specialty_code + ')');
}

/**
 * เติม header คอลัมน์ที่ขาดต่อท้ายชีต Works จริง — เทียบ header แถวจริงกับ SHEET_HEADERS[SHEET.WORKS] ปัจจุบัน
 * ทั้งหมด (ไม่ hardcode รายชื่อคอลัมน์ทีละรอบอีกต่อไป 2026-09-16 — เพิ่มฟิลด์ใหม่ที่ Constants.gs แล้วรันฟังก์ชัน
 * นี้ซ้ำได้เลย จะเติมเฉพาะส่วนที่ขาดให้อัตโนมัติ) ต้องทำก่อนใช้ registerNewWork_/renderRegisterFormBody_/
 * migrateLegacyRegistrations() เวอร์ชันล่าสุดเสมอ ไม่งั้นข้อมูลเขียนเหลื่อมคอลัมน์
 */
function migrateAddWorksColumns_() {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(SHEET.WORKS);
  var lastCol = sheet.getLastColumn();
  var liveHeadersRaw = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  // 2026-10-06 แก้บั๊กจริงที่เจอ: ห้ามใช้ sheet.getLastColumn() เป็นตำแหน่งเพิ่ม header ตรงๆ เพราะมันนับรวม
  // คอลัมน์ที่ "แถวข้อมูล" ยาวไปถึง ไม่ใช่แค่แถว header จริง — ถ้ามีใครเขียนแถวข้อมูลด้วยคอลัมน์ใหม่ (ตาม
  // SHEET_HEADERS ในโค้ด) ก่อนรัน migrate นี้ (เช่น เผลอรัน createOwnerLoginSmokeTestRecord() ก่อน
  // migrateOwnerLoginFeature()) lastCol จะยาวเกิน header จริง ทำให้ header ใหม่ถูกเพิ่มผิดตำแหน่ง (เหลื่อม
  // ขวาไป 1+ คอลัมน์ เกิดช่องว่างไม่มีชื่อแทรกกลาง ข้อมูลที่เขียนไว้ก่อนหน้ากลาย "อ่านไม่เจอ") — ตัด cell ว่าง
  // ท้ายแถว header ออกก่อนเสมอ ใช้ความยาว header จริงเป็นตำแหน่งเพิ่มแทน (ถ้าเจอปัญหานี้ไปแล้วให้รัน
  // repairWorksGhostColumns() ซ่อมก่อน แล้วค่อยรันฟังก์ชันนี้ใหม่)
  var realHeaderLen = liveHeadersRaw.length;
  while (realHeaderLen > 0 && !liveHeadersRaw[realHeaderLen - 1]) realHeaderLen--;
  var liveHeaders = liveHeadersRaw.slice(0, realHeaderLen);
  var newCols = SHEET_HEADERS[SHEET.WORKS].filter(function (h) { return liveHeaders.indexOf(h) === -1; });
  if (!newCols.length) {
    Logger.log('ชีต Works มีคอลัมน์ครบตาม SHEET_HEADERS ปัจจุบันแล้ว — ข้าม');
    return;
  }
  sheet.getRange(1, realHeaderLen + 1, 1, newCols.length).setValues([newCols]);
  sheet.getRange(1, realHeaderLen + 1, 1, newCols.length).setFontWeight('bold');
  Logger.log('เพิ่มคอลัมน์ใหม่ในชีต Works: ' + newCols.join(', ') + ' (ที่ตำแหน่งคอลัมน์ ' + (realHeaderLen + 1) + ')');
}

/** สร้าง+seed ชีต Master Data ใหม่ — ข้ามการ seed ถ้าชีตมีข้อมูลอยู่แล้ว (MasterMedicalDomains/Specialties
 *  เก็บไว้เป็นหลักฐานเดิม ไม่ลบ แต่เลิก seed/อ้างอิงต่อแล้ว 2026-09-15 รอบ 3 — ดูเหตุผลที่ Constants.gs) */
function migrateAddMasterDataSheets_() {
  var ss = getSpreadsheet_();

  var posSheet = ensureSheet_(ss, SHEET.MASTER_POSITIONS, SHEET_HEADERS[SHEET.MASTER_POSITIONS]);
  if (posSheet.getLastRow() <= 1) {
    getMasterPositionsSeed_().forEach(function (row) { appendRowByHeader_(posSheet, SHEET_HEADERS[SHEET.MASTER_POSITIONS], row); });
    Logger.log('seed MasterPositions แล้ว (' + getMasterPositionsSeed_().length + ' แถว)');
  } else {
    Logger.log('ชีต MasterPositions มีข้อมูลอยู่แล้ว — ข้าม');
  }

  var specialtySheet = ensureSheet_(ss, SHEET.MASTER_SPECIALTIES, SHEET_HEADERS[SHEET.MASTER_SPECIALTIES]);
  if (specialtySheet.getLastRow() <= 1) {
    getMasterSpecialtiesSeed_().forEach(function (row) { appendRowByHeader_(specialtySheet, SHEET_HEADERS[SHEET.MASTER_SPECIALTIES], row); });
    Logger.log('seed MasterSpecialties แล้ว (' + getMasterSpecialtiesSeed_().length + ' แถว จากข้อมูลจริง 244 รายใน Excel เดิม)');
  } else {
    Logger.log('ชีต MasterSpecialties มีข้อมูลอยู่แล้ว — ข้าม');
  }
}

/**
 * Sync MasterPositions ให้มีตำแหน่งหลัก 10 รายการตามที่ผู้ใช้กำหนด 2026-09-15 (รอบ 3) — อ้างอิงชื่อ
 * (position_name) เป็น key จับคู่ (ไม่ใช่ code เพราะตอน seed ครั้งแรกมีแค่ "นายแพทย์" code เดิมคือ "md"
 * ไม่ตรงกับ "DOCTOR" ที่ผู้ใช้ระบุรอบนี้) เจอชื่อเดิมอยู่แล้ว = อัปเดต code/สายงาน/ลำดับ/active ให้ตรง seed
 * ใหม่ทั้งหมด (รวม code เปลี่ยนได้ปลอดภัย เพราะ Works เก็บ position เป็นชื่อข้อความ ไม่ได้อ้างอิง code)
 * ไม่เจอ = เพิ่มแถวใหม่ — ตำแหน่งอื่นที่ Admin เพิ่มเองนอกเหนือ 10 รายการนี้ไม่ถูกแตะต้อง
 * รันด้วยตนเองจาก Apps Script Editor ครั้งเดียว ปลอดภัยรันซ้ำได้
 */
function migrateSyncCorePositions() {
  var ss = getSpreadsheet_();
  var sheet = ensureSheet_(ss, SHEET.MASTER_POSITIONS, SHEET_HEADERS[SHEET.MASTER_POSITIONS]);
  var existingByName = {};
  readSheetAsObjects_(sheet).forEach(function (row) { existingByName[row.position_name] = row; });

  var added = 0, updated = 0;
  getMasterPositionsSeed_().forEach(function (seedRow) {
    if (existingByName[seedRow.position_name]) {
      updateSheetRowByKey_(sheet, 'position_name', seedRow.position_name, seedRow);
      updated++;
    } else {
      appendRowByHeader_(sheet, SHEET_HEADERS[SHEET.MASTER_POSITIONS], seedRow);
      added++;
    }
  });
  Logger.log('sync ตำแหน่งหลัก 10 รายการเรียบร้อย (เพิ่มใหม่ ' + added + ', อัปเดต ' + updated + ') — ' +
    'ตำแหน่งอื่นที่ Admin เพิ่มเองนอกเหนือ 10 รายการนี้ไม่ถูกแตะต้อง ตรวจสอบผลที่ Admin > ข้อมูลหลัก');
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

/**
 * ลบข้อมูลทดสอบค้าง 3 รายการ (2026-09-24 ผู้ใช้ระบุจากหน้าทะเบียนจริง) — เลขทะเบียนรูปแบบเก่า
 * "อวช11-2569-000XX" (ก่อนเปลี่ยนรูปแบบเป็น "69-XXX" ที่ตกลงกันไปก่อนหน้านี้ในโปรเจกต์) ชื่อผลงาน/หน่วยงาน
 * เป็นข้อมูลทดสอบชัดเจน ("ทดสอบ"/"โรงพยาบาลทดสอบ") ไม่ใช่ของจริง — ลบตาม tracking_no ตรงเป๊ะเท่านั้น
 * (Works + StatusHistory ที่ match work_id) รันเองจาก Editor เท่านั้น: รัน auditTestRecordsBeforeDelete()
 * ดู Log ยืนยันก่อนเสมอ แล้วค่อยรัน deleteTestRecords() ปลอดภัยรันซ้ำได้ (ไม่พบแล้วก็แค่ไม่ลบอะไร)
 */
var TEST_RECORDS_TO_DELETE_ = ['อวช11-2569-00012', 'อวช11-2569-00013', 'อวช11-2569-00014'];

function auditTestRecordsBeforeDelete() {
  var ss = getSpreadsheet_();
  var works = readSheetAsObjects_(ss.getSheetByName(SHEET.WORKS));
  var matched = works.filter(function (w) { return TEST_RECORDS_TO_DELETE_.indexOf(w.tracking_no) !== -1; });
  if (!matched.length) {
    Logger.log('ไม่พบรายการที่ตรงกับ tracking_no ที่ระบุเลย (' + TEST_RECORDS_TO_DELETE_.join(', ') + ') — อาจถูกลบไปแล้ว');
    return;
  }
  matched.forEach(function (w) {
    var hist = getHistoryForWork_(ss, w.work_id);
    Logger.log('tracking_no=' + w.tracking_no + ' | work_id=' + w.work_id +
      ' | ชื่อผลงาน="' + w.work_title + '" | หน่วยงาน="' + w.org_from + '"' +
      ' | เจ้าของ="' + (w.title_name || '') + (w.first_name || '') + ' ' + (w.last_name || '') + '"' +
      ' | created_by=' + w.created_by + ' | ประวัติ ' + hist.length + ' แถว (action: ' + hist.map(function (h) { return h.action; }).join(', ') + ')');
  });
  Logger.log('=== พบ ' + matched.length + '/' + TEST_RECORDS_TO_DELETE_.length + ' รายการตรงกับที่จะลบ — ' +
    'ตรวจสอบให้ครบก่อนรัน deleteTestRecords() ===');
}

function deleteTestRecords() {
  var ss = getSpreadsheet_();
  var worksSheet = ss.getSheetByName(SHEET.WORKS);
  var historySheet = ss.getSheetByName(SHEET.STATUS_HISTORY);

  var works = readSheetAsObjects_(worksSheet);
  var toDelete = {};
  works.forEach(function (w) {
    if (TEST_RECORDS_TO_DELETE_.indexOf(w.tracking_no) !== -1) toDelete[w.work_id] = w.tracking_no;
  });
  if (!Object.keys(toDelete).length) {
    Logger.log('ไม่พบรายการที่ตรงกับ tracking_no ที่ระบุเลย (' + TEST_RECORDS_TO_DELETE_.join(', ') + ') — อาจถูกลบไปแล้ว');
    return;
  }

  var worksHeaders = worksSheet.getRange(1, 1, 1, worksSheet.getLastColumn()).getValues()[0];
  var workIdColW = worksHeaders.indexOf('work_id') + 1;
  var deletedWorks = 0;
  for (var r = worksSheet.getLastRow(); r >= 2; r--) {
    var wid = worksSheet.getRange(r, workIdColW).getValue();
    if (toDelete[wid]) { Logger.log('ลบ Works แถว ' + r + ' (tracking_no=' + toDelete[wid] + ')'); worksSheet.deleteRow(r); deletedWorks++; }
  }

  var historyHeaders = historySheet.getRange(1, 1, 1, historySheet.getLastColumn()).getValues()[0];
  var workIdColH = historyHeaders.indexOf('work_id') + 1;
  var deletedHistory = 0;
  for (var r2 = historySheet.getLastRow(); r2 >= 2; r2--) {
    if (toDelete[historySheet.getRange(r2, workIdColH).getValue()]) { historySheet.deleteRow(r2); deletedHistory++; }
  }

  Logger.log('=== deleteTestRecords เสร็จ — ลบ Works ' + deletedWorks + ' แถว, StatusHistory ' + deletedHistory + ' แถว ===');
}

/**
 * รายชื่อ tracking_no + qr_token ตัวอย่างจากชีตจริง (2026-09-25, ผู้ใช้ขอ — ไว้หา token มาทดสอบหน้าสแกน QR
 * เองโดยไม่ต้องสแกนจริง) log เฉพาะ 10 รายการล่าสุดที่ยังไม่จบกระบวนการ (ไม่ done/terminated) ก่อน — เอา token
 * ไปแปะต่อท้าย URL แบบ ...?page=scan&t=<token> เปิดดูหน้าสแกนได้เลย อ่านอย่างเดียว ไม่แก้ข้อมูลใดๆ
 */
function logSampleQrTokens() {
  var ss = getSpreadsheet_();
  var works = readSheetAsObjects_(ss.getSheetByName(SHEET.WORKS))
    .filter(function (w) { return TERMINAL_STATUSES_.indexOf(w.current_status_public) === -1; })
    .sort(byUpdatedAtDesc_)
    .slice(0, 10);
  if (!works.length) {
    Logger.log('ไม่พบงานที่ยังไม่จบกระบวนการเลย — ลองดูทุกงานแทนที่ Works sheet โดยตรง');
    return;
  }
  works.forEach(function (w) {
    Logger.log('tracking_no=' + w.tracking_no + ' | qr_token=' + w.qr_token + ' | สถานะ=' + w.current_station_key);
  });
  Logger.log('=== เอา qr_token ตัวไหนก็ได้ข้างบน ไปต่อท้าย URL: ' + getWebAppUrl_() + '?page=scan&t=<qr_token> ===');
}

/**
 * เพิ่มขั้นตอนย่อยใหม่ 3.3 "ไม่ครบถ้วน-รอเจ้าของผลงานแก้ไข" (2026-09-25 ผู้ใช้ขอ — ยืนยันตำแหน่งแล้ว: แทรกหลัง
 * 3.2 เดิม) เดิม 3.2 "ไม่ครบถ้วน-ส่งคืนหน่วยงาน" กด "ส่งเอกสารกลับมาแล้ว (ตรวจสอบใหม่)" ครั้งเดียวกลับเข้า 2
 * ตรงๆ ตอนนี้แยกเป็น 2 ขั้น (pattern เดียวกับ 8.2->8.3->8.4 ที่มีอยู่แล้วในระบบ):
 *   3.2 (ส่งคืนหน่วยงาน, org=ORG_FROM เดิม ไม่แตะ)
 *   -> ปุ่มใหม่ "แจ้งเจ้าของผลงานแล้ว"
 *   -> 3.3 (รอเจ้าของผลงานแก้ไข, org=ORG_FROM ใหม่, standard_days=7 เท่า 3.2 เดิม — ยังไม่มีข้อมูลจริงมากำหนด
 *      เป็นอย่างอื่น ปรับได้ทีหลังผ่านหน้า Admin > จัดการ Workflow)
 *   -> ปุ่ม "ส่งเอกสารกลับมาแล้ว (ตรวจสอบใหม่)" (label เดิมทุกตัวอักษร ย้ายจุดเริ่มมาเป็น 3.3 แทน)
 *   -> กลับเข้า 2 เหมือนเดิม
 *
 * ไม่ลบ transition เดิม (s3_2_s2) ทิ้ง แค่ตั้ง active=false (ประวัติเก่าใน StatusHistory ที่เคยใช้เส้นทางนี้
 * เป็น append-only อยู่แล้ว ไม่กระทบ) ปลอดภัยรันซ้ำได้ (idempotent — เช็คมี 's3_3'/transition ใหม่แล้วข้าม)
 * รันเองจาก Apps Script Editor เท่านั้น หลังรันแล้วตรวจสอบผลที่หน้า Admin > จัดการ Workflow
 */
function migrateAddState33() {
  var ss = getSpreadsheet_();
  var statesSheet = ss.getSheetByName(SHEET.WORKFLOW_STATES);
  var transSheet = ss.getSheetByName(SHEET.WORKFLOW_TRANSITIONS);
  if (!statesSheet || !transSheet) {
    Logger.log('ไม่พบชีต WorkflowStates/WorkflowTransitions — ยังไม่เคยรัน migrateToWorkflowStates() มาก่อน ต้องรันนั้นก่อน');
    return;
  }

  var states = readSheetAsObjects_(statesSheet);
  if (states.some(function (s) { return s.station_key === 's3_3'; })) {
    Logger.log('มีขั้นตอน 3.3 อยู่แล้ว — ข้าม (idempotent)');
  } else {
    var stateHeaders = SHEET_HEADERS[SHEET.WORKFLOW_STATES];
    appendRowByHeader_(statesSheet, stateHeaders, {
      station_key: 's3_3', station_order: '3.3', station_name: 'ไม่ครบถ้วน-รอเจ้าของผลงานแก้ไข',
      org: 'ORG_FROM', standard_days: 7, public_status: 'need_revision', receive_role: '', approve_role: '',
      notify_method: '', active: true,
      public_hint: 'เอกสารไม่ครบถ้วน อยู่ระหว่างรอเจ้าของผลงานจัดเตรียมเอกสารเพิ่มเติมให้ครบถ้วน กรุณาส่งเอกสารที่จัดเตรียมเสร็จแล้วกลับผ่านหน่วยงานต้นสังกัดโดยเร็ว',
    });
    // station_order เป็นสตริงตัวเลขล้วน ("3.3") — บังคับ setNumberFormat('@') กันถูก Sheets auto-detect เป็น
    // Number ตอน appendRow (บั๊กคลาสเดียวกับ team_no/tracking_no/station_order ที่เจอมาแล้วหลายรอบในโปรเจกต์นี้)
    var orderCol = stateHeaders.indexOf('station_order') + 1;
    statesSheet.getRange(statesSheet.getLastRow(), orderCol).setNumberFormat('@').setValue('3.3');
    Logger.log('เพิ่มขั้นตอน 3.3 "ไม่ครบถ้วน-รอเจ้าของผลงานแก้ไข" (org=ORG_FROM, standard_days=7) เรียบร้อย');
  }

  var transitions = readSheetAsObjects_(transSheet);
  var transHeaders = SHEET_HEADERS[SHEET.WORKFLOW_TRANSITIONS];
  var byId = {};
  transitions.forEach(function (t) { byId[t.transition_id] = t; });

  if (byId['s3_2_s2'] && byId['s3_2_s2'].active !== false && String(byId['s3_2_s2'].active) !== 'false') {
    updateSheetRowByKey_(transSheet, 'transition_id', 's3_2_s2', { active: false });
    Logger.log('ปิดเส้นทางเดิม s3_2_s2 (active=false, ไม่ลบทิ้ง) — แทนที่ด้วย s3_2 -> s3_3 -> s2 ใหม่');
  } else if (!byId['s3_2_s2']) {
    Logger.log('ไม่พบ transition s3_2_s2 เดิม (อาจเคยปิดไปแล้ว) — ข้าม');
  }

  if (!byId['s3_2_s3_3']) {
    appendRowByHeader_(transSheet, transHeaders, {
      transition_id: 's3_2_s3_3', from_state: 's3_2', to_state: 's3_3',
      button_label: 'แจ้งเจ้าของผลงานแล้ว', requires_note: false, result_value: '', active: true,
    });
    Logger.log('เพิ่มเส้นทาง s3_2 -> s3_3 ("แจ้งเจ้าของผลงานแล้ว") เรียบร้อย');
  }

  if (!byId['s3_3_s2']) {
    appendRowByHeader_(transSheet, transHeaders, {
      transition_id: 's3_3_s2', from_state: 's3_3', to_state: 's2',
      button_label: 'ส่งเอกสารกลับมาแล้ว (ตรวจสอบใหม่)', requires_note: false, result_value: '', active: true,
    });
    Logger.log('เพิ่มเส้นทาง s3_3 -> s2 ("ส่งเอกสารกลับมาแล้ว (ตรวจสอบใหม่)") เรียบร้อย');
  }

  Logger.log('=== migrateAddState33 เสร็จ — ตรวจสอบผลที่หน้า Admin > จัดการ Workflow ===');
}

/**
 * ลบงานทดสอบที่ลงทะเบียนต่อจากของจริง 244 รายการสุดท้าย (2026-09-25 ผู้ใช้ขอ — ยืนยันแล้วว่าข้อมูลจริงมี
 * exactly 244 รายการ ของปีปัจจุบัน) หา Works ที่เลขทะเบียนปีปัจจุบันมีเลขลำดับ > 244 (เช่น "69-245" เป็นต้นไป)
 * ถือว่าเป็นข้อมูลทดสอบที่เกินมา ลบทั้ง Works + StatusHistory ที่ match แล้วปรับ Settings last_seq_<ปีเต็ม>
 * กลับเป็น 244 พอดี ให้การลงทะเบียนจริงครั้งถัดไปได้เลขทะเบียนต่อที่ 245 ตามที่ผู้ใช้ขอ
 *
 * รันเองจาก Editor เท่านั้น: รัน auditRecordsAfter244() ดู Log ยืนยันก่อนเสมอ แล้วค่อยรัน
 * deleteRecordsAfter244AndResetCounter() — รันซ้ำติดกันทันที (ไม่มีอะไรใหม่ค้าง) ปลอดภัย ไม่ลบซ้ำ/ไม่พังอะไร
 * แต่ "ไม่ idempotent ตลอดไป": ถ้ามีการลงทะเบียนงานจริงใหม่ (ได้เลข 245 เป็นต้นไป) เกิดขึ้น *หลัง* รันรอบแรกไปแล้ว
 * ห้ามรันฟังก์ชันนี้ซ้ำอีก เพราะเงื่อนไข ">244" จะไปจับงานจริงตัวใหม่นั้นด้วย (ทำครั้งเดียวตอนเคลียร์ของทดสอบเท่านั้น)
 */
function auditRecordsAfter244() {
  var ss = getSpreadsheet_();
  var year = String(getSetting_(ss, 'fiscal_year_current', String(getBuddhistYear_(now_()))));
  var shortYear = shortBuddhistYear_(year);
  var works = readSheetAsObjects_(ss.getSheetByName(SHEET.WORKS));
  var matched = works.filter(function (w) {
    var m = String(w.tracking_no || '').match(new RegExp('^' + shortYear + '-(\\d+)$'));
    return m && Number(m[1]) > 244;
  });
  var currentSeq = getSetting_(ss, 'last_seq_' + year, '0');
  Logger.log('Settings last_seq_' + year + ' ปัจจุบัน = ' + currentSeq);
  if (!matched.length) {
    Logger.log('ไม่พบงานที่เลขทะเบียนเกิน ' + shortYear + '-244 เลย — ไม่มีอะไรต้องลบ');
    return;
  }
  matched.forEach(function (w) {
    var hist = getHistoryForWork_(ss, w.work_id);
    Logger.log('tracking_no=' + w.tracking_no + ' | work_id=' + w.work_id +
      ' | ชื่อผลงาน="' + w.work_title + '" | หน่วยงาน="' + w.org_from + '"' +
      ' | เจ้าของ="' + (w.title_name || '') + (w.first_name || '') + ' ' + (w.last_name || '') + '"' +
      ' | created_by=' + w.created_by + ' | ประวัติ ' + hist.length + ' แถว (action: ' + hist.map(function (h) { return h.action; }).join(', ') + ')');
  });
  Logger.log('=== พบ ' + matched.length + ' รายการเกินเลข 244 — ตรวจสอบให้ครบก่อนรัน deleteRecordsAfter244AndResetCounter() ===');
}

function deleteRecordsAfter244AndResetCounter() {
  var ss = getSpreadsheet_();
  var worksSheet = ss.getSheetByName(SHEET.WORKS);
  var historySheet = ss.getSheetByName(SHEET.STATUS_HISTORY);
  var year = String(getSetting_(ss, 'fiscal_year_current', String(getBuddhistYear_(now_()))));
  var shortYear = shortBuddhistYear_(year);

  var works = readSheetAsObjects_(worksSheet);
  var toDelete = {};
  works.forEach(function (w) {
    var m = String(w.tracking_no || '').match(new RegExp('^' + shortYear + '-(\\d+)$'));
    if (m && Number(m[1]) > 244) toDelete[w.work_id] = w.tracking_no;
  });

  if (Object.keys(toDelete).length) {
    var worksHeaders = worksSheet.getRange(1, 1, 1, worksSheet.getLastColumn()).getValues()[0];
    var workIdColW = worksHeaders.indexOf('work_id') + 1;
    var deletedWorks = 0;
    for (var r = worksSheet.getLastRow(); r >= 2; r--) {
      var wid = worksSheet.getRange(r, workIdColW).getValue();
      if (toDelete[wid]) { Logger.log('ลบ Works แถว ' + r + ' (tracking_no=' + toDelete[wid] + ')'); worksSheet.deleteRow(r); deletedWorks++; }
    }

    var historyHeaders = historySheet.getRange(1, 1, 1, historySheet.getLastColumn()).getValues()[0];
    var workIdColH = historyHeaders.indexOf('work_id') + 1;
    var deletedHistory = 0;
    for (var r2 = historySheet.getLastRow(); r2 >= 2; r2--) {
      if (toDelete[historySheet.getRange(r2, workIdColH).getValue()]) { historySheet.deleteRow(r2); deletedHistory++; }
    }
    Logger.log('ลบ Works ' + deletedWorks + ' แถว, StatusHistory ' + deletedHistory + ' แถว (เลขทะเบียนเกิน ' + shortYear + '-244)');
  } else {
    Logger.log('ไม่พบงานที่เลขทะเบียนเกิน ' + shortYear + '-244 เลย — ไม่มีอะไรต้องลบ');
  }

  setSetting_(ss, 'last_seq_' + year, '244', 'เลขลำดับล่าสุดของปี ' + year + ' (ระบบเพิ่มอัตโนมัติ ห้ามแก้มือขณะมีคนใช้งาน)');
  Logger.log('=== ปรับ Settings last_seq_' + year + ' = 244 เรียบร้อย — งานถัดไปจะได้เลขทะเบียน ' + shortYear + '-245 ===');
}

/**
 * ลบงานทดสอบเลขทะเบียนลำดับที่ 245 พอดี (2026-10-06 ผู้ใช้ขอ — เกิดใหม่หลังรอบลบ >244 ไปแล้ว) ต่างจาก
 * deleteRecordsAfter244AndResetCounter() ตรงที่จับเฉพาะ "=245" เท่านั้น ไม่แตะ 246 เป็นต้นไป (เผื่อมีงานจริงใหม่
 * ไปแล้ว) รันเองจาก Editor: auditRecordSeq245() ดู Log ยืนยันก่อนเสมอ แล้วค่อยรัน deleteRecordSeq245()
 */
function auditRecordSeq245() {
  var ss = getSpreadsheet_();
  var year = String(getSetting_(ss, 'fiscal_year_current', String(getBuddhistYear_(now_()))));
  var shortYear = shortBuddhistYear_(year);
  var works = readSheetAsObjects_(ss.getSheetByName(SHEET.WORKS));
  var matched = works.filter(function (w) { return String(w.tracking_no || '') === shortYear + '-245'; });
  var currentSeq = getSetting_(ss, 'last_seq_' + year, '0');
  Logger.log('Settings last_seq_' + year + ' ปัจจุบัน = ' + currentSeq);
  if (!matched.length) {
    Logger.log('ไม่พบงานเลขทะเบียน ' + shortYear + '-245 — ไม่มีอะไรต้องลบ');
    return;
  }
  matched.forEach(function (w) {
    var hist = getHistoryForWork_(ss, w.work_id);
    Logger.log('tracking_no=' + w.tracking_no + ' | work_id=' + w.work_id +
      ' | ชื่อผลงาน="' + w.work_title + '" | หน่วยงาน="' + w.org_from + '"' +
      ' | เจ้าของ="' + (w.title_name || '') + (w.first_name || '') + ' ' + (w.last_name || '') + '"' +
      ' | created_by=' + w.created_by + ' | ประวัติ ' + hist.length + ' แถว (action: ' + hist.map(function (h) { return h.action; }).join(', ') + ')');
  });
  Logger.log('=== พบ ' + matched.length + ' รายการเลขทะเบียน ' + shortYear + '-245 — ตรวจสอบให้ครบก่อนรัน deleteRecordSeq245() ===');
}

function deleteRecordSeq245() {
  var ss = getSpreadsheet_();
  var worksSheet = ss.getSheetByName(SHEET.WORKS);
  var historySheet = ss.getSheetByName(SHEET.STATUS_HISTORY);
  var year = String(getSetting_(ss, 'fiscal_year_current', String(getBuddhistYear_(now_()))));
  var shortYear = shortBuddhistYear_(year);
  var targetTrackingNo = shortYear + '-245';

  var works = readSheetAsObjects_(worksSheet);
  var toDelete = {};
  works.forEach(function (w) { if (String(w.tracking_no || '') === targetTrackingNo) toDelete[w.work_id] = w.tracking_no; });

  if (!Object.keys(toDelete).length) {
    Logger.log('ไม่พบงานเลขทะเบียน ' + targetTrackingNo + ' — ไม่มีอะไรต้องลบ');
    return;
  }

  var worksHeaders = worksSheet.getRange(1, 1, 1, worksSheet.getLastColumn()).getValues()[0];
  var workIdColW = worksHeaders.indexOf('work_id') + 1;
  var deletedWorks = 0;
  for (var r = worksSheet.getLastRow(); r >= 2; r--) {
    var wid = worksSheet.getRange(r, workIdColW).getValue();
    if (toDelete[wid]) { Logger.log('ลบ Works แถว ' + r + ' (tracking_no=' + toDelete[wid] + ')'); worksSheet.deleteRow(r); deletedWorks++; }
  }

  var historyHeaders = historySheet.getRange(1, 1, 1, historySheet.getLastColumn()).getValues()[0];
  var workIdColH = historyHeaders.indexOf('work_id') + 1;
  var deletedHistory = 0;
  for (var r2 = historySheet.getLastRow(); r2 >= 2; r2--) {
    if (toDelete[historySheet.getRange(r2, workIdColH).getValue()]) { historySheet.deleteRow(r2); deletedHistory++; }
  }
  Logger.log('ลบ Works ' + deletedWorks + ' แถว, StatusHistory ' + deletedHistory + ' แถว (tracking_no=' + targetTrackingNo + ')');

  var currentSeq = Number(getSetting_(ss, 'last_seq_' + year, '0'));
  if (currentSeq === 245) {
    setSetting_(ss, 'last_seq_' + year, '244', 'เลขลำดับล่าสุดของปี ' + year + ' (ระบบเพิ่มอัตโนมัติ ห้ามแก้มือขณะมีคนใช้งาน)');
    Logger.log('=== ปรับ Settings last_seq_' + year + ' กลับเป็น 244 เรียบร้อย (245 คือลำดับล่าสุด) — งานถัดไปจะได้เลขทะเบียน ' + shortYear + '-245 ===');
  } else {
    Logger.log('=== ไม่ปรับ Settings last_seq_' + year + ' (ปัจจุบัน=' + currentSeq + ' มีงานเลขสูงกว่า 245 อยู่แล้ว ปรับกลับจะทำให้เลขทะเบียนซ้ำ) ===');
  }
}

/**
 * ลบงานทดสอบเลขทะเบียน "69-517" ตัวเดียว แล้วบังคับ Settings last_seq_<ปี> กลับเป็น 244 ให้งานถัดไปวิ่งต่อที่
 * 245 ตามที่ผู้ใช้ขอ (2026-10-06) — ก่อนบังคับ reset จะ audit หาว่ามีงานอื่นเลขเกิน 244 ค้างอยู่อีกหรือไม่
 * (กันเคสมีงานจริงใช้เลข 245+ ไปแล้ว ถ้า reset กลับ 244 จะทำให้ครั้งต่อไปออกเลขซ้ำ) ถ้าพบงานอื่นค้าง จะไม่ reset
 * ให้อัตโนมัติ แค่ log เตือนให้ตรวจเอง รันเองจาก Editor: auditRecordTrackingNo517() ดูก่อน แล้วค่อยรัน
 * deleteRecordTrackingNo517AndResetCounter()
 */
function auditRecordTrackingNo517() {
  var ss = getSpreadsheet_();
  var year = String(getSetting_(ss, 'fiscal_year_current', String(getBuddhistYear_(now_()))));
  var shortYear = shortBuddhistYear_(year);
  var works = readSheetAsObjects_(ss.getSheetByName(SHEET.WORKS));
  var matched = works.filter(function (w) { return String(w.tracking_no || '') === '69-517'; });
  var currentSeq = getSetting_(ss, 'last_seq_' + year, '0');
  Logger.log('Settings last_seq_' + year + ' ปัจจุบัน = ' + currentSeq);
  if (!matched.length) {
    Logger.log('ไม่พบงานเลขทะเบียน 69-517 — ไม่มีอะไรต้องลบ');
  } else {
    matched.forEach(function (w) {
      var hist = getHistoryForWork_(ss, w.work_id);
      Logger.log('tracking_no=' + w.tracking_no + ' | work_id=' + w.work_id +
        ' | ชื่อผลงาน="' + w.work_title + '" | หน่วยงาน="' + w.org_from + '"' +
        ' | เจ้าของ="' + (w.title_name || '') + (w.first_name || '') + ' ' + (w.last_name || '') + '"' +
        ' | created_by=' + w.created_by + ' | ประวัติ ' + hist.length + ' แถว (action: ' + hist.map(function (h) { return h.action; }).join(', ') + ')');
    });
  }
  var others = works.filter(function (w) {
    var m = String(w.tracking_no || '').match(new RegExp('^' + shortYear + '-(\\d+)$'));
    return m && Number(m[1]) > 244 && String(w.tracking_no || '') !== '69-517';
  });
  if (others.length) {
    Logger.log('=== คำเตือน: พบงานอื่นที่เลขทะเบียนเกิน ' + shortYear + '-244 อยู่ด้วย ' + others.length + ' รายการ: ' +
      others.map(function (w) { return w.tracking_no; }).join(', ') + ' — ถ้ายังมีงานพวกนี้ ห้าม reset counter กลับ 244 (จะออกเลขซ้ำ) ===');
  } else {
    Logger.log('=== ไม่มีงานอื่นเกิน ' + shortYear + '-244 ค้างอยู่ — reset counter กลับ 244 ได้ปลอดภัย ===');
  }
}

function deleteRecordTrackingNo517AndResetCounter() {
  var ss = getSpreadsheet_();
  var worksSheet = ss.getSheetByName(SHEET.WORKS);
  var historySheet = ss.getSheetByName(SHEET.STATUS_HISTORY);
  var year = String(getSetting_(ss, 'fiscal_year_current', String(getBuddhistYear_(now_()))));
  var shortYear = shortBuddhistYear_(year);

  var works = readSheetAsObjects_(worksSheet);
  var toDelete = {};
  works.forEach(function (w) { if (String(w.tracking_no || '') === '69-517') toDelete[w.work_id] = w.tracking_no; });

  if (Object.keys(toDelete).length) {
    var worksHeaders = worksSheet.getRange(1, 1, 1, worksSheet.getLastColumn()).getValues()[0];
    var workIdColW = worksHeaders.indexOf('work_id') + 1;
    var deletedWorks = 0;
    for (var r = worksSheet.getLastRow(); r >= 2; r--) {
      var wid = worksSheet.getRange(r, workIdColW).getValue();
      if (toDelete[wid]) { Logger.log('ลบ Works แถว ' + r + ' (tracking_no=' + toDelete[wid] + ')'); worksSheet.deleteRow(r); deletedWorks++; }
    }

    var historyHeaders = historySheet.getRange(1, 1, 1, historySheet.getLastColumn()).getValues()[0];
    var workIdColH = historyHeaders.indexOf('work_id') + 1;
    var deletedHistory = 0;
    for (var r2 = historySheet.getLastRow(); r2 >= 2; r2--) {
      if (toDelete[historySheet.getRange(r2, workIdColH).getValue()]) { historySheet.deleteRow(r2); deletedHistory++; }
    }
    Logger.log('ลบ Works ' + deletedWorks + ' แถว, StatusHistory ' + deletedHistory + ' แถว (tracking_no=69-517)');
  } else {
    Logger.log('ไม่พบงานเลขทะเบียน 69-517 — ไม่มีอะไรต้องลบ');
  }

  var remaining = readSheetAsObjects_(worksSheet);
  var others = remaining.filter(function (w) {
    var m = String(w.tracking_no || '').match(new RegExp('^' + shortYear + '-(\\d+)$'));
    return m && Number(m[1]) > 244;
  });
  if (others.length) {
    Logger.log('=== ไม่ reset Settings last_seq_' + year + ' (ยังมีงานเลขเกิน ' + shortYear + '-244 ค้างอยู่ ' + others.length +
      ' รายการ: ' + others.map(function (w) { return w.tracking_no; }).join(', ') + ' — reset ตอนนี้จะทำให้เลขทะเบียนซ้ำ ตรวจ/ลบให้หมดก่อนแล้วรันใหม่) ===');
  } else {
    setSetting_(ss, 'last_seq_' + year, '244', 'เลขลำดับล่าสุดของปี ' + year + ' (ระบบเพิ่มอัตโนมัติ ห้ามแก้มือขณะมีคนใช้งาน)');
    Logger.log('=== ปรับ Settings last_seq_' + year + ' = 244 เรียบร้อย — งานถัดไปจะได้เลขทะเบียน ' + shortYear + '-245 ===');
  }
}

/**
 * Login สำหรับเจ้าของผลงาน (2026-10-06, ดู OwnerAuth.gs) — รันครั้งเดียวจาก Editor บนชีตจริง: เพิ่มคอลัมน์
 * owner_login_code_hash ใน Works (reuse migrateAddWorksColumns_() เดิม — append header ถ้ายังไม่มี) +
 * สร้างชีตใหม่ OwnerSessions/OwnerLoginLog (idempotent ผ่าน ensureSheet_ — มีอยู่แล้วข้ามเฉย ๆ ไม่ทับข้อมูล)
 * ไม่ต้อง seed ข้อมูลใดๆ (รหัสผ่านใช้ tracking_no เป็นค่าเริ่มต้นโดยอัตโนมัติ ไม่ต้อง migrate ค่าเก่า)
 */
function migrateOwnerLoginFeature() {
  migrateAddWorksColumns_();
  var ss = getSpreadsheet_();
  ensureSheet_(ss, SHEET.OWNER_SESSIONS, SHEET_HEADERS[SHEET.OWNER_SESSIONS]);
  ensureSheet_(ss, SHEET.OWNER_LOGIN_LOG, SHEET_HEADERS[SHEET.OWNER_LOGIN_LOG]);
  Logger.log('=== migrateOwnerLoginFeature เสร็จ — เพิ่มคอลัมน์ owner_login_code_hash ใน Works + สร้างชีต OwnerSessions/OwnerLoginLog เรียบร้อย ===');
}

var OWNER_LOGIN_SMOKE_TEST_MARKER_ = 'OWNER_LOGIN_SMOKE_TEST_RECORD_DO_NOT_KEEP';
var OWNER_LOGIN_SMOKE_TEST_MARKER_2_ = 'OWNER_LOGIN_SMOKE_TEST_RECORD_2_DO_NOT_KEEP';

/**
 * สร้างงานทดสอบ 1 รายการไว้ทดสอบ Login เจ้าของผลงานจริงบนเว็บแบบ end-to-end (2026-10-06, ผู้ใช้ขอหลัง
 * migrateOwnerLoginFeature()) — รันจาก Editor ครั้งเดียว แล้วลองล็อกอินที่หน้าเว็บจริงด้วย:
 *   Username: ทดสอบล็อกอิน999
 *   Password: 99-999
 * ใช้ nextTrackingNo_/generateUniqueQrToken_/getFirstActiveStation_ ชุดเดียวกับ registerNewWork_ จริงทุก
 * ประการ (ไม่ข้าม sequence จริง กันเลขทะเบียนชนกัน) ทำเสร็จแล้วรัน deleteOwnerLoginSmokeTestRecord() ทิ้งทันที
 */
function createOwnerLoginSmokeTestRecord() {
  var ss = getSpreadsheet_();
  var station = getFirstActiveStation_(ss);
  var trackingNo = nextTrackingNo_(ss);
  var qrToken = generateUniqueQrToken_(ss);
  var workId = Utilities.getUuid();
  var nowTs = now_();

  var worksSheet = ss.getSheetByName(SHEET.WORKS);
  appendRowByHeader_(worksSheet, SHEET_HEADERS[SHEET.WORKS], {
    work_id: workId, tracking_no: trackingNo, qr_token: qrToken,
    citizen_id_last4: '', citizen_id_encrypted: '', citizen_id_hash: '',
    title_name: 'นาย', first_name: 'ทดสอบล็อกอิน999', last_name: 'ห้ามลบขณะทดสอบ',
    position: 'ทดสอบ', current_level: '', requested_level: '', work_type: 'ทดสอบ',
    work_title: OWNER_LOGIN_SMOKE_TEST_MARKER_, org_from: 'หน่วยงานทดสอบ (ลบได้ทันที)',
    phone: '', email: '', cover_image_url: '', received_date: nowTs,
    current_station_key: station.station_key, current_status_public: station.public_status,
    handoff_pending: false, current_owner_org: station.org,
    current_handler_name: 'ระบบทดสอบ', updated_at: nowTs, next_step_text: '',
    created_by: 'system-smoke-test', created_at: nowTs,
    position_no: 'TEST-0', medical_domain: '', medical_specialty: '', province: 'สุราษฎร์ธานี',
    specialty: '', committee_code: '',
    owner_login_code_hash: hashOwnerLoginCode_('99-999'),
  });

  var historySheet = ss.getSheetByName(SHEET.STATUS_HISTORY);
  appendRowByHeader_(historySheet, SHEET_HEADERS[SHEET.STATUS_HISTORY], {
    history_id: Utilities.getUuid(), work_id: workId, tracking_no: trackingNo, action: 'registered',
    from_station: '', to_station: station.station_key, from_org: '', to_org: station.org,
    action_by: 'system-smoke-test', action_by_org: 'ทดสอบ', action_date: nowTs,
    note: '', revision_reasons: '', revision_due_date: '', attachment_url: '', created_at: nowTs,
  });

  Logger.log('=== สร้างงานทดสอบสำเร็จ: tracking_no=' + trackingNo + ' work_id=' + workId + ' ===');
  Logger.log('ทดสอบที่หน้าเว็บจริง (หน้าแรก) ด้วย Username: ทดสอบล็อกอิน999  /  Password: 99-999');
  Logger.log('ทดสอบเสร็จแล้ว รัน deleteOwnerLoginSmokeTestRecord() ทันทีเพื่อลบทิ้ง');
}

/**
 * งานทดสอบ "อีกคน" ไว้ทดสอบว่า owner A เปิดข้อมูลของ owner B ไม่ได้ (ข้อ 9 ของสเปก, 2026-10-07 ผู้ใช้ขอ) —
 * ข้อมูลทดสอบล้วนๆ เหมือน createOwnerLoginSmokeTestRecord() ทุกประการ แค่คนละชื่อ/รหัส ไม่ใช่ข้อมูลจริงของใคร
 *   Username: ทดสอบล็อกอินสอง888
 *   Password: 88-888
 */
function createOwnerLoginSmokeTestRecord2() {
  var ss = getSpreadsheet_();
  var station = getFirstActiveStation_(ss);
  var trackingNo = nextTrackingNo_(ss);
  var qrToken = generateUniqueQrToken_(ss);
  var workId = Utilities.getUuid();
  var nowTs = now_();

  var worksSheet = ss.getSheetByName(SHEET.WORKS);
  appendRowByHeader_(worksSheet, SHEET_HEADERS[SHEET.WORKS], {
    work_id: workId, tracking_no: trackingNo, qr_token: qrToken,
    citizen_id_last4: '', citizen_id_encrypted: '', citizen_id_hash: '',
    title_name: 'นาง', first_name: 'ทดสอบล็อกอินสอง888', last_name: 'ห้ามลบขณะทดสอบ2',
    position: 'ทดสอบ', current_level: '', requested_level: '', work_type: 'ทดสอบ',
    work_title: OWNER_LOGIN_SMOKE_TEST_MARKER_2_, org_from: 'หน่วยงานทดสอบ (ลบได้ทันที)',
    phone: '', email: '', cover_image_url: '', received_date: nowTs,
    current_station_key: station.station_key, current_status_public: station.public_status,
    handoff_pending: false, current_owner_org: station.org,
    current_handler_name: 'ระบบทดสอบ', updated_at: nowTs, next_step_text: '',
    created_by: 'system-smoke-test', created_at: nowTs,
    position_no: 'TEST-1', medical_domain: '', medical_specialty: '', province: 'สุราษฎร์ธานี',
    specialty: '', committee_code: '',
    owner_login_code_hash: hashOwnerLoginCode_('88-888'),
  });

  var historySheet2 = ss.getSheetByName(SHEET.STATUS_HISTORY);
  appendRowByHeader_(historySheet2, SHEET_HEADERS[SHEET.STATUS_HISTORY], {
    history_id: Utilities.getUuid(), work_id: workId, tracking_no: trackingNo, action: 'registered',
    from_station: '', to_station: station.station_key, from_org: '', to_org: station.org,
    action_by: 'system-smoke-test', action_by_org: 'ทดสอบ', action_date: nowTs,
    note: '', revision_reasons: '', revision_due_date: '', attachment_url: '', created_at: nowTs,
  });

  Logger.log('=== สร้างงานทดสอบ "คนที่ 2" สำเร็จ: tracking_no=' + trackingNo + ' work_id=' + workId + ' ===');
  Logger.log('ทดสอบที่หน้าเว็บจริง ด้วย Username: ทดสอบล็อกอินสอง888  /  Password: 88-888');
  Logger.log('ใช้ทดสอบว่า session ของคนนี้เปิดดูข้อมูลของ "ทดสอบล็อกอิน999" (คนแรก) ไม่ได้ และกลับกัน');
  Logger.log('ทดสอบเสร็จแล้ว รัน deleteOwnerLoginSmokeTestRecord() ครั้งเดียวลบทั้ง 2 คนพร้อมกัน');
}

/** ลบงานทดสอบที่สร้างจาก createOwnerLoginSmokeTestRecord()/createOwnerLoginSmokeTestRecord2() ทั้งหมดในครั้ง
 *  เดียว — จับคู่ด้วย work_title marker เฉพาะ (ชื่อนี้แทบเป็นไปไม่ได้ที่จะชนกับงานจริง) ลบทั้ง Works +
 *  StatusHistory + session ที่อาจสร้างไว้ตอนทดสอบ login */
function deleteOwnerLoginSmokeTestRecord() {
  var ss = getSpreadsheet_();
  var worksSheet = ss.getSheetByName(SHEET.WORKS);
  var historySheet = ss.getSheetByName(SHEET.STATUS_HISTORY);

  var works = readSheetAsObjects_(worksSheet);
  var toDelete = {};
  works.forEach(function (w) {
    if (w.work_title === OWNER_LOGIN_SMOKE_TEST_MARKER_ || w.work_title === OWNER_LOGIN_SMOKE_TEST_MARKER_2_) toDelete[w.work_id] = w.tracking_no;
  });

  if (!Object.keys(toDelete).length) {
    Logger.log('ไม่พบงานทดสอบ (marker: ' + OWNER_LOGIN_SMOKE_TEST_MARKER_ + ' หรือ ' + OWNER_LOGIN_SMOKE_TEST_MARKER_2_ + ') — ไม่มีอะไรต้องลบ');
    return;
  }

  var worksHeaders = worksSheet.getRange(1, 1, 1, worksSheet.getLastColumn()).getValues()[0];
  var workIdColW = worksHeaders.indexOf('work_id') + 1;
  for (var r = worksSheet.getLastRow(); r >= 2; r--) {
    var wid = worksSheet.getRange(r, workIdColW).getValue();
    if (toDelete[wid]) { Logger.log('ลบ Works แถว ' + r + ' (tracking_no=' + toDelete[wid] + ')'); worksSheet.deleteRow(r); }
  }

  var historyHeaders = historySheet.getRange(1, 1, 1, historySheet.getLastColumn()).getValues()[0];
  var workIdColH = historyHeaders.indexOf('work_id') + 1;
  for (var r2 = historySheet.getLastRow(); r2 >= 2; r2--) {
    if (toDelete[historySheet.getRange(r2, workIdColH).getValue()]) historySheet.deleteRow(r2);
  }

  var sessionsSheet = ss.getSheetByName(SHEET.OWNER_SESSIONS);
  if (sessionsSheet) {
    var sessionRows = readSheetAsObjects_(sessionsSheet);
    var sessHeaders = sessionsSheet.getRange(1, 1, 1, sessionsSheet.getLastColumn()).getValues()[0];
    var workIdColS = sessHeaders.indexOf('work_id') + 1;
    for (var r3 = sessionsSheet.getLastRow(); r3 >= 2; r3--) {
      if (toDelete[sessionsSheet.getRange(r3, workIdColS).getValue()]) sessionsSheet.deleteRow(r3);
    }
  }

  Logger.log('=== ลบงานทดสอบ Login เจ้าของผลงาน + session ที่เกี่ยวข้องเรียบร้อย ===');
}

/**
 * ซ่อมชีต Works กรณี header เพี้ยน (ช่องว่างไม่มีชื่อแทรกกลาง เลื่อน header คอลัมน์ถัดไปผิดตำแหน่ง) — เกิดจาก
 * migrateAddWorksColumns_() รุ่นก่อน 2026-10-06 ใช้ sheet.getLastColumn() ตรงๆ (นับรวมแถวข้อมูลที่อาจยาวเกิน
 * header จริงถ้ามีการเขียนคอลัมน์ใหม่ก่อน migrate) **ต้องลบแถวข้อมูลที่ทำให้คอลัมน์ยาวเกิน header ออกก่อนเสมอ**
 * (เช่น รัน deleteOwnerLoginSmokeTestRecord() ก่อน) แล้วค่อยรันตัวนี้ ปลอดภัย: ลบเฉพาะคอลัมน์ที่ header ว่าง
 * "และ" ข้อมูลทุกแถวว่างสนิทเท่านั้น ถ้าคอลัมน์ไหน header ว่างแต่มีข้อมูลจริงอยู่ จะไม่ลบ แค่ log เตือน
 */
function repairWorksGhostColumns() {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(SHEET.WORKS);
  var lastCol = sheet.getLastColumn();
  var lastRow = sheet.getLastRow();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

  var ghostCols = [];
  for (var c = 0; c < headers.length; c++) {
    if (!headers[c]) ghostCols.push(c + 1); // ตำแหน่งคอลัมน์แบบ 1-based
  }
  if (!ghostCols.length) {
    Logger.log('ไม่พบคอลัมน์ header ว่างเลย — ชีต Works ปกติดี ไม่ต้องซ่อมอะไร');
    return;
  }
  Logger.log('พบคอลัมน์ header ว่าง ' + ghostCols.length + ' คอลัมน์ ที่ตำแหน่ง: ' + ghostCols.join(', '));

  ghostCols.sort(function (a, b) { return b - a; }).forEach(function (col) { // ลบขวาไปซ้าย กันเลขคอลัมน์เลื่อน
    var isEmpty = true;
    if (lastRow >= 2) {
      var colValues = sheet.getRange(2, col, lastRow - 1, 1).getValues();
      isEmpty = colValues.every(function (row) { return row[0] === '' || row[0] === null; });
    }
    if (isEmpty) {
      sheet.deleteColumn(col);
      Logger.log('ลบคอลัมน์ว่างที่ตำแหน่ง ' + col + ' เรียบร้อย (ไม่มีข้อมูลจริงอยู่ในคอลัมน์นี้เลยทุกแถว)');
    } else {
      Logger.log('=== คำเตือน: คอลัมน์ ' + col + ' header ว่างแต่มีข้อมูลอยู่จริง — ไม่ลบอัตโนมัติ ตรวจสอบเองก่อน (อาจมีข้อมูลสำคัญ) ===');
    }
  });

  var newHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  Logger.log('=== header หลังซ่อม: ' + newHeaders.join(' | ') + ' ===');
}

/**
 * เทียบ header จริงบนชีต Works ทีละคอลัมน์กับที่โค้ดคาดไว้ (SHEET_HEADERS[SHEET.WORKS]) — ใช้หา "เหลื่อม
 * ตำแหน่ง" ตรงๆ (2026-10-06, หลัง repairWorksGhostColumns() แล้วยัง owner_login_code_hash อ่านค่าไม่เจออยู่ดี
 * ต้องดูตำแหน่งจริงเทียบกันทีละคอลัมน์ถึงจะฟันธงได้) รันจาก Editor แล้วส่งเฉพาะบรรทัดที่มี "ไม่ตรงกัน" +
 * บรรทัดสรุปตำแหน่ง owner_login_code_hash กลับมา
 */
function diagnoseWorksColumnAlignment() {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(SHEET.WORKS);
  var lastCol = sheet.getLastColumn();
  var liveHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var codeHeaders = SHEET_HEADERS[SHEET.WORKS];

  Logger.log('ความยาว header จริงบนชีต: ' + liveHeaders.length + ' | ความยาวตาม SHEET_HEADERS ในโค้ด: ' + codeHeaders.length);

  var liveIdx = liveHeaders.indexOf('owner_login_code_hash');
  var codeIdx = codeHeaders.indexOf('owner_login_code_hash');
  Logger.log('owner_login_code_hash: อยู่คอลัมน์ที่ (1-based) จริงบนชีต = ' + (liveIdx + 1) + ' | โค้ดคาดว่าควรอยู่คอลัมน์ที่ = ' + (codeIdx + 1));

  var maxLen = Math.max(liveHeaders.length, codeHeaders.length);
  var mismatchCount = 0;
  for (var i = 0; i < maxLen; i++) {
    var liveH = liveHeaders[i] || '(ไม่มี)';
    var codeH = codeHeaders[i] || '(ไม่มี)';
    if (liveH !== codeH) {
      mismatchCount++;
      Logger.log('คอลัมน์ ' + (i + 1) + ': ชีตจริง="' + liveH + '" | โค้ดคาดไว้="' + codeH + '"  <<< ไม่ตรงกัน');
    }
  }
  Logger.log('=== พบจุดไม่ตรงกันทั้งหมด ' + mismatchCount + ' คอลัมน์ (0 = เรียงตรงกันสมบูรณ์) ===');
}

/**
 * วินิจฉัยว่าทำไม login เจ้าของผลงานล้มเหลว (2026-10-06 ผู้ใช้เจอข้อความ "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง"
 * ตอนทดสอบจริง) ตรวจทุกจุดที่เป็นไปได้: คอลัมน์ owner_login_code_hash มีจริงในแถว header หรือยัง (ถ้า migrate
 * ไม่ทัน/ไม่ครบ ค่าที่เขียนไว้จะ "หาย" ตอนอ่านกลับ เพราะ readSheetAsObjects_ อ่าน header จากแถวจริงของชีต
 * ไม่ใช่จากค่าคงที่ในโค้ด) + งานทดสอบมีอยู่จริงหรือไม่ + searchPublicRecordsByName_ หาเจอไหม + เทียบรหัสผ่าน
 * 99-999 ผ่านจริงไหม รันจาก Editor แล้วดู Log ทั้งหมด
 */
function diagnoseOwnerLoginSmokeTest() {
  var ss = getSpreadsheet_();
  var worksSheet = ss.getSheetByName(SHEET.WORKS);
  var liveHeaders = worksSheet.getRange(1, 1, 1, worksSheet.getLastColumn()).getValues()[0];
  var hasCodeColumn = liveHeaders.indexOf('owner_login_code_hash') !== -1;
  Logger.log('1) คอลัมน์ owner_login_code_hash อยู่ในแถว header จริงของชีต Works หรือไม่: ' + hasCodeColumn +
    (hasCodeColumn ? '' : '  <-- ยังไม่มี! ต้องรัน migrateAddWorksColumns_() หรือ migrateOwnerLoginFeature() ก่อน แล้วค่อยสร้างงานทดสอบใหม่'));

  Logger.log('2) ชีต OwnerSessions มีอยู่จริงหรือไม่: ' + !!ss.getSheetByName(SHEET.OWNER_SESSIONS));
  Logger.log('3) ชีต OwnerLoginLog มีอยู่จริงหรือไม่: ' + !!ss.getSheetByName(SHEET.OWNER_LOGIN_LOG));

  var works = readSheetAsObjects_(worksSheet);
  var testWork = works.filter(function (w) { return w.work_title === OWNER_LOGIN_SMOKE_TEST_MARKER_; })[0];
  if (!testWork) {
    Logger.log('4) ไม่พบงานทดสอบเลย (marker: ' + OWNER_LOGIN_SMOKE_TEST_MARKER_ + ') — ยังไม่ได้รัน createOwnerLoginSmokeTestRecord() หรือรันไม่สำเร็จ');
    return;
  }
  Logger.log('4) พบงานทดสอบ: work_id=' + testWork.work_id + ' tracking_no=' + testWork.tracking_no +
    ' first_name="' + testWork.first_name + '" last_name="' + testWork.last_name + '"');
  Logger.log('5) ค่า owner_login_code_hash ที่อ่านกลับได้จริง: "' + (testWork.owner_login_code_hash || '(ว่าง/อ่านไม่เจอ)') + '"');

  var candidates = searchPublicRecordsByName_(ss, 'ทดสอบล็อกอิน999');
  Logger.log('6) searchPublicRecordsByName_("ทดสอบล็อกอิน999") เจอ ' + candidates.length + ' รายการ: ' +
    candidates.map(function (w) { return w.tracking_no; }).join(', '));

  var verify99999 = verifyOwnerLoginCode_(testWork, '99-999');
  Logger.log('7) verifyOwnerLoginCode_(งานทดสอบ, "99-999") ผ่านหรือไม่: ' + verify99999 +
    (verify99999 ? '' : '  <-- ถ้า false ทั้งที่ข้อ 5 มีค่า hash ปกติ แปลว่า hash ไม่ตรง (สร้างซ้ำหลาย record?) ถ้าข้อ 5 ว่าง แปลว่าโดนปัญหาข้อ 1'));
  Logger.log('=== จบการวินิจฉัย — ดูผลข้อ 1-7 ด้านบนเพื่อหาสาเหตุ ===');
}
