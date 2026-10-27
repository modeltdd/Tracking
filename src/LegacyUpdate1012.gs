/**
 * อัปเดตทะเบียนผลงานจากไฟล์ Excel ล่าสุด (2026-10-22, ตามคำขอผู้ใช้) — แหล่งข้อมูล: 1อวช121069.xlsx
 * (3 ชีต "อวช68ตกค้าง(7)"/"อวช69(241)"/"อวช70(11)" รวม 259 แถว, ดู LegacyUpdate1012Seed.gs สำหรับที่มา/การยืนยัน
 * โครงสร้างแบบละเอียด) เทียบกับไฟล์ 2อวช121069.xlsx (14 ชีตรายเดือน) แล้วว่าผลรวมตรงกันเป๊ะ (259=259) ก่อนใช้
 *
 * สิ่งที่ตรวจยืนยันจากไฟล์จริงแล้ว (ห้ามเดาซ้ำ):
 * - คอลัมน์ A-K ตรงกับ LEGACY_COL_ เดิมเป๊ะทุกตัวอักษร (เทียบ header ชีตแล้ว)
 * - "ลำดับ" (legacy_seq) ของข้อมูลเดิม 1-244 (จาก 1อวช140969.xlsx ที่เคย import ไปแล้ว) "เนื้อหาตรงกันทุกแถว"
 *   กับ seq เดียวกันในไฟล์ใหม่ (สุ่มตรวจ seq=1,7,8 ตรงเป๊ะ) — แค่ไฟล์ใหม่แยกเก็บเป็น 2 ชีต (1-7="ตกค้าง",
 *   8-248="69") แทนชีตเดียวเดิม และมี 245-248 เพิ่มใหม่ท้ายชุดเดิม — ดังนั้น "legacy_seq" ยังใช้เป็น primary key
 *   จับคู่กับข้อมูลเดิมในระบบได้ปลอดภัย 100% (ไม่ต้อง fallback ชื่อ+วันที่ตามข้อ 3 ที่ผู้ใช้กำหนดไว้เผื่อเลย
 *   เพราะทุกแถวมี "ลำดับ" ครบ ไม่มีแถวไหนขาด — fallback matching ในสเปกจึงไม่เกิดขึ้นจริงในชุดข้อมูลนี้)
 * - "อวช70(11)" เป็น namespace ใหม่แยกต่างหาก (ลำดับรูปแบบ "N/70" เริ่มนับ 1 ใหม่ ไม่ต่อจาก 248) — ทุกแถวมี
 *   วันที่ลงรับอยู่ ต.ค.2569 (เดือนแรกของปีงบ 2570 ตาม fiscalYearOfDate_ เดิม) ยืนยันว่าเป็นชุดใหม่จริง ไม่ใช่ seq
 *   ซ้ำกับ 1-248 (คนละความหมาย "1/70" ไม่ใช่ "1") — คำนวณเลขทะเบียนแยก namespace กันชนกับ "69-xxx" เดิม
 *
 * ขอบเขตงานนี้ (ตามคำขอผู้ใช้ข้อ 6/9/15 — ห้ามกระทบ Workflow):
 * - อัปเดตเฉพาะ "ฟิลด์ข้อมูลตัวตน/ข้อมูลลงทะเบียน" เท่านั้น: title_name/first_name/last_name/position/specialty/
 *   province/received_date/legacy_team/secretary/org_from/requested_org_position
 * - "สถานะ"/"เดือน" ในคอลัมน์ Excel (K/J) ไม่ถูกใช้เลยสำหรับงานที่มีอยู่แล้วในระบบ — current_station_key/
 *   current_status_public/evaluation_result ของงานที่มีอยู่แล้วคือข้อมูลจริงจาก Workflow ของระบบนี้เอง (ตั้งแต่
 *   deploy ระบบมา สถานะงานเดินผ่านแอปจริง ไม่ใช่ Excel อีกต่อไป) ใช้ค่า Excel เฉพาะตอนสร้างงาน "ใหม่" เท่านั้น
 *   (Group C) เหมือนที่ migrateLegacyRegistrations() เดิมทำ
 * - revision_due_date/StatusHistory เดิม/AuditLog เดิม ไม่ถูกแก้/ลบเลย (เพิ่ม AuditLog แถวใหม่ต่อท้ายเท่านั้น
 *   ตอน apply จริง สำหรับ field ที่เปลี่ยนจริง — ไม่ใช่การ "กระทบ" entry เดิม)
 *
 * ลำดับการทำงาน (ห้ามข้ามขั้นตอน, ปลอดภัยรันซ้ำได้ทุกฟังก์ชัน):
 *   dryRunLegacyUpdate1012() -> ดูสรุปใน Logger + รายละเอียดเต็มในชีต "ReconcileDryRun1012" -> ผู้ใช้ตรวจสอบเอง ->
 *   applyLegacyUpdate1012() (รันเองเท่านั้น ห้าม auto-run — สร้าง backup ให้อัตโนมัติก่อนเขียนจริงเสมอ)
 */

var LEGACY_UPDATE_1012_PREVIEW_SHEET_ = 'ReconcileDryRun1012';
// ฟิลด์ที่ "อนุญาตให้อัปเดต" จาก Excel เท่านั้น (ตามข้อ 6) — ห้ามแตะฟิลด์ Workflow ใดๆ นอกรายการนี้เด็ดขาด
var LEGACY_UPDATE_1012_IDENTITY_FIELDS_ = [
  'title_name', 'first_name', 'last_name', 'position', 'specialty', 'province',
  'legacy_team', 'secretary', 'org_from', 'requested_org_position',
];

/** ตัดส่วน "/70" ท้าย legacy_seq ออก เหลือแค่เลขลำดับล้วน (ใช้คำนวณเลขทะเบียนเท่านั้น ไม่แก้ legacy_seq ที่เก็บจริง
 *  ซึ่งต้องคงรูปแบบดิบ "N/70" ไว้เป๊ะ กันชนกับ namespace 1-248 เดิม) */
function legacySeqNumericPart1012_(rawSeq) {
  var m = String(rawSeq || '').match(/^(\d+)/);
  return m ? m[1] : String(rawSeq || '').trim();
}

/** สูตรเดียวกับ migrateLegacyRegistrations() เดิมเป๊ะ (ปี พ.ศ.ของ received_date จริง + เลขลำดับ pad 3 หลัก)
 *  ต่างแค่ตัด "/70" ออกก่อน ให้ใช้ได้ทั้ง namespace เดิม (1-248) และใหม่ (1/70-11/70) โดยไม่ชนกันเอง */
function computeLegacyTrackingNo1012_(receivedDate, legacySeq) {
  return shortBuddhistYear_(getBuddhistYear_(new Date(receivedDate))) + '-' + padLeft_(legacySeqNumericPart1012_(legacySeq), 3);
}

/** เทียบค่าข้อความ/ตัวเลข — ถ้า parse เป็นเลขได้ทั้งคู่ เทียบด้วยค่าตัวเลข (กัน false positive จาก floating-point
 *  string noise ที่มาจาก Excel จริง เช่น legacy_team "1.13" ถูกเก็บในไฟล์เป็น "1.1299999999999999") ไม่งั้นเทียบ
 *  string ที่ trim แล้ว (2026-10-22 — เจอจริงจาก dry run บนข้อมูลจริง: seq=244 legacy_team ถูก flag ผิดเพราะเรื่องนี้) */
function normalizeLegacyCompareValue1012_(v) {
  var s = String(v === null || v === undefined ? '' : v).trim();
  if (s !== '' && /^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  return s;
}

/** เทียบวันที่แบบ "วันปฏิทินเดียวกันหรือไม่" (ปี/เดือน/วัน ตาม timezone ของ Apps Script project) ไม่ใช่ timestamp
 *  ตรงๆ — เพราะค่าที่มาจาก excelSerialToDate_() (เที่ยงคืน UTC ตรงๆ) กับค่าที่มาจาก migrateLegacyRegistrations()
 *  เดิม (new Date(y,m,d) ตีความตาม timezone โปรเจกต์ = เที่ยงคืนกรุงเทพ) คือ "วันเดียวกันจริง" แต่ getTime() ต่างกัน
 *  7 ชั่วโมงเสมอ — เจอจริงจาก dry run: ทุกแถวที่ match ถูก flag กลุ่ม B ผิดพลาดเพราะเทียบ timestamp ตรงๆ
 *  (2026-10-22) */
function sameCalendarDate1012_(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  var da = new Date(a), db = new Date(b);
  if (isNaN(da.getTime()) || isNaN(db.getTime())) return false;
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

/** เทียบฟิลด์ "ข้อมูลตัวตน" ระหว่างงานที่มีอยู่แล้ว (work, จาก Works จริง) กับข้อมูลใหม่จาก Excel (r, ผลจาก
 *  analyzeLegacyRow_) คืน array ของ { field, old, new } เฉพาะฟิลด์ที่ค่าต่างกันจริง (trim แล้วเทียบ exact —
 *  ไม่ fuzzy/ไม่เดาว่า "คล้ายกัน" คือค่าเดียวกัน) received_date เทียบแบบวันปฏิทิน ไม่ใช่ timestamp ตรงๆ */
function diffLegacyIdentityFields1012_(work, r) {
  var changes = [];
  var textFieldMap = {
    title_name: r.title_name, first_name: r.first_name, last_name: r.last_name,
    position: r.position, specialty: r.specialty, province: r.province,
    legacy_team: r.legacy_team, secretary: r.secretary,
    org_from: r.org_from, requested_org_position: r.requested_org_position,
  };
  Object.keys(textFieldMap).forEach(function (field) {
    var oldN = normalizeLegacyCompareValue1012_(work[field]);
    var newN = normalizeLegacyCompareValue1012_(textFieldMap[field]);
    if (oldN !== newN) changes.push({ field: field, old: work[field], newVal: textFieldMap[field] });
  });
  if (!sameCalendarDate1012_(work.received_date, r.received_date)) {
    changes.push({ field: 'received_date', old: work.received_date, newVal: r.received_date });
  }
  return changes;
}

/**
 * แกนกลางเปรียบเทียบ — ใช้ทั้ง dryRunLegacyUpdate1012()/applyLegacyUpdate1012() (คำนวณครั้งเดียว ตรรกะเดียวกัน
 * เป๊ะ กันผลลัพธ์ apply ไม่ตรงกับที่ dry run รายงานไว้) ไม่เขียนอะไรลงชีตเลยในฟังก์ชันนี้ (pure read + compute)
 * รับ seedRows เป็น parameter (ไม่เรียก getLegacyUpdate1012Seed_() ตรงๆ ข้างใน) ให้ harness เทสด้วยชุดข้อมูล
 * จำลองเล็กๆ ได้โดยไม่ต้องพึ่งข้อมูลจริง 259 แถว
 */
function buildLegacyUpdate1012Report_(seedRows) {
  var ss = getSpreadsheet_();
  var positionRows = getActiveMasterRows_(ss, SHEET.MASTER_POSITIONS);
  var stationOrderIndex = buildLegacyStationOrderIndex_(ss);
  var provinceList = getSettingList_(ss, 'district11_provinces', []);

  var seedSeqCounts = {};
  seedRows.forEach(function (row) {
    var seq = String(row[LEGACY_COL_.SEQ] || '').trim();
    seedSeqCounts[seq] = (seedSeqCounts[seq] || 0) + 1;
  });
  var duplicateInSource = Object.keys(seedSeqCounts).filter(function (k) { return seedSeqCounts[k] > 1; });

  var analyzed = seedRows.map(function (row) {
    return analyzeLegacyRow_(ss, row, positionRows, stationOrderIndex, provinceList, undefined);
  });

  var liveWorks = readSheetAsObjects_(ss.getSheetByName(SHEET.WORKS));
  var liveBySeq = {};
  var liveTrackingNos = {};
  liveWorks.forEach(function (w) {
    if (w.legacy_seq) liveBySeq[String(w.legacy_seq)] = w;
    if (w.tracking_no) liveTrackingNos[String(w.tracking_no)] = w;
  });

  var groupA = [], groupB = [], groupC = [], groupE = [], trackingConflicts = [];
  var seenSeq = {};

  analyzed.forEach(function (r) {
    seenSeq[r.legacy_seq] = true;
    var existing = liveBySeq[r.legacy_seq];
    if (!existing) {
      var hasBlockingIssue = !r.station_key || !r.received_date ||
        !positionRows.some(function (p) { return p.position_name === r.position; });
      var trackingNo = r.received_date ? computeLegacyTrackingNo1012_(r.received_date, r.legacy_seq) : '';
      var conflictWork = trackingNo ? liveTrackingNos[trackingNo] : null;
      if (conflictWork) {
        trackingConflicts.push({ incoming: r, trackingNo: trackingNo, conflictWith: conflictWork });
      } else if (hasBlockingIssue) {
        groupE.push({ incoming: r, reason: 'ข้อมูลไม่ครบ/map ไม่ได้: ' + r.issues.join(' / ') });
      } else {
        groupC.push({ incoming: r, trackingNo: trackingNo });
      }
      return;
    }
    var changes = diffLegacyIdentityFields1012_(existing, r);
    if (changes.length) groupB.push({ work: existing, incoming: r, changes: changes });
    else groupA.push({ work: existing, incoming: r });
  });

  // D: มีอยู่แล้วในระบบ (import จาก legacy, มี legacy_seq) แต่ไม่พบ seq นี้ในไฟล์ Excel ใหม่เลย — ไม่ลบ แค่รายงาน
  var groupD = liveWorks.filter(function (w) {
    return w.created_by === LEGACY_IMPORT_MARKER_ && w.legacy_seq && !seenSeq[String(w.legacy_seq)];
  });

  return {
    totalSource: seedRows.length, duplicateInSource: duplicateInSource,
    groupA: groupA, groupB: groupB, groupC: groupC, groupD: groupD, groupE: groupE,
    trackingConflicts: trackingConflicts,
  };
}

/**
 * 2026-10-22 — diagnostic หา root cause ว่าทำไมกลุ่ม B (ข้อมูลเปลี่ยนแปลง) ขึ้นสูงผิดปกติ (244/244 — ควรมีบาง
 * แถวตรงเป๊ะไม่เปลี่ยนเลยด้วย) log field/ค่าเดิม/ค่าใหม่แบบเต็มของ legacy_seq ที่ระบุ (ตรวจไฟล์จริงมาแล้วว่า
 * seq 1/7/8 เนื้อหาควรตรงเป๊ะกับที่เคย import — ถ้า log นี้บอกว่าต่าง จะเห็นชัดว่า field ไหน/ค่าอะไรที่ไม่ตรง)
 * รันจาก Editor ได้ตรงๆ (ไม่มี underscore ต่อท้าย) ไม่แก้ไขข้อมูลใดๆ เลย
 */
function logLegacyUpdate1012SampleDiff() {
  var seqList = ['1', '7', '8', '100', '244'];
  var ss = getSpreadsheet_();
  var seedRows = getLegacyUpdate1012Seed_();
  var positionRows = getActiveMasterRows_(ss, SHEET.MASTER_POSITIONS);
  var stationOrderIndex = buildLegacyStationOrderIndex_(ss);
  var provinceList = getSettingList_(ss, 'district11_provinces', []);
  var liveWorks = readSheetAsObjects_(ss.getSheetByName(SHEET.WORKS));
  var liveBySeq = {};
  liveWorks.forEach(function (w) { if (w.legacy_seq) liveBySeq[String(w.legacy_seq)] = w; });

  seqList.forEach(function (seq) {
    var rawRow = seedRows.filter(function (row) { return String(row[LEGACY_COL_.SEQ]).trim() === seq; })[0];
    if (!rawRow) { Logger.log('seq=' + seq + ' — ไม่พบในไฟล์ Excel (seed) เลย'); return; }
    var r = analyzeLegacyRow_(ss, rawRow, positionRows, stationOrderIndex, provinceList, undefined);
    var work = liveBySeq[seq];
    Logger.log('--- seq=' + seq + ' ---');
    if (!work) { Logger.log('  ไม่พบใน Works เลย (legacy_seq นี้ยังไม่เคย import)'); return; }
    Logger.log('  work_id=' + work.work_id + ' tracking_no=' + work.tracking_no);
    var changes = diffLegacyIdentityFields1012_(work, r);
    if (!changes.length) { Logger.log('  ไม่มี diff เลย (ตรงกันทุก field)'); return; }
    changes.forEach(function (c) {
      Logger.log('  field=' + c.field +
        ' | เดิม=' + JSON.stringify(c.old) + ' (typeof ' + typeof c.old + (c.old instanceof Date ? ', Date' : '') + ')' +
        ' | ใหม่=' + JSON.stringify(c.newVal) + ' (typeof ' + typeof c.newVal + (c.newVal instanceof Date ? ', Date' : '') + ')');
    });
  });
}

/**
 * ขั้นที่ 1 (รันได้ปลอดภัยไม่จำกัดจำนวนครั้ง ไม่แก้ข้อมูลใดๆ เลย) — สรุปตัวเลข Dry Run ตามข้อ 10 ลง Logger +
 * รายละเอียดทุกแถว (เฉพาะ field ที่เปลี่ยนจริงสำหรับกลุ่ม B ตามข้อ 11) ลงชีต "ReconcileDryRun1012" (ล้างของเก่าทิ้ง
 * ทุกครั้งที่รัน) ให้ตรวจสอบก่อนรัน applyLegacyUpdate1012() จริง — seedRowsOverride ใช้เฉพาะเทส (harness) ให้สลับ
 * ชุดข้อมูลเล็กแทนของจริง 259 แถวได้ ไม่ใส่ตอนรันจาก Editor จริง (จะใช้ getLegacyUpdate1012Seed_() เสมอ)
 */
function dryRunLegacyUpdate1012(seedRowsOverride) {
  var ss = getSpreadsheet_();
  var report = buildLegacyUpdate1012Report_(seedRowsOverride || getLegacyUpdate1012Seed_());

  Logger.log('=== Dry Run: อัปเดตทะเบียนผลงานจาก 1อวช121069.xlsx ===');
  Logger.log('1) Excel ทั้งหมด (3 ชีต, หลัง dedupe ในไฟล์เอง): ' + report.totalSource + ' รายการ');
  Logger.log('2) match กับระบบเดิม (legacy_seq ตรงกัน): ' + (report.groupA.length + report.groupB.length) + ' รายการ');
  Logger.log('   2.1) ข้อมูลเหมือนเดิมทุกฟิลด์ (กลุ่ม A): ' + report.groupA.length + ' รายการ');
  Logger.log('   2.2) ข้อมูลมีการเปลี่ยนแปลง (กลุ่ม B, จะ update จริง): ' + report.groupB.length + ' รายการ');
  Logger.log('3) รายการใหม่ที่ยังไม่มีในระบบ (กลุ่ม C, จะ insert ใหม่): ' + report.groupC.length + ' รายการ');
  Logger.log('4) มีในระบบเดิมแต่ไม่พบใน Excel ล่าสุด (กลุ่ม D, "ห้าม" ลบอัตโนมัติ): ' + report.groupD.length + ' รายการ');
  Logger.log('5) จับคู่ไม่ได้/ข้อมูลกำกวม (กลุ่ม E): ' + report.groupE.length + ' รายการ');
  Logger.log('6) duplicate ลำดับซ้ำภายในไฟล์ Excel เอง: ' + (report.duplicateInSource.length ? report.duplicateInSource.join(', ') : '0 (ไม่มี)'));
  Logger.log('7) duplicate registration_no (เลขทะเบียนที่คำนวณได้ชนกับที่มีอยู่แล้วในระบบ — ต้องแก้มือก่อน apply): ' +
    (report.trackingConflicts.length ? report.trackingConflicts.length : '0 (ไม่มี)'));
  if (report.trackingConflicts.length) {
    report.trackingConflicts.forEach(function (c) {
      Logger.log('   ชน: legacy_seq=' + c.incoming.legacy_seq + ' (' + c.incoming.first_name + ' ' + c.incoming.last_name +
        ') คำนวณได้ ' + c.trackingNo + ' แต่ซ้ำกับงานเดิม work_id=' + c.conflictWith.work_id + ' (' + c.conflictWith.first_name + ' ' + c.conflictWith.last_name + ')');
    });
  }
  Logger.log('8) วันที่ผิดปกติ/แปลงไม่ได้ (รวมอยู่ในกลุ่ม E): ดูรายละเอียดใน sheet "' + LEGACY_UPDATE_1012_PREVIEW_SHEET_ + '"');
  Logger.log('9) รายการที่ควรตรวจด้วยคน (กลุ่ม E + duplicate registration_no รวมกัน): ' + (report.groupE.length + report.trackingConflicts.length));

  // เขียนรายละเอียดเต็มลงชีต (ล้างของเก่าทุกครั้ง)
  var sheet = ss.getSheetByName(LEGACY_UPDATE_1012_PREVIEW_SHEET_);
  if (sheet) ss.deleteSheet(sheet);
  sheet = ss.insertSheet(LEGACY_UPDATE_1012_PREVIEW_SHEET_);
  var headers = ['กลุ่ม', 'legacy_seq', 'work_id (ถ้ามี)', 'tracking_no (เดิม/ที่จะออกใหม่)', 'ชื่อ-สกุล', 'field ที่เปลี่ยน', 'ค่าเดิม', 'ค่าใหม่', 'หมายเหตุ'];
  sheet.appendRow(headers);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  sheet.setFrozenRows(1);

  var rowsOut = [];
  report.groupB.forEach(function (item) {
    var name = item.incoming.title_name + item.incoming.first_name + ' ' + item.incoming.last_name;
    item.changes.forEach(function (c) {
      rowsOut.push(['B: เปลี่ยนแปลง', item.incoming.legacy_seq, item.work.work_id, item.work.tracking_no, name,
        c.field, formatLegacyPreviewValue1012_(c.old), formatLegacyPreviewValue1012_(c.newVal), '']);
    });
  });
  report.groupC.forEach(function (item) {
    var r = item.incoming;
    rowsOut.push(['C: รายการใหม่', r.legacy_seq, '', item.trackingNo, r.title_name + r.first_name + ' ' + r.last_name,
      '(ทั้งแถว)', '', '', 'ตำแหน่ง=' + r.position + ' / จังหวัด=' + r.province + ' / วันที่ลงรับ=' + formatDateTh_(r.received_date)]);
  });
  report.groupD.forEach(function (w) {
    rowsOut.push(['D: ไม่พบใน Excel ล่าสุด', w.legacy_seq, w.work_id, w.tracking_no, w.title_name + w.first_name + ' ' + w.last_name,
      '', '', '', 'ต้องตรวจสอบเองว่าควรทำอย่างไร (ระบบไม่ลบอัตโนมัติ)']);
  });
  report.groupE.forEach(function (item) {
    var r = item.incoming;
    rowsOut.push(['E: จับคู่ไม่ได้/กำกวม', r.legacy_seq, '', '', r.title_name + r.first_name + ' ' + r.last_name,
      '', '', '', item.reason]);
  });
  report.trackingConflicts.forEach(function (c) {
    rowsOut.push(['F: เลขทะเบียนชนกับระบบ', c.incoming.legacy_seq, c.conflictWith.work_id, c.trackingNo,
      c.incoming.title_name + c.incoming.first_name + ' ' + c.incoming.last_name,
      '', '', '', 'ชนกับงานเดิม: ' + c.conflictWith.title_name + c.conflictWith.first_name + ' ' + c.conflictWith.last_name]);
  });

  if (rowsOut.length) sheet.getRange(2, 1, rowsOut.length, headers.length).setValues(rowsOut);
  Logger.log('=== รายละเอียดเต็มอยู่ที่ชีต "' + LEGACY_UPDATE_1012_PREVIEW_SHEET_ + '" (' + rowsOut.length + ' แถว) — ตรวจสอบให้ครบก่อนรัน applyLegacyUpdate1012() ===');
}

function formatLegacyPreviewValue1012_(v) {
  if (v instanceof Date) return formatDateTh_(v);
  return v === null || v === undefined ? '' : String(v);
}

/**
 * ขั้นที่ 2 (รันเองเท่านั้น หลังตรวจ "ReconcileDryRun1012" แล้ว — ห้ามเรียกจากฟังก์ชันอื่นอัตโนมัติ, ห้าม auto-run)
 * สร้าง backup ชีต Works ก่อนเสมอ (ชื่อ "Works_backup_YYYYMMDD_HHmm") แล้ว:
 *   - กลุ่ม B: update เฉพาะ field ที่เปลี่ยนจริง (LEGACY_UPDATE_1012_IDENTITY_FIELDS_/received_date เท่านั้น —
 *     ไม่แตะ current_station_key/current_status_public/evaluation_result/revision_due_date เด็ดขาด) ด้วย
 *     getRange().setValues() ครั้งเดียวทั้งชีต (ไม่ setValue ทีละ cell ในลูปตามที่ผู้ใช้สั่ง) + เขียน AuditLog
 *     1 แถวต่องานที่เปลี่ยน (ไม่แตะ AuditLog เดิม แค่เพิ่มแถวใหม่ต่อท้าย)
 *   - กลุ่ม C: insert แถวใหม่ (เหมือน migrateLegacyRegistrations() เดิมทุกประการ แค่เลขทะเบียนคำนวณรองรับ
 *     namespace "N/70" ด้วย) + StatusHistory action='INITIAL_IMPORT' เหมือนเดิม
 *   - กลุ่ม D/E/F: "ไม่แตะอะไรเลย" (ตามข้อ 5 — ห้ามลบอัตโนมัติ, ข้อมูลกำกวม/ชนกันต้องแก้มือก่อน)
 * คืนค่าสรุปผล (ใช้ log เป็นรายงานสุดท้ายตามข้อ 16) — seedRowsOverride ใช้เฉพาะเทส (harness) เหมือน
 * dryRunLegacyUpdate1012() ด้านบน ไม่ใส่ตอนรันจาก Editor จริง
 */
function applyLegacyUpdate1012(seedRowsOverride) {
  var ss = getSpreadsheet_();
  var report = buildLegacyUpdate1012Report_(seedRowsOverride || getLegacyUpdate1012Seed_());
  var worksSheet = ss.getSheetByName(SHEET.WORKS);
  var historySheet = ss.getSheetByName(SHEET.STATUS_HISTORY);

  var beforeCount = worksSheet.getLastRow() - 1;

  // --- Backup (ข้อ 9) ---
  var ts = Utilities.formatDate(now_(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmm');
  var backupName = 'Works_backup_' + ts;
  var backupSheet = worksSheet.copyTo(ss);
  backupSheet.setName(backupName);

  // --- กลุ่ม B: batch update (อ่านทั้งชีตครั้งเดียว แก้ในหน่วยความจำ แล้ว setValues ครั้งเดียว) ---
  var lastCol = worksSheet.getLastColumn();
  var lastRow = worksSheet.getLastRow();
  var headers = worksSheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var dataRange = worksSheet.getRange(2, 1, lastRow - 1, lastCol);
  var data = dataRange.getValues();
  var workIdCol = headers.indexOf('work_id');
  var rowIndexByWorkId = {};
  data.forEach(function (row, i) { rowIndexByWorkId[row[workIdCol]] = i; });

  var nowTs = now_();
  var updatedCount = 0;
  report.groupB.forEach(function (item) {
    var rowIdx = rowIndexByWorkId[item.work.work_id];
    if (rowIdx === undefined) return; // ป้องกันเงียบๆ กรณีแถวหายไประหว่างอ่าน (ไม่ควรเกิดจริง)
    item.changes.forEach(function (c) {
      var colIdx = headers.indexOf(c.field);
      if (colIdx === -1) return;
      data[rowIdx][colIdx] = c.newVal;
    });
    var updatedAtCol = headers.indexOf('updated_at');
    if (updatedAtCol !== -1) data[rowIdx][updatedAtCol] = nowTs;
    updatedCount++;
    writeAuditLog_(LEGACY_IMPORT_MARKER_, 'legacy_update_1012', item.work.work_id, 'identity_fields',
      item.changes.map(function (c) { return c.field + '=' + formatLegacyPreviewValue1012_(c.old); }).join('; '),
      item.changes.map(function (c) { return c.field + '=' + formatLegacyPreviewValue1012_(c.newVal); }).join('; '));
  });
  if (updatedCount) dataRange.setValues(data);

  // --- กลุ่ม C: insert รายการใหม่ (เหมือน migrateLegacyRegistrations() เดิม) ---
  var insertedCount = 0, skippedConflict = report.trackingConflicts.length, skippedAmbiguous = report.groupE.length;
  report.groupC.forEach(function (item) {
    var r = item.incoming;
    var workId = Utilities.getUuid();
    var trackingNo = item.trackingNo;
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
    insertedCount++;
  });

  var afterCount = worksSheet.getLastRow() - 1;

  // --- ตรวจหลัง update (ข้อ 14) ---
  var afterWorks = readSheetAsObjects_(worksSheet);
  var trackingCounts = {};
  afterWorks.forEach(function (w) { if (w.tracking_no) trackingCounts[w.tracking_no] = (trackingCounts[w.tracking_no] || 0) + 1; });
  var dupTrackingAfter = Object.keys(trackingCounts).filter(function (k) { return trackingCounts[k] > 1; });

  Logger.log('=== applyLegacyUpdate1012 เสร็จ ===');
  Logger.log('backup อยู่ที่: ชีต "' + backupName + '" (ใน Spreadsheet เดียวกัน)');
  Logger.log('จำนวนแถว Works ก่อน update: ' + beforeCount);
  Logger.log('จำนวนแถว Works หลัง update: ' + afterCount);
  Logger.log('update จริง (กลุ่ม B): ' + updatedCount + ' รายการ');
  Logger.log('insert ใหม่ (กลุ่ม C): ' + insertedCount + ' รายการ');
  Logger.log('ข้าม (เลขทะเบียนชนกับระบบ, ต้องแก้มือ): ' + skippedConflict + ' รายการ');
  Logger.log('ข้าม (ข้อมูลกำกวม/ไม่ครบ): ' + skippedAmbiguous + ' รายการ');
  Logger.log('ไม่พบใน Excel ล่าสุด (ไม่ถูกลบ): ' + report.groupD.length + ' รายการ');
  Logger.log('ตรวจ tracking_no ซ้ำหลัง update ทั้งชีต: ' + (dupTrackingAfter.length ? 'พบซ้ำ ' + dupTrackingAfter.join(', ') + ' — ต้องตรวจด่วน!' : 'ไม่พบซ้ำเลย (ผ่าน)'));
  Logger.log('ถ้า update ผิดพลาด ให้กู้คืนจากชีต "' + backupName + '" (คัดลอกข้อมูลกลับไปทับ Works ด้วยมือ หรือเปลี่ยนชื่อสลับกัน)');

  return {
    backupSheetName: backupName, beforeCount: beforeCount, afterCount: afterCount,
    updatedCount: updatedCount, insertedCount: insertedCount,
    skippedConflict: skippedConflict, skippedAmbiguous: skippedAmbiguous, notFoundCount: report.groupD.length,
    duplicateTrackingAfter: dupTrackingAfter,
  };
}

/**
 * สุ่มเช็คผล applyLegacyUpdate1012() หลังรันจริง (2026-10-26, ตามคำขอผู้ใช้ "สุ่มเช็คให้หน่อย") — read-only,
 * ไม่แก้ข้อมูล กลุ่ม B: ดึง AuditLog action='legacy_update_1012' (ชื่อ action ไม่ซ้ำกับที่อื่น จึงกรองได้ตรง) หัว/
 * กลาง/ท้ายของชุด เทียบ old/new ที่บันทึกไว้กับค่าจริงปัจจุบันใน Works ว่าตรงกัน กลุ่ม C: ใช้ 14 แถวท้ายสุดของชีต
 * Works (insert ด้วย appendRowByHeader_ ต่อท้ายเสมอ แถวท้ายจึงเป็นกลุ่ม C แน่นอน ไม่ต้องเดา)
 */
function logLegacyUpdate1012SpotCheck() {
  var ss = getSpreadsheet_();
  var worksSheet = ss.getSheetByName(SHEET.WORKS);
  var works = readSheetAsObjects_(worksSheet);
  var worksById = {};
  works.forEach(function (w) { worksById[w.work_id] = w; });

  Logger.log('=== สุ่มเช็คกลุ่ม B (update จริง) จาก AuditLog action=legacy_update_1012 ===');
  var auditLog = readSheetAsObjects_(ss.getSheetByName(SHEET.AUDIT_LOG));
  var bEntries = auditLog.filter(function (a) { return a.action === 'legacy_update_1012'; });
  Logger.log('พบ AuditLog กลุ่ม B ทั้งหมด: ' + bEntries.length + ' แถว');
  var sampleIdx = [0, Math.floor(bEntries.length / 2), bEntries.length - 1];
  sampleIdx.forEach(function (idx) {
    var a = bEntries[idx];
    if (!a) return;
    var w = worksById[a.work_id];
    Logger.log('--- work_id=' + a.work_id + ' tracking_no=' + (w ? w.tracking_no : '(ไม่พบใน Works!)') +
      ' ชื่อ=' + (w ? (w.title_name + w.first_name + ' ' + w.last_name) : '') + ' ---');
    Logger.log('  AuditLog เดิม: ' + a.old_value);
    Logger.log('  AuditLog ใหม่ (ที่บันทึกไว้ตอน apply): ' + a.new_value);
    if (w) {
      Logger.log('  ค่าจริงใน Works ตอนนี้: received_date=' + formatDateTh_(w.received_date) +
        ' legacy_team=' + w.legacy_team + ' position=' + w.position + ' province=' + w.province +
        ' secretary=' + w.secretary + ' org_from=' + w.org_from + ' requested_org_position=' + w.requested_org_position);
    }
  });

  Logger.log('=== สุ่มเช็คกลุ่ม C (insert ใหม่) — 14 แถวท้ายสุดของชีต Works ===');
  var lastN = works.slice(-14);
  lastN.forEach(function (w) {
    Logger.log('legacy_seq=' + w.legacy_seq + ' tracking_no=' + w.tracking_no + ' ชื่อ=' + w.title_name + w.first_name + ' ' + w.last_name +
      ' ตำแหน่ง=' + w.position + ' จังหวัด=' + w.province + ' received_date=' + formatDateTh_(w.received_date) +
      ' station=' + w.current_station_key + ' status=' + w.current_status_public);
  });
}

/**
 * แก้ 2 รายการผิดปกติที่เจอจาก logLegacyUpdate1012SpotCheck() (2026-10-27, ยืนยันกับผู้ใช้แล้วทั้ง 2 จุด —
 * ห้ามเดา, ยืนยันทีละจุดก่อนแก้):
 *   1) legacy_seq="145" (นายสุภาพ ทรัพย์แก้ว): เลขา cell ในไฟล์ Excel จริงเป็น "0" (ไม่ใช่ parse พลาด) แต่ "0"
 *      ไม่ใช่ชื่อคน — ผู้ใช้ยืนยันให้คืนค่าเดิม "นางเมธิตา พุทธชาติ" ที่มีอยู่ก่อน apply (ดู backup
 *      Works_backup_20261022_1604)
 *   2) legacy_seq="6/70" (นายกานต์ ธีระสัมพันธ์): serial วันที่ลงรับในไฟล์ (46300) ต่างจากแถวพี่น้องชุดเดียวกัน
 *      (≈244624-244634) พอดี ~543 ปีเป็นวัน — คนกรอก Excel แถวนี้พิมพ์ปี ค.ศ. ตรงๆ ไม่ใช่ พ.ศ.แบบแถวอื่น ทำให้
 *      correctLegacyReceivedDate_() ลบ 543 ปีซ้ำ ได้ 26/09/1483 (ผิด) ผู้ใช้ยืนยันให้แก้เป็น 26/09/2026 +
 *      คำนวณ tracking_no ใหม่จากวันที่ที่แก้แล้ว
 * Idempotent: เช็คค่าปัจจุบันตรงกับสภาพ "ผิด" ที่รู้อยู่แล้วก่อนแก้ทุกครั้ง รันซ้ำได้ไม่กระทบ เขียน AuditLog
 * ทุกจุดที่แก้ ไม่แตะ field อื่น/ไม่แตะ Workflow (current_station_key ฯลฯ)
 */
function fixLegacyUpdate1012Anomalies() {
  var ss = getSpreadsheet_();
  var worksSheet = ss.getSheetByName(SHEET.WORKS);
  var works = readSheetAsObjects_(worksSheet);
  var headers = worksSheet.getRange(1, 1, 1, worksSheet.getLastColumn()).getValues()[0];
  var legacySeqCol = headers.indexOf('legacy_seq');
  var secretaryCol = headers.indexOf('secretary');
  var receivedDateCol = headers.indexOf('received_date');
  var trackingNoCol = headers.indexOf('tracking_no');
  var dataRange = worksSheet.getRange(2, 1, worksSheet.getLastRow() - 1, headers.length);
  var data = dataRange.getValues();
  var fixed = [];

  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var seq = String(row[legacySeqCol] || '').trim();

    if (seq === '145' && normalizeLegacyCompareValue1012_(row[secretaryCol]) === 0) {
      var oldSecretary = row[secretaryCol];
      row[secretaryCol] = 'นางเมธิตา พุทธชาติ';
      writeAuditLog_(LEGACY_IMPORT_MARKER_, 'legacy_update_1012_fix', row[headers.indexOf('work_id')],
        'secretary', oldSecretary, row[secretaryCol]);
      fixed.push('seq=145 secretary: "' + oldSecretary + '" -> "' + row[secretaryCol] + '"');
    }

    if (seq === '6/70') {
      var oldDate = row[receivedDateCol];
      var oldDateObj = oldDate ? new Date(oldDate) : null;
      // เช็คสภาพ "ผิด" ที่รู้อยู่แล้ว (ปี ค.ศ. < 2000 = ผลจากลบ 543 ปีซ้ำ) ก่อนแก้ — กันแก้ซ้ำ/แก้ผิดแถว
      if (oldDateObj && !isNaN(oldDateObj.getTime()) && oldDateObj.getFullYear() < 2000) {
        var newDate = new Date(oldDateObj.getFullYear() + 543, oldDateObj.getMonth(), oldDateObj.getDate());
        var newTrackingNo = computeLegacyTrackingNo1012_(newDate, seq);
        var conflict = works.filter(function (w) { return w.tracking_no === newTrackingNo && w.legacy_seq !== seq; })[0];
        if (conflict) {
          Logger.log('seq=6/70: หยุดแก้ — tracking_no ใหม่ "' + newTrackingNo + '" ชนกับงานเดิม work_id=' + conflict.work_id + ' (ต้องตรวจมือ)');
        } else {
          var oldTrackingNo = row[trackingNoCol];
          row[receivedDateCol] = newDate;
          row[trackingNoCol] = newTrackingNo;
          writeAuditLog_(LEGACY_IMPORT_MARKER_, 'legacy_update_1012_fix', row[headers.indexOf('work_id')],
            'received_date', formatDateTh_(oldDateObj), formatDateTh_(newDate));
          writeAuditLog_(LEGACY_IMPORT_MARKER_, 'legacy_update_1012_fix', row[headers.indexOf('work_id')],
            'tracking_no', oldTrackingNo, newTrackingNo);
          fixed.push('seq=6/70 received_date: "' + formatDateTh_(oldDateObj) + '" -> "' + formatDateTh_(newDate) + '", tracking_no: "' + oldTrackingNo + '" -> "' + newTrackingNo + '"');
        }
      }
    }
  }

  dataRange.setValues(data);
  Logger.log('=== fixLegacyUpdate1012Anomalies เสร็จ ===');
  if (fixed.length) {
    fixed.forEach(function (f) { Logger.log('แก้แล้ว: ' + f); });
  } else {
    Logger.log('ไม่พบอะไรต้องแก้ (อาจแก้ไปแล้วก่อนหน้า หรือไม่พบแถวที่ตรงเงื่อนไข)');
  }
}
