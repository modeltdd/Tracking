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

/** log การ login ทุกครั้ง (สำเร็จ/ล้มเหลว) — ไม่เก็บรหัสผ่านใดๆ (ข้อ 19) */
function writeOwnerLoginLog_(ss, workIdAttempt, ownerNameAttempt, result, sessionToken) {
  var sheet = ss.getSheetByName(SHEET.OWNER_LOGIN_LOG);
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

/** หน้าแรก ?page=owner-login (GET) */
function handleOwnerLoginGet_(baseUrl, notices) {
  return renderPublicPage_('เข้าสู่ระบบเจ้าของผลงาน', renderOwnerLoginFormBody_(baseUrl, [], notices || [], {}));
}

/** ออกจากระบบ ?page=owner-login&logout=1&osession=... (GET) */
function handleOwnerLogoutGet_(ss, params, baseUrl) {
  destroyOwnerSession_(ss, params.osession);
  return renderPublicPage_('ออกจากระบบแล้ว', renderOwnerLoginFormBody_(baseUrl, [], ['ออกจากระบบเรียบร้อยแล้ว'], {}));
}

/** ?page=owner-dashboard&osession=... (GET) — ต้องตรวจ session ฝั่ง server ทุกครั้ง ห้ามเชื่อ URL เฉยๆ (ข้อ 10) */
function renderOwnerDashboardRoute_(ss, params, baseUrl) {
  var sessionId = String(params.osession || '').trim();
  var work = sessionId ? validateOwnerSession_(ss, sessionId) : null;
  if (!work) {
    return renderPublicPage_('เข้าสู่ระบบเจ้าของผลงาน',
      renderOwnerLoginFormBody_(baseUrl, sessionId ? ['เซสชันหมดอายุหรือไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่อีกครั้ง'] : [], [], {}));
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

  var session = createOwnerSession_(ss, work);
  return renderPublicPage_('เข้าสู่ระบบสำเร็จ', renderOwnerLoginBounceBody_(baseUrl, session.id));
}

// ================= Render =================

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

/** หน้าระหว่างทางหลัง login สำเร็จ — เด้งไป URL แบบ GET ที่มี ?osession= ติดไปด้วย (ข้อ 8/10) ใช้ JS redirect
 *  เล็กๆ เพราะ Apps Script doPost ไม่มี HTTP redirect จริงให้ใช้ ตรวจ session ฝั่ง server อีกครั้งตอนโหลดหน้านั้น
 *  อยู่ดี (renderOwnerDashboardRoute_) จึงไม่ใช่จุดอ่อนด้านความปลอดภัย แค่ช่วยให้ refresh หน้าใช้ URL ที่ถูกต้อง */
function renderOwnerLoginBounceBody_(baseUrl, sessionId) {
  var url = baseUrl + '?page=owner-dashboard&osession=' + encodeURIComponent(sessionId);
  return '' +
    '<div class="detail-card"><p>เข้าสู่ระบบสำเร็จ กำลังพาไปหน้าผลงานของท่าน...</p>' +
    '<p><a target="_top" class="btn-primary" href="' + escapeHtml_(url) + '" style="display:inline-block;text-decoration:none;text-align:center">ไปที่หน้าผลงานของฉัน</a></p></div>' +
    '<script>(function () { var u = ' + JSON.stringify(url) + '; try { top.location.href = u; } catch (err) { location.href = u; } })();</script>';
}

/** หน้า "ผลงานของฉัน" หลัง login — reuse buildPublicResultData_/renderPub* เดิมทั้งหมด (ข้อ 12 — ใช้ layout
 *  เดิมของหน้าเจ้าของผลงานที่พัฒนาไว้) ต่างจากหน้าสาธารณะแค่ 2 จุด: ไม่ mask ชื่อ (เป็นเจ้าของจริง) + ปุ่ม
 *  "ออกจากระบบ" แทน "ตรวจสอบรายการอื่น" */
function renderOwnerDashboardBody_(ss, work, baseUrl, sessionId) {
  var ownerName = ((work.title_name || '') + (work.first_name || '') + ' ' + (work.last_name || '')).trim();
  var data = buildPublicResultData_(ss, work);

  var nameBlockHtml = '' +
    '<div class="pub-name-block">' +
    '<div class="pub-name-owner">' + escapeHtml_(ownerName || '-') + '</div>' +
    '<div class="pub-name-tracking">เลขทะเบียน ' + escapeHtml_(work.tracking_no) + '</div>' +
    '<div class="pub-name-title">ชื่อผลงาน: ' + escapeHtml_(work.work_title || '-') + '</div>' +
    '</div>';

  var heroHtml = renderPubHero_(work, data.currentStation, data.stationsMap, data.steps);

  var actionHtml = work.next_step_text
    ? '<div class="pub-action-box"><div class="pub-action-title">สิ่งที่ต้องดำเนินการ</div><p>' + escapeHtml_(work.next_step_text) + '</p></div>'
    : '';

  var infoGridHtml = renderPubInfoGrid_([
    { label: 'ผู้รับผิดชอบ', value: work.handoff_pending ? '(รอสแกนรับเอกสาร)' : (work.current_owner_org || '-') },
    { label: 'รับงานเมื่อ', value: formatDateThShort_(work.updated_at) },
    { label: 'รับเรื่องเมื่อ', value: formatDateThShort_(work.received_date) },
    { label: 'ส่งให้ผู้ว่า', value: data.governorForwardDate ? formatDateThShort_(data.governorForwardDate) : 'ยังไม่ส่งให้ผู้ว่า' },
  ]);

  var progressHtml = data.progressSummary ? renderPubProgressSummary_(data.progressSummary) : '';
  var timelineHtml = renderPubTimelineSection_(data.fixedTimeline);
  if (data.isLegacyImportOnly) timelineHtml += renderPubLegacyInfoBox_();

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

  return '' +
    '<div class="pub-compact">' +
    nameBlockHtml + heroHtml + actionHtml + infoGridHtml + progressHtml + timelineHtml + noteHtml +
    '<p class="pub-back-link"><a target="_top" href="' + logoutUrl + '">ออกจากระบบ &rarr;</a></p>' +
    '</div>';
}
