/**
 * โซนสาธารณะ — ตรวจสอบสถานะผลงานด้วยเลขติดตาม + เลขบัตรประชาชน 4 ตัวท้าย (docs/DESIGN.md ลำดับพัฒนา #6, A6)
 * ไม่ต้อง Login (ผู้เยี่ยมชมทั่วไป) — จำกัดค้นหาผิดต่อ session token ใน CacheService (สคริปต์นี้ deploy แบบ ANYONE
 * + executeAs USER_DEPLOYING ทุกคนเห็น cache ชุดเดียวกัน จึงต้องใช้ session_token แบ่งโควตาต่อผู้เยี่ยมชมเอง — A6)
 */

/** ตรวจว่า session นี้ถูกล็อกอยู่หรือไม่ (ค้นหาผิดครบจำนวนใน Settings.max_failed_search แล้ว) */
function checkSearchLock_(sessionToken) {
  var cache = CacheService.getScriptCache();
  return !!cache.get('searchlock_' + sessionToken);
}

/** บันทึกผลการค้นหา 1 ครั้งลง cache — สำเร็จล้างตัวนับ, ล้มเหลวนับเพิ่มแล้วล็อกเมื่อครบจำนวน (docs/DESIGN.md A6) */
function registerSearchAttempt_(ss, sessionToken, success) {
  var cache = CacheService.getScriptCache();
  var failKey = 'searchfail_' + sessionToken;
  if (success) {
    cache.remove(failKey);
    return;
  }
  var maxFailed = Number(getSetting_(ss, 'max_failed_search', '5'));
  var lockoutMinutes = Number(getSetting_(ss, 'search_lockout_minutes', '10'));
  var lockoutSeconds = Math.min(Math.max(lockoutMinutes, 1) * 60, 21600); // เพดาน CacheService 6 ชม.
  var count = Number(cache.get(failKey) || '0') + 1;
  cache.put(failKey, String(count), lockoutSeconds);
  if (count >= maxFailed) {
    cache.put('searchlock_' + sessionToken, '1', lockoutSeconds);
    cache.remove(failKey);
  }
}

/**
 * ประมวลผลการตรวจสอบสถานะจากฟอร์มสาธารณะ (e.parameter) — ไม่ต้องมี user (ผู้เยี่ยมชมไม่ Login)
 * คืน { ok:true, work, session_token } หรือ { ok:false, errors:[...], session_token }
 */
function trackPublicStatus_(ss, e) {
  var p = (e && e.parameter) || {};
  var sessionToken = String(p.session_token || '').trim() || randomToken_(16);
  var trackingNo = String(p.tracking_no || '').trim();
  var last4 = String(p.citizen_id_last4 || '').trim();

  if (checkSearchLock_(sessionToken)) {
    return { ok: false, session_token: sessionToken,
      errors: ['ค้นหาผิดเกินจำนวนที่กำหนด กรุณารอสักครู่แล้วลองใหม่อีกครั้ง'] };
  }

  var errors = [];
  if (!trackingNo) errors.push('กรุณากรอกเลขติดตามเอกสาร');
  if (!/^[0-9]{4}$/.test(last4)) errors.push('กรุณากรอกเลขบัตรประชาชน 4 ตัวท้าย (ตัวเลข 4 หลัก)');
  if (errors.length) return { ok: false, session_token: sessionToken, errors: errors };

  var work = findWorkByTrackingAndLast4_(ss, trackingNo, last4);
  var success = !!work;
  registerSearchAttempt_(ss, sessionToken, success);
  writeSearchLog_(ss, trackingNo, last4, success, sessionToken);

  if (!work) {
    return { ok: false, session_token: sessionToken,
      errors: ['ไม่พบข้อมูล กรุณาตรวจสอบเลขติดตามเอกสารและเลขบัตรประชาชนอีกครั้ง'] };
  }
  return { ok: true, session_token: sessionToken, work: work };
}

/** เหตุผล/กำหนดวันของคำขอแก้ไขล่าสุด — ใช้แสดงในหน้า "revision detail" สาธารณะ เมื่อสถานะ = need_revision
 *  โมเดล 24-state (2026-09-08) ไม่มี action 'revision_requested' แยกอีกต่อไป — ใช้ note ของ transition ล่าสุด
 *  (มี button_label ของเส้นทางที่เลือกอยู่แล้ว เช่น "ไม่ครบถ้วน → ส่งคืนหน่วยงาน — เอกสารไม่ครบถ้วน") แทน
 *  ไม่มีกำหนดวันส่งกลับแบบ per-work ในโมเดลใหม่ (due_date เป็นนโยบายคงที่ตาม evaluation_result 2/6 เดือน ไม่ track ราย state) */
function getLatestRevisionInfo_(ss, workId) {
  var history = getHistoryForWork_(ss, workId); // เก่า -> ใหม่
  for (var i = history.length - 1; i >= 0; i--) {
    var h = history[i];
    if (h.action === 'revision_requested') {
      return { reasons: h.revision_reasons, due_date: h.revision_due_date, note: h.note };
    }
    if (h.action === 'transition' && h.note) {
      return { reasons: h.note, due_date: '', note: '' };
    }
  }
  return null;
}

/**
 * Timeline ละเอียดหน้าสาธารณะ (2026-09-08 ปรับจาก stepper แบบย่อ 6 ขั้น เป็นแบบเต็มตาม state จริง 23 ตัว
 * ตามที่ผู้ใช้ขอ — เห็นเลข state จริง เช่น "7.3 แก้ไข 6 เดือน" ไม่ใช่แค่หมวดใหญ่) แต่ละขั้นทำเครื่องหมาย:
 *   done     = อยู่ใน StatusHistory จริง (ผ่านมาแล้วจริง เรียงตามลำดับที่เกิดขึ้นจริง รองรับวนกลับ เช่น 3.2→2→3.1)
 *   current  = state ปัจจุบันของงาน
 *   upcoming = เดินหน้าจาก state ปัจจุบันต่อแบบไม่เดา — ถ้า state ถัดไปมีทางเดียว (ไม่แตกสาย) ถือว่าแน่นอน ใส่เป็น
 *              upcoming ได้ ถ้าแตกสาย (มีมากกว่า 1 ปลายทางต่างกัน เช่น state 2 หรือ state 7) หยุดเดา ไม่ใส่ต่อ
 *              (เช่นที่ state 9.4 แตกเป็นผ่าน/ไม่ผ่านแต่ทั้งคู่ไปจบที่ state 10 เหมือนกัน — กรณีนี้ยังถือว่า
 *              "แน่นอน" ใส่ state 10 เป็น upcoming ได้ ไม่ต้องรู้ผลก่อน)
 * งานที่ terminated (ยุติกระบวนการ) ไม่แสดง timeline เพราะไม่ใช่เส้นทางปกติ — โชว์ pill สถานะเฉยๆ พอ
 */
function buildPublicDetailedSteps_(ss, history, stationsMap, currentKey, currentStatus) {
  if (currentStatus === 'terminated') return null;

  var visitedKeys = [];
  history.forEach(function (h) {
    if (!h.to_station) return;
    if (h.action !== 'registered' && h.action !== 'transition' && h.action !== 'reassigned') return;
    if (visitedKeys.length && visitedKeys[visitedKeys.length - 1] === h.to_station) return;
    visitedKeys.push(h.to_station);
  });
  if (!visitedKeys.length || visitedKeys[visitedKeys.length - 1] !== currentKey) visitedKeys.push(currentKey);

  var transitions = readSheetAsObjects_(ss.getSheetByName(SHEET.WORKFLOW_TRANSITIONS));
  var toStatesByFrom = {};
  transitions.forEach(function (t) {
    if (!t.active) return;
    (toStatesByFrom[t.from_state] = toStatesByFrom[t.from_state] || []).push(t.to_state);
  });

  var upcomingKeys = [];
  var cursor = currentKey;
  var guard = {};
  while (true) {
    var outs = (toStatesByFrom[cursor] || []).filter(function (v, i, arr) { return arr.indexOf(v) === i; });
    if (outs.length !== 1 || guard[outs[0]]) break; // แตกสาย หรือวนซ้ำ (กันลูปไม่รู้จบ) — หยุดเดา
    guard[outs[0]] = true;
    upcomingKeys.push(outs[0]);
    cursor = outs[0];
  }

  function toStep(key, state) {
    var st = stationsMap[key];
    return { key: key, order: st ? st.station_order : '', name: st ? splitStationNameDesc_(st.station_name).main : key, state: state };
  }

  var steps = visitedKeys.map(function (key) { return toStep(key, key === currentKey ? 'current' : 'done'); });
  upcomingKeys.forEach(function (key) { steps.push(toStep(key, 'upcoming')); });
  return steps;
}

/** แยกชื่อ state ("แก้ไข 6 เดือน (ปรับปรุงแก้ไขสาระสำคัญ)") เป็นหัวข้อหลัก + คำอธิบายในวงเล็บ ใช้กับการ์ด "สถานะปัจจุบัน" */
function splitStationNameDesc_(stationName) {
  var name = String(stationName || '');
  var m = name.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  return m ? { main: m[1], desc: m[2] } : { main: name, desc: '' };
}

/** หมายเหตุล่าสุดจากผู้รับผิดชอบ (transition ล่าสุดที่มี note) ไม่จำกัดแค่ตอน need_revision — ใช้กับ section "หมายเหตุจากผู้รับผิดชอบ" */
function getLatestTransitionNote_(ss, workId) {
  var history = getHistoryForWork_(ss, workId); // เก่า -> ใหม่
  for (var i = history.length - 1; i >= 0; i--) {
    if (history[i].action === 'transition' && history[i].note) return history[i].note;
  }
  return '';
}

/** ประกอบข้อมูลที่หน้าผลลัพธ์สาธารณะต้องใช้ทั้งหมด — เรียกจากทั้ง GET (QR) และ POST (กรอกเอง) */
function buildPublicResultData_(ss, work) {
  var stationsMap = getStationsMap_(ss);
  var history = getHistoryForWork_(ss, work.work_id);
  var revisionInfo = work.current_status_public === 'need_revision' ? getLatestRevisionInfo_(ss, work.work_id) : null;
  return {
    revisionInfo: revisionInfo,
    steps: buildPublicDetailedSteps_(ss, history, stationsMap, work.current_station_key, work.current_status_public),
    currentStation: stationsMap[work.current_station_key] || null,
    latestNote: revisionInfo ? '' : getLatestTransitionNote_(ss, work.work_id),
  };
}

/**
 * doGet ฝั่งผู้เยี่ยมชม (ไม่ Login) — สแกน QR บนเอกสาร (?t=) เข้าดูสถานะได้ทันที ไม่ต้องกรอกเลขบัตรซ้ำ
 * (2026-09-08 ตัดขั้นกรอกเลขบัตรยืนยันตัวตนออกสำหรับเส้นทางนี้ตามคำขอ — ผู้ที่เห็น/ถ่ายภาพ QR บนเอกสาร
 * จะเปิดดูสถานะได้เลย; ไม่มี t หรือหา QR ไม่เจอ ยังคงใช้ฟอร์มกรอกเลขติดตาม+เลขบัตร 4 ตัวท้ายตามเดิม)
 */
function handlePublicTrackGet_(e) {
  var baseUrl = getWebAppUrl_();
  var token = String((e && e.parameter && e.parameter.t) || '').trim();
  if (token) {
    var ss = getSpreadsheet_();
    var work = findWorkByQrToken_(ss, token);
    if (work) {
      writeSearchLog_(ss, work.tracking_no, '(QR)', true, randomToken_(16));
      var data = buildPublicResultData_(ss, work);
      return renderPublicPage_('ผลการตรวจสอบสถานะ', renderPublicResultBody_(work, data, baseUrl));
    }
  }
  var sessionToken = randomToken_(16);
  return renderPublicPage_('ตรวจสอบสถานะผลงานวิชาการ', renderPublicTrackFormBody_(baseUrl, sessionToken, [], {}));
}

/** doPost form_action=track_status — ไม่ต้องมี user (เรียกก่อนตรวจสิทธิ์เจ้าหน้าที่ใน doPost) */
function handlePublicTrackPost_(ss, e) {
  var baseUrl = getWebAppUrl_();
  var result = trackPublicStatus_(ss, e);
  if (!result.ok) {
    return renderPublicPage_('ตรวจสอบสถานะผลงานวิชาการ',
      renderPublicTrackFormBody_(baseUrl, result.session_token, result.errors, { tracking_no: (e.parameter || {}).tracking_no }));
  }
  var data = buildPublicResultData_(ss, result.work);
  return renderPublicPage_('ผลการตรวจสอบสถานะ', renderPublicResultBody_(result.work, data, baseUrl));
}
