/**
 * นำเข้าข้อมูลเก่าจาก Google Sheet ชุดล่าสุด — ชีต "LegacyImport" (คัดลอกมาจากแท็บ "อวช(244)" ของไฟล์
 * 1อวช140969.xlsx โดยผู้ใช้เอง วางเป็นแท็บใหม่ในสเปรดชีตฐานข้อมูลจริง — 2026-09-21 อัปเดตจากแหล่งข้อมูลเดิม
 * "อวช(240)" ของไฟล์ 1อวช060969.xlsx เป็นชุดล่าสุด 244 รายการ ยืนยันจากไฟล์จริงว่า header/ลำดับคอลัมน์เหมือนเดิม
 * ทุกประการ 240 แถวแรกข้อมูลตรงกัน มีแค่ 4 แถวท้ายเพิ่มมาใหม่ — โค้ดข้างล่างไม่ต้องแก้อะไร แค่เปลี่ยนแหล่งคัดลอก)
 * คอลัมน์ A-K ยืนยันจาก header จริง:
 * ลำดับ, ชื่อ-สกุล, ตำแหน่ง, ด้าน, จังหวัด, วันที่ลงรับ, ทีม, เลขา, ส่วนราชการตำแหน่งที่ขอแต่งตั้ง, เดือน, สถานะ
 *
 * ลำดับการทำงาน (ห้ามข้ามขั้นตอน ตามที่ผู้ใช้กำหนด): analyzeLegacySheet() -> validateLegacyData() ->
 * previewLegacyMigration() (เขียนผลลัพธ์ลงชีต "LegacyPreview" ให้ตรวจสอบ ไม่แตะข้อมูลจริง) -> ผู้ใช้ตรวจสอบเอง ->
 * migrateLegacyRegistrations() (รันเองเท่านั้น ห้าม auto-run) — ทุกฟังก์ชันปลอดภัยรันซ้ำได้
 *
 * การตัดสินใจสำคัญที่ยืนยันกับผู้ใช้แล้ว (ห้ามเดาเพิ่ม):
 * - คอลัมน์ F "วันที่ลงรับ" เป็น date format จริง (ยืนยันจาก styles.xml numFmtId=14) แต่ผู้กรอกพิมพ์ปี พ.ศ. ตรงๆ
 *   ลงช่องวันที่ (ไม่แปลงเป็น ค.ศ.) ทำให้ serial เพี้ยนไป 543 ปี — ต้องลบ 543 ปีออกตอน migrate เสมอ
 * - สถานะ "0" (พบ 2 แถว ไม่มีใน WorkflowStates) = ยกเลิก/ยุติเรื่อง -> map เป็น current_status_public='terminated'
 */

var LEGACY_SHEET_NAME_ = 'LegacyImport';
var LEGACY_PREVIEW_SHEET_NAME_ = 'LegacyPreview';
var LEGACY_COL_ = { SEQ: 0, NAME: 1, POSITION: 2, SPECIALTY: 3, PROVINCE: 4, RECEIVED: 5, TEAM: 6, SECRETARY: 7, ORG_POSITION: 8, MONTH: 9, STATE: 10 };

/**
 * หาแท็บด้วยชื่อ แบบ exact match ก่อน ถ้าไม่เจอค่อย fallback หาแบบ trim+case-insensitive (กัน user เผลอเว้น
 * วรรคท้าย/ตัวพิมพ์เล็กใหญ่ตอนตั้งชื่อแท็บ) — เจอเคสจริง 2026-09-21: ผู้ใช้เห็นแท็บ "LegacyImport" ในลิสต์ log
 * เอง (getSheets() คืนชื่อออกมาแล้ว) แต่ getSheetByName() ตรงๆ กลับหาไม่เจอ สาเหตุน่าจะเป็นช่องว่างแฝงที่ตัว
 * viewer ของ Apps Script Editor (HTML) ยุบช่องว่างทิ้งตอนแสดงผล มองด้วยตาเปล่าแยกไม่ออกจากชื่อที่ถูกต้อง
 */
function findSheetLoose_(ss, targetName) {
  var exact = ss.getSheetByName(targetName);
  if (exact) return exact;
  var target = targetName.trim().toLowerCase();
  var match = ss.getSheets().filter(function (s) { return s.getName().trim().toLowerCase() === target; })[0];
  return match || null;
}

/** อ่านชีต LegacyImport ทั้งชีตเป็น array of array (ดิบ ไม่ผ่าน readSheetAsObjects_ เพราะ header ไม่ตรงชื่อ field ในระบบ) */
function readLegacySheetRaw_(ss) {
  var sheet = findSheetLoose_(ss, LEGACY_SHEET_NAME_);
  if (!sheet) {
    var sheetInfo = ss.getSheets().map(function (s) { return JSON.stringify(s.getName()) + '(len=' + s.getName().length + ')'; });
    throw new Error('ไม่พบชีต "' + LEGACY_SHEET_NAME_ + '" ใน Spreadsheet ID=' + ss.getId() +
      ' (แท็บที่มีอยู่จริงตอนนี้: ' + sheetInfo.join(', ') + ') — เทียบความยาวชื่อ/อักขระตรงนี้กับ "LegacyImport" ' +
      '(len=12) เพื่อหาอักขระแปลกปลอม (ช่องว่าง/สัญลักษณ์ซ่อน) ในชื่อแท็บจริง');
  }
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, lastCol).getValues()
    .filter(function (r) { return String(r[LEGACY_COL_.NAME] || '').trim(); }); // ตัดแถวว่าง
}

/** แปลง Excel date serial (numFmtId=14, ยืนยันแล้วว่าเป็น date จริง) เป็น Date object — ไม่ปรับปี */
function excelSerialToDate_(serial) {
  var utcDays = Math.floor(Number(serial) - 25569);
  return new Date(utcDays * 86400 * 1000);
}

/** แก้ปี พ.ศ. ที่พิมพ์ผิดลงช่องวันที่ตรงๆ (ยืนยันกับผู้ใช้แล้ว — ดู docstring บนสุดของไฟล์) ลบ 543 ปีออก คง
 *  เดือน/วันเดิมไว้ทุกประการ คืน null ถ้า serial ไม่ใช่ตัวเลข/วันที่ที่ใช้ได้ (กันข้อมูลเสียพัง)
 *  2026-09-21: sheet.getRange().getValues() คืนค่าเป็น JS Date object จริง (ไม่ใช่เลข serial ดิบ) เมื่อคอลัมน์ F
 *  เป็นเซลล์ที่ Google Sheets จัดรูปแบบเป็นวันที่แล้ว (ยืนยันจากภาพชีต LegacyImport จริงที่ผู้ใช้วางไว้ — คอลัมน์ F
 *  แสดงเป็น "21/8/2569" ไม่ใช่เลขดิบแบบ "244123" เหมือนตอนอ่านจากไฟล์ Excel ตรงๆ) ต้องรองรับทั้ง 2 กรณี ไม่งั้น
 *  Number(dateObject) จะได้ epoch milliseconds มาคำนวณผิดทั้งหมด */
function correctLegacyReceivedDate_(serial) {
  if (!serial) return null;
  var d;
  if (serial instanceof Date) {
    if (isNaN(serial.getTime())) return null;
    d = new Date(serial.getTime());
  } else {
    if (isNaN(Number(serial))) return null;
    d = excelSerialToDate_(serial);
  }
  d.setFullYear(d.getFullYear() - 543);
  return d;
}

/**
 * แยก "ชื่อ - สกุล" เป็นคำนำหน้า/ชื่อ/นามสกุล — รู้จักเฉพาะคำนำหน้าที่พบบ่อย (นาย/นาง/นางสาว) เพราะคำนำหน้า
 * อื่น (ยศทหาร/ตำรวจ ฯลฯ) มีรูปแบบไม่คงที่พอจะแยกอัตโนมัติอย่างปลอดภัย (ห้าม Split ข้อความอัตโนมัติถ้าโครงสร้าง
 * ไม่แน่นอน — ตามที่ผู้ใช้กำหนด) กรณีแยกไม่ได้ คืน title_name ว่าง + first_name เป็นข้อความเต็ม ให้ผู้ใช้ตรวจสอบ
 * เองในชีต LegacyPreview ก่อน migrate จริง (ไม่ใช่ error บล็อก แค่ warning)
 */
function splitLegacyName_(fullName) {
  var name = String(fullName || '').trim().replace(/\s+/g, ' ');
  var knownPrefixes = ['นางสาว', 'นาย', 'นาง'];
  for (var i = 0; i < knownPrefixes.length; i++) {
    var prefix = knownPrefixes[i];
    if (name.indexOf(prefix) === 0) {
      var rest = name.slice(prefix.length).trim();
      var parts = rest.split(' ');
      return {
        title_name: prefix, first_name: parts[0] || '', last_name: parts.slice(1).join(' ') || '',
        splitOk: !!(parts[0] && parts.length > 1),
      };
    }
  }
  return { title_name: '', first_name: name, last_name: '', splitOk: false };
}

/** แปลง "เดือน" (เช่น "2/69", "10/68", "68") เป็น report_period แบบ YYYY-MM (ค.ศ.) — คืน null ถ้าไม่มีเดือนชัดเจน
 *  (เช่น "68" เดี่ยวๆ) ห้ามเดาว่าเป็นเดือนอะไร ตามที่ผู้ใช้กำหนด — ปีในข้อมูลเป็น พ.ศ. 2 หลัก (69 = 2569 = ค.ศ.2026) */
function normalizeLegacyReportPeriod_(raw) {
  var s = String(raw || '').trim();
  var m = s.match(/^(\d{1,2})\/(\d{2})$/);
  if (!m) return null;
  var month = Number(m[1]);
  var beYear = 2500 + Number(m[2]);
  var ceYear = beYear - 543;
  if (month < 1 || month > 12) return null;
  return ceYear + '-' + (month < 10 ? '0' + month : String(month));
}

/** index station_order (string, เช่น "8.3") -> แถว WorkflowStates — ปัดเศษค่าตัวเลขจาก Sheet ให้เหลือทศนิยม 1
 *  ตำแหน่งเสมอ (กัน floating-point เพี้ยนเช่น 8.3000000000000007 ที่เจอจริงในข้อมูลต้นฉบับ) */
function buildLegacyStationOrderIndex_(ss) {
  var stations = readSheetAsObjects_(ss.getSheetByName(SHEET.WORKFLOW_STATES));
  var index = {};
  stations.forEach(function (s) { index[String(s.station_order)] = s; });
  return index;
}
function normalizeLegacyStateCode_(raw) {
  if (raw === '' || raw === null || raw === undefined) return '';
  var n = Number(raw);
  if (isNaN(n)) return String(raw).trim();
  return String(Math.round(n * 10) / 10);
}

/** ตรวจ 1 แถวดิบจาก LegacyImport -> { mapped:{...}, issues:[...] } — issues ว่าง = พร้อม import, ไม่ว่าง = ต้องดู LegacyPreview */
function analyzeLegacyRow_(ss, row, positionRows, stationOrderIndex, provinceList) {
  var issues = [];
  var nameParts = splitLegacyName_(row[LEGACY_COL_.NAME]);
  if (!nameParts.splitOk) issues.push('แยกคำนำหน้า/ชื่อ/นามสกุลอัตโนมัติไม่ได้ชัดเจน (ตรวจสอบด้วยตนเอง)');

  var positionRaw = String(row[LEGACY_COL_.POSITION] || '').trim();
  var positionRow = positionRows.filter(function (p) { return p.position_name === positionRaw; })[0];
  if (!positionRow) issues.push('ตำแหน่ง "' + positionRaw + '" ไม่พบใน MasterPositions');

  var specialtyRaw = String(row[LEGACY_COL_.SPECIALTY] || '').trim();
  // ไม่ตรวจ specialty กับ MasterSpecialties เข้มงวด (ข้อมูลเก่ามีสะกดไม่ตรง เช่น "การบริการทางวิชาการ" vs
  // "บริการทางวิชาการ") — เก็บค่าดิบไว้ก่อน ให้ผู้ใช้ตรวจ/แก้ MasterSpecialties เองถ้าต้องการภายหลัง ไม่บล็อก import

  var provinceRaw = String(row[LEGACY_COL_.PROVINCE] || '').trim();
  if (provinceList.indexOf(provinceRaw) === -1) issues.push('จังหวัด "' + provinceRaw + '" ไม่ตรงกับ 7 จังหวัดเขต 11 ที่ตั้งไว้ (สะกดผิด/พิมพ์ชื่อหน่วยงานแทน?)');

  var receivedDate = correctLegacyReceivedDate_(row[LEGACY_COL_.RECEIVED]);
  if (!receivedDate) issues.push('วันที่ลงรับไม่ใช่ตัวเลข/แปลงไม่ได้: ' + JSON.stringify(row[LEGACY_COL_.RECEIVED]));

  var stateCode = normalizeLegacyStateCode_(row[LEGACY_COL_.STATE]);
  var mappedStation = null;
  var isTerminated = false;
  if (stateCode === '0') {
    isTerminated = true;
  } else if (stationOrderIndex[stateCode]) {
    mappedStation = stationOrderIndex[stateCode];
  } else {
    issues.push('สถานะ "' + row[LEGACY_COL_.STATE] + '" ไม่ตรงกับ station_order ใดใน WorkflowStates และไม่ใช่ "0"');
  }

  var secretaryRaw = String(row[LEGACY_COL_.SECRETARY] || '').trim();
  var secretary = '';
  if (secretaryRaw === '(รอข้อมูล)' || !secretaryRaw) {
    secretary = ''; // เว้นว่าง = แสดง "รอกำหนดเลขานุการ" ที่ UI (ไม่ใช่ชื่อคน)
  } else if (secretaryRaw === 'ขอถอนคืน') {
    issues.push('คอลัมน์เลขาระบุ "ขอถอนคืน" (ไม่ใช่ชื่อคน) — ตรวจสอบว่ารายการนี้ถอนเรื่องจริงหรือไม่ก่อน import');
    secretary = '';
  } else {
    secretary = secretaryRaw;
  }

  var reportPeriod = normalizeLegacyReportPeriod_(row[LEGACY_COL_.MONTH]);
  if (!reportPeriod) issues.push('คอลัมน์เดือน "' + row[LEGACY_COL_.MONTH] + '" ไม่ชัดเจนพอจะระบุเดือน (ไม่ normalize เป็น YYYY-MM ให้ ต้องตรวจสอบเอง)');

  var orgPosition = String(row[LEGACY_COL_.ORG_POSITION] || '').trim();

  return {
    legacy_seq: String(row[LEGACY_COL_.SEQ] || '').trim(),
    title_name: nameParts.title_name, first_name: nameParts.first_name, last_name: nameParts.last_name,
    position: positionRow ? positionRow.position_name : positionRaw,
    specialty: specialtyRaw,
    province: provinceRaw,
    received_date: receivedDate,
    legacy_team: String(row[LEGACY_COL_.TEAM] || '').trim(),
    secretary: secretary,
    requested_org_position: orgPosition,
    // org_from ใช้ requested_org_position เป็นค่าเริ่มต้น (ข้อความเต็มจากคอลัมน์ I) เพราะข้อมูลเก่าไม่มีคอลัมน์
    // "หน่วยงานต้นสังกัดผู้ยื่น" แยกต่างหาก — จำเป็นสำหรับ resolveResponsibleOrg_ กรณี state ที่ใช้ ORG_FROM
    // (ส่วนใหญ่ import เป็น state 10/terminated ที่ไม่ผ่านจุดนี้แล้ว ผลกระทบจริงต่ำ)
    org_from: orgPosition,
    report_period: reportPeriod,
    station_key: isTerminated ? 's1' : (mappedStation ? mappedStation.station_key : ''),
    current_status_public: isTerminated ? 'terminated' : (mappedStation ? mappedStation.public_status : ''),
    current_owner_org: isTerminated ? 'สนง เขต' : (mappedStation ? resolveResponsibleOrg_(mappedStation, { org_from: orgPosition }) : ''),
    next_step_text: mappedStation ? (mappedStation.public_hint || '') : '',
    issues: issues,
  };
}

/** ขั้นที่ 1: วิเคราะห์ชีต LegacyImport แบบสด (ไม่แก้อะไร) — log สรุปจำนวน/ค่าที่พบต่อคอลัมน์ ตามที่ผู้ใช้ขอ (ข้อ 29) */
function analyzeLegacySheet() {
  var ss = getSpreadsheet_();
  var rows = readLegacySheetRaw_(ss);
  Logger.log('=== analyzeLegacySheet: พบ ' + rows.length + ' แถว (ชื่อ-สกุลไม่ว่าง) ===');

  function distinctCounts(colIdx, label) {
    var counts = {};
    rows.forEach(function (r) {
      var v = String(r[colIdx] === undefined || r[colIdx] === null || r[colIdx] === '' ? '(ว่าง)' : r[colIdx]).trim() || '(ว่าง)';
      counts[v] = (counts[v] || 0) + 1;
    });
    var lines = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; })
      .map(function (k) { return counts[k] + 'x ' + k; });
    Logger.log(label + ' (' + Object.keys(counts).length + ' ค่าต่าง): ' + lines.join(' | '));
  }

  distinctCounts(LEGACY_COL_.POSITION, 'ตำแหน่ง');
  distinctCounts(LEGACY_COL_.SPECIALTY, 'ด้าน');
  distinctCounts(LEGACY_COL_.PROVINCE, 'จังหวัด');
  distinctCounts(LEGACY_COL_.SECRETARY, 'เลขา');
  distinctCounts(LEGACY_COL_.MONTH, 'เดือน');
  distinctCounts(LEGACY_COL_.STATE, 'สถานะ');

  var seqCounts = {};
  rows.forEach(function (r) { var v = String(r[LEGACY_COL_.SEQ]); seqCounts[v] = (seqCounts[v] || 0) + 1; });
  var dupSeq = Object.keys(seqCounts).filter(function (k) { return seqCounts[k] > 1; });
  Logger.log('ลำดับซ้ำ: ' + (dupSeq.length ? dupSeq.join(', ') : 'ไม่มี'));

  var nameCounts = {};
  rows.forEach(function (r) { var v = String(r[LEGACY_COL_.NAME]).trim(); nameCounts[v] = (nameCounts[v] || 0) + 1; });
  var dupNames = Object.keys(nameCounts).filter(function (k) { return nameCounts[k] > 1; });
  Logger.log('ชื่อ-สกุลซ้ำ (ต้องตรวจว่าเป็นคนละผลงานจริงหรือกรอกซ้ำ — ดู section 30): ' + (dupNames.length ? dupNames.join(', ') : 'ไม่มี'));
}

/** ขั้นที่ 2: ตรวจความถูกต้องทีละแถว (ไม่แก้อะไร) — log จำนวนแถวที่พร้อม import / ที่มีปัญหา + รายละเอียด */
function validateLegacyData() {
  var ss = getSpreadsheet_();
  var rows = readLegacySheetRaw_(ss);
  var positionRows = getActiveMasterRows_(ss, SHEET.MASTER_POSITIONS);
  var stationOrderIndex = buildLegacyStationOrderIndex_(ss);
  var provinceList = getSettingList_(ss, 'district11_provinces', []);

  var clean = 0, flagged = 0;
  rows.forEach(function (row) {
    var result = analyzeLegacyRow_(ss, row, positionRows, stationOrderIndex, provinceList);
    if (result.issues.length) {
      flagged++;
      Logger.log('แถวลำดับ ' + result.legacy_seq + ' (' + row[LEGACY_COL_.NAME] + '): ' + result.issues.join(' / '));
    } else {
      clean++;
    }
  });
  Logger.log('=== validateLegacyData สรุป: พร้อม import ' + clean + ' แถว, มีข้อสงสัยต้องตรวจ ' + flagged + ' แถว (จากทั้งหมด ' + rows.length + ') ===');
}

/**
 * ขั้นที่ 3: สร้างชีต LegacyPreview แสดงค่าที่ "จะ" ถูก import จริงทุกแถว + issues — ไม่แตะ Works/StatusHistory เลย
 * ให้ตรวจสอบในชีตนี้ก่อนรัน migrateLegacyRegistrations() จริง (ปลอดภัยรันซ้ำได้ — ล้าง LegacyPreview เดิมทุกครั้ง)
 */
function previewLegacyMigration() {
  var ss = getSpreadsheet_();
  var rows = readLegacySheetRaw_(ss);
  var positionRows = getActiveMasterRows_(ss, SHEET.MASTER_POSITIONS);
  var stationOrderIndex = buildLegacyStationOrderIndex_(ss);
  var provinceList = getSettingList_(ss, 'district11_provinces', []);

  var previewSheet = ss.getSheetByName(LEGACY_PREVIEW_SHEET_NAME_);
  if (previewSheet) { ss.deleteSheet(previewSheet); }
  previewSheet = ss.insertSheet(LEGACY_PREVIEW_SHEET_NAME_);
  var headers = ['legacy_seq', 'title_name', 'first_name', 'last_name', 'position', 'specialty', 'province',
    'received_date (แก้ปีแล้ว)', 'secretary', 'requested_org_position', 'report_period', 'station_key', 'current_status_public', 'issues'];
  previewSheet.appendRow(headers);
  previewSheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');

  var clean = 0;
  rows.forEach(function (row) {
    var r = analyzeLegacyRow_(ss, row, positionRows, stationOrderIndex, provinceList);
    if (!r.issues.length) clean++;
    previewSheet.appendRow([
      r.legacy_seq, r.title_name, r.first_name, r.last_name, r.position, r.specialty, r.province,
      r.received_date ? formatDateTh_(r.received_date) : '(แปลงไม่ได้)', r.secretary || '(รอกำหนด)',
      r.requested_org_position, r.report_period || '(ไม่ชัดเจน)', r.station_key, r.current_status_public,
      r.issues.join(' / '),
    ]);
  });
  previewSheet.setFrozenRows(1);
  Logger.log('=== previewLegacyMigration เสร็จ — ดูผลที่ชีต "' + LEGACY_PREVIEW_SHEET_NAME_ + '" (' + rows.length +
    ' แถว, พร้อม import จริง ' + clean + ' แถว) ตรวจสอบให้ครบก่อนรัน migrateLegacyRegistrations()');
}

/**
 * ขั้นที่ 4 (รันเองเท่านั้น หลังตรวจ LegacyPreview แล้ว — ห้ามเรียกจากฟังก์ชันอื่นอัตโนมัติ): นำเข้าจริง
 * ข้าม legacy_seq ที่เคย import ไปแล้ว (กันซ้ำ รันซ้ำได้ปลอดภัย) ข้ามแถวที่มี issues ระดับ "บล็อก" (ตำแหน่ง/สถานะ
 * ไม่ตรง Master — แก้ต้นทางแล้ว rerun ใหม่ได้) แถวที่มีแค่ warning (แยกชื่อไม่ชัด/เดือนไม่ชัด) ยัง import ปกติ
 * สร้าง StatusHistory 1 รายการต่องาน action='INITIAL_IMPORT' เท่านั้น (ห้ามเดา State History ก่อนหน้า)
 */
function migrateLegacyRegistrations() {
  var ss = getSpreadsheet_();
  var rows = readLegacySheetRaw_(ss);
  var positionRows = getActiveMasterRows_(ss, SHEET.MASTER_POSITIONS);
  var stationOrderIndex = buildLegacyStationOrderIndex_(ss);
  var provinceList = getSettingList_(ss, 'district11_provinces', []);

  var existingSeqs = {};
  readSheetAsObjects_(ss.getSheetByName(SHEET.WORKS)).forEach(function (w) {
    if (w.legacy_seq) existingSeqs[String(w.legacy_seq)] = true;
  });

  var worksSheet = ss.getSheetByName(SHEET.WORKS);
  var historySheet = ss.getSheetByName(SHEET.STATUS_HISTORY);
  var imported = 0, skippedDup = 0, skippedBlocked = 0;
  var nowTs = now_();

  rows.forEach(function (row) {
    var r = analyzeLegacyRow_(ss, row, positionRows, stationOrderIndex, provinceList);
    if (existingSeqs[r.legacy_seq]) { skippedDup++; return; }
    // บล็อก import เฉพาะกรณีข้อมูลจำเป็นจริงขาด/map ไม่ได้ (ตำแหน่ง, สถานะ, วันที่) — เดือน/แยกชื่อไม่ชัด/เลขาพิเศษ
    // ยัง import ได้ (แค่ต้องตรวจแก้ทีหลังในระบบ ไม่ใช่ข้อมูลเสียที่ import ไม่ได้เลย)
    var hasBlockingIssue = !r.station_key || !r.received_date ||
      !positionRows.some(function (p) { return p.position_name === r.position; });
    if (hasBlockingIssue) { skippedBlocked++; Logger.log('ข้ามลำดับ ' + r.legacy_seq + ' (ยังมีปัญหาบล็อก): ' + r.issues.join(' / ')); return; }

    var workId = Utilities.getUuid();
    var trackingNo = nextTrackingNo_(ss);
    var qrToken = generateUniqueQrToken_(ss);

    appendRowByHeader_(worksSheet, SHEET_HEADERS[SHEET.WORKS], {
      work_id: workId, tracking_no: trackingNo, qr_token: qrToken,
      citizen_id_last4: '', citizen_id_encrypted: '', citizen_id_hash: '',
      title_name: r.title_name, first_name: r.first_name, last_name: r.last_name,
      position: r.position, current_level: '', requested_level: '',
      work_type: '', work_title: '', org_from: r.org_from, phone: '', email: '', cover_image_url: '',
      received_date: r.received_date,
      current_station_key: r.station_key, current_status_public: r.current_status_public,
      handoff_pending: false, current_owner_org: r.current_owner_org, current_handler_name: '',
      updated_at: nowTs, next_step_text: r.next_step_text,
      created_by: LEGACY_IMPORT_MARKER_, created_at: nowTs, evaluation_result: '',
      position_no: '', medical_domain: '', medical_specialty: '', province: r.province, specialty: r.specialty,
      secretary: r.secretary, requested_org_position: r.requested_org_position, report_period: r.report_period || '',
      legacy_seq: r.legacy_seq, legacy_team: r.legacy_team,
    });

    appendRowByHeader_(historySheet, SHEET_HEADERS[SHEET.STATUS_HISTORY], {
      history_id: Utilities.getUuid(), work_id: workId, tracking_no: trackingNo, action: 'INITIAL_IMPORT',
      from_station: '', to_station: r.station_key, from_org: '', to_org: r.current_owner_org,
      action_by: LEGACY_IMPORT_MARKER_, action_by_org: '', action_date: nowTs,
      note: 'นำเข้าจากข้อมูลเดิม (ลำดับเดิม: ' + r.legacy_seq + ', วันที่ลงรับจริง: ' + formatDateTh_(r.received_date) + ')',
      revision_reasons: '', revision_due_date: '', attachment_url: '', created_at: nowTs,
    });
    imported++;
  });

  Logger.log('=== migrateLegacyRegistrations เสร็จ — import สำเร็จ ' + imported + ' รายการ, ข้าม (เคย import แล้ว) ' +
    skippedDup + ' รายการ, ข้าม (ยังมีปัญหาบล็อก) ' + skippedBlocked + ' รายการ ===');
}

/** เครื่องหมายกำกับแถวที่มาจากการ import ข้อมูลเก่า (ใช้ใน created_by/action_by) — ค้นหา/ลบทดสอบภายหลังได้ง่าย */
var LEGACY_IMPORT_MARKER_ = 'legacy-import@system';
