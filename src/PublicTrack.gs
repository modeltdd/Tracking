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
 *  ไม่มีกำหนดวันส่งกลับแบบ per-work ในโมเดลใหม่ (due_date เป็นนโยบายคงที่ตาม evaluation_result 2/6 เดือน ไม่ track ราย state)
 *  2026-10-12 — รับ history ที่ buildPublicResultData_ อ่านมาแล้วตรงๆ (เดิมเรียก getHistoryForWork_ ซ้ำเอง
 *  เป็นการอ่าน StatusHistory ซ้ำสองรอบโดยไม่จำเป็น พบจากการตรวจ performance หลัง Owner Login ช้า) */
function getLatestRevisionInfo_(history) {
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

  // เก็บคู่ (station key, StatusHistory entry ที่พาไปถึง key นั้น) รักษาลำดับ/ค่าซ้ำแบบเดิมทุกประการ (รองรับ
  // วนกลับ เช่น 3.2→2→3.1) — ใช้ h.action_date เป็น "เวลาที่เข้าสู่ state นั้นจริง" ต่อ 1 ครั้งที่เกิดขึ้นจริง
  // (ข้อ 7 ของ requirement — ห้ามเดาเวลา ต้องมาจาก StatusHistory จริงเท่านั้น)
  var visited = [];
  history.forEach(function (h) {
    if (!h.to_station) return;
    if (h.action !== 'registered' && h.action !== 'transition' && h.action !== 'reassigned') return;
    if (visited.length && visited[visited.length - 1].key === h.to_station) return;
    visited.push({ key: h.to_station, enteredAt: h.action_date });
  });
  if (!visited.length || visited[visited.length - 1].key !== currentKey) visited.push({ key: currentKey, enteredAt: null });

  var transitions = readSheetAsObjects_(ss.getSheetByName(SHEET.WORKFLOW_TRANSITIONS));
  var toStatesByFrom = {};
  transitions.forEach(function (t) {
    if (!t.active) return;
    (toStatesByFrom[t.from_state] = toStatesByFrom[t.from_state] || []).push(t.to_state);
  });

  // reachedTerminal: เดินเส้นทางจริงจาก currentKey ไปจนสุด (ไม่มี transition ออกต่อเลย = จบกระบวนการจริง) —
  // ใช้บอก progress summary (2026-09-24) ว่า "เหลือ N ขั้นตอน" นับได้แน่นอนหรือไม่ (false = ยังมีจุดแตกสายอยู่
  // ข้างหน้าที่ยังไม่รู้ผล ห้ามเดาจำนวน ตามที่ผู้ใช้ขอ) แยกจากเหตุผลอื่นที่ทำให้หยุดเดิน (แตกสาย/วนซ้ำ)
  var upcomingKeys = [];
  var cursor = currentKey;
  var guard = {};
  var reachedTerminal = false;
  while (true) {
    var outs = (toStatesByFrom[cursor] || []).filter(function (v, i, arr) { return arr.indexOf(v) === i; });
    if (outs.length === 0) { reachedTerminal = true; break; } // ไม่มีทางออกต่อเลย = ถึงปลายทางจริง
    if (outs.length !== 1 || guard[outs[0]]) break; // แตกสาย หรือวนซ้ำ (กันลูปไม่รู้จบ) — หยุดเดา
    guard[outs[0]] = true;
    upcomingKeys.push(outs[0]);
    cursor = outs[0];
  }

  // ผู้รับผิดชอบต่อ state มาจาก WorkflowStates.org ตรงๆ (ข้อ 8 — ไม่แสดงชื่อบุคคล/อีเมลจริงต่อ state บนหน้า
  // สาธารณะ ตามหลัก privacy ข้อ 17 เดิมอยู่แล้ว ชื่อ/อีเมลผู้ดำเนินการมีแค่ระดับ "ผู้รับผิดชอบปัจจุบัน" รวมด้านบนพอ)
  function toStep(key, state, enteredAt) {
    var st = stationsMap[key];
    // 2026-09-24: บังคับ order เป็น string เสมอ — เจอบั๊กจริงบนชีต production ที่ station_order บางแถวถูก
    // Google Sheets auto-detect เป็น Number (บั๊กคลาสเดียวกับ team_no/tracking_no ที่เจอมาก่อนหน้านี้ในโปรเจกต์)
    // ทำให้ renderPublicTimeline_ เรียก .indexOf('.') บน Number พังจริง (TypeError: s.order.indexOf is not a
    // function) แก้ที่จุดสร้างข้อมูลนี้จุดเดียว กัน consumer ทุกจุด (timeline/mini timeline) ต้องเดาเอง
    return {
      key: key, order: st ? String(st.station_order) : '', name: st ? splitStationNameDesc_(st.station_name).main : key,
      state: state, org: st ? st.org : '', enteredAt: state === 'upcoming' ? null : (enteredAt || null),
    };
  }

  var steps = visited.map(function (v) { return toStep(v.key, v.key === currentKey ? 'current' : 'done', v.enteredAt); });
  upcomingKeys.forEach(function (key) { steps.push(toStep(key, 'upcoming', null)); });
  steps.reachedTerminal = reachedTerminal; // array ก็เป็น object ใน JS — แปะ flag ไว้เผื่อ progress summary ใช้ต่อ
  return steps;
}

/** เลขขั้นตอนหลัก (เลขหน้าจุด) ของ order ใดๆ — "7.1" -> "7", "7" -> "7" ใช้ร่วมกับ buildProgressSummary_/
 *  buildHeroDisplayInfo_ (2026-09-24) นับ/จัดกลุ่ม state ทศนิยมเป็นขั้นตอนหลักเดียวกันเสมอ ไม่ hardcode */
function parentStepOrder_(order) {
  var s = String(order);
  var dot = s.indexOf('.');
  return dot === -1 ? s : s.slice(0, dot);
}

/**
 * สรุปความคืบหน้าสำหรับการ์ด "ความคืบหน้าของผลงาน" (2026-09-24 รอบใหม่ — ตามสูตรที่ผู้ใช้ระบุตรงๆ): backbone
 * คงที่ 10 ขั้นตอนหลักเสมอ (ดู buildFixedMainTimeline_) currentMainStep = เลขหน้าจุดของ state ปัจจุบัน (เช่น
 * "7.1" -> 7) completedCount = currentMainStep-1, remainingCount = 10-currentMainStep เสมอ (ไม่ใช้ reachedTerminal/
 * แตกสายแบบเดิมอีกต่อไป — ผู้ใช้ยืนยันแล้วว่า backbone คงที่ 10 ขั้นตอนรู้จำนวนที่เหลือแน่นอนทุกกรณี)
 * currentStep.order ผ่าน toStep() มาแล้วเสมอเป็น string (กัน error จาก split เหมือนที่เจอบั๊กจริงมาก่อนหน้านี้)
 */
function buildProgressSummary_(work, steps) {
  if (!steps) return null; // terminated — ไม่มี timeline ให้สรุป
  var currentStep = steps.filter(function (s) { return s.state === 'current'; })[0] || null;
  var orderText = currentStep ? String(currentStep.order).trim() : '';
  var currentMainStep = parseInt(orderText.split('.')[0], 10) || 0;
  var totalMainSteps = 10;
  var completedCount = Math.max(currentMainStep - 1, 0);
  var remainingCount = Math.max(totalMainSteps - currentMainStep, 0);
  var progressPercent = totalMainSteps > 0 ? Math.round((currentMainStep / totalMainSteps) * 100) : 0;

  return {
    completedCount: completedCount,
    currentStep: currentStep,
    currentMainStep: currentMainStep,
    totalMainSteps: totalMainSteps,
    remainingCount: remainingCount,
    progressPercent: progressPercent,
    isFinished: work.current_status_public === 'done',
  };
}

/** สร้าง HTML การ์ด "ความคืบหน้าของผลงาน" (2026-09-24 รอบใหม่ ตามตัวอย่างที่ผู้ใช้ระบุตรงๆ: "ดำเนินการเสร็จแล้ว
 *  N ขั้นตอน / ปัจจุบันอยู่ขั้นตอนที่ N จาก 10 / เหลืออีก N ขั้นตอน / ความคืบหน้า N%") escapeHtml_ ประกาศใน
 *  Views.gs แต่ทุกไฟล์ .gs อยู่ global scope เดียวกัน เรียกข้ามไฟล์ได้ปกติ */
function renderPubProgressSummary_(summary) {
  if (!summary) return '';
  if (summary.isFinished) {
    return '' +
      '<div class="pub-progress-card">' +
      '<div class="pub-progress-title">ความคืบหน้าของผลงาน</div>' +
      '<div class="pub-progress-row"><span class="pub-progress-item pub-progress-done">&#10003; ดำเนินการเสร็จแล้ว ' + summary.completedCount + ' ขั้นตอน</span></div>' +
      '<div class="pub-progress-finished">&#9678; ดำเนินการเสร็จสิ้นแล้ว</div>' +
      '</div>';
  }
  var barHtml = '<div class="pub-progress-bar"><div class="pub-progress-bar-fill" style="width:' + summary.progressPercent + '%"></div></div>' +
    '<div class="pub-progress-bar-label">ความคืบหน้า ' + summary.progressPercent + '%</div>';
  return '' +
    '<div class="pub-progress-card">' +
    '<div class="pub-progress-title">ความคืบหน้าของผลงาน</div>' +
    '<div class="pub-progress-row">' +
    '<span class="pub-progress-item pub-progress-done">&#10003; ดำเนินการเสร็จแล้ว ' + summary.completedCount + ' ขั้นตอน</span>' +
    '<span class="pub-progress-item pub-progress-current">&#9679; ปัจจุบันอยู่ขั้นตอนที่ ' + summary.currentMainStep + ' จาก ' + summary.totalMainSteps + '</span>' +
    '<span class="pub-progress-item pub-progress-remaining">&#9675; เหลืออีก ' + summary.remainingCount + ' ขั้นตอน</span>' +
    '</div>' +
    barHtml +
    '</div>';
}

/** แยกชื่อ state ("แก้ไข 6 เดือน (ปรับปรุงแก้ไขสาระสำคัญ)") เป็นหัวข้อหลัก + คำอธิบายในวงเล็บ ใช้กับการ์ด "สถานะปัจจุบัน" */
function splitStationNameDesc_(stationName) {
  var name = String(stationName || '');
  var m = name.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  return m ? { main: m[1], desc: m[2] } : { main: name, desc: '' };
}

/**
 * ข้อความ "สถานะปัจจุบัน" แบบอ่านง่ายสำหรับเจ้าของผลงาน (2026-10-08 ตามที่ผู้ใช้ขอ) — อ่านจาก
 * OWNER_STATE_LABELS_ (Constants.gs) ตาม station_key เท่านั้น ไม่เคยแสดงเลข state (7.1/8.3 ฯลฯ) เลย ไม่มี
 * ใน map (เช่น state ใหม่ที่เพิ่มทีหลังยังไม่เติม owner label) fallback กลับไปใช้ station_name ภายใน (ตัด
 * ส่วนวงเล็บออกด้วย splitStationNameDesc_) กันหน้าเปล่า/undefined — ใช้เฉพาะหน้า Owner Dashboard เท่านั้น
 * Staff/Admin ยังอ่าน station.station_name ตรงๆ เหมือนเดิมทุกจุด ไม่ถูกแตะ
 */
function ownerLabelForStation_(station) {
  if (!station) return '';
  var label = OWNER_STATE_LABELS_[station.station_key];
  return label || splitStationNameDesc_(station.station_name).main;
}

/**
 * แยก "สถานะหลัก" (เลขขั้นตอนหลัก+ชื่อ) จาก "สถานะย่อย/ผลการดำเนินงาน" (state ทศนิยมจริง เช่น 7.1/7.2/7.3)
 * ให้การ์ด "สถานะปัจจุบัน" (2026-09-24 ตามที่ผู้ใช้ขอ) — หลักการ: ถ้า station_order ของสถานะปัจจุบันมีจุดทศนิยม
 * (เช่น "7.1") ให้หา station อื่นที่ station_order ตรงกับเลขหน้าจุด ("7") เป็น "สถานะหลัก" จริงจากข้อมูลจริง
 * (ไม่เดาชื่อ) ถ้าไม่พบ (เช่น 8.x/9.x ไม่มี state "8"/"9" ตรงๆ ในระบบ) ถือว่าไม่มีสถานะหลักให้แยก — คืน stepOrder/
 * stepSplit เป็นของ station ปัจจุบันตรงๆ แทน (isSub=false) ใช้หลักการเดียวกันกับทุก state ทศนิยมที่มี parent จริง
 * ไม่ hardcode เฉพาะ 7.x — 2026-09-24 รอบ 2 (ปรับปรุงการ์ดสถานะปัจจุบัน): เพิ่ม stepOrder/stepSplit ที่มีเสมอ
 * ไม่ว่า isSub หรือไม่ ให้ renderPubHero_ (Views.gs) ไม่ต้องแยกเงื่อนไข "เลขขั้นตอนหลัก+ชื่อ" เป็น 2 เคสอีกต่อไป
 */
function buildHeroDisplayInfo_(currentStation, stationsMap) {
  if (!currentStation) return { isSub: false, stepOrder: '', stepSplit: { main: '', desc: '' } };
  var order = String(currentStation.station_order || '');
  var dot = order.indexOf('.');
  if (dot !== -1) {
    var parentOrder = order.slice(0, dot);
    var parent = null;
    for (var key in stationsMap) {
      if (String(stationsMap[key].station_order) === parentOrder) { parent = stationsMap[key]; break; }
    }
    if (parent) {
      return {
        isSub: true,
        stepOrder: parentOrder,
        stepSplit: splitStationNameDesc_(parent.station_name),
        parentOrder: parentOrder,
        parentStation: parent, // 2026-10-08 — เพิ่มไว้ให้ renderPubHero_(friendlyMode) หา owner label ของ parent ได้ (ownerLabelForStation_ ต้องการ station object ไม่ใช่แค่ text ที่ split แล้ว)
        parentSplit: splitStationNameDesc_(parent.station_name),
        subOrder: order,
        subStation: currentStation, // เช่นกัน — owner label ของ sub-state เอง
        subSplit: splitStationNameDesc_(currentStation.station_name),
        subTone: subStatusToneClass_(currentStation.station_name),
      };
    }
  }
  return { isSub: false, stepOrder: order, stepSplit: splitStationNameDesc_(currentStation.station_name) };
}

/**
 * "ขั้นตอนถัดไป" สำหรับการ์ดสถานะปัจจุบัน (2026-09-24 ใหม่) — เอา upcoming step แรกจาก steps (buildPublicDetailedSteps_
 * เดินหน้าแบบไม่เดาอยู่แล้ว มีค่าเฉพาะตอนเส้นทางข้างหน้าแน่นอน) ถ้า step นั้นดันเป็น state ทศนิยม (ในทางทฤษฎี เช่น
 * ห่วงโซ่ 8.x/9.x ที่ไม่มีสถานะหลักจริง) ให้ปรับมาแสดงสถานะหลักของมันแทนผ่าน buildHeroDisplayInfo_ เดียวกัน กัน
 * "ห้ามแสดง 7.1 เป็นขั้นตอนหลัก" ตามที่ผู้ใช้ขอ ไม่มี upcoming (จุดแตกสาย/จบกระบวนการ) คืน null ไม่เดา
 */
function findNextStepDisplay_(steps, stationsMap) {
  if (!steps) return null;
  var next = steps.filter(function (s) { return s.state === 'upcoming'; })[0] || null;
  if (!next) return null;
  var st = stationsMap[next.key];
  if (st) {
    var info = buildHeroDisplayInfo_(st, stationsMap);
    return { order: info.stepOrder, split: info.stepSplit, station: st };
  }
  return { order: next.order, split: { main: next.name, desc: '' }, station: null };
}

/**
 * ชื่อ "ขั้นตอนหลัก" ของเลขขั้นตอน n (1-10) — ถ้ามีสถานะที่ station_order ตรงเลขเต็ม n ในระบบจริงใช้ชื่อนั้นตรงๆ
 * (state 1,2,4,5,6,7,10) ถ้าไม่มี (state 3,8,9 — ไม่มีสถานะหลักจริงในระบบ ยืนยันกับผู้ใช้แล้ว 2026-09-24) ใช้ชื่อ
 * จากสถานะย่อยแรกของกลุ่มนั้นแทน (เรียงตามเลขทศนิยมน้อยไปมาก เช่น n=3 ใช้ชื่อของ 3.1) ตามที่ผู้ใช้เลือกไว้
 * — ห้ามสร้างชื่อสถานะใหม่ขึ้นเองตามที่ผู้ใช้กำชับ ใช้ชื่อจริงจาก Master WorkflowStates เท่านั้นทุกกรณี
 */
function mainStepNameFor_(n, stationsMap) {
  var bare = null;
  for (var key in stationsMap) {
    if (String(stationsMap[key].station_order) === String(n)) { bare = stationsMap[key]; break; }
  }
  if (bare) return splitStationNameDesc_(bare.station_name);
  var children = [];
  for (var k2 in stationsMap) {
    if (String(stationsMap[k2].station_order).indexOf(n + '.') === 0) children.push(stationsMap[k2]);
  }
  children.sort(function (a, b) { return parseFloat(a.station_order) - parseFloat(b.station_order); });
  return children.length ? splitStationNameDesc_(children[0].station_name) : { main: 'ขั้นตอนที่ ' + n, desc: '' };
}

/** เหมือน mainStepNameFor_ ทุกประการแต่คืน owner label (OWNER_STATE_LABELS_) แทน station_name ภายใน —
 *  ใช้เฉพาะ Timeline หน้า Owner Dashboard (buildOwnerActualPathTimeline_, OwnerAuth.gs) เท่านั้น (2026-10-08) */
function ownerMainStepLabelFor_(n, stationsMap) {
  // 2026-10-08 แก้บั๊กจริง (ผู้ใช้รายงาน: "ขั้นตอนที่ 3" ขึ้น "ครบถ้วน-ส่งเลขา" ซึ่งเป็นชื่อภายในของ s3_1 ไม่ใช่
  // owner label เลย) — main step 1,2,3,4,5,6,7,10 ทุกตัวมี station_key ตรงรูปแบบ "s"+เลข เสมอ (ยืนยันจาก
  // WORKFLOW_STATES_SEED, Constants.gs) และมี OWNER_STATE_LABELS_ ของตัวเองครบอยู่แล้ว — เช็คจาก mapping กลาง
  // นี้ตรงๆ ก่อนเป็นอันดับแรกเสมอ (ไม่ต้องพึ่งการสแกนหา "bare station" ใน stationsMap ซึ่งพังได้ถ้าชีตจริงยัง
  // ไม่ได้รัน migration ที่เพิ่ม state บางตัว หรือ station_key ไม่ตรงรูปแบบที่คาดในข้อมูลเก่า) ไป fallback ไปใช้
  // ชื่อสถานีลูกตัวแรกก็ต่อเมื่อไม่มีใน OWNER_STATE_LABELS_ จริงๆ เท่านั้น
  var directLabel = OWNER_STATE_LABELS_['s' + n];
  if (directLabel) return { main: directLabel, desc: '' };

  var bare = null;
  for (var key in stationsMap) {
    if (String(stationsMap[key].station_order) === String(n)) { bare = stationsMap[key]; break; }
  }
  if (bare) return { main: ownerLabelForStation_(bare), desc: '' };
  var children = [];
  for (var k2 in stationsMap) {
    if (String(stationsMap[k2].station_order).indexOf(n + '.') === 0) children.push(stationsMap[k2]);
  }
  children.sort(function (a, b) { return parseFloat(a.station_order) - parseFloat(b.station_order); });
  return { main: children.length ? ownerLabelForStation_(children[0]) : 'ขั้นตอนที่ ' + n, desc: '' };
}

/**
 * Timeline หลัก 10 ขั้นตอนคงที่ (2026-09-24 ตามที่ผู้ใช้ขอรอบใหม่) — แสดงขั้นตอนที่ 1-10 เสมอไม่ว่าจะไปถึงจริง
 * หรือยัง ต่างจากเดิมที่หยุดแสดงตรงจุดแตกสาย ("ห้ามเดา" ยังคงอยู่ แต่ตอนนี้ scope แค่ "อย่าเดาว่าจะไปแตกสายไหน"
 * ไม่ใช่ "ห้ามโชว์ขั้นตอนที่ยังไปไม่ถึง" — ขั้นตอนอนาคตแสดงแค่ชื่อ+"รอดำเนินการ" ไม่มีผู้รับผิดชอบ/วันที่ปลอม)
 * ใช้ `steps` จาก buildPublicDetailedSteps_ เป็นแหล่งข้อมูลจริงเดียว (org/enteredAt ที่ถูกต้องอยู่แล้ว รองรับ
 * วนกลับ) มาจัดกลุ่มตาม parentStepOrder_ แทนการอ่านชีตซ้ำ — steps ที่ null (terminated) คืน null เหมือนเดิม
 * entry: { order, split:{main,desc}, state:'done'|'current'|'upcoming', org, enteredAt, isLastStep, sub? }
 */
function buildFixedMainTimeline_(steps, stationsMap, work) {
  if (!steps) return null;
  var currentStep = steps.filter(function (s) { return s.state === 'current'; })[0] || null;
  var currentMainStep = currentStep ? parseInt(String(currentStep.order).trim().split('.')[0], 10) || 0 : 0;
  var currentStation = stationsMap[work.current_station_key] || null;

  var result = [];
  for (var n = 1; n <= 10; n++) {
    var group = steps.filter(function (s) { return parentStepOrder_(s.order) === String(n) && s.state !== 'upcoming'; });
    var entry = { order: String(n), split: mainStepNameFor_(n, stationsMap), isLastStep: n === 10 };
    if (n === currentMainStep) {
      var currentReal = group.filter(function (s) { return s.state === 'current'; })[0] || group[group.length - 1] || null;
      entry.state = 'current';
      entry.org = currentReal ? currentReal.org : (currentStation ? currentStation.org : '');
      entry.enteredAt = currentReal ? currentReal.enteredAt : null;
      var heroInfo = buildHeroDisplayInfo_(currentStation, stationsMap);
      if (heroInfo.isSub) entry.sub = { order: heroInfo.subOrder, split: heroInfo.subSplit, tone: heroInfo.subTone };
    } else if (n < currentMainStep) {
      var lastDone = group.length ? group[group.length - 1] : null;
      entry.state = 'done';
      entry.org = lastDone ? lastDone.org : '';
      entry.enteredAt = lastDone ? lastDone.enteredAt : null;
    } else {
      entry.state = 'upcoming';
      entry.org = '';
      entry.enteredAt = null;
    }
    result.push(entry);
  }
  return result;
}

/**
 * Timeline หลัก (ชุดเดียว) ของหน้า Owner Dashboard (2026-10-08 รอบ 9 ตามที่ผู้ใช้ขอ) — reuse
 * buildFixedMainTimeline_ เดิม (backbone คงที่ 1-10 ตัวเดียวกับหน้าสาธารณะ ไม่สร้าง logic คู่ขนาน) แต่เติม
 * flag .skipped ให้ขั้นตอนที่ไม่ได้อยู่บนเส้นทางจริงของงานนี้ (8/9 ตอนที่ state 7 ผล "ผ่าน/ไม่ผ่าน" ข้ามตรงไป 10)
 * และ .isNextAfterSkip ให้ขั้นตอนที่เป็น "ขั้นตอนถัดไป" จริงทันทีหลังจากช่วงที่ถูกข้าม (ต่างจาก upcoming ธรรมดา
 * อื่นๆ ที่ยังเป็น "รอดำเนินการ" เฉยๆ) — ก่อนรอบนี้ใช้แสดงเฉพาะในปุ่ม "ดูรายละเอียด 10 ขั้นตอน" (ซ้ำกับ
 * Timeline เส้นทางจริงด้านบน) ตอนนี้กลายเป็น Timeline หลักชุดเดียวของหน้า (buildOwnerActualPathTimeline_ เดิม
 * เลิกใช้ในหน้านี้แล้ว ไม่ได้ลบไฟล์ทิ้ง)
 *
 * 2026-10-08 รอบ 2 แก้บั๊กจริง (เจอจากภาพที่ผู้ใช้ส่งมา — state 1-6 ถูกตีว่า "ถูกข้าม" ผิดๆ ไปด้วย): เดิมเช็คจาก
 * "ไม่มี step จริงอยู่ในกลุ่ม N" ซึ่งพังกับงาน legacy import (มี StatusHistory แถวเดียว ไม่มีประวัติทีละขั้นของ
 * 1-6 เลย ทำให้ 1-6 ไม่อยู่ใน steps จริงเหมือนกัน แต่ "ไม่ได้ถูกข้าม" จริงๆ) และพังอีกแบบกับงานที่เดินไปถึง state
 * 10 แล้ว (currentMainStep=10 ทำให้ buildFixedMainTimeline_ มาร์ค 8/9 เป็น "done" ตามตำแหน่งเลขเฉยๆ ไม่ใช่
 * "upcoming" อีกต่อไป) — ตอนนี้เปลี่ยนมาเช็คจากสัญญาณจริงโดยตรงแทน: state 7 เป็นจุดแตกสายจริงจุดเดียวในระบบ
 * (ยืนยันจาก WORKFLOW_TRANSITIONS_SEED, ดูคอมเมนต์ buildOwnerActualPathTimeline_ ด้านบน) ถ้า StatusHistory
 * จริงมีแถว 7.1/7.4 (ผ่าน/ไม่ผ่าน) อยู่แล้ว แปลว่า 8/9 ถูกข้ามจริงแน่นอนไม่ว่า currentMainStep จะอยู่ตรงไหนก็ตาม
 * ถ้าเป็น 7.2/7.3 (แก้ไข) ไม่ข้าม 8/9 เลย (เข้าสู่ 8 จริง) — ไม่เดา ใช้ผลจริงจาก StatusHistory ของ state 7 เท่านั้น
 *
 * 2026-10-08 รอบ 9 — ผู้ใช้ขอเปลี่ยนข้อความของขั้นตอนที่ถูกข้าม จากเดิม "<ผลจริง> → ข้ามขั้นตอนแก้ไข" (ยาว ผูกกับ
 * ผลการพิจารณา) เป็นข้อความสั้นตรงๆ "ไม่ใช้ในกรณีนี้" ตามตัวอย่างใน requirement (ข้อ 7) ห้ามแสดง "รอดำเนินการ"
 * กับขั้นตอนที่ถูกข้ามอีกต่อไป (เข้าใจผิดว่ายังต้องรอ)
 */
function buildOwnerFullWorkflowWithSkips_(steps, stationsMap, work) {
  var fixed = buildFixedMainTimeline_(steps, stationsMap, work);
  if (!fixed || !steps) return fixed;

  // จุดแตกสายจริงจุดเดียวในระบบ: step 7 resolve เป็น 7.1/7.4 (ผ่าน/ไม่ผ่าน) -> ข้าม 8/9 ตรงไป 10, 7.2/7.3
  // (แก้ไข) -> ไม่ข้าม เข้าสู่ 8 จริง
  var step7Resolved = steps.filter(function (s) { return parentStepOrder_(s.order) === '7' && s.order !== '7'; })[0] || null;
  var skippedMainSteps = {};
  if (step7Resolved) {
    var staysForRevision = step7Resolved.name.indexOf('แก้ไข') !== -1;
    if (!staysForRevision) {
      skippedMainSteps['8'] = true;
      skippedMainSteps['9'] = true;
    }
  }

  var prevSkipped = false;
  fixed.forEach(function (entry) {
    // owner label แทน station_name ภายใน (buildFixedMainTimeline_ ใช้ mainStepNameFor_ ภายในเสมอ — ต้อง
    // override ทุก entry ที่นี่ ไม่งั้นชื่อ internal จะหลุดเข้าหน้า Owner Dashboard)
    entry.split = ownerMainStepLabelFor_(entry.order, stationsMap);
    if (entry.sub) {
      var subStationForEntry = null;
      for (var subKey in stationsMap) {
        if (String(stationsMap[subKey].station_order) === String(entry.sub.order)) { subStationForEntry = stationsMap[subKey]; break; }
      }
      entry.sub = { split: { main: ownerLabelForStation_(subStationForEntry), desc: '' }, tone: entry.sub.tone };
    }
    if (skippedMainSteps[entry.order]) {
      entry.skipped = true;
      entry.skipReason = 'ไม่ใช้ในกรณีนี้';
    }
    if (entry.state === 'upcoming' && !entry.skipped && prevSkipped) entry.isNextAfterSkip = true;
    prevSkipped = !!entry.skipped;
  });
  return fixed;
}

/**
 * Timeline แบบ 4 "milestone" สำหรับ Owner View / Public Search เท่านั้น (2026-10-15 ตามที่ผู้ใช้ขอ) — แทนที่
 * buildOwnerFullWorkflowWithSkips_ (1-10 เต็ม + skip logic) ด้วยลำดับย่อยที่ผู้ใช้ทั่วไปเข้าใจง่ายกว่า ไม่ใช่
 * state code ใหม่ใดๆ แค่ "จัดกลุ่ม" เลข state ภายในเดิมเพื่อแสดงผลเท่านั้น (ห้ามเปลี่ยน WorkflowMaster/
 * business logic — ยืนยันจากผู้ใช้) mapping คงที่ตามที่ผู้ใช้กำหนด (ไม่ขึ้นกับข้อมูลชีต เพราะเป็นการจัดกลุ่มของ
 * "หมายเลขขั้นตอนหลัก" 1-10 ที่ fix อยู่แล้วในระบบนี้เสมอ ไม่ใช่เดา):
 *   milestone 1 = internal main step 1-2, milestone 2 = 3-6, milestone 3 = 7 (+ 7.x), milestone 4 = 8-10
 * สถานะ current milestone คำนวณจาก work.current_station_key จริง (ไม่ใช่เดาจาก steps) เหมือน
 * renderOwnerResultCard_ (OwnerAuth.gs) ทุกประการ — "ผลการพิจารณา" ที่ milestone 3 (ถ้ามี) อ่านจาก
 * OWNER_STATE_LABELS_ ของ state ย่อย 7.1-7.4 ที่ resolve แล้วจริงใน steps (ไม่มีเลขทศนิยมหลุดออกมาเลย) ไม่ว่า
 * เส้นทางจริงจะผ่าน state 8/9 จริงหรือข้ามตรงไป 10 (ผล 7 = ผ่าน/ไม่ผ่าน) milestone 4 ก็ยังเป็นก้อนเดียวกันเสมอ
 * ไม่ต้องมี skip logic แบบเดิมอีกต่อไป (รวม 8/9/10 เป็นก้อนเดียวแล้วในตัว)
 */
var OWNER_MILESTONE_RANGES_ = [
  { order: 1, min: 1, max: 2, label: 'สำนักงานเขตรับเรื่องของท่านแล้ว' },
  { order: 2, min: 3, max: 6, label: 'เอกสารถูกส่งเข้าสู่กระบวนการพิจารณาแล้ว' },
  { order: 3, min: 7, max: 7, label: 'ผลการพิจารณา' },
  { order: 4, min: 8, max: 10, label: 'แจ้งผลให้หน่วยงานต้นสังกัด' },
];

/** state ย่อย 7.1-7.4 ที่ resolve แล้วจริงใน steps (ผลรอบที่ 1 ของขั้นตอน "ผลการพิจารณา") — คืน null ถ้ายังไม่
 *  ถึง/ยังไม่มีผล (ไม่เดา) reuse ร่วมกันระหว่าง buildOwnerMilestoneTimeline_ (เส้นทางผ่าน/ไม่ผ่านตรง) และ
 *  buildOwnerRevisionTimeline_ (เส้นทางต้องแก้ไข, 2026-10-20) */
function getResolvedFirstRoundStep_(steps) {
  return steps.filter(function (s) { return parentStepOrder_(s.order) === '7' && s.order !== '7'; })[0] || null;
}

function buildOwnerMilestoneTimeline_(steps, stationsMap, work) {
  if (!steps) return null;
  var currentStation = (stationsMap || {})[work.current_station_key] || null;
  var currentMain = currentStation ? (parseInt(parentStepOrder_(currentStation.station_order || ''), 10) || 0) : 0;

  var milestones = OWNER_MILESTONE_RANGES_.map(function (r) {
    var state = currentMain >= r.min && currentMain <= r.max ? 'current'
      : currentMain > r.max ? 'done' : 'upcoming';
    var entry = { order: r.order, label: r.label, state: state, isLastStep: r.order === 4 };
    if (r.order === 3) {
      // ผลการพิจารณาที่ milestone 3 — อ่านจาก state ย่อย 7.1-7.4 ที่ resolve แล้วจริงใน steps เท่านั้น (ไม่เดา)
      var resolved = getResolvedFirstRoundStep_(steps);
      if (resolved) {
        entry.outcome = {
          text: OWNER_STATE_LABELS_[resolved.key] || resolved.name,
          tone: subStatusToneClass_(resolved.name),
        };
      }
    }
    return entry;
  });

  var seenUpcoming = false;
  milestones.forEach(function (m) {
    if (m.state === 'upcoming') { m.isNext = !seenUpcoming; seenUpcoming = true; }
  });

  return milestones;
}

/**
 * 2026-10-20 ตามที่ผู้ใช้ขอ — กรณีผลรอบที่ 1 (state 7) เป็น "ต้องแก้ไข" (s7_2/s7_3) งานจะเดินเข้าสู่ loop แก้ไข
 * จริงใน WorkflowTransitions (s7_2/s7_3 -> s8_1 -> s8_2 -> s8_3 -> s8_4 -> s8_5 -> s8_6 -> s9_1 -> s9_2 -> s9_3
 * -> s9_4 -> s10) ซึ่งมีรายละเอียดภายในมากกว่าที่ผู้ใช้ทั่วไปต้องเห็น — ย่อให้เหลือ 8 ขั้นตอนสำหรับ Owner/Public
 * ตาม mapping ที่ผู้ใช้ระบุเป๊ะ: 1=1-2, 2=3-6, 3=7(+7.x), 4=8.1, 5=8.5, 6=8.6, 7=9.4, 8=10 (state 8.2/8.3/8.4
 * และ 9.1/9.2/9.3 ไม่มีเลขขั้นตอน Owner ของตัวเอง — ถือเป็นส่วนหนึ่งของขั้นตอนก่อนหน้าที่ยังไม่ถึงจุดถัดไป เช่น
 * 8.2-8.4 นับรวมอยู่ใน "ขั้นตอนที่ 4" จนกว่าจะถึง 8.5 จริง) ไม่แก้ state code/WorkflowMaster/StatusHistory ใดๆ
 * เป็นแค่ mapping การแสดงผลเพิ่มอีกชุดเท่านั้น
 * 2026-10-28 ตามข้อกำหนดล่าสุด — "ผ่าน"/"ไม่ผ่าน" ตรง (s7_1/s7_4) ก็ต้องแสดง 8 ขั้นตอนนี้เหมือนกันแล้ว (เดิมใช้
 * buildOwnerMilestoneTimeline_/OWNER_MILESTONE_RANGES_ 4 milestone แยก — เลิกใช้ที่จุดเรียก Owner/Public แล้ว
 * ไม่ลบฟังก์ชันทิ้ง) step 4-7 จะถูก mark .skipped=true แทน (ดู buildOwnerRevisionTimeline_)
 */
var OWNER_REVISION_TIMELINE_STEPS_ = [
  { order: 1, min: 1, max: 2, label: 'สำนักงานเขตรับเรื่องของท่านแล้ว' },
  { order: 2, min: 3, max: 6.99, label: 'เอกสารถูกส่งเข้าสู่กระบวนการพิจารณาแล้ว' },
  { order: 3, min: 7, max: 7.99, label: 'ผลการพิจารณา' },
  // 2026-10-28 ตามข้อกำหนดล่าสุด — ปรับข้อความ step 4/6 ให้ตรงตัวอักษรตามที่ผู้ใช้ระบุ (step5/7/8 ตรงเดิมอยู่แล้ว)
  { order: 4, min: 8.1, max: 8.49, label: 'ส่งเอกสารแก้ไขให้หน่วยงานต้นสังกัด' },
  { order: 5, min: 8.5, max: 8.59, label: 'หน่วยงานต้นสังกัดส่งเอกสารที่แก้ไขแล้วกลับมายังสำนักงานเขต' },
  { order: 6, min: 8.6, max: 9.39, label: 'สำนักงานเขตส่งเอกสารที่ผ่านการแก้ไขแล้วให้คณะกรรมการพิจารณา' },
  { order: 7, min: 9.4, max: 9.49, label: 'ผลการพิจารณาครั้งที่ 2 ถูกส่งมายังสำนักงานเขตแล้ว' },
  { order: 8, min: 10, max: 10, label: 'แจ้งผลให้หน่วยงานต้นสังกัด' },
];

/** ข้อความ/สี "ผลการพิจารณา" ที่ Step 3 (2026-10-28 ตามข้อกำหนดล่าสุด) — Owner ห้ามเห็น code 7.1-7.4 เลย ใช้
 *  ข้อความนี้แทน OWNER_STATE_LABELS_ ตรงๆ เฉพาะจุดนี้เท่านั้น (OWNER_STATE_LABELS_.s7_1 ยังคงข้อความเดิมยาวกว่า
 *  "ผ่านการประเมินจากคณะกรรมการ" ใช้ที่อื่นในระบบ ไม่แตะ) 4 tone แยกสีชัดเจนตามที่ผู้ใช้กำหนด (pass เขียว/
 *  revision2 เหลืองอ่อน/revision3 เหลืองเข้มกว่า/fail แดง) */
var OWNER_RESULT_OUTCOME_ = {
  s7_1: { text: 'ผ่านการประเมิน', tone: 'pass' },
  s7_2: { text: 'ให้ปรับปรุงแก้ไขภายใน 2 เดือน', tone: 'revision2' },
  s7_3: { text: 'ให้ปรับปรุงแก้ไขภายใน 6 เดือน', tone: 'revision3' },
  s7_4: { text: 'ไม่ผ่านการประเมิน', tone: 'fail' },
};

/** true เฉพาะเมื่อผลรอบที่ 1 (state 7) resolve แล้วเป็น "ต้องแก้ไข" จริง (s7_2/s7_3) — ตรวจจาก WorkflowTransitions
 *  จริงแล้วว่ามีแค่ 2 state นี้เท่านั้นที่เดินเข้า loop 8.x/9.x ต่อ (s7_1="ผ่าน"/s7_4="ไม่ผ่าน" ไปตรง s10 เสมอ ไม่
 *  เคยเข้า loop นี้ — ไม่เดา ยึดจาก WORKFLOW_TRANSITIONS_SEED จริงที่ไม่มี s7_4_s8_1 เลย)
 *  2026-10-27 แก้บั๊กจริง (เจอจาก tracking_no 69-220 ผ่าน logOwnerTimelineDebug()): StatusHistory ของงานนี้ขาด
 *  แถวตอนเข้า s7_2 ไปเลย (evaluation_result ก็ว่าง) ทำให้ getResolvedFirstRoundStep_ หาไม่เจอ ทั้งที่
 *  current_station_key=s8_1 อยู่ใน loop แก้ไขจริงอยู่แล้ว — เพิ่ม fallback: ถ้า history หา step 7.x ไม่เจอ ให้เช็ค
 *  จาก current station ตรงๆ แทน (main step 8/9 มีแต่เส้นทางแก้ไขเท่านั้นที่เคยไปถึง ตามข้อเท็จจริงเดียวกันข้างบน
 *  ไม่ใช่การเดาเพิ่ม) กัน record ที่ประวัติไม่ครบ (แก้ไขตรงจาก Sheet/import เก่า) ตกไปใช้ 4-milestone ผิด */
function ownerTimelineNeedsRevisionPath_(steps) {
  if (!steps) return false;
  var resolved = getResolvedFirstRoundStep_(steps);
  if (resolved) return resolved.key === 's7_2' || resolved.key === 's7_3';
  var current = steps.filter(function (s) { return s.state === 'current'; })[0] || null;
  if (!current) return false;
  var mainStep = parentStepOrder_(current.order);
  return mainStep === '8' || mainStep === '9';
}

/**
 * 2026-10-28 ตามข้อกำหนดล่าสุด — เดิมฟังก์ชันนี้ใช้เฉพาะเส้นทาง "ต้องแก้ไข" (s7_2/s7_3) เส้นทาง "ผ่าน/ไม่ผ่าน"
 * ตรง (s7_1/s7_4) ยังใช้ buildOwnerMilestoneTimeline_ (4 milestone) อยู่ — ตอนนี้ทุกเส้นทางต้องแสดง 8 ขั้นตอน
 * เสมอ (ดูจุดเรียกที่แก้แล้วใน OwnerAuth.gs/renderOwnerDashboardBody_ + Views.gs/renderPublicResultBody_ —
 * เลิกเรียก buildOwnerMilestoneTimeline_ ทั้ง 2 จุดแล้ว ไม่ลบฟังก์ชันทิ้งตามหลักเดิมของโปรเจกต์) ฟังก์ชันนี้จึง
 * เพิ่มการ mark step 4-7 เป็น "skipped" (.skipped=true, .skipReason) เมื่อผลรอบ 1 resolve แล้วเป็น "ผ่าน"/
 * "ไม่ผ่าน" ตรง (ไม่มีการแก้ไขจริง) — "ห้าม mark skipped ก่อนรู้ผล Step 3" (resolved ยังเป็น null) จึงไม่ skip เลย
 * ปล่อยเป็น upcoming ปกติ
 */
function buildOwnerRevisionTimeline_(steps, stationsMap, work) {
  if (!steps) return null;
  var currentStation = (stationsMap || {})[work.current_station_key] || null;
  var currentOrderNum = currentStation ? (parseFloat(currentStation.station_order || '0') || 0) : 0;
  var resolvedFirstRound = getResolvedFirstRoundStep_(steps);
  var isPassFailRoute = !!resolvedFirstRound && (resolvedFirstRound.key === 's7_1' || resolvedFirstRound.key === 's7_4');

  var entries = OWNER_REVISION_TIMELINE_STEPS_.map(function (r) {
    var state = currentOrderNum >= r.min && currentOrderNum <= r.max ? 'current'
      : currentOrderNum > r.max ? 'done' : 'upcoming';
    var entry = { order: r.order, label: r.label, state: state, isLastStep: r.order === 8 };

    if (isPassFailRoute && r.order >= 4 && r.order <= 7) {
      entry.skipped = true;
      entry.skipReason = 'ไม่ใช้ในกรณีนี้';
    }

    if (r.order === 3 && resolvedFirstRound) {
      var outcome = OWNER_RESULT_OUTCOME_[resolvedFirstRound.key];
      entry.outcome = outcome
        ? { text: outcome.text, tone: outcome.tone }
        : { text: OWNER_STATE_LABELS_[resolvedFirstRound.key] || resolvedFirstRound.name, tone: subStatusToneClass_(resolvedFirstRound.name) };
      // 2026-10-21 ตามข้อแก้ไขผู้บริหาร — วันครบกำหนดแก้ไข แสดงเฉพาะ s7_2/s7_3 เท่านั้น คงอยู่ตลอดเส้นทางแก้ไข
      // (ขั้นตอนนี้ resolve จาก history ไม่ใช่ station ปัจจุบัน จึงยังโชว์ต่อแม้งานเดินไปถึง 8.x/9.x แล้วก็ตาม)
      if (REVISION_DUE_DATE_STATE_KEYS_[resolvedFirstRound.key]) {
        entry.outcome.dueDateText = formatDateDDMMYYYYBuddhist_(work.revision_due_date);
      }
    }

    // ผลการพิจารณาครั้งที่ 2 (ขั้นตอนที่ 7) — ไม่มี state ย่อยของตัวเองแบบ 7.1-7.4 (s9_4 ไปตรง s10 ทั้ง
    // ผ่าน/ไม่ผ่าน) ใช้ work.evaluation_result จริงที่ถูกเขียนตอน transition s9_4->s10 เท่านั้น (ปลอดภัย ไม่
    // ชนกับผลรอบ 1 เพราะรอบ 1 ของเส้นทางนี้เขียนค่าเป็น "แก้ไข 2 เดือน"/"แก้ไข 6 เดือน" เสมอ ไม่ใช่ "ผ่าน"/
    // "ไม่ผ่าน" ตรงตัว — ค่าจะกลายเป็น "ผ่าน"/"ไม่ผ่าน" ตรงตัวก็ตอนรอบ 2 เขียนทับแล้วเท่านั้น)
    if (r.order === 7 && currentOrderNum >= 9.4 && (work.evaluation_result === 'ผ่าน' || work.evaluation_result === 'ไม่ผ่าน')) {
      var pass2 = work.evaluation_result === 'ผ่าน';
      entry.outcome = {
        text: pass2 ? 'ผ่านการประเมินจากคณะกรรมการ (รอบที่ 2)' : 'ไม่ผ่านการประเมิน (รอบที่ 2)',
        tone: pass2 ? 'done' : 'danger',
      };
    }

    return entry;
  });

  var seenUpcoming = false;
  entries.forEach(function (e) {
    if (e.state === 'upcoming' && !e.skipped) { e.isNext = !seenUpcoming; seenUpcoming = true; }
  });

  return entries;
}

/** สีของ "สถานะย่อย/ผลการดำเนินงาน" ตามคำในชื่อ state จริง (2026-09-24 ตามที่ผู้ใช้ขอ) — เช็ค "ไม่ผ่าน" ก่อน
 *  "ผ่าน" เสมอ (ไม่งั้น "ไม่ผ่าน" จะแมตช์ "ผ่าน" ก่อนผิดความหมาย) ใช้หลักการเดียวกันกับทุก state ทศนิยม */
function subStatusToneClass_(stationName) {
  var name = String(stationName || '');
  if (name.indexOf('ไม่ผ่าน') !== -1) return 'danger';
  if (name.indexOf('แก้ไข') !== -1) return 'revision';
  if (name.indexOf('ผ่าน') !== -1) return 'done';
  return 'pending';
}

/** หมายเหตุล่าสุดจากผู้รับผิดชอบ (transition ล่าสุดที่มี note) ไม่จำกัดแค่ตอน need_revision — ใช้กับ section
 *  "หมายเหตุจากผู้รับผิดชอบ" 2026-10-12 — รับ history ที่อ่านมาแล้วตรงๆ เหมือน getLatestRevisionInfo_ ด้านบน
 *  (เดิมเรียก getHistoryForWork_ ซ้ำเอง อ่าน StatusHistory ซ้ำโดยไม่จำเป็น) */
function getLatestTransitionNote_(history) {
  for (var i = history.length - 1; i >= 0; i--) {
    if (history[i].action === 'transition' && history[i].note) return history[i].note;
  }
  return '';
}

/** ประกอบข้อมูลที่หน้าผลลัพธ์สาธารณะต้องใช้ทั้งหมด — เรียกจากทั้ง GET (QR) และ POST (กรอกเอง) */
function buildPublicResultData_(ss, work) {
  var stationsMap = getStationsMap_(ss);
  var history = getHistoryForWork_(ss, work.work_id);
  var revisionInfo = work.current_status_public === 'need_revision' ? getLatestRevisionInfo_(history) : null;
  var steps = buildPublicDetailedSteps_(ss, history, stationsMap, work.current_station_key, work.current_status_public);
  return {
    revisionInfo: revisionInfo,
    steps: steps,
    progressSummary: buildProgressSummary_(work, steps), // การ์ด "ความคืบหน้าของผลงาน"
    // Timeline หลัก 10 ขั้นตอนคงที่ (2026-09-24) — แทน timeline แบบหยุดที่จุดแตกสายเดิม
    fixedTimeline: buildFixedMainTimeline_(steps, stationsMap, work),
    currentStation: stationsMap[work.current_station_key] || null,
    // 2026-09-24 (redesign แยกสถานะหลัก/ย่อย): ให้ renderPublicResultBody_ (Views.gs) หา "สถานะหลัก" ของ state
    // ทศนิยม (เช่น 7.1 -> หา state order='7') ได้โดยไม่ต้องอ่านชีตซ้ำ — renderWorkDetailBody_ (staff) มี
    // stationsMap เป็นพารามิเตอร์ตรงอยู่แล้ว ไม่ต้องใช้ตัวนี้
    stationsMap: stationsMap,
    latestNote: revisionInfo ? '' : getLatestTransitionNote_(history),
    // เพิ่ม 2026-09-15 (ดูแชท requirement ข้อ I.9.6) — s10 คือขั้น "ส่งต่อให้ผู้ว่าราชการจังหวัด/แจ้งผลหน่วยงาน"
    // อยู่แล้วในตัว (ยืนยันกับผู้ใช้แล้ว ไม่ใช่ state แยก) ใช้ StatusHistory จริง ไม่เดา งานที่ยังไม่ถึง s10 จะได้ null
    governorForwardDate: findStationEntryDateByHistory_(history, 's10'),
    // 2026-09-16 (LegacyMigration.gs) — งานที่มีแค่ประวัติ INITIAL_IMPORT รายการเดียว (นำเข้าจากระบบเดิม) ไม่มี
    // Timeline ย้อนหลังจริงให้แสดง (ตามที่ผู้ใช้กำหนด ห้ามเดา ✓ ขั้นตอนเก่า) — ใช้บอกผู้ใช้ตรงๆ แทนแสดงเงียบๆ
    isLegacyImportOnly: history.length === 1 && history[0].action === 'INITIAL_IMPORT',
  };
}

/** วันที่-เวลาที่เข้าสถานี stationKey ครั้งล่าสุด จาก StatusHistory จริง (ไม่เดา) — คืน null ถ้ายังไม่เคยถึง
 *  ใช้แสดง "ส่งต่อผู้ว่าเมื่อ" (stationKey='s10') บนหน้าติดตามผลงานสาธารณะ */
function findStationEntryDateByHistory_(history, stationKey) {
  var entryDate = null;
  history.forEach(function (h) {
    if (h.to_station !== stationKey) return;
    if (h.action !== 'registered' && h.action !== 'transition') return;
    entryDate = h.action_date;
  });
  return entryDate;
}

/**
 * ค้นหาสาธารณะแบบใหม่ 2026-09-15 (แทนที่ trackPublicStatus_/tracking_no+last4 เดิม — ดูแชท requirement ส่วน F-H)
 * ไม่ยืนยันตัวตน (last4 ไม่มีให้ใช้อีกแล้วตั้งแต่ตัดฟิลด์เลขบัตรออกจากฟอร์มลงทะเบียน) เจ้าของผลงานค้นด้วย
 * เลขตำแหน่งเดิม (exact match) หรือชื่อ/นามสกุล (partial match) แทน — จำกัด 20 ผลลัพธ์ทั้งคู่ กันข้อมูลรั่วไหลมาก
 * เกินจำเป็น query ว่างคืน [] ทันที ไม่ query ทั้งชีต (ข้อ G/21)
 */
var PUBLIC_SEARCH_RESULT_LIMIT_ = 20;

function searchPublicRecordsByPositionNo_(ss, positionNo) {
  var needle = String(positionNo || '').trim();
  if (!needle) return [];
  var works = readSheetAsObjects_(ss.getSheetByName(SHEET.WORKS));
  var matched = works.filter(function (w) { return String(w.position_no || '').trim() === needle; });
  return matched.slice(0, PUBLIC_SEARCH_RESULT_LIMIT_);
}

/** ค้นหาด้วยเลขทะเบียน (tracking_no) แบบ partial match (2026-09-24 เพิ่มตามที่ผู้ใช้ขอ — เดิมค้นได้แค่เลขตำแหน่ง
 *  เดิม/ชื่อ) เช่น "69-17" เจอ "69-176" — normalize เหมือน searchPublicRecordsByName_ (trim + lowercase) */
function searchPublicRecordsByTrackingNo_(ss, trackingNo) {
  var needle = String(trackingNo || '').trim().toLowerCase();
  if (!needle) return [];
  var works = readSheetAsObjects_(ss.getSheetByName(SHEET.WORKS));
  var matched = works.filter(function (w) { return String(w.tracking_no || '').toLowerCase().indexOf(needle) !== -1; });
  return matched.slice(0, PUBLIC_SEARCH_RESULT_LIMIT_);
}

/** collapse ช่องว่างซ้ำเหลือ 1 ตัว + trim หัวท้าย — ใช้ทั้งฝั่ง query และฝั่งชื่อในชีตก่อนเทียบ กันเว้นวรรคเกินทำให้หาไม่เจอ */
function normalizeSearchName_(name) {
  return String(name || '').trim().replace(/\s+/g, ' ');
}

function searchPublicRecordsByName_(ss, name) {
  var needle = normalizeSearchName_(name).toLowerCase();
  if (!needle) return [];
  var works = readSheetAsObjects_(ss.getSheetByName(SHEET.WORKS));
  var matched = works.filter(function (w) {
    var first = normalizeSearchName_(w.first_name).toLowerCase();
    var last = normalizeSearchName_(w.last_name).toLowerCase();
    return first.indexOf(needle) !== -1 || last.indexOf(needle) !== -1;
  });
  return matched.slice(0, PUBLIC_SEARCH_RESULT_LIMIT_);
}

/** doPost form_action=search_public — ไม่ต้องมี user (เรียกก่อนตรวจสิทธิ์เจ้าหน้าที่ใน doPost) ค้นด้วยเลขตำแหน่งเดิมก่อน
 *  ถ้าไม่ได้กรอกค่อยลองค้นด้วยชื่อ/นามสกุลแทน (กรอกทั้งคู่ = ใช้เลขตำแหน่งเดิมเป็นหลัก ชัดเจนกว่า ไม่กำกวม) */
function handlePublicSearchPost_(ss, e) {
  var baseUrl = getWebAppUrl_();
  var p = (e && e.parameter) || {};
  var trackingNo = String(p.tracking_no || '').trim();
  var positionNo = String(p.position_no || '').trim();
  var name = String(p.owner_name || '').trim();

  // 2026-09-24: เพิ่มค้นด้วยเลขทะเบียน (partial match) — ลำดับความสำคัญ: เลขทะเบียน > เลขตำแหน่งเดิม > ชื่อ
  // (เจาะจงที่สุดก่อน) กรอกได้แค่ช่องเดียวพอ
  var results = trackingNo ? searchPublicRecordsByTrackingNo_(ss, trackingNo)
    : positionNo ? searchPublicRecordsByPositionNo_(ss, positionNo) : searchPublicRecordsByName_(ss, name);
  var prevValues = { tracking_no: trackingNo, position_no: positionNo, owner_name: name };

  if (!trackingNo && !positionNo && !name) {
    return renderPublicPage_('ตรวจสอบสถานะผลงานวิชาการ',
      renderPublicTrackFormBody_(baseUrl, ['กรุณากรอกเลขทะเบียน หรือ เลขตำแหน่งเดิม หรือ ชื่อ/นามสกุล อย่างน้อย 1 ช่อง'], prevValues));
  }
  if (!results.length) {
    return renderPublicPage_('ตรวจสอบสถานะผลงานวิชาการ',
      renderPublicTrackFormBody_(baseUrl, ['ไม่พบข้อมูลที่ตรงกับคำค้น'], prevValues));
  }
  if (results.length === 1) {
    var data = buildPublicResultData_(ss, results[0]);
    return renderPublicPage_('ผลการตรวจสอบสถานะ', renderPublicResultBody_(results[0], data, baseUrl));
  }
  return renderPublicPage_('ผลการค้นหา', renderPublicSearchResultsBody_(results, baseUrl));
}

/**
 * doGet ฝั่งผู้เยี่ยมชม (ไม่ Login) — สแกน QR บนเอกสาร (?t=) เข้าดูสถานะได้ทันที ไม่ต้องกรอกเลขบัตรซ้ำ
 * (2026-09-08 ตัดขั้นกรอกเลขบัตรยืนยันตัวตนออกสำหรับเส้นทางนี้ตามคำขอ — ผู้ที่เห็น/ถ่ายภาพ QR บนเอกสาร
 * จะเปิดดูสถานะได้เลย) ไม่มี t = หน้าแรก — 2026-10-06 เปลี่ยนหน้าแรกเป็น Login เจ้าของผลงานโดยตรง (OwnerAuth.gs)
 * แทนฟอร์มค้นหาเดิม ฟอร์มค้นหาเดิมยังอยู่ที่ ?mode=search (ลิงก์ "ค้นหาสถานะแบบเดิม" บนหน้า login ใหม่)
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
  if (String((e && e.parameter && e.parameter.mode) || '') === 'search') {
    return renderPublicPage_('ตรวจสอบสถานะผลงานวิชาการ', renderPublicTrackFormBody_(baseUrl, [], {}));
  }
  return handleOwnerLoginGet_(baseUrl);
}

/** เดิมใช้กับฟอร์ม tracking_no+last4 — เลิกใช้แล้ว 2026-09-15 (แทนที่ด้วย handlePublicSearchPost_/form_action=search_public
 *  ด้านบน) ไม่มีจุดไหนเรียกฟังก์ชันนี้อีก คงไว้เผื่อย้อนดู/ใช้อ้างอิงภายหลัง (ไม่ลบทิ้งตามหลักของโปรเจกต์) */
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

/**
 * Diagnostic (2026-10-27, ตามที่ผู้ใช้รายงาน: Owner Timeline ของ tracking_no 69-220 ยังแสดงแค่ 4 ขั้นตอน ทั้งที่
 * มีข้อความ "เริ่มกระบวนการแก้ไข (2 เดือน)" แสดงว่าควรเข้าเส้นทาง 8 ขั้นตอน buildOwnerRevisionTimeline_) —
 * ตรวจ ownerTimelineNeedsRevisionPath_(data.steps) จริงว่า true/false และเหตุผล ไม่เดา/ไม่แก้อะไร อ่านอย่างเดียว
 */
function logOwnerTimelineDebug(trackingNo) {
  trackingNo = trackingNo || '69-220';
  var ss = getSpreadsheet_();
  var works = readSheetAsObjects_(ss.getSheetByName(SHEET.WORKS));
  var work = works.filter(function (w) { return w.tracking_no === trackingNo; })[0];
  if (!work) { Logger.log('ไม่พบ tracking_no=' + trackingNo); return; }

  Logger.log('=== work ===');
  Logger.log('current_station_key=' + work.current_station_key + ' current_status_public=' + work.current_status_public +
    ' evaluation_result=' + work.evaluation_result + ' next_step_text=' + work.next_step_text);

  var data = buildPublicResultData_(ss, work);
  Logger.log('=== data.steps (' + (data.steps ? data.steps.length : 0) + ' แถว) ===');
  (data.steps || []).forEach(function (s) {
    Logger.log('  key=' + s.key + ' order=' + JSON.stringify(s.order) + ' (typeof ' + typeof s.order + ') state=' + s.state + ' name=' + s.name);
  });

  var resolved = getResolvedFirstRoundStep_(data.steps);
  Logger.log('=== getResolvedFirstRoundStep_ ===');
  Logger.log(resolved ? ('key=' + resolved.key + ' order=' + JSON.stringify(resolved.order)) : 'null (ไม่พบ)');

  var needsRevision = ownerTimelineNeedsRevisionPath_(data.steps);
  Logger.log('=== ownerTimelineNeedsRevisionPath_ === ' + needsRevision);

  var ownerMilestones = needsRevision
    ? buildOwnerRevisionTimeline_(data.steps, data.stationsMap, work)
    : buildOwnerMilestoneTimeline_(data.steps, data.stationsMap, work);
  Logger.log('=== ownerMilestones ที่จะ render จริง (' + (ownerMilestones ? ownerMilestones.length : 0) + ' ขั้นตอน) ===');
  (ownerMilestones || []).forEach(function (m) { Logger.log('  order=' + m.order + ' label=' + m.label + ' state=' + m.state); });

  Logger.log('=== stationsMap[current_station_key] ===');
  var st = (data.stationsMap || {})[work.current_station_key];
  Logger.log(st ? ('station_order=' + JSON.stringify(st.station_order) + ' (typeof ' + typeof st.station_order + ') station_name=' + st.station_name)
    : '(ไม่พบใน stationsMap!)');
}
