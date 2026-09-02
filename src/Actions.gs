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
  received: 'primary',
  forwarded: 'primary',
  more_info: 'secondary',
  revision_requested: 'warn',
  rejected: 'danger',
  terminated: 'danger',
  closed: 'danger',
  reassigned: 'secondary',
};

/** คำนวณ action ที่ผู้ใช้คนนี้กดได้จริงกับงานนี้ ณ ขณะนี้ — ต้องเรียกซ้ำฝั่ง server ก่อนบันทึกทุกครั้ง (ห้ามเชื่อค่าจาก client) */
function computeEligibleActions_(work, station, user) {
  var isTerminal = TERMINAL_STATUSES_.indexOf(work.current_status_public) !== -1;
  var isAdmin = user.role === 'Admin';
  var isOwnerActive = !isTerminal && !work.handoff_pending && work.current_owner_org === user.organization;
  var canReceive = !isTerminal && !!work.handoff_pending && !!station && station.org === user.organization;
  var canForward = isOwnerActive && !!station && !!station.next_station_key;

  var list = [];
  if (canReceive) list.push('received');
  if (canForward) list.push('forwarded');
  if (isOwnerActive) list.push('more_info', 'revision_requested', 'rejected', 'terminated');
  if (isAdmin && !isTerminal) list.push('closed', 'reassigned');
  return list;
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
    case 'received':
      updates = {
        handoff_pending: false, current_owner_org: station.org, current_status_public: station.public_status,
        current_handler_name: user.display_name || user.user_email, next_step_text: '',
      };
      hist.to_org = station.org;
      break;

    case 'forwarded':
      var nextStation = stationsMap[station.next_station_key];
      if (!nextStation) return { ok: false, errors: ['สถานีนี้เป็นขั้นตอนสุดท้ายแล้ว ไม่มีสถานีถัดไปให้ส่งต่อ'] };
      updates = {
        current_station_key: nextStation.station_key, handoff_pending: true,
        current_status_public: nextStation.public_status,
        next_step_text: 'ส่งต่อแล้ว รอหน่วยงาน "' + nextStation.org + '" สแกนรับเอกสาร',
      };
      hist.to_station = nextStation.station_key;
      hist.to_org = nextStation.org;
      break;

    case 'more_info':
      var infoNote = String(p.note || '').trim();
      if (!infoNote) return { ok: false, errors: ['กรุณาระบุรายละเอียดที่ขอเพิ่มเติม'] };
      hist.note = infoNote;
      break;

    case 'revision_requested':
      var reasons = [].concat((e.parameters && e.parameters.revision_reasons) || []).filter(function (x) { return x; });
      var dueDate = String(p.revision_due_date || '').trim();
      if (!reasons.length) return { ok: false, errors: ['กรุณาเลือกเหตุผลอย่างน้อย 1 ข้อ'] };
      if (!dueDate) return { ok: false, errors: ['กรุณาระบุกำหนดวันส่งฉบับแก้ไขกลับ'] };
      updates = {
        current_status_public: 'need_revision', handoff_pending: true,
        next_step_text: 'รอเจ้าของผลงานส่งฉบับแก้ไขกลับมาภายใน ' + dueDate + ' (สแกน QR แล้วกด "รับเอกสารและเริ่มดำเนินการ" เมื่อได้รับฉบับแก้ไข)',
      };
      hist.revision_reasons = reasons.join(', ');
      hist.revision_due_date = dueDate;
      hist.note = String(p.note || '').trim();
      break;

    case 'rejected':
      var rejectNote = String(p.note || '').trim();
      if (!rejectNote) return { ok: false, errors: ['กรุณาระบุเหตุผลที่ไม่ผ่านการพิจารณา'] };
      updates = { current_status_public: 'result_announced', next_step_text: 'แจ้งผลแล้ว (ไม่ผ่านการพิจารณา)' };
      hist.note = rejectNote;
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
          current_status_public: targetStation.public_status, handoff_pending: false, next_step_text: '' };
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

  var doAction = String(params.do || '').trim();
  if (doAction) {
    if (eligible.indexOf(doAction) === -1) {
      return renderStaffPage_('สแกน QR', renderScanWorkBody_(work, station, eligible, baseUrl, token,
        ['ไม่สามารถทำรายการนี้ได้ในสถานะปัจจุบัน']), user, 'scan', baseUrl);
    }
    return renderStaffPage_('สแกน QR', renderActionFormBody_(ss, work, station, doAction, baseUrl, token, [], {}), user, 'scan', baseUrl);
  }

  return renderStaffPage_('สแกน QR', renderScanWorkBody_(work, station, eligible, baseUrl, token, []), user, 'scan', baseUrl);
}

/** รายชื่อหน่วยงานทั้งหมดที่ปรากฏใน WorkStations (ไม่ซ้ำ) — ใช้เป็นตัวเลือกในฟอร์ม "เปลี่ยนผู้รับผิดชอบ" ของ Admin */
function getDistinctStationOrgs_(ss) {
  var stations = readSheetAsObjects_(ss.getSheetByName(SHEET.WORK_STATIONS));
  var seen = {};
  var out = [];
  stations.forEach(function (s) {
    if (s.org && !seen[s.org]) { seen[s.org] = true; out.push(s.org); }
  });
  return out;
}
