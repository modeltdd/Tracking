/**
 * Login สำหรับเจ้าของผลงาน (2026-10-06) — ทางเลือกต่อจากการค้นหาสาธารณะ (PublicTrack.gs) ที่เปิดดูได้โดยไม่
 * ยืนยันตัวตนอยู่แล้ว: ฟีเจอร์นี้เพิ่มรหัสผ่าน + session ให้เจ้าของผลงานกลับมาดูสถานะของตัวเองซ้ำได้โดยไม่ต้อง
 * ค้นหาใหม่ทุกครั้ง — Read Only ล้วน ไม่มีสิทธิ์แก้ไขใดๆ ในระบบ
 *
 * การตัดสินใจที่ยืนยันกับผู้ใช้แล้ว (ห้ามเดา):
 *  - รหัสผ่าน = tracking_no ของงานนั้นเองเป็นค่าเริ่มต้น (ไม่มี field รหัสลับจริงเดิมในระบบ) Admin ตั้ง/รีเซ็ต
 *    รหัสใหม่เป็นรายกรณีได้จากหน้ารายละเอียดผลงาน (เก็บเป็น hash ใน Works.owner_login_code_hash เท่านั้น)
 *  - 1 login ผูกกับผลงาน 1 ชิ้นเท่านั้น (owner_id = work_id) — ไม่มีการจับคู่ "คนเดียวกันหลายผลงาน" เพราะระบบ
 *    ไม่มี person-level ID ที่เชื่อถือได้ (กันชื่อซ้ำปนกัน)
 *  - Session เก็บเป็นชีต OwnerSessions (ไม่ใช้ CacheService เพราะเพดานจริงแค่ 6 ชม. และต้องการให้ Admin
 *    ตรวจสอบย้อนหลังได้) ส่ง session id ต่อท้าย URL (?osession=) เหมือนกลไก auth token ที่ใช้อยู่แล้วในระบบ
 *    (GIS_AUTH_SCRIPT_, Views.gs) เพราะ Apps Script Web App ไม่มี cookie/session ของตัวเอง
 */

var OWNER_LOGIN_CODE_PATTERN_ = /^\d{2}-\d{3}$/;

/** ตรวจรูปแบบรหัสผ่าน __-___ (ข้อ 5) */
function validateOwnerLoginCodeFormat_(code) {
  return OWNER_LOGIN_CODE_PATTERN_.test(String(code || '').trim());
}

/** เทียบรหัสผ่านที่กรอกกับของจริง — มี owner_login_code_hash (Admin ตั้งไว้) ใช้ตัวนั้นก่อนเสมอ ไม่มีค่อย
 *  fallback ไปเทียบกับ tracking_no ตรงๆ (ค่าเริ่มต้นตามที่ยืนยันกับผู้ใช้แล้ว) */
function verifyOwnerLoginCode_(work, codeInput) {
  var code = String(codeInput || '').trim();
  if (!code) return false;
  if (work.owner_login_code_hash) return hashOwnerLoginCode_(code) === work.owner_login_code_hash;
  return code === String(work.tracking_no || '').trim();
}

/** จำกัดจำนวนครั้ง login ผิดต่อ session token (เหมือน checkSearchLock_/registerSearchAttempt_ ใน PublicTrack.gs
 *  ทุกประการ แต่แยก cache key/Settings เป็นของตัวเอง กันปนกับการค้นหาสาธารณะ — ข้อ 18) */
function checkOwnerLoginLock_(sessionToken) {
  var cache = CacheService.getScriptCache();
  return !!cache.get('ownerloginlock_' + sessionToken);
}

function registerOwnerLoginAttempt_(ss, sessionToken, success) {
  var cache = CacheService.getScriptCache();
  var failKey = 'ownerloginfail_' + sessionToken;
  if (success) {
    cache.remove(failKey);
    return;
  }
  var maxFailed = Number(getSetting_(ss, 'max_failed_owner_login', '5'));
  var lockoutMinutes = Number(getSetting_(ss, 'owner_login_lockout_minutes', '10'));
  var lockoutSeconds = Math.min(Math.max(lockoutMinutes, 1) * 60, 21600);
  var count = Number(cache.get(failKey) || '0') + 1;
  cache.put(failKey, String(count), lockoutSeconds);
  if (count >= maxFailed) {
    cache.put('ownerloginlock_' + sessionToken, '1', lockoutSeconds);
    cache.remove(failKey);
  }
}

/** log การ login ทุกครั้ง (สำเร็จ/ล้มเหลว) — ไม่เก็บรหัสผ่านใดๆ (ข้อ 19) ensureSheet_ กันพังถ้ายังไม่ได้รัน
 *  migrateOwnerLoginFeature() มาก่อน (เหมือน createOwnerSession_ ที่ self-heal สร้างชีตเองอยู่แล้ว) */
function writeOwnerLoginLog_(ss, workIdAttempt, ownerNameAttempt, result, sessionToken) {
  var sheet = ensureSheet_(ss, SHEET.OWNER_LOGIN_LOG, SHEET_HEADERS[SHEET.OWNER_LOGIN_LOG]);
  appendRowByHeader_(sheet, SHEET_HEADERS[SHEET.OWNER_LOGIN_LOG], {
    log_id: Utilities.getUuid(),
    timestamp: now_(),
    work_id_attempt: workIdAttempt || '',
    owner_name_attempt: ownerNameAttempt || '',
    result: result,
    session_token: sessionToken,
  });
}

/** สร้าง session ใหม่ให้เจ้าของผลงานที่ login สำเร็จ — อายุปรับได้ผ่าน Settings.owner_session_hours (ข้อ 9
 *  ตัวอย่าง 2-8 ชม. ค่าเริ่มต้น 8 ชม.) คืน { id, expiresAt } */
function createOwnerSession_(ss, work) {
  var hours = Number(getSetting_(ss, 'owner_session_hours', '8')) || 8;
  var loginAt = now_();
  var expiresAt = new Date(loginAt.getTime() + hours * 60 * 60 * 1000);
  var sessionId = randomToken_(32);
  var ownerName = ((work.title_name || '') + (work.first_name || '') + ' ' + (work.last_name || '')).trim();
  var sheet = ensureSheet_(ss, SHEET.OWNER_SESSIONS, SHEET_HEADERS[SHEET.OWNER_SESSIONS]);
  appendRowByHeader_(sheet, SHEET_HEADERS[SHEET.OWNER_SESSIONS], {
    owner_session_id: sessionId, work_id: work.work_id, owner_name: ownerName, login_at: loginAt,
    expires_at: expiresAt, active: true,
  });
  return { id: sessionId, expiresAt: expiresAt };
}

/** ตรวจ session ฝั่ง server ทุกครั้ง (ข้อ 10 — ห้ามเชื่อแค่ owner_id ที่ส่งมาใน URL) คืนงาน (work) ที่ผูกกับ
 *  session นี้ถ้า session ยัง active และไม่หมดอายุ ไม่งั้นคืน null เสมอ (ไม่ throw) */
function validateOwnerSession_(ss, sessionId) {
  var id = String(sessionId || '').trim();
  if (!id) return null;
  var sheet = ss.getSheetByName(SHEET.OWNER_SESSIONS);
  if (!sheet) return null;
  var rows = readSheetAsObjects_(sheet);
  var now = now_();
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    if (row.owner_session_id !== id) continue;
    if (!row.active) return null;
    if (new Date(row.expires_at).getTime() < now.getTime()) return null;
    return findWorkById_(ss, row.work_id);
  }
  return null;
}

/** ออกจากระบบ — ปิด session (ไม่ลบแถว เก็บไว้เป็นประวัติ) ข้อ 16 */
function destroyOwnerSession_(ss, sessionId) {
  var id = String(sessionId || '').trim();
  if (!id) return;
  var sheet = ss.getSheetByName(SHEET.OWNER_SESSIONS);
  if (!sheet) return;
  var headers = SHEET_HEADERS[SHEET.OWNER_SESSIONS];
  var idCol = headers.indexOf('owner_session_id') + 1;
  var activeCol = headers.indexOf('active') + 1;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  var ids = sheet.getRange(2, idCol, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (ids[i][0] === id) { sheet.getRange(i + 2, activeCol).setValue(false); return; }
  }
}

// ================= doGet/doPost handlers (Code.gs เรียกใช้) =================

/** หน้าแรกของผู้ใช้งานทั่วไป ?page=owner-login (GET) — 2026-10-06 เปลี่ยนเป็นฟอร์ม Login ตรง (Username +
 *  password แยกช่อง) แทนฟอร์มค้นหาชื่อแบบเดิม (renderOwnerLoginFormBody_ เก็บไว้ไม่ลบ — ยังไม่มีจุดเรียกจาก UI
 *  แล้ว แต่คงไว้เผื่อย้อนกลับมาใช้ตามธรรมเนียมโปรเจกต์) */
function handleOwnerLoginGet_(baseUrl, notices) {
  return renderPublicPage_('เข้าสู่ระบบ', renderOwnerLoginDirectFormBody_(baseUrl, [], notices || [], {}));
}

/** ออกจากระบบ ?page=owner-login&logout=1&osession=... (GET) */
function handleOwnerLogoutGet_(ss, params, baseUrl) {
  destroyOwnerSession_(ss, params.osession);
  return renderPublicPage_('ออกจากระบบแล้ว', renderOwnerLoginDirectFormBody_(baseUrl, [], ['ออกจากระบบเรียบร้อยแล้ว'], {}));
}

/** ?page=owner-dashboard&osession=... (GET) — ต้องตรวจ session ฝั่ง server ทุกครั้ง ห้ามเชื่อ URL เฉยๆ (ข้อ 10)
 *  ครอบการโหลด/render ข้อมูลผลงานด้วย try/catch (2026-10-12 รอบ 17 ข้อ 11/12) — session ผ่านแล้วแต่โหลด
 *  ข้อมูลผลงานพัง (เช่น StatusHistory/WorkflowStates อ่านไม่ขึ้น) ต้องไม่โชว้หน้า error ดิบของ Apps Script แต่
 *  โชว์ "ไม่สามารถโหลดข้อมูลผลงานได้" + ปุ่ม "ลองใหม่" ที่ใช้ session เดิม (ไม่ใช่บังคับ login ใหม่) */
function renderOwnerDashboardRoute_(ss, params, baseUrl) {
  var sessionId = String(params.osession || '').trim();
  var work = sessionId ? validateOwnerSession_(ss, sessionId) : null;
  if (!work) {
    return renderPublicPage_('เข้าสู่ระบบ',
      renderOwnerLoginDirectFormBody_(baseUrl, sessionId ? ['เซสชันหมดอายุหรือไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่อีกครั้ง'] : [], [], {}));
  }
  try {
    return renderPublicPage_('ผลงานของฉัน', renderOwnerDashboardBody_(ss, work, baseUrl, sessionId));
  } catch (err) {
    Logger.log('[OwnerDashboard] โหลดข้อมูลผลงานล้มเหลว (session ผ่านแล้ว): ' + err);
    return renderPublicPage_('ผลงานของฉัน', renderOwnerDataErrorBody_(baseUrl, sessionId));
  }
}

/** form_action=owner_login_search (POST) — ขั้นที่ 1: ค้นหาชื่อ (reuse searchPublicRecordsByName_ เดิมทุก
 *  ประการ ตามที่ผู้ใช้กำชับ "ใช้ข้อมูลจากทะเบียนเดิม ห้ามสร้างระบบซ้ำ") */
function handleOwnerLoginSearchPost_(ss, e, baseUrl) {
  var p = (e && e.parameter) || {};
  var name = normalizeSearchName_(p.owner_name || '');
  if (!name) {
    return renderPublicPage_('เข้าสู่ระบบเจ้าของผลงาน', renderOwnerLoginFormBody_(baseUrl, ['กรุณากรอกชื่อหรือนามสกุล'], [], { owner_name: name }));
  }
  var candidates = searchPublicRecordsByName_(ss, name);
  if (!candidates.length) {
    return renderPublicPage_('เข้าสู่ระบบเจ้าของผลงาน', renderOwnerLoginFormBody_(baseUrl, ['ไม่พบชื่อที่ค้นหา กรุณาตรวจสอบการสะกดอีกครั้ง'], [], { owner_name: name }));
  }
  var sessionToken = randomToken_(16);
  return renderPublicPage_('เลือกเจ้าของผลงาน', renderOwnerLoginCandidatesBody_(candidates, baseUrl, sessionToken, []));
}

/** form_action=owner_login_submit (POST) — ขั้นที่ 2: เลือก record แล้วกรอกรหัสผ่าน ตรวจทุกเงื่อนไขฝั่ง
 *  server (format -> rate limit -> ของจริง) log ทุกครั้งไม่ว่าผลจะเป็นอย่างไร (ข้อ 19) */
function handleOwnerLoginSubmitPost_(ss, e, baseUrl) {
  var p = (e && e.parameter) || {};
  var workId = String(p.work_id || '').trim();
  var code = String(p.owner_login_code || '').trim();
  var sessionToken = String(p.session_token || '').trim() || randomToken_(16);

  if (checkOwnerLoginLock_(sessionToken)) {
    return renderPublicPage_('เข้าสู่ระบบเจ้าของผลงาน',
      renderOwnerLoginFormBody_(baseUrl, ['ลองเข้าสู่ระบบผิดเกินจำนวนที่กำหนด กรุณารอสักครู่แล้วลองใหม่อีกครั้ง'], [], {}));
  }

  if (!validateOwnerLoginCodeFormat_(code)) {
    return renderPublicPage_('เข้าสู่ระบบเจ้าของผลงาน', renderOwnerLoginFormBody_(baseUrl, ['กรุณากรอกรหัสในรูปแบบ 12-345'], [], {}));
  }

  var work = workId ? findWorkById_(ss, workId) : null;
  var ok = !!work && verifyOwnerLoginCode_(work, code);
  var ownerNameAttempt = work ? ((work.title_name || '') + (work.first_name || '') + ' ' + (work.last_name || '')).trim() : '(ไม่พบงาน)';

  registerOwnerLoginAttempt_(ss, sessionToken, ok);
  writeOwnerLoginLog_(ss, workId, ownerNameAttempt, ok ? 'success' : 'failed', sessionToken);

  if (!ok) {
    // ข้อ 17 — ไม่บอกว่า "ชื่อถูกแต่รหัสผิด" ใช้ข้อความเดียวกันทุกกรณีที่ auth ล้มเหลว
    return renderPublicPage_('เข้าสู่ระบบเจ้าของผลงาน', renderOwnerLoginFormBody_(baseUrl, ['ชื่อหรือรหัสผ่านไม่ถูกต้อง'], [], {}));
  }

  // 2026-10-07 กลับมาใช้หน้า bounce + redirect อีกครั้ง (ย้อนการแก้รอบก่อน) — พบบั๊กจริง: render dashboard
  // ตรงใน POST response ทำให้ refresh/กดย้อนกลับ/login ใหม่ กลายเป็นการ resubmit POST เดิมซ้ำ ซึ่ง
  // script.google.com ปฏิเสธการเชื่อมต่อแทนที่จะถาม "ส่งฟอร์มซ้ำ" ตามปกติ — ต้อง redirect ไป URL แบบ GET
  // (?page=owner-dashboard&osession=) เสมอหลัง login สำเร็จ ให้ refresh/ย้อนกลับปลอดภัย
  var session = createOwnerSession_(ss, work);
  // 2026-10-12 รอบ 17 ข้อ 2 — เพิ่มขั้น "verify session success" แยกจาก "create session" ตามลำดับที่ผู้ใช้ขอ
  // (validate credentials -> create session -> verify session success -> ...) อ่านกลับจากชีตจริงทันทีกัน
  // เคสเขียนไม่สำเร็จ/ไม่ติด ก่อนส่ง redirect ไปหน้า Owner (ไม่ redirect เข้า session ที่ตายไปตั้งแต่สร้าง)
  if (!validateOwnerSession_(ss, session.id)) {
    Logger.log('[OwnerLogin] verify session failed ทันทีหลังสร้าง session_id=' + session.id);
    return renderPublicPage_('เข้าสู่ระบบ', renderOwnerLoginDirectFormBody_(baseUrl, ['เกิดข้อผิดพลาดในการสร้างเซสชัน กรุณาลองเข้าสู่ระบบใหม่อีกครั้ง'], [], {}));
  }
  return renderPublicPage_('กำลังโหลดข้อมูล...', renderOwnerLoginBounceBody_(baseUrl, session.id));
}

/**
 * ตรวจ credential ของ owner_login_direct แบบ core ล้วน ไม่ render/ไม่สร้าง session (2026-10-12 รอบ 19 แยกออก
 * จาก handleOwnerLoginDirectPost_ เดิม) — ใช้ร่วมกันทั้ง handleOwnerLoginDirectPost_ (fallback ฟอร์ม POST ปกติ
 * ตอน JS ปิด/พัง) และ ownerLoginRpc_ (SPA ผ่าน google.script.run ตอน JS เปิด) ไม่มี logic ตรวจรหัสผ่านซ้ำ 2 ที่
 * คืน { ok, error } หรือ { ok:true, work }
 */
function resolveOwnerLoginCredentials_(ss, username, code, sessionToken) {
  // 2026-10-07 รอบ 2 — log ทุกขั้นตามที่ผู้ใช้ขอ (ข้อ 7: ห้าม log password) ไว้ตรวจได้จาก Apps Script
  // Editor > Executions เวลา login ไม่ redirect แล้วเกิดซ้ำอีก จะรู้ทันทีว่าหลุดตรงขั้นไหน
  Logger.log('[OwnerLogin] request received, username=' + username);

  if (checkOwnerLoginLock_(sessionToken)) {
    Logger.log('[OwnerLogin] blocked: rate-limit lock active for this session_token');
    return { ok: false, error: 'ลองเข้าสู่ระบบผิดเกินจำนวนที่กำหนด กรุณารอสักครู่แล้วลองใหม่อีกครั้ง' };
  }
  if (!username) {
    Logger.log('[OwnerLogin] rejected: username ว่าง');
    return { ok: false, error: 'กรุณากรอก Username' };
  }
  // ข้อ 8 — กรอกรหัสไม่ครบ (รูปแบบไม่ตรง __-___) ถือเป็นคนละเคสกับ login ไม่ผ่าน แจ้งข้อความเฉพาะ แต่ยังนับ
  // เป็นความพยายามผิด 1 ครั้งเพื่อกัน brute-force (ตรวจฝั่ง server เสมอ ไม่เชื่อ client — ข้อ 10)
  if (!validateOwnerLoginCodeFormat_(code)) {
    Logger.log('[OwnerLogin] rejected: รูปแบบรหัสผ่านไม่ตรง NN-NNN (ไม่ log ค่าจริง)');
    registerOwnerLoginAttempt_(ss, sessionToken, false);
    writeOwnerLoginLog_(ss, '', username, 'failed', sessionToken);
    return { ok: false, error: 'กรุณากรอกรหัสผ่านให้ครบ' };
  }

  var candidates = searchPublicRecordsByName_(ss, username);
  var matchedWork = null;
  for (var i = 0; i < candidates.length; i++) {
    if (verifyOwnerLoginCode_(candidates[i], code)) { matchedWork = candidates[i]; break; }
  }
  var ok = !!matchedWork;
  Logger.log('[OwnerLogin] auth result: ' + (ok ? ('success, work_id=' + matchedWork.work_id) : 'failed (username หรือ password ไม่ตรง)'));

  registerOwnerLoginAttempt_(ss, sessionToken, ok);
  writeOwnerLoginLog_(ss, matchedWork ? matchedWork.work_id : '', username, ok ? 'success' : 'failed', sessionToken);

  if (!ok) {
    // ข้อ 8 — ไม่บอกว่า username ถูกแต่ password ผิด (หรือกลับกัน) ใช้ข้อความเดียวกันเสมอ
    return { ok: false, error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' };
  }
  return { ok: true, work: matchedWork };
}

/**
 * form_action=owner_login_direct (POST) — fallback เต็มรูปแบบตอน JS ปิด/พัง (progressive enhancement:
 * ownerLoginRpc_ ด้านล่างคือเส้นทางหลักตอน JS เปิดปกติ ใช้ resolveOwnerLoginCredentials_ ร่วมกัน ไม่มี logic
 * ตรวจรหัสซ้ำ) ไม่มีขั้นเลือก record แยก (ต่างจาก handleOwnerLoginSubmitPost_ เดิมที่ต้องเลือก work_id ก่อน)
 */
function handleOwnerLoginDirectPost_(ss, e, baseUrl) {
  var p = (e && e.parameter) || {};
  var username = normalizeSearchName_(p.owner_username || '');
  var code = String(p.owner_login_code || '').trim();
  var sessionToken = String(p.session_token || '').trim() || randomToken_(16);
  var prevValues = { owner_username: username, session_token: sessionToken };

  var result = resolveOwnerLoginCredentials_(ss, username, code, sessionToken);
  if (!result.ok) {
    return renderPublicPage_('เข้าสู่ระบบ', renderOwnerLoginDirectFormBody_(baseUrl, [result.error], [], prevValues));
  }

  // 2026-10-07 กลับมาใช้หน้า bounce + redirect (ดูเหตุผลที่ handleOwnerLoginSubmitPost_ ด้านบน — render
  // dashboard ตรงใน POST response ทำให้ refresh/ย้อนกลับ resubmit POST เดิมจน script.google.com ปฏิเสธการเชื่อมต่อ)
  // session ต้องสร้าง+บันทึกสำเร็จ "ก่อน" ส่ง response กลับเสมอ (บรรทัดถัดไปรันแบบ synchronous ใน Apps Script
  // อยู่แล้ว ไม่มีทาง race — createOwnerSession_ เขียนชีต OwnerSessions เสร็จก่อนบรรทัด return เสมอ)
  // 2026-10-12 รอบ 20 (performance) — ตัดการเรียก validateOwnerSession_ ซ้ำทันทีหลังสร้าง session ออก (เคย
  // เพิ่มไว้รอบ 17 เป็น defensive check) เพราะ appendRowByHeader_/sheet.appendRow() ข้างบนเป็น synchronous
  // call ที่ throw ทันทีถ้าเขียนไม่สำเร็จอยู่แล้ว (ไม่มีทาง "เขียนเงียบๆแล้วอ่านไม่เจอ") การ verify ซ้ำนี้มีแต่
  // เสียเวลาอ่าน OwnerSessions + Works เต็มชีตอีก 2 รอบโดยไม่ลดความเสี่ยงจริงเลย — พบจากการตรวจ performance
  // หลัง Owner Login ช้า (ดูสรุป bottleneck ท้ายไฟล์)
  var session = createOwnerSession_(ss, result.work);
  var redirectUrl = baseUrl + '?page=owner-dashboard&osession=' + encodeURIComponent(session.id);
  Logger.log('[OwnerLogin] session created: session_id=' + session.id + ', redirectUrl=' + redirectUrl);
  return renderPublicPage_('กำลังโหลดข้อมูล...', renderOwnerLoginBounceBody_(baseUrl, session.id));
}

/**
 * RPC (google.script.run) ของ owner_login_direct — 2026-10-12 รอบ 19 ตามที่ผู้ใช้ขอ (ลอง SPA แทน navigation
 * เพื่อเลี่ยงข้อจำกัดจริงของ iframe sandbox ที่บล็อก top-navigation แบบไม่มี user gesture — ดู root cause
 * เต็มๆ ที่คอมเมนต์ renderOwnerLoginBounceBody_) เรียก resolveOwnerLoginCredentials_ เดียวกับ
 * handleOwnerLoginDirectPost_ เป๊ะ ไม่มี logic ตรวจรหัสซ้ำ คืน plain object (ไม่ใช่ HtmlOutput เพราะ
 * google.script.run ส่งได้แค่ค่า serializable)
 *
 * 2026-10-12 รอบ 20 (performance — ตรวจ root cause "กำลังโหลดข้อมูล..." ค้างนาน) — เดิมมี 2 จุดที่ทำให้ช้า:
 * (1) validateOwnerSession_ ซ้ำทันทีหลังสร้าง session (อ่าน OwnerSessions+Works เต็มชีต 2 รอบ ไม่จำเป็น —
 * ตัดออกแล้วด้านบน same fix ใน handleOwnerLoginDirectPost_) (2) ฝั่ง client ต้องรอ RPC round-trip ที่ 2
 * (ownerDashboardRpc_) แยกจาก login RPC เสมอ แต่ละ round-trip มี overhead คงที่ของ google.script.run เอง
 * (cold start/quota check) บวกเพิ่มเข้าไปอีก — ตอนนี้พยายาม render dashboard html "ในคำขอเดียวกัน" นี้เลย
 * (reuse renderOwnerDashboardBody_ ตัวเดียวกับ ownerDashboardRpc_ ไม่ใช่ loader ใหม่) ถ้าสำเร็จคืน html มาด้วย
 * ฝั่ง client ใช้ได้ทันทีไม่ต้องยิง round-trip ที่ 2 เลย (ลดจาก 2 round-trip เหลือ 1 ในเคสปกติ) ถ้า render
 * ล้มเหลว (err) ไม่ทำให้ login fail — คืน sessionId เฉยๆ ให้ client fallback ไปเรียก ownerDashboardRpc_ ปกติ
 * (มี try/catch + ปุ่ม "ลองใหม่" ของตัวเองอยู่แล้ว ไม่ซ้ำ logic)
 */
function ownerLoginRpc_(params) {
  // 2026-10-12 รอบ 21 — ผู้ใช้แจ้งว่ายังค้างนาน/เข้าไม่ได้หลังแก้รอบ 20 ตามที่ขอ (ข้อ 1/14: ห้ามเดา ให้ใส่
  // timing log วัดจริงทีละช่วง) log เวลาทุกขั้นด้วย Date.now() ไปที่ Apps Script Editor > Executions (ดูได้
  // จาก Logger.log) เพื่อหาว่าขั้นไหนจริงๆ กินเวลา ไม่เดาอีกรอบ
  var t0 = Date.now();
  var ss = getSpreadsheet_();
  var t1 = Date.now();
  var p = params || {};
  var username = normalizeSearchName_(p.owner_username || '');
  var code = String(p.owner_login_code || '').trim();
  var sessionToken = String(p.session_token || '').trim() || randomToken_(16);

  var result = resolveOwnerLoginCredentials_(ss, username, code, sessionToken);
  var t2 = Date.now();
  if (!result.ok) {
    Logger.log('[OwnerLoginRpc][timing] getSpreadsheet_=' + (t1 - t0) + 'ms, resolveCredentials(FAIL)=' + (t2 - t1) + 'ms, TOTAL=' + (t2 - t0) + 'ms');
    return { ok: false, error: result.error };
  }

  var session = createOwnerSession_(ss, result.work);
  var t3 = Date.now();
  var response = { ok: true, sessionId: session.id };
  try {
    response.html = renderOwnerDashboardBody_(ss, result.work, getWebAppUrl_(), session.id);
  } catch (err) {
    Logger.log('[OwnerLoginRpc] render dashboard ในคำขอเดียวกันไม่สำเร็จ (ไม่กระทบ login — client จะ fallback ไปเรียก ownerDashboardRpc_ เอง): ' + err);
  }
  var t4 = Date.now();
  Logger.log('[OwnerLoginRpc][timing] getSpreadsheet_=' + (t1 - t0) + 'ms, resolveCredentials=' + (t2 - t1) +
    'ms, createSession=' + (t3 - t2) + 'ms, renderDashboard=' + (t4 - t3) + 'ms, TOTAL=' + (t4 - t0) + 'ms, hasHtml=' + (!!response.html));
  return response;
}

/**
 * RPC (google.script.run) ของ renderOwnerDashboardRoute_ — คืน { ok:true, html } (เนื้อหาการ์ด Owner View
 * ล้วนๆ จาก renderOwnerDashboardBody_ เดิม ไม่มี logic render ซ้ำ) หรือ { ok:false, expired } ให้ฝั่ง client
 * ตัดสินใจเองว่าจะโชว์ฟอร์ม login (expired=true) หรือปุ่ม "ลองใหม่" (expired=false, session ยัง valid แต่โหลด
 * ข้อมูลพัง) — ใช้ validateOwnerSession_ เดียวกับ route เดิมทุกจุด (ข้อ 13 — ห้ามเชื่อ sessionId จาก client
 * อย่างเดียว ต้อง verify ฝั่ง server เสมอ)
 */
function ownerDashboardRpc_(sessionId) {
  // 2026-10-12 รอบ 21 — timing log เดียวกับ ownerLoginRpc_ (ข้อ 1/14 ของผู้ใช้)
  var t0 = Date.now();
  var ss = getSpreadsheet_();
  var work = validateOwnerSession_(ss, sessionId);
  var t1 = Date.now();
  if (!work) {
    Logger.log('[OwnerDashboardRpc][timing] validateSession=' + (t1 - t0) + 'ms -> expired/invalid');
    return { ok: false, expired: true };
  }
  try {
    var html = renderOwnerDashboardBody_(ss, work, getWebAppUrl_(), sessionId);
    var t2 = Date.now();
    Logger.log('[OwnerDashboardRpc][timing] validateSession=' + (t1 - t0) + 'ms, renderDashboard=' + (t2 - t1) + 'ms, TOTAL=' + (t2 - t0) + 'ms');
    return { ok: true, html: html };
  } catch (err) {
    Logger.log('[OwnerDashboardRpc] โหลดข้อมูลผลงานล้มเหลว (session ผ่านแล้ว): ' + err);
    return { ok: false, expired: false };
  }
}

/** RPC (google.script.run) ของ logout เดิม — reuse destroyOwnerSession_ เดียวกับ handleOwnerLogoutGet_ ทุก
 *  ประการ ไม่มี logic logout ซ้ำ */
function ownerLogoutRpc_(sessionId) {
  destroyOwnerSession_(getSpreadsheet_(), sessionId);
  return { ok: true };
}

// ================= Render =================

/**
 * หน้าแรกใหม่ของผู้ใช้งานทั่วไป (2026-10-06) — Username (ชื่อ/นามสกุล) + Password แยกช่อง 5 ช่อง (รูปแบบจริง
 * NN-NNN ไม่ใช่ 6 ช่องเดา) auto-advance/backspace/arrow/paste ผ่าน OWNER_LOGIN_PASSWORD_SCRIPT_ ค่าที่กรอก
 * รวมเป็น string เดียวลง input hidden #owner_login_code_hidden ก่อน submit จริง (ฝั่ง server ตรวจซ้ำเสมอ
 * ไม่เชื่อ client — ข้อ 10) 2026-10-07 รอบ 2: ตัดลิงก์ "ค้นหาสถานะแบบเดิม"/ปุ่มสแกน QR ออกจากหน้านี้แล้ว
 * (ผู้ใช้ขอให้เหลือแค่ Username/Password/ปุ่มเข้าสู่ระบบ) ฟังก์ชันค้นหาเดิม/QR ยังอยู่ปกติที่ ?mode=search
 */
function renderOwnerLoginDirectFormBody_(baseUrl, errors, notices, prevValues) {
  prevValues = prevValues || {};
  var errorHtml = (errors && errors.length)
    ? '<div class="error-banner"><ul>' + errors.map(function (m) { return '<li>' + escapeHtml_(m) + '</li>'; }).join('') + '</ul></div>'
    : '';
  var noticeHtml = (notices && notices.length)
    ? notices.map(function (m) { return '<p class="hint">' + escapeHtml_(m) + '</p>'; }).join('')
    : '';
  var sessionToken = prevValues.session_token || randomToken_(16);

  // 2026-10-12 ตามรายการแก้ไขที่ผู้ใช้ขอ — password แสดงตัวอักษร/ตัวเลขทันที (type="text" ไม่ซ่อนด้วย
  // password dots) ไม่มีปุ่ม "แสดงรหัส" อีกต่อไปเพราะไม่มีอะไรให้สลับโชว์/ซ่อน (ค่าโชว์อยู่แล้วตั้งแต่แรก)
  // auto-focus/paste-กระจายอัตโนมัติ/แยกช่องเดิมยังคงไว้ทั้งหมด (OWNER_LOGIN_PASSWORD_SCRIPT_ ด้านล่าง)
  var boxesHtml = '';
  for (var i = 0; i < 5; i++) {
    if (i === 2) boxesHtml += '<span class="owner-pass-sep">-</span>';
    boxesHtml += '<input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="1" autocomplete="one-time-code" class="owner-pass-box">';
  }

  // 2026-10-12 รอบ 19 — ครอบด้วย <div id="owner-app-root"> (ตามที่ผู้ใช้เลือกหลังตรวจ root cause: iframe
  // sandbox ของ Apps Script บล็อก top-navigation แบบไม่มี user gesture เสมอ — ลอง SPA ด้วย google.script.run
  // แทน navigation จะเลี่ยงปัญหานี้ได้เพราะไม่มีการ navigate เกิดขึ้นเลย) OWNER_LOGIN_SPA_SCRIPT_ ด้านล่าง
  // สลับเนื้อหาใน container นี้ระหว่าง ฟอร์ม login / "กำลังโหลดข้อมูล..." / Owner View จริง (ดึงมาจาก
  // renderOwnerDashboardBody_ เดิมเป๊ะ ผ่าน ownerDashboardRpc_) โดยไม่มีการ navigate ของ browser เลย — ถ้า
  // google.script.run ใช้งานไม่ได้ (เช่น JS ปิด) ฟอร์มนี้ยังเป็น <form method=post> ธรรมดา navigate ไปหน้า
  // bounce เดิมได้ปกติทุกประการ (fallback เต็มรูปแบบ ไม่ใช่ระบบคู่ขนาน — ใช้ resolveOwnerLoginCredentials_/
  // createOwnerSession_/validateOwnerSession_/renderOwnerDashboardBody_ ตัวเดียวกันทั้ง 2 เส้นทาง)
  return '<div id="owner-app-root">' + errorHtml + noticeHtml +
    '<div class="detail-card owner-login-card">' +
    // 2026-10-12 — ตัดข้อความหัว "กรุณาเข้าสู่ระบบเพื่อติดตามผลงานของท่าน" ออกตามที่ผู้ใช้ขอ (ข้อ 3) ดึง
    // Username ขึ้นมาเป็นองค์ประกอบแรกของการ์ดทันที ไม่มีช่องว่างคั่นเหลือ
    '<form id="owner-login-direct-form" method="post" target="_top" action="' + baseUrl + '" class="reg-form" style="border:none;padding:0;">' +
    '<input type="hidden" name="form_action" value="owner_login_direct">' +
    '<input type="hidden" name="session_token" value="' + escapeHtml_(sessionToken) + '">' +
    '<input type="hidden" id="owner_login_code_hidden" name="owner_login_code" value="">' +
    '<div class="field" style="text-align:left"><label>Username</label>' +
    // 2026-10-12 — เปลี่ยน placeholder จาก "กรอกชื่อผู้ใช้งาน" เป็น "ชื่อ - สกุล" ตามที่ผู้ใช้ขอ (ข้อ 1)
    '<input class="input" name="owner_username" value="' + escapeHtml_(prevValues.owner_username || '') + '" placeholder="ชื่อ - สกุล" required></div>' +
    '<div class="field" style="text-align:left"><label>Password</label>' +
    // 2026-10-12 — ตัดข้อความอธิบาย "รหัสผ่านเริ่มต้นคือ..." ออกตามที่ผู้ใช้ขอ (ข้อ 4) และตัดปุ่ม "แสดงรหัส"
    // ออก (ข้อ 5, ไม่จำเป็นแล้วเพราะช่องรหัสโชว์ค่าอยู่แล้วตั้งแต่แรกด้วย type="text" ด้านบน)
    '<div class="owner-pass-boxes">' + boxesHtml + '</div>' +
    '</div>' +
    '<button class="btn-primary" type="submit" data-loading-text="กำลังเข้าสู่ระบบ...">เข้าสู่ระบบ</button>' +
    '</form>' +
    // 2026-10-07 ผู้ใช้ขอตัดลิงก์ "ค้นหาสถานะแบบเดิม" + ปุ่มสแกน QR ออกจากหน้า Login ให้เหลือแค่ Username/
    // Password/ปุ่มเข้าสู่ระบบ (ตัดเฉพาะ UI หน้านี้ — ฟังก์ชันค้นหาเดิม/QR ยังอยู่ปกติที่ ?mode=search, Views.gs)
    '</div>' +
    '</div>' +
    OWNER_LOGIN_SPA_SCRIPT_;
}

/** พฤติกรรมช่อง password แยกทีละตัว — auto-advance/backspace ย้อนกลับ/ลูกศรซ้าย-ขวา/paste กระจายอัตโนมัติ/
 *  Enter submit (ข้อ 3/5/14) รวมค่าทุกช่องเป็น "NN-NNN" ลง hidden input ก่อน submit เสมอ
 *  2026-10-12 — ตัด JS toggle แสดง/ซ่อนรหัส (toggleBtn) ออกตามที่ผู้ใช้ขอ (ปุ่ม "แสดงรหัส" ไม่มีใน UI แล้ว
 *  เพราะช่องรหัสเป็น type="text" แสดงค่าอยู่แล้วตั้งแต่แรก ไม่มีอะไรให้สลับ) ไม่กระทบ logic Login ฝั่ง server
 *  เลย (hidden input/syncHidden/form submit listener ด้านล่างเหมือนเดิมทุกจุด)
 *
 * 2026-10-12 รอบ 19 — เลิกใช้ตัวนี้แล้ว (renderOwnerLoginDirectFormBody_ เปลี่ยนไป append
 * OWNER_LOGIN_SPA_SCRIPT_ ด้านล่างแทน ซึ่งมี logic ชุดนี้ครบทุกจุดรวมอยู่ข้างในแล้ว + SPA orchestration เพิ่ม)
 * เหตุผลที่ย้าย: initOwnerLoginForm_ ใน SPA script ต้องถูกเรียกซ้ำได้หลายครั้ง (ทุกครั้งที่สลับกลับมาโชว์ฟอร์ม
 * login หลัง retry/session หมดอายุ ผ่าน innerHTML swap ซึ่งทำลาย event listener เดิมของ DOM เก่าหมด) ค่าคงที่
 * นี้เป็น anonymous DOMContentLoaded ครั้งเดียว เรียกซ้ำไม่ได้ จึงต้องมีฟังก์ชันใหม่แทน ไม่ได้ลบตัวนี้ทิ้ง เผื่อ
 * ใช้อ้างอิง/ย้อนกลับได้ */
var OWNER_LOGIN_PASSWORD_SCRIPT_ = '' +
  '<script>' +
  'document.addEventListener("DOMContentLoaded", function () {' +
  'var boxes = Array.prototype.slice.call(document.querySelectorAll(".owner-pass-box"));' +
  'var hidden = document.getElementById("owner_login_code_hidden");' +
  'var form = document.getElementById("owner-login-direct-form");' +
  'if (!boxes.length || !hidden || !form) return;' +
  'function syncHidden() {' +
  'var digits = boxes.map(function (b) { return b.value || ""; }).join("");' +
  'hidden.value = digits.length > 2 ? (digits.slice(0, 2) + "-" + digits.slice(2)) : digits;' +
  '}' +
  'boxes.forEach(function (box, idx) {' +
  'box.addEventListener("input", function () {' +
  'box.value = box.value.replace(/[^0-9]/g, "").slice(-1);' +
  'syncHidden();' +
  'if (box.value && idx < boxes.length - 1) boxes[idx + 1].focus();' +
  '});' +
  'box.addEventListener("keydown", function (ev) {' +
  'if (ev.key === "Backspace" && !box.value && idx > 0) { boxes[idx - 1].focus(); boxes[idx - 1].value = ""; syncHidden(); }' +
  'else if (ev.key === "ArrowLeft" && idx > 0) { boxes[idx - 1].focus(); }' +
  'else if (ev.key === "ArrowRight" && idx < boxes.length - 1) { boxes[idx + 1].focus(); }' +
  // 2026-10-07 แก้บั๊กจริงที่เจอ: form.submit() (เรียกตรง) ไม่ยิง "submit" event ตาม spec เลย ทำให้ validation/
  // loading-state listener ด้านล่างถูกข้าม แล้วถ้าไม่ preventDefault ไว้ด้วย browser จะ submit ซ้ำเองอีกรอบ
  // (native default action ของ Enter ในฟอร์ม) กลายเป็น 2 POST แข่งกันไปที่ target="_top" เดียวกัน อาจทำให้
  // หน้าค้าง/ไม่ redirect ตามที่คาด — ต้อง preventDefault ก่อนเสมอ แล้ว validate ซ้ำเหมือน submit listener จริง
  'else if (ev.key === "Enter") {' +
  'ev.preventDefault();' +
  'syncHidden();' +
  'if (hidden.value.length < 6) { alert("กรุณากรอกรหัสผ่านให้ครบ"); }' +
  'else { form.submit(); }' +
  '}' +
  '});' +
  'box.addEventListener("paste", function (ev) {' +
  'ev.preventDefault();' +
  'var text = (ev.clipboardData || window.clipboardData).getData("text").replace(/[^0-9]/g, "");' +
  'for (var i = 0; i < boxes.length; i++) boxes[i].value = text.charAt(i) || "";' +
  'syncHidden();' +
  'var nextEmptyIdx = -1;' +
  'for (var j = 0; j < boxes.length; j++) { if (!boxes[j].value) { nextEmptyIdx = j; break; } }' +
  'boxes[nextEmptyIdx === -1 ? boxes.length - 1 : nextEmptyIdx].focus();' +
  '});' +
  '});' +
  'if (boxes[0]) boxes[0].focus();' +
  'form.addEventListener("submit", function (ev) {' +
  'syncHidden();' +
  'if (hidden.value.length < 6) {' +
  'ev.preventDefault();' +
  'alert("กรุณากรอกรหัสผ่านให้ครบ");' +
  '}' +
  '});' +
  '});' +
  '</script>';

/**
 * 2026-10-12 รอบ 19 — SPA orchestration ด้วย google.script.run (ตามที่ผู้ใช้เลือกหลังตรวจ root cause: iframe
 * sandbox ของ Apps Script บล็อก top-navigation อัตโนมัติแบบไม่มี user gesture เสมอ — เลี่ยงได้โดยไม่ navigate
 * เลยแทน) รวม logic ช่องรหัส (เดิมจาก OWNER_LOGIN_PASSWORD_SCRIPT_ — เลิกใช้ตัวนั้นแล้ว) + การยิง
 * ownerLoginRpc_/ownerDashboardRpc_ ผ่าน google.script.run ไว้ในที่เดียว เพราะ initOwnerLoginForm_ ต้องถูก
 * เรียกซ้ำได้ทุกครั้งที่สลับกลับมาโชว์ฟอร์ม login (หลัง retry/session หมดอายุ — root.innerHTML swap ทำลาย
 * listener เดิมของ DOM เก่าหมดทุกครั้ง)
 *
 * ถ้า google.script.run ไม่พร้อมใช้งาน (เช่น JS ปิด) จะ "ไม่" preventDefault ตอน submit เลย — form เดิม
 * (method=post ธรรมดา, ดู renderOwnerLoginDirectFormBody_) จะ navigate ไปหน้า bounce เดิมตามปกติทุกประการ
 * (fallback เต็มรูปแบบ ไม่ใช่ระบบคู่ขนาน — ปลายทางเป็น handleOwnerLoginDirectPost_ ซึ่งใช้
 * resolveOwnerLoginCredentials_ ตัวเดียวกับ ownerLoginRpc_ ด้านล่างนี้เป๊ะ)
 */
var OWNER_LOGIN_SPA_SCRIPT_ = '' +
  '<script>(function () {' +
  'var root = document.getElementById("owner-app-root");' +
  'if (!root) return;' +
  'var STORAGE_KEY = "owner_session_id";' +
  'var loginSnapshotHtml = null;' +
  // 2026-10-12 รอบ 21 — ผู้ใช้แจ้งว่ายังค้าง/เข้าไม่ได้หลังรอบ 20 (ข้อ 1/2/10 ของผู้ใช้: ตรวจว่า success
  // handler ถูกเรียกหรือไม่/มี google.script.run จริงหรือไม่/เรียกซ้ำกี่ครั้ง) log นี้ให้เปิด DevTools Console
  // (F12) ตอน login ดูว่าสคริปต์นี้รันจริงหรือไม่ และ google.script.run มีจริงในสภาพแวดล้อมนั้นหรือไม่ — ถ้าไม่
  // เห็น log บรรทัดนี้เลย แปลว่าสคริปต์ทั้งก้อนไม่ได้รันตั้งแต่ต้น (ไม่ใช่แค่ RPC ช้า)
  'console.log("[OwnerLoginSPA] script started, google.script.run available =", !!(window.google && google.script && google.script.run));' +

  'function initOwnerLoginForm_() {' +
  'var boxes = Array.prototype.slice.call(document.querySelectorAll(".owner-pass-box"));' +
  'var hidden = document.getElementById("owner_login_code_hidden");' +
  'var form = document.getElementById("owner-login-direct-form");' +
  'if (!boxes.length || !hidden || !form) return;' +
  'if (loginSnapshotHtml === null) loginSnapshotHtml = root.innerHTML;' +
  'function syncHidden() {' +
  'var digits = boxes.map(function (b) { return b.value || ""; }).join("");' +
  'hidden.value = digits.length > 2 ? (digits.slice(0, 2) + "-" + digits.slice(2)) : digits;' +
  '}' +
  'boxes.forEach(function (box, idx) {' +
  'box.addEventListener("input", function () {' +
  'box.value = box.value.replace(/[^0-9]/g, "").slice(-1);' +
  'syncHidden();' +
  'if (box.value && idx < boxes.length - 1) boxes[idx + 1].focus();' +
  '});' +
  'box.addEventListener("keydown", function (ev) {' +
  'if (ev.key === "Backspace" && !box.value && idx > 0) { boxes[idx - 1].focus(); boxes[idx - 1].value = ""; syncHidden(); }' +
  'else if (ev.key === "ArrowLeft" && idx > 0) { boxes[idx - 1].focus(); }' +
  'else if (ev.key === "ArrowRight" && idx < boxes.length - 1) { boxes[idx + 1].focus(); }' +
  'else if (ev.key === "Enter") {' +
  'ev.preventDefault();' +
  'syncHidden();' +
  'if (hidden.value.length < 6) { alert("กรุณากรอกรหัสผ่านให้ครบ"); }' +
  // 2026-10-12 — ใช้ requestSubmit() แทน submit() ตรงๆ (submit() ไม่ยิง "submit" event ตาม spec DOM เลย ทำให้
  // listener ด้านล่างถูกข้ามไปตอนกด Enter — requestSubmit() ยิง event จริง ทำให้ Enter กับคลิกปุ่มพฤติกรรม
  // เดียวกันเป๊ะ ทั้งคู่ไปเส้นทาง RPC เดียวกัน)
  'else if (form.requestSubmit) { form.requestSubmit(); }' +
  'else { form.submit(); }' +
  '}' +
  '});' +
  'box.addEventListener("paste", function (ev) {' +
  'ev.preventDefault();' +
  'var text = (ev.clipboardData || window.clipboardData).getData("text").replace(/[^0-9]/g, "");' +
  'for (var i = 0; i < boxes.length; i++) boxes[i].value = text.charAt(i) || "";' +
  'syncHidden();' +
  'var nextEmptyIdx = -1;' +
  'for (var j = 0; j < boxes.length; j++) { if (!boxes[j].value) { nextEmptyIdx = j; break; } }' +
  'boxes[nextEmptyIdx === -1 ? boxes.length - 1 : nextEmptyIdx].focus();' +
  '});' +
  '});' +
  'boxes[0].focus();' +
  'form.addEventListener("submit", function (ev) {' +
  'syncHidden();' +
  'if (hidden.value.length < 6) { ev.preventDefault(); alert("กรุณากรอกรหัสผ่านให้ครบ"); return; }' +
  // ไม่มี google.script.run (JS ปิด/environment แปลกๆ) -> ปล่อยให้ native form POST ทำงานปกติ (fallback เดิม)
  'if (!window.google || !google.script || !google.script.run) return;' +
  'ev.preventDefault();' +
  'var usernameInput = form.querySelector("input[name=owner_username]");' +
  'var tokenInput = form.querySelector("input[name=session_token]");' +
  'var params = { owner_username: usernameInput ? usernameInput.value : "", owner_login_code: hidden.value, session_token: tokenInput ? tokenInput.value : "" };' +
  'showLoading_();' +
  // 2026-10-12 รอบ 21 — timing log ฝั่ง client (ข้อ 1/14) เปิด DevTools Console ดูว่า "sending" กับ
  // "success"/"failure" ห่างกันกี่ ms จริง ถ้าไม่เห็น "success"/"failure" โผล่มาเลยหลังรอนาน แปลว่า RPC ไม่คืน
  // ค่ากลับมาจริง (ต้องดู Apps Script Editor > Executions ว่า execution นั้นค้าง/error/ไม่เริ่มด้วยซ้ำ)
  'var loginSentAt = Date.now();' +
  'console.log("[OwnerLoginSPA] ownerLoginRpc_ sending...", params.owner_username);' +
  'google.script.run.withSuccessHandler(function (res) {' +
  'console.log("[OwnerLoginSPA] ownerLoginRpc_ SUCCESS handler fired after", Date.now() - loginSentAt, "ms", res);' +
  'if (res && res.ok) {' +
  'try { localStorage.setItem(STORAGE_KEY, res.sessionId); } catch (e) {}' +
  // 2026-10-12 รอบ 20 (performance) — ownerLoginRpc_ ตอนนี้พยายาม render dashboard มาให้ในคำขอเดียวกันแล้ว
  // (res.html) ถ้ามี ใช้ได้ทันทีไม่ต้องยิง round-trip ที่ 2 เลย (loadDashboard_) — เหลือ fallback ไว้เผื่อ
  // render ฝั่ง server ล้มเหลว (ไม่ทำให้ login fail) เท่านั้น
  'if (res.html) { root.innerHTML = res.html; } else { loadDashboard_(res.sessionId); }' +
  '} else {' +
  'showLoginAgain_((res && res.error) || "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");' +
  '}' +
  '}).withFailureHandler(function (err) {' +
  'console.error("[OwnerLoginSPA] ownerLoginRpc_ FAILURE handler fired after", Date.now() - loginSentAt, "ms", err);' +
  'showLoginAgain_("เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");' +
  '}).ownerLoginRpc_(params);' +
  '});' +
  '}' +

  'function showLoading_() {' +
  'root.innerHTML = ' + JSON.stringify(
    '<div class="detail-card owner-bounce-loading"><div class="owner-bounce-spinner" aria-hidden="true"></div>' +
    '<p class="owner-bounce-text">กำลังโหลดข้อมูล...</p></div>') + ';' +
  '}' +
  'function showLoginAgain_(notice) {' +
  'try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}' +
  'root.innerHTML = loginSnapshotHtml || "";' +
  'initOwnerLoginForm_();' +
  'if (notice) {' +
  'var n = document.createElement("p");' +
  'n.className = "hint";' +
  'n.textContent = notice;' +
  'root.insertBefore(n, root.firstChild);' +
  '}' +
  '}' +
  'function showDataError_(sessionId) {' +
  'root.innerHTML = ' + JSON.stringify(
    '<div class="detail-card owner-login-card"><p>ไม่สามารถโหลดข้อมูลผลงานได้</p>' +
    '<p><button type="button" class="btn-primary owner-retry-btn" style="display:inline-block">ลองใหม่</button></p></div>') + ';' +
  'var retryBtn = root.querySelector(".owner-retry-btn");' +
  'if (retryBtn) retryBtn.addEventListener("click", function () { loadDashboard_(sessionId); });' +
  '}' +
  // 2026-10-12 รอบ 20 ข้อ 11 — UX safety net เท่านั้น (ไม่ใช่การแก้ root cause) ถ้าโหลดเกิน 9 วินาทีให้เปลี่ยน
  // ข้อความเป็น "โหลดข้อมูลใช้เวลานานกว่าปกติ" + ปุ่มลองใหม่ แทนที่จะหมุนค้างไม่มีกำหนด ปุ่มลองใหม่เรียก
  // loadDashboard_ ตัวเดิม (ไม่สร้าง loader ใหม่) — ถ้า RPC เดิมดันสำเร็จช้าๆหลังจากนี้ callback ของมันจะเขียน
  // ทับ root.innerHTML อีกที (เคส edge rare ไม่ critical — ไม่ cancel request เดิม เพื่อไม่เพิ่มความซับซ้อนเกิน
  // ขอบเขตที่ผู้ใช้ขอ "แก้เฉพาะ performance/callback/error handling")
  'function showSlow_(sessionId) {' +
  'root.innerHTML = ' + JSON.stringify(
    '<div class="detail-card owner-login-card"><p>โหลดข้อมูลใช้เวลานานกว่าปกติ</p>' +
    '<p><button type="button" class="btn-primary owner-retry-btn" style="display:inline-block">ลองใหม่</button></p></div>') + ';' +
  'var retryBtn = root.querySelector(".owner-retry-btn");' +
  'if (retryBtn) retryBtn.addEventListener("click", function () { loadDashboard_(sessionId); });' +
  '}' +
  'function loadDashboard_(sessionId) {' +
  'showLoading_();' +
  'var slowTimer = setTimeout(function () { showSlow_(sessionId); }, 9000);' +
  'var dashSentAt = Date.now();' +
  'console.log("[OwnerLoginSPA] ownerDashboardRpc_ sending...");' +
  'google.script.run.withSuccessHandler(function (res) {' +
  'console.log("[OwnerLoginSPA] ownerDashboardRpc_ SUCCESS handler fired after", Date.now() - dashSentAt, "ms", res && res.ok);' +
  'clearTimeout(slowTimer);' +
  'if (res && res.ok) {' +
  'root.innerHTML = res.html;' +
  '} else if (res && res.expired) {' +
  'showLoginAgain_("เซสชันหมดอายุหรือไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่อีกครั้ง");' +
  '} else {' +
  'showDataError_(sessionId);' +
  '}' +
  '}).withFailureHandler(function (err) {' +
  'console.error("[OwnerLoginSPA] ownerDashboardRpc_ FAILURE handler fired after", Date.now() - dashSentAt, "ms", err);' +
  'clearTimeout(slowTimer);' +
  'showDataError_(sessionId);' +
  '}).ownerDashboardRpc_(sessionId);' +
  '}' +

  'document.addEventListener("DOMContentLoaded", function () {' +
  'if (!window.google || !google.script || !google.script.run) { initOwnerLoginForm_(); return; }' +
  'var savedId = null;' +
  'try { savedId = localStorage.getItem(STORAGE_KEY); } catch (e) {}' +
  'if (savedId) {' +
  'loginSnapshotHtml = root.innerHTML;' +
  'loadDashboard_(savedId);' +
  '} else {' +
  'initOwnerLoginForm_();' +
  '}' +
  '});' +
  '})();</script>';

function renderOwnerLoginFormBody_(baseUrl, errors, notices, prevValues) {
  prevValues = prevValues || {};
  var errorHtml = (errors && errors.length)
    ? '<div class="error-banner"><ul>' + errors.map(function (m) { return '<li>' + escapeHtml_(m) + '</li>'; }).join('') + '</ul></div>'
    : '';
  var noticeHtml = (notices && notices.length)
    ? notices.map(function (m) { return '<p class="hint">' + escapeHtml_(m) + '</p>'; }).join('')
    : '';
  return '' + errorHtml + noticeHtml +
    '<div class="detail-card">' +
    '<p>กรุณาค้นหาชื่อของท่านและกรอกรหัสผ่านเพื่อเข้าสู่ระบบติดตามผลงาน</p>' +
    '<form method="post" target="_top" action="' + baseUrl + '" class="reg-form" style="border:none;padding:0;">' +
    '<input type="hidden" name="form_action" value="owner_login_search">' +
    '<div class="field"><label>ค้นหาชื่อเจ้าของผลงาน</label>' +
    '<input class="input" name="owner_name" value="' + escapeHtml_(prevValues.owner_name || '') + '" placeholder="พิมพ์บางส่วนของชื่อหรือนามสกุล" required></div>' +
    '<button class="btn-primary" type="submit">ค้นหา</button>' +
    '</form>' +
    '<p class="pub-back-link"><a target="_top" href="' + baseUrl + '">&larr; กลับหน้าตรวจสอบสถานะสาธารณะ</a></p>' +
    '</div>';
}

/** รายชื่อที่ค้นเจอ — แต่ละรายการมีฟอร์มกรอกรหัสผ่านของตัวเอง (ข้อ 4 — ต้องเลือก record ก่อน ห้าม login ด้วย
 *  ชื่อพิมพ์เฉยๆ) แสดงนามสกุล/หน่วยงาน/จังหวัด/เลขทะเบียนกำกับเผื่อชื่อซ้ำ (ข้อ 23) */
function renderOwnerLoginCandidatesBody_(candidates, baseUrl, sessionToken, errors) {
  var errorHtml = (errors && errors.length)
    ? '<div class="error-banner"><ul>' + errors.map(function (m) { return '<li>' + escapeHtml_(m) + '</li>'; }).join('') + '</ul></div>'
    : '';
  var cardsHtml = candidates.map(function (w) {
    var ownerName = ((w.title_name || '') + (w.first_name || '') + ' ' + (w.last_name || '')).trim();
    return '' +
      '<div class="detail-card" style="margin-bottom:10px">' +
      '<div class="pub-name-owner" style="font-size:1rem">' + escapeHtml_(ownerName || '-') + '</div>' +
      '<p class="hint">' + escapeHtml_(w.org_from || '-') + ' &middot; ' + escapeHtml_(w.province || '-') +
      ' &middot; เลขทะเบียน ' + escapeHtml_(w.tracking_no) + '</p>' +
      '<form method="post" target="_top" action="' + baseUrl + '" class="reg-form" style="border:none;padding:8px 0 0;">' +
      '<input type="hidden" name="form_action" value="owner_login_submit">' +
      '<input type="hidden" name="work_id" value="' + escapeHtml_(w.work_id) + '">' +
      '<input type="hidden" name="session_token" value="' + escapeHtml_(sessionToken) + '">' +
      '<div class="field"><label>รหัสผ่าน</label>' +
      '<input class="input" name="owner_login_code" placeholder="12-345" maxlength="6" pattern="\\d{2}-\\d{3}" required></div>' +
      '<button class="btn-primary" type="submit">เข้าสู่ระบบ</button>' +
      '</form>' +
      '</div>';
  }).join('');

  return '' + errorHtml +
    '<p class="pub-subheader-label">พบ ' + candidates.length + ' รายการ — เลือกรายการของท่านแล้วกรอกรหัสผ่าน</p>' +
    cardsHtml +
    '<p class="pub-back-link"><a target="_top" href="' + baseUrl + '?page=owner-login">&larr; ค้นหาใหม่</a></p>';
}

/** หน้าระหว่างทางหลัง login สำเร็จ — เด้งไป URL แบบ GET ที่มี ?osession= ติดไปด้วย (ข้อ 8/10) ตรวจ session ฝั่ง
 *  server อีกครั้งตอนโหลดหน้านั้นอยู่ดี (renderOwnerDashboardRoute_) จึงไม่ใช่จุดอ่อนด้านความปลอดภัย
 *
 * 2026-10-07 รอบ 3 — ผู้ใช้ส่ง DevTools Console log จริงมาให้ดู พิสูจน์ root cause ชัดเจน: "Unsafe attempt to
 * initiate navigation for frame ... sandboxed with the 'allow-top-navigation-by-user-activation' flag, but
 * has no user activation (gesture)" — Apps Script web app รันอยู่ใน iframe ข้าม origin ภายใต้
 * script.google.com เสมอ Chrome บล็อก top.location.replace() ที่ยิงเองจาก <script> โดยไม่มี user gesture
 * เสมอ เป็น hard platform limitation ของ Apps Script Web App เอง ไม่ใช่บั๊กที่แก้ด้วยโค้ดได้ — "redirect
 * อัตโนมัติแบบไม่ต้องกดจริงๆ" ทำไม่ได้ 100% ในสถาปัตยกรรมนี้ (ยืนยันแล้วจากรอบนี้)
 *
 * 2026-10-12 รอบ 17 ตามที่ผู้ใช้ขอ (ลบหน้า "เข้าสู่ระบบสำเร็จ"/ปุ่ม "ไปที่หน้าผลงานของฉัน" ออกจาก flow, ห้าม
 * จำลองการกด .click()) — ตัดข้อความ "เข้าสู่ระบบสำเร็จ"/ปุ่ม "ไปที่หน้าผลงานของฉัน" ออก เหลือ spinner +
 * "กำลังโหลดข้อมูล..." + ลอง top.location.replace() ก่อนเสมอ (ฟรี เผื่อบาง deployment อนุญาต)
 *
 * 2026-10-12 รอบ 18 — ผู้ใช้แจ้งว่ารอบ 17 (ปุ่มซ่อนไว้ก่อน fade-in หลัง 1.2s) "ใช้งานยาก" (ต้องรู้ว่าต้องกด Enter
 * หรือรอ) ขอปรับกลับให้มีปุ่มกดได้ทันทีเหมือนเดิม — ปุ่ม "เปิดหน้าผลงานของฉัน" จึงโชว์เด่นชัดทันที (ไม่ซ่อน/ไม่มี
 * setTimeout fade-in แล้ว) auto-focus ไว้ด้วยเผื่อกด Enter ได้เลย แต่ไม่ได้บังคับผู้ใช้ต้องรู้ trick นี้อีกต่อไป
 * เห็นปุ่มจริงให้กดได้ตั้งแต่โหลดหน้าเสร็จ ยังไม่เอาข้อความ "เข้าสู่ระบบสำเร็จ"/ปุ่ม "ไปที่หน้าผลงานของฉัน" กลับมา
 * (ข้อนั้นผู้ใช้ไม่ได้ขอให้ย้อน — แค่ขอปุ่มกดได้ทันที) */
function renderOwnerLoginBounceBody_(baseUrl, sessionId) {
  var url = baseUrl + '?page=owner-dashboard&osession=' + encodeURIComponent(sessionId);
  return '' +
    '<div class="detail-card owner-bounce-loading" id="owner-bounce-fallback">' +
    '<div class="owner-bounce-spinner" aria-hidden="true"></div>' +
    '<p class="owner-bounce-text">กำลังโหลดข้อมูล...</p>' +
    '<a target="_top" id="owner-bounce-link" class="owner-bounce-link btn-primary" style="display:inline-block;text-decoration:none" href="' + escapeHtml_(url) + '">เปิดหน้าผลงานของฉัน</a>' +
    '</div>' +
    '<script>(function () {' +
    'var u = ' + JSON.stringify(url) + ';' +
    'console.log("[OwnerLoginBounce] current URL =", location.href);' +
    'console.log("[OwnerLoginBounce] target URL =", u);' +
    'try {' +
    'top.location.replace(u);' +
    'console.log("[OwnerLoginBounce] top.location.replace() เรียกสำเร็จ");' +
    '} catch (err) {' +
    'console.error("[OwnerLoginBounce] top.location.replace() ล้มเหลว (ข้อจำกัดของ iframe sandbox ใน Apps Script Web App ไม่มี user gesture):", err);' +
    '}' +
    'var link = document.getElementById("owner-bounce-link");' +
    'if (link) link.focus();' +
    '})();</script>';
}

/** เมื่อ session ผ่านแล้ว (login สำเร็จจริง) แต่โหลดข้อมูลผลงานไม่สำเร็จ (ข้อ 11/12) — ปุ่ม "ลองใหม่" ใช้
 *  session เดิม (?osession= เดิม) เรียก renderOwnerDashboardRoute_ ใหม่เฉยๆ ไม่สร้าง session ใหม่/ไม่บังคับ
 *  login ใหม่ ตราบใด session ยัง valid */
function renderOwnerDataErrorBody_(baseUrl, sessionId) {
  var retryUrl = baseUrl + '?page=owner-dashboard&osession=' + encodeURIComponent(sessionId);
  return '' +
    '<div class="detail-card owner-login-card">' +
    '<p>ไม่สามารถโหลดข้อมูลผลงานได้</p>' +
    '<p><a target="_top" class="btn-primary owner-retry-link" href="' + escapeHtml_(retryUrl) + '" style="display:inline-block;text-decoration:none;text-align:center">ลองใหม่</a></p>' +
    '</div>';
}

/**
 * Timeline "เส้นทางจริง" เฉพาะหน้า Owner Dashboard (2026-10-07 ตามที่ผู้ใช้ขอ) — ต่างจาก
 * buildFixedMainTimeline_ (PublicTrack.gs, หน้าสาธารณะ/เจ้าหน้าที่ ยังคงแสดง backbone คงที่ 1-10 เหมือนเดิม
 * ไม่แตะ) ตัวนี้แสดงเฉพาะขั้นตอนที่อยู่บน "เส้นทางจริง" ของงานนั้น (ผ่านมาแล้ว + ปัจจุบัน + ขั้นถัดไปที่แน่นอน
 * ไม่ต้องเดา — ยืมเครื่องยนต์เดินหน้า "ไม่เดาข้ามจุดแตกสาย" จาก buildPublicDetailedSteps_ มาตรงๆ ของจริงเดินได้
 * ไกลแค่ไหนก็ตามนั้น ไม่ใช่ fix 1-10) จัดกลุ่มตาม parentStepOrder_ ตามลำดับที่ปรากฏจริง ไม่บังคับวนลูป 1..10
 *
 * ยืนยันกับผู้ใช้แล้ว (ตรวจจาก WORKFLOW_TRANSITIONS_SEED จริง, Constants.gs): state 7 เป็นจุดแตกสายจริง
 * (7.1 ผ่าน/7.4 ไม่ผ่าน → 10 ตรงๆ, 7.2/7.3 แก้ไข → 8) ส่วน state 8 "ไม่ใช่" จุดแตกสาย — 8.1-8.6 ไหลเข้า 9.1
 * เสมอไม่มีทางลัดไป 10 ตรงๆ เลยในข้อมูลจริง จึงไม่มี branch indicator ที่ state 8
 */
function buildOwnerActualPathTimeline_(steps, stationsMap, work) {
  if (!steps) return null;

  var order = [];
  var groups = {};
  steps.forEach(function (s) {
    var n = parentStepOrder_(s.order);
    if (!groups[n]) { groups[n] = []; order.push(n); }
    groups[n].push(s);
  });

  var currentStep = steps.filter(function (s) { return s.state === 'current'; })[0] || null;
  var currentMain = currentStep ? parentStepOrder_(currentStep.order) : null;
  var currentStation = stationsMap[work.current_station_key] || null;

  var path = order.map(function (n, idx) {
    var group = groups[n];
    var isCurrent = n === currentMain;
    var anyDone = group.some(function (s) { return s.state === 'done'; });
    var state = isCurrent ? 'current' : (anyDone ? 'done' : 'upcoming');
    var lastReal = group.filter(function (s) { return s.state !== 'upcoming'; }).slice(-1)[0] || null;

    var entry = {
      // 2026-10-08 ตามที่ผู้ใช้ขอ — Timeline หน้า Owner ใช้ owner label ชุดเดียวกับกรอบสถานะปัจจุบัน
      // (ownerMainStepLabelFor_/OWNER_STATE_LABELS_) ไม่ใช่ station_name ภายในอีกต่อไป
      order: n, split: ownerMainStepLabelFor_(n, stationsMap), state: state,
      org: lastReal ? lastReal.org : '', enteredAt: lastReal ? lastReal.enteredAt : null,
      isLastStep: idx === order.length - 1 && n === '10',
    };

    if (isCurrent) {
      var heroInfo = buildHeroDisplayInfo_(currentStation, stationsMap);
      if (heroInfo.isSub) entry.sub = { split: { main: ownerLabelForStation_(heroInfo.subStation), desc: '' }, tone: heroInfo.subTone };
    }

    if (n === '7') entry.branch = buildOwnerStep7BranchInfo_(group, isCurrent, stationsMap);
    if (n === '9' && isCurrent) entry.note = 'ผลงานอยู่ระหว่างการพิจารณาครั้งที่ 2';

    return entry;
  });

  // 2026-10-07 ตามที่ผู้ใช้ขอ — ป้ายตำแหน่งสัมพัทธ์แทนเลข state (ข้อ 6/7): ผ่านแล้ว/ตอนนี้/ถัดไป/หลังจากนั้น
  // (เฉพาะ "upcoming" ตัวแรกเท่านั้นที่เป็น "ถัดไป" ที่เหลือเป็น "หลังจากนั้น" ทั้งหมด)
  var seenUpcoming = false;
  path.forEach(function (entry) {
    if (entry.state === 'done') entry.positionLabel = 'ผ่านแล้ว';
    else if (entry.state === 'current') entry.positionLabel = 'ตอนนี้';
    else { entry.positionLabel = seenUpcoming ? 'หลังจากนั้น' : 'ถัดไป'; seenUpcoming = true; }
  });

  return { path: path, totalSteps: path.length };
}

/** branch indicator ของ state 7 (จุดตัดสินใจจริงเดียวในระบบ) — ถ้ายังไม่ถึง 7.1-7.4 (ปัจจุบันอยู่ที่ "7" เฉยๆ)
 *  แสดงตัวเลือกทั้ง 2 ทาง (ข้อ 5) ถ้าผ่านไปแล้ว แสดงผลจริงที่เกิดขึ้น (ข้อ 2/4) ที่มาของข้อความอ้างอิงจากชื่อ
 *  station จริงที่ StatusHistory บันทึกไว้ (ไม่เดา ไม่ผูกกับ work.evaluation_result เพราะอาจถูกรอบ 2 ทับค่าไปแล้ว) */
function buildOwnerStep7BranchInfo_(group, isCurrent, stationsMap) {
  var resolved = group.filter(function (s) { return s.order !== '7'; })[0] || null; // 7.1/7.2/7.3/7.4 ตัวที่ผ่านจริง
  if (resolved) {
    var staysForRevision = resolved.name.indexOf('แก้ไข') !== -1;
    // 2026-10-08 ตามที่ผู้ใช้ขอ — ใช้ owner label (OWNER_STATE_LABELS_) แทน station_name ภายใน ไม่มีเลข state ปน
    var resolvedLabel = OWNER_STATE_LABELS_[resolved.key] || resolved.name;
    return {
      resolved: true,
      text: staysForRevision
        ? 'ผลการพิจารณา: ' + resolvedLabel + ' — เข้าสู่ขั้นตอนแก้ไขผลงาน'
        : 'ผลการพิจารณา: ' + resolvedLabel + ' — จึงข้ามขั้นตอนการแก้ไขและเข้าสู่ขั้นตอนแจ้งผลโดยตรง',
    };
  }
  if (isCurrent) {
    // 2026-10-08 — ปลายทางทั้ง 2 ทางใช้ owner label ของขั้นหลัก 10/8 แทนข้อความ "ขั้นตอน N" เดิม (ห้ามมีเลข state)
    return {
      resolved: false,
      options: [
        { label: 'ผ่าน / ไม่ผ่าน', to: ownerMainStepLabelFor_('10', stationsMap).main },
        { label: 'ต้องแก้ไข', to: ownerMainStepLabelFor_('8', stationsMap).main },
      ],
    };
  }
  return null;
}

/**
 * รายการเดียวบน Timeline เส้นทางจริง (2026-10-07 redesign ภาษาคน ตามที่ผู้ใช้ขอ) — ใช้ icon/สี class เดิมจาก
 * renderPubFixedTimelineItem_ (Views.gs, ✓ เขียว=ผ่านแล้ว/● navy-teal=ตอนนี้/○ เทา=ยังไม่ถึง ข้อ 9) แต่เปลี่ยน
 * label จาก "ขั้นตอนที่ N" เป็นคำสัมพัทธ์ (ผ่านแล้ว/ตอนนี้/ถัดไป/หลังจากนั้น — ข้อ 6/7) ไม่โชว์เลข state ที่ไหน
 * เลย + "ผู้รับผิดชอบ :: ค่า" รูปแบบเดียวกับกรอบสถานะปัจจุบัน (ข้อ 10) + ตัด "รอดำเนินการ"/วันที่ต่อรายการออก
 * (ข้อ 11/12 — ลด clutter, วันที่อัปเดตล่าสุดดูที่กรอบสถานะปัจจุบันพอ)
 */
function renderOwnerTimelineItem_(entry) {
  var icon = entry.state === 'current' ? '●' : (entry.state === 'done' ? '✓' : '○');

  var respHtml = entry.org
    ? '<div class="owner-tl-resp">ผู้รับผิดชอบ :: <b>' + escapeHtml_(entry.org) + '</b></div>'
    : '';

  // 2026-10-08 — ตัดเลข state ย่อย (7.1/7.4) ออกจากบรรทัด "ผลการพิจารณา" เหมือนกรอบสถานะปัจจุบัน ใช้ owner
  // label เต็มจาก OWNER_STATE_LABELS_ ตรงๆ (entry.sub.split.main ตอนนี้คือ owner label อยู่แล้ว ไม่ต้องเช็ค
  // "ผ่าน"/"ไม่ผ่าน" แยกกรณีอีกต่อไปเหมือนตอนใช้ station_name ภายใน)
  var subHtml = entry.sub
    ? '<div class="pub-tl-sub-row"><span class="pub-tl-sub-label">ผลการพิจารณา:</span> ' +
      '<span class="pub-tl-sub-badge pub-hero-sub-' + entry.sub.tone + '">' +
      escapeHtml_(entry.sub.split.main) + '</span></div>'
    : '';

  var noteHtml = entry.note ? '<div class="owner-tl-note">' + escapeHtml_(entry.note) + '</div>' : '';

  var branchHtml = '';
  if (entry.branch) {
    if (entry.branch.resolved) {
      branchHtml = '<div class="owner-tl-note">' + escapeHtml_(entry.branch.text) + '</div>';
    } else {
      branchHtml = '<div class="owner-tl-branch">' + entry.branch.options.map(function (o, i) {
        return '<div class="owner-tl-branch-row">' + (i === entry.branch.options.length - 1 ? '&#9492;' : '&#9500;') +
          ' <b>' + escapeHtml_(o.label) + '</b> &rarr; ' + escapeHtml_(o.to) + '</div>';
      }).join('') + '</div>';
    }
  }

  // 2026-10-08 รอบ 5 ตามที่ผู้ใช้ขอ — กลับมาใช้ "ขั้นตอนที่ N ชื่อสถานะ" + badge "สถานะปัจจุบัน"/"ขั้นตอนสุดท้าย"
  // (เหมือน renderPubFixedTimelineItem_ ที่หน้าสาธารณะใช้อยู่แล้ว — reuse .pub-tl-badge/.pub-tl-badge-last เดิม
  // ไม่สร้าง CSS ใหม่) แทนคำสัมพัทธ์ "ผ่านแล้ว/ตอนนี้/ถัดไป/หลังจากนั้น" รอบก่อน — ชื่อสถานะยังเป็น owner label
  // (OWNER_STATE_LABELS_) เหมือนเดิมทุกจุด ไม่ใช่ station_name ภายใน (ไม่ใช่การเดา — ไม่มี requirement ใหม่ไหน
  // ขอให้เปลี่ยนกลับไปใช้ชื่อภายใน) เพิ่ม "รอดำเนินการ" กลับมาสำหรับ state ที่ยังไม่ถึง (ข้อ 8)
  var badges = '';
  if (entry.state === 'current') badges += '<span class="pub-tl-badge">สถานะปัจจุบัน</span>';
  if (entry.isLastStep) badges += '<span class="pub-tl-badge pub-tl-badge-last">ขั้นตอนสุดท้าย</span>';
  var pendingHtml = entry.state === 'upcoming' ? '<span class="pub-tl-meta pub-tl-meta-pending">รอดำเนินการ</span>' : '';

  return '<div class="pub-tl-item pub-tl-' + entry.state + '">' +
    '<span class="pub-tl-icon">' + icon + '</span>' +
    '<span class="pub-tl-text">' +
    '<div class="owner-tl-station-name">ขั้นตอนที่ ' + escapeHtml_(entry.order) + ' ' + escapeHtml_(entry.split.main) + badges + '</div>' +
    subHtml + noteHtml + branchHtml + respHtml + pendingHtml +
    '</span></div>';
}

/**
 * หัวข้อ Timeline ภาษาคน + รายการ Timeline แนวตั้ง แบบ dynamic ตามผลที่ขั้นตอน 7 (2026-10-08 รอบ 14 ตามที่
 * ผู้ใช้ขอ) — ใช้ buildOwnerFullWorkflowWithSkips_ (PublicTrack.gs, backbone คงที่ 1-10 + flag
 * .skipped/.isNextAfterSkip) เป็นแหล่งข้อมูลเดียวเหมือนเดิม แต่ตอนนี้ "กรอง" (filter) ขั้นตอนที่ .skipped=true
 * ออกจากรายการที่ render จริง ไม่ render เลย (ก่อนหน้านี้ รอบ 9 ยังโชว์ 8/9 แบบเกรย์เอาท์ "ไม่ใช้ในกรณีนี้" —
 * ผู้ใช้ขอเปลี่ยนเป็นซ่อนไปเลยไม่ให้เห็น node เลยในรอบนี้):
 * - ผล state 7 = "ผ่าน/ไม่ผ่าน" (7.1/7.4) → skippedMainSteps {8,9} ถูกกรองออก → เห็น 1,2,3,4,5,6,7,10 เชื่อมตรง
 * - ผล state 7 = "แก้ไข" (7.2/7.3) หรือยังไม่ถึง/ไม่มีผล (state 1-6) → skippedMainSteps ว่าง → เห็นครบ 1-10
 * ไม่มีข้อความ "ข้ามขั้นตอน 8-9" ใดๆ (ตามที่ผู้ใช้ขอข้อ "UI Behavior" — เพียงซ่อนเฉยๆ ไม่ต้องอธิบาย) 10 (ถัดไป
 * จริงทันทีหลัง 8,9 ที่ถูกกรอง) ยังขึ้น "ขั้นตอนถัดไป" ตามเดิม (isNextAfterSkip คำนวณไว้ก่อนกรองแล้ว ไม่กระทบ)
 * buildOwnerActualPathTimeline_/renderOwnerTimelineItem_ (เส้นทางจริงแบบเก่า) เลิกใช้ในหน้านี้แล้ว ไม่ได้ลบ
 * ไฟล์ทิ้ง
 *
 * 2026-10-08 รอบ 10 — ผู้ใช้ขอให้ส่วนนี้ยุบ/ขยายได้ (ค่าเริ่มต้นยุบ ให้หน้ากระชับ เห็นผลการพิจารณาก่อน) ใช้
 * <details>/<summary> มาตรฐานตามข้อ 9 ของ requirement (กระทบโค้ดเดิมน้อยที่สุด ไม่ต้องเขียน JS ไม่ reload หน้า
 * รองรับ keyboard Enter/Space + focus state + aria-expanded ให้เองโดย browser เป็น native semantics ของ
 * <details>/<summary> อยู่แล้ว) ไม่มี "open" attribute เลย = ปิดเป็นค่าเริ่มต้นเสมอทั้ง desktop/mobile (ข้อ 1/7)
 * ยังใช้ class .owner-tl-section-title เดิมสำหรับหัวข้อ (ไม่กระทบเทส/โค้ดอื่นที่อ้าง class นี้)
 */
function renderOwnerTimelineSection_(fullWithSkips) {
  if (!fullWithSkips) return '';
  var visibleEntries = fullWithSkips.filter(function (entry) { return !entry.skipped; });
  return '' +
    '<details class="owner-tl-toggle">' +
    '<summary class="owner-tl-toggle-summary">' +
    '<span class="owner-tl-toggle-text">' +
    '<span class="owner-tl-section-title">เส้นทางการดำเนินงาน</span>' +
    '<span class="owner-tl-toggle-sub">ดูขั้นตอนทั้งหมดของผลงาน</span>' +
    '</span><span class="owner-tl-toggle-arrow">&#9660;</span>' +
    '</summary>' +
    '<div class="owner-tl-wrap"><div class="pub-timeline">' +
    visibleEntries.map(renderOwnerFullDetailItem_).join('') + '</div></div>' +
    '</details>';
}

/**
 * รายการเดียวใน Timeline หลัก (2026-10-08 รอบ 9) — ครบ 1-10 ขั้นตอนเสมอ:
 * - เสร็จแล้ว (done): ✓ เขียว แสดงแค่ชื่อขั้นตอนหลัก ไม่มีข้อความรอง/ผู้รับผิดชอบ/วันที่ซ้ำ (ข้อ 4)
 * - ปัจจุบัน (current): ● กรมท่า badge "สถานะปัจจุบัน" + "ผู้รับผิดชอบ :: X" (ข้อ 3) + "ผลการพิจารณา: X"
 *   ถ้ามีผลย่อยแล้ว (ข้อ 6, decimal state ไม่สร้าง node ใหม่ รวมเป็นผลของ step หลัก)
 * - ยังไม่ถึงปกติ (upcoming, ไม่ถูกข้าม): ○ เทา "รอดำเนินการ" หรือ "ขั้นตอนถัดไป" ถ้าเป็นขั้นตอนจริงที่ต่อ
 *   จากช่วงที่ถูกข้ามทันที (.isNextAfterSkip, ข้อ 7 ตัวอย่าง state 10 หลัง 8/9 ถูกข้าม)
 * - ถูกข้าม (.skipped=true, 8/9 ตอนผล state 7="ผ่าน/ไม่ผ่าน"): ○ เทา "ไม่ใช้ในกรณีนี้" ห้ามแสดง
 *   "รอดำเนินการ" เพราะไม่จริง (ข้ามไปแล้วจริงๆ ไม่ใช่กำลังรอ) — entry.skipped ต้องชนะ entry.state เสมอ
 *   (state อาจยังเป็น "done" จาก buildFixedMainTimeline_ ที่มาร์คตามตำแหน่งเลขเฉยๆ ถ้างานเดินผ่าน state 10
 *   ไปแล้ว ทั้งที่ 8/9 ไม่เคยถูกเดินผ่านจริง ไอคอนต้องเป็น ○ ไม่ใช่ ✓)
 */
function renderOwnerFullDetailItem_(entry) {
  var icon = entry.skipped ? '○' : (entry.state === 'current' ? '●' : (entry.state === 'done' ? '✓' : '○'));
  var stateClass = entry.skipped ? 'upcoming owner-tl-skip' : entry.state;

  var badges = '';
  if (entry.state === 'current') badges += '<span class="pub-tl-badge">สถานะปัจจุบัน</span>';
  if (entry.isLastStep) badges += '<span class="pub-tl-badge pub-tl-badge-last">ขั้นตอนสุดท้าย</span>';

  var subHtml = entry.sub
    ? '<div class="pub-tl-sub-row"><span class="pub-tl-sub-label">ผลการพิจารณา:</span> ' +
      '<span class="pub-tl-sub-badge pub-hero-sub-' + entry.sub.tone + '">' + escapeHtml_(entry.sub.split.main) + '</span></div>'
    : '';

  var metaHtml = '';
  if (entry.skipped) {
    metaHtml = '<span class="owner-tl-skip-reason">' + escapeHtml_(entry.skipReason) + '</span>';
  } else if (entry.state === 'current') {
    if (entry.org) metaHtml = '<div class="owner-tl-resp">ผู้รับผิดชอบ :: <b>' + escapeHtml_(entry.org) + '</b></div>';
  } else if (entry.state === 'upcoming') {
    metaHtml = '<span class="pub-tl-meta pub-tl-meta-pending">' + (entry.isNextAfterSkip ? 'ขั้นตอนถัดไป' : 'รอดำเนินการ') + '</span>';
  }
  // state === 'done' (ไม่ถูกข้าม): ไม่มี metaHtml เลยตามข้อกำหนด "ไม่ต้องมีข้อความรองซ้ำ"

  return '<div class="pub-tl-item pub-tl-' + stateClass + '">' +
    '<span class="pub-tl-icon">' + icon + '</span>' +
    '<span class="pub-tl-text">' +
    '<div class="owner-tl-station-name">ขั้นตอนที่ ' + escapeHtml_(entry.order) + ' ' + escapeHtml_(entry.split.main) + badges + '</div>' +
    subHtml + metaHtml +
    '</span></div>';
}

/** <details> "ดูรายละเอียดทั้ง 10 ขั้นตอน" / "ซ่อนรายละเอียด" — ปิดเริ่มต้นเสมอ (Timeline เส้นทางจริงด้านบนพอ
 *  สำหรับอ่านไวแล้ว รายละเอียดเต็มเป็นของเสริมให้ดูตามต้องการ) toggle ข้อความด้วย CSS ล้วน ไม่มี JS (ข้อ 11) */
function renderOwnerFullDetailSection_(fullWithSkips) {
  if (!fullWithSkips) return '';
  return '<details class="owner-detail-toggle"><summary>' +
    '<span class="owner-toggle-closed-text">ดูรายละเอียดทั้ง 10 ขั้นตอน</span>' +
    '<span class="owner-toggle-open-text">ซ่อนรายละเอียด</span></summary>' +
    '<div class="pub-timeline">' + fullWithSkips.map(renderOwnerFullDetailItem_).join('') + '</div></details>';
}

/**
 * การ์ด "ผลการพิจารณา" (2026-10-12 รอบ 16 ตามที่ผู้ใช้ขอ) — ตัด "ผู้รับผิดชอบ"/"อัปเดตล่าสุด" แบบ 2-column
 * grid เดิม (miniRow) ออกทั้งหมด (รอบ 15) ย้ายวันที่ (work.updated_at ฟิลด์เดิม — "วันที่อัปเดตสถานะล่าสุดจาก
 * ข้อมูลจริง" ไม่ใช่ receive_date ซึ่งคือ "วันที่รับผลงาน" คนละความหมาย ไม่ได้ลบ/เปลี่ยน field แค่ย้ายตำแหน่ง/
 * รูปแบบแสดงผล) ไปไว้เป็นบรรทัด "วันที่ :: dd/mm/yyyy" (ปี พ.ศ., วัน/เดือน 2 หลักเสมอ, ไม่มีเวลา — ใช้
 * formatDateDDMMYYYYBuddhist_ ใหม่, Utils.gs) ใต้บรรทัด "ขั้นตอนปัจจุบัน :: ..." ทันที (รอบ 16 — เปลี่ยนจาก
 * label/รูปแบบ "อัปเดตเมื่อ 8 ต.ค. 2569 เวลา 10.24 น." ของรอบ 15) ถ้าไม่มีวันที่จริง/invalid ไม่ render บรรทัด
 * นี้เลย (formatDateDDMMYYYYBuddhist_ คืน '' ให้เช็คแล้วซ่อนทั้งบรรทัด ห้ามแสดง "วันที่ :: -"/"null"/
 * "Invalid Date") ผู้รับผิดชอบ (work.current_owner_org) เลิกแสดงในการ์ดนี้แล้วตามที่ผู้ใช้ขอ (field ยังอยู่ใน
 * ฐานข้อมูลเหมือนเดิม ไม่ได้ลบ แค่ไม่ render ที่นี่)
 *
 * บรรทัดผลการพิจารณา (ถ้ามี, info.isSub=true เฉพาะ 7.1-7.4 เท่านั้น ไม่รวม 8.x/9.x ที่เป็นลำดับขั้นย่อยไม่ใช่ผล
 * ประเมิน) แสดงเป็นไอคอน+ข้อความบรรทัดเดียวเด่นกว่าปกติเล็กน้อย (สีตาม tone: ผ่าน=เขียว/แก้ไข=เหลืองส้ม/ไม่ผ่าน=
 * แดง) ถ้ายังไม่มีผล (isSub=false เสมอสำหรับ state 1-6/8/9/10) ไม่ render บรรทัดนี้เลย ไม่เหลือช่องว่าง/
 * placeholder ใดๆ
 */
function renderOwnerResultCard_(work, info, currentStation, stationsMap) {
  var iconByTone = { done: '&#10003;', danger: '&#10007;', revision: '&#9888;', pending: '' };

  var mainOrder = currentStation ? parentStepOrder_(currentStation.station_order || '') : '';
  var mainLabel = mainOrder ? ownerMainStepLabelFor_(mainOrder, stationsMap || {}).main : '';
  var currentLineHtml = '<div class="owner-result-current-line">' +
    '<span class="owner-result-current-label">ขั้นตอนปัจจุบัน ::</span> ' + escapeHtml_(mainLabel) + '</div>';

  var updatedDateText = formatDateDDMMYYYYBuddhist_(work.updated_at);
  var updatedLineHtml = updatedDateText
    ? '<div class="owner-result-updated"><span class="owner-result-updated-label">วันที่ ::</span> ' + escapeHtml_(updatedDateText) + '</div>'
    : '';

  var outcomeHtml = '';
  if (info.isSub) {
    var tone = info.subTone;
    var resultLabel = ownerLabelForStation_(info.subStation);
    outcomeHtml = '<div class="owner-result-outcome owner-result-outcome-' + tone + '">' +
      '<span class="owner-result-outcome-icon">' + iconByTone[tone] + '</span> ' + escapeHtml_(resultLabel) + '</div>';
  }

  return '' +
    '<div class="owner-result-card">' +
    currentLineHtml +
    updatedLineHtml +
    outcomeHtml +
    '</div>';
}

/**
 * การ์ด "ขั้นตอนถัดไป" (2026-10-08 ตาม mockup) — reuse findNextStepDisplay_ เดิม (คำนวณจาก steps จริง ไม่
 * hardcode) ระบบนี้ Owner Dashboard เป็น Read-Only ล้วน (ดู docstring บนสุดของไฟล์ — ไม่มีสิทธิ์แก้ไขใดๆ) จึง
 * ไม่มีกรณีที่เจ้าของผลงานต้องกดทำอะไรเองเลยสักจุด ข้อความ "ขณะนี้ท่านยังไม่ต้องดำเนินการ" จึงแสดงเสมอเมื่อมี
 * ขั้นตอนถัดไป (ไม่ใช่การเดา — เป็นข้อเท็จจริงของสถาปัตยกรรมระบบนี้)
 */
function renderOwnerNextStepCard_(nextStep) {
  var bodyHtml = nextStep
    ? '' +
      '<div class="owner-next-text">' + escapeHtml_(nextStep.station ? ownerLabelForStation_(nextStep.station) : nextStep.split.main) + '</div>' +
      '<div class="owner-next-noaction">&#10003; ขณะนี้ท่านยังไม่ต้องดำเนินการ</div>' +
      '<div class="owner-next-subtext">โปรดรอการแจ้งผลจากสำนักงานเขต<br>ท่านจะได้รับการแจ้งอีกครั้งเมื่อมีความคืบหน้า</div>'
    : '<div class="owner-next-empty">กระบวนการพิจารณาเสร็จสิ้นแล้ว</div>';

  return '' +
    '<div class="owner-next-card">' +
    '<div class="owner-next-head"><div class="owner-next-icon">&#8599;</div>' +
    '<div class="owner-next-title">ขั้นตอนถัดไป</div></div>' +
    bodyHtml +
    '</div>';
}

/** การ์ดสรุป "ตอนนี้ / ถัดไป" แบบ compact (2026-10-07 ข้อ 5) — reuse ข้อมูลเดียวกับกรอบสถานะปัจจุบัน
 *  (buildHeroDisplayInfo_/findNextStepDisplay_ เดิมทุกประการ ไม่สร้าง logic คำนวณใหม่) */
function renderOwnerNowNextSummary_(currentStation, stationsMap, steps) {
  var info = buildHeroDisplayInfo_(currentStation, stationsMap || {});
  var nextStep = findNextStepDisplay_(steps, stationsMap || {});
  return '' +
    '<div class="owner-nownext-grid">' +
    '<div class="owner-nownext-card"><div class="owner-nownext-label">ตอนนี้</div>' +
    '<div class="owner-nownext-value">' + escapeHtml_(info.stepSplit.main) + '</div></div>' +
    (nextStep ? '' +
      '<div class="owner-nownext-card owner-nownext-next"><div class="owner-nownext-label">ถัดไป</div>' +
      '<div class="owner-nownext-value">' + escapeHtml_(nextStep.split.main) + '</div></div>' : '') +
    '</div>';
}

/** หน้า "ผลงานของฉัน" หลัง login — reuse buildPublicResultData_/renderPub* เดิมทั้งหมด (ข้อ 12 — ใช้ layout
 *  เดิมของหน้าเจ้าของผลงานที่พัฒนาไว้) ต่างจากหน้าสาธารณะ 3 จุด: ไม่ mask ชื่อ (เป็นเจ้าของจริง) + Timeline
 *  เส้นทางจริง (ไม่ใช่ backbone คงที่ 1-10) + ปุ่ม "ออกจากระบบ" แทน "ตรวจสอบรายการอื่น" */
/** "วันที่รับผลงาน" เฉพาะหน้า Owner Dashboard (2026-10-08) — รูปแบบเดียวกับ formatDateThShort_ ทั่วระบบ
 *  ("24 ก.ย. 2569 เวลา 10.15 น.") แต่ซ่อนส่วนเวลาถ้าค่าจริงไม่มีเวลา (เที่ยงคืนพอดี 00:00 ถือว่าไม่มีเวลา —
 *  แยกฟังก์ชันเองจาก formatDateThShort_ เดิม ไม่แตะของเดิมที่หน้าอื่นทั่วระบบใช้แสดงเวลาเสมอ) */
function formatOwnerReceivedDate_(date) {
  if (!date) return '-';
  var d = new Date(date);
  if (isNaN(d.getTime())) return '-';
  var day = d.getDate();
  var month = THAI_MONTHS_SHORT_[d.getMonth()];
  var year = getBuddhistYear_(d);
  var hasTime = d.getHours() !== 0 || d.getMinutes() !== 0;
  if (!hasTime) return day + ' ' + month + ' ' + year;
  var hh = padLeft_(d.getHours(), 2);
  var mm = padLeft_(d.getMinutes(), 2);
  return day + ' ' + month + ' ' + year + ' เวลา ' + hh + '.' + mm + ' น.';
}

/**
 * 2026-10-08 — redesign เต็มหน้าตาม mockup ที่ผู้ใช้ส่งมา (ข้อความ/layout ใหม่): Header -> Owner Summary Card
 * (3 ช่อง) -> Result Card + Next Step Card (2 คอลัมน์) -> Timeline เส้นทางจริง (แนวนอน desktop/แนวตั้งมือถือ
 * ผ่าน CSS เท่านั้น) + ปุ่มขยายดูครบ 10 ขั้นตอน -> หมายเหตุ (ถ้ามี) ทุกจุดยัง reuse data layer เดิมทั้งหมด
 * (buildPublicResultData_/buildHeroDisplayInfo_/findNextStepDisplay_/buildOwnerActualPathTimeline_/
 * buildOwnerFullWorkflowWithSkips_) ไม่สร้าง logic คำนวณใหม่เลย แก้เฉพาะการจัดวาง/ข้อความที่แสดงผล
 * (ข้อ 16 — ไม่กระทบ Admin/Staff/Login/Search/Excel View/QR/WorkflowMaster/schema ใดๆ ทั้งสิ้น)
 */
function renderOwnerDashboardBody_(ss, work, baseUrl, sessionId) {
  var ownerName = ((work.title_name || '') + (work.first_name || '') + ' ' + (work.last_name || '')).trim();
  var data = buildPublicResultData_(ss, work);
  var info = buildHeroDisplayInfo_(data.currentStation, data.stationsMap || {});
  var logoutUrl = baseUrl + '?page=owner-login&logout=1&osession=' + encodeURIComponent(sessionId);

  // 1. PAGE HEADER — 2026-10-12 ตามที่ผู้ใช้ขอ: เปลี่ยนปุ่ม "← กลับหน้าหลัก" เป็น "✕ ปิด" สีแดง (danger) ไม่มี
  // route/navigation ใหม่ใดๆ — ใช้ logoutUrl เดิมตรงๆ (navigation function เดิมของระบบ, ข้อ 7) เพราะระบบนี้ไม่มี
  // หน้า "หลัก"/"ก่อนหน้า" อื่นแยกให้กลับไปจริง (Owner Dashboard เป็นหน้าเดียวหลัง login ทั้งหมด ตามที่ยืนยันไว้
  // ตั้งแต่รอบก่อน) การกด "ปิด" จึงยังพากลับไปหน้า Login เหมือนเดิมทุกประการ แค่เปลี่ยน label/สี ไม่ใช้
  // window.close() (ซึ่งจะพังถ้า browser ไม่อนุญาตปิดแท็บที่ไม่ได้เปิดด้วย script)
  var headerHtml = '' +
    '<div class="owner-page-header">' +
    '<div><div class="owner-page-title">ผลการติดตามสถานะ</div>' +
    '<div class="owner-page-subtitle">ตรวจสอบความคืบหน้าและขั้นตอนถัดไปของผลงาน</div></div>' +
    // 2026-10-12 รอบ 19 — onclick ล้าง localStorage ของ SPA flow (OWNER_LOGIN_SPA_SCRIPT_) ก่อน navigate ออก
    // กันเคส login ใหม่/คนอื่นมาเปิดเครื่องเดียวกันแล้วเจอ session ค้างใน localStorage (ปุ่มนี้ยัง navigate ไป
    // logoutUrl เดิมเหมือนเดิมทุกประการ — มี user gesture จริงจากการคลิก ไม่ใช่ auto-redirect ไม่ติด sandbox)
    '<a class="owner-close-btn" target="_top" href="' + escapeHtml_(logoutUrl) + '" onclick="try{localStorage.removeItem(\'owner_session_id\')}catch(e){}">&#10005; ปิด</a>' +
    '</div>';

  // 2. OWNER SUMMARY CARD — 3 ช่องตามที่ผู้ใช้ขอ (เจ้าของผลงาน/เลขทะเบียน/วันที่รับผลงาน) ไม่มีชื่อผลงานในการ์ด
  // นี้เลย (ข้อกำหนด: ถ้าไม่มีชื่อผลงาน ห้ามแสดง "ชื่อผลงาน: -") — โชว์เป็นช่องที่ 4 เสริมเฉพาะตอนมีค่าจริงเท่านั้น
  function summaryItem(icon, label, value) {
    return '<div class="owner-summary-item"><div class="owner-summary-icon">' + icon + '</div>' +
      '<div><div class="owner-summary-label">' + escapeHtml_(label) + '</div>' +
      '<div class="owner-summary-value">' + escapeHtml_(value) + '</div></div></div>';
  }
  var summaryHtml = '' +
    '<div class="owner-summary-card"><div class="owner-summary-grid">' +
    summaryItem('&#128100;', 'เจ้าของผลงาน', ownerName || '-') +
    summaryItem('&#128196;', 'เลขทะเบียน', work.tracking_no) +
    summaryItem('&#128197;', 'วันที่รับผลงาน', formatOwnerReceivedDate_(work.received_date)) +
    (work.work_title ? summaryItem('&#128221;', 'ชื่อผลงาน', work.work_title) : '') +
    '</div></div>';

  // 3. RESULT CARD — เต็มความกว้าง (2026-10-08 รอบ 6 ตามที่ผู้ใช้ขอ) ตัดการ์ด "ขั้นตอนถัดไป" ออกแล้ว ไม่แบ่ง
  // layout 70/30 อีกต่อไป — Timeline ด้านล่าง (buildOwnerActualPathTimeline_) เป็นตัวบอกขั้นตอนถัดไปแทน (ข้อมูล
  // next state ไม่ได้ถูกลบออกจากระบบ ยังคำนวณอยู่ใน Timeline เหมือนเดิมทุกประการ แค่ไม่ render เป็นการ์ดแยกแล้ว)
  var resultCardHtml = renderOwnerResultCard_(work, info, data.currentStation, data.stationsMap);

  // 5/6. TIMELINE — Timeline หลักชุดเดียวของหน้า (2026-10-08 รอบ 9 ตามที่ผู้ใช้ขอ) โชว์ครบ 1-10 ขั้นตอนเสมอ
  // (buildOwnerFullWorkflowWithSkips_ เดิม ก่อนรอบนี้ใช้แสดงในปุ่ม "ดูรายละเอียด 10 ขั้นตอน" ที่ซ้ำกับ Timeline
  // เส้นทางจริงด้านบน — ตอนนี้กลายเป็น Timeline เดียวของหน้า buildOwnerActualPathTimeline_ เลิกใช้ในหน้านี้แล้ว)
  var fullWithSkips = buildOwnerFullWorkflowWithSkips_(data.steps, data.stationsMap, work);
  // 2026-10-08 รอบ 3 — ผู้ใช้ขอตัดกล่อง "ⓘ ข้อมูลเดิม" ออกจากหน้านี้โดยเฉพาะ (หน้าสาธารณะ/หน้ารายละเอียด
  // เจ้าหน้าที่/Workflow Checklist ยังมีเหมือนเดิม ไม่แตะ renderPubLegacyInfoBox_ เอง)
  var timelineHtml = renderOwnerTimelineSection_(fullWithSkips);

  var noteHtml = '';
  if (work.current_status_public === 'need_revision' && data.revisionInfo) {
    noteHtml = '' +
      '<div class="revision-box">' +
      '<p class="revision-title">รายการที่ต้องแก้ไข</p>' +
      '<p>' + escapeHtml_(data.revisionInfo.reasons || '-') + '</p>' +
      (data.revisionInfo.due_date ? '<p>กรุณาส่งฉบับแก้ไขกลับภายใน <b>' + escapeHtml_(data.revisionInfo.due_date) + '</b></p>' : '') +
      '</div>';
  } else if (data.latestNote) {
    noteHtml = '' +
      '<div class="pub-note-box"><div class="pub-note-title">หมายเหตุจากผู้รับผิดชอบ</div><p>' + escapeHtml_(data.latestNote) + '</p></div>';
  }

  // wrapper กว้างกว่า .pub-compact เดิม (1200-1400px ตาม mockup) — scope เฉพาะ class .owner-page-wrap นี้
  // เท่านั้น ไม่แก้ .pub-compact{max-width:860px} เดิมที่หน้า scan/public result อื่นยังใช้ร่วมกันอยู่
  return '' +
    '<div class="pub-compact owner-page-wrap">' +
    headerHtml + summaryHtml + resultCardHtml + timelineHtml + noteHtml +
    '</div>';
}
