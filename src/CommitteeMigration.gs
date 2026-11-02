/**
 * นำเข้าโครงสร้างคณะกรรมการ/ประธาน/เลขานุการ/ผู้ช่วยเลขานุการ จาก Google Sheet ชุดล่าสุด (2026-09-16 รอบ 2) —
 * ชีต "CommitteeImport" (คัดลอกมาจากแท็บ "กรรมการ" ของไฟล์ 1อวช140969.xlsx โดยผู้ใช้เอง วางเป็นแท็บใหม่ใน
 * สเปรดชีตฐานข้อมูลจริง — ไม่มีชีตชื่อ "ประธาน"/"เลขา"/"เลขา2" อยู่ในระบบจริงมาก่อน จึงสร้างชีตใหม่คู่ขนานทั้งหมด
 * ไม่มีอะไรถูกทับ/ลบ) โครงสร้างต้นฉบับเป็นรายงาน 3 ชั้น ไม่ใช่ตารางเรียบ:
 *   (1) แถวหัวข้อวิชาชีพ "N. ตำแหน่ง...ชำนาญการพิเศษ" (คอลัมน์ A)
 *   (2) แถวหัวข้อคณะ "คณะที่ N [วิชาชีพ] (ด้าน... สาขา...)" + "ทีม N.M" (คอลัมน์ E) — วิชาชีพที่มีคณะเดียว
 *       (ไม่แบ่งย่อย) ไม่มีแถวนี้ ใช้ "ทีม N" ตรงแถวหัวข้อวิชาชีพแทน
 *   (3) แถวสมาชิก: ลำดับ(A), ชื่อ(B), นามสกุล(C), ตำแหน่ง/วุฒิบัตร(D), หน่วยงาน(E), บทบาท(F: ประธานกรรมการ/
 *       กรรมการ), ว่าง(G), ชื่อเลขา(H), ตำแหน่งเลขา(I), หน่วยงานเลขา(J), บทบาทเลขา(K: เลขานุการ/ผู้ช่วยเลขานุการ)
 *       — คอลัมน์ H-K กระจายไม่สม่ำเสมอ (ไม่ครบทุกแถวในคณะเดียวกัน) ต้องรวบรวมจากทุกแถวในคณะนั้น
 *
 * เลขวิชาชีพ (PROFESSION_BY_NUMBER_) ยืนยันจาก header จริงในไฟล์ (2026-09-15 export, 15 วิชาชีพ, 196 แถว) —
 * ไม่ใช่การเดา แก้ไขจากที่เข้าใจผิดก่อนหน้า (ทีม 4.x คือ "พยาบาลวิชาชีพ" ไม่ใช่ "นักจัดการงานทั่วไป")
 * วิชาชีพ 5,9,11,12,13 (นักรังสีการแพทย์/นักสาธารณสุข/นักวิชาการพัสดุ/นักวิชาการเงินและบัญชี/นักวิเคราะห์
 * นโยบายและแผน) ยังไม่มีใน MasterPositions ปัจจุบัน — เก็บเป็น text อิสระในรอบนี้ ไม่แตะ MasterPositions/ฟอร์ม
 * ลงทะเบียน (นอกขอบเขตที่ตกลงไว้รอบนี้)
 *
 * ลำดับการทำงาน (ห้ามข้ามขั้นตอน): analyzeCommitteeStructure() (+ analyzeChairData()/analyzeSecretaryData()/
 * analyzeSecretaryMapping() แยกดูเฉพาะส่วน) -> previewCommitteeMigration() (เขียนชีต CommitteeMigrationPreview
 * ให้ตรวจ ไม่แตะข้อมูลจริง) -> ผู้ใช้ตรวจสอบเอง -> migrateChairMaster()/migrateSecretaryMaster()/
 * migrateCommitteeSecretaryMap() (รันเองเท่านั้น ห้าม auto-run, ปลอดภัยรันซ้ำได้)
 */

var COMMITTEE_SHEET_NAME_ = 'CommitteeImport';
var COMMITTEE_PREVIEW_SHEET_NAME_ = 'CommitteeMigrationPreview';
var COMMITTEE_COL_ = { SEQ: 0, FIRST: 1, LAST: 2, TITLE: 3, ORG: 4, ROLE: 5, SEC_NAME: 7, SEC_POSITION: 8, SEC_ORG: 9, SEC_ROLE: 10 };

/** เลขวิชาชีพ -> ชื่อวิชาชีพ ยืนยันจาก header จริงในชีต "กรรมการ" (ไม่ใช่เดา — ดู docstring บนไฟล์) */
var PROFESSION_BY_NUMBER_ = {
  1: 'นายแพทย์', 2: 'ทันตแพทย์', 3: 'เภสัชกร', 4: 'พยาบาลวิชาชีพ', 5: 'นักรังสีการแพทย์',
  6: 'นักเทคนิคการแพทย์', 7: 'นักกายภาพบำบัด', 8: 'นักวิทยาศาสตร์การแพทย์', 9: 'นักสาธารณสุข',
  10: 'นักวิชาการสาธารณสุข', 11: 'นักวิชาการพัสดุ', 12: 'นักวิชาการเงินและบัญชี',
  13: 'นักวิเคราะห์นโยบายและแผน', 14: 'นักจัดการงานทั่วไป', 15: 'นักทรัพยากรบุคคล',
};

/** อ่านชีต CommitteeImport ทั้งชีตเป็น array of array ดิบ (A:K) */
function readCommitteeImportRaw_(ss) {
  var sheet = ss.getSheetByName(COMMITTEE_SHEET_NAME_);
  if (!sheet) throw new Error('ไม่พบชีต "' + COMMITTEE_SHEET_NAME_ + '" — คัดลอกแท็บ "กรรมการ" จาก Excel มาวางเป็นแท็บนี้ก่อน');
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 1) return [];
  return sheet.getRange(1, 1, lastRow, lastCol).getValues();
}

/** แยก "(ด้านX สาขาY)" หรือ "(ด้านX)" เป็น {field, specialty} — คืนค่าว่างทั้งคู่ถ้าไม่มีวงเล็บ */
function parseFieldSpecialtyText_(parenText) {
  if (!parenText) return { field: '', specialty: '' };
  var m = parenText.match(/ด้าน([^ก-๙]*[ก-๙\s-]*?)(?:\s*สาขา(.+))?$/);
  if (!m) return { field: parenText.trim(), specialty: '' };
  return { field: (m[1] || '').trim(), specialty: (m[2] || '').trim() };
}

/**
 * Parse CommitteeImport ทั้งชีตเป็น array ของกลุ่มคณะ — 1 กลุ่ม = 1 คณะจริง (มีได้ทั้งแบบแบ่งย่อย "คณะที่ N"
 * และแบบวิชาชีพเดียวไม่แบ่งย่อย) แต่ละกลุ่มมี chair (ประธาน), members (กรรมการ), secretaries (เลขา+ผู้ช่วย
 * รวมทุกแถวในกลุ่มเพราะข้อมูลกระจายไม่สม่ำเสมอ) — ไม่เขียนอะไร แค่ parse อย่างเดียว
 */
function buildCommitteeGroups_(rows) {
  var groups = [];
  var current = null;
  var currentProfessionNo = null;

  function startGroup(professionNo, subTeamText, teamNo, field, specialty) {
    current = {
      professionNo: professionNo,
      profession: PROFESSION_BY_NUMBER_[professionNo] || ('วิชาชีพลำดับ ' + professionNo + ' (ไม่พบชื่อ)'),
      subTeamText: subTeamText, teamNo: teamNo, field: field, specialty: specialty,
      chair: null, members: [], secretaries: [],
    };
    groups.push(current);
  }

  rows.forEach(function (r) {
    var a = String(r[0] || '').trim();

    var profMatch = a.match(/^(\d+)\.\s*ตำแหน่ง(.+?)ชำนาญการพิเศษ\s*$/);
    if (profMatch) {
      currentProfessionNo = Number(profMatch[1]);
      current = null; // รอแถว "คณะที่ N" หรือแถวสมาชิกโดยตรง (กรณีวิชาชีพเดียวไม่แบ่งย่อย — ดูด้านล่าง)
      return;
    }

    // team_no คำนวณจาก "เลขวิชาชีพ.เลขคณะย่อย" (ทั้งคู่เป็นจำนวนเต็มล้วนที่ parse จากข้อความหัวข้อได้แม่นยำ 100%)
    // ไม่พึ่งข้อความ "ทีม X.Y" ในคอลัมน์ E อีกต่อไป (2026-09-16 แก้บั๊กจริง) — คอลัมน์ E เก็บเป็น text "ทีม 1.10"
    // ในไฟล์ต้นฉบับจริง แต่หลังผู้ใช้คัดลอกผ่าน Excel/Google Sheets ไปวางในชีต CommitteeImport เจอค่าเพี้ยนเป็น
    // "1.1" (ตัดเลข 0 ท้ายทศนิยม) แม้ตั้ง numberFormat เป็น text ไว้ก่อนเขียนแล้วก็ตาม — คำนวณเองจาก int 2 ตัว
    // ที่เชื่อถือได้กว่าแทนเลย ไม่ต้องพึ่งข้อความคอลัมน์ E เลยสักจุด
    var committeeMatch = a.match(/^คณะที่\s*(\d+)(?:\s+(.+))?$/);
    if (committeeMatch && currentProfessionNo !== null) {
      var parenMatch = (committeeMatch[2] || '').match(/\(([^)]+)\)/);
      var fs = parseFieldSpecialtyText_(parenMatch ? parenMatch[1] : '');
      startGroup(currentProfessionNo, committeeMatch[1], currentProfessionNo + '.' + committeeMatch[1], fs.field, fs.specialty);
      return;
    }

    if (!current) {
      // ไม่มีแถว "คณะที่" มาก่อนเลย — ถ้าเจอแถวสมาชิก (ลำดับเป็นตัวเลขล้วน) แปลว่าวิชาชีพนี้มีคณะเดียว ไม่แบ่งย่อย
      // เปิดกลุ่มทันทีด้วย team_no = เลขวิชาชีพเฉยๆ (ไม่มีทศนิยม) ไม่ต้องอ่านคอลัมน์ E เช่นกัน
      if (currentProfessionNo !== null && /^\d+$/.test(a)) {
        startGroup(currentProfessionNo, '', String(currentProfessionNo), '', '');
      } else {
        return;
      }
    }
    var seq = a;
    if (!/^\d+$/.test(seq)) return; // ไม่ใช่แถวสมาชิก (เช่นแถวว่างคั่นกลาง)

    var memberName = (String(r[COMMITTEE_COL_.FIRST] || '').trim() + ' ' + String(r[COMMITTEE_COL_.LAST] || '').trim()).trim();
    var memberRole = String(r[COMMITTEE_COL_.ROLE] || '').trim();
    if (memberName) {
      if (memberRole === 'ประธานกรรมการ' && !current.chair) {
        current.chair = { name: memberName, position: String(r[COMMITTEE_COL_.TITLE] || '').trim(), org: String(r[COMMITTEE_COL_.ORG] || '').trim() };
      } else if (memberRole === 'กรรมการ') {
        current.members.push(memberName);
      }
    }
    var secName = String(r[COMMITTEE_COL_.SEC_NAME] || '').trim();
    var secRole = String(r[COMMITTEE_COL_.SEC_ROLE] || '').trim();
    if (secName && (secRole === 'เลขานุการ' || secRole === 'ผู้ช่วยเลขานุการ')) {
      current.secretaries.push({
        name: secName, position: String(r[COMMITTEE_COL_.SEC_POSITION] || '').trim(),
        org: String(r[COMMITTEE_COL_.SEC_ORG] || '').trim(), role: secRole,
      });
    }
  });

  return groups;
}

/** รหัสตำแหน่งจาก MasterPositions ถ้ามี ไม่งั้นใช้ PROF{N} (วิชาชีพที่ยังไม่มีใน MasterPositions) */
function committeeProfessionCode_(ss, professionNo, professionName) {
  var positions = getActiveMasterRows_(ss, SHEET.MASTER_POSITIONS);
  var match = positions.filter(function (p) { return p.position_name === professionName; })[0];
  return match ? match.position_code : ('PROF' + professionNo);
}

function committeeCode_(ss, group) {
  return committeeProfessionCode_(ss, group.professionNo, group.profession) + '-' + group.teamNo;
}

/**
 * เขียนค่า team_no ลงเซลล์เดียวแบบ Text บังคับ — ต้องเรียกทันทีหลัง appendRow ของแถวนั้น (ไม่ใช่ตั้ง format
 * ล่วงหน้าทั้งคอลัมน์แล้วค่อย appendRow) เพราะพิสูจน์แล้วจากข้อมูลจริงบน production (2026-09-16) ว่า
 * sheet.appendRow() ไม่เคารพ numberFormat '@' ที่ตั้งไว้ล่วงหน้า — Sheets auto-detect ค่าที่ appendRow เขียน
 * เป็นตัวเลขเสมอแล้วตัดเลข 0 ท้ายทิ้ง (เช่น "1.10" กลายเป็น 1.1 ชนกับคณะที่ 1.1 จริง) ทางเดียวที่ยืนยันได้ผลจริง
 * คือ setNumberFormat('@') แล้ว setValue() ต่อบน Range เดียวกันทันที (chain เดียวกัน ไม่ผ่าน appendRow)
 */
function writeTeamNoCell_(sheet, headers, row, teamNo) {
  var col = headers.indexOf('team_no') + 1;
  if (col > 0) sheet.getRange(row, col).setNumberFormat('@').setValue(String(teamNo));
}

/** key สำหรับกันเลขาซ้ำ (ห้ามใช้ชื่ออย่างเดียว — ตามที่ผู้ใช้กำหนด ข้อ 18) */
function secretaryDedupeKey_(name, position, org) {
  return [name, position, org].map(function (s) { return String(s || '').trim(); }).join('||');
}

/** map key เลขา (name+position+org) -> secretary_id ที่มีอยู่แล้วในชีต SecretaryMaster จริง (idempotent lookup)
 *  ensureSheet_ ก่อนเสมอ (ชีต production เดิมติดตั้งก่อนเพิ่ม SHEET.SECRETARY_MASTER — installSystem() เดิม
 *  ไม่เคยรันซ้ำหลังเพิ่ม key นี้ สร้างชีตไม่ทัน) กันพังตอนเรียกจาก preview/analyze ก่อนรัน migrate ครั้งแรก */
function buildExistingSecretaryIndex_(ss) {
  var index = {};
  var sheet = ensureSheet_(ss, SHEET.SECRETARY_MASTER, SHEET_HEADERS[SHEET.SECRETARY_MASTER]);
  readSheetAsObjects_(sheet).forEach(function (row) {
    index[secretaryDedupeKey_(row.name, row.position, row.organization)] = row.secretary_id;
  });
  return index;
}

/** ขั้นที่ 1a: วิเคราะห์ประธาน — log จำนวนคณะ/ประธาน unique/คณะที่ไม่มีชื่อจริง */
function analyzeChairData() {
  var ss = getSpreadsheet_();
  var groups = buildCommitteeGroups_(readCommitteeImportRaw_(ss));
  var uniqueChairs = {}; var noChairName = 0;
  groups.forEach(function (g) {
    if (!g.chair) { noChairName++; return; }
    // ชื่อที่เป็นตำแหน่งลอยๆ (ไม่มีชื่อจริง) เช่น "ผู้อำนวยการโรงพยาบาลสิชล" — ตรวจง่ายๆ ด้วยการไม่มีคำนำหน้า นาย/นาง/นางสาว
    var looksLikeTitleOnly = !/^(นาย|นาง|นางสาว)/.test(g.chair.name);
    if (looksLikeTitleOnly) noChairName++;
    uniqueChairs[g.chair.name] = true;
  });
  Logger.log('=== analyzeChairData: พบ ' + groups.length + ' คณะ, ประธาน unique ' + Object.keys(uniqueChairs).length +
    ' คน, คณะที่ประธานเป็นตำแหน่งลอยๆ ไม่มีชื่อจริง ' + noChairName + ' คณะ (จะเก็บ text ตำแหน่งไว้ใน chair_name ก่อน) ===');
}

/** ขั้นที่ 1b: วิเคราะห์เลขานุการ — log จำนวน unique (แยกเลขา/ผู้ช่วย) + รายชื่อซ้ำข้ามคณะ */
function analyzeSecretaryData() {
  var ss = getSpreadsheet_();
  var groups = buildCommitteeGroups_(readCommitteeImportRaw_(ss));
  var secretaries = {}, assistants = {};
  var countByName = {};
  groups.forEach(function (g) {
    g.secretaries.forEach(function (s) {
      var key = secretaryDedupeKey_(s.name, s.position, s.org);
      if (s.role === 'เลขานุการ') secretaries[key] = s; else assistants[key] = s;
      countByName[s.name] = (countByName[s.name] || 0) + 1;
    });
  });
  Logger.log('=== analyzeSecretaryData: เลขานุการ unique (name+position+org) ' + Object.keys(secretaries).length +
    ' คน, ผู้ช่วยเลขานุการ unique ' + Object.keys(assistants).length + ' คน ===');
  var dupNames = Object.keys(countByName).filter(function (n) { return countByName[n] > 1; });
  Logger.log('ชื่อที่ปรากฏมากกว่า 1 ครั้ง (ปกติ — คนเดียวดูแลหลายคณะ, ตรวจสอบเฉพาะถ้าสงสัยสะกดต่างกัน): ' + dupNames.join(', '));
}

/** ขั้นที่ 1c: วิเคราะห์ mapping คณะ<->เลขา — log จำนวนคณะที่ไม่มีเลขาในตารางนี้เลย */
function analyzeSecretaryMapping() {
  var ss = getSpreadsheet_();
  var groups = buildCommitteeGroups_(readCommitteeImportRaw_(ss));
  var noSecretary = groups.filter(function (g) { return !g.secretaries.some(function (s) { return s.role === 'เลขานุการ'; }); });
  Logger.log('=== analyzeSecretaryMapping: คณะทั้งหมด ' + groups.length + ', ไม่มีเลขานุการหลักระบุในตารางนี้เลย ' +
    noSecretary.length + ' คณะ: ' + noSecretary.map(function (g) { return committeeCode_(ss, g); }).join(', ') + ' ===');
}

/** ขั้นที่ 1d: สรุปรวมทุกด้าน (ตามรายการที่ผู้ใช้ขอ ข้อ 15) */
function analyzeCommitteeStructure() {
  var ss = getSpreadsheet_();
  var groups = buildCommitteeGroups_(readCommitteeImportRaw_(ss));
  var professions = {}, fields = {}, specialties = {};
  var unmapped = 0;
  groups.forEach(function (g) {
    professions[g.profession] = (professions[g.profession] || 0) + 1;
    if (g.field) fields[g.field] = (fields[g.field] || 0) + 1;
    if (g.specialty) specialties[g.specialty] = (specialties[g.specialty] || 0) + 1;
    if (!g.chair && !g.secretaries.length) unmapped++;
  });
  Logger.log('=== analyzeCommitteeStructure สรุปรวม ===');
  Logger.log('พบคณะทั้งหมด: ' + groups.length);
  Logger.log('วิชาชีพที่พบ: ' + Object.keys(professions).map(function (k) { return k + '(' + professions[k] + ')'; }).join(', '));
  Logger.log('ด้านที่พบ: ' + Object.keys(fields).join(', '));
  Logger.log('สาขาที่พบ: ' + Object.keys(specialties).join(', '));
  Logger.log('คณะที่ไม่มีทั้งประธานและเลขา (map ไม่ได้เลย): ' + unmapped);
  analyzeChairData();
  analyzeSecretaryData();
  analyzeSecretaryMapping();
}

/** ขั้นที่ 2: preview เต็มทุกคณะลงชีต CommitteeMigrationPreview — ไม่แตะ ChairMaster/SecretaryMaster/Map เลย */
function previewCommitteeMigration() {
  var ss = getSpreadsheet_();
  var groups = buildCommitteeGroups_(readCommitteeImportRaw_(ss));
  var existingSecIndex = buildExistingSecretaryIndex_(ss);
  var nextSecNum = Object.keys(existingSecIndex).length
    ? Math.max.apply(null, Object.values(existingSecIndex).map(function (id) { return Number(String(id).replace('SEC', '')) || 0; })) + 1
    : 1;
  var secAssigned = {}; // key -> provisional id เฉพาะรอบ preview นี้ (ไม่เขียนจริง)

  var previewSheet = ss.getSheetByName(COMMITTEE_PREVIEW_SHEET_NAME_);
  if (previewSheet) ss.deleteSheet(previewSheet);
  previewSheet = ss.insertSheet(COMMITTEE_PREVIEW_SHEET_NAME_);
  var previewHeaders = ['committee_code', 'profession', 'field', 'specialty', 'team_no', 'chair_name', 'chair_org',
    'secretaries (role:name)', 'status'];
  previewSheet.appendRow(previewHeaders);
  previewSheet.getRange(1, 1, 1, 9).setFontWeight('bold');

  groups.forEach(function (g) {
    var code = committeeCode_(ss, g);
    var secLines = g.secretaries.map(function (s) {
      var key = secretaryDedupeKey_(s.name, s.position, s.org);
      var id = existingSecIndex[key] || secAssigned[key];
      if (!id) { id = 'SEC' + String(nextSecNum).padStart(3, '0'); secAssigned[key] = id; nextSecNum++; }
      return s.role + ':' + s.name + '(' + id + ')';
    }).join(' | ');
    var status = g.chair ? 'พร้อม import' : 'ไม่มีประธาน — ตรวจสอบก่อน';
    previewSheet.appendRow([code, g.profession, g.field, g.specialty, g.teamNo,
      g.chair ? g.chair.name : '(ไม่พบ)', g.chair ? g.chair.org : '', secLines, status]);
    writeTeamNoCell_(previewSheet, previewHeaders, previewSheet.getLastRow(), g.teamNo);
  });
  previewSheet.setFrozenRows(1);
  Logger.log('=== previewCommitteeMigration เสร็จ — ดูผลที่ชีต "' + COMMITTEE_PREVIEW_SHEET_NAME_ + '" (' + groups.length + ' คณะ) ===');
}

/** ขั้นที่ 3a (รันเองเท่านั้น): import ChairMaster จริง — 1 แถว = 1 คณะ, กัน committee_code ซ้ำ (idempotent) */
function migrateChairMaster() {
  var ss = getSpreadsheet_();
  ensureSheet_(ss, SHEET.CHAIR_MASTER, SHEET_HEADERS[SHEET.CHAIR_MASTER]);
  var sheet = ss.getSheetByName(SHEET.CHAIR_MASTER);
  var existingCodes = {};
  readSheetAsObjects_(sheet).forEach(function (row) { existingCodes[row.committee_code] = true; });

  var groups = buildCommitteeGroups_(readCommitteeImportRaw_(ss));
  var nowTs = now_();
  var added = 0, skipped = 0;
  groups.forEach(function (g) {
    var code = committeeCode_(ss, g);
    if (existingCodes[code]) { skipped++; return; }
    appendRowByHeader_(sheet, SHEET_HEADERS[SHEET.CHAIR_MASTER], {
      chair_id: 'CHAIR' + String(skipped + added + 1).padStart(3, '0'), committee_code: code,
      profession: g.profession, field: g.field, specialty: g.specialty, team_no: g.teamNo,
      chair_name: g.chair ? g.chair.name : '', chair_position: g.chair ? g.chair.position : '',
      organization: g.chair ? g.chair.org : '', province: '', active: true, start_date: nowTs, end_date: '', note: '',
    });
    writeTeamNoCell_(sheet, SHEET_HEADERS[SHEET.CHAIR_MASTER], sheet.getLastRow(), g.teamNo);
    added++;
  });
  Logger.log('=== migrateChairMaster เสร็จ — เพิ่มใหม่ ' + added + ' คณะ, ข้าม (มีอยู่แล้ว) ' + skipped + ' คณะ ===');
}

/** ขั้นที่ 3b (รันเองเท่านั้น): import SecretaryMaster จริง — dedupe ด้วย name+position+organization (idempotent) */
function migrateSecretaryMaster() {
  var ss = getSpreadsheet_();
  ensureSheet_(ss, SHEET.SECRETARY_MASTER, SHEET_HEADERS[SHEET.SECRETARY_MASTER]);
  var sheet = ss.getSheetByName(SHEET.SECRETARY_MASTER);
  var existingIndex = buildExistingSecretaryIndex_(ss);
  var nextNum = Object.keys(existingIndex).length
    ? Math.max.apply(null, Object.values(existingIndex).map(function (id) { return Number(String(id).replace('SEC', '')) || 0; })) + 1
    : 1;

  var groups = buildCommitteeGroups_(readCommitteeImportRaw_(ss));
  var added = 0;
  var seenThisRun = {};
  groups.forEach(function (g) {
    g.secretaries.forEach(function (s) {
      var key = secretaryDedupeKey_(s.name, s.position, s.org);
      if (existingIndex[key] || seenThisRun[key]) return;
      var id = 'SEC' + String(nextNum).padStart(3, '0');
      appendRowByHeader_(sheet, SHEET_HEADERS[SHEET.SECRETARY_MASTER], {
        secretary_id: id, name: s.name, position: s.position, organization: s.org, province: '',
        email: '', phone: '', active: true, note: '',
      });
      seenThisRun[key] = id;
      nextNum++;
      added++;
    });
  });
  Logger.log('=== migrateSecretaryMaster เสร็จ — เพิ่มใหม่ ' + added + ' คน (dedupe ด้วยชื่อ+ตำแหน่ง+หน่วยงาน) ===');
}

/** ขั้นที่ 3c (รันเองเท่านั้น หลัง migrateSecretaryMaster() แล้ว): import CommitteeSecretaryMap จริง (idempotent) */
function migrateCommitteeSecretaryMap() {
  var ss = getSpreadsheet_();
  ensureSheet_(ss, SHEET.COMMITTEE_SECRETARY_MAP, SHEET_HEADERS[SHEET.COMMITTEE_SECRETARY_MAP]);
  var sheet = ss.getSheetByName(SHEET.COMMITTEE_SECRETARY_MAP);
  var secIndex = buildExistingSecretaryIndex_(ss);
  var existingPairs = {};
  readSheetAsObjects_(sheet).forEach(function (row) { existingPairs[row.committee_code + '||' + row.secretary_id + '||' + row.role] = true; });

  var groups = buildCommitteeGroups_(readCommitteeImportRaw_(ss));
  var added = 0, skippedNoSecretaryId = 0, skippedExisting = 0;
  var mapNum = readSheetAsObjects_(sheet).length + 1;
  groups.forEach(function (g) {
    var code = committeeCode_(ss, g);
    var seq = 1;
    g.secretaries.forEach(function (s) {
      var secKey = secretaryDedupeKey_(s.name, s.position, s.org);
      var secretaryId = secIndex[secKey];
      if (!secretaryId) { skippedNoSecretaryId++; return; } // ต้องรัน migrateSecretaryMaster() ก่อนเสมอ
      var pairKey = code + '||' + secretaryId + '||' + s.role;
      if (existingPairs[pairKey]) { skippedExisting++; return; }
      appendRowByHeader_(sheet, SHEET_HEADERS[SHEET.COMMITTEE_SECRETARY_MAP], {
        map_id: 'MAP' + String(mapNum).padStart(3, '0'), committee_code: code, profession: g.profession,
        field: g.field, specialty: g.specialty, team_no: g.teamNo, secretary_id: secretaryId,
        role: s.role, sequence: seq, active: true, note: '',
      });
      writeTeamNoCell_(sheet, SHEET_HEADERS[SHEET.COMMITTEE_SECRETARY_MAP], sheet.getLastRow(), g.teamNo);
      existingPairs[pairKey] = true;
      mapNum++; seq++; added++;
    });
  });
  Logger.log('=== migrateCommitteeSecretaryMap เสร็จ — เพิ่มใหม่ ' + added + ' mapping, ข้าม (มีอยู่แล้ว) ' + skippedExisting +
    ', ข้าม (ยังไม่มี secretary_id — รัน migrateSecretaryMaster() ก่อน) ' + skippedNoSecretaryId + ' ===');
}

/**
 * เชื่อมโยง Registration กับคณะกรรมการจริง (2026-09-21) — จัดกลุ่ม ChairMaster (active) ตาม profession แล้ว
 * ตัดสินโหมดการจับคู่ตามข้อมูลจริงที่มี (ห้ามเดา ยืนยันจากการสแกน 1อวช140969.xlsx ทั้ง 15 วิชาชีพแล้ว):
 *   - 'single'   : วิชาชีพนี้มีคณะเดียว ไม่ต้องมีสาขาก็จับคู่ได้ทันที (10 วิชาชีพ เช่น เภสัชกร/นักเทคนิคการแพทย์)
 *   - 'specialty': ทุกคณะของวิชาชีพนี้มี specialty หรือ field ระบุครบ (ไม่ซ้ำกัน) จับคู่ด้วยค่า "ด้าน/สาขา" ที่
 *                  เลือกตอนลงทะเบียนได้ตรง (นายแพทย์ 17 คณะ จับด้วย specialty, ทันตแพทย์ 2 คณะ จับด้วย field)
 *   - 'manual'   : มีหลายคณะแต่ไม่มีข้อความแยกในข้อมูลต้นฉบับเลย (พยาบาลวิชาชีพ 7 คณะ/นักวิชาการสาธารณสุข 2 คณะ)
 *                  — ผู้ใช้ยืนยันแล้วว่าห้าม auto-suggest กรณีนี้ ต้องให้เจ้าหน้าที่เลือกเองเสมอ
 * คืนค่าเป็น map { [profession]: { mode, committees: [{committee_code, chair_name, chair_org, key}] } }
 * ใช้ทั้งฝั่ง embed JSON ให้ client JS (renderRegisterFormBody_) และฝั่ง validate จริงที่ registerNewWork_
 * (resolveCommitteeForRegistration_ ด้านล่าง) — จุดเดียว ไม่มี logic ซ้ำสองที่ให้ drift กัน
 */
function buildCommitteeLookupForRegisterForm_(ss) {
  var chairSheet = ss.getSheetByName(SHEET.CHAIR_MASTER);
  var allChairs = chairSheet ? readSheetAsObjects_(chairSheet).filter(function (r) { return r.active; }) : [];
  var byProfession = {};
  allChairs.forEach(function (r) { (byProfession[r.profession] = byProfession[r.profession] || []).push(r); });

  var lookup = {};
  Object.keys(byProfession).forEach(function (profession) {
    var committees = byProfession[profession].map(function (r) {
      return { committee_code: r.committee_code, chair_name: r.chair_name, chair_org: r.organization, key: r.specialty || r.field || '' };
    });
    var mode = committees.length === 1 ? 'single'
      : (committees.every(function (c) { return c.key; }) ? 'specialty' : 'manual');
    lookup[profession] = { mode: mode, committees: committees };
  });
  return lookup;
}

/**
 * จับคู่คณะกรรมการที่รับผิดชอบสำหรับ 1 การลงทะเบียน (ตำแหน่ง+ด้าน/สาขาที่เลือก) — เรียกจาก registerNewWork_
 * เสมอเพื่อ validate/คำนวณ committee_code จริง ไม่เชื่อค่าจาก client อย่างเดียว (เหมือนที่ validate position/
 * specialty อยู่แล้ว) คืน { mode:'single'|'specialty'|'manual'|'none', committee?:{...}, committees?:[...] }
 */
function resolveCommitteeForRegistration_(ss, positionName, specialtyName) {
  var entry = buildCommitteeLookupForRegisterForm_(ss)[positionName];
  if (!entry || !entry.committees.length) return { mode: 'none', committees: [] };
  if (entry.mode === 'single') return { mode: 'single', committee: entry.committees[0] };
  if (entry.mode === 'specialty') {
    var match = entry.committees.filter(function (c) { return c.key === specialtyName; })[0];
    // ไม่พบตรงเป๊ะ (เช่น MasterSpecialties/ChairMaster เพี้ยนไม่ตรงกัน) — กันพลาดด้วยการให้เลือกเองแทนเดา
    return match ? { mode: 'specialty', committee: match } : { mode: 'manual', committees: entry.committees };
  }
  return { mode: 'manual', committees: entry.committees };
}

/**
 * เลขาตามคณะกรรมการ (2026-11-02 ตาม requirement ล่าสุด — แสดงประธาน+เลขาฝั่งซ้ายฟอร์มลงทะเบียนทันทีตอนเลือก
 * ตำแหน่ง) source of truth: CommitteeSecretaryMap + SecretaryMaster (import ไว้แล้วตั้งแต่
 * migrateSecretaryMaster()/migrateCommitteeSecretaryMap() รอบก่อนหน้า แต่ยังไม่เคยมีจุดไหนใน UI จริงอ่านมาใช้
 * จนรอบนี้ — ไม่สร้าง mapping ใหม่ซ้ำ, reuse ชีตเดิม) คืน { [committee_code]: {name, org} } เอาเฉพาะ role
 * "เลขานุการ" ตัวจริง (ไม่รวม "ผู้ช่วยเลขานุการ" — ป้าย "เลขา" ในฟอร์มหมายถึงเลขาหลักเท่านั้น ไม่เดาเอาผู้ช่วยมา
 * แทนถ้าไม่มีตัวจริง) ถ้าคณะเดียวกันมีมากกว่า 1 แถว role เลขานุการ (ข้อมูลเพี้ยน) เลือก sequence น้อยที่สุด
 * คณะที่ไม่มีแถวเลขานุการเลย = ไม่มี key นี้ใน object (ให้ผู้เรียกแสดง "ยังไม่ได้กำหนด" เอง ไม่ใส่ null ไว้ตรงๆ)
 */
function buildSecretaryLookupForRegisterForm_(ss) {
  var mapSheet = ss.getSheetByName(SHEET.COMMITTEE_SECRETARY_MAP);
  var secSheet = ss.getSheetByName(SHEET.SECRETARY_MASTER);
  if (!mapSheet || !secSheet) return {};

  var secretariesById = {};
  readSheetAsObjects_(secSheet).forEach(function (r) { if (r.active) secretariesById[r.secretary_id] = r; });

  var bestByCommittee = {};
  readSheetAsObjects_(mapSheet).forEach(function (r) {
    if (!r.active || r.role !== 'เลขานุการ') return;
    var sec = secretariesById[r.secretary_id];
    if (!sec) return;
    var current = bestByCommittee[r.committee_code];
    if (!current || Number(r.sequence || 0) < Number(current.sequence || 0)) {
      bestByCommittee[r.committee_code] = { name: sec.name, org: sec.organization, sequence: r.sequence };
    }
  });

  var lookup = {};
  Object.keys(bestByCommittee).forEach(function (code) {
    lookup[code] = { name: bestByCommittee[code].name, org: bestByCommittee[code].org };
  });
  return lookup;
}
