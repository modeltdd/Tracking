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

/** ?page=owner-dashboard&osession=... (GET) — ต้องตรวจ session ฝั่ง server ทุกครั้ง ห้ามเชื่อ URL เฉยๆ (ข้อ 10) */
function renderOwnerDashboardRoute_(ss, params, baseUrl) {
  var sessionId = String(params.osession || '').trim();
  var work = sessionId ? validateOwnerSession_(ss, sessionId) : null;
  if (!work) {
    return renderPublicPage_('เข้าสู่ระบบ',
      renderOwnerLoginDirectFormBody_(baseUrl, sessionId ? ['เซสชันหมดอายุหรือไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่อีกครั้ง'] : [], [], {}));
  }
  return renderPublicPage_('ผลงานของฉัน', renderOwnerDashboardBody_(ss, work, baseUrl, sessionId));
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
  return renderPublicPage_('เข้าสู่ระบบสำเร็จ', renderOwnerLoginBounceBody_(baseUrl, session.id));
}

/**
 * form_action=owner_login_direct (POST) — 2026-10-06 หน้าแรกใหม่: Username (ชื่อ/นามสกุล — reuse
 * searchPublicRecordsByName_ เดิม ไม่สร้าง field ใหม่) + Password แยกช่อง รวมเป็น string เดียวฝั่ง client
 * แล้วส่งมาเป็น owner_login_code เดียวกับ flow เดิมทุกประการ ไม่มีขั้นเลือก record แยก (ต่างจาก
 * handleOwnerLoginSubmitPost_ เดิมที่ต้องเลือก work_id ก่อน) — แก้ปัญหาชื่อซ้ำด้วยการลองเทียบรหัสผ่านกับ
 * "ทุกรายการที่ชื่อตรงกัน" แล้ว login เข้ารายการแรกที่รหัสตรง (ของจริงรหัสเริ่มต้น = tracking_no ซึ่งไม่ซ้ำกัน
 * อยู่แล้วในตัว จึงแยกคนซ้ำชื่อได้โดยอัตโนมัติไม่ต้องให้ผู้ใช้เลือกเอง)
 */
function handleOwnerLoginDirectPost_(ss, e, baseUrl) {
  var p = (e && e.parameter) || {};
  var username = normalizeSearchName_(p.owner_username || '');
  var code = String(p.owner_login_code || '').trim();
  var sessionToken = String(p.session_token || '').trim() || randomToken_(16);
  var prevValues = { owner_username: username, session_token: sessionToken };

  // 2026-10-07 รอบ 2 — เพิ่ม log ทุกขั้นตามที่ผู้ใช้ขอ (ข้อ 7: ห้าม log password) ไว้ตรวจได้จาก Apps Script
  // Editor > Executions เวลา login ไม่ redirect แล้วเกิดซ้ำอีก จะรู้ทันทีว่าหลุดตรงขั้นไหน
  Logger.log('[OwnerLogin] request received, username=' + username);

  if (checkOwnerLoginLock_(sessionToken)) {
    Logger.log('[OwnerLogin] blocked: rate-limit lock active for this session_token');
    return renderPublicPage_('เข้าสู่ระบบ',
      renderOwnerLoginDirectFormBody_(baseUrl, ['ลองเข้าสู่ระบบผิดเกินจำนวนที่กำหนด กรุณารอสักครู่แล้วลองใหม่อีกครั้ง'], [], prevValues));
  }
  if (!username) {
    Logger.log('[OwnerLogin] rejected: username ว่าง');
    return renderPublicPage_('เข้าสู่ระบบ', renderOwnerLoginDirectFormBody_(baseUrl, ['กรุณากรอก Username'], [], prevValues));
  }
  // ข้อ 8 — กรอกรหัสไม่ครบ (รูปแบบไม่ตรง __-___) ถือเป็นคนละเคสกับ login ไม่ผ่าน แจ้งข้อความเฉพาะ แต่ยังนับ
  // เป็นความพยายามผิด 1 ครั้งเพื่อกัน brute-force (ตรวจฝั่ง server เสมอ ไม่เชื่อ client — ข้อ 10)
  if (!validateOwnerLoginCodeFormat_(code)) {
    Logger.log('[OwnerLogin] rejected: รูปแบบรหัสผ่านไม่ตรง NN-NNN (ไม่ log ค่าจริง)');
    registerOwnerLoginAttempt_(ss, sessionToken, false);
    writeOwnerLoginLog_(ss, '', username, 'failed', sessionToken);
    return renderPublicPage_('เข้าสู่ระบบ', renderOwnerLoginDirectFormBody_(baseUrl, ['กรุณากรอกรหัสผ่านให้ครบ'], [], prevValues));
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
    return renderPublicPage_('เข้าสู่ระบบ', renderOwnerLoginDirectFormBody_(baseUrl, ['ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง'], [], prevValues));
  }

  // 2026-10-07 กลับมาใช้หน้า bounce + redirect (ดูเหตุผลที่ handleOwnerLoginSubmitPost_ ด้านบน — render
  // dashboard ตรงใน POST response ทำให้ refresh/ย้อนกลับ resubmit POST เดิมจน script.google.com ปฏิเสธการเชื่อมต่อ)
  // session ต้องสร้าง+บันทึกสำเร็จ "ก่อน" ส่ง response กลับเสมอ (บรรทัดถัดไปรันแบบ synchronous ใน Apps Script
  // อยู่แล้ว ไม่มีทาง race — createOwnerSession_ เขียนชีต OwnerSessions เสร็จก่อนบรรทัด return เสมอ)
  var session = createOwnerSession_(ss, matchedWork);
  var redirectUrl = baseUrl + '?page=owner-dashboard&osession=' + encodeURIComponent(session.id);
  Logger.log('[OwnerLogin] session created: session_id=' + session.id + ', redirectUrl=' + redirectUrl);
  return renderPublicPage_('เข้าสู่ระบบสำเร็จ', renderOwnerLoginBounceBody_(baseUrl, session.id));
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

  var boxesHtml = '';
  for (var i = 0; i < 5; i++) {
    if (i === 2) boxesHtml += '<span class="owner-pass-sep">-</span>';
    boxesHtml += '<input type="password" inputmode="numeric" pattern="[0-9]*" maxlength="1" autocomplete="one-time-code" class="owner-pass-box">';
  }

  return '' + errorHtml + noticeHtml +
    '<div class="detail-card owner-login-card">' +
    '<p class="pub-subheader-label">กรุณาเข้าสู่ระบบเพื่อติดตามผลงานของท่าน</p>' +
    '<form id="owner-login-direct-form" method="post" target="_top" action="' + baseUrl + '" class="reg-form" style="border:none;padding:0;">' +
    '<input type="hidden" name="form_action" value="owner_login_direct">' +
    '<input type="hidden" name="session_token" value="' + escapeHtml_(sessionToken) + '">' +
    '<input type="hidden" id="owner_login_code_hidden" name="owner_login_code" value="">' +
    '<div class="field" style="text-align:left"><label>Username</label>' +
    '<input class="input" name="owner_username" value="' + escapeHtml_(prevValues.owner_username || '') + '" placeholder="กรอกชื่อผู้ใช้งาน" required></div>' +
    '<div class="field" style="text-align:left"><label>Password</label>' +
    '<div class="owner-pass-boxes">' + boxesHtml + '</div>' +
    '<button type="button" id="owner-pass-toggle" class="owner-pass-toggle-btn">แสดงรหัส</button>' +
    '</div>' +
    '<button class="btn-primary" type="submit" data-loading-text="กำลังเข้าสู่ระบบ...">เข้าสู่ระบบ</button>' +
    '</form>' +
    // 2026-10-07 ผู้ใช้ขอตัดลิงก์ "ค้นหาสถานะแบบเดิม" + ปุ่มสแกน QR ออกจากหน้า Login ให้เหลือแค่ Username/
    // Password/ปุ่มเข้าสู่ระบบ (ตัดเฉพาะ UI หน้านี้ — ฟังก์ชันค้นหาเดิม/QR ยังอยู่ปกติที่ ?mode=search, Views.gs)
    '</div>' +
    OWNER_LOGIN_PASSWORD_SCRIPT_;
}

/** พฤติกรรมช่อง password แยกทีละตัว — auto-advance/backspace ย้อนกลับ/ลูกศรซ้าย-ขวา/paste กระจายอัตโนมัติ/
 *  Enter submit/ปุ่มแสดง-ซ่อนรหัส (ข้อ 3/5/14) รวมค่าทุกช่องเป็น "NN-NNN" ลง hidden input ก่อน submit เสมอ */
var OWNER_LOGIN_PASSWORD_SCRIPT_ = '' +
  '<script>' +
  'document.addEventListener("DOMContentLoaded", function () {' +
  'var boxes = Array.prototype.slice.call(document.querySelectorAll(".owner-pass-box"));' +
  'var hidden = document.getElementById("owner_login_code_hidden");' +
  'var form = document.getElementById("owner-login-direct-form");' +
  'var toggleBtn = document.getElementById("owner-pass-toggle");' +
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
  'if (toggleBtn) {' +
  'var shown = false;' +
  'toggleBtn.addEventListener("click", function () {' +
  'shown = !shown;' +
  'boxes.forEach(function (b) { b.type = shown ? "text" : "password"; });' +
  'toggleBtn.textContent = shown ? "ซ่อนรหัส" : "แสดงรหัส";' +
  '});' +
  '}' +
  'form.addEventListener("submit", function (ev) {' +
  'syncHidden();' +
  'if (hidden.value.length < 6) {' +
  'ev.preventDefault();' +
  'alert("กรุณากรอกรหัสผ่านให้ครบ");' +
  '}' +
  '});' +
  '});' +
  '</script>';

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
 * 2026-10-07 รอบ 3 — ผู้ใช้ส่ง DevTools Console log จริงมาให้ดู (หลังรอบ 2 ที่ซ่อนปุ่มไว้) พิสูจน์ root cause ชัดเจน:
 * "Unsafe attempt to initiate navigation for frame ... sandboxed with the 'allow-top-navigation-by-user-
 * activation' flag, but has no user activation (gesture)" — Apps Script web app เนื้อหาจริงรันอยู่ใน iframe
 * ข้าม origin (googleusercontent.com) ภายใต้ script.google.com เสมอ (ไม่มีทางหนีออกได้) Chrome บล็อก
 * top.location.replace() ที่ยิงเองจาก <script> อัตโนมัติไม่มี user gesture เสมอ ไม่ว่าจะ try/catch ยังไงก็ตาม —
 * fallback location.replace() (navigate เฉพาะ iframe ตัวเอง) ก็ถูก X-Frame-Options:sameorigin ของ
 * script.google.com เองปฏิเสธอีกทอด เป็น hard platform limitation ของ Apps Script Web App ไม่ใช่บั๊กที่แก้
 * ด้วยโค้ดได้ — <a target="_top"> ที่ใช้ทั่วทั้งระบบนี้ทำงานได้เพราะมาจาก click จริง (มี user gesture) เท่านั้น
 * สรุป: "redirect อัตโนมัติแบบไม่ต้องกด" ทำไม่ได้จริงในสถาปัตยกรรมนี้ — ของที่ทำได้ดีที่สุดคือลดเหลือกดแค่ 1 ครั้ง
 * (ปุ่มโชว์ทันที ไม่ซ่อน ไม่หน่วง 3 วิเหมือนรอบก่อน เพราะรู้แล้วว่า auto-redirect แทบไม่มีทางสำเร็จ) auto-focus
 * ปุ่มให้กด Enter/เว้นวรรคต่อได้ทันทีโดยไม่ต้องเล็งเมาส์ ยังลอง top.location.replace() ก่อนเสมอ (ฟรี เผื่อ
 * deployment/browser บางแบบอนุญาต) ไม่ตัดทิ้งไปเลย */
function renderOwnerLoginBounceBody_(baseUrl, sessionId) {
  var url = baseUrl + '?page=owner-dashboard&osession=' + encodeURIComponent(sessionId);
  return '' +
    '<div class="detail-card" id="owner-bounce-fallback">' +
    '<p>เข้าสู่ระบบสำเร็จ</p>' +
    '<p><a target="_top" class="btn-primary" id="owner-bounce-link" href="' + escapeHtml_(url) + '" style="display:inline-block;text-decoration:none;text-align:center">ไปที่หน้าผลงานของฉัน</a></p></div>' +
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
      order: n, split: mainStepNameFor_(n, stationsMap), state: state,
      org: lastReal ? lastReal.org : '', enteredAt: lastReal ? lastReal.enteredAt : null,
      isLastStep: idx === order.length - 1 && n === '10',
    };

    if (isCurrent) {
      var heroInfo = buildHeroDisplayInfo_(currentStation, stationsMap);
      if (heroInfo.isSub) entry.sub = { order: heroInfo.subOrder, split: heroInfo.subSplit, tone: heroInfo.subTone };
    }

    if (n === '7') entry.branch = buildOwnerStep7BranchInfo_(group, isCurrent);
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
function buildOwnerStep7BranchInfo_(group, isCurrent) {
  var resolved = group.filter(function (s) { return s.order !== '7'; })[0] || null; // 7.1/7.2/7.3/7.4 ตัวที่ผ่านจริง
  if (resolved) {
    var staysForRevision = resolved.name.indexOf('แก้ไข') !== -1;
    return {
      resolved: true,
      text: staysForRevision
        ? 'ผลการพิจารณา: ' + resolved.name + ' — เข้าสู่ขั้นตอนแก้ไขผลงาน'
        : 'ผลการพิจารณา: ' + resolved.name + ' — จึงข้ามขั้นตอนการแก้ไขและเข้าสู่ขั้นตอนแจ้งผลโดยตรง',
    };
  }
  if (isCurrent) {
    return {
      resolved: false,
      options: [
        { label: 'ผ่าน / ไม่ผ่าน', to: 'ขั้นตอน 10 แจ้งผลหน่วยงาน' },
        { label: 'ต้องแก้ไข', to: 'ขั้นตอน 8 แก้ไขผลงาน' },
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

  // ตัดเลข state ย่อย (7.1/7.4) ออกจากบรรทัด "ผลการพิจารณา" เหมือนกรอบสถานะปัจจุบัน (ข้อ 2/7) ใช้คำเต็มจาก
  // station_name จริงแทนคำสั้นๆ ที่กำกวม
  var subHtml = entry.sub
    ? '<div class="pub-tl-sub-row"><span class="pub-tl-sub-label">ผลการพิจารณา:</span> ' +
      '<span class="pub-tl-sub-badge pub-hero-sub-' + entry.sub.tone + '">' +
      escapeHtml_((entry.sub.split.main === 'ผ่าน' || entry.sub.split.main === 'ไม่ผ่าน') && entry.sub.split.desc
        ? entry.sub.split.desc : entry.sub.split.main) + '</span></div>'
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

  return '<div class="pub-tl-item pub-tl-' + entry.state + '">' +
    '<span class="pub-tl-icon">' + icon + '</span>' +
    '<span class="pub-tl-text">' +
    '<div class="owner-tl-position-label">' + escapeHtml_(entry.positionLabel) + '</div>' +
    '<div class="owner-tl-station-name">' + escapeHtml_(entry.split.main) + '</div>' +
    subHtml + noteHtml + branchHtml + respHtml +
    '</span></div>';
}

/** หัวข้อ Timeline ภาษาคน (ข้อ 8) แทน "ดู Timeline ทั้งหมด N ขั้นตอน" เดิม */
function renderOwnerTimelineSection_(pathData) {
  if (!pathData) return '';
  return '<details class="pub-tl-full-details" open><summary>เส้นทางการดำเนินงาน' +
    '<span class="owner-tl-summary-sub">แสดงเฉพาะขั้นตอนที่เกี่ยวข้องกับผลงานของท่าน</span></summary>' +
    '<div class="pub-timeline">' + pathData.path.map(renderOwnerTimelineItem_).join('') + '</div></details>';
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

function renderOwnerDashboardBody_(ss, work, baseUrl, sessionId) {
  var ownerName = ((work.title_name || '') + (work.first_name || '') + ' ' + (work.last_name || '')).trim();
  var data = buildPublicResultData_(ss, work);

  var nameBlockHtml = '' +
    '<div class="pub-name-block">' +
    '<div class="pub-name-owner">' + escapeHtml_(ownerName || '-') + '</div>' +
    '<div class="pub-name-tracking">เลขทะเบียน ' + escapeHtml_(work.tracking_no) + '</div>' +
    '<div class="pub-name-title">ชื่อผลงาน: ' + escapeHtml_(work.work_title || '-') + '</div>' +
    // 2026-10-08 ผู้ใช้ขอเพิ่ม "วันที่รับผลงาน" ใต้ชื่อผลงาน เฉพาะหน้า Owner Dashboard — ใช้ work.received_date
    // จริง (field เดียวกับที่หน้าอื่นทั่วระบบใช้แสดง "รับเรื่องเมื่อ"/"วันที่ลงรับ" อยู่แล้ว คือวันที่เขตรับเรื่อง
    // เข้าระบบจริง ตรวจจาก Constants.gs/Register.gs แล้ว ไม่เดา) ใช้ formatOwnerReceivedDate_ ของตัวเองแยกจาก
    // formatDateThShort_ เดิม (ไม่แตะของเดิมที่หน้าอื่นใช้อยู่) เพราะต้องซ่อนเวลาถ้าไม่มีเวลาจริง (ข้อ 6)
    '<div class="pub-name-received">วันที่รับผลงาน: ' + escapeHtml_(formatOwnerReceivedDate_(work.received_date)) + '</div>' +
    '</div>';

  // friendlyMode=true (2026-10-07 ตามที่ผู้ใช้ขอ) — เฉพาะหน้า Owner Dashboard: ซ่อน "ขั้นตอนที่ N" และเลข
  // state ย่อย (7.1/7.4) ออกจากกรอบสถานะปัจจุบัน ใช้คำเต็มอ่านง่ายแทน หน้าสาธารณะ/เจ้าหน้าที่ยังเหมือนเดิม
  var heroHtml = renderPubHero_(work, data.currentStation, data.stationsMap, data.steps, true);

  var actionHtml = work.next_step_text
    ? '<div class="pub-action-box"><div class="pub-action-title">สิ่งที่ต้องดำเนินการ</div><p>' + escapeHtml_(work.next_step_text) + '</p></div>'
    : '';

  // 2026-10-07 ตามที่ผู้ใช้ขอ — ตัดการ์ด "ความคืบหน้าของผลงาน" + "ข้อมูลสำคัญ" ออกเฉพาะหน้า Owner Dashboard
  // (หน้าสาธารณะ/หน้ารายละเอียดเจ้าหน้าที่ยังมีเหมือนเดิม ไม่แตะ) + เปลี่ยน Timeline เป็น "เส้นทางจริง" แบบ
  // รองรับ Branching Workflow (ไม่ใช่ backbone คงที่ 1-10 เหมือนหน้าอื่น — เฉพาะหน้านี้)
  var ownerPathTimeline = buildOwnerActualPathTimeline_(data.steps, data.stationsMap, work);
  // 2026-10-07 ตามที่ผู้ใช้ขอ — ตัดกล่อง "ⓘ ข้อมูลเดิม" ออกเฉพาะหน้า Owner Dashboard (หน้าสาธารณะ/หน้า
  // รายละเอียดเจ้าหน้าที่ยังมีเหมือนเดิม ไม่แตะ renderPubLegacyInfoBox_ เอง)
  var timelineHtml = renderOwnerTimelineSection_(ownerPathTimeline);

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

  var logoutUrl = baseUrl + '?page=owner-login&logout=1&osession=' + encodeURIComponent(sessionId);

  // ลำดับหน้าใหม่ (2026-10-07 รอบ 2 ตามที่ผู้ใช้ขอ — ตัดการ์ด "ตอนนี้/ถัดไป" ออกทั้งหมด เพราะข้อมูลซ้ำกับกรอบ
  // สถานะปัจจุบัน + Timeline อยู่แล้ว "หนึ่งข้อมูลสำคัญ แสดงเพียงหนึ่งครั้ง"): ข้อมูลเจ้าของผลงาน -> สถานะ
  // ปัจจุบัน -> สิ่งที่ต้องดำเนินการ (ถ้ามี) -> Timeline เส้นทาง -> หมายเหตุ (ถ้ามี) -> ออกจากระบบ
  return '' +
    '<div class="pub-compact">' +
    nameBlockHtml + heroHtml + actionHtml + timelineHtml + noteHtml +
    '<p class="pub-back-link"><a target="_top" href="' + logoutUrl + '">ออกจากระบบ &rarr;</a></p>' +
    '</div>';
}
