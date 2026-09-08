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
 * Step Progress หน้าสาธารณะ — ลำดับคงที่ 6 ขั้น (PUBLIC_STEP_SEQUENCE_, Constants.gs) ใช้ป้ายสถานะสาธารณะ
 * จริงของระบบเป็นหลัก (ไม่ใช่ชื่อสมมติ) แต่ละขั้นทำเครื่องหมาย:
 *   done    = งานนี้เคยมีสถานะเป็นค่านี้จริงมาก่อน (เช็คจาก public_status ของทุกสถานีที่เคยผ่าน)
 *   current = ตรงกับสถานะปัจจุบันเป๊ะ
 *   upcoming = ยังไม่เคยถึง (ปล่อยว่าง ไม่ติ๊กมั่วว่า "ผ่านแล้ว" ทั้งที่งานนี้อาจไม่เคยถูกขอแก้ไขเลยก็ได้)
 * งานที่ terminated (ยุติกระบวนการ) ไม่แสดง stepper เพราะไม่ใช่เส้นทางปกติ — โชว์ pill สถานะเฉยๆ พอ
 */
function buildPublicMacroSteps_(history, stationsMap, currentStatus) {
  if (currentStatus === 'terminated') return null;
  var visited = {};
  history.forEach(function (h) {
    if (!h.to_station) return;
    var st = stationsMap[h.to_station];
    if (st && st.public_status) visited[st.public_status] = true;
  });
  visited[currentStatus] = true;
  return PUBLIC_STEP_SEQUENCE_.map(function (key) {
    var state = key === currentStatus ? 'current' : (visited[key] ? 'done' : 'upcoming');
    return { key: key, label: PUBLIC_STATUS_LABELS[key], state: state };
  });
}

/** ประกอบข้อมูลที่หน้าผลลัพธ์สาธารณะต้องใช้ทั้งหมด (revision info + step progress) — เรียกจากทั้ง GET (QR) และ POST (กรอกเอง) */
function buildPublicResultData_(ss, work) {
  var revisionInfo = work.current_status_public === 'need_revision' ? getLatestRevisionInfo_(ss, work.work_id) : null;
  var history = getHistoryForWork_(ss, work.work_id);
  var stationsMap = getStationsMap_(ss);
  return { revisionInfo: revisionInfo, steps: buildPublicMacroSteps_(history, stationsMap, work.current_status_public) };
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
      return renderPublicPage_('ผลการตรวจสอบสถานะ', renderPublicResultBody_(work, data.revisionInfo, data.steps, baseUrl));
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
  return renderPublicPage_('ผลการตรวจสอบสถานะ', renderPublicResultBody_(result.work, data.revisionInfo, data.steps, baseUrl));
}
