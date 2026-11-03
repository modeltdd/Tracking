/**
 * จุดเข้าใช้งาน Web App — doGet/doPost
 *
 * สถานะ: เชลล์เจ้าหน้าที่ (bottom-nav 3 ปุ่ม + Dashboard), รับเอกสารใหม่, ค้นหา + รายละเอียดงาน (Timeline),
 * สแกน QR รับงาน + ปุ่ม action ทั้ง 8 (docs/DESIGN.md ตาราง 3.2), โซนประชาชน (ตรวจสอบสถานะ + revision detail, Part 6),
 * โซนผู้ดูแลระบบ (Admin): จัดการ Workflow/ผู้ใช้งาน, Dashboard ผู้บริหาร, Audit Log, รายงาน CSV (Part 7) พร้อมใช้งานแล้ว
 */
function doGet(e) {
  if (!isSystemInstalled_()) {
    return renderPage_('ยังไม่ได้ติดตั้งระบบ', htmlNotInstalled_());
  }

  var params = (e && e.parameter) || {};
  var ss = getSpreadsheet_();

  // Session.getActiveUser() คืนค่าว่างเสมอสำหรับ Gmail ส่วนตัว (ยืนยันแล้วด้วย debug page — ดู docs/DESIGN.md
  // A19) — fallback ไปตรวจ Google ID token จาก Google Identity Services แทน (GIS_AUTH_SCRIPT_ ฝัง token
  // ต่อท้ายทุกลิงก์/ฟอร์มภายในให้อัตโนมัติหลัง sign-in ครั้งแรกที่ renderAuthBootstrapPage_)
  var email = getCurrentUserEmail_() || verifyAuthToken_(ss, params.auth);

  if (!email) {
    // Login สำหรับเจ้าของผลงาน (2026-10-06, OwnerAuth.gs) — คนละระบบกับ Login เจ้าหน้าที่ (ไม่ใช้ Google
    // Sign-In) ต้องเช็คก่อนเงื่อนไขอื่นทั้งหมดในบล็อกนี้ ไม่งั้นจะหลุดไปเข้า Google auth bootstrap หรือหน้า
    // ค้นหาสาธารณะผิดหน้าแทน
    if (params.page === 'owner-dashboard') {
      return renderOwnerDashboardRoute_(ss, params, getWebAppUrl_());
    }
    if (params.page === 'owner-login') {
      if (params.logout === '1') return handleOwnerLogoutGet_(ss, params, getWebAppUrl_());
      return handleOwnerLoginGet_(getWebAppUrl_());
    }
    // เครื่องมือ debug ชั่วคราว (?debug=1) — เก็บไว้เผื่อวิเคราะห์ปัญหา login เพิ่มเติมในอนาคต
    if (params.debug === '1') {
      return renderPage_('Debug: สถานะ Login', '' +
        '<p><b>Session.getActiveUser().getEmail()</b> และ Google ID token (ถ้ามี) ต่างคืนค่าว่างทั้งคู่</p>' +
        '<p>ถ้าเป็นบัญชี Gmail ส่วนตัว ให้เข้าทาง <a href="' + getWebAppUrl_() + '?staff=1">ลิงก์ Sign-In สำหรับเจ้าหน้าที่</a> แทนลิงก์ปกติ — ลิงก์ปกติตั้งใจให้เป็นโซนสาธารณะเสมอ (ประชาชนไม่ต้อง Google Sign-In)</p>');
    }
    // เข้าทางลิงก์เจ้าหน้าที่โดยเฉพาะ (?staff=1) หรือมี token ค้าง/หมดอายุอยู่แล้ว (?auth=...) = ตั้งใจจะเป็น
    // เจ้าหน้าที่ → ลอง Google Sign-In ก่อน ไม่ใช่ผู้เยี่ยมชมทั่วไป
    if (params.staff === '1' || params.auth) {
      return renderAuthBootstrapPage_(ss, getWebAppUrl_(), e.queryString || '');
    }
    // ผู้เยี่ยมชมไม่ได้ Login → โซนสาธารณะ (ตรวจสอบสถานะด้วยเลขติดตาม+last4, PublicTrack.gs) — พฤติกรรมเดิมทุกประการ
    return handlePublicTrackGet_(e);
  }

  var user = findUserByEmail_(email);
  if (!user) {
    return renderPage_('ไม่มีสิทธิ์เข้าใช้งาน', htmlAccessDenied_(email));
  }

  return routeStaffPage_(e, user);
}

/** เจ้าหน้าที่ผ่านการตรวจสอบสิทธิ์แล้ว — เลือกหน้าตาม ?page= (ค่าเริ่มต้น dashboard) */
function routeStaffPage_(e, user) {
  var params = (e && e.parameter) || {};
  // ไม่ระบุ ?page= และไม่ได้มาจากลิงก์ QR (?t=) เลย = เพิ่ง login เข้ามาตรงๆ — ทุก role เข้า Dashboard ก่อนเสมอ
  // (2026-09-09 เปลี่ยนจากที่เคยพาผู้รับผิดชอบเข้าทะเบียนตรงๆ — ตอนนี้ 'dashboard' แสดงเนื้อหาต่างกันตาม role แล้ว)
  var page = params.page || (params.t ? 'scan' : 'dashboard');
  var ss = getSpreadsheet_();
  var baseUrl = getWebAppUrl_();

  switch (page) {
    case 'admin':
      return renderAdminRoute_(ss, user, params, baseUrl);
    case 'scan':
      return renderScanRoute_(ss, user, params, baseUrl);
    case 'forward':
      var forwardWorks = getForwardableWorks_(ss, user.organization);
      return renderStaffPage_('ส่งต่อ', renderForwardListBody_(user.organization, forwardWorks, getStationsMap_(ss), baseUrl), user, 'forward', baseUrl);
    case 'registry':
      // 2026-09-25/2026-10-06: Export CSV/Excel ของมุมมอง Excel — ต้องเช็ค canAccessRegistry_ เองตรงนี้ (ไม่ผ่าน
      // renderRegistryRoute_ ที่คืน HtmlOutput เสมอ เพราะ CSV คืน ContentService ตรงๆ ไม่ห่อหน้า HTML — ส่วน
      // .xlsx คืน HtmlOutput ก็จริงแต่เป็นหน้าดาวน์โหลดเฉพาะกิจ ไม่ใช่หน้าเชลล์ปกติ) permission เดียวกับทะเบียนเดิม
      if (params.export === 'csv' || params.export === 'xlsx') {
        if (!canAccessRegistry_(user)) {
          return renderStaffPage_('ไม่มีสิทธิ์เข้าถึง', renderStubBody_('เฉพาะบัญชีผู้รับผิดชอบ/ผู้ดูแลระบบเท่านั้นที่เข้าหน้านี้ได้', baseUrl), user, 'dashboard', baseUrl);
        }
        if (params.export === 'csv') return exportRegistryCsv_(ss, user, params);
        // .xlsx ต้องพึ่ง UrlFetchApp ไปยัง Google เอง + สร้าง/ลบ Spreadsheet ชั่วคราว — ของจริงพังได้ (เครือข่าย/
        // โควต้า) ต้องจับ error แสดงข้อความที่เข้าใจง่ายแทนหน้า stack trace ดิบของ Apps Script (ข้อ 13)
        try {
          return exportRegistryXlsx_(ss, user, params);
        } catch (xlsxErr) {
          return renderStaffPage_('สร้างไฟล์ Excel ไม่สำเร็จ',
            renderStubBody_('เกิดข้อผิดพลาดระหว่างสร้างไฟล์ Excel: ' + xlsxErr.message + ' — ลองใหม่อีกครั้ง หรือดาวน์โหลด CSV แทนไปก่อน', baseUrl),
            user, 'registry', baseUrl);
        }
      }
      return renderRegistryRoute_(ss, user, params, baseUrl, '');
    case 'search':
      var query = params.q || '';
      var results = searchWorks_(ss, user.organization, query);
      return renderStaffPage_('ค้นหา', renderSearchBody_(user.organization, query, results, getStationsMap_(ss), baseUrl), user, 'search', baseUrl);
    case 'detail':
      var work = findWorkById_(ss, params.id);
      if (!work) {
        return renderStaffPage_('ไม่พบรายการ', renderStubBody_('ไม่พบงานที่ระบุ (work_id: ' + params.id + ')', baseUrl), user, 'search', baseUrl);
      }
      var workHistory = getHistoryForWork_(ss, params.id);
      if (!canViewWorkDetail_(work, user, workHistory)) {
        return renderStaffPage_('ไม่มีสิทธิ์เข้าถึง', renderStubBody_('งานนี้ไม่เกี่ยวข้องกับหน่วยงานของท่าน จึงไม่สามารถดูรายละเอียดได้', baseUrl), user, 'search', baseUrl);
      }
      var stationsMap = getStationsMap_(ss);
      return renderStaffPage_('รายละเอียดผลงาน', renderWorkDetailBody_(ss, work, workHistory, stationsMap, baseUrl, user), user, 'search', baseUrl);
    case 'qrprint':
      var qrWork = findWorkById_(ss, params.id);
      if (!qrWork) {
        return renderStaffPage_('ไม่พบรายการ', renderStubBody_('ไม่พบงานที่ระบุ (work_id: ' + params.id + ')', baseUrl), user, 'search', baseUrl);
      }
      if (!canViewWorkDetail_(qrWork, user, getHistoryForWork_(ss, qrWork.work_id))) {
        return renderStaffPage_('ไม่มีสิทธิ์เข้าถึง', renderStubBody_('งานนี้ไม่เกี่ยวข้องกับหน่วยงานของท่าน', baseUrl), user, 'search', baseUrl);
      }
      return renderStaffPage_('พิมพ์ QR', renderQrPrintBody_(qrWork, buildQrImageUrl_(ss, qrWork.qr_token), baseUrl), user, 'search', baseUrl);
    case 'register':
      return renderStaffPage_('รับเอกสารใหม่', renderRegisterFormBody_(ss, {}, [], baseUrl), user, 'register', baseUrl);
    case 'dashboard':
    default:
      if (user.role === 'ผู้รับผิดชอบ') {
        var today = now_();
        var selMonth = parseInt(params.month, 10) || (today.getMonth() + 1);
        var selYear = parseInt(params.year, 10) || today.getFullYear();
        var respMetrics = computeResponsibleDashboardMetrics_(ss, user.organization, selMonth, selYear);
        return renderStaffPage_('แดชบอร์ดผู้รับผิดชอบ',
          renderResponsibleDashboardBody_(ss, user, respMetrics, selMonth, selYear, baseUrl), user, 'dashboard', baseUrl);
      }
      // 2026-09-24: เพิ่ม filter เดือน/ปี/หน่วยงาน/จังหวัด ตามที่ผู้ใช้ขอ — ไม่ส่งมา (ค่าเริ่มต้นเปิดหน้า) = ไม่กรอง
      // เลย แสดงครบเหมือนพฤติกรรมเดิมทุกประการ (กันเปลี่ยน business logic โดยไม่จำเป็น)
      var dashFilters = { month: params.month, year: params.year, orgFrom: params.orgfrom, province: params.province };
      var metrics = computeDashboardMetrics_(ss, user.organization, dashFilters);
      return renderStaffPage_('แดชบอร์ดเจ้าหน้าที่', renderDashboardBody_(ss, user, metrics, dashFilters, baseUrl), user, 'dashboard', baseUrl);
  }
}

/**
 * 2026-11-03 — หน้า Staff "Workflow เดียว" ใหม่: render หน้า "รายละเอียดผลงาน" (renderWorkDetailBody_, Views.gs)
 * กลับไปตรงๆ หลังทำ action ของส่วน C (บันทึก/แก้ไขวันที่ขั้นตอน — state_transition/edit_step_date) ทั้งกรณี
 * สำเร็จและไม่สำเร็จ (ข้อ 6/10 ของ requirement — ห้ามต้องเข้า-ออกหลายหน้า/reload ไปหน้าอื่น) โหลด work/history/
 * stationsMap สดใหม่ครั้งเดียว (pattern เดียวกับ admin_set_owner_code/admin_set_revision_due_date เดิมที่ทำอยู่
 * แล้วใน doPost — ไม่ใช่ของใหม่) stepErrors/stepPrevValues ส่งต่อให้ renderWorkDetailBody_ reopen panel เดิมที่
 * validate ไม่ผ่านพร้อมค่าที่กรอกไว้ (ไม่มีทาง work หายไปกลางทาง เพราะ performStateTransition_/performEditStepDate_
 * คืน errors แบบไม่เจองานเฉพาะกรณี work_id ผิดจริงเท่านั้น ซึ่งไม่เกิดจาก UI นี้ที่ embed work_id จาก SSR เสมอ)
 */
function renderStaffDetailAfterAction_(ss, user, baseUrl, workId, stepErrors, stepPrevValues) {
  var work = findWorkById_(ss, workId);
  if (!work) {
    return renderStaffPage_('ไม่พบรายการ', renderStubBody_('ไม่พบงานที่ระบุ (work_id: ' + workId + ')', baseUrl), user, 'search', baseUrl);
  }
  var history = getHistoryForWork_(ss, workId);
  var stationsMap = getStationsMap_(ss);
  return renderStaffPage_('รายละเอียดผลงาน',
    renderWorkDetailBody_(ss, work, history, stationsMap, baseUrl, user, [], [], stepErrors, stepPrevValues), user, 'search', baseUrl);
}

function doPost(e) {
  var formAction = e && e.parameter && e.parameter.form_action;
  var ss = getSpreadsheet_();

  if (formAction === 'search_public') {
    // โซนสาธารณะ ไม่ต้อง Login — ตรวจสอบสิทธิ์ก่อนหน้านี้จะบล็อกผู้เยี่ยมชมทั่วไปออกไปโดยไม่ตั้งใจ
    // 2026-09-15: เปลี่ยนจาก track_status (tracking_no+last4 ยืนยันตัวตน) เป็นค้นหาด้วยเลขตำแหน่งเดิม/ชื่อ-นามสกุล
    // (ไม่ยืนยันตัวตน — ดูแชท requirement ส่วน F-H) handlePublicTrackPost_/trackPublicStatus_ เดิมไม่ลบทิ้ง
    // (ไม่มีจุดไหนเรียกแล้ว เผื่อย้อนดู/ใช้ภายหลัง)
    return handlePublicSearchPost_(ss, e);
  }

  if (formAction === 'owner_login_search' || formAction === 'owner_login_submit' || formAction === 'owner_login_direct') {
    // Login สำหรับเจ้าของผลงาน (OwnerAuth.gs) — ไม่ต้อง Login เจ้าหน้าที่เช่นกัน (คนละระบบกับ Google Sign-In)
    // owner_login_direct (2026-10-06) คือหน้าแรกใหม่ (Username+password แยกช่อง ไม่มีขั้นเลือก record)
    // owner_login_search/owner_login_submit คือ flow 2 ขั้นเดิม (เก็บไว้ ยังไม่มีจุดเรียกจาก UI แล้ว)
    var ownerBaseUrl = getWebAppUrl_();
    if (formAction === 'owner_login_direct') return handleOwnerLoginDirectPost_(ss, e, ownerBaseUrl);
    return formAction === 'owner_login_search'
      ? handleOwnerLoginSearchPost_(ss, e, ownerBaseUrl)
      : handleOwnerLoginSubmitPost_(ss, e, ownerBaseUrl);
  }

  // เหมือน doGet — Session.getActiveUser() ใช้ไม่ได้กับ Gmail ส่วนตัว fallback ไป Google ID token
  // (GIS_AUTH_SCRIPT_ ฝัง hidden field "auth" ต่อท้ายทุกฟอร์มให้อัตโนมัติแล้ว)
  var email = getCurrentUserEmail_() || verifyAuthToken_(ss, e.parameter.auth);
  var user = email ? findUserByEmail_(email) : null;
  if (!user) {
    return renderPage_('ไม่มีสิทธิ์เข้าใช้งาน', '' +
      '<p>บัญชี <b>' + escapeHtml_(email || '(ไม่ได้ Login)') + '</b> ยังไม่ได้รับสิทธิ์เข้าใช้งานระบบ หรือ session/การ sign-in หมดอายุแล้ว</p>' +
      '<p><a href="' + getWebAppUrl_() + '?staff=1">&larr; กลับไป sign-in ใหม่</a></p>');
  }

  var baseUrl = getWebAppUrl_();

  if (formAction === 'register_work') {
    var result = registerNewWork_(ss, user, e);
    if (!result.ok) {
      return renderStaffPage_('รับเอกสารใหม่', renderRegisterFormBody_(ss, result.values, result.errors, baseUrl), user, 'register', baseUrl);
    }
    return renderStaffPage_('ลงทะเบียนสำเร็จ', renderRegisterSuccessBody_(result, baseUrl), user, 'register', baseUrl);
  }

  if (formAction === 'work_action') {
    var token = e.parameter.qr_token || '';
    var actionResult = performWorkAction_(ss, user, e);
    if (!actionResult.ok) {
      var work = findWorkById_(ss, e.parameter.work_id);
      var stationsMap = getStationsMap_(ss);
      var station = work ? stationsMap[work.current_station_key] : null;
      if (!work) {
        return renderStaffPage_('สแกน QR', renderScanEntryBody_(baseUrl, 'ไม่พบงานที่ระบุ'), user, 'scan', baseUrl);
      }
      return renderStaffPage_('สแกน QR',
        renderActionFormBody_(ss, work, station, e.parameter.action, baseUrl, token, actionResult.errors, e.parameter),
        user, 'scan', baseUrl);
    }
    return renderStaffPage_('บันทึกสำเร็จ', renderActionSuccessBody_(actionResult, baseUrl), user, 'scan', baseUrl);
  }

  if (formAction === 'state_transition') {
    var transToken = e.parameter.qr_token || '';
    var transResult = performStateTransition_(ss, user, e);
    // 2026-11-03 — หน้า Staff "Workflow เดียว" ใหม่ (renderWorkDetailBody_/renderStaffWorkflowTable_, Views.gs)
    // ส่งฟอร์มมาพร้อม return_to=detail เสมอ (ต่างจากหน้าสแกน QR เดิมที่ไม่ส่งฟิลด์นี้มา) ต้อง render หน้า
    // รายละเอียดเดิมกลับไปตรงๆ ทั้ง 2 กรณี (สำเร็จ/ไม่สำเร็จ) ไม่กระเด้งไปหน้า "สแกน QR"/"บันทึกสำเร็จ" แบบเดิม
    // (ข้อ 6/10 ของ requirement — ห้ามต้องเข้า-ออกหลายหน้า) ไม่กระทบ flow เดิมของหน้าสแกน QR เลย (branch แยก)
    if (e.parameter.return_to === 'detail') {
      var transPrev = transResult.ok ? {} : Object.assign({}, e.parameter, { wtbl_action: 'state_transition' });
      return renderStaffDetailAfterAction_(ss, user, baseUrl, e.parameter.work_id, transResult.ok ? [] : (transResult.errors || []), transPrev);
    }
    if (!transResult.ok) {
      var transWork = transResult.work || findWorkById_(ss, e.parameter.work_id);
      if (!transWork) {
        return renderStaffPage_('สแกน QR', renderScanEntryBody_(baseUrl, 'ไม่พบงานที่ระบุ'), user, 'scan', baseUrl);
      }
      var stationsMapErr = getStationsMap_(ss);
      var stateDefErr = stationsMapErr[transWork.current_station_key];
      var eligibleErr = computeEligibleTransitions_(ss, transWork, stateDefErr, user);
      var reTransition = null;
      for (var i = 0; i < eligibleErr.length; i++) {
        if (eligibleErr[i].transition_id === e.parameter.transition_id) { reTransition = eligibleErr[i]; break; }
      }
      if (!reTransition) {
        // 2026-10-08 ตามที่ผู้ใช้ขอ — หน้า "รายละเอียดผลงาน" (renderScanWorkBody_) ใช้ title "รายละเอียดข้อมูล"
        // แทน "สแกน QR" เฉพาะหน้านี้ (ดูคอมเมนต์เดียวกันใน Actions.gs renderScanRoute_)
        return renderStaffPage_('รายละเอียดข้อมูล', renderScanWorkBody_(ss, transWork, computeEligibleActions_(transWork, stateDefErr, user),
          eligibleErr, baseUrl, transToken, transResult.errors), user, 'scan', baseUrl);
      }
      return renderStaffPage_('สแกน QR',
        renderTransitionFormBody_(transWork, reTransition, baseUrl, transToken, transResult.errors, e.parameter), user, 'scan', baseUrl);
    }
    return renderStaffPage_('บันทึกสำเร็จ', renderActionSuccessBody_(transResult, baseUrl), user, 'scan', baseUrl);
  }

  if (formAction === 'edit_step_date') {
    // 2026-11-03 — แก้ไข "วันที่ดำเนินการ" ย้อนหลังของขั้นตอนที่เสร็จแล้ว (performEditStepDate_, Actions.gs —
    // ตรวจสิทธิ์ Admin/หน่วยงานผู้รับผิดชอบเองใน function นั้นแล้ว ไม่ต้องเช็คซ้ำที่นี่) อยู่หน้ารายละเอียดเดิม
    // เสมอทั้งสำเร็จ/ไม่สำเร็จ (เหมือน work_action/state_transition ด้านบน) ไม่มี return_to อื่นให้เลือก (ฟีเจอร์
    // นี้มีจุดเรียกเดียวคือหน้ารายละเอียด ไม่ได้มาจากหน้าสแกน QR เดิม)
    var editResult = performEditStepDate_(ss, user, e);
    var editPrev = editResult.ok ? {} : Object.assign({}, e.parameter, { wtbl_action: 'edit_step_date' });
    return renderStaffDetailAfterAction_(ss, user, baseUrl, e.parameter.work_id, editResult.ok ? [] : (editResult.errors || []), editPrev);
  }

  if (formAction === 'admin_set_owner_code' || formAction === 'admin_reset_owner_code') {
    // ตั้ง/รีเซ็ตรหัสผ่านเจ้าของผลงาน (Login สำหรับเจ้าของผลงาน, OwnerAuth.gs) — Admin เท่านั้น เรียกจากหน้า
    // รายละเอียดผลงาน (renderWorkDetailBody_) ไม่ใช่หน้า Admin tab เพราะเป็น action ต่อรายการ ไม่ใช่ master data
    if (user.role !== 'Admin') {
      return renderStaffPage_('ไม่มีสิทธิ์', renderStubBody_('เฉพาะผู้ดูแลระบบ (Admin) เท่านั้น', baseUrl), user, 'admin', baseUrl);
    }
    var codeWorkId = e.parameter.work_id;
    var codeWork = findWorkById_(ss, codeWorkId);
    if (!codeWork) {
      return renderStaffPage_('ไม่พบรายการ', renderStubBody_('ไม่พบงานที่ระบุ (work_id: ' + codeWorkId + ')', baseUrl), user, 'search', baseUrl);
    }
    var codeErrors = [];
    if (formAction === 'admin_reset_owner_code') {
      updateWorkRow_(ss, codeWorkId, { owner_login_code_hash: '', updated_at: codeWork.updated_at });
    } else {
      var newOwnerCode = String(e.parameter.owner_login_code || '').trim();
      if (!validateOwnerLoginCodeFormat_(newOwnerCode)) {
        codeErrors.push('กรุณากรอกรหัสในรูปแบบ 12-345');
      } else {
        updateWorkRow_(ss, codeWorkId, { owner_login_code_hash: hashOwnerLoginCode_(newOwnerCode), updated_at: codeWork.updated_at });
      }
    }
    var refreshedWork = findWorkById_(ss, codeWorkId);
    var refreshedHistory = getHistoryForWork_(ss, codeWorkId);
    var refreshedStationsMap = getStationsMap_(ss);
    return renderStaffPage_('รายละเอียดผลงาน',
      renderWorkDetailBody_(ss, refreshedWork, refreshedHistory, refreshedStationsMap, baseUrl, user, codeErrors), user, 'search', baseUrl);
  }

  if (formAction === 'admin_set_revision_due_date') {
    // 2026-10-21 ตามข้อแก้ไขผู้บริหาร ข้อ 8 — "ถ้า record เก่ายังไม่มีวันครบกำหนด ... ให้ Staff/Admin สามารถ
    // เข้าไปกำหนดวันย้อนหลังได้" Admin เท่านั้น (เช็คสิทธิ์ที่นี่เหมือน admin_set_owner_code เดิม — ส่วน validate/
    // บันทึกจริงอยู่ใน performSetRevisionDueDate_, Actions.gs ตาม pattern เดียวกับ performStateTransition_/
    // performWorkAction_ — แยกออกมาให้ test ได้ตรงๆ ไม่ต้องผ่าน doPost ทั้งก้อน)
    if (user.role !== 'Admin') {
      return renderStaffPage_('ไม่มีสิทธิ์', renderStubBody_('เฉพาะผู้ดูแลระบบ (Admin) เท่านั้น', baseUrl), user, 'admin', baseUrl);
    }
    var dueResult = performSetRevisionDueDate_(ss, user, e);
    if (!dueResult.work) {
      return renderStaffPage_('ไม่พบรายการ', renderStubBody_('ไม่พบงานที่ระบุ (work_id: ' + e.parameter.work_id + ')', baseUrl), user, 'search', baseUrl);
    }
    var refreshedDueWork = findWorkById_(ss, dueResult.work_id);
    var refreshedDueHistory = getHistoryForWork_(ss, dueResult.work_id);
    var refreshedDueStationsMap = getStationsMap_(ss);
    return renderStaffPage_('รายละเอียดผลงาน',
      renderWorkDetailBody_(ss, refreshedDueWork, refreshedDueHistory, refreshedDueStationsMap, baseUrl, user, [], dueResult.errors), user, 'search', baseUrl);
  }

  if (formAction === 'admin_station_save' || formAction === 'admin_user_save' || formAction === 'admin_master_save') {
    if (user.role !== 'Admin') {
      return renderStaffPage_('ไม่มีสิทธิ์', renderStubBody_('เฉพาะผู้ดูแลระบบ (Admin) เท่านั้น', baseUrl), user, 'admin', baseUrl);
    }
    if (formAction === 'admin_station_save') {
      var stationResult = performAdminStationSave_(ss, user, e);
      if (!stationResult.ok) {
        var editStation = stationResult.isNew ? null : findStationByKey_(ss, stationResult.values.station_key);
        return renderStaffPage_('จัดการ Workflow',
          renderStationFormBody_(ss, editStation, baseUrl, stationResult.errors, stationResult.values), user, 'admin', baseUrl);
      }
      return renderStaffPage_('จัดการ Workflow', renderAdminStationsBody_(listStationsSorted_(ss), baseUrl), user, 'admin', baseUrl);
    }
    if (formAction === 'admin_master_save') {
      var masterResult = performAdminMasterSave_(ss, user, e);
      if (!masterResult.ok) {
        if (!MASTER_DATA_CONFIG_[masterResult.masterType]) {
          return renderStaffPage_('จัดการข้อมูลหลัก', renderStubBody_(masterResult.errors.join(', '), baseUrl), user, 'admin', baseUrl);
        }
        var editMaster = masterResult.isNew ? null : findMasterRowByCode_(ss, masterResult.masterType, masterResult.values[MASTER_DATA_CONFIG_[masterResult.masterType].codeField]);
        return renderStaffPage_('จัดการข้อมูลหลัก',
          renderMasterFormBody_(masterResult.masterType, editMaster, baseUrl, masterResult.errors, masterResult.values), user, 'admin', baseUrl);
      }
      return renderStaffPage_('จัดการข้อมูลหลัก',
        renderMasterListBody_(listMasterRowsSorted_(ss, masterResult.masterType), masterResult.masterType, baseUrl), user, 'admin', baseUrl);
    }
    var userResult = performAdminUserSave_(ss, user, e);
    if (!userResult.ok) {
      var editUser = userResult.isNew ? null : findUserByEmailRaw_(ss, userResult.values.user_email);
      return renderStaffPage_('จัดการผู้ใช้งาน',
        renderUserFormBody_(editUser, baseUrl, userResult.errors, userResult.values), user, 'admin', baseUrl);
    }
    return renderStaffPage_('จัดการผู้ใช้งาน', renderAdminUsersBody_(listUsersSorted_(ss), baseUrl), user, 'admin', baseUrl);
  }

  return ContentService
    .createTextOutput(JSON.stringify({ ok: false, error: 'not_implemented', message: 'ฟังก์ชันนี้จะพัฒนาในลำดับถัดไป' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function isSystemInstalled_() {
  return !!PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
}

/* ---------- placeholder pages นอกโซนเจ้าหน้าที่ (จะถูกแทนที่ทีละหน้าใน Part ถัดไป) ---------- */

function htmlNotInstalled_() {
  return '' +
    '<p>ยังไม่พบฐานข้อมูลของระบบ</p>' +
    '<p>ผู้ดูแลระบบต้องรันฟังก์ชัน <code>installSystem</code> จาก Apps Script Editor ก่อนใช้งานครั้งแรก ' +
    '(ดูขั้นตอนในคอมเมนต์ต้นไฟล์ <code>Setup.gs</code>)</p>';
}

function htmlAccessDenied_(email) {
  return '' +
    '<p>บัญชี <b>' + escapeHtml_(email) + '</b> ยังไม่ได้รับสิทธิ์เข้าใช้งานระบบ</p>' +
    '<p>กรุณาติดต่อผู้ดูแลระบบเพื่อเพิ่มชื่อในชีต <code>Users</code></p>';
}

/** ครอบหน้าด้วยสไตล์พื้นฐาน (Sarabun, โทนน้ำเงิน-เขียวอมฟ้า) — ใช้กับหน้านอกโซนเจ้าหน้าที่ (ไม่ติดตั้ง/สาธารณะ/ไม่มีสิทธิ์) */
function renderPage_(title, bodyHtml) {
  var html = '' +
    '<!doctype html><html><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">' +
    '<title>' + escapeHtml_(title) + '</title>' +
    '<style>' +
    'body{font-family:"Sarabun",sans-serif;background:#eef4f6;color:#1c2b3a;margin:0;padding:24px;}' +
    '.card{max-width:640px;margin:0 auto;background:#fff;border:1px solid #dde3e8;border-radius:12px;padding:20px 24px;box-shadow:0 1px 2px rgba(20,40,55,.08);}' +
    'h1{font-size:1.2rem;color:#1f3b54;margin:0 0 14px;}' +
    'table{width:100%;border-collapse:collapse;margin-top:10px;font-size:.9rem;}' +
    'th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #e8edf0;}' +
    '.tnum{font-variant-numeric:tabular-nums;}' +
    'code{background:#eef1f4;padding:1px 5px;border-radius:4px;}' +
    '</style></head><body><div class="card"><h1>' + escapeHtml_(title) + '</h1>' + bodyHtml + '</div></body></html>';
  return HtmlService.createHtmlOutput(html)
    .setTitle(title)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function escapeHtml_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
