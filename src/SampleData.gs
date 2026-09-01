/**
 * ข้อมูลตัวอย่างทดสอบ (docs/DESIGN.md ลำดับพัฒนา #8 ส่วน "สร้างข้อมูลตัวอย่างทดสอบ")
 * รันด้วยตนเองจาก Apps Script Editor เหมือน installSystem() — ไม่ทำงานอัตโนมัติตอน deploy
 * (การนำเข้า Excel เดิมเป็นอีกฟังก์ชันแยกต่างหาก รอไฟล์จริงก่อนเขียน เพราะยังไม่ทราบ column schema)
 *
 * สร้างงานตัวอย่าง 6 เคส ครอบคลุมทุกกลุ่มใน Dashboard (METRIC_SECTIONS_ ใน Views.gs) พอดี
 * เพื่อให้ทดสอบ Dashboard/สแกน QR/ค้นหา/Tracking สาธารณะ/Admin ได้ครบโดยไม่ต้องรอข้อมูลจริง
 * ทุกแถวที่สร้าง (Works.created_by / StatusHistory.action_by) ทำเครื่องหมายด้วย SAMPLE_DATA_MARKER_
 * เพื่อให้ลบออกทีเดียวได้ด้วย clearSampleData() โดยไม่กระทบข้อมูลจริง
 */

var SAMPLE_DATA_MARKER_ = 'seed_sample_data';

/** สร้างข้อมูลตัวอย่าง — ปลอดภัยรันซ้ำได้ (ข้ามถ้าเคยสร้างไปแล้ว จนกว่าจะเรียก clearSampleData() ก่อน) */
function seedSampleData() {
  var ss = getSpreadsheet_();
  if (getSetting_(ss, 'sample_data_seeded', '') === 'true') {
    Logger.log('เคยสร้างข้อมูลตัวอย่างไปแล้ว — ข้าม (เรียก clearSampleData() ก่อนถ้าต้องการสร้างชุดใหม่)');
    return;
  }

  var stations = listStationsSorted_(ss).filter(function (s) { return s.active; });
  if (stations.length < 2) {
    throw new Error('ต้องมีสถานี Workflow ที่เปิดใช้งานอย่างน้อย 2 สถานี (ตรวจสอบชีต WorkStations) ก่อนสร้างข้อมูลตัวอย่าง');
  }
  var byKey = {};
  stations.forEach(function (s) { byKey[s.station_key] = s; });

  var s0 = stations[0];
  var last = stations[stations.length - 1];
  var nearDays = Math.max(1, Math.ceil(Number(s0.standard_days) * 0.85));
  var overdueDays = Number(s0.standard_days) + 2;

  // หาคู่สถานี "ต้นทาง → ปลายทาง" ที่หน่วยงานต่างกันจริง (ใช้ demo เคสส่งต่อข้ามหน่วยงาน) —
  // ถ้าไม่พบเลย (ทุกสถานีเป็นหน่วยงานเดียวกันหมด) fallback เป็น s0 → สถานีถัดไปของ s0
  var handoffOrigin = s0;
  var handoffDest = byKey[s0.next_station_key] || stations[1];
  for (var hi = 0; hi < stations.length; hi++) {
    var candidateNext = byKey[stations[hi].next_station_key];
    if (candidateNext && candidateNext.org !== stations[hi].org) {
      handoffOrigin = stations[hi];
      handoffDest = candidateNext;
      break;
    }
  }

  var count = 0;

  // 1) กำลังดำเนินการปกติ (inProgress) — เพิ่งรับเข้าสถานีแรก ยังไม่ใกล้ครบกำหนด
  insertSampleWork_(ss, {
    tracking_no: 'SAMPLE-001', citizen_id: '1100000000001',
    title_name: 'นาย', first_name: 'สมชาย', last_name: 'ใจดี', position: 'นักวิชาการสาธารณสุข',
    current_level: 'ปฏิบัติการ', requested_level: 'ชำนาญการ', work_type: 'ผลงานเชิงวิชาการ',
    work_title: 'แนวทางการดูแลผู้ป่วยเบาหวานในชุมชน (ตัวอย่าง)', org_from: 'โรงพยาบาลตัวอย่าง A',
    current_station_key: s0.station_key, current_status_public: s0.public_status,
    handoff_pending: false, current_owner_org: s0.org,
    history: [
      { action: 'registered', from_station: '', to_station: s0.station_key, from_org: '', to_org: s0.org,
        action_by_org: s0.org, action_date: daysAgo_(0), note: 'ข้อมูลตัวอย่าง' },
    ],
  });
  count++;

  // 2) ใกล้ครบกำหนด (nearDue) — อยู่ในสถานีแรกมาแล้ว ~85% ของวันมาตรฐาน
  insertSampleWork_(ss, {
    tracking_no: 'SAMPLE-002', citizen_id: '1100000000002',
    title_name: 'นาง', first_name: 'สมหญิง', last_name: 'รักเรียน', position: 'พยาบาลวิชาชีพ',
    current_level: 'ชำนาญการ', requested_level: 'ชำนาญการพิเศษ', work_type: 'งานวิจัย (R2R)',
    work_title: 'ผลของโปรแกรมส่งเสริมสุขภาพต่อพฤติกรรมผู้สูงอายุ (ตัวอย่าง)', org_from: 'โรงพยาบาลตัวอย่าง B',
    current_station_key: s0.station_key, current_status_public: s0.public_status,
    handoff_pending: false, current_owner_org: s0.org,
    history: [
      { action: 'registered', from_station: '', to_station: s0.station_key, from_org: '', to_org: s0.org,
        action_by_org: s0.org, action_date: daysAgo_(nearDays), note: 'ข้อมูลตัวอย่าง' },
    ],
  });
  count++;

  // 3) เกินกำหนด (overdue) — อยู่ในสถานีแรกเกินวันมาตรฐานแล้ว
  insertSampleWork_(ss, {
    tracking_no: 'SAMPLE-003', citizen_id: '1100000000003',
    title_name: 'นาย', first_name: 'วิชัย', last_name: 'ช้ามาก', position: 'นักกายภาพบำบัด',
    current_level: 'ปฏิบัติการ', requested_level: 'ชำนาญการ', work_type: 'ผลงานเชิงนวัตกรรม',
    work_title: 'อุปกรณ์ช่วยฟื้นฟูข้อเข่าต้นทุนต่ำ (ตัวอย่าง)', org_from: 'โรงพยาบาลตัวอย่าง C',
    current_station_key: s0.station_key, current_status_public: s0.public_status,
    handoff_pending: false, current_owner_org: s0.org,
    history: [
      { action: 'registered', from_station: '', to_station: s0.station_key, from_org: '', to_org: s0.org,
        action_by_org: s0.org, action_date: daysAgo_(overdueDays), note: 'ข้อมูลตัวอย่าง' },
    ],
  });
  count++;

  // 4) ส่งต่อแล้ว รอปลายทางรับ (awaitingDestination + pendingReceive)
  insertSampleWork_(ss, {
    tracking_no: 'SAMPLE-004', citizen_id: '1100000000004',
    title_name: 'นางสาว', first_name: 'ปิยะดา', last_name: 'ก้าวไว', position: 'นักโภชนาการ',
    current_level: 'ชำนาญการ', requested_level: 'ชำนาญการพิเศษ', work_type: 'คู่มือ/แนวปฏิบัติ',
    work_title: 'คู่มือโภชนบำบัดผู้ป่วยไตเรื้อรัง (ตัวอย่าง)', org_from: 'โรงพยาบาลตัวอย่าง D',
    current_station_key: handoffDest.station_key, current_status_public: handoffDest.public_status,
    handoff_pending: true, current_owner_org: handoffOrigin.org,
    next_step_text: 'ส่งต่อแล้ว รอหน่วยงาน "' + handoffDest.org + '" สแกนรับเอกสาร',
    history: [
      { action: 'registered', from_station: '', to_station: handoffOrigin.station_key, from_org: '', to_org: handoffOrigin.org,
        action_by_org: handoffOrigin.org, action_date: daysAgo_(3), note: 'ข้อมูลตัวอย่าง' },
      { action: 'forwarded', from_station: handoffOrigin.station_key, to_station: handoffDest.station_key,
        from_org: handoffOrigin.org, to_org: handoffDest.org, action_by_org: handoffOrigin.org, action_date: daysAgo_(1), note: '' },
    ],
  });
  count++;

  // 5) ส่งกลับให้เจ้าของผลงานแก้ไข (returnedForRevision) — ใช้ทดสอบหน้า Tracking สาธารณะด้วย
  insertSampleWork_(ss, {
    tracking_no: 'SAMPLE-005', citizen_id: '1100000000005',
    title_name: 'นาย', first_name: 'ธนกร', last_name: 'รอแก้ไข', position: 'เภสัชกร',
    current_level: 'ปฏิบัติการ', requested_level: 'ชำนาญการ', work_type: 'ผลงานเชิงวิชาการ',
    work_title: 'การพัฒนาระบบติดตามการใช้ยาในผู้ป่วยโรคเรื้อรัง (ตัวอย่าง)', org_from: 'โรงพยาบาลตัวอย่าง E',
    current_station_key: s0.station_key, current_status_public: 'need_revision',
    handoff_pending: true, current_owner_org: s0.org,
    next_step_text: 'รอเจ้าของผลงานส่งฉบับแก้ไขกลับมาภายใน ' + formatDateInput_(daysFromNow_(7)),
    history: [
      { action: 'registered', from_station: '', to_station: s0.station_key, from_org: '', to_org: s0.org,
        action_by_org: s0.org, action_date: daysAgo_(5), note: 'ข้อมูลตัวอย่าง' },
      { action: 'revision_requested', from_station: s0.station_key, to_station: s0.station_key,
        from_org: s0.org, to_org: s0.org, action_by_org: s0.org, action_date: daysAgo_(1),
        revision_reasons: 'เอกสารไม่ครบถ้วน, ลายมือชื่อไม่ครบ', revision_due_date: formatDateInput_(daysFromNow_(7)),
        note: 'กรุณาแนบสำเนาบัตรประชาชนและลายมือชื่อรับรองเพิ่มเติม (ตัวอย่าง)' },
    ],
  });
  count++;

  // 6) เสร็จสิ้น (done, terminal) — ใช้ทดสอบรายงาน CSV / Audit Log
  insertSampleWork_(ss, {
    tracking_no: 'SAMPLE-006', citizen_id: '1100000000006',
    title_name: 'นาง', first_name: 'มาลี', last_name: 'เสร็จแล้ว', position: 'นักเทคนิคการแพทย์',
    current_level: 'ชำนาญการ', requested_level: 'ชำนาญการพิเศษ', work_type: 'นวัตกรรมดิจิทัล',
    work_title: 'ระบบแจ้งเตือนผลตรวจทางห้องปฏิบัติการอัตโนมัติ (ตัวอย่าง)', org_from: 'โรงพยาบาลตัวอย่าง F',
    current_station_key: last.station_key, current_status_public: 'done',
    handoff_pending: false, current_owner_org: last.org,
    history: [
      { action: 'registered', from_station: '', to_station: s0.station_key, from_org: '', to_org: s0.org,
        action_by_org: s0.org, action_date: daysAgo_(20), note: 'ข้อมูลตัวอย่าง' },
      { action: 'closed', from_station: last.station_key, to_station: last.station_key,
        from_org: last.org, to_org: last.org, action_by_org: last.org, action_date: daysAgo_(1),
        note: 'ปิดงานตัวอย่างสำหรับทดสอบรายงาน' },
    ],
  });
  count++;

  setSetting_(ss, 'sample_data_seeded', 'true', 'สร้างข้อมูลตัวอย่างทดสอบแล้ว (seedSampleData) — ลบด้วย clearSampleData() แล้วรันใหม่ได้');
  Logger.log('สร้างข้อมูลตัวอย่างสำเร็จ ' + count + ' รายการ (tracking_no: SAMPLE-001 ถึง SAMPLE-00' + count + ')');
}

/** ลบข้อมูลตัวอย่างทั้งหมดที่สร้างจาก seedSampleData() ออก (ไม่กระทบข้อมูลจริง) — รันด้วยตนเองจาก Apps Script Editor */
function clearSampleData() {
  var ss = getSpreadsheet_();
  deleteRowsWhere_(ss.getSheetByName(SHEET.WORKS), 'created_by', SAMPLE_DATA_MARKER_);
  deleteRowsWhere_(ss.getSheetByName(SHEET.STATUS_HISTORY), 'action_by', SAMPLE_DATA_MARKER_);
  setSetting_(ss, 'sample_data_seeded', 'false', 'ล้างข้อมูลตัวอย่างแล้ว (clearSampleData) — รัน seedSampleData() ใหม่ได้');
  Logger.log('ล้างข้อมูลตัวอย่างทดสอบเรียบร้อย');
}

/** เขียนแถว Works 1 แถว + StatusHistory ตาม def.history ทั้งหมด — ใช้เฉพาะ seedSampleData() */
function insertSampleWork_(ss, def) {
  var workId = Utilities.getUuid();
  var qrToken = generateUniqueQrToken_(ss);
  var nowTs = now_();
  var lastActionDate = def.history.length ? def.history[def.history.length - 1].action_date : nowTs;

  appendRowByHeader_(ss.getSheetByName(SHEET.WORKS), SHEET_HEADERS[SHEET.WORKS], {
    work_id: workId,
    tracking_no: def.tracking_no,
    qr_token: qrToken,
    citizen_id_last4: def.citizen_id.slice(-4),
    citizen_id_encrypted: encryptCitizenId_(def.citizen_id),
    citizen_id_hash: hashCitizenId_(def.citizen_id),
    title_name: def.title_name, first_name: def.first_name, last_name: def.last_name,
    position: def.position, current_level: def.current_level, requested_level: def.requested_level,
    work_type: def.work_type, work_title: def.work_title, org_from: def.org_from,
    phone: '', email: '', cover_image_url: '',
    received_date: def.history[0].action_date,
    current_station_key: def.current_station_key,
    current_status_public: def.current_status_public,
    handoff_pending: def.handoff_pending,
    current_owner_org: def.current_owner_org,
    current_handler_name: '',
    updated_at: lastActionDate,
    next_step_text: def.next_step_text || '',
    created_by: SAMPLE_DATA_MARKER_,
    created_at: def.history[0].action_date,
  });

  def.history.forEach(function (h) {
    appendRowByHeader_(ss.getSheetByName(SHEET.STATUS_HISTORY), SHEET_HEADERS[SHEET.STATUS_HISTORY], {
      history_id: Utilities.getUuid(), work_id: workId, tracking_no: def.tracking_no, action: h.action,
      from_station: h.from_station, to_station: h.to_station, from_org: h.from_org, to_org: h.to_org,
      action_by: SAMPLE_DATA_MARKER_, action_by_org: h.action_by_org, action_date: h.action_date,
      note: h.note || '', revision_reasons: h.revision_reasons || '', revision_due_date: h.revision_due_date || '',
      attachment_url: '', created_at: h.action_date,
    });
  });

  return workId;
}

/** ลบทุกแถวในชีตที่ค่าคอลัมน์ fieldName ตรงกับ value (ไล่ลบจากล่างขึ้นบนกันเลขแถวเลื่อน) */
function deleteRowsWhere_(sheet, fieldName, value) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var col = headers.indexOf(fieldName);
  if (col === -1) return;
  var values = sheet.getRange(2, col + 1, lastRow - 1, 1).getValues();
  for (var i = values.length - 1; i >= 0; i--) {
    if (values[i][0] === value) sheet.deleteRow(i + 2);
  }
}

function daysAgo_(n) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

function daysFromNow_(n) {
  return new Date(Date.now() + n * 24 * 60 * 60 * 1000);
}

function formatDateInput_(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}
