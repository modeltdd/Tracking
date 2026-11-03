/**
 * สแกน QR รับงาน + ปุ่ม Action บนสถานะงาน (docs/DESIGN.md ลำดับพัฒนา #4, ตาราง 3.2)
 * ปุ่ม Action แทน dropdown สถานะ — server ตรวจสิทธิ์/workflow guard ทุกครั้ง (ห้ามเชื่อ client)
 *
 * เงื่อนไข "เจ้าของงานปัจจุบัน" (isOwnerActive) ตีความว่า current_owner_org ตรงหน่วยงานผู้ใช้
 * และ handoff_pending=false (เอกสารอยู่ในมือจริง ไม่ใช่ระหว่างส่ง/รอส่งมอบ) — กันกดปุ่มระหว่างเอกสารลอยอยู่กลางทาง
 */

/** action ที่ Admin เท่านั้นกดได้ (ตาราง 3.2) */
var ACTIONS_ADMIN_ONLY_ = { closed: true, reassigned: true };

/** สีปุ่มตามความหนักเบาของผลลัพธ์ */
var ACTION_BUTTON_VARIANT_ = {
  more_info: 'secondary',
  terminated: 'danger',
  closed: 'danger',
  reassigned: 'secondary',
};

/**
 * คำนวณ action "อรรถประโยชน์" (utility) ที่ผู้ใช้คนนี้กดได้จริงกับงานนี้ ณ ขณะนี้ — แยกจากปุ่ม state
 * transition หลัก (ดู computeEligibleTransitions_) เพราะ action พวกนี้ไม่ย้าย state ตาม workflow
 * (more_info/terminated) หรือเป็น Admin override ที่ไม่ผูกกับ state ใดเป็นการเฉพาะ (closed/reassigned)
 * ต้องเรียกซ้ำฝั่ง server ก่อนบันทึกทุกครั้ง (ห้ามเชื่อค่าจาก client)
 */
function computeEligibleActions_(work, station, user) {
  var isTerminal = TERMINAL_STATUSES_.indexOf(work.current_status_public) !== -1;
  var isAdmin = user.role === 'Admin';
  var isOwnerActive = !isTerminal && !work.handoff_pending && work.current_owner_org === user.organization;

  var list = [];
  if (isOwnerActive) list.push('more_info', 'terminated');
  if (isAdmin && !isTerminal) list.push('closed', 'reassigned');
  return list;
}

/**
 * คำนวณ "ปุ่มเปลี่ยนสถานะ" (state transition) ที่ผู้ใช้คนนี้กดได้จริงกับงานนี้ ณ ขณะนี้ — โมเดล 24-state
 * (WorkflowStates/WorkflowTransitions, 2026-09-08) แทนที่กลไก forwarded/received เดิม รองรับแตกสาย
 * (1 state ไปได้หลายทาง เช่น state 7: ผ่าน/ไม่ผ่าน/แก้ไข 2 เดือน/แก้ไข 6 เดือน)
 * ต้องเรียกซ้ำฝั่ง server ก่อนบันทึกทุกครั้ง (ห้ามเชื่อค่าจาก client)
 */
function computeEligibleTransitions_(ss, work, stateDef, user) {
  var isTerminal = TERMINAL_STATUSES_.indexOf(work.current_status_public) !== -1;
  if (isTerminal || !stateDef) return [];
  var isAdmin = user.role === 'Admin';
  var isResponsible = user.organization === resolveResponsibleOrg_(stateDef, work);
  if (!isAdmin && !isResponsible) return [];

  var transitions = readSheetAsObjects_(ss.getSheetByName(SHEET.WORKFLOW_TRANSITIONS));
  return transitions.filter(function (t) {
    return t.active && t.from_state === work.current_station_key;
  });
}

/**
 * ประมวลผล state transition ที่ส่งมาจากฟอร์ม (e.parameter.transition_id) — ตรวจสิทธิ์ซ้ำกับ
 * computeEligibleTransitions_ เสมอ (ห้ามเชื่อ client), อัปเดต Works + StatusHistory (action='transition')
 * คืน { ok:true, work_id, to_station } หรือ { ok:false, errors:[...], work }
 */
function performStateTransition_(ss, user, e) {
  var p = (e && e.parameter) || {};
  var workId = String(p.work_id || '').trim();
  var transitionId = String(p.transition_id || '').trim();
  var note = String(p.note || '').trim();

  var work = findWorkById_(ss, workId);
  if (!work) return { ok: false, errors: ['ไม่พบงานที่ระบุ'] };

  var stationsMap = getStationsMap_(ss);
  var stateDef = stationsMap[work.current_station_key];
  var eligible = computeEligibleTransitions_(ss, work, stateDef, user);
  var transition = null;
  for (var i = 0; i < eligible.length; i++) {
    if (eligible[i].transition_id === transitionId) { transition = eligible[i]; break; }
  }
  if (!transition) {
    return { ok: false, errors: ['ไม่สามารถทำรายการนี้ได้ — สิทธิ์ไม่ตรงหรือสถานะของงานเปลี่ยนไปแล้ว กรุณาสแกนใหม่'], work: work };
  }
  if (transition.requires_note && !note) {
    return { ok: false, errors: ['กรุณาระบุหมายเหตุ'], work: work };
  }

  // 2026-11-03 (หน้า Staff "Workflow เดียว" ใหม่ — renderStaffWorkflowTable_, Views.gs) — รองรับให้เจ้าหน้าที่
  // เลือก "วันที่ดำเนินการ" เองได้ตอนกดเปลี่ยนสถานะ (ของจริงอาจเกิดก่อนวันที่กดบันทึกในระบบ) ไม่บังคับ ถ้าไม่ส่ง
  // action_date มา (ทุก caller เดิม เช่นหน้าสแกน QR) ใช้ now() เหมือนเดิมทุกประการ — เขียนลง StatusHistory.action_date
  // เท่านั้น ไม่กระทบ Works.updated_at (ยังเป็นเวลาบันทึกจริงเสมอ ผ่าน updateWorkRow_ ค่าเริ่มต้นของมันเอง)
  var actionDateTs = now_();
  var rawActionDate = String(p.action_date || '').trim();
  if (rawActionDate) {
    var customActionDate = new Date(rawActionDate);
    if (isNaN(customActionDate.getTime())) return { ok: false, errors: ['วันที่ดำเนินการไม่ถูกต้อง'], work: work };
    actionDateTs = customActionDate;
  }

  // 2026-10-21 ตามข้อแก้ไขผู้บริหาร — ผลการพิจารณาเป็น "แก้ไข 2 เดือน"/"แก้ไข 6 เดือน" (transition ไป s7_2/s7_3)
  // ต้องให้เจ้าหน้าที่ระบุ "วันครบกำหนดแก้ไข" เองจากปฏิทินเสมอ ห้ามคำนวณอัตโนมัติจาก 2/6 เดือน (ตามที่ผู้บริหารสั่ง
  // ชัดเจน) ตรวจจาก transition.to_state (workflow code จริง) ไม่ใช่ label/ข้อความปุ่ม — กันกระทบ transition อื่น
  var revisionDueDateObj = null;
  if (REVISION_DUE_DATE_STATE_KEYS_[transition.to_state]) {
    var rawDueDate = String(p.revision_due_date || '').trim();
    if (!rawDueDate) return { ok: false, errors: ['กรุณาระบุวันครบกำหนดแก้ไข'], work: work };
    revisionDueDateObj = new Date(rawDueDate);
    if (isNaN(revisionDueDateObj.getTime())) return { ok: false, errors: ['กรุณาระบุวันครบกำหนดแก้ไข'], work: work };
  }

  var newState = stationsMap[transition.to_state];
  if (!newState) return { ok: false, errors: ['ไม่พบ state ปลายทาง (' + transition.to_state + ')'], work: work };

  var nowTs = now_();
  var newOwnerOrg = resolveResponsibleOrg_(newState, work);
  var updates = {
    current_station_key: newState.station_key, current_status_public: newState.public_status,
    handoff_pending: false, current_owner_org: newOwnerOrg,
    current_handler_name: user.display_name || user.user_email, next_step_text: newState.public_hint || '',
  };
  if (transition.result_value) updates.evaluation_result = transition.result_value;
  // 2026-10-21 — เขียนวันครบกำหนดแก้ไขที่เจ้าหน้าที่เลือกเองลง Works (เฉพาะ transition s7_2/s7_3 เท่านั้น ตัวแปร
  // เป็น null สำหรับ transition อื่นทั้งหมด จึงไม่กระทบ/เขียนทับค่าเดิมของ transition อื่นเลย)
  if (revisionDueDateObj) updates.revision_due_date = revisionDueDateObj;
  updateWorkRow_(ss, work.work_id, updates);

  appendRowByHeader_(ss.getSheetByName(SHEET.STATUS_HISTORY), SHEET_HEADERS[SHEET.STATUS_HISTORY], {
    history_id: Utilities.getUuid(), work_id: work.work_id, tracking_no: work.tracking_no, action: 'transition',
    from_station: work.current_station_key, to_station: newState.station_key,
    from_org: work.current_owner_org, to_org: newOwnerOrg,
    action_by: user.user_email, action_by_org: user.organization, action_date: actionDateTs,
    note: transition.button_label + (note ? ' — ' + note : ''),
    // revision_due_date: คอลัมน์นี้มีอยู่แล้วแต่เดิมเขียนค่าว่างเสมอ (ยังไม่เคยมี feature ใช้จริง) ตอนนี้บันทึกค่า
    // จริงเป็น audit trail ของการตั้งวันครบกำหนดแก้ไขแต่ละครั้ง (ข้อ 9 — ผู้แก้ไข/วันเวลา มีอยู่แล้วใน action_by/
    // action_date คอลัมน์เดิมของแถวนี้)
    revision_reasons: '', revision_due_date: revisionDueDateObj || '', attachment_url: '', created_at: nowTs,
  });

  return { ok: true, work_id: work.work_id, to_station: newState.station_key, action: 'transition' };
}

/**
 * Diagnostic (2026-10-21, ข้อแก้ไขผู้บริหาร ข้อ 3 — ตรวจ data flow จริง ไม่เดา) — log เฉพาะ 4 ค่าที่ผู้ใช้ขอ
 * ของงาน 1 รายการ ตาม tracking_no: registration_no/current_state/result/revision_due_date รันจาก Editor
 * โดยตรง (ไม่มี _ ต่อท้ายชื่อฟังก์ชัน — ขึ้นใน dropdown "เรียกใช้ฟังก์ชัน" ได้เลย) ไม่ระบุ tracking_no จะใช้
 * ค่าเริ่มต้น "69-220" (ตัวอย่างที่ผู้ใช้อ้างถึง) — ชี้ชัดในผล log ว่าปัญหาอยู่ที่ขั้นตอน Save หรือขั้นตอน
 * render ของ Owner View กันเดา
 */
function logWorkRevisionDueDate(trackingNo) {
  trackingNo = trackingNo || '69-220';
  var ss = getSpreadsheet_();
  var works = readSheetAsObjects_(ss.getSheetByName(SHEET.WORKS));
  var work = works.filter(function (w) { return String(w.tracking_no || '').trim() === String(trackingNo).trim(); })[0];
  if (!work) { Logger.log('=== ไม่พบงาน tracking_no="' + trackingNo + '" ==='); return; }
  var stationsMap = getStationsMap_(ss);
  var station = stationsMap[work.current_station_key];
  Logger.log('registration_no = ' + work.tracking_no);
  Logger.log('current_state = ' + (station ? station.station_order : '(ไม่พบ station)') + ' (station_key: ' + work.current_station_key + ')');
  Logger.log('result (evaluation_result) = ' + JSON.stringify(work.evaluation_result));
  Logger.log('revision_due_date = ' + JSON.stringify(work.revision_due_date) + ' (typeof: ' + typeof work.revision_due_date + ')');
  if (!work.revision_due_date) {
    Logger.log('=== revision_due_date ว่าง/ไม่มีค่า — root cause อยู่ที่ขั้นตอน "Save" จริง (transition นี้เกิดขึ้นก่อนมี feature นี้ หรือตอน transition ไม่ได้กรอกวันที่) ไม่ใช่ปัญหาการแสดงผล Owner View — ใช้กล่อง "กำหนด/แก้ไขวันครบกำหนดแก้ไข (Admin)" ในหน้ารายละเอียดผลงานกำหนดย้อนหลังได้ ===');
  } else {
    Logger.log('=== revision_due_date มีค่าจริงแล้ว ถ้า Owner View ยังไม่แสดง "ภายในวันที่" root cause อยู่ที่ขั้นตอน render/Owner View แทน ไม่ใช่ Save ===');
  }
}

/**
 * 2026-10-21 ตามข้อแก้ไขผู้บริหาร ข้อ 8 — Admin กำหนด/แก้ไข "วันครบกำหนดแก้ไข" ย้อนหลังให้งานที่ผลรอบ 1 เป็น
 * "แก้ไข 2/6 เดือน" (s7_2/s7_3) อยู่แล้ว แต่ revision_due_date ยังว่าง (เช่น transition เกิดขึ้นก่อนมี feature
 * นี้) ไม่ใช่ state transition ใหม่ — ไม่แตะ current_station_key/current_status_public/evaluation_result เลย
 * แก้แค่ revision_due_date เท่านั้น ไม่อัปเดต updated_at ด้วย (ไม่ใช่เหตุการณ์ความคืบหน้าจริงของ workflow —
 * ถ้าปล่อยให้ updated_at ขยับ จะกระทบบรรทัด "วันที่ ::" บนการ์ดผลการพิจารณาของ Owner ให้เข้าใจผิดว่ามีการ
 * อัปเดตสถานะใหม่) ตรวจสิทธิ์ (Admin เท่านั้น) ทำที่ doPost (Code.gs) ก่อนเรียกฟังก์ชันนี้เสมอ — ที่นี่ตรวจซ้ำ
 * เฉพาะเงื่อนไข business (ต้องอยู่เส้นทางแก้ไขจริง + วันที่ต้อง valid) คืน { ok, work_id, work, errors }
 */
function performSetRevisionDueDate_(ss, user, e) {
  var p = (e && e.parameter) || {};
  var workId = String(p.work_id || '').trim();
  var work = findWorkById_(ss, workId);
  if (!work) return { ok: false, errors: ['ไม่พบงานที่ระบุ'], work: null };

  var resolved = getResolvedFirstRoundStep_(buildPublicResultData_(ss, work).steps);
  if (!resolved || !REVISION_DUE_DATE_STATE_KEYS_[resolved.key]) {
    return { ok: false, errors: ['งานนี้ไม่ได้อยู่ในเส้นทาง "แก้ไข 2/6 เดือน" — ไม่สามารถกำหนดวันครบกำหนดแก้ไขได้'], work: work, work_id: work.work_id };
  }

  var rawDueDate = String(p.revision_due_date || '').trim();
  var dueDateObj = rawDueDate ? new Date(rawDueDate) : null;
  if (!rawDueDate || isNaN(dueDateObj.getTime())) {
    return { ok: false, errors: ['กรุณาระบุวันครบกำหนดแก้ไข'], work: work, work_id: work.work_id };
  }

  var oldDueText = formatDateDDMMYYYYBuddhist_(work.revision_due_date) || '(ยังไม่เคยกำหนด)';
  updateWorkRow_(ss, work.work_id, { revision_due_date: dueDateObj, updated_at: work.updated_at });
  writeAuditLog_(user.user_email, 'revision_due_date_edit', work.work_id, 'revision_due_date', oldDueText, formatDateDDMMYYYYBuddhist_(dueDateObj));

  return { ok: true, work_id: work.work_id, work: work, errors: [] };
}

/**
 * 2026-11-03 — หน้า Staff "Workflow เดียว" ใหม่ (renderStaffWorkflowTable_, Views.gs) ข้อ 19 ของ requirement:
 * แก้ไข "วันที่ดำเนินการ" ของขั้นตอนที่เสร็จแล้วย้อนหลัง — แก้แค่ StatusHistory.action_date ของแถวนั้นแถวเดียว
 * (reuse updateSheetRowByKey_ เดิม, Utils.gs) ไม่แตะ Works เลยแม้แต่คอลัมน์เดียว (ไม่ใช่ state transition —
 * current_station_key/current_status_public/evaluation_result/revision_due_date เดิมทั้งหมดไม่ถูกแตะ) ทุกครั้ง
 * ที่แก้ต้องลง AuditLog เก่า/ใหม่/ผู้แก้/เวลา (ข้อ 19 — writeAuditLog_ เดิมมี user_email/timestamp ให้อยู่แล้ว)
 * สิทธิ์: Admin แก้ได้ทุกแถว, เจ้าหน้าที่ทั่วไปแก้ได้เฉพาะ station ที่หน่วยงานตนเองเป็นผู้รับผิดชอบจริง
 * (resolveResponsibleOrg_ เดิม — scoping เดียวกับ computeEligibleTransitions_ ทั้งระบบ ไม่สร้างสิทธิ์ใหม่)
 * คืน { ok, work_id, errors }
 */
function performEditStepDate_(ss, user, e) {
  var p = (e && e.parameter) || {};
  var workId = String(p.work_id || '').trim();
  var historyId = String(p.history_id || '').trim();
  var work = findWorkById_(ss, workId);
  if (!work) return { ok: false, errors: ['ไม่พบงานที่ระบุ'] };

  var historySheet = ss.getSheetByName(SHEET.STATUS_HISTORY);
  var historyRow = readSheetAsObjects_(historySheet).filter(function (h) {
    return h.history_id === historyId && h.work_id === workId;
  })[0];
  if (!historyRow) return { ok: false, errors: ['ไม่พบประวัติขั้นตอนที่ระบุ'] };

  var stationsMap = getStationsMap_(ss);
  var stationDef = stationsMap[historyRow.to_station];
  var isAdmin = user.role === 'Admin';
  var isResponsible = stationDef && user.organization === resolveResponsibleOrg_(stationDef, work);
  if (!isAdmin && !isResponsible) {
    return { ok: false, errors: ['ไม่มีสิทธิ์แก้ไขวันที่ของขั้นตอนนี้'] };
  }

  var rawNewDate = String(p.action_date || '').trim();
  var newDateObj = rawNewDate ? new Date(rawNewDate) : null;
  if (!rawNewDate || isNaN(newDateObj.getTime())) {
    return { ok: false, errors: ['กรุณาระบุวันที่ดำเนินการ'] };
  }

  var oldDateText = formatDateDDMMYYYYBuddhist_(historyRow.action_date) || '(ยังไม่เคยกำหนด)';
  updateSheetRowByKey_(historySheet, 'history_id', historyId, { action_date: newDateObj });
  writeAuditLog_(user.user_email, 'step_date_edit', work.work_id,
    'action_date (' + historyRow.to_station + ')', oldDateText, formatDateDDMMYYYYBuddhist_(newDateObj));

  return { ok: true, work_id: work.work_id, errors: [] };
}

/**
 * ประมวลผล action ที่ส่งมาจากฟอร์ม (e.parameter) — ตรวจสิทธิ์ซ้ำ, validate ฟิลด์เฉพาะ action,
 * อัปเดตแถว Works + บันทึก StatusHistory เสมอ (append-only)
 * คืน { ok:true, work_id, action } หรือ { ok:false, errors:[...] }
 */
function performWorkAction_(ss, user, e) {
  var p = (e && e.parameter) || {};
  var workId = p.work_id;
  var action = p.action;

  var work = findWorkById_(ss, workId);
  if (!work) return { ok: false, errors: ['ไม่พบงานที่ระบุ'] };

  var stationsMap = getStationsMap_(ss);
  var station = stationsMap[work.current_station_key];
  var eligible = computeEligibleActions_(work, station, user);
  if (eligible.indexOf(action) === -1) {
    return { ok: false, errors: ['ไม่สามารถทำรายการนี้ได้ — สิทธิ์ไม่ตรงหรือสถานะของงานเปลี่ยนไปแล้ว กรุณาสแกนใหม่'] };
  }

  var nowTs = now_();
  var updates = {};
  var hist = {
    history_id: Utilities.getUuid(), work_id: work.work_id, tracking_no: work.tracking_no, action: action,
    from_station: work.current_station_key, to_station: work.current_station_key,
    from_org: work.current_owner_org, to_org: work.current_owner_org,
    action_by: user.user_email, action_by_org: user.organization, action_date: nowTs,
    note: '', revision_reasons: '', revision_due_date: '', attachment_url: '', created_at: nowTs,
  };

  switch (action) {
    case 'more_info':
      var infoNote = String(p.note || '').trim();
      if (!infoNote) return { ok: false, errors: ['กรุณาระบุรายละเอียดที่ขอเพิ่มเติม'] };
      hist.note = infoNote;
      break;

    case 'terminated':
      var termNote = String(p.note || '').trim();
      if (!termNote) return { ok: false, errors: ['กรุณาระบุเหตุผลที่ยุติกระบวนการ'] };
      updates = { current_status_public: 'terminated', next_step_text: '' };
      hist.note = termNote;
      break;

    case 'closed':
      var closeNote = String(p.note || '').trim();
      if (!closeNote) return { ok: false, errors: ['Admin ต้องระบุเหตุผลก่อนปิดงาน'] };
      updates = { current_status_public: 'done', handoff_pending: false, next_step_text: '' };
      hist.note = closeNote;
      writeAuditLog_(user.user_email, 'closed', work.work_id, 'current_status_public', work.current_status_public, 'done');
      break;

    case 'reassigned':
      var targetOrg = String(p.target_org || '').trim();
      var targetStationKey = String(p.target_station || '').trim();
      var reassignNote = String(p.note || '').trim();
      if (!targetOrg) return { ok: false, errors: ['กรุณาเลือกหน่วยงานที่รับผิดชอบใหม่'] };
      if (!reassignNote) return { ok: false, errors: ['Admin ต้องระบุเหตุผลก่อนเปลี่ยนผู้รับผิดชอบ'] };

      if (targetStationKey) {
        // ย้ายสถานีด้วย (ไม่ใช่แค่เปลี่ยนหน่วยงานเจ้าของ) — ใช้ตอนต้องดันงานย้อนกลับเข้าสถานีก่อนหน้า
        // เช่น ส่งกลับเข้ารอบพิจารณาใหม่หลังเจ้าของผลงานแก้ไขเสร็จ ซึ่ง action forwarded ทำไม่ได้ (next_station_key ไปทางเดียว)
        var targetStation = stationsMap[targetStationKey];
        if (!targetStation) return { ok: false, errors: ['ไม่พบสถานีที่เลือก'] };
        updates = { current_station_key: targetStation.station_key, current_owner_org: targetStation.org,
          current_status_public: targetStation.public_status, handoff_pending: false, next_step_text: targetStation.public_hint || '' };
        hist.to_station = targetStation.station_key;
        hist.to_org = targetStation.org;
        hist.note = reassignNote;
        writeAuditLog_(user.user_email, 'reassigned', work.work_id, 'current_station_key', work.current_station_key, targetStation.station_key);
      } else {
        updates = { current_owner_org: targetOrg };
        hist.to_org = targetOrg;
        hist.note = reassignNote;
        writeAuditLog_(user.user_email, 'reassigned', work.work_id, 'current_owner_org', work.current_owner_org, targetOrg);
      }
      break;

    default:
      return { ok: false, errors: ['ไม่รู้จัก action นี้'] };
  }

  updateWorkRow_(ss, work.work_id, updates);
  appendRowByHeader_(ss.getSheetByName(SHEET.STATUS_HISTORY), SHEET_HEADERS[SHEET.STATUS_HISTORY], hist);

  return { ok: true, work_id: work.work_id, action: action };
}

/** เส้นทางหน้า "สแกน QR" ทั้งหมด (ไม่มี token / มี token / เลือก action แล้ว) — ใช้ทั้ง auto-route จาก ?t= และ ?page=scan */
function renderScanRoute_(ss, user, params, baseUrl) {
  var token = String(params.t || '').trim().toUpperCase();
  if (!token) {
    return renderStaffPage_('สแกน QR', renderScanEntryBody_(baseUrl, ''), user, 'scan', baseUrl);
  }

  var work = findWorkByQrToken_(ss, token);
  if (!work) {
    return renderStaffPage_('สแกน QR', renderScanEntryBody_(baseUrl, 'ไม่พบเอกสารที่ตรงกับรหัส "' + token + '"'), user, 'scan', baseUrl);
  }

  var stationsMap = getStationsMap_(ss);
  var station = stationsMap[work.current_station_key];
  var eligible = computeEligibleActions_(work, station, user);
  var eligibleTransitions = computeEligibleTransitions_(ss, work, station, user);

  var doAction = String(params.do || '').trim();
  var transId = String(params.trans || '').trim();

  if (transId) {
    var transitionMatch = null;
    for (var i = 0; i < eligibleTransitions.length; i++) {
      if (eligibleTransitions[i].transition_id === transId) { transitionMatch = eligibleTransitions[i]; break; }
    }
    if (!transitionMatch) {
      // 2026-10-08 ตามที่ผู้ใช้ขอ — หน้า "รายละเอียดผลงาน" (renderScanWorkBody_) เปลี่ยน title header จาก
      // "สแกน QR" เป็น "รายละเอียดข้อมูล" เฉพาะหน้านี้ (route/function name/QR logic เดิมทั้งหมด ไม่แตะ) หน้า
      // สแกนเข้า token จริง (renderScanEntryBody_ ด้านบน) ยังเป็น "สแกน QR" เหมือนเดิม
      return renderStaffPage_('รายละเอียดข้อมูล', renderScanWorkBody_(ss, work, eligible, eligibleTransitions, baseUrl, token,
        ['ไม่สามารถทำรายการนี้ได้ในสถานะปัจจุบัน']), user, 'scan', baseUrl);
    }
    return renderStaffPage_('สแกน QR', renderTransitionFormBody_(work, transitionMatch, baseUrl, token, [], {}), user, 'scan', baseUrl);
  }

  if (doAction) {
    if (eligible.indexOf(doAction) === -1) {
      return renderStaffPage_('รายละเอียดข้อมูล', renderScanWorkBody_(ss, work, eligible, eligibleTransitions, baseUrl, token,
        ['ไม่สามารถทำรายการนี้ได้ในสถานะปัจจุบัน']), user, 'scan', baseUrl);
    }
    return renderStaffPage_('สแกน QR', renderActionFormBody_(ss, work, station, doAction, baseUrl, token, [], {}), user, 'scan', baseUrl);
  }

  return renderStaffPage_('รายละเอียดข้อมูล', renderScanWorkBody_(ss, work, eligible, eligibleTransitions, baseUrl, token, []), user, 'scan', baseUrl);
}

/** งานที่หน่วยงานนี้ทำ transition ต่อได้ ณ ขณะนี้ — ใช้กับเมนู "ส่งต่อ" (ไม่ต้องสแกน QR ก่อน) */
function getForwardableWorks_(ss, org) {
  var stationsMap = getStationsMap_(ss);
  var works = readSheetAsObjects_(ss.getSheetByName(SHEET.WORKS));
  var fakeUser = { role: 'ผู้รับผิดชอบ', organization: org };
  return works.filter(function (w) {
    if (TERMINAL_STATUSES_.indexOf(w.current_status_public) !== -1) return false;
    var station = stationsMap[w.current_station_key];
    return computeEligibleTransitions_(ss, w, station, fakeUser).length > 0;
  }).sort(byUpdatedAtDesc_);
}

/** รายชื่อบทบาท (receive_role/approve_role) ทั้งหมดที่ใช้อยู่จริงในชีต WorkflowStates (ไม่ซ้ำ) — ใช้เป็นตัวเลือก dropdown ในฟอร์มแก้ไขสถานี ของ Admin */
function getDistinctStationRoles_(ss) {
  var stations = readSheetAsObjects_(ss.getSheetByName(SHEET.WORKFLOW_STATES));
  var seen = { '-': true };
  var out = ['-'];
  stations.forEach(function (s) {
    [s.receive_role, s.approve_role].forEach(function (r) {
      r = String(r || '').trim();
      if (r && !seen[r]) { seen[r] = true; out.push(r); }
    });
  });
  return out;
}

/** รายชื่อหน่วยงานทั้งหมดที่ปรากฏใน WorkflowStates (ไม่ซ้ำ, ไม่รวม sentinel ORG_FROM) — ใช้เป็นตัวเลือกในฟอร์ม "เปลี่ยนผู้รับผิดชอบ" ของ Admin */
function getDistinctStationOrgs_(ss) {
  var stations = readSheetAsObjects_(ss.getSheetByName(SHEET.WORKFLOW_STATES));
  var seen = {};
  var out = [];
  stations.forEach(function (s) {
    if (s.org && s.org !== 'ORG_FROM' && !seen[s.org]) { seen[s.org] = true; out.push(s.org); }
  });
  return out;
}
