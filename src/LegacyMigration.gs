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
 *  รองรับ 3 รูปแบบ input เท่าที่เจอจริงในชีต LegacyImport ของผู้ใช้ (ทุกแบบมาจากข้อมูล 244 แถวเดียวกัน แค่
 *  paste/format แต่ละแถวเข้า Google Sheets ไม่เหมือนกัน — ยืนยันจากภาพจริงทุกกรณี):
 *   1) JS Date object — เมื่อเซลล์ถูก Sheets จัดรูปแบบเป็นวันที่ (2026-09-21 เจอจริง คอลัมน์ F แสดง "21/8/2569")
 *   2) ข้อความ "D/M/YYYY" ล้วนๆ — เมื่อเซลล์ยังเป็น plain text (2026-09-21 เจอจริงจาก LegacyPreview.issues
 *      รายงาน "วันที่ลงรับไม่ใช่ตัวเลข/แปลงไม่ได้: '20/8/2569'" ทำให้ ~173/244 แถวถูกบล็อกไปก่อนแก้จุดนี้)
 *   3) เลข serial ดิบแบบ Excel (เช่น 244123) — เมื่ออ่านจากไฟล์ .xlsx ตรงๆ ไม่ผ่าน Google Sheets paste เลย */
function correctLegacyReceivedDate_(serial) {
  if (!serial) return null;
  var d;
  if (serial instanceof Date) {
    if (isNaN(serial.getTime())) return null;
    d = new Date(serial.getTime());
  } else {
    var text = String(serial).trim();
    var textMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (textMatch) {
      var day = Number(textMatch[1]), month = Number(textMatch[2]), year = Number(textMatch[3]);
      d = new Date(year, month - 1, day);
      // new Date() ปัดเดือน/วันเกินขอบเขตข้ามไปเดือนถัดไปเงียบๆ (เช่น 31/4 -> 1 พ.ค.) เช็คย้อนกลับกันข้อมูลเพี้ยน
      if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
    } else if (!isNaN(Number(serial))) {
      d = excelSerialToDate_(serial);
    } else {
      return null;
    }
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
    // 2026-09-24: เขียนเลขทะเบียนที่ถูกต้องตั้งแต่ตอน import เลย (ไม่พึ่ง nextTrackingNo_ ซึ่งเป็นตัวนับของงานใหม่
    // ไม่เกี่ยวกับ legacy_seq เลย) — สาเหตุหลักที่ข้อมูลเสียหลายรอบก่อนหน้าคือเขียนเลขทะเบียนผิดตั้งแต่ต้น แล้วต้อง
    // พึ่ง migrateFixLegacyTrackingNo() แก้ทีหลัง ซึ่งพลาดไปหลายรอบ (ดู auditLegacyCleanupPlan ผลจริง 2026-09-24)
    var trackingNo = shortBuddhistYear_(getBuddhistYear_(new Date(r.received_date))) + '-' + padLeft_(r.legacy_seq, 3);
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

/**
 * แก้เลขทะเบียนของงาน Legacy (import จาก Excel 244 ราย) ย้อนหลังให้เป็นรูปแบบ "<ปี พ.ศ. 2 หลัก>-<legacy_seq pad 3 หลัก>"
 * เช่น "68-004" ให้ตรงกับเลขลำดับในไฟล์ Excel เดิม (2026-09-23/24 ตามที่ผู้ใช้ขอ) — migrateLegacyRegistrations()
 * เดิมใช้ nextTrackingNo_() ตัวเดียวกับงานใหม่ ทำให้เลขทะเบียนไม่ตรงกับ Excel เลย
 *
 * ปีที่ใช้ = ปี พ.ศ. ของ received_date จริง (แก้ 543 ปีแล้ว) ของแต่ละแถว ไม่ใช่ปีปัจจุบัน — ยืนยันจากข้อมูลจริงว่า
 * legacy_seq เรียงตามปีอยู่แล้วเป๊ะไม่มีคาบเกี่ยว (สแกน 1อวช140969.xlsx: ลำดับ 1-33 = พ.ศ.2568, 34-244 = พ.ศ.2569)
 *
 * หลังแก้ tracking_no ของ Works+StatusHistory ทุกแถวแล้ว เลื่อน last_seq_<ปีเต็ม> (ตัวนับของงานใหม่ที่
 * nextTrackingNo_ ใช้ — เก็บปีเต็ม 4 หลักภายในเสมอ กันชนข้ามศตวรรษ แม้ตอนแสดงจะตัดเหลือ 2 หลัก) ให้ไม่ต่ำกว่า
 * legacy_seq สูงสุดของปีนั้น กันชนเลขทะเบียนกับงานใหม่ที่จะออกในปีเดียวกันต่อจากนี้ — ไม่ลดค่าเดิมถ้าสูงกว่าอยู่แล้ว
 * (เผื่อมีงานใหม่จริงออกเลขไปก่อนรันฟังก์ชันนี้) ปลอดภัยรันซ้ำได้ (deterministic ล้วน)
 */
function migrateFixLegacyTrackingNo() {
  var ss = getSpreadsheet_();
  var worksSheet = ss.getSheetByName(SHEET.WORKS);
  var historySheet = ss.getSheetByName(SHEET.STATUS_HISTORY);
  var legacyWorks = readSheetAsObjects_(worksSheet).filter(function (w) {
    return w.created_by === LEGACY_IMPORT_MARKER_ && w.legacy_seq;
  });

  var oldToNew = {}; // work_id -> เลขทะเบียนใหม่ (ใช้แก้ StatusHistory ต่อ)
  var maxSeqByYear = {};
  var fixed = 0;

  legacyWorks.forEach(function (w) {
    var year = getBuddhistYear_(new Date(w.received_date));
    var newTrackingNo = shortBuddhistYear_(year) + '-' + padLeft_(w.legacy_seq, 3);
    if (String(w.tracking_no) !== newTrackingNo) {
      updateSheetRowByKey_(worksSheet, 'work_id', w.work_id, { tracking_no: newTrackingNo });
      fixed++;
    }
    oldToNew[w.work_id] = newTrackingNo;
    var seqNum = Number(w.legacy_seq);
    if (!isNaN(seqNum)) maxSeqByYear[year] = Math.max(maxSeqByYear[year] || 0, seqNum);
  });

  // อัปเดต tracking_no ทุกแถวใน StatusHistory ที่อ้างถึง work_id เหล่านี้ (ปกติมีแค่ INITIAL_IMPORT 1 แถวต่องาน
  // แต่เผื่อมีคน action งานนี้ต่อไปแล้วหลัง migrate ก็ต้องแก้ให้ครบทุกแถว ไม่ใช่แค่แถวแรก)
  var historyHeaders = SHEET_HEADERS[SHEET.STATUS_HISTORY];
  var workIdCol = historyHeaders.indexOf('work_id') + 1;
  var trackingCol = historyHeaders.indexOf('tracking_no') + 1;
  var historyLastRow = historySheet.getLastRow();
  var historyUpdated = 0;
  if (historyLastRow >= 2) {
    var historyData = historySheet.getRange(2, 1, historyLastRow - 1, historySheet.getLastColumn()).getValues();
    for (var i = 0; i < historyData.length; i++) {
      var newNo = oldToNew[historyData[i][workIdCol - 1]];
      if (newNo && String(historyData[i][trackingCol - 1]) !== newNo) {
        historySheet.getRange(i + 2, trackingCol).setValue(newNo);
        historyUpdated++;
      }
    }
  }

  Object.keys(maxSeqByYear).forEach(function (year) {
    var seqKey = 'last_seq_' + year;
    var current = Number(getSetting_(ss, seqKey, '0'));
    if (maxSeqByYear[year] > current) {
      setSetting_(ss, seqKey, String(maxSeqByYear[year]), 'เลขลำดับล่าสุดของปี ' + year + ' (ระบบเพิ่มอัตโนมัติ ห้ามแก้มือขณะมีคนใช้งาน)');
    }
  });

  Logger.log('=== migrateFixLegacyTrackingNo เสร็จ — แก้เลขทะเบียน Works ' + fixed + ' รายการ, StatusHistory ' +
    historyUpdated + ' แถว, เลื่อน last_seq_<ปี> ให้ไม่ต่ำกว่า: ' + JSON.stringify(maxSeqByYear) + ' ===');
}

/**
 * ตรวจสอบเลขทะเบียน (tracking_no) ทุกงานในระบบ แบบ read-only ไม่แก้อะไรเลย (2026-09-23) — ผู้ใช้พบว่า Registry
 * แสดงเลขทะเบียนบางรายการผิด เช่น "2569-4.3" ซึ่งตัวเลขท้าย "4.3" ตรงกับคอลัมน์ "ทีม" (legacy_team) ไม่ใช่
 * "ลำดับ" (legacy_seq) — โค้ด migrateFixLegacyTrackingNo() อ่าน legacy_seq ถูกจุดอยู่แล้ว (ตรวจโค้ดแล้ว) จึงต้อง
 * ดูข้อมูลจริงในชีตก่อนว่า legacy_seq ของแถวนั้นเก็บค่าอะไรจริงๆ — ฟังก์ชันนี้แค่รายงาน ไม่เขียนอะไรลงชีตทั้งสิ้น
 */
function auditRegistrationNumbers() {
  var ss = getSpreadsheet_();
  var works = readSheetAsObjects_(ss.getSheetByName(SHEET.WORKS));
  var total = works.length, blank = 0, malformed = 0, dupCount = 0;
  var seen = {};
  var legacyMismatches = [];

  works.forEach(function (w) {
    var no = String(w.tracking_no || '').trim();
    if (!no) { blank++; return; }
    if (seen[no]) { dupCount++; } else { seen[no] = true; }
    if (!/^\d+-\d+$/.test(no)) malformed++; // รูปแบบที่ถูกต้อง: <ปี>-<เลขลำดับล้วน> ไม่มีจุดทศนิยม/ตัวอักษร

    if (w.created_by === LEGACY_IMPORT_MARKER_ && w.legacy_seq) {
      var year = getBuddhistYear_(new Date(w.received_date));
      var expected = shortBuddhistYear_(year) + '-' + padLeft_(w.legacy_seq, 3);
      if (no !== expected) {
        legacyMismatches.push({
          name: (w.title_name + w.first_name + ' ' + w.last_name), current: no, expected: expected,
          legacy_seq: w.legacy_seq, legacy_team: w.legacy_team, work_id: w.work_id,
        });
      }
    }
  });

  Logger.log('=== auditRegistrationNumbers สรุป === ทั้งหมด: ' + total + ' | ว่าง: ' + blank + ' | ซ้ำ: ' + dupCount +
    ' | รูปแบบผิด (ไม่ใช่ ปี-เลขลำดับล้วน): ' + malformed);
  Logger.log('งาน Legacy ที่ tracking_no ปัจจุบันไม่ตรงกับที่คำนวณจาก legacy_seq: ' + legacyMismatches.length);
  legacyMismatches.slice(0, 30).forEach(function (m) {
    Logger.log(' - ' + m.name + ': ปัจจุบัน="' + m.current + '" ควรเป็น="' + m.expected + '" (legacy_seq="' +
      m.legacy_seq + '", legacy_team="' + m.legacy_team + '", work_id=' + m.work_id + ')');
  });
  if (legacyMismatches.length > 30) Logger.log('... และอีก ' + (legacyMismatches.length - 30) + ' รายการ (ตัดแสดงแค่ 30 แรก)');
}

/**
 * วิเคราะห์แผนล้างข้อมูล Legacy ที่เสีย (2026-09-24, read-only ล้วน ไม่แก้อะไรเลย) — auditRegistrationNumbers()
 * พบว่า Works มีงาน Legacy 349 แถว (ควรมีแค่ 244 ตามไฟล์ Excel จริง) ซ้ำ 310 แถว, legacy_seq เพี้ยนเป็นค่า
 * "ทีม" แทน "ลำดับ" จำนวนมาก — สาเหตุน่าจะมาจากการรัน migrateLegacyRegistrations() หลายรอบด้วยโค้ดคนละเวอร์ชัน
 * (คนละที่มา ไม่อยู่ใน git ที่ตรวจสอบได้) ทำให้ import ซ้ำซ้อนและ legacy_seq เพี้ยนในบางรอบ — โค้ดปัจจุบันตรวจแล้ว
 * ว่า map คอลัมน์ A(ลำดับ)/G(ทีม) ถูกต้อง จึงเสนอ "ลบของเสียแล้ว import ใหม่" แทนพยายามแก้ค่าที่เชื่อถือไม่ได้แล้ว
 *
 * แบ่งงาน Legacy ทั้งหมดเป็น 2 กลุ่ม:
 *  - "untouched" (StatusHistory มีแค่ INITIAL_IMPORT รายการเดียว ยังไม่มีใคร action ต่อ) — ปลอดภัยลบแล้ว
 *    import ใหม่จากศูนย์ด้วยโค้ดปัจจุบันได้
 *  - "touched" (มีคน action ต่อไปแล้ว จริง) — ห้ามลบเด็ดขาด ต้องแก้เฉพาะจุดแยกต่างหาก (เสียงานที่ทำไปแล้ว)
 */
function auditLegacyCleanupPlan() {
  var ss = getSpreadsheet_();
  var works = readSheetAsObjects_(ss.getSheetByName(SHEET.WORKS));
  var legacyWorks = works.filter(function (w) { return w.created_by === LEGACY_IMPORT_MARKER_; });

  var untouched = [], touched = [];
  legacyWorks.forEach(function (w) {
    var hist = getHistoryForWork_(ss, w.work_id);
    if (hist.length === 1 && hist[0].action === 'INITIAL_IMPORT') {
      untouched.push(w);
    } else {
      touched.push(w);
    }
  });

  var nameCount = {};
  legacyWorks.forEach(function (w) {
    var key = (w.title_name + w.first_name + ' ' + w.last_name).trim();
    nameCount[key] = (nameCount[key] || 0) + 1;
  });
  var uniqueNames = Object.keys(nameCount).length;
  var namesOverTwice = Object.keys(nameCount).filter(function (k) { return nameCount[k] > 2; });

  Logger.log('=== auditLegacyCleanupPlan สรุป === งาน Legacy ทั้งหมด: ' + legacyWorks.length +
    ' (ไฟล์ Excel จริงมี 244 รายการ) | ยังไม่มีใคร action ต่อ (ปลอดภัยลบ+import ใหม่): ' + untouched.length +
    ' | มีคน action ต่อแล้ว (ห้ามลบ ต้องแก้เฉพาะจุด): ' + touched.length);
  Logger.log('ชื่อไม่ซ้ำกัน: ' + uniqueNames + ' คน (ควรใกล้เคียง 244 — บางคนยื่นซ้ำจริงได้ เช่น ยกเลิกแล้วยื่นใหม่ ปกติไม่เกิน 2 ครั้ง/คน)');
  Logger.log('ชื่อที่ปรากฏมากกว่า 2 ครั้ง (ผิดปกติ น่าจะเป็นข้อมูลซ้ำจากการ import หลายรอบ): ' + namesOverTwice.length);
  namesOverTwice.slice(0, 20).forEach(function (n) {
    Logger.log(' - ' + n + ': ' + nameCount[n] + ' รายการ');
  });

  if (touched.length) {
    Logger.log('รายชื่องานที่มีคน action ต่อแล้ว (ต้องดูเป็นรายกรณี ห้ามลบอัตโนมัติ):');
    touched.slice(0, 30).forEach(function (w) {
      Logger.log(' - ' + (w.title_name + w.first_name + ' ' + w.last_name) + ' (work_id=' + w.work_id +
        ', tracking_no="' + w.tracking_no + '", legacy_seq="' + w.legacy_seq + '")');
    });
  }
}

/**
 * แก้ 1 รายการที่มีคน action ต่อไปแล้วจริง (นางสาวสุดาวัลย์ หมั่นเพียร) ที่ legacy_seq/tracking_no เพี้ยนเป็นค่า
 * "ทีม" (4.3) แทนลำดับจริง (2026-09-24 auditLegacyCleanupPlan ยืนยันเป็นรายเดียวที่มีคน action ต่อ ในทั้งหมด
 * 501 แถว) — ยืนยันจากไฟล์ 1อวช140969.xlsx ตรงๆ ว่าลำดับจริงคือ 147 (แถว: "147","นางสาวสุดาวัลย์ หมั่นเพียร",
 * "พยาบาลวิชาชีพ","การพยาบาล","กระบี่",244490,"4.3",...,"5/69","10") วันที่ลงรับ serial 244490 = พ.ศ.2569
 * ก่อนแก้ 543 ปี → เลขทะเบียนที่ถูกต้องคือ "69-147"
 *
 * งานนี้มีคน action ต่อไปแล้วจริง (ไม่ใช่แค่ INITIAL_IMPORT) จึงแก้เฉพาะจุดนี้แทนลบ+import ใหม่ (จะเสียงานที่ทำไป
 * แล้ว) — ต้องรันฟังก์ชันนี้ก่อน cleanupDuplicateLegacyImports()/migrateLegacyRegistrations() เสมอ (cleanup
 * เรียกฟังก์ชันนี้ให้อัตโนมัติอยู่แล้ว กันลืม) ปลอดภัยรันซ้ำได้ (idempotent เช็คค่าก่อนเขียน)
 */
function fixSudawanLegacyTrackingNo() {
  var ss = getSpreadsheet_();
  var workId = 'c3c20a5d-d909-484a-bf8d-a16bbb1d6d2e';
  var worksSheet = ss.getSheetByName(SHEET.WORKS);
  var w = findWorkById_(ss, workId);
  if (!w) { Logger.log('ไม่พบ work_id=' + workId + ' (อาจถูกแก้/ลบไปแล้วก่อนหน้า) — ข้าม'); return; }
  if (String(w.legacy_seq) === '147' && w.tracking_no === '69-147') {
    Logger.log('นางสาวสุดาวัลย์ หมั่นเพียร แก้ไปแล้ว (legacy_seq=147, tracking_no=69-147) — ข้าม (idempotent)');
    return;
  }
  updateSheetRowByKey_(worksSheet, 'work_id', workId, { legacy_seq: '147', tracking_no: '69-147' });

  var historySheet = ss.getSheetByName(SHEET.STATUS_HISTORY);
  var historyHeaders = SHEET_HEADERS[SHEET.STATUS_HISTORY];
  var workIdCol = historyHeaders.indexOf('work_id') + 1;
  var trackingCol = historyHeaders.indexOf('tracking_no') + 1;
  var lastRow = historySheet.getLastRow();
  var historyUpdated = 0;
  if (lastRow >= 2) {
    var data = historySheet.getRange(2, 1, lastRow - 1, historySheet.getLastColumn()).getValues();
    for (var i = 0; i < data.length; i++) {
      if (data[i][workIdCol - 1] === workId) { historySheet.getRange(i + 2, trackingCol).setValue('69-147'); historyUpdated++; }
    }
  }
  Logger.log('แก้นางสาวสุดาวัลย์ หมั่นเพียร (work_id=' + workId + ') เรียบร้อย: legacy_seq -> "147", tracking_no -> "69-147" (StatusHistory ' + historyUpdated + ' แถว)');
}

/**
 * ลบงาน Legacy ที่ซ้ำ/เสีย (ยังไม่มีใคร action ต่อเลย) ทิ้งทั้งหมด เตรียมให้ migrateLegacyRegistrations() import
 * ใหม่สะอาดจากศูนย์ (2026-09-24) — auditLegacyCleanupPlan() ยืนยันแล้วว่า 500/501 แถว Legacy ยังไม่มีใคร action
 * ต่อเลย (มีแค่ INITIAL_IMPORT รายการเดียว) ปลอดภัยลบได้ — เกิดจากการรัน migrateLegacyRegistrations() หลายรอบ
 * ด้วยโค้ดคนละเวอร์ชัน (ไม่อยู่ใน git ที่ตรวจสอบได้) ทำให้ import ซ้ำซ้อนและ legacy_seq เพี้ยน
 *
 * เรียก fixSudawanLegacyTrackingNo() ให้อัตโนมัติก่อนเสมอ (กันลืม) — ไม่งั้นแถวเดียวที่มีคน action ต่อแล้วจะไม่ถูก
 * ลบ (ถูกต้อง) แต่ legacy_seq ที่ยังเพี้ยนอยู่จะทำให้รอบ import ใหม่สร้างแถวซ้ำสำหรับคนนั้นอีก
 *
 * รันเองเท่านั้น ห้าม auto-run — หลังรันแล้วให้รัน migrateLegacyRegistrations() ต่อทันทีเพื่อ import 244 รายการ
 * ใหม่สะอาด (เลขทะเบียนถูกต้องตั้งแต่ตอน import เลย ไม่ต้องพึ่ง migrateFixLegacyTrackingNo() อีกแล้ว)
 */
function cleanupDuplicateLegacyImports() {
  fixSudawanLegacyTrackingNo();

  var ss = getSpreadsheet_();
  var worksSheet = ss.getSheetByName(SHEET.WORKS);
  var historySheet = ss.getSheetByName(SHEET.STATUS_HISTORY);
  var legacyWorks = readSheetAsObjects_(worksSheet).filter(function (w) { return w.created_by === LEGACY_IMPORT_MARKER_; });

  var toDelete = {};
  legacyWorks.forEach(function (w) {
    var hist = getHistoryForWork_(ss, w.work_id);
    if (hist.length === 1 && hist[0].action === 'INITIAL_IMPORT') toDelete[w.work_id] = true;
  });

  var worksHeaders = worksSheet.getRange(1, 1, 1, worksSheet.getLastColumn()).getValues()[0];
  var workIdColW = worksHeaders.indexOf('work_id') + 1;
  var deletedWorks = 0;
  for (var r = worksSheet.getLastRow(); r >= 2; r--) {
    if (toDelete[worksSheet.getRange(r, workIdColW).getValue()]) { worksSheet.deleteRow(r); deletedWorks++; }
  }

  var historyHeaders = historySheet.getRange(1, 1, 1, historySheet.getLastColumn()).getValues()[0];
  var workIdColH = historyHeaders.indexOf('work_id') + 1;
  var deletedHistory = 0;
  for (var r2 = historySheet.getLastRow(); r2 >= 2; r2--) {
    if (toDelete[historySheet.getRange(r2, workIdColH).getValue()]) { historySheet.deleteRow(r2); deletedHistory++; }
  }

  Logger.log('=== cleanupDuplicateLegacyImports เสร็จ — ลบ Works ' + deletedWorks + ' แถว, StatusHistory ' +
    deletedHistory + ' แถว (เฉพาะงาน Legacy ที่ยังไม่มีใคร action ต่อเลย) — รัน migrateLegacyRegistrations() ต่อได้เลย ===');
}

/** เครื่องหมายกำกับแถวที่มาจากการ import ข้อมูลเก่า (ใช้ใน created_by/action_by) — ค้นหา/ลบทดสอบภายหลังได้ง่าย */
var LEGACY_IMPORT_MARKER_ = 'legacy-import@system';

/**
 * Debug เจาะจง 1 แถว LegacyImport ตาม legacy_seq (2026-10-08, read-only ล้วน ไม่แก้อะไรเลย) — ผู้ใช้รันแก้ไป
 * แล้ว (fixReceiveDatesFromLegacyExcel) แต่ 69-176 กลับได้ "6 ธ.ค. 2569" แทน "12 มิ.ย. 2569" ที่ถูกต้อง — สลับ
 * วัน/เดือนกันตรงๆ (6/12 แทน 12/6) ต้องสงสัยว่า correctLegacyReceivedDate_() สาขา "serial instanceof Date"
 * (เมื่อเซลล์ถูก Sheets จัดรูปแบบเป็นวันที่แล้ว) เชื่อ Date.getMonth()/getDate() ตรงๆ โดยไม่ตรวจว่า Google
 * Sheets ตีความ "12/6/2569" เป็น mm/dd (locale US) แทน dd/mm จริงหรือไม่ — ฟังก์ชันนี้ log ค่าดิบทุกมุมมอง
 * (serial/ประเภทข้อมูล/ข้อความที่ Sheets แสดงจริงด้วย getDisplayValues()/locale ของ spreadsheet) เทียบกับค่าที่
 * correctLegacyReceivedDate_() คำนวณได้ตอนนี้ ให้เห็นหลักฐานชัดก่อนตัดสินใจแก้ parsing (กระทบข้อมูล Legacy
 * ทั้งหมดถ้าแก้ผิดอีกรอบ ห้ามเดาซ้ำ)
 */
function diagnoseLegacyReceivedDateRaw(legacySeq) {
  var ss = getSpreadsheet_();
  var sheet = findSheetLoose_(ss, LEGACY_SHEET_NAME_);
  if (!sheet) { Logger.log('ไม่พบชีต "' + LEGACY_SHEET_NAME_ + '"'); return; }
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2) { Logger.log('ชีต LegacyImport ไม่มีข้อมูล'); return; }
  var values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  var displays = sheet.getRange(2, 1, lastRow - 1, lastCol).getDisplayValues();

  var seq = String(legacySeq).trim();
  var rowIdx = -1;
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][LEGACY_COL_.SEQ] || '').trim() === seq) { rowIdx = i; break; }
  }
  if (rowIdx === -1) { Logger.log('ไม่พบ legacy_seq="' + seq + '" ใน LegacyImport'); return; }

  var rawValue = values[rowIdx][LEGACY_COL_.RECEIVED];
  var displayValue = displays[rowIdx][LEGACY_COL_.RECEIVED];
  var isDate = rawValue instanceof Date;

  Logger.log('=== diagnoseLegacyReceivedDateRaw legacy_seq="' + seq + '" (' + values[rowIdx][LEGACY_COL_.NAME] + ') ===');
  Logger.log('spreadsheet locale: ' + ss.getSpreadsheetLocale());
  Logger.log('raw value (getValues): ' + JSON.stringify(rawValue) + ' | typeof=' + typeof rawValue + ' | isDate=' + isDate +
    (isDate ? (' | ISOString=' + rawValue.toISOString() + ' | getDate()=' + rawValue.getDate() +
      ' | getMonth()+1=' + (rawValue.getMonth() + 1) + ' | getFullYear()=' + rawValue.getFullYear()) : ''));
  Logger.log('display value (getDisplayValues, ตามที่ตาเห็นจริงในชีต): "' + displayValue + '"');
  Logger.log('correctLegacyReceivedDate_() คำนวณได้ตอนนี้: ' + correctLegacyReceivedDate_(rawValue));

  var worksMatch = readSheetAsObjects_(ss.getSheetByName(SHEET.WORKS)).filter(function (w) { return String(w.legacy_seq) === seq; })[0];
  Logger.log('Works.received_date ปัจจุบัน (หลัง fix ที่รันไปแล้ว ถ้ามี): ' + (worksMatch ? worksMatch.received_date : '(ไม่พบใน Works)'));
  var backupSheet = ss.getSheetByName('ReceiveDateFixBackup');
  if (backupSheet) {
    var backupRow = readSheetAsObjects_(backupSheet).filter(function (r) { return r.tracking_no === (worksMatch && worksMatch.tracking_no); }).pop();
    Logger.log('ค่าก่อนแก้ (จาก ReceiveDateFixBackup, กู้คืนได้ถ้าต้องย้อนกลับ): ' + (backupRow ? backupRow.old_received_date : '(ไม่มี backup แถวนี้)'));
  }
}

/**
 * ตรวจสอบ Works.received_date ของงาน Legacy เทียบกับคอลัมน์ "วันที่ลงรับ" จริงในชีต LegacyImport (2026-10-08
 * ตามที่ผู้ใช้ขอ — read-only ล้วน ไม่แก้อะไรเลย) ผู้ใช้รายงาน 69-176 (นางสาวปิยะภรณ์ ศรีแก้ว) แสดงวันที่รับผลงาน
 * ผิด (24/09/2569) ทั้งที่ Excel ต้นฉบับระบุ "วันที่ลงรับ" = 12/6/2569 — ย้อนดู auditLegacyCleanupPlan()/
 * cleanupDuplicateLegacyImports() ด้านบนพบว่าข้อมูล Legacy เคยถูก import ซ้ำหลายรอบด้วยโค้ดหลายเวอร์ชันนอก git
 * มาก่อน (ไม่อยู่ใน git ที่ตรวจสอบได้) งานที่ "touched" (มีคน action ต่อแล้ว) ไม่ถูกลบ+import ใหม่ตอน cleanup —
 * received_date ของบางรายการจึงอาจค้างค่าผิดจากรอบ import เก่าที่ parsing ยังไม่สมบูรณ์ ฟังก์ชันนี้ compute ค่า
 * ที่ถูกต้องจาก LegacyImport สดด้วย correctLegacyReceivedDate_() ตัวเดียวกับที่ migrateLegacyRegistrations()
 * ใช้เป๊ะ (ไม่สร้าง parsing logic คู่ขนาน) จับคู่ด้วย legacy_seq (key เดียวกับที่ระบบใช้ตอน migrate มาตั้งแต่ต้น
 * ไม่ใช้เลขแถว Excel ตามที่ผู้ใช้กำชับ) แล้วเทียบกับค่าปัจจุบัน คืน { result, toFix } ให้
 * fixReceiveDatesFromLegacyExcel() เรียกซ้ำได้ (audit/update คนละฟังก์ชัน ไม่ปนกัน)
 */
function auditReceiveDates() {
  var ss = getSpreadsheet_();
  var legacyRows = readLegacySheetRaw_(ss);
  var works = readSheetAsObjects_(ss.getSheetByName(SHEET.WORKS)).filter(function (w) {
    return w.created_by === LEGACY_IMPORT_MARKER_ && w.legacy_seq;
  });

  // legacy_seq -> แถวดิบ LegacyImport ทั้งหมดที่ seq นี้ (เช็ค ambiguous ก่อนเชื่อ)
  var seqToRows = {};
  legacyRows.forEach(function (row) {
    var seq = String(row[LEGACY_COL_.SEQ] || '').trim();
    if (!seq) return;
    (seqToRows[seq] = seqToRows[seq] || []).push(row);
  });

  var result = { total: works.length, correct: 0, wrong: 0, empty: 0, noMatch: 0, ambiguous: 0, badFormat: 0 };
  var toFix = [];
  var mismatchRows = [];
  var problemRows = [];

  works.forEach(function (w) {
    var seq = String(w.legacy_seq);
    var name = (w.title_name + w.first_name + ' ' + w.last_name).trim();
    var matches = seqToRows[seq] || [];
    var currentDate = w.received_date ? new Date(w.received_date) : null;
    var hasCurrentDate = currentDate && !isNaN(currentDate.getTime());
    var currentStr = hasCurrentDate ? formatDateTh_(currentDate) : '(ว่าง)';

    if (!matches.length) {
      result.noMatch++;
      problemRows.push(w.tracking_no + ' ' + name + ': ไม่พบ legacy_seq="' + seq + '" ใน LegacyImport');
      return;
    }
    if (matches.length > 1) {
      result.ambiguous++;
      problemRows.push(w.tracking_no + ' ' + name + ': legacy_seq="' + seq + '" ซ้ำใน LegacyImport (' + matches.length + ' แถว) — ไม่แก้อัตโนมัติ');
      return;
    }

    var correctDate = correctLegacyReceivedDate_(matches[0][LEGACY_COL_.RECEIVED]);
    if (!correctDate) {
      result.badFormat++;
      problemRows.push(w.tracking_no + ' ' + name + ': วันที่ใน Excel แปลงไม่ได้ (' + JSON.stringify(matches[0][LEGACY_COL_.RECEIVED]) + ')');
      return;
    }

    var excelStr = formatDateTh_(correctDate);
    var sameDay = hasCurrentDate && currentDate.getFullYear() === correctDate.getFullYear() &&
      currentDate.getMonth() === correctDate.getMonth() && currentDate.getDate() === correctDate.getDate();
    if (sameDay) {
      result.correct++;
      return;
    }
    if (!hasCurrentDate) result.empty++; else result.wrong++;
    toFix.push({ work_id: w.work_id, tracking_no: w.tracking_no, name: name, old: currentStr, newDate: correctDate });
    mismatchRows.push(w.tracking_no + ' ' + name + ' | ปัจจุบัน: ' + currentStr + ' | Excel: ' + excelStr + ' | ควรเป็น: ' + excelStr);
  });

  Logger.log('=== auditReceiveDates สรุป === งาน Legacy ทั้งหมด: ' + result.total +
    ' | ตรงอยู่แล้ว: ' + result.correct + ' | ผิด (ต้องแก้): ' + result.wrong +
    ' | ว่าง (ต้องแก้): ' + result.empty + ' | ไม่พบใน LegacyImport: ' + result.noMatch +
    ' | legacy_seq ซ้ำใน LegacyImport (ambiguous): ' + result.ambiguous +
    ' | วันที่ใน Excel แปลงไม่ได้: ' + result.badFormat);
  Logger.log('รายการที่ต้องแก้ (' + toFix.length + ' รายการ) ตัวอย่าง 30 แรก:');
  mismatchRows.slice(0, 30).forEach(function (line) { Logger.log(' - ' + line); });
  if (mismatchRows.length > 30) Logger.log('... และอีก ' + (mismatchRows.length - 30) + ' รายการ (ตัดแสดงแค่ 30 แรก)');
  if (problemRows.length) {
    Logger.log('รายการที่ match ไม่ได้/ambiguous/format ผิด (' + problemRows.length + ' รายการ) ตัวอย่าง 30 แรก:');
    problemRows.slice(0, 30).forEach(function (line) { Logger.log(' - ' + line); });
  }

  return { result: result, toFix: toFix };
}

/**
 * Bulk-fix Works.received_date ของงาน Legacy ตามคอลัมน์ "วันที่ลงรับ" ใน LegacyImport (2026-10-08 ตามที่ผู้ใช้
 * ขอ) — เรียก auditReceiveDates() ซ้ำเพื่อหา toFix list เดียวกันเป๊ะ (ห้าม logic คู่ขนาน, audit/update แยก
 * ฟังก์ชันกันตามที่ผู้ใช้ขอ) แก้เฉพาะ Works.received_date เท่านั้น ห้ามแตะ StatusHistory เด็ดขาด (คนละความหมาย
 * กันตามที่ผู้ใช้กำชับ — StatusHistory.action_date/created_at ไม่ใช่วันที่ลงรับครั้งแรก) backup ค่าเดิมลงชีต
 * "ReceiveDateFixBackup" ก่อนเขียนทับทุกครั้ง (append-only ไม่ลบของเดิม รันกี่รอบก็ย้อนดูได้ครบ) เขียนด้วย
 * batch setValues() ครั้งเดียว (อ่านทั้งชีตมาแก้ในหน่วยความจำแล้วเขียนกลับทีเดียว) ไม่ loop setValue ทีละเซลล์
 * ปลอดภัยรันซ้ำได้ (idempotent — รอบสอง audit จะรายงาน "ตรงอยู่แล้ว" ทั้งหมด ไม่มีอะไรให้แก้) รันเองเท่านั้น
 * ห้าม auto-run
 */
function fixReceiveDatesFromLegacyExcel() {
  var ss = getSpreadsheet_();
  var audit = auditReceiveDates();
  var toFix = audit.toFix;
  if (!toFix.length) {
    Logger.log('=== fixReceiveDatesFromLegacyExcel: ไม่มีรายการต้องแก้ (received_date ตรงกับ LegacyImport หมดแล้ว) ===');
    return;
  }

  var worksSheet = ss.getSheetByName(SHEET.WORKS);
  var headers = worksSheet.getRange(1, 1, 1, worksSheet.getLastColumn()).getValues()[0];
  var workIdCol = headers.indexOf('work_id');
  var receivedCol = headers.indexOf('received_date');
  var lastRow = worksSheet.getLastRow();
  var data = worksSheet.getRange(2, 1, lastRow - 1, worksSheet.getLastColumn()).getValues();

  var rowByWorkId = {};
  data.forEach(function (row, i) { rowByWorkId[row[workIdCol]] = i; });

  // backup ค่าเดิมก่อนแก้ (append-only — ไม่เคยลบ/เขียนทับชีตนี้)
  var backupSheet = ss.getSheetByName('ReceiveDateFixBackup');
  if (!backupSheet) {
    backupSheet = ss.insertSheet('ReceiveDateFixBackup');
    backupSheet.appendRow(['fixed_at', 'work_id', 'tracking_no', 'name', 'old_received_date', 'new_received_date']);
    backupSheet.getRange(1, 1, 1, 6).setFontWeight('bold');
  }
  var nowTs = now_();
  var backupRows = toFix.map(function (f) {
    return [nowTs, f.work_id, f.tracking_no, f.name, f.old, formatDateTh_(f.newDate)];
  });
  backupSheet.getRange(backupSheet.getLastRow() + 1, 1, backupRows.length, 6).setValues(backupRows);

  // แก้ในหน่วยความจำก่อน แล้วเขียนกลับทั้งก้อนทีเดียว (batch — ไม่ loop setValue ทีละแถว)
  var fixed = 0;
  toFix.forEach(function (f) {
    var rowIdx = rowByWorkId[f.work_id];
    if (rowIdx === undefined) return; // ไม่ควรเกิด (audit อ่านจาก Works เหมือนกัน) กันพังไว้เฉยๆ
    data[rowIdx][receivedCol] = f.newDate;
    fixed++;
  });
  worksSheet.getRange(2, 1, data.length, headers.length).setValues(data);

  Logger.log('=== fixReceiveDatesFromLegacyExcel เสร็จ === แก้ received_date ' + fixed +
    ' รายการ (backup ค่าเดิมไว้ที่ชีต "ReceiveDateFixBackup" แล้ว) — StatusHistory ไม่ถูกแตะเลย');
}
