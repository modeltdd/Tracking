/**
 * หน้าตาโซนเจ้าหน้าที่ (Auth แล้ว) — เชลล์ mobile-first + bottom-nav 3 ปุ่มหลัก + Dashboard
 * ตาม docs/DESIGN.md ข้อ 3.3 และลำดับพัฒนา Part 2
 * หน้า "สแกน QR / ค้นหา / รับเอกสารใหม่" ยังเป็น stub รอ Part 3-5 มาแทนที่เนื้อหาจริง
 */

var STATUS_PILL_CLASS_ = {
  received: 'pending',
  checking: 'pending',
  need_revision: 'revision',
  in_review: 'active',
  pending_approval: 'active',
  result_announced: 'active',
  done: 'done',
  terminated: 'danger',
};

// 2026-10-08 ผู้ใช้ขอลด Bottom Navigation เหลือ 3 เมนู (หน้าแรก/ทะเบียน/ผู้ดูแล) — ตัด scan/forward/search
// ออกจากแถบล่างเท่านั้น (route/function เดิม 'scan'/'forward'/'search' ใน routeStaffPage_ ยังอยู่ครบ ไม่ถูก
// ลบ ยังเข้าถึงได้ตรงๆ ผ่าน URL เดิม เช่น ?page=scan จากทางอื่น เช่น QR scan จริง/ปุ่ม "ดูประวัติ" ในหน้าอื่นๆ
// ที่ลิงก์มาที่นี่อยู่แล้ว — ตัดแค่ entry ใน array นี้ที่ใช้ render แถบเมนูล่างเท่านั้น)
var NAV_ITEMS_ = [
  { page: 'dashboard', label: 'หน้าแรก', icon: '⌂' },
  { page: 'registry', label: 'ทะเบียน', icon: '▤', registryOnly: true },
  { page: 'admin', label: 'ผู้ดูแล', icon: '⚙', adminOnly: true },
];

var METRIC_SECTIONS_ = [
  { key: 'pendingReceive', label: 'งานรอรับ', hint: 'สแกน QR แล้วกด "รับเอกสารและเริ่มดำเนินการ"' },
  { key: 'inProgress', label: 'กำลังดำเนินการ', hint: 'งานที่หน่วยงานนี้เป็นเจ้าของอยู่ในขณะนี้' },
  { key: 'awaitingDestination', label: 'ส่งต่อแล้ว รอปลายทางรับ', hint: 'ส่งต่อไปแล้ว ยังไม่มีใครสแกนรับที่ปลายทาง' },
  { key: 'nearDue', label: 'ใกล้ครบกำหนด', hint: 'อยู่ในสถานีเกิน 80% ของเวลามาตรฐาน' },
  { key: 'overdue', label: 'เกินกำหนด', hint: 'อยู่ในสถานีเกินเวลามาตรฐานแล้ว' },
  { key: 'returnedForRevision', label: 'ส่งกลับแก้ไข', hint: 'รอเจ้าของผลงานส่งฉบับแก้ไขกลับมา' },
];

/**
 * หน้า sign-in ชั่วคราวสำหรับเจ้าหน้าที่ที่ Google ไม่ยอมเปิดเผยอีเมลให้สคริปต์ (Gmail ส่วนตัว, docs/DESIGN.md
 * A19) — ใช้ Google Identity Services (GIS, ไลบรารีมาตรฐานของเว็บทั่วไป ไม่ใช่ Apps Script) ยืนยันตัวตนแทน
 * ได้ ID token แล้ว redirect กลับไปหน้าเดิมที่ตั้งใจจะเปิด พร้อมแนบ token — ครั้งถัดไปจะ sign-in เงียบๆ ได้เอง
 * (auto_select + prompt) ไม่ต้องกดปุ่มซ้ำถ้าเคยอนุญาตแล้ว ปุ่มจริงแสดงไว้เป็นทางเลือกเสมอเผื่อ silent ไม่สำเร็จ
 */
function renderAuthBootstrapPage_(ss, baseUrl, queryString) {
  var clientId = getSetting_(ss, 'google_oauth_client_id', '');
  if (!clientId) {
    return renderPage_('ยังไม่ได้ตั้งค่า Sign-In', '' +
      '<p>ระบบยังไม่ได้ตั้งค่า Google Sign-In สำหรับเจ้าหน้าที่ (ช่อง Settings <code>google_oauth_client_id</code> ว่างอยู่)</p>' +
      '<p>ถ้าคุณคือ Admin โปรดตั้งค่านี้ก่อน (ดูวิธีใน docs/DESIGN.md A19)</p>' +
      '<p><a href="' + baseUrl + '">&larr; กลับหน้าแรก</a></p>');
  }

  // ตัด auth= เดิม (ค้าง/หมดอายุ) ออกจาก query string ก่อน กันซ้อนกับ token ใหม่ที่จะได้
  var cleanedParams = String(queryString || '').split('&').filter(function (p) {
    return p && p.indexOf('auth=') !== 0;
  });
  var returnUrl = baseUrl + (cleanedParams.length ? '?' + cleanedParams.join('&') + '&' : '?') + 'auth=';

  var html = '' +
    '<!doctype html><html><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">' +
    '<title>กำลังเข้าสู่ระบบ</title>' +
    '<style>body{font-family:"Sarabun",sans-serif;background:#eef4f6;color:#1c2b3a;margin:0;padding:60px 20px;text-align:center;}' +
    '.box{max-width:340px;margin:0 auto;background:#fff;border:1px solid #dde3e8;border-radius:14px;padding:28px 24px;box-shadow:0 1px 2px rgba(20,40,55,.08);}' +
    'p{font-size:.86rem;color:#5b7184;line-height:1.6;margin:0 0 4px;}#gbtn{margin-top:16px;display:flex;justify-content:center;}</style>' +
    '<script src="https://accounts.google.com/gsi/client" async defer></script>' +
    '</head><body><div class="box">' +
    '<p id="gis-status">กำลังตรวจสอบการเข้าสู่ระบบ...</p>' +
    '<div id="gbtn"></div>' +
    '<script>' +
    'var RETURN_URL = ' + JSON.stringify(returnUrl) + ';' +
    'function onCred(resp) { window.top.location.href = RETURN_URL + encodeURIComponent(resp.credential); }' +
    'window.addEventListener("load", function () {' +
    'if (!window.google || !google.accounts) {' +
    'document.getElementById("gis-status").textContent = "โหลดระบบ Sign-In ไม่สำเร็จ (เช็คอินเทอร์เน็ต) กรุณาลองรีเฟรชหน้านี้";' +
    'return;' +
    '}' +
    'google.accounts.id.initialize({ client_id: ' + JSON.stringify(clientId) + ', callback: onCred, auto_select: true });' +
    'google.accounts.id.renderButton(document.getElementById("gbtn"), { theme: "outline", size: "large", text: "signin_with", width: 280 });' +
    'google.accounts.id.prompt();' +
    '});' +
    '</script>' +
    '</div></body></html>';

  return HtmlService.createHtmlOutput(html)
    .setTitle('กำลังเข้าสู่ระบบ')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * แจ้งผู้ใช้ว่า "กำลังทำงาน" เมื่อกดปุ่ม/ลิงก์ — ทุกหน้าเป็น server-render เต็มหน้าปกติ (ไม่มี AJAX) ปุ่มที่กด
 * แล้วเงียบจนกว่าจะโหลดหน้าใหม่เสร็จทำให้ดูเหมือนกดไม่ติด โดยเฉพาะเน็ตช้า — สคริปต์นี้แค่ปิดปุ่ม/เปลี่ยนข้อความ
 * ทันทีตอนกด ไม่ยุ่งกับ logic ใดๆ ฝั่ง server ใช้ร่วมทั้งโซนเจ้าหน้าที่และโซนสาธารณะ (แทรกท้ายทุกหน้า)
 */
var LOADING_FEEDBACK_SCRIPT_ = '' +
  '<script>' +
  'document.addEventListener("DOMContentLoaded", function () {' +
  'document.querySelectorAll("form").forEach(function (f) {' +
  'f.addEventListener("submit", function () {' +
  'var btn = f.querySelector("button[type=submit]");' +
  'if (btn && !btn.disabled) { btn.textContent = btn.dataset.loadingText || "กำลังดำเนินการ..."; btn.disabled = true; btn.style.opacity = "0.6"; }' +
  '});' +
  '});' +
  'document.querySelectorAll("a.btn-action, a.btn-primary").forEach(function (a) {' +
  'a.addEventListener("click", function () {' +
  'if (a.dataset.loading) return;' +
  'a.dataset.loading = "1"; a.textContent = "กำลังโหลด..."; a.style.opacity = "0.6"; a.style.pointerEvents = "none";' +
  '});' +
  '});' +
  '});' +
  '</script>';

/**
 * ต่อท้าย Google ID token (ถ้ามี) ให้ทุกลิงก์/ฟอร์มภายในหน้าเจ้าหน้าที่โดยอัตโนมัติ (docs/DESIGN.md A19)
 * อ่าน token จาก query string ของหน้าปัจจุบัน (มาจาก renderAuthBootstrapPage_ ตอน sign-in ครั้งแรก) แล้ว
 * ฝังต่อให้ลิงก์/ฟอร์มถัดไปเสมอ — ทำให้ไม่ต้องแก้ href ที่มีอยู่แล้วหลายจุดทั่วระบบเลยสักจุดเดียว
 * ถ้าไม่มี token ในหน้านี้ (เช่น Session.getActiveUser() ใช้ได้อยู่แล้ว กรณีบัญชี Workspace) ไม่ทำอะไรเลย
 */
var GIS_AUTH_SCRIPT_ = '' +
  '<script>' +
  'document.addEventListener("DOMContentLoaded", function () {' +
  'var authToken = new URLSearchParams(location.search).get("auth");' +
  'if (!authToken) return;' +
  'function withAuth(url) {' +
  'if (!url || url.indexOf("auth=") !== -1) return url;' +
  'return url + (url.indexOf("?") === -1 ? "?" : "&") + "auth=" + encodeURIComponent(authToken);' +
  '}' +
  // 2026-10-06: เพิ่ม a.export-download (ลิงก์ดาวน์โหลด CSV ที่เปิด target="_blank" แทน "_top" กันบั๊กจริง
  // "Google ไดรฟ์ ไม่สามารถเปิดไฟล์ได้" — เดิม selector จับแค่ a[target="_top"] ลิงก์ _blank จะไม่ได้ auth token)
  'document.querySelectorAll(\'a[target="_top"], a.export-download\').forEach(function (a) {' +
  'a.addEventListener("click", function () { a.setAttribute("href", withAuth(a.getAttribute("href"))); });' +
  '});' +
  'document.querySelectorAll("form").forEach(function (f) {' +
  'f.addEventListener("submit", function () {' +
  'if (f.querySelector(\'input[name="auth"]\')) return;' +
  'var hidden = document.createElement("input");' +
  'hidden.type = "hidden"; hidden.name = "auth"; hidden.value = authToken;' +
  'f.appendChild(hidden);' +
  '});' +
  '});' +
  '});' +
  '</script>';

/**
 * ข้อความ "กำลังสร้างไฟล์ Excel..." เฉพาะปุ่มดาวน์โหลด .xlsx ของมุมมอง Excel (2026-10-06 ข้อ 13 — สร้าง .xlsx
 * ใช้เวลานานกว่า CSV เพราะต้องสร้าง/แปลง/ลบ Spreadsheet ชั่วคราวจริงฝั่ง server) ต้องแทรกก่อน
 * LOADING_FEEDBACK_SCRIPT_ เสมอ (ลำดับ DOMContentLoaded listener) ให้ dataset.loading ถูกตั้งก่อน กัน
 * LOADING_FEEDBACK_SCRIPT_ ทับข้อความทั่วไป "กำลังโหลด..." — ปุ่มเปิด target="_blank" (หน้าเดิมไม่ navigate
 * ออกไป) จึงตั้งเวลาคืนสถานะปุ่มให้กดใหม่ได้หลัง 6 วิ ต่างจากปุ่ม _top อื่นๆ ที่ไม่ต้องคืนเพราะหน้าโหลดใหม่อยู่แล้ว
 */
var EXCEL_EXPORT_LOADING_SCRIPT_ = '' +
  '<script>' +
  'document.addEventListener("DOMContentLoaded", function () {' +
  'var btn = document.getElementById("xlsx-export-btn");' +
  'if (!btn) return;' +
  'var originalText = btn.textContent;' +
  'btn.addEventListener("click", function () {' +
  'if (btn.dataset.loading) return;' +
  'btn.dataset.loading = "1"; btn.textContent = "กำลังสร้างไฟล์ Excel..."; btn.style.opacity = "0.6";' +
  'setTimeout(function () { btn.textContent = originalText; btn.style.opacity = "1"; delete btn.dataset.loading; }, 6000);' +
  '});' +
  '});' +
  '</script>';

/** ครอบหน้าเจ้าหน้าที่ด้วยเชลล์เต็มรูปแบบ: header ผู้ใช้ + เนื้อหา + bottom-nav
 *  baseUrl: URL เต็มของ Web App (จาก getWebAppUrl_()) — ลิงก์ภายในทุกอันต้อง absolute + target="_top"
 *  กัน relative href พังใน iframe sandbox ของ HtmlService (ดูคอมเมนต์ getWebAppUrl_ ใน Utils.gs) */
function renderStaffPage_(title, bodyHtml, user, activePage, baseUrl) {
  var navHtml = NAV_ITEMS_.filter(function (item) {
    if (item.adminOnly && user.role !== 'Admin') return false;
    if (item.registryOnly && !canAccessRegistry_(user)) return false;
    return true;
  }).map(function (item) {
    var isActive = item.page === activePage;
    return '<a class="navitem' + (isActive ? ' active' : '') + '" target="_top" href="' + baseUrl + '?page=' + item.page + '">' +
      '<span class="navicon">' + item.icon + '</span><span>' + escapeHtml_(item.label) + '</span></a>';
  }).join('');

  var html = '' +
    '<!doctype html><html><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">' +
    '<title>' + escapeHtml_(title) + '</title>' +
    // PUBLIC_CSS_ ต้องรวมด้วยเสมอ — หน้ารายละเอียดงาน (?page=detail) reuse markup .pub-* (pub-hero/pub-timeline/
    // pub-progress-card ฯลฯ) ทั้งหมดจากหน้าสาธารณะ (2026-09-24) ถ้าไม่รวม CSS พวกนี้ไม่มีผล render เป็น text
    // เปล่าๆ ไม่มี style เลย (เจอ bug จริงจากภาพที่ผู้ใช้ส่งมา — คลาสไม่ตรงกับ CSS ที่โหลดจริง)
    '<style>' + STAFF_CSS_ + PUBLIC_CSS_ + '</style>' +
    '</head><body>' +
    '<header class="topbar">' +
    '<div class="topbar-title">' + escapeHtml_(title) + '</div>' +
    '<div class="topbar-user">' + escapeHtml_(user.display_name || user.user_email) +
    '<span class="orgtag">' + escapeHtml_(user.organization) + '</span></div>' +
    '</header>' +
    '<main class="content">' + bodyHtml + '</main>' +
    '<a class="fab" target="_top" href="' + baseUrl + '?page=register" title="รับเอกสารใหม่">+</a>' +
    '<nav class="bottomnav">' + navHtml + '</nav>' +
    LOADING_FEEDBACK_SCRIPT_ + GIS_AUTH_SCRIPT_ +
    '</body></html>';

  return HtmlService.createHtmlOutput(html)
    .setTitle(title)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** เนื้อหาหน้า Dashboard — การ์ดสรุป 6 กลุ่มตามข้อ 3.3 ต่อหน่วยงานของผู้ Login */
/**
 * Dashboard เจ้าหน้าที่ (Admin) — 2026-09-24 ปรับเป็นแนว Minimal Professional ตามที่ผู้ใช้ขอ: ตัดจาก 6 การ์ด
 * สถานะเต็มหน้า (METRIC_SECTIONS_ เดิม แสดงทุก bucket เป็น section แยก) เหลือแค่ 4 KPI หลัก + filter + 2 section
 * รายการสำคัญ (งานที่ต้องติดตาม/งานใกล้ครบกำหนด อย่างละ 5 รายการ) รายละเอียดเต็มไปดูที่หน้า "ทะเบียน" แทน
 * (METRIC_SECTIONS_/renderWorkList_ ไม่ลบทิ้ง — ยังใช้ที่อื่นอยู่ เผื่อย้อนดู)
 * ขอบเขตหน่วยงาน = current_owner_org ของ user (เหมือนเดิมทุกประการ ไม่เปลี่ยน business logic) filters (เดือน/ปี/
 * หน่วยงาน/จังหวัด) เป็นตัวกรองเสริม ไม่ส่งมา = ไม่กรอง แสดงครบเหมือนพฤติกรรมเดิม
 */
function renderDashboardBody_(ss, user, metrics, filters, baseUrl) {
  var org = user.organization;
  var respQuery = 'resp=' + encodeURIComponent(org);
  var stationsMap = getStationsMap_(ss);
  var history = readSheetAsObjects_(ss.getSheetByName(SHEET.STATUS_HISTORY));
  var allWorksForFilterOptions = readSheetAsObjects_(ss.getSheetByName(SHEET.WORKS));
  var worksById = {};
  allWorksForFilterOptions.forEach(function (w) { worksById[w.work_id] = w; });

  // Quick Action (2026-09-24 รอบ 2) — จาก teal bar เต็มความกว้าง เปลี่ยนเป็น card ขนาดพอดี ชิดขวาบน desktop
  var registryLinkHtml = canAccessRegistry_(user)
    ? '<div class="dash-quick-action-wrap"><a class="dash-quick-action" target="_top" href="' + baseUrl + '?page=registry">' +
      '<span class="dash-quick-action-title">ทะเบียนผลงานทั้งหมด</span>' +
      '<span class="dash-quick-action-sub">ดูและจัดการทะเบียนทั้งหมด &rarr;</span>' +
      '</a></div>'
    : '';

  var kpiDefs = [
    { label: 'งานรอรับ', count: metrics.pendingReceive.length, href: 'page=registry&' + respQuery, icon: '⊙', tone: 'navy' },
    { label: 'กำลังดำเนินการ', count: metrics.inProgress.length, href: 'page=registry&bucket=progress&' + respQuery, icon: '◐', tone: 'active' },
    { label: 'รอแก้ไข', count: metrics.returnedForRevision.length, href: 'page=registry&bucket=revision&' + respQuery, icon: '✎', tone: 'revision' },
    { label: 'ใกล้ครบกำหนด', count: metrics.nearDue.length + metrics.overdue.length, href: 'page=registry&bucket=overdue&' + respQuery, icon: '◷', tone: 'danger' },
  ];
  // KPI compact (2026-09-24 รอบ 2) — พื้นขาวเสมอ ไม่มี icon วงกลมสีเต็ม ใช้เส้น accent ซ้าย+ตัวเลขสีแทน (scope
  // เฉพาะ .kpi-grid-4 ผ่าน CSS ไม่กระทบ KPI 6 กล่องของ Dashboard ผู้รับผิดชอบที่ยังใช้ .kpi-grid เดิม)
  var kpiHtml = '<div class="kpi-grid kpi-grid-4">' + kpiDefs.map(function (k) {
    return '<a class="kpi-card kpi-card-' + k.tone + '" target="_top" href="' + baseUrl + '?' + k.href + '">' +
      '<span class="kpi-label"><span class="kpi-icon kpi-icon-' + k.tone + '">' + k.icon + '</span>' + escapeHtml_(k.label) + '</span>' +
      '<span class="kpi-count">' + k.count + ' <span class="kpi-hint">รายการ</span></span>' +
      '</a>';
  }).join('') + '</div>';

  // Filter เดือน/ปี/หน่วยงาน/จังหวัด — optional ทั้งหมด ไม่เลือก = ไม่กรอง (2026-09-24)
  var monthOptions = '<option value="">ทุกเดือน</option>' + THAI_MONTHS_.map(function (name, i) {
    var val = i + 1;
    return '<option value="' + val + '"' + (Number(filters.month) === val ? ' selected' : '') + '>' + name + '</option>';
  }).join('');
  var yearNow = now_().getFullYear();
  var yearOptions = '<option value="">ทุกปี</option>' + [yearNow, yearNow - 1, yearNow - 2, yearNow - 3].map(function (y) {
    return '<option value="' + y + '"' + (Number(filters.year) === y ? ' selected' : '') + '>' + y + '</option>';
  }).join('');
  var orgFromOptions = '<option value="">ทุกหน่วยงาน</option>' + distinctValues_(allWorksForFilterOptions, 'org_from').map(function (o) {
    return '<option value="' + escapeHtml_(o) + '"' + (filters.orgFrom === o ? ' selected' : '') + '>' + escapeHtml_(o) + '</option>';
  }).join('');
  var provinceList = getSettingList_(ss, 'district11_provinces', ['นครศรีธรรมราช', 'กระบี่', 'พังงา', 'ภูเก็ต', 'สุราษฎร์ธานี', 'ระนอง', 'ชุมพร']);
  var provinceOptions = '<option value="">ทุกจังหวัด</option>' + provinceList.map(function (p) {
    return '<option value="' + escapeHtml_(p) + '"' + (filters.province === p ? ' selected' : '') + '>' + escapeHtml_(p) + '</option>';
  }).join('');

  var filterFormHtml = '' +
    '<form method="get" target="_top" action="' + baseUrl + '" class="dash-filter-form">' +
    '<input type="hidden" name="page" value="dashboard">' +
    '<div class="field"><label>เดือน</label><select class="input" name="month">' + monthOptions + '</select></div>' +
    '<div class="field"><label>ปี</label><select class="input" name="year">' + yearOptions + '</select></div>' +
    '<div class="field"><label>หน่วยงาน</label><select class="input" name="orgfrom">' + orgFromOptions + '</select></div>' +
    '<div class="field"><label>จังหวัด</label><select class="input" name="province">' + provinceOptions + '</select></div>' +
    '<button class="btn-primary" type="submit">กรองข้อมูล</button>' +
    '</form>';

  function ownerNameOf_(w) {
    return ((w.title_name || '') + (w.first_name || '') + ' ' + (w.last_name || '')).trim() || '-';
  }

  // "งานที่ต้องติดตาม" — inProgress ล่าสุด 5 รายการ (เรียงตาม updated_at ใหม่สุดก่อน) 2026-09-24 รอบ 2: เพิ่ม
  // ชื่อเจ้าของผลงาน + ปุ่ม "ดูรายละเอียด" ชัดเจน (เดิมทั้งแถวคลิกได้แต่ไม่มีข้อความปุ่ม ผู้ใช้แจ้งว่าไม่ชัด)
  var followList = metrics.inProgress.slice().sort(function (a, b) {
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  }).slice(0, 5);
  var followHtml = followList.length
    ? followList.map(function (w) {
        var station = stationsMap[w.current_station_key];
        var statusLabel = station ? (station.station_order + ' ' + splitStationNameDesc_(station.station_name).main) : '-';
        var detailHref = baseUrl + '?page=detail&id=' + encodeURIComponent(w.work_id);
        return '<div class="dash-follow-row">' +
          '<div class="dash-follow-main"><span class="dash-follow-owner">' + escapeHtml_(ownerNameOf_(w)) + '</span>' +
          '<span class="dash-follow-tracking">' + escapeHtml_(w.tracking_no) + '</span>' +
          '<span class="dash-follow-title">' + escapeHtml_(w.work_title || '-') + '</span>' +
          '<span class="dash-follow-org">' + escapeHtml_(w.org_from || '-') + '</span></div>' +
          '<div class="dash-follow-side"><span class="pill pill-' + (STATUS_PILL_CLASS_[w.current_status_public] || 'pending') + '">' + escapeHtml_(statusLabel) + '</span>' +
          '<span class="dash-follow-date">' + formatDateTh_(w.updated_at) + '</span>' +
          '<a class="dash-follow-cta" target="_top" href="' + detailHref + '">ดูรายละเอียด &rarr;</a></div>' +
          '</div>';
      }).join('')
    : '<div class="empty">ไม่มีงานที่ต้องติดตาม</div>';

  // "งานใกล้ครบกำหนด" — เกินกำหนดมาก่อน ตามด้วยใกล้ครบกำหนด รวม 5 รายการ (badge สีอ่อนโทนเดียวกัน ไม่ใช้แดงจัด)
  // 2026-09-24 รอบ 2: เพิ่มชื่อเจ้าของผลงาน + สถานะ (State) + จำนวนวันเหลือ/เกิน (คำนวณจาก computeStationDueDate_
  // เดิม ไม่เดาถ้าคำนวณไม่ได้ — แสดง fallback text เดิม)
  var dueList = metrics.overdue.concat(metrics.nearDue).slice(0, 5);
  var dueHtml = dueList.length
    ? dueList.map(function (w) {
        var station = stationsMap[w.current_station_key];
        var statusLabel = station ? (station.station_order + ' ' + splitStationNameDesc_(station.station_name).main) : '-';
        var dueDate = computeStationDueDate_(history, w, station);
        var isOverdue = metrics.overdue.indexOf(w) !== -1;
        var daysLabel;
        if (dueDate) {
          var diff = daysBetween_(now_(), dueDate);
          daysLabel = diff >= 0 ? 'เหลือ ' + diff + ' วัน' : 'เกิน ' + Math.abs(diff) + ' วัน';
        } else {
          daysLabel = isOverdue ? 'เกินกำหนดแล้ว' : 'ใกล้ครบกำหนด';
        }
        var detailHref = baseUrl + '?page=detail&id=' + encodeURIComponent(w.work_id);
        return '<div class="dash-follow-row">' +
          '<div class="dash-follow-main"><span class="dash-follow-owner">' + escapeHtml_(ownerNameOf_(w)) + '</span>' +
          '<span class="dash-follow-tracking">' + escapeHtml_(w.tracking_no) + '</span>' +
          '<span class="dash-follow-title">' + escapeHtml_(w.work_title || '-') + '</span>' +
          '<span class="dash-follow-org">' + escapeHtml_(statusLabel) + '</span></div>' +
          '<div class="dash-follow-side"><span class="dash-due-badge' + (isOverdue ? ' dash-due-badge-over' : '') + '">' + daysLabel + '</span>' +
          '<a class="dash-follow-cta" target="_top" href="' + detailHref + '">ดูรายละเอียด &rarr;</a></div>' +
          '</div>';
      }).join('')
    : '<div class="empty">ไม่มีงานใกล้ครบกำหนด</div>';

  // "อัปเดตล่าสุด" — 2026-09-24 รอบ 2 (ใหม่ทั้งหมด) ประวัติ StatusHistory ล่าสุดที่เกี่ยวกับหน่วยงานนี้
  // (action_by_org หรือ from_org หรือ to_org ตรงกับ org ของผู้ login — field จริงทั้งหมดจาก STATUS_HISTORY
  // ไม่ต้องเดา) เรียงตาม action_date ใหม่สุดก่อน 5 รายการ
  var recentHistory = history.filter(function (h) {
    return h.action_by_org === org || h.from_org === org || h.to_org === org;
  }).sort(function (a, b) {
    return new Date(b.action_date).getTime() - new Date(a.action_date).getTime();
  }).slice(0, 5);
  var recentHtml = recentHistory.length
    ? recentHistory.map(function (h) {
        var w = worksById[h.work_id];
        var fromStation = stationsMap[h.from_station];
        var toStation = stationsMap[h.to_station];
        var fromLabel = fromStation ? splitStationNameDesc_(fromStation.station_name).main : (h.from_station || '-');
        var toLabel = toStation ? splitStationNameDesc_(toStation.station_name).main : (h.to_station || '-');
        var detailHref = w ? baseUrl + '?page=detail&id=' + encodeURIComponent(w.work_id) : '#';
        return '<a class="dash-recent-row" target="_top" href="' + detailHref + '">' +
          '<div class="dash-recent-main"><span class="dash-recent-tracking">' + escapeHtml_(h.tracking_no || '-') + '</span>' +
          '<span class="dash-recent-owner">' + escapeHtml_(w ? ownerNameOf_(w) : '-') + '</span>' +
          '<span class="dash-recent-move">' + escapeHtml_(fromLabel) + ' &rarr; ' + escapeHtml_(toLabel) + '</span></div>' +
          '<div class="dash-recent-side"><span class="dash-recent-org">' + escapeHtml_(h.action_by_org || '-') + '</span>' +
          '<span class="dash-recent-date">' + formatDateTh_(h.action_date) + '</span></div>' +
          '</a>';
      }).join('')
    : '<div class="empty">ยังไม่มีความเคลื่อนไหวล่าสุด</div>';

  return '' +
    registryLinkHtml + kpiHtml + filterFormHtml +
    '<div class="dash-row-2-1">' +
    '<section class="dash-section"><div class="dash-section-head"><span class="dash-section-title">งานที่ต้องติดตาม</span>' +
    '<a target="_top" href="' + baseUrl + '?page=registry&bucket=progress&' + respQuery + '">ดูทั้งหมด &rarr;</a></div>' + followHtml + '</section>' +
    '<section class="dash-section"><div class="dash-section-head"><span class="dash-section-title">งานใกล้ครบกำหนด</span>' +
    '<a target="_top" href="' + baseUrl + '?page=registry&bucket=overdue&' + respQuery + '">ดูทั้งหมด &rarr;</a></div>' + dueHtml + '</section>' +
    '</div>' +
    '<section class="dash-section dash-section-recent"><div class="dash-section-head"><span class="dash-section-title">อัปเดตล่าสุด</span></div>' +
    recentHtml + '</section>';
}

/**
 * Dashboard หน้าแรกของบทบาท "ผู้รับผิดชอบ" — KPI + กราฟ (Donut/Bar) + งานของฉันแบบย่อ + รายการล่าสุด
 * ต่างจาก renderDashboardBody_ เดิม (ที่ Admin ยังใช้อยู่ ไม่แตะ) ข้อมูลมาจาก computeResponsibleDashboardMetrics_
 * (Dashboard.gs) กรองตามเดือน/ปีที่เลือก ยกเว้นการ์ด "รายการทั้งหมด" ที่ตั้งใจไม่กรองเดือน (ยืนยันกับผู้ใช้แล้ว)
 */
function renderResponsibleDashboardBody_(ss, user, m, month, year, baseUrl) {
  var org = user.organization;
  var respQuery = 'resp=' + encodeURIComponent(org);

  var monthOptions = THAI_MONTHS_.map(function (name, i) {
    var val = i + 1;
    return '<option value="' + val + '"' + (val === month ? ' selected' : '') + '>' + name + '</option>';
  }).join('');
  var yearNow = now_().getFullYear();
  var yearOptions = [yearNow, yearNow - 1, yearNow - 2, yearNow - 3].map(function (y) {
    return '<option value="' + y + '"' + (y === year ? ' selected' : '') + '>' + y + '</option>';
  }).join('');

  var filterFormHtml = '' +
    '<form method="get" target="_top" action="' + baseUrl + '" class="dash-filter-form">' +
    '<input type="hidden" name="page" value="dashboard">' +
    '<div class="field"><label>เดือน</label><select class="input" name="month" onchange="this.form.submit()">' + monthOptions + '</select></div>' +
    '<div class="field"><label>ปี</label><select class="input" name="year" onchange="this.form.submit()">' + yearOptions + '</select></div>' +
    '<noscript><button class="btn-primary" type="submit">แสดงผล</button></noscript>' +
    '</form>' +
    '<p class="scope-note">สรุปภาพรวมประจำเดือน <b>' + THAI_MONTHS_[month - 1] + ' ' + year + '</b> — หน่วยงาน: <b>' + escapeHtml_(org) + '</b></p>';

  var kpiDefs = [
    { label: 'รายการทั้งหมด', count: m.totalAllTime, hint: 'รวมทั้งหมด ไม่จำกัดเดือน', href: 'page=registry&' + respQuery, icon: '▦', tone: 'navy' },
    { label: 'รับเรื่องเดือนนี้', count: m.monthCount, hint: '', href: 'page=registry&' + respQuery, icon: '+', tone: 'done' },
    { label: 'อยู่ระหว่างดำเนินการ', count: m.inProgress, hint: '', href: 'page=registry&bucket=progress&' + respQuery, icon: '◐', tone: 'active' },
    { label: 'รอแก้ไข', count: m.needRevision, hint: '', href: 'page=registry&bucket=revision&' + respQuery, icon: '✎', tone: 'revision' },
    { label: 'ผ่านแล้ว', count: m.passed, hint: '', href: 'page=registry&result=' + encodeURIComponent('ผ่าน') + '&' + respQuery, icon: '✓', tone: 'done' },
    { label: 'ไม่ผ่าน / ปิดเรื่อง', count: m.failedOrClosed, hint: '', href: 'page=registry&bucket=done&' + respQuery, icon: '✕', tone: 'danger' },
  ];
  var kpiHtml = '<div class="kpi-grid">' + kpiDefs.map(function (k) {
    return '<a class="kpi-card" target="_top" href="' + baseUrl + '?' + k.href + '">' +
      '<span class="kpi-icon kpi-icon-' + k.tone + '">' + k.icon + '</span>' +
      '<span class="kpi-count">' + k.count + '</span><span class="kpi-label">' + escapeHtml_(k.label) + '</span>' +
      (k.hint ? '<span class="kpi-hint">' + escapeHtml_(k.hint) + '</span>' : '') +
      '</a>';
  }).join('') + '</div>';

  var chartDataScript = '<script>' +
    'var DASH_DONUT_ = ' + JSON.stringify(m.donutBuckets) + ';' +
    'var DASH_BARS_ = ' + JSON.stringify(m.topStations) + ';' +
    'var DASH_TOTAL_ = ' + m.monthCount + ';' +
    '</script>';

  var chartsHtml = (m.monthCount > 0)
    ? '<div class="chart-row">' +
      '<div class="chart-box"><div class="chart-title">สัดส่วนสถานะงาน</div><canvas id="dashDonut" height="220"></canvas></div>' +
      '<div class="chart-box"><div class="chart-title">จำนวนรายชื่อตามขั้นตอน (Top 5)</div><canvas id="dashBar" height="220"></canvas></div>' +
      '</div>'
    : '<div class="metric-card"><div class="empty">ไม่มีข้อมูลในเดือนที่เลือก</div></div>';

  var dashMetrics = computeDashboardMetrics_(ss, org);
  var myWorkDefs = [
    { key: 'pendingReceive', label: 'งานรอรับ' },
    { key: 'inProgress', label: 'กำลังดำเนินการ' },
    { key: 'nearDue', label: 'ใกล้ครบกำหนด' },
    { key: 'overdue', label: 'เกินกำหนด' },
    { key: 'returnedForRevision', label: 'ส่งกลับแก้ไข' },
  ];
  var myWorkHtml = '<details class="mywork-box"><summary>งานที่ต้องดำเนินการของฉัน — ' +
    myWorkDefs.map(function (d) { return d.label + ' ' + (dashMetrics[d.key] || []).length; }).join(' · ') +
    '</summary>' + myWorkDefs.map(function (d) {
      var items = dashMetrics[d.key] || [];
      return '<div class="mywork-section"><div class="mywork-head">' + escapeHtml_(d.label) + ' (' + items.length + ')</div>' +
        (items.length ? renderWorkList_(items, false, baseUrl) : '<div class="empty">ไม่มีรายการ</div>') + '</div>';
    }).join('') + '</details>';

  var recentRows = m.recentWorks.map(function (w) {
    var station = getStationsMap_(ss)[w.current_station_key];
    var ownerName = (w.title_name || '') + (w.first_name || '') + ' ' + (w.last_name || '');
    return '<tr>' +
      '<td>' + escapeHtml_(w.tracking_no) + '</td>' +
      '<td>' + escapeHtml_(ownerName) + '</td>' +
      '<td>' + escapeHtml_(w.work_title || '-') + '</td>' +
      '<td>' + escapeHtml_(w.org_from || '-') + '</td>' +
      '<td>' + formatDateTh_(w.received_date) + '</td>' +
      '<td>' + escapeHtml_(station ? station.station_name : w.current_station_key) + '</td>' +
      '<td>' + formatDateTh_(w.updated_at) + '</td>' +
      // 2026-11-03 — ย้ายไป page=detail เหมือนลิงก์ "ดูรายละเอียด/จัดการ" ของหน้าทะเบียน (เหตุผลเดียวกัน)
      '<td><a class="btn-action btn-action-primary btn-action-sm" target="_top" href="' + baseUrl +
      '?page=detail&id=' + encodeURIComponent(w.work_id) + '">จัดการ</a></td>' +
      '</tr>';
  }).join('');

  var recentHtml = '' +
    '<div class="metric-head" style="margin-bottom:6px"><span class="metric-label">รายการล่าสุด ประจำเดือน ' +
    THAI_MONTHS_[month - 1] + '/' + year + '</span>' +
    '<a target="_top" href="' + baseUrl + '?page=registry&' + respQuery + '">ดูทะเบียนทั้งหมด &rarr;</a></div>' +
    (recentRows
      ? '<div class="table-scroll"><table class="admin-table"><thead><tr>' +
        '<th>เลขทะเบียน</th><th>เจ้าของผลงาน</th><th>ชื่อผลงาน</th><th>หน่วยงาน</th>' +
        '<th>วันที่รับเรื่อง</th><th>สถานะล่าสุด</th><th>วันที่อัปเดต</th><th>จัดการ</th>' +
        '</tr></thead><tbody>' + recentRows + '</tbody></table></div>'
      : '<div class="empty">ไม่มีรายการในเดือนที่เลือก</div>');

  return filterFormHtml + kpiHtml + chartDataScript + chartsHtml + myWorkHtml +
    '<section class="metric-card">' + recentHtml + '</section>' +
    ((m.monthCount > 0) ? DASH_CHART_SCRIPT_ : '');
}

/** วาด Donut/Bar chart ของ Dashboard ผู้รับผิดชอบด้วย Chart.js (CDN เดียวกับที่ jsQR ใช้อยู่แล้วในระบบ)
 *  อ่านข้อมูลจาก DASH_DONUT_/DASH_BARS_/DASH_TOTAL_ ที่ฝังไว้ก่อนหน้า (chartDataScript) */
var DASH_CHART_SCRIPT_ = '' +
  '<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js"></script>' +
  '<script>' +
  'document.addEventListener("DOMContentLoaded", function () {' +
  'if (!window.Chart) return;' +
  'var tokens = { navy: "#1f3b54", active: "#0e7c86", revision: "#b8860b", done: "#1f8a4c", danger: "#b23a3a", pending: "#8a94a3" };' +
  'var tokenCycle = [tokens.navy, tokens.active, tokens.revision, tokens.done, tokens.danger];' +
  'var donutColors = { "อยู่ระหว่างดำเนินการ": tokens.active, "รอแก้ไข": tokens.revision, "ผ่านแล้ว": tokens.done, ' +
  '"ไม่ผ่าน/ปิดเรื่อง": tokens.danger, "อื่น ๆ": tokens.pending };' +
  'var donutCanvas = document.getElementById("dashDonut");' +
  'if (donutCanvas && DASH_DONUT_.length) {' +
  'new Chart(donutCanvas, { type: "doughnut", data: { labels: DASH_DONUT_.map(function (b) { return b.label; }), ' +
  'datasets: [{ data: DASH_DONUT_.map(function (b) { return b.count; }), ' +
  'backgroundColor: DASH_DONUT_.map(function (b) { return donutColors[b.label] || tokens.pending; }) }] }, ' +
  'options: { plugins: { legend: { position: "right", labels: { font: { family: "Sarabun", size: 11 }, boxWidth: 12 } } } }, ' +
  'plugins: [{ id: "centerText", afterDraw: function (chart) { ' +
  'var ctx = chart.ctx; var area = chart.chartArea; var cx = (area.left + area.right) / 2; var cy = (area.top + area.bottom) / 2; ' +
  'ctx.save(); ctx.font = "700 15px Sarabun"; ctx.fillStyle = "#1f3b54"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ' +
  'ctx.fillText("ทั้งหมด " + DASH_TOTAL_ + " ราย", cx, cy); ctx.restore(); ' +
  '} }] });' +
  '}' +
  'var barCanvas = document.getElementById("dashBar");' +
  'if (barCanvas && DASH_BARS_.length) {' +
  'new Chart(barCanvas, { type: "bar", data: { labels: DASH_BARS_.map(function (b) { return b.label; }), ' +
  'datasets: [{ data: DASH_BARS_.map(function (b) { return b.count; }), ' +
  'backgroundColor: DASH_BARS_.map(function (b, i) { return tokenCycle[i % tokenCycle.length]; }) }] }, ' +
  'options: { indexAxis: "y", plugins: { legend: { display: false } }, scales: { x: { ticks: { precision: 0 } } } } });' +
  '}' +
  '});' +
  '</script>';

/** รายการงานแบบย่อ (ใช้ในการ์ด Dashboard และหน้าค้นหา) — tracking_no, ชื่อผลงาน, ป้ายสถานะ, คลิกไปหน้ารายละเอียด
 *  showAll=true (หน้าค้นหา) แสดงครบทุกแถว, ไม่ระบุ/false (การ์ด Dashboard) แสดงแค่ 5 แถวแรก */
function renderWorkList_(works, showAll, baseUrl) {
  var list = showAll ? works : works.slice(0, 5);
  var rows = list.map(function (w) {
    var cls = STATUS_PILL_CLASS_[w.current_status_public] || 'pending';
    var label = PUBLIC_STATUS_LABELS[w.current_status_public] || w.current_status_public || '-';
    return '' +
      '<a class="work-row" target="_top" href="' + baseUrl + '?page=detail&id=' + encodeURIComponent(w.work_id) + '">' +
      '<div class="work-main"><span class="tracking">' + escapeHtml_(w.tracking_no) + '</span>' +
      '<span class="worktitle">' + escapeHtml_(w.work_title || '-') + '</span></div>' +
      '<span class="pill pill-' + cls + '">' + escapeHtml_(label) + '</span>' +
      '</a>';
  }).join('');
  var more = (!showAll && works.length > 5) ? '<div class="empty">และอีก ' + (works.length - 5) + ' รายการ</div>' : '';
  return rows + more;
}

/** เมนู "ส่งต่อ" แยก — รายการงานที่หน่วยงานนี้ถือครองอยู่และส่งต่อได้ทันที ไม่ต้องสแกน QR ก่อน (คลิกปุ่มแล้วไปหน้ายืนยันส่งต่อเลย) */
function renderForwardListBody_(org, works, stationsMap, baseUrl) {
  var listHtml = works.length
    ? works.map(function (w) {
        var station = stationsMap[w.current_station_key];
        return '' +
          '<div class="work-row">' +
          '<div class="work-main"><span class="tracking">' + escapeHtml_(w.tracking_no) + '</span>' +
          '<span class="worktitle">' + escapeHtml_(w.work_title || '-') + '</span>' +
          '<span class="tl-meta">' + escapeHtml_(station ? station.station_name : '-') + '</span></div>' +
          // 2026-11-03 — ย้ายไป page=detail เหมือนลิงก์อื่นในหน้าค้นหา/ทะเบียน (เหตุผลเดียวกัน — ข้อ 6)
          '<a class="btn-action btn-action-primary btn-action-sm" target="_top" href="' + baseUrl +
          '?page=detail&id=' + encodeURIComponent(w.work_id) + '">ดำเนินการ</a>' +
          '</div>';
      }).join('')
    : '<div class="empty">ไม่มีงานที่ต้องดำเนินการในขณะนี้</div>';

  return '' +
    '<p class="scope-note">งานของหน่วยงาน <b>' + escapeHtml_(org) + '</b> ที่ดำเนินการได้ทันที</p>' +
    '<section class="metric-card">' + listHtml + '</section>';
}

/** หน้าทะเบียนผลงานทั้งหมด (เฉพาะ ผู้รับผิดชอบ/Admin) — ช่องค้นหา + ตัวกรองสถานะ + ตาราง + pagination */
function renderRegistryListBody_(ss, pageResult, rp, totalAllCount, bucketCounts, baseUrl, flashMessage, resultBuckets) {
  var flashHtml = flashMessage ? '<div class="success-banner">' + escapeHtml_(flashMessage) + '</div>' : '';
  var viewToggleHtml = renderRegistryViewToggle_(rp, baseUrl);

  var tileDefs = [
    { key: '', label: 'ทั้งหมด', count: bucketCounts.all },
    { key: 'progress', label: 'อยู่ระหว่างดำเนินการ', count: bucketCounts.progress },
    { key: 'revision', label: 'รอแก้ไข', count: bucketCounts.revision },
    { key: 'done', label: 'เสร็จสิ้น', count: bucketCounts.done },
    { key: 'overdue', label: 'ค้างนาน', count: bucketCounts.overdue },
  ];
  var tilesHtml = '<div class="registry-tiles">' + tileDefs.map(function (t) {
    var active = rp.bucket === t.key ? ' active' : '';
    return '<a class="registry-tile' + active + '" target="_top" href="' + baseUrl + '?' +
      buildRegistryQuery_(rp, { bucket: t.key, p: 1 }) + '">' +
      '<span class="registry-tile-count">' + t.count + '</span><span class="registry-tile-label">' + escapeHtml_(t.label) + '</span></a>';
  }).join('') + '</div>';

  // 2026-10-20 แก้บั๊กขึ้น 0 (root cause: evaluation_result ว่างเกือบหมดสำหรับงาน legacy — ดู
  // REGISTRY_RESULT_TILES_/computeRegistryResultBuckets_, Registry.gs) เปลี่ยนมานับ+กรองจาก state code จริง
  // 7.1-7.4 (current_station_key) แทน — คลิกกรองผ่าน rp.state เดิม (reuse dropdown "สถานะ" ที่มีอยู่แล้ว ไม่ใช่
  // label text) กดการ์ดที่ active อยู่แล้วซ้ำ = เคลียร์กลับไปแสดงทั้งหมด จำนวนในแต่ละช่องมาจาก resultBuckets
  // (computeRegistryResultBuckets_, Registry.gs) ซึ่งคำนวณตาม filter ปัจจุบันของหน้าอยู่แล้ว (ยกเว้น rp.state เอง)
  var resultTilesHtml = resultBuckets ? '' +
    '<div class="registry-result-section-title">ผลการพิจารณา</div>' +
    '<div class="registry-result-tiles">' + REGISTRY_RESULT_TILES_.map(function (t) {
      var isActive = rp.state === t.stationKey;
      var nextState = isActive ? '' : t.stationKey;
      return '<a class="registry-result-tile registry-result-tile-' + t.tone + (isActive ? ' active' : '') + '" target="_top" href="' + baseUrl + '?' +
        buildRegistryQuery_(rp, { state: nextState, p: 1 }) + '">' +
        '<span class="registry-result-tile-count">' + (resultBuckets[t.stateCode] || 0) + '</span>' +
        '<span class="registry-result-tile-label">' + escapeHtml_(t.label) + '</span></a>';
    }).join('') + '</div>' : '';

  var stationsMap = getStationsMap_(ss);
  var allStates = listStationsSorted_(ss);
  var allWorks = readSheetAsObjects_(ss.getSheetByName(SHEET.WORKS));

  var stateOptions = '<option value="">ทุกสถานะ</option>' + allStates.map(function (s) {
    var sel = rp.state === s.station_key ? ' selected' : '';
    return '<option value="' + escapeHtml_(s.station_key) + '"' + sel + '>' + escapeHtml_(s.station_name) + '</option>';
  }).join('');

  var respOrgs = distinctValues_(allWorks, 'current_owner_org');
  var respOptions = '<option value="">ทุกผู้รับผิดชอบ</option>' + respOrgs.map(function (o) {
    var sel = rp.resp === o ? ' selected' : '';
    return '<option value="' + escapeHtml_(o) + '"' + sel + '>' + escapeHtml_(o) + '</option>';
  }).join('');

  var orgFroms = distinctValues_(allWorks, 'org_from');
  var orgOptions = '<option value="">ทุกหน่วยงาน</option>' + orgFroms.map(function (o) {
    var sel = rp.org === o ? ' selected' : '';
    return '<option value="' + escapeHtml_(o) + '"' + sel + '>' + escapeHtml_(o) + '</option>';
  }).join('');

  var resultOptions = '<option value="">ทุกผลการพิจารณา</option>' + REGISTRY_RESULT_OPTIONS_.map(function (r) {
    var sel = rp.result === r ? ' selected' : '';
    return '<option value="' + escapeHtml_(r) + '"' + sel + '>' + escapeHtml_(r) + '</option>';
  }).join('');

  var perOptions = REGISTRY_PER_PAGE_OPTIONS_.map(function (n) {
    var sel = rp.per === n ? ' selected' : '';
    return '<option value="' + n + '"' + sel + '>' + n + ' รายการ/หน้า</option>';
  }).join('');

  // 2026-10-08 ตามที่ผู้ใช้ขอ — เพิ่มตัวกรองตำแหน่ง/จังหวัด/เดือน-ปีที่รับเรื่อง เข้ามุมมองนี้ด้วย (reuse
  // filterRegistryWorks_ เดิมที่รองรับ rp.position/rp.province/rp.fy/rp.month อยู่แล้วจากมุมมอง Excel ไม่ได้
  // เขียน logic กรองใหม่ แค่เพิ่ม input ในฟอร์มนี้ให้ตรงกับคอลัมน์ใหม่ที่โชว์)
  var distinctPositionCard = distinctValues_(allWorks, 'position');
  var positionOptionsCard = '<option value="">ทุกตำแหน่ง</option>' + distinctPositionCard.map(function (o) {
    return '<option value="' + escapeHtml_(o) + '"' + (rp.position === o ? ' selected' : '') + '>' + escapeHtml_(o) + '</option>';
  }).join('');
  var provinceListCard = getSettingList_(ss, 'district11_provinces', ['นครศรีธรรมราช', 'กระบี่', 'พังงา', 'ภูเก็ต', 'สุราษฎร์ธานี', 'ระนอง', 'ชุมพร']);
  var provinceOptionsCard = '<option value="">ทุกจังหวัด</option>' + provinceListCard.map(function (p) {
    return '<option value="' + escapeHtml_(p) + '"' + (rp.province === p ? ' selected' : '') + '>' + escapeHtml_(p) + '</option>';
  }).join('');
  var fyOptionsCard = distinctValues_(allWorks.map(function (w) { return { fy: String(fiscalYearOfDate_(w.received_date)) }; }), 'fy').sort().reverse();
  var fyOptionsCardHtml = '<option value="">ทุกปีงบประมาณ</option>' + fyOptionsCard.map(function (fy) {
    return '<option value="' + escapeHtml_(fy) + '"' + (rp.fy === fy ? ' selected' : '') + '>' + escapeHtml_(fy) + '</option>';
  }).join('');
  var monthOptionsCard = '<option value="">ทุกเดือน</option>' + THAI_MONTHS_.map(function (name, i) {
    var val = String(i + 1);
    return '<option value="' + val + '"' + (rp.month === val ? ' selected' : '') + '>' + escapeHtml_(name) + '</option>';
  }).join('');

  var filterFormHtml = '' +
    '<form method="get" target="_top" action="' + baseUrl + '" class="excel-toolbar-form">' +
    '<input type="hidden" name="page" value="registry">' +
    '<div class="field-row">' +
    '<div class="field"><label>ค้นหา</label><input class="input" type="text" name="q" value="' + escapeHtml_(rp.q) +
    '" placeholder="เลขทะเบียน / ชื่อเจ้าของผลงาน / ชื่อผลงาน / หน่วยงาน / ทีม"></div>' +
    '</div>' +
    '<div class="field-row">' +
    '<div class="field"><label>สถานะ</label><select class="input" name="state">' + stateOptions + '</select></div>' +
    '<div class="field"><label>ตำแหน่ง</label><select class="input" name="position">' + positionOptionsCard + '</select></div>' +
    '</div>' +
    '<div class="field-row">' +
    '<div class="field"><label>จังหวัด</label><select class="input" name="province">' + provinceOptionsCard + '</select></div>' +
    '<div class="field"><label>ผู้รับผิดชอบ</label><select class="input" name="resp">' + respOptions + '</select></div>' +
    '</div>' +
    '<div class="field-row">' +
    '<div class="field"><label>หน่วยงาน</label><select class="input" name="org">' + orgOptions + '</select></div>' +
    '<div class="field"><label>ผลการพิจารณา</label><select class="input" name="result">' + resultOptions + '</select></div>' +
    '</div>' +
    '<div class="field-row">' +
    '<div class="field"><label>ปีงบประมาณ</label><select class="input" name="fy">' + fyOptionsCardHtml + '</select></div>' +
    '<div class="field"><label>เดือนที่รับเรื่อง</label><select class="input" name="month">' + monthOptionsCard + '</select></div>' +
    '</div>' +
    '<div class="field-row">' +
    '<div class="field"><label>แสดง</label><select class="input" name="per">' + perOptions + '</select></div>' +
    '</div>' +
    '<div class="excel-toolbar-buttons">' +
    '<button class="btn-primary" type="submit">ค้นหา/กรอง</button>' +
    '<a class="btn-outline" target="_top" href="' + baseUrl + '?page=registry">ล้างตัวกรอง</a>' +
    '</div>' +
    '</form>';

  // 2026-10-08 ตามที่ผู้ใช้ขอ — ยุบ/ขยาย Filter ได้ (reuse component เดียวกับมุมมอง Excel .excel-filter-details
  // เป๊ะ ไม่สร้าง CSS/JS คู่ขนาน) ปิดเป็นค่าเริ่มต้นเสมอทุกครั้งที่โหลดหน้า แม้มี filter ใช้งานอยู่ก็ตาม (ข้อกำหนด:
  // ห้าม reset filter เมื่อยุบ — ค่าที่เลือกไว้ยังอยู่ใน query string/ฟอร์มเดิมเป๊ะ แค่ไม่โชว์ผืนที่เฉยๆ)
  var activeFilterLabels = [];
  if (rp.q) activeFilterLabels.push('ค้นหา: ' + rp.q);
  if (rp.state) {
    var stateStCard = stationsMap[rp.state];
    activeFilterLabels.push('สถานะ: ' + (stateStCard ? stateStCard.station_order + ' ' + stateStCard.station_name : rp.state));
  }
  if (rp.position) activeFilterLabels.push('ตำแหน่ง: ' + rp.position);
  if (rp.province) activeFilterLabels.push('จังหวัด: ' + rp.province);
  if (rp.resp) activeFilterLabels.push('ผู้รับผิดชอบ: ' + rp.resp);
  if (rp.org) activeFilterLabels.push('หน่วยงาน: ' + rp.org);
  if (rp.result) activeFilterLabels.push('ผลการพิจารณา: ' + rp.result);
  if (rp.fy) activeFilterLabels.push('ปีงบ: ' + rp.fy);
  if (rp.month) activeFilterLabels.push('เดือน: ' + (THAI_MONTHS_[Number(rp.month) - 1] || rp.month));
  var hasActiveFilter = activeFilterLabels.length > 0;
  var clearFilterUrl = baseUrl + '?page=registry';
  var filterSummaryBarHtml = '' +
    '<summary class="excel-filter-summary">' +
    '<span class="excel-filter-summary-title">&#128269; ค้นหา / ตัวกรอง</span>' +
    (hasActiveFilter ? '<span class="excel-filter-badge">ใช้งาน ' + activeFilterLabels.length + ' ตัวกรอง</span>' : '') +
    '</summary>' +
    (hasActiveFilter ? '<div class="excel-filter-active-summary">' + escapeHtml_(activeFilterLabels.join(' • ')) +
      ' <a target="_top" class="excel-filter-quickclear" href="' + clearFilterUrl + '">ล้างตัวกรอง</a></div>' : '');

  // 2026-10-08 ตามที่ผู้ใช้ขอ — เปลี่ยนคอลัมน์ของมุมมองหลัก (การ์ด) ให้เป็น 8 คอลัมน์ตามทะเบียน Excel เดิม:
  // ลำดับ/ชื่อ-สกุล/ตำแหน่ง/ด้าน/จังหวัด/วันที่ลงรับ/ทีม/สถานะ (เลขทะเบียน/ชื่อผลงาน/หน่วยงาน/ผู้รับผิดชอบ ยัง
  // อยู่ในฐานข้อมูลครบ แค่ไม่แสดงในตารางนี้ — ยังกรอง/sort ได้ผ่านฟอร์มด้านบนตามปกติ) mapping ฟิลด์จริงแบบ
  // explicit ทุกคอลัมน์ (ห้ามเดา/ไม่ใช้ Object.values):
  //   ลำดับ = เลขลำดับแถวจริงตามหน้า (startIndex+i+1, คำนวณจาก pageResult เหมือนมุมมอง Excel ไม่ใช่ field ในชีต)
  //   ชื่อ-สกุล = title_name+first_name+last_name (เหมือนทุกจุดในระบบ)
  //   ตำแหน่ง = w.position, ด้าน = w.specialty, จังหวัด = w.province, ทีม = w.legacy_team (ยืนยัน field จริงจาก
  //   มุมมอง Excel ที่ map แบบเดียวกันอยู่แล้ว), วันที่ลงรับ = w.received_date
  //   สถานะ = อ่านจาก WorkflowStates (stationsMap[current_station_key]) ไม่ใช่เลข state ดิบ ถ้าเป็น state ย่อย
  //   ทศนิยมจริง (station_order มีจุด เช่น 7.1) ให้ใช้ส่วนผลลัพธ์ในวงเล็บ (เช่น "ผ่านการประเมิน" จาก
  //   "ผ่าน (ผ่านการประเมิน)") ถ้าเป็น state หลักไม่มีจุด ตัดวงเล็บออก ใช้ชื่อหลักเฉยๆ (เช่น "แจ้งผลหน่วยงาน (ผ่าน/
  //   ไม่ผ่าน)" -> "แจ้งผลหน่วยงาน") — ใช้ splitStationNameDesc_ เดิม (PublicTrack.gs) ไม่สร้าง logic ใหม่
  function registryStateDisplayText_(station) {
    if (!station) return '-';
    var split = splitStationNameDesc_(station.station_name);
    var hasDot = String(station.station_order || '').indexOf('.') !== -1;
    return (hasDot ? (split.desc || split.main) : split.main) || '-';
  }

  var startIndexCard = (pageResult.page - 1) * pageResult.perPage;
  var rows = pageResult.items.map(function (w, i) {
    var ownerName = ((w.title_name || '') + (w.first_name || '') + ' ' + (w.last_name || '')).trim();
    var station = stationsMap[w.current_station_key];
    // วันที่ลงรับ — ใช้ formatOwnerReceivedDate_ (OwnerAuth.gs) ไม่ใช่ formatDateTh_ ปกติ เพราะ formatDateTh_
    // แสดงปี ค.ศ.+เวลา 00:00 เสมอ (ไม่ตรงข้อกำหนด: ต้องปี พ.ศ. "12 มิ.ย. 2569" และห้ามแสดงเวลา 00:00 ถ้าไม่มีเวลาจริง)
    return '<tr>' +
      '<td class="reg-main-col-seq">' + (startIndexCard + i + 1) + '</td>' +
      '<td class="reg-main-col-name">' + escapeHtml_(ownerName || '-') + '</td>' +
      '<td class="reg-main-col-position">' + escapeHtml_(w.position || '-') + '</td>' +
      '<td class="reg-main-col-specialty">' + escapeHtml_(w.specialty || '-') + '</td>' +
      '<td class="reg-main-col-province">' + escapeHtml_(w.province || '-') + '</td>' +
      '<td class="reg-main-col-date">' + escapeHtml_(formatOwnerReceivedDate_(w.received_date)) + '</td>' +
      '<td class="reg-main-col-team">' + escapeHtml_(w.legacy_team || '-') + '</td>' +
      '<td class="reg-main-col-state">' + escapeHtml_(registryStateDisplayText_(station)) + '</td>' +
      // 2026-11-03 — หน้า Staff "Workflow เดียว" ใหม่ (page=detail) ครบทุก action (ดู/เปลี่ยนสถานะ/บันทึก-แก้ไข
      // วันที่) อยู่ในตัวแล้ว ย้ายลิงก์นี้จาก page=scan (หน้าเดิม ไม่มี action/การแก้ไขวันที่ให้ทำอีกต่อไปในที่นี้)
      // มาที่ page=detail&id= ตรงๆ (ข้อ 6 — ห้ามต้องเข้า-ออกหลายหน้า) ไม่ได้ลบ/ตัด route page=scan ทิ้ง (ยังมี
      // ไว้เผื่อ URL เดิม/ QR จริงเรียกเข้ามาอยู่)
      '<td class="reg-main-col-action"><a class="btn-action btn-action-primary btn-action-sm" target="_top" href="' + baseUrl +
      '?page=detail&id=' + encodeURIComponent(w.work_id) + '">ดูรายละเอียด/จัดการ</a></td>' +
      '</tr>';
  }).join('');

  // หัวตารางกดเรียงได้ (2026-09-24 ตามที่ผู้ใช้ขอ) — คลิกครั้งแรกเรียง asc, คลิกซ้ำสลับ desc/asc คอลัมน์เดิม
  // ตำแหน่ง/จังหวัด/ทีม เป็น sort key ใหม่ (เพิ่มเข้า REGISTRY_SORTABLE_COLUMNS_ แล้ว, Registry.gs) ด้าน/ลำดับ/
  // จัดการ ไม่ sort (ด้านไม่อยู่ในรายการ sort ที่ผู้ใช้ขอ, ลำดับ/จัดการ ไม่ใช่ field ของข้อมูลจริง)
  var theadHtml = '<tr>' +
    '<th class="reg-main-col-seq">ลำดับ</th>' +
    '<th class="reg-main-col-name">' + registrySortHeaderInnerHtml_('ชื่อ - สกุล', 'owner', rp, baseUrl) + '</th>' +
    '<th class="reg-main-col-position">' + registrySortHeaderInnerHtml_('ตำแหน่ง', 'position', rp, baseUrl) + '</th>' +
    '<th class="reg-main-col-specialty">ด้าน</th>' +
    '<th class="reg-main-col-province">' + registrySortHeaderInnerHtml_('จังหวัด', 'province', rp, baseUrl) + '</th>' +
    '<th class="reg-main-col-date">' + registrySortHeaderInnerHtml_('วันที่ลงรับ', 'received_date', rp, baseUrl) + '</th>' +
    '<th class="reg-main-col-team">' + registrySortHeaderInnerHtml_('ทีม', 'legacy_team', rp, baseUrl) + '</th>' +
    '<th class="reg-main-col-state">' + registrySortHeaderInnerHtml_('สถานะ', 'state', rp, baseUrl) + '</th>' +
    '<th class="reg-main-col-action">จัดการ</th></tr>';
  var tableHtml = pageResult.items.length
    ? '<div class="excel-table-scroll"><table class="excel-table reg-main-table"><thead>' + theadHtml + '</thead><tbody>' + rows + '</tbody></table></div>'
    : '<div class="empty">ไม่พบรายการที่ตรงกับเงื่อนไข</div>';

  var pagerHtml = '';
  if (pageResult.totalItems > 0) {
    var hasFilter = rp.q || rp.state || rp.resp || rp.org || rp.result || rp.bucket || rp.position || rp.province || rp.fy || rp.month;
    var prevLink = pageResult.page > 1
      ? '<a target="_top" href="' + baseUrl + '?' + buildRegistryQuery_(rp, { p: pageResult.page - 1 }) + '">&larr; ก่อนหน้า</a>'
      : '<span class="muted-link">&larr; ก่อนหน้า</span>';
    var nextLink = pageResult.page < pageResult.totalPages
      ? '<a target="_top" href="' + baseUrl + '?' + buildRegistryQuery_(rp, { p: pageResult.page + 1 }) + '">ถัดไป &rarr;</a>'
      : '<span class="muted-link">ถัดไป &rarr;</span>';
    pagerHtml = '<div class="pager">' + prevLink +
      '<span>หน้า ' + pageResult.page + ' / ' + pageResult.totalPages + ' (ทั้งหมด ' + pageResult.totalItems + ' รายการ' +
      (hasFilter ? ' จาก ' + totalAllCount : '') + ')</span>' + nextLink + '</div>';
  }

  return flashHtml + viewToggleHtml + tilesHtml + resultTilesHtml +
    '<details class="excel-filter-details">' + filterSummaryBarHtml + filterFormHtml + '</details>' +
    '<p class="hint" style="margin:10px 0">คลิก "ดูรายละเอียด/จัดการ" — เห็นได้ทุกรายการ แก้สถานะได้เฉพาะที่หน่วยงานตนรับผิดชอบ ณ สถานะปัจจุบันเท่านั้น</p>' +
    '<div class="excel-sheet">' + tableHtml + '</div>' + pagerHtml;
}

/** ปุ่มสลับ [ภาพรวมผลงาน] [ทะเบียนแบบ Excel] (2026-09-25 ตามที่ผู้ใช้ขอข้อ 10, 2026-10-21 เปลี่ยน label ให้
 *  ผู้บริหารเข้าใจง่ายขึ้นตามที่ผู้ใช้ขอ — เดิม "มุมมองการ์ด"/"มุมมอง Excel" — แก้แค่ข้อความที่แสดงผล route/
 *  query param (view=card/view=excel)/function/permission/data source/filter/export logic เดิมทั้งหมดไม่แตะ) —
 *  ข้อมูล/filter/permission ชุดเดียวกัน ต่างแค่การแสดงผล ใช้ร่วมกันทั้ง 2 ฟังก์ชัน render */
function renderRegistryViewToggle_(rp, baseUrl) {
  var isExcel = rp.view === 'excel';
  return '<div class="registry-view-toggle">' +
    '<a class="registry-view-btn' + (isExcel ? '' : ' active') + '" target="_top" href="' + baseUrl + '?' + buildRegistryQuery_(rp, { view: 'card', p: 1 }) + '">ภาพรวมผลงาน</a>' +
    '<a class="registry-view-btn' + (isExcel ? ' active' : '') + '" target="_top" href="' + baseUrl + '?' + buildRegistryQuery_(rp, { view: 'excel', p: 1 }) + '">ทะเบียนแบบ Excel</a>' +
    '</div>';
}

/**
 * มุมมอง Excel ของหน้าทะเบียน (2026-09-25 ตามที่ผู้ใช้ขอ) — ตารางกว้าง คอลัมน์ใกล้เคียง Excel เดิม ข้อมูล/
 * filter/sort/permission ชุดเดียวกับมุมมองการ์ด (renderRegistryListBody_) ทุกประการ ไม่มีฐานข้อมูล/schema ใหม่
 * (ตามที่ผู้ใช้กำชับ) Header ติดด้านบน (sticky) + freeze คอลัมน์แรก 3 คอลัมน์ด้วย CSS ล้วน ไม่ใช้ JS
 * Monthly Snapshot (monthlySnapshot, optional — คำนวณจาก StatusHistory จริงใน buildMonthlyStateSnapshot_)
 * แสดงเฉพาะตอน rp.monthly==='1' (ปิดเป็นค่าเริ่มต้น กันคำนวณหนักเกินจำเป็นทุกครั้งที่เปิดหน้า)
 */
function renderRegistryExcelViewBody_(ss, pageResult, rp, totalAllCount, bucketCounts, baseUrl, flashMessage, stationsMap, monthlySnapshot, fyOptions) {
  var flashHtml = flashMessage ? '<div class="success-banner">' + escapeHtml_(flashMessage) + '</div>' : '';
  var viewToggleHtml = renderRegistryViewToggle_(rp, baseUrl);

  var allWorks = readSheetAsObjects_(ss.getSheetByName(SHEET.WORKS));
  var allStates = listStationsSorted_(ss);
  var distinctResp = distinctValues_(allWorks, 'current_owner_org');
  var distinctOrg = distinctValues_(allWorks, 'org_from');
  var distinctPosition = distinctValues_(allWorks, 'position');
  var distinctSpecialty = distinctValues_(allWorks, 'specialty');
  var provinceList = getSettingList_(ss, 'district11_provinces', ['นครศรีธรรมราช', 'กระบี่', 'พังงา', 'ภูเก็ต', 'สุราษฎร์ธานี', 'ระนอง', 'ชุมพร']);

  var stateOptions = '<option value="">ทุกสถานะ</option>' + allStates.map(function (s) {
    var sel = rp.state === s.station_key ? ' selected' : '';
    return '<option value="' + escapeHtml_(s.station_key) + '"' + sel + '>' + escapeHtml_(s.station_order) + ' ' + escapeHtml_(s.station_name) + '</option>';
  }).join('');
  var respOptions = '<option value="">ทุกผู้รับผิดชอบ</option>' + distinctResp.map(function (o) {
    return '<option value="' + escapeHtml_(o) + '"' + (rp.resp === o ? ' selected' : '') + '>' + escapeHtml_(o) + '</option>';
  }).join('');
  var orgOptions = '<option value="">ทุกหน่วยงาน</option>' + distinctOrg.map(function (o) {
    return '<option value="' + escapeHtml_(o) + '"' + (rp.org === o ? ' selected' : '') + '>' + escapeHtml_(o) + '</option>';
  }).join('');
  var positionOptions = '<option value="">ทุกตำแหน่ง</option>' + distinctPosition.map(function (o) {
    return '<option value="' + escapeHtml_(o) + '"' + (rp.position === o ? ' selected' : '') + '>' + escapeHtml_(o) + '</option>';
  }).join('');
  var specialtyOptions = '<option value="">ทุกด้าน</option>' + distinctSpecialty.map(function (o) {
    return '<option value="' + escapeHtml_(o) + '"' + (rp.specialty === o ? ' selected' : '') + '>' + escapeHtml_(o) + '</option>';
  }).join('');
  var provinceOptions = '<option value="">ทุกจังหวัด</option>' + provinceList.map(function (p) {
    return '<option value="' + escapeHtml_(p) + '"' + (rp.province === p ? ' selected' : '') + '>' + escapeHtml_(p) + '</option>';
  }).join('');
  var fyOptions_ = '<option value="">ทุกปีงบประมาณ</option>' + (fyOptions || []).map(function (fy) {
    return '<option value="' + escapeHtml_(fy) + '"' + (rp.fy === fy ? ' selected' : '') + '>' + escapeHtml_(fy) + '</option>';
  }).join('');
  var monthOptions = '<option value="">ทุกเดือน</option>' + THAI_MONTHS_.map(function (name, i) {
    var val = String(i + 1);
    return '<option value="' + val + '"' + (rp.month === val ? ' selected' : '') + '>' + escapeHtml_(name) + '</option>';
  }).join('');
  var perOptions = REGISTRY_PER_PAGE_OPTIONS_.map(function (n) {
    return '<option value="' + n + '"' + (rp.per === n ? ' selected' : '') + '>' + n + ' รายการ/หน้า</option>';
  }).join('');

  // สรุป "ตัวกรองที่ใช้งาน" แบบอ่านง่าย (2026-10-07 ตามที่ผู้ใช้ขอ ข้อ 4) — ใช้ label จริงจากค่าที่เลือกไว้แล้ว
  // (stationsMap สำหรับ state, ไม่สร้างข้อความใหม่) แสดงได้แม้ Filter จะถูกยุบอยู่
  var activeFilterLabels = [];
  if (rp.q) activeFilterLabels.push('ค้นหา: ' + rp.q);
  if (rp.state) {
    var stateSt = stationsMap[rp.state];
    activeFilterLabels.push('State: ' + (stateSt ? stateSt.station_order + ' ' + stateSt.station_name : rp.state));
  }
  if (rp.resp) activeFilterLabels.push('ผู้รับผิดชอบ: ' + rp.resp);
  if (rp.org) activeFilterLabels.push('หน่วยงาน: ' + rp.org);
  if (rp.position) activeFilterLabels.push('ตำแหน่ง: ' + rp.position);
  if (rp.specialty) activeFilterLabels.push('ด้าน: ' + rp.specialty);
  if (rp.province) activeFilterLabels.push('จังหวัด: ' + rp.province);
  if (rp.fy) activeFilterLabels.push('ปีงบ: ' + rp.fy);
  if (rp.month) activeFilterLabels.push('เดือน: ' + (THAI_MONTHS_[Number(rp.month) - 1] || rp.month));
  var hasActiveFilter = activeFilterLabels.length > 0;
  var clearFilterUrl = baseUrl + '?page=registry&view=excel';

  var filterFormHtml = '' +
    '<form method="get" target="_top" action="' + baseUrl + '" class="excel-toolbar-form">' +
    '<input type="hidden" name="page" value="registry"><input type="hidden" name="view" value="excel">' +
    '<div class="field-row">' +
    '<div class="field"><label>ค้นหา</label><input class="input" type="text" name="q" value="' + escapeHtml_(rp.q) +
    '" placeholder="เลขทะเบียน / ชื่อ / นามสกุล / หน่วยงาน / จังหวัด / เลขา / ทีม"></div>' +
    '</div>' +
    '<div class="field-row">' +
    '<div class="field"><label>สถานะ</label><select class="input" name="state">' + stateOptions + '</select></div>' +
    '<div class="field"><label>ผู้รับผิดชอบ</label><select class="input" name="resp">' + respOptions + '</select></div>' +
    '</div>' +
    '<div class="field-row">' +
    '<div class="field"><label>หน่วยงาน</label><select class="input" name="org">' + orgOptions + '</select></div>' +
    '<div class="field"><label>ตำแหน่ง</label><select class="input" name="position">' + positionOptions + '</select></div>' +
    '</div>' +
    '<div class="field-row">' +
    '<div class="field"><label>ด้าน</label><select class="input" name="specialty">' + specialtyOptions + '</select></div>' +
    '<div class="field"><label>จังหวัด</label><select class="input" name="province">' + provinceOptions + '</select></div>' +
    '</div>' +
    '<div class="field-row">' +
    '<div class="field"><label>ปีงบประมาณ</label><select class="input" name="fy">' + fyOptions_ + '</select></div>' +
    '<div class="field"><label>เดือนที่รับเรื่อง</label><select class="input" name="month">' + monthOptions + '</select></div>' +
    '</div>' +
    '<div class="field-row">' +
    '<div class="field"><label>แสดง</label><select class="input" name="per">' + perOptions + '</select></div>' +
    '</div>' +
    '<div class="checkbox-row"><label><input type="checkbox" name="monthly" value="1"' + (rp.monthly === '1' ? ' checked' : '') +
    '> แสดง State รายเดือน (คำนวณจากประวัติจริง — โหลดช้าลงถ้าเปิด)</label></div>' +
    '<div class="excel-toolbar-buttons">' +
    '<button class="btn-primary" type="submit">ค้นหา/กรอง</button>' +
    '<a class="btn-outline" target="_top" href="' + baseUrl + '?page=registry&view=excel">ล้างตัวกรอง</a>' +
    '</div>' +
    '</form>';

  // สรุปแถบเครื่องมือ (2026-10-06 ตามที่ผู้ใช้ขอ: จำนวนรายการ + สรุปการเรียง + ปุ่ม Export) — แยกจากฟอร์ม filter
  var sortLabelMap = { tracking_no: 'เลขทะเบียน', owner: 'ชื่อ-สกุล', state: 'State ปัจจุบัน', current_owner_org: 'ผู้รับผิดชอบปัจจุบัน',
    updated_at: 'วันที่อัปเดตล่าสุด', received_date: 'วันที่ลงรับ', org_from: 'หน่วยงาน', work_title: 'ชื่อผลงาน' };
  var sortSummaryText = rp.sort && sortLabelMap[rp.sort]
    ? 'เรียงตาม ' + sortLabelMap[rp.sort] + ' (' + (rp.dir === 'asc' ? 'น้อย→มาก' : 'มาก→น้อย') + ')'
    : 'ไม่ได้เรียง (ลำดับล่าสุดก่อน)';
  var csvExportQuery = buildRegistryQuery_(rp, { p: 1 }) + '&export=csv';
  var xlsxExportQuery = buildRegistryQuery_(rp, { p: 1 }) + '&export=xlsx';
  // target="_blank" + class "export-download" — แก้บั๊กจริงที่เจอ (2026-10-06): target="_top" นำทาง top-level
  // browsing context ไปยัง URL ที่ตอบกลับเป็นไฟล์ (ไม่ใช่หน้า HTML) จาก iframe sandbox ของ HtmlService ทำให้
  // Google เข้าใจผิดว่าต้องพรีวิวไฟล์ผ่าน Google ไดรฟ์ แล้วเจอ "ไม่สามารถเปิดไฟล์ได้" — ต้องมี class
  // export-download ให้ GIS_AUTH_SCRIPT_ แนบ auth token ให้ด้วย (เดิมมันจับเฉพาะ a[target="_top"])
  var toolbarMetaHtml = '<div class="excel-toolbar-meta">' +
    '<span class="excel-toolbar-count">ทั้งหมด ' + pageResult.totalItems + ' รายการ' + (pageResult.totalItems !== totalAllCount ? ' (จาก ' + totalAllCount + ')' : '') + '</span>' +
    '<span class="excel-toolbar-sort">' + escapeHtml_(sortSummaryText) + '</span>' +
    '<a id="xlsx-export-btn" class="btn-primary excel-export-primary export-download" target="_blank" href="' + baseUrl + '?' + xlsxExportQuery + '">ดาวน์โหลด Excel (.xlsx)</a>' +
    '<a class="btn-outline export-download" target="_blank" href="' + baseUrl + '?' + csvExportQuery + '">ดาวน์โหลด CSV</a>' +
    '</div>' +
    EXCEL_EXPORT_LOADING_SCRIPT_;

  // ทำดัชนี order -> station ไว้ล่วงหน้า ใช้ทั้งคอลัมน์ State ปัจจุบัน และคอลัมน์รายเดือน (ไม่ query ซ้ำต่อแถว)
  var orderToStation = {};
  Object.keys(stationsMap).forEach(function (key) { orderToStation[String(stationsMap[key].station_order)] = stationsMap[key]; });
  function stateCellHtml(orderText) {
    if (!orderText) return '<span class="excel-state-empty">-</span>';
    var st = orderToStation[String(orderText)];
    if (!st) return escapeHtml_(orderText);
    var tone = subStatusToneClass_(st.station_name);
    return '<span class="excel-state-badge pub-hero-sub-' + tone + '">' + escapeHtml_(orderText) + '</span>';
  }

  // Filter ที่หัวคอลัมน์แบบ Excel AutoFilter (2026-10-06 ตามที่ผู้ใช้ขอข้อ 5 ระดับ 2) — <details> ล้วน ไม่มี JS
  // เลือกค่าเดียวต่อครั้ง (ไม่ใช่ checkbox หลายค่าแบบ Excel จริง — ข้อจำกัดของระบบที่ไม่ใช้ JS/AJAX ทั้งระบบ)
  function thFilterPopupHtml(field, currentValue, values) {
    var items = '<a target="_top" class="th-filter-item' + (!currentValue ? ' active' : '') +
      '" href="' + baseUrl + '?' + buildRegistryQuery_(rp, (function () { var o = { p: 1 }; o[field] = ''; return o; })()) + '">(ทั้งหมด)</a>';
    items += values.map(function (v) {
      var o = { p: 1 }; o[field] = v;
      return '<a target="_top" class="th-filter-item' + (currentValue === v ? ' active' : '') + '" href="' + baseUrl + '?' + buildRegistryQuery_(rp, o) + '">' + escapeHtml_(v) + '</a>';
    }).join('');
    return '<details class="th-filter"><summary title="กรองคอลัมน์นี้">&#9662;</summary><div class="th-filter-list">' + items + '</div></details>';
  }

  var monthlyHeadHtml = monthlySnapshot ? monthlySnapshot.months.map(function (m) { return '<th class="excel-col-month">' + escapeHtml_(m) + '</th>'; }).join('') : '';
  var theadHtml = '<tr>' +
    '<th class="excel-col-no excel-freeze excel-freeze-1">ลำดับ</th>' +
    '<th class="excel-freeze excel-freeze-2">' + registrySortHeaderInnerHtml_('เลขทะเบียน', 'tracking_no', rp, baseUrl) + '</th>' +
    '<th class="excel-col-wide excel-freeze excel-freeze-3">' + registrySortHeaderInnerHtml_('ชื่อ-สกุล', 'owner', rp, baseUrl) + '</th>' +
    '<th>ตำแหน่ง' + thFilterPopupHtml('position', rp.position, distinctPosition) + '</th>' +
    '<th>ด้าน' + thFilterPopupHtml('specialty', rp.specialty, distinctSpecialty) + '</th>' +
    '<th>จังหวัด' + thFilterPopupHtml('province', rp.province, provinceList) + '</th>' +
    '<th>' + registrySortHeaderInnerHtml_('วันที่ลงรับ', 'received_date', rp, baseUrl) + '</th>' +
    '<th>ทีม</th><th>เลขา</th>' +
    '<th class="excel-col-wide">' + registrySortHeaderInnerHtml_('หน่วยงาน', 'org_from', rp, baseUrl) + thFilterPopupHtml('org', rp.org, distinctOrg) + '</th>' +
    '<th>' + registrySortHeaderInnerHtml_('State ปัจจุบัน', 'state', rp, baseUrl) + '</th>' +
    '<th class="excel-col-wide">' + registrySortHeaderInnerHtml_('ผู้รับผิดชอบปัจจุบัน', 'current_owner_org', rp, baseUrl) + thFilterPopupHtml('resp', rp.resp, distinctResp) + '</th>' +
    '<th>' + registrySortHeaderInnerHtml_('วันที่อัปเดตล่าสุด', 'updated_at', rp, baseUrl) + '</th>' +
    monthlyHeadHtml +
    '<th>จัดการ</th></tr>';

  var startIndex = (pageResult.page - 1) * pageResult.perPage;
  var rows = pageResult.items.map(function (w, i) {
    var ownerName = (w.title_name || '') + (w.first_name || '') + ' ' + (w.last_name || '');
    var station = stationsMap[w.current_station_key];
    var stateText = station ? station.station_order : w.current_station_key;
    var monthlyCellsHtml = monthlySnapshot
      ? (monthlySnapshot.rows[w.work_id] || []).map(function (orderText) { return '<td class="excel-col-month">' + stateCellHtml(orderText) + '</td>'; }).join('')
      : '';
    return '<tr>' +
      '<td class="excel-col-no excel-freeze excel-freeze-1">' + (startIndex + i + 1) + '</td>' +
      '<td class="excel-freeze excel-freeze-2">' + escapeHtml_(w.tracking_no) + '</td>' +
      '<td class="excel-col-wide excel-freeze excel-freeze-3">' + escapeHtml_(ownerName) + '</td>' +
      '<td>' + escapeHtml_(w.position || '-') + '</td>' +
      '<td>' + escapeHtml_(w.specialty || '-') + '</td>' +
      '<td>' + escapeHtml_(w.province || '-') + '</td>' +
      '<td>' + escapeHtml_(formatDateTh_(w.received_date)) + '</td>' +
      '<td>' + escapeHtml_(w.legacy_team || '-') + '</td>' +
      '<td>' + escapeHtml_(w.secretary || '-') + '</td>' +
      '<td class="excel-col-wide">' + escapeHtml_(w.org_from || '-') + '</td>' +
      '<td>' + stateCellHtml(stateText) + '</td>' +
      '<td class="excel-col-wide">' + escapeHtml_(w.current_owner_org || '-') + '</td>' +
      '<td>' + escapeHtml_(formatDateTh_(w.updated_at)) + '</td>' +
      monthlyCellsHtml +
      '<td><a class="btn-action btn-action-primary btn-action-sm" target="_top" href="' + baseUrl +
      '?page=detail&id=' + encodeURIComponent(w.work_id) + '">ดูรายละเอียด</a></td>' +
      '</tr>';
  }).join('');

  var tableHtml = pageResult.items.length
    ? '<div class="excel-table-scroll"><table class="excel-table"><thead>' + theadHtml + '</thead><tbody>' + rows + '</tbody></table></div>'
    : '<div class="empty">ไม่พบรายการที่ตรงกับเงื่อนไข</div>';

  var pagerHtml = '';
  if (pageResult.totalItems > 0) {
    var hasFilter = rp.q || rp.state || rp.resp || rp.org || rp.result || rp.bucket || rp.position || rp.specialty || rp.province || rp.fy || rp.month;
    var prevLink = pageResult.page > 1
      ? '<a target="_top" href="' + baseUrl + '?' + buildRegistryQuery_(rp, { p: pageResult.page - 1 }) + '">&larr; ก่อนหน้า</a>'
      : '<span class="muted-link">&larr; ก่อนหน้า</span>';
    var nextLink = pageResult.page < pageResult.totalPages
      ? '<a target="_top" href="' + baseUrl + '?' + buildRegistryQuery_(rp, { p: pageResult.page + 1 }) + '">ถัดไป &rarr;</a>'
      : '<span class="muted-link">ถัดไป &rarr;</span>';
    pagerHtml = '<div class="pager">' + prevLink +
      '<span>หน้า ' + pageResult.page + ' / ' + pageResult.totalPages + ' (ทั้งหมด ' + pageResult.totalItems + ' รายการ' +
      (hasFilter ? ' จาก ' + totalAllCount : '') + ')</span>' + nextLink + '</div>';
  }

  // ยุบ/ขยาย Filter ได้ (2026-10-07 ตามที่ผู้ใช้ขอ) — <details>/<summary> ล้วน ไม่มี JS/localStorage (ตั้งใจ
  // ไม่จำสถานะข้ามหน้า — ตามที่ผู้ใช้บอกว่า "ไม่จำเป็น ถ้าทำให้ซับซ้อน") ปิดเป็นค่าเริ่มต้นเสมอทุกครั้งที่โหลด
  // หน้า แม้จะมี filter ใช้งานอยู่ก็ตาม — badge/สรุปตัวกรอง + ปุ่มล้างด่วน อยู่ในแถบ summary เห็นได้แม้ยุบอยู่
  var filterSummaryBarHtml = '' +
    '<summary class="excel-filter-summary">' +
    '<span class="excel-filter-summary-title">&#128269; ค้นหา / ตัวกรอง</span>' +
    (hasActiveFilter ? '<span class="excel-filter-badge">ใช้งาน ' + activeFilterLabels.length + ' ตัวกรอง</span>' : '') +
    '</summary>' +
    (hasActiveFilter ? '<div class="excel-filter-active-summary">' + escapeHtml_(activeFilterLabels.join(' • ')) +
      ' <a target="_top" class="excel-filter-quickclear" href="' + clearFilterUrl + '">ล้างตัวกรอง</a></div>' : '');

  return flashHtml + viewToggleHtml +
    '<details class="excel-filter-details">' + filterSummaryBarHtml + filterFormHtml + '</details>' +
    toolbarMetaHtml +
    '<div class="excel-sheet">' + tableHtml + '</div>' +
    pagerHtml;
}

/** สถานะ sort ครั้งถัดไปของคอลัมน์ (2026-10-06 ตามที่ผู้ใช้ขอ — เพิ่ม "คลิกครั้งที่ 3 = reset/ไม่เรียง" จาก
 *  เดิมที่สลับแค่ asc/desc วนไปเรื่อยๆ): ไม่ได้เรียงอยู่ -> asc, เรียง asc อยู่ -> desc, เรียง desc อยู่ -> reset
 *  (sort='' ทำให้ buildRegistryQuery_ ไม่ใส่ sort/dir ใน query เลย กลับไปลำดับเริ่มต้นทันที) */
function registrySortNextState_(col, rp) {
  var isActive = rp.sort === col;
  if (!isActive) return { sort: col, dir: 'asc', isActive: false };
  if (rp.dir === 'asc') return { sort: col, dir: 'desc', isActive: true };
  return { sort: '', dir: 'asc', isActive: true };
}

/** ลิงก์เรียง (ไม่มี &lt;th&gt; ครอบ) — reuse ร่วมกับ registrySortHeaderHtml_ เดิมที่คืน &lt;th&gt; เต็ม ใช้ตอนต้องคุม
 *  class ของ &lt;th&gt; เอง (เช่น excel-freeze) ที่มุมมอง Excel */
function registrySortHeaderInnerHtml_(label, col, rp, baseUrl) {
  var next = registrySortNextState_(col, rp);
  var arrow = next.isActive ? (rp.dir === 'asc' ? ' &#9650;' : ' &#9660;') : '';
  return '<a class="th-sort-link' + (next.isActive ? ' th-sort-active-link' : '') + '" target="_top" href="' + baseUrl + '?' +
    buildRegistryQuery_(rp, { sort: next.sort, dir: next.dir, p: 1 }) + '">' + escapeHtml_(label) + arrow + '</a>';
}

/** หัว th กดเรียงได้ของหน้าทะเบียน (2026-09-24 ตามที่ผู้ใช้ขอ, 2026-10-06 เพิ่ม reset คลิกที่ 3) — ลิงก์ GET
 *  ธรรมดา ไม่มี JS คลิกครั้งแรกเรียง asc, คลิกซ้ำสลับ desc, คลิกที่ 3 กลับไปไม่เรียง (sortRegistryWorks_ เดิม) */
function registrySortHeaderHtml_(label, col, rp, baseUrl) {
  var next = registrySortNextState_(col, rp);
  var arrow = next.isActive ? (rp.dir === 'asc' ? ' &#9650;' : ' &#9660;') : '';
  return '<th' + (next.isActive ? ' class="th-sort-active"' : '') + '>' +
    '<a class="th-sort-link" target="_top" href="' + baseUrl + '?' + buildRegistryQuery_(rp, { sort: next.sort, dir: next.dir, p: 1 }) + '">' +
    escapeHtml_(label) + arrow + '</a></th>';
}

/** ค่าไม่ซ้ำของฟิลด์หนึ่งจาก list of object (ไม่รวมค่าว่าง) — ใช้ทำตัวเลือก dropdown filter ของหน้าทะเบียน */
function distinctValues_(rows, field) {
  var seen = {};
  var out = [];
  rows.forEach(function (r) {
    var v = r[field];
    if (v && !seen[v]) { seen[v] = true; out.push(v); }
  });
  return out.sort();
}

/** หน้าค้นหา — ช่องค้นหา (GET) + ผลลัพธ์ (ค้นหาแล้วครอบคลุมทุกหน่วยงาน, ไม่ค้นหาแสดงเฉพาะหน่วยงานตน) */
function renderSearchBody_(org, query, results, stationsMap, baseUrl) {
  var q = escapeHtml_(query || '');
  var listHtml = results.length
    ? renderSearchResultList_(results, stationsMap, baseUrl)
    : '<div class="empty">' + (query ? 'ไม่พบรายการที่ตรงกับ "' + q + '"' : 'ไม่มีงานของหน่วยงานนี้ในขณะนี้') + '</div>';

  return '' +
    '<form method="get" target="_top" action="' + baseUrl + '" class="search-form">' +
    '<input type="hidden" name="page" value="search">' +
    '<input class="input" type="text" name="q" value="' + q + '" placeholder="เลขติดตาม / ชื่อ-สกุล / ชื่อผลงาน">' +
    '<button class="btn-primary" type="submit">ค้นหา</button>' +
    '</form>' +
    '<p class="scope-note">' + (query ? 'ผลการค้นหาทุกหน่วยงาน' : 'งานของหน่วยงาน: <b>' + escapeHtml_(org) + '</b>') + '</p>' +
    '<div class="search-results-list">' + listHtml + '</div>';
}

/**
 * การ์ดผลการค้นหาแบบเต็ม (หน้า staff "ค้นหา" เท่านั้น 2026-09-24 — ต่างจาก renderWorkList_ ที่ใช้ร่วมกับ
 * การ์ดย่อบน Dashboard ด้วย ไม่แก้ตัวนั้นตรงๆ กันกระทบพื้นที่จำกัดของ Dashboard) แสดง: ชื่อเจ้าของผลงาน(เด่นสุด)
 * -> เลขทะเบียน(รอง) -> หน่วยงาน -> สถานะ(badge, รหัส+ชื่อ station จริงจาก WorkflowStates ไม่ใช่แค่ bucket กว้างๆ)
 * -> ปุ่มดูรายละเอียด/ติดตาม — field ที่ใช้ยืนยันจากของจริงในระบบ (ไม่มี registration_no/owner_name/organization
 * ตรงๆ ตามชื่อที่ขอมา): tracking_no, title_name+first_name+last_name, org_from, current_station_key
 */
function renderSearchResultList_(works, stationsMap, baseUrl) {
  return works.map(function (w) {
    var cls = STATUS_PILL_CLASS_[w.current_status_public] || 'pending';
    var station = stationsMap[w.current_station_key];
    var label = station
      ? (station.station_order + ' ' + splitStationNameDesc_(station.station_name).main)
      : (PUBLIC_STATUS_LABELS[w.current_status_public] || w.current_status_public || '-');
    var ownerName = ((w.title_name || '') + (w.first_name || '') + ' ' + (w.last_name || '')).trim();
    return '' +
      '<a class="search-result-card" target="_top" href="' + baseUrl + '?page=detail&id=' + encodeURIComponent(w.work_id) + '">' +
      '<div class="search-result-owner">' + escapeHtml_(ownerName || '-') + '</div>' +
      '<div class="search-result-tracking">เลขทะเบียน ' + escapeHtml_(w.tracking_no || '-') + '</div>' +
      '<div class="search-result-org"><span class="search-result-org-label">หน่วยงาน</span> ' + escapeHtml_(w.org_from || '-') + '</div>' +
      '<div class="search-result-footer">' +
      '<span class="pill pill-' + cls + '">' + escapeHtml_(label) + '</span>' +
      '<span class="search-result-cta">ดูรายละเอียด/ติดตาม &rarr;</span>' +
      '</div>' +
      '</a>';
  }).join('');
}

/**
 * หน้ารายละเอียดงาน (staff, login แล้ว) — 2026-09-24 ปรับเป็น "หน้าติดตามความคืบหน้า" ตามที่ผู้ใช้ขอ reuse
 * building block เดียวกับหน้าสาธารณะทั้งหมด (buildPublicResultData_/renderPublicTimeline_) ต่างแค่ 2 จุด:
 * (1) ชื่อเจ้าของผลงานไม่ mask (staff login แล้ว มีสิทธิ์เห็นชื่อจริง) (2) เก็บ log ละเอียดทุกแถวจริงไว้ต่างหาก
 * ด้านล่าง (ใครทำอะไรเมื่อไร+หมายเหตุ) ไม่ลบทิ้ง — ตัดออกจากหน้านี้เฉพาะการแสดงผล: เลขบัตรประชาชน/เบอร์โทร/
 * อีเมล/ระดับ/ผู้ดำเนินการล่าสุด (คอลัมน์เดิมในชีตยังอยู่ครบ ไม่ได้ลบข้อมูลจริง)
 */
function renderWorkDetailBody_(ss, work, history, stationsMap, baseUrl, user, errors, dueDateErrors, stepErrors, stepPrevValues, stepSuccessMessage) {
  var ownerName = ((work.title_name || '') + (work.first_name || '') + ' ' + (work.last_name || '')).trim();
  var data = buildPublicResultData_(ss, work);
  var backHref = baseUrl + '?page=search';

  // 2026-11-04 — requirement ใหม่ "Workflow Workspace" ส่วน A (Header): ไอคอน+ชื่อหน้า ซ้าย, "← กลับ" ขวา
  // พื้นขาว/compact — reuse โครง .owner-page-header/.owner-back-link เดิม (สี/ระยะห่างตรงตามที่ขอ: navy เข้ม,
  // compact, ไม่สูงเกินไป) แทนการสร้าง header ใหม่ซ้ำ ย้ายลิงก์ "กลับหน้าค้นหา" (เดิมอยู่ท้ายหน้า) มาไว้ตรงนี้แทน
  var swfHeaderHtml = '' +
    '<div class="swf-header"><div class="swf-header-title"><span class="swf-header-icon">&#128100;</span>' +
    'Staff &ndash; กระบวนการดำเนินงาน (Workflow)</div>' +
    '<a class="swf-back-btn" target="_top" href="' + backHref + '">&larr; กลับ</a></div>';

  // ลำดับหัวหน้า (2026-09-24 ตามที่ผู้ใช้ขอ): ชื่อเจ้าของผลงาน (เด่นสุด) -> เลขทะเบียน (รอง, muted) -> ชื่อผลงาน
  var nameBlockHtml = '' +
    '<div class="pub-name-block">' +
    '<div class="pub-name-owner">' + escapeHtml_(ownerName || '-') + '</div>' +
    '<div class="pub-name-tracking">เลขทะเบียน ' + escapeHtml_(work.tracking_no) + '</div>' +
    '<div class="pub-name-title">ชื่อผลงาน: ' + escapeHtml_(work.work_title || '-') + '</div>' +
    '</div>';

  // 2026-11-04 — ส่วน B "Summary Row" ใหม่ (requirement ใหม่): 4 กล่องแนวนอน ตำแหน่ง/สาขา/หน่วยงาน/จังหวัด
  // (icon ซ้าย/label เล็ก/value หนา/พื้นฟ้าอ่อน) แทนที่รูปแบบ label-value แถวเดียวเดิม (compactInfoHtml เดิม)
  // ประธาน/เลขา (ข้อกำหนดรอบก่อนหน้า ยังต้องมี) ย้ายไปแสดงเป็นแถว label-value ปกติต่อท้ายกล่อง 4 ใบนี้แทน (ไม่ได้
  // ตัดออก) ประธาน/เลขามาจาก committee_code จริง (findChairAndSecretaryByCommitteeCode_ เดิม ไม่สร้าง mapping ใหม่)
  var chairSecretary = findChairAndSecretaryByCommitteeCode_(ss, work.committee_code);
  var summaryBoxesHtml = '' +
    '<div class="swf-summary-grid">' +
    [
      { icon: '&#128188;', label: 'ตำแหน่ง', value: work.position },
      { icon: '&#129504;', label: 'สาขา', value: work.specialty },
      { icon: '&#127973;', label: 'หน่วยงาน', value: work.org_from },
      { icon: '&#128205;', label: 'จังหวัด', value: work.province },
    ].map(function (b) {
      return '<div class="swf-summary-box"><span class="swf-summary-icon">' + b.icon + '</span>' +
        '<div><div class="swf-summary-label">' + escapeHtml_(b.label) + '</div>' +
        '<div class="swf-summary-value">' + escapeHtml_(b.value || '-') + '</div></div></div>';
    }).join('') +
    '</div>' +
    '<div class="pub-details-body" style="margin-top:4px">' +
    renderPubOwnerRow_('ประธานคณะกรรมการ', chairSecretary.chairName) +
    renderPubOwnerRow_('เลขา', chairSecretary.secretaryName) +
    '</div>';

  // 2026-11-05 — requirement ใหม่ "Side Drawer" ข้อ 1/45: ห้ามมี block "สถานะปัจจุบัน" (renderPubHero_)/
  // "ข้อมูลสำคัญ" (renderPubInfoGrid_)/"สิ่งที่ต้องดำเนินการ" ซ้ำกับตารางขั้นตอนแล้ว — ฟังก์ชันทั้งสองยังไม่ถูกลบ
  // ทิ้ง (ตามธรรมเนียมโปรเจกต์ ใช้ที่หน้า Public/Owner เดิมต่อไปตามปกติ ไม่ถูกแตะ) แค่เลิกเรียกใช้ในหน้า Staff นี้

  // 2026-11-04 รอบ 3 — model กลาง (buildStaffWorkflowModel_) ยังใช้ร่วมกันเหมือนเดิม
  var model = buildStaffWorkflowModel_(ss, work, history, stationsMap, data, user);

  // 2026-11-05 — requirement ใหม่ "ตารางแนวตั้ง 5 คอลัมน์ + Side Drawer ประวัติต่อขั้นตอน" (renderStaffWorkflowRowsTable_)
  // แทนที่ renderStaffWorkflowGrid_ เดิม (ตารางกริดแนวนอน รอบก่อนหน้า — ไม่ถูกเรียกใช้แล้ว ไม่ลบทิ้ง)
  // ข้อ 21/35 — success feedback เล็กๆ (ไม่ใช่ modal) หลัง update สำเร็จ ส่งมาจาก Code.gs ตอน redirect กลับมาหน้านี้
  var stepSuccessHtml = stepSuccessMessage
    ? '<div class="swfg-success-banner">&#10003; ' + escapeHtml_(stepSuccessMessage) + '</div>'
    : '';
  var staffWorkflowTableHtml = stepSuccessHtml + renderStaffWorkflowRowsTable_(ss, work, history, stationsMap, data, user, baseUrl, stepErrors, stepPrevValues, model);
  if (data.isLegacyImportOnly) staffWorkflowTableHtml += renderPubLegacyInfoBox_();

  var noteHtml = data.latestNote
    ? '<div class="pub-note-box"><div class="pub-note-title">หมายเหตุจากผู้รับผิดชอบ</div><p>' + escapeHtml_(data.latestNote) + '</p></div>'
    : '';

  var coverHtml = work.cover_image_url
    ? '<p><a href="' + escapeHtml_(work.cover_image_url) + '" target="_blank" rel="noopener">ดูภาพหน้าปกที่อัปโหลด</a></p>'
    : '';

  // ตั้ง/รีเซ็ตรหัสผ่านเจ้าของผลงาน (Login สำหรับเจ้าของผลงาน, 2026-10-06) — Admin เท่านั้น ค่าเริ่มต้นคือ
  // tracking_no ของงานนี้เอง (ไม่มี field รหัสลับจริงเดิมในระบบ ยืนยันกับผู้ใช้แล้ว) ไม่แสดงรหัสที่ตั้งไว้จริง
  // ในหน้า UI เลย (ข้อ 20 — เก็บแค่ hash ย้อนกลับไม่ได้อยู่แล้วด้วย)
  var ownerCodeErrorHtml = (errors && errors.length)
    ? '<div class="error-banner"><ul>' + errors.map(function (m) { return '<li>' + escapeHtml_(m) + '</li>'; }).join('') + '</ul></div>'
    : '';
  var ownerCodeHtml = (user && user.role === 'Admin') ? '' +
    '<details class="pub-details"><summary>ตั้ง/รีเซ็ตรหัสผ่านเจ้าของผลงาน (Admin)</summary>' +
    '<div class="pub-details-body">' + ownerCodeErrorHtml +
    '<p class="hint">ค่าเริ่มต้นคือเลขทะเบียนของงานนี้เอง (' + escapeHtml_(work.tracking_no) + ') ถ้าต้องการเปลี่ยนให้กรอกรหัสใหม่รูปแบบ 12-345' +
    (work.owner_login_code_hash ? ' — ตอนนี้ตั้งรหัสเฉพาะไว้แล้ว' : '') + '</p>' +
    '<form method="post" action="' + baseUrl + '" class="reg-form" style="border:none;padding:0;">' +
    '<input type="hidden" name="form_action" value="admin_set_owner_code">' +
    '<input type="hidden" name="work_id" value="' + escapeHtml_(work.work_id) + '">' +
    '<div class="field"><label>รหัสใหม่</label>' +
    '<input class="input" name="owner_login_code" placeholder="12-345" maxlength="6" pattern="\\d{2}-\\d{3}"></div>' +
    '<button type="submit" class="btn-outline">บันทึกรหัสใหม่</button>' +
    '</form>' +
    (work.owner_login_code_hash ? '' +
      '<form method="post" action="' + baseUrl + '" class="reg-form" style="border:none;padding:8px 0 0;">' +
      '<input type="hidden" name="form_action" value="admin_reset_owner_code">' +
      '<input type="hidden" name="work_id" value="' + escapeHtml_(work.work_id) + '">' +
      '<button type="submit" class="btn-outline">รีเซ็ตกลับเป็นค่าเริ่มต้น (เลขทะเบียน)</button>' +
      '</form>' : '') +
    '</div></details>' : '';

  // 2026-10-21 ตามข้อแก้ไขผู้บริหาร ข้อ 8 — งานเก่าที่ผลรอบ 1 เป็น "แก้ไข 2/6 เดือน" (s7_2/s7_3) แต่ยังไม่มี
  // revision_due_date (transition เกิดก่อนมี feature นี้) ให้ Admin กำหนดย้อนหลังได้ที่นี่ (ไม่ใช่ state
  // transition ใหม่ — reuse getResolvedFirstRoundStep_/REVISION_DUE_DATE_STATE_KEYS_ เดิมจาก buildOwnerRevisionTimeline_
  // ไม่สร้าง logic คำนวณคู่ขนาน) แสดงตลอดเส้นทางแก้ไข ไม่ใช่แค่ตอนปัจจุบันอยู่ 7.2/7.3 เป๊ะ (ต่างจาก resultCard
  // ของ Owner ที่หายไปตอนเข้าสู่ 8.x — ที่นี่ต้องแก้ได้แม้งานเดินไปไกลแล้ว เพราะ Timeline ยัง reference ค่านี้อยู่)
  var dueResolvedStep = getResolvedFirstRoundStep_(data.steps);
  var dueDateErrorHtml = (dueDateErrors && dueDateErrors.length)
    ? '<div class="error-banner"><ul>' + dueDateErrors.map(function (m) { return '<li>' + escapeHtml_(m) + '</li>'; }).join('') + '</ul></div>'
    : '';
  var revisionDueDateHtml = (user && user.role === 'Admin' && dueResolvedStep && REVISION_DUE_DATE_STATE_KEYS_[dueResolvedStep.key]) ? '' +
    '<details class="pub-details"><summary>กำหนด/แก้ไขวันครบกำหนดแก้ไข (Admin)</summary>' +
    '<div class="pub-details-body">' + dueDateErrorHtml +
    '<p class="hint">' + (work.revision_due_date
      ? 'ปัจจุบันตั้งไว้ที่ ' + escapeHtml_(formatDateDDMMYYYYBuddhist_(work.revision_due_date))
      : 'งานนี้ยังไม่เคยกำหนดวันครบกำหนดแก้ไข (อาจเป็นงานเก่าก่อนมี feature นี้)') + '</p>' +
    '<form method="post" action="' + baseUrl + '" class="reg-form" style="border:none;padding:0;">' +
    '<input type="hidden" name="form_action" value="admin_set_revision_due_date">' +
    '<input type="hidden" name="work_id" value="' + escapeHtml_(work.work_id) + '">' +
    '<div class="field"><label>วันครบกำหนดแก้ไข</label>' +
    '<input class="input" type="date" name="revision_due_date" value="' + escapeHtml_(formatDateYYYYMMDD_(work.revision_due_date)) + '" required></div>' +
    '<button type="submit" class="btn-outline">บันทึกวันครบกำหนดแก้ไข</button>' +
    '</form></div></details>' : '';

  // ประวัติละเอียดทุกแถวจริง (ใครทำอะไรเมื่อไร+หมายเหตุ) — พับด้วย <details> ไม่ให้ดูเหมือน log ดิบกลางหน้า
  // + แปล LEGACY_IMPORT_MARKER_ เป็นข้อความอ่านง่าย ไม่โชว์ email ภายในดิบๆ (2026-09-24) ไม่ลบข้อมูลจริง แค่จัดรูปแบบ
  var auditLogHtml = history.length
    ? '<details class="pub-details" id="swf-history"><summary>ดูประวัติการดำเนินการทั้งหมด</summary><div class="pub-details-body">' +
      history.map(function (h) {
        var label = h.action === 'transition'
          ? (stationsMap[h.to_station] ? stationsMap[h.to_station].station_name : h.to_station)
          : (ACTION_LABELS_[h.action] || h.action);
        var actorText = h.action_by === LEGACY_IMPORT_MARKER_ ? 'นำเข้าข้อมูลจากระบบเดิม'
          : ((h.action_by_org || '-') + (h.action_by ? ' (' + h.action_by + ')' : ''));
        return '<div class="pub-audit-item">' +
          '<div class="pub-audit-head"><span>' + escapeHtml_(label) + '</span><span class="pub-audit-date">' + formatDateTh_(h.action_date) + '</span></div>' +
          '<div class="pub-audit-meta">' + escapeHtml_(actorText) + '</div>' +
          (h.note ? '<div class="pub-audit-note">' + escapeHtml_(h.note) + '</div>' : '') +
          (h.revision_reasons ? '<div class="pub-audit-note">เหตุผล: ' + escapeHtml_(h.revision_reasons) + '</div>' : '') +
          // 2026-10-21 ตามข้อแก้ไขผู้บริหาร (ข้อ 9 — audit trail) แสดงวันครบกำหนดแก้ไขที่บันทึกไว้ในประวัติแถวนี้
          // ด้วย (ผู้แก้ไข/วันเวลาแก้ไข มีอยู่แล้วใน actorText/action_date ด้านบนของ item เดียวกัน)
          (h.revision_due_date ? '<div class="pub-audit-note">วันครบกำหนดแก้ไข: ' + escapeHtml_(formatDateDDMMYYYYBuddhist_(h.revision_due_date)) + '</div>' : '') +
          '</div>';
      }).join('') + '</div></details>'
    : '';

  // 2026-11-05 — ข้อ 45 "ห้ามมี History card ใหญ่ใต้ตาราง" (auditLogHtml เดิม พับด้วย <details> ประวัติทุกแถว
  // ทุก action) เลิกแสดงในหน้านี้แล้ว (Side Drawer ต่อขั้นตอน ครอบคลุมความต้องการดูประวัติแล้ว) ตัวแปร auditLogHtml
  // ยังคงคำนวณไว้เหมือนเดิมด้านบน (ไม่ลบทิ้งตามธรรมเนียมโปรเจกต์ เผื่ออ้างอิง/ย้อนกลับภายหลัง) แค่ไม่ถูกต่อเข้า
  // output ที่นี่อีกต่อไป เช่นเดียวกับ infoHtml เดิม ("ข้อมูลเพิ่มเติมสำหรับเจ้าหน้าที่" — ตำแหน่ง/หน่วยงานต้นสังกัด
  // ซ้ำกับ summaryBoxesHtml ด้านบนแล้ว) ที่ไม่สร้างตัวแปรนี้แล้วเลย
  return '' +
    '<div class="pub-compact swf-page">' +
    swfHeaderHtml +
    '<div class="detail-card">' +
    nameBlockHtml + summaryBoxesHtml + staffWorkflowTableHtml +
    noteHtml + coverHtml + ownerCodeHtml + revisionDueDateHtml +
    '<p style="margin-top:12px"><a class="btn-outline" target="_top" href="' + baseUrl + '?page=qrprint&id=' + encodeURIComponent(work.work_id) + '">พิมพ์ QR ใหม่</a></p>' +
    '</div>' +
    '</div>' +
    STAFF_WORKFLOW_TOGGLE_SCRIPT_;
}

/**
 * ส่วน B "ภาพรวม Workflow" เวอร์ชันแนวตั้งของ requirement รอบ 2026-11-03 — ถูกแทนที่ด้วยไดอะแกรมแนวนอน
 * (renderStaffOverviewAndProgress_ ด้านล่าง) ตาม requirement ใหม่ 2026-11-04 (Section C "●──●──●") แล้ว
 * ไม่มีจุดเรียกใช้แล้ว แต่ไม่ได้ลบทิ้ง (ตามธรรมเนียมโปรเจกต์ — เผื่อใช้อ้างอิง/ย้อนกลับภายหลัง)
 */
function renderStaffWorkflowOverviewSection_(fullWithSkips) {
  if (!fullWithSkips) return '';
  return '<div class="owner-tl-section-title">ภาพรวม Workflow</div>' +
    '<div class="owner-tl-wrap"><div class="pub-timeline">' +
    fullWithSkips.map(renderOwnerFullDetailItem_).join('') + '</div></div>';
}

/**
 * Model กลางของหน้า Staff "Workflow Workspace" (2026-11-04) — คำนวณสถานะ/สิทธิ์ครั้งเดียว ให้ทั้งไดอะแกรม
 * แนวนอน (renderStaffOverviewAndProgress_) และตารางรายละเอียด (renderStaffWorkflowTable_) อ่านค่าเดียวกัน
 * (สอดคล้องกับ EXPECTED ARCHITECTURE ที่ผู้ใช้ระบุ — buildStaffWorkflowModel_) ไม่มี business logic ใหม่ ทุก
 * เงื่อนไขยกมาจากของเดิมที่มีอยู่แล้วทั้งหมด (computeEligibleTransitions_/computeSkippedMainSteps_/
 * getResolvedFirstRoundStep_/resolveResponsibleOrg_) ไม่เรียกชีตซ้ำ (work/history/stationsMap/data รับมาจาก
 * caller ที่โหลดมาแล้วครั้งเดียว — ข้อ "PERFORMANCE" ห้าม N+1)
 *
 * mainStepNumbers: อ่านจำนวน "ขั้นตอนหลัก" จริงจาก WorkflowMaster (stationsMap) เสมอ ไม่ fix 10 (ข้อกำหนด
 * ใหม่ "ห้าม fix ว่ามี 7 step หากระบบจริงมี 10 step") — เอาเลขหน้าจุดของทุก station ที่ active มา dedupe+sort
 */
function buildStaffWorkflowModel_(ss, work, history, stationsMap, data, user) {
  var doneMap = {};
  history.forEach(function (h) {
    if (!h.to_station) return;
    if (h.action !== 'registered' && h.action !== 'transition' && h.action !== 'reassigned') return;
    doneMap[h.to_station] = { enteredAt: h.action_date, historyId: h.history_id };
  });

  var skippedMainSteps = computeSkippedMainSteps_(data.steps);
  var currentKey = work.current_station_key;
  var currentStateDef = stationsMap[currentKey];
  var eligibleTransitions = computeEligibleTransitions_(ss, work, currentStateDef, user);
  var resolvedFirstRound = getResolvedFirstRoundStep_(data.steps);
  var allStations = listStationsSorted_(ss).filter(function (s) { return s.active; });

  var mainStepNumSet = {};
  allStations.forEach(function (s) { mainStepNumSet[parseInt(parentStepOrder_(s.station_order), 10)] = true; });
  var mainStepNumbers = Object.keys(mainStepNumSet).map(Number).sort(function (a, b) { return a - b; });
  var currentMainStepNumber = currentStateDef ? (parseInt(parentStepOrder_(currentStateDef.station_order), 10) || 0) : 0;

  // 2026-11-05 — requirement ใหม่ "คอลัมน์ ประวัติการแก้ไข + Side Drawer กรอง work_id+stepCode" โหลด AuditLog
  // ของงานนี้ "ครั้งเดียว" ตรงนี้ (ข้อ 28 — ห้ามยิง backend 10 ครั้งนับ history ต่อ step) แล้ว group ตามขั้นตอนหลัก
  // ที่เกี่ยวข้องให้ทุกจุดอ่านค่าเดียวกัน (ตาราง count + Drawer filter) ไม่ query ซ้ำ ไม่สร้าง log system ใหม่ —
  // อ่านจาก AuditLog เดิม (writeAuditLog_, Utils.gs) ที่มีอยู่แล้วจาก performEditStepDate_ (field_changed =
  // "action_date (<to_station>)") และ performSetRevisionDueDate_ (field_changed = "revision_due_date" — ผูกกับ
  // ขั้นตอนหลัก 7 เสมอเพราะ REVISION_DUE_DATE_STATE_KEYS_ มีแค่ s7_2/s7_3 เท่านั้นในระบบจริง ไม่ใช่การเดา)
  var auditRows = readSheetAsObjects_(ss.getSheetByName(SHEET.AUDIT_LOG)).filter(function (a) { return a.work_id === work.work_id; });
  var auditByMainStep = {};
  auditRows.forEach(function (a) {
    var n = null;
    var m = /^action_date \(([^)]+)\)$/.exec(String(a.field_changed || ''));
    if (m && stationsMap[m[1]]) {
      n = parseInt(parentStepOrder_(stationsMap[m[1]].station_order), 10);
    } else if (a.field_changed === 'revision_due_date') {
      n = 7;
    }
    if (!n) return;
    (auditByMainStep[n] = auditByMainStep[n] || []).push(a);
  });
  Object.keys(auditByMainStep).forEach(function (n) {
    auditByMainStep[n].sort(function (a, b) { return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(); });
  });

  // 2026-11-05 รอบ 2 — requirement ใหม่ "Step 2/7 ต้องแสดงผลที่เลือกต่อท้ายชื่อขั้นตอน" ต้องรู้ว่า main step
  // ไหนเป็น "จุดแตกสายจริง" (decision hub) แบบ generic ไม่ hardcode เลข step (ตรวจ code จริงก่อนแก้ — ห้ามเดา)
  // นับจำนวน active transition จริงที่ออกจาก "station เปล่า" ของแต่ละ main step จาก WorkflowTransitions เดิม
  // (โหลดครั้งเดียวที่นี่ ไม่ query ซ้ำต่อแถว) จุดที่มี >1 ทางออกจริง = จุดแตกสายจริง (ปัจจุบันคือ step 3 hub
  // "ส่งเอกสารให้เลขาคณะกรรมการฯ" ที่ตัดสิน ครบถ้วน(3.1)/ไม่ครบถ้วน(3.2) — ไม่ใช่ step 2 "ตรวจสอบเอกสาร" ตามที่
  // requirement เรียก เพราะ s2_s3_1/s2_s3_2 ถูกปิด active จริงจาก migrateAddState3Hub() ไปแล้ว ดูคอมเมนต์เต็มที่
  // renderStaffWorkflowRowsTable_ — และ step 7 "เลขาแจ้งผลการพิจารณามาที่ สนง เขต" เดิม)
  var transitionRows = readSheetAsObjects_(ss.getSheetByName(SHEET.WORKFLOW_TRANSITIONS));
  var branchFromCount = {};
  transitionRows.forEach(function (t) {
    if (!t.active) return;
    branchFromCount[t.from_state] = (branchFromCount[t.from_state] || 0) + 1;
  });

  return {
    isAdmin: user.role === 'Admin', doneMap: doneMap, skippedMainSteps: skippedMainSteps, currentKey: currentKey,
    currentStateDef: currentStateDef, eligibleTransitions: eligibleTransitions, resolvedFirstRound: resolvedFirstRound,
    allStations: allStations, mainStepNumbers: mainStepNumbers, currentMainStepNumber: currentMainStepNumber,
    auditByMainStep: auditByMainStep, branchFromCount: branchFromCount,
  };
}

/** ชื่อฟิลด์ที่แก้ แบบอ่านง่าย (ข้อ 22/23 Drawer "รายการ :: ...") — field_changed ภายในเก็บเป็น
 *  "action_date (<station_key>)"/"revision_due_date" (AuditLog เดิม) ไม่ใช่ข้อความอ่านง่ายตรงๆ */
function swftAuditFieldLabel_(fieldChanged) {
  var s = String(fieldChanged || '');
  if (s.indexOf('action_date') === 0) return 'วันที่ดำเนินการ';
  if (s === 'revision_due_date') return 'วันครบกำหนดแก้ไข';
  return s;
}

/**
 * 2026-11-05 รอบ 2 — ข้อความ/สี "badge ผลที่เลือก" ต่อท้ายชื่อขั้นตอน (requirement ใหม่ ข้อ 4-8) ต่าง
 * OWNER_RESULT_OUTCOME_ เดิม (PublicTrack.gs, ข้อความยาวแบบ Owner-facing "ผ่านการประเมิน" ฯลฯ — ห้ามแก้ Owner
 * View ตามที่ระบุ) ที่นี่ใช้ข้อความสั้นตามที่ requirement นี้ขอตรงๆ ("ผ่าน"/"แก้ไข 2 เดือน" ฯลฯ) คีย์ด้วย
 * station_key จริง (ค่าเดียวกับ StatusHistory.to_station จริง — ข้อ 9 "ใช้ field/result จริง ห้ามเดา") สโคป
 * เฉพาะตาราง Staff นี้เท่านั้น ไม่กระทบ OWNER_RESULT_OUTCOME_/Owner View แต่อย่างใด
 */
var STAFF_STEP_RESULT_BADGE_ = {
  s3_1: { text: 'ครบถ้วน → ส่งเลขา', tone: 'pass' },
  s3_2: { text: 'ไม่ครบถ้วน → ส่งคืนหน่วยงาน', tone: 'fail' },
  s3_3: { text: 'ไม่ครบถ้วน → ส่งคืนหน่วยงาน', tone: 'fail' }, // state เดิมที่เลิกใช้แล้ว (ดู migrateAddState3Hub) เก็บไว้เผื่องานเก่าอ้างถึง
  s7_1: { text: 'ผ่าน', tone: 'pass' },
  s7_2: { text: 'แก้ไข 2 เดือน', tone: 'revision2' },
  s7_3: { text: 'แก้ไข 6 เดือน', tone: 'revision3' },
  s7_4: { text: 'ไม่ผ่าน', tone: 'fail' },
};

/** ชื่อขั้นตอนหลัก (เลขหน้าจุด n) แบบ internal — ไม่ใช้ OWNER_STATE_LABELS_/mainStepNameFor_ (สงวนไว้เฉพาะ
 *  Owner Timeline ตามที่ requirement ห้ามแตะ) หา station "เปล่า" (order===String(n)) ก่อน ถ้าไม่มีใช้ station
 *  ลูกตัวแรกตามลำดับของเลขหลักนั้น (เช่น n=8 ไม่มี "s8" ตรงๆ ใช้ s8_1 แทน) */
function staffMainStepLabel_(n, allStations) {
  var bare = allStations.filter(function (s) { return String(s.station_order) === String(n); })[0];
  if (bare) return splitStationNameDesc_(bare.station_name).main;
  var child = allStations.filter(function (s) { return parentStepOrder_(s.station_order) === String(n); })[0];
  return child ? splitStationNameDesc_(child.station_name).main : 'ขั้นตอนที่ ' + n;
}

/**
 * ส่วน C "ภาพรวมกระบวนการ" (ไดอะแกรมแนวนอน ●──●──●──○──○) + ส่วน D "Progress Card" (วางข้างกัน) ตาม
 * requirement 2026-11-04 — ใช้ model.mainStepNumbers (dynamic จาก WorkflowMaster จริง ไม่ fix จำนวน) สถานะต่อ
 * step หลัก: current ตรง currentMainStepNumber, skipped ถ้า skippedMainSteps[n] (ข้ามจริงตาม state 7 resolve
 * แล้ว ไม่ใช่แค่ยังไม่ถึง), n < current = done, n > current (ไม่ skip) = pending — กฎเดียวกับที่ใช้ทั่วระบบ
 * (reuse ตัวเลขเปรียบเทียบ ไม่ใช่ logic ใหม่) Progress card ใช้ data.progressSummary เดิม (buildProgressSummary_,
 * PublicTrack.gs) ไม่คำนวณซ้ำ — deadline "เป้าหมายแล้วเสร็จ" แสดงเฉพาะงานที่อยู่เส้นทางแก้ไขจริง (s7_2/s7_3) และ
 * มี revision_due_date จริงเท่านั้น (ห้ามสร้างวันที่ประมาณเอง ตามข้อกำหนด)
 */
function renderStaffOverviewAndProgress_(model, stationsMap, data, work) {
  var nodesHtml = '';
  model.mainStepNumbers.forEach(function (n, i) {
    var state = model.skippedMainSteps[String(n)] ? 'skipped'
      : n === model.currentMainStepNumber ? 'current'
      : n < model.currentMainStepNumber ? 'done' : 'pending';
    var label = staffMainStepLabel_(n, model.allStations);
    var statusText = { done: 'เสร็จแล้ว', current: 'กำลังดำเนินการ', pending: 'รอดำเนินการ', skipped: 'ไม่ใช้ในกรณีนี้' }[state];
    var icon = state === 'done' ? '&#10003;' : (state === 'current' ? String(n) : (state === 'skipped' ? '&#10005;' : String(n)));
    if (i > 0) {
      var prevN = model.mainStepNumbers[i - 1];
      var connectorDone = prevN < model.currentMainStepNumber && !model.skippedMainSteps[String(prevN)];
      nodesHtml += '<div class="swf-diagram-connector' + (connectorDone ? ' swf-diagram-connector-done' : '') +
        (state === 'skipped' ? ' swf-diagram-connector-skipped' : '') + '"></div>';
    }
    nodesHtml += '<div class="swf-diagram-node">' +
      '<div class="swf-diagram-circle swf-diagram-circle-' + state + '">' + icon + '</div>' +
      '<div class="swf-diagram-label">' + escapeHtml_(n + '. ' + label) + '</div>' +
      '<div class="swf-diagram-status">(' + statusText + ')</div>' +
      '</div>';
  });

  var overviewHtml = '' +
    '<div class="swf-overview-card"><div class="swf-overview-title">ภาพรวมกระบวนการ</div>' +
    '<div class="swf-diagram">' + nodesHtml + '</div></div>';

  var summary = data.progressSummary;
  var progressHtml = '<div class="swf-progress-card"><div class="swf-progress-title">ความคืบหน้า</div>';
  if (summary) {
    progressHtml += '<div class="swf-progress-percent">' + summary.progressPercent + '%</div>' +
      '<div class="swf-progress-bar-track"><div class="swf-progress-bar-fill" style="width:' + summary.progressPercent + '%"></div></div>' +
      '<div class="swf-progress-text">เสร็จแล้ว ' + summary.completedCount + ' ขั้นตอน จาก ' + summary.totalMainSteps + ' ขั้นตอน</div>';
    // เป้าหมายแล้วเสร็จ — เฉพาะเส้นทางแก้ไขจริง (s7_2/s7_3) ที่มี revision_due_date จริงเท่านั้น ไม่ประมาณเอง
    var resolvedForTarget = model.resolvedFirstRound;
    if (resolvedForTarget && REVISION_DUE_DATE_STATE_KEYS_[resolvedForTarget.key] && work.revision_due_date) {
      progressHtml += '<div class="swf-progress-target">เป้าหมายแล้วเสร็จ :: ' + escapeHtml_(formatDateDDMMYYYYBuddhist_(work.revision_due_date)) + '</div>';
    }
  } else {
    progressHtml += '<div class="swf-progress-text">งานนี้ยุติกระบวนการแล้ว ไม่มี progress ให้แสดง</div>';
  }
  progressHtml += '</div>';

  return '<div class="swf-overview-row">' + overviewHtml + progressHtml + '</div>';
}

/**
 * ส่วน C "ตารางรายละเอียดขั้นตอนและการดำเนินการ" ของหน้า Staff "Workflow เดียว" (2026-11-03 requirement เต็ม —
 * ดูสรุปที่หัวไฟล์ Actions.gs/performStateTransition_/performEditStepDate_ สำหรับ business logic ที่ reuse)
 *
 * 1 แถว = 1 station จริงจาก WorkflowStates (listStationsSorted_ เดิม, Admin.gs) — ไม่ใช่ backbone 1-10 แบบ
 * section B แต่เป็น state จริงทุกตัวรวม sub-state ทศนิยม (7.1-7.4/8.1-8.6/9.1-9.4) ตามข้อ 7/15/16 ("ทุกขั้นตอน
 * ต้องเห็นในตารางเดียว") โหลด WorkflowStates + StatusHistory ของงานนี้ครั้งเดียว (history พารามิเตอร์ที่รับมา
 * คือ getHistoryForWork_ เดิมจาก caller — ไม่ query ซ้ำ, ข้อ 25 ห้าม N+1)
 *
 * สถานะต่อแถว (ลำดับการตรวจ สำคัญ):
 *   1) key === current_station_key -> 'current'
 *   2) เคย "เข้าสู่ state นี้จริง" ตาม StatusHistory (to_station ตรง, action registered/transition/reassigned)
 *      -> 'done' (เอาครั้งล่าสุดถ้าเคยวนกลับมาซ้ำ — ไม่เดา ใช้ประวัติจริงเท่านั้น)
 *   3) อยู่ใน 8.x/9.x และ state 7 resolve แล้วเป็น "ผ่าน/ไม่ผ่าน" (computeSkippedMainSteps_ เดิม จาก
 *      PublicTrack.gs — ใช้ร่วมกับ section B/Owner Dashboard ตัวเดียวกัน ไม่สร้าง logic แยก) -> 'skipped'
 *   4) อื่นๆ -> 'pending'
 *
 * "วันที่ดำเนินการ" ของแถว done = action_date ของ StatusHistory แถวที่พา work เข้าสู่ state นั้น (ความหมาย
 * เดียวกับ enteredAt ที่ buildPublicDetailedSteps_ ใช้อยู่แล้วทั้งระบบ — ข้อ 11 "ห้ามถือว่ากรอกวันที่=เปลี่ยน
 * สถานะ" ตีความว่า: แถว current ไม่มีวันที่ของตัวเองให้แก้ไขตรงๆ (ยังไม่เกิดขึ้นจริง) มีแต่ปุ่ม "ดำเนินการขั้นตอน
 * นี้/บันทึกวันที่" ที่เรียก performStateTransition_ จริง (ย้าย state จริงตาม WorkflowMaster) พร้อมให้เลือก
 * วันที่เอง (ไม่บังคับเป็น "วันนี้" เสมอไป) ส่วนแถว done แก้ได้แค่ "วันที่" ของ StatusHistory ย้อนหลังอย่างเดียว
 * (performEditStepDate_) ไม่มีทางเปลี่ยน state จากตรงนี้ — แยก 2 action ชัดเจนตามข้อ 11
 *
 * สิทธิ์: Admin ทำได้ทุกแถว, เจ้าหน้าที่ทั่วไปทำได้เฉพาะแถวที่หน่วยงานตนเองรับผิดชอบจริง (resolveResponsibleOrg_
 * เดิม) — scoping เดียวกับ computeEligibleTransitions_/performEditStepDate_ ทั้งระบบ ไม่สร้างสิทธิ์ใหม่
 *
 * stepErrors/stepPrevValues (ถ้ามี — ส่งมาจาก doPost, Code.gs ตอน validate ไม่ผ่าน) ใช้ reopen panel เดิมที่
 * กำลังกรอกอยู่พร้อมค่าที่กรอกไว้แล้ว (Edit Mode, pattern เดียวกับ renderTransitionFormBody_ เดิม) — ไม่ reload
 * ไปหน้าอื่น ยังอยู่หน้าเดิม (ข้อ 10 "ห้าม reload ทั้งหน้าถ้าไม่จำเป็น" — ตีความว่าต้องไม่กระเด้งไปหน้า "สแกน QR"/
 * "บันทึกสำเร็จ" แบบเดิม กลับมา render หน้ารายละเอียดนี้ตรงๆ เสมอ ดู Code.gs การ branch return_to==='detail')
 */
var STAFF_ORDER_OUTCOME_TONE_MAP_ = { pass: 'done', revision2: 'revision2', revision3: 'revision3', fail: 'fail' };

/** ไอคอนคอลัมน์ "ขั้นตอน" — heuristic จากคำในชื่อ station จริง (ไม่ใช่ hardcode ต่อ work/ต่อ state_key เจาะจง)
 *  ใช้ Unicode glyph เดิมที่ระบบนี้ใช้อยู่แล้วทั่วไป (ดู NAV_ITEMS_/ไอคอน checkmark ฯลฯ) ไม่เพิ่ม icon library ใหม่ */
function staffStepIcon_(name) {
  name = String(name || '');
  if (name.indexOf('รับเรื่อง') !== -1 || name.indexOf('รับเอกสาร') !== -1) return '&#128229;';
  if (name.indexOf('ตรวจสอบ') !== -1) return '&#128269;';
  if (name.indexOf('ประชุม') !== -1 || name.indexOf('พิจารณา') !== -1) return '&#128101;';
  if (name.indexOf('นัด') !== -1) return '&#128197;';
  if (name.indexOf('แจ้ง') !== -1) return '&#128227;';
  if (name.indexOf('แก้ไข') !== -1) return '&#9999;';
  if (name.indexOf('ส่ง') !== -1) return '&#128228;';
  return '&#128196;';
}

/** ข้อความ+สี badge คอลัมน์ "สถานะ" (Section E คอลัมน์ 5) — current ที่ตรง s7_2/s7_3/s7_4 ใช้ข้อความผล
 *  การพิจารณาจริงแทน "กำลังดำเนินการ" ทั่วไป (ตาม requirement badge: เสร็จแล้ว/กำลังดำเนินการ/รอดำเนินการ/
 *  รอแก้ไข/ไม่ผ่าน/ไม่ใช้ในกรณีนี้) ไม่ใช่ business logic ใหม่ แค่เลือกข้อความแสดงผลจาก state/key ที่มีอยู่แล้ว */
function staffStatusBadgeInfo_(state, key) {
  if (state === 'current') {
    if (key === 's7_2' || key === 's7_3') return { text: 'รอแก้ไข', tone: 'revision' };
    if (key === 's7_4') return { text: 'ไม่ผ่าน', tone: 'fail' };
    return { text: 'กำลังดำเนินการ', tone: 'current' };
  }
  if (state === 'done') return { text: 'เสร็จแล้ว', tone: 'done' };
  if (state === 'skipped') return { text: 'ไม่ใช้ในกรณีนี้', tone: 'skip' };
  return { text: 'รอดำเนินการ', tone: 'pending' };
}

/**
 * 2026-11-04 — requirement ใหม่ "กระชับ อ่านจบได้ในจอ 1366px" ย่อตารางจากทุก station จริง (รวม sub-state
 * 7.1-7.4/8.1-8.6/9.1-9.4 — เวอร์ชันก่อนหน้า) เหลือ 10 แถว = 10 ขั้นตอนหลักจาก WorkflowMaster (model.mainStepNumbers,
 * buildStaffWorkflowModel_ เดิม — ตัวเดียวกับที่ไดอะแกรมแนวนอน Section C ใช้ ไม่สร้าง logic คำนวณคู่ขนาน) และเหลือ
 * 4 คอลัมน์ตามที่ระบุ (ลำดับ/ขั้นตอน/วันที่ดำเนินการ/บันทึกวันที่) — ตัด รายละเอียด/สถานะ/การดำเนินการ(เดิม) ออก
 * ข้อมูลที่เคยอยู่ตรงนั้น (public_hint, ผลการพิจารณา 7.x สี, revision_due_date) ยังไม่หายไปจากระบบ — ยังเห็นได้ที่
 * การ์ด "สถานะปัจจุบัน" (renderPubHero_, ส่วนบนสุด) และ "ความคืบหน้า" (Progress Card, Section D) เหมือนเดิมทุกจุด
 * เพียงแค่ไม่ซ้ำแสดงในตารางนี้อีกต่อไปตามที่ระบุ ("ตารางต้องเหลือ 4 คอลัมน์เท่านั้น")
 *
 * วันที่ดำเนินการ/สิทธิ์แก้ไข ของ "ขั้นตอนหลัก N" ที่ map กับ station จริงมากกว่า 1 ตัว (เช่น 8 = s8_1..s8_6) ใช้
 * รายการล่าสุดที่ถูกบันทึกจริงใน group นั้น (ไม่เดา — "ล่าสุด" มาจาก StatusHistory.action_date จริงเท่านั้น
 * เหมือนที่ buildFixedMainTimeline_/PublicTrack.gs ใช้หลักการเดียวกันกับ Owner Timeline เดิม — แค่คำนวณแยกไม่ผ่าน
 * ฟังก์ชันนั้นตรงๆ เพราะ requirement ห้ามแตะ Owner Timeline) แก้วันที่ย้อนหลังยังเรียก performEditStepDate_ เดิม
 * ตรงๆ (ผูกกับ historyId ของแถวจริงที่เลือกมา ไม่ใช่ state ใหม่ใดๆ)
 */
/**
 * 2026-11-04 รอบ 3 — requirement ล่าสุด "ตารางแนวนอน 10 ขั้นตอน เหลือแถวเดียว (วันที่ดำเนินการ) + ปุ่มอัปเดต
 * ข้อมูลเดียว" แทนที่ renderStaffWorkflowTable_ เดิม (ตารางแนวตั้ง 4 คอลัมน์ x 10 แถว, รอบก่อนหน้า) ทั้งหมด —
 * โครงสร้างสลับแกน (step กลายเป็นคอลัมน์แทนแถว) ใช้ CSS Grid (grid-template-columns: 130px repeat(10,
 * minmax(0,1fr))) แทน <table> เพราะข้อมูลมีแค่ 2 "แถวตรรกะ" (หัวขั้นตอน/วันที่) x 10 คอลัมน์ — ตาม requirement
 * ข้อ 25 ที่แนะนำไว้ตรงๆ
 *
 * reuse model เดิมทั้งหมด (buildStaffWorkflowModel_ — ไม่คำนวณ state/doneMap/skip ซ้ำ) และ business rule เดิม
 * ทุกจุด: ขั้นตอน "เสร็จแล้ว" แก้วันที่ย้อนหลังผ่าน performEditStepDate_ เดิม (ข้อ 10), ขั้นตอน "ปัจจุบัน" ที่มี
 * ทางออกทางเดียว (ไม่แตกสาย) กรอกวันที่ = เรียก performStateTransition_ เดิมจริง (ไม่ fabricate state — ข้อ 19),
 * ขั้นตอน "ปัจจุบัน" ที่แตกสาย (เช่น step 3 ครบ/ไม่ครบถ้วน, step 7 ผ่าน/แก้ไข/ไม่ผ่าน — ดู WORKFLOW_TRANSITIONS_SEED)
 * "ห้ามเดา" ผลจากวันที่อย่างเดียว จึงยังต้องมีปุ่มเลือกผลแยก (ข้อยกเว้นเดียวที่จำเป็นจริงทางธุรกิจ — ไม่ใช่
 * "ปุ่มรายStep" ทั่วไปที่ข้อ 16 ห้าม เพราะเกิดเฉพาะ step ที่มีมากกว่า 1 ทางออกจริงเท่านั้น ส่วนใหญ่ (8/10 ขั้น)
 * ไม่มีกรณีนี้เลย) ปุ่มเหล่านี้เปิด panel ย่อยแยกนอกฟอร์มหลัก (ฟอร์ม HTML ซ้อนกันไม่ได้) reuse mechanism เดิม
 * (data-wf-toggle/.wtbl-panel, STAFF_WORKFLOW_TOGGLE_SCRIPT_) ทั้งหมด ไม่สร้าง toggle ใหม่ซ้ำ
 *
 * batch update ("✓ อัปเดตข้อมูล" ปุ่มเดียว) → form_action=save_all_step_dates → performSaveAllStepDates_
 * (Actions.gs) ซึ่ง reuse performEditStepDate_/performStateTransition_ เดิมทั้งคู่ ไม่มี logic ใหม่
 */
function renderStaffWorkflowGrid_(ss, work, history, stationsMap, data, user, baseUrl, stepErrors, stepPrevValues, model) {
  stepPrevValues = stepPrevValues || {};
  var isAdmin = model.isAdmin;

  var errorHtml = (stepErrors && stepErrors.length)
    ? '<div class="error-banner"><ul>' + stepErrors.map(function (m) { return '<li>' + escapeHtml_(m) + '</li>'; }).join('') + '</ul></div>'
    : '';

  var headerCellsHtml = '';
  var dateCellsHtml = '';
  var panelsHtml = '';

  model.mainStepNumbers.forEach(function (n) {
    var groupStations = model.allStations.filter(function (s) { return parentStepOrder_(s.station_order) === String(n); });
    var label = staffMainStepLabel_(n, model.allStations);

    var state;
    if (n === model.currentMainStepNumber) state = 'current';
    else if (model.skippedMainSteps[String(n)]) state = 'skipped';
    else if (n < model.currentMainStepNumber) state = 'done';
    else state = 'pending';

    // รายการล่าสุดที่ถูกบันทึกจริงใน group นี้ (ไม่เดา — ใช้ StatusHistory.action_date จริงเท่านั้น)
    var rep = null;
    groupStations.forEach(function (s) {
      var d = model.doneMap[s.station_key];
      if (d && (!rep || new Date(d.enteredAt).getTime() >= new Date(rep.enteredAt).getTime())) {
        rep = { enteredAt: d.enteredAt, historyId: d.historyId, stationKey: s.station_key };
      }
    });

    // ข้อ 14/RESULT COLOR — step ที่ resolve ผลย่อยแล้วจริง (ปัจจุบันมีแค่ step 7 ใน WorkflowMaster) ใช้สี
    // ตามผลจริง (เขียว/เหลืองอ่อน/เหลืองเข้ม/แดง) reuse OWNER_RESULT_OUTCOME_ เดิม แทนสีสถานะทั่วไป
    var resolvedHere = model.resolvedFirstRound && parentStepOrder_(model.resolvedFirstRound.order) === String(n) ? model.resolvedFirstRound : null;
    var outcome = resolvedHere ? OWNER_RESULT_OUTCOME_[resolvedHere.key] : null;
    var badgeTone = outcome ? STAFF_ORDER_OUTCOME_TONE_MAP_[outcome.tone] : (state === 'skipped' ? 'skip' : state);
    var badgeIcon = state === 'done' ? '&#10003;' : n;

    headerCellsHtml += '<div class="swfg-cell swfg-head swfg-col-' + state + '" data-step="' + n + '">' +
      '<span class="swfg-badge swfg-badge-' + badgeTone + '">' + badgeIcon + '</span>' +
      '<span class="swfg-step-name">' + escapeHtml_(label) + '</span></div>';

    var dateInputHtml;
    if (state === 'done' && rep) {
      var repStationDef = stationsMap[rep.stationKey];
      var orgResp = repStationDef ? resolveResponsibleOrg_(repStationDef, work) : '';
      var canEditThis = isAdmin || (orgResp && user.organization === orgResp);
      var isoVal = formatDateYYYYMMDD_(rep.enteredAt);
      dateInputHtml = '<input type="date" class="input swfg-input" name="action_date_' + escapeHtml_(rep.historyId) + '"' +
        ' value="' + escapeHtml_(isoVal) + '" data-original="' + escapeHtml_(isoVal) + '"' + (canEditThis ? '' : ' disabled') + '>';
    } else if (state === 'current' && model.eligibleTransitions.length === 1) {
      // ทางเดียวไม่แตกสาย — กรอกวันที่ในกริดนี้ตรงๆ = ยืนยันว่าขั้นนี้เสร็จแล้ว (reuse performStateTransition_
      // ผ่าน batch handler, ไม่ fabricate state ถ้าไม่ได้แก้ค่าเลย เพราะเริ่มต้นเป็นค่าว่างเสมอ — ข้อ 19/37)
      dateInputHtml = '<input type="date" class="input swfg-input" name="transition_date" value="" data-original="" placeholder="เลือกวันที่">' +
        '<input type="hidden" name="transition_id" value="' + escapeHtml_(model.eligibleTransitions[0].transition_id) + '">';
    } else if (state === 'current' && model.eligibleTransitions.length > 1) {
      // แตกสายจริง (เช่น step 3 ครบ/ไม่ครบถ้วน, step 7 ผ่าน/แก้ไข 2-6 เดือน/ไม่ผ่าน) — ห้ามเดาผลจากวันที่อย่างเดียว
      dateInputHtml = '<div class="swfg-branch"><div class="swfg-branch-hint">เลือกผลการพิจารณา</div>';
      model.eligibleTransitions.forEach(function (t) {
        var panelId = 'wtbl-confirm-' + t.transition_id;
        var isReopen = stepPrevValues.wtbl_action === 'state_transition' && stepPrevValues.transition_id === t.transition_id;
        var targetStation = stationsMap[t.to_state];
        var targetName = targetStation ? splitStationNameDesc_(targetStation.station_name).main : t.to_state;
        var needsDueDate = REVISION_DUE_DATE_STATE_KEYS_[t.to_state];
        dateInputHtml += '<button type="button" class="swfg-branch-btn" data-wf-toggle="' + escapeHtml_(panelId) + '">' + escapeHtml_(t.button_label) + '</button>';
        panelsHtml += '<div class="wf-confirm wtbl-panel" id="' + escapeHtml_(panelId) + '"' + (isReopen ? ' data-auto-open="1"' : '') + '>' +
          '<div class="wf-confirm-title">กำลังเปลี่ยนสถานะ</div>' +
          '<div class="wf-confirm-from">จาก: <b>' + escapeHtml_(n + '. ' + label) + '</b></div>' +
          '<div class="wf-confirm-to">เป็น: <b>' + escapeHtml_(targetName) + '</b></div>' +
          '<form method="post" target="_top" action="' + baseUrl + '" class="reg-form" style="border:none;padding:0;margin-top:8px">' +
          '<input type="hidden" name="form_action" value="state_transition">' +
          '<input type="hidden" name="return_to" value="detail">' +
          '<input type="hidden" name="work_id" value="' + escapeHtml_(work.work_id) + '">' +
          '<input type="hidden" name="transition_id" value="' + escapeHtml_(t.transition_id) + '">' +
          '<div class="field"><label>วันที่ดำเนินการ</label>' +
          '<input class="input" type="date" name="action_date" value="' + escapeHtml_(isReopen ? (stepPrevValues.action_date || '') : formatDateYYYYMMDD_(now_())) + '" required></div>' +
          (needsDueDate ? '<div class="field"><label>วันครบกำหนดแก้ไข</label>' +
            '<input class="input" type="date" name="revision_due_date" value="' + escapeHtml_(isReopen ? (stepPrevValues.revision_due_date || '') : '') + '" required></div>' : '') +
          '<div class="field"><label>หมายเหตุ' + (t.requires_note ? '' : ' (ถ้ามี)') + '</label>' +
          '<textarea class="input" name="note" rows="2">' + escapeHtml_(isReopen ? (stepPrevValues.note || '') : '') + '</textarea></div>' +
          '<div class="wf-confirm-actions">' +
          '<button class="btn-primary" type="submit" data-loading-text="กำลังบันทึก...">ยืนยัน' + escapeHtml_(t.button_label) + '</button>' +
          '<button type="button" class="btn-outline wtbl-panel-cancel">ยกเลิก</button>' +
          '</div></form></div>';
      });
      dateInputHtml += '</div>';
    } else if (state === 'skipped') {
      dateInputHtml = '<input type="date" class="input swfg-input" value="" disabled>';
    } else if (state === 'current') { // ไม่มีสิทธิ์ (eligibleTransitions ว่างเพราะ permission ไม่ตรง)
      dateInputHtml = '<input type="date" class="input swfg-input" value="" disabled placeholder="ไม่มีสิทธิ์">';
    } else if (state === 'done') { // เคสขอบ: ถือว่า done (n < currentMainStepNumber) แต่ไม่พบประวัติจริงในกลุ่มนี้ (ไม่ควรเกิดจริง — กันไว้)
      dateInputHtml = '<input type="date" class="input swfg-input" value="" disabled>';
    } else { // pending — business rule เดิมไม่อนุญาตกรอกล่วงหน้า (computeEligibleTransitions_ อนุญาตเฉพาะ current เท่านั้น)
      dateInputHtml = '<input type="date" class="input swfg-input" value="" disabled placeholder="เลือกวันที่">';
    }

    dateCellsHtml += '<div class="swfg-cell swfg-date swfg-col-' + state + '" data-step="' + n + '">' + dateInputHtml + '</div>';
  });

  var historyLinkHtml = '<p class="swfg-history-link"><a href="javascript:void(0)" onclick="var d=document.getElementById(&quot;swf-history&quot;);' +
    'if(d){d.open=true;d.scrollIntoView({behavior:&quot;smooth&quot;});}">ดูประวัติการเปลี่ยนแปลง</a></p>';

  return '' +
    '<div class="swfg-section">' +
    '<div class="swfg-header"><span class="swfg-header-icon">&#128197;</span>รายละเอียดขั้นตอนและการดำเนินการ</div>' +
    errorHtml +
    '<form method="post" target="_top" action="' + baseUrl + '" id="swfg-form">' +
    '<input type="hidden" name="form_action" value="save_all_step_dates">' +
    '<input type="hidden" name="return_to" value="detail">' +
    '<input type="hidden" name="work_id" value="' + escapeHtml_(work.work_id) + '">' +
    '<div class="swfg-wrap"><div class="swfg-grid">' +
    '<div class="swfg-cell swfg-label">ขั้นตอน</div>' + headerCellsHtml +
    '<div class="swfg-cell swfg-label">วันที่ดำเนินการ</div>' + dateCellsHtml +
    '</div></div>' +
    '<div class="swfg-actions"><button type="submit" class="swfg-update-btn" id="swfg-update-btn" disabled ' +
    'data-loading-text="กำลังบันทึก...">&#10003; อัปเดตข้อมูล</button></div>' +
    '</form>' +
    panelsHtml + historyLinkHtml +
    '</div>' +
    SWFG_DIRTY_SCRIPT_;
}

/**
 * 2026-11-05 — requirement ใหม่ "Staff workflow ตารางแนวตั้ง 5 คอลัมน์ (ลำดับ/ขั้นตอน/วันที่ดำเนินการ/ประวัติ
 * การแก้ไข/ดูรายละเอียด) + Side Drawer ประวัติต่อขั้นตอน" แทนที่ renderStaffWorkflowGrid_ ด้านบน (ตารางกริด
 * แนวนอน 10 คอลัมน์ รอบก่อนหน้า) ในหน้าจริง — ไม่ลบ renderStaffWorkflowGrid_ ทิ้ง (ตามธรรมเนียมโปรเจกต์)
 *
 * 1 แถว = 1 "ขั้นตอนหลัก" จาก model.mainStepNumbers (buildStaffWorkflowModel_ เดิม — ไม่คำนวณ state/doneMap/
 * skip/outcome ซ้ำ, business rule เดิมทุกจุดเหมือน renderStaffWorkflowGrid_) กว้างคอลัมน์ 6/38/25/18/13%
 * ตามที่ระบุ (ข้อ 6) ใช้ <table table-layout:fixed> ธรรมดา ไม่ใช่ CSS Grid แล้ว (ข้อมูลกลับมาเป็นแนวตั้งปกติ)
 *
 * <table> นี้ไม่ได้ถูกครอบด้วย <form> โดยตรง (ต่างจาก renderStaffWorkflowGrid_ เดิม) เพราะขั้นตอนแตกสายจริง
 * (step 3/7 — ดูหมายเหตุด้านล่างว่าทำไมไม่ใช่ step 2) ต้องมี <form> แยกของตัวเองอยู่ใน <td> เดียวกัน ซ้อน <form> ใน <form> ไม่ได้ตาม HTML spec — ใช้
 * attribute มาตรฐาน HTML5 `form="swfg-form"` ผูก input คอลัมน์ "วันที่ดำเนินการ" ของแถวอื่นๆ (เสร็จแล้ว/ปัจจุบัน
 * ทางเดียว) เข้ากับฟอร์ม #swfg-form ที่อยู่หลังตาราง (มีแค่ hidden fields + ปุ่ม ไม่มี input ของตัวเอง) แทน —
 * รองรับทุก browser หลักปัจจุบัน (Chrome/Firefox/Edge/Safari) ปุ่ม "✓ อัปเดตข้อมูล" เดียว ยังเรียก
 * performSaveAllStepDates_ เดิมเป๊ะ (ไม่ถูกแตะ)
 *
 * ขั้นตอนแตกสายจริง — ตรวจ WORKFLOW_TRANSITIONS_SEED (Constants.gs) จริงแล้วพบว่าไม่ใช่ step 2 ตามที่ requirement
 * เรียกชื่อ (requirement ใช้ชื่อ "ขั้นตอน" ตามความเข้าใจผู้ใช้ ไม่ตรงกับ state code จริงเป๊ะ — s2_s3_1/s2_s3_2 เดิม
 * ถูกปิด active แล้วจริงจาก migrateAddState3Hub() ก่อนหน้านี้ ข้อ "ตรวจ code จริงก่อนแก้ ห้ามเดา" จึงต้องยึดโค้ด
 * จริงเป็นหลัก): step 2 ("ตรวจสอบเอกสาร") ปัจจุบันมีทางออกทางเดียวจริง (s2_s3 -> ส่งเอกสารให้เลขาคณะกรรมการฯ)
 * ส่วนตัวเลือกครบถ้วน/ไม่ครบถ้วน -> 3.1/3.2 จริงๆ เกิดตอน current เป็น "step 3" (hub bare, s3_s3_1/s3_s3_2) —
 * โค้ดด้านล่างไม่ hardcode เลข step ใดๆ เลย (เช็คแค่ model.eligibleTransitions.length>1 ตอน state==='current'
 * เท่านั้น) จึงแตกสายถูกจุดจริงเสมอไม่ว่าจะเป็น step 3 หรือ step 7 (ผ่าน/แก้ไข 2 เดือน/แก้ไข 6 เดือน/ไม่ผ่าน)
 * โดยอัตโนมัติ ไม่ต้องแก้โค้ดถ้า business rule ย้ายจุดแตกสายอีกในอนาคต แสดงเป็น radio ในคอลัมน์ "วันที่ดำเนินการ"
 * ของแถวนั้น (ข้อ 10/32/33
 * "radio/segmented, inline compact, ห้ามเลือกได้พร้อมกัน 2 ตัว") เลือกแล้วฟอร์มย่อยของตัวเลือกนั้นเผยออกมาในที่
 * เดียวกัน (toggle ด้วย data-wf-toggle/.wtbl-panel/STAFF_WORKFLOW_TOGGLE_SCRIPT_ เดิมทุกอัน — เดิมใช้กับปุ่ม,
 * ใช้กับ radio ได้เลยไม่ต้องแก้สคริปต์ เพราะ event listener ผูกกับ "click" บน [data-wf-toggle] ทุก element
 * อยู่แล้ว ไม่สนใจว่าเป็น tag อะไร) ฟอร์มย่อย POST ตรงไป form_action=state_transition เดิมทุกประการ
 * (performStateTransition_ ไม่ถูกแตะ — ห้ามเดาผลจากวันที่อย่างเดียวยังจริงเหมือนเดิม)
 *
 * ประวัติการแก้ไข/Drawer: นับ+กรองด้วย work_id+stepCode จาก model.auditByMainStep (โหลด AuditLog ครั้งเดียวใน
 * buildStaffWorkflowModel_ — ข้อ 28 ห้ามยิง backend ต่อ step) เนื้อหา Drawer ของทุก step ที่มีประวัติ ถูก embed
 * ไว้ใน <template> ซ่อนอยู่ตั้งแต่โหลดหน้าแล้ว กดปุ่ม "ดูรายละเอียด" แค่สลับ DOM ฝั่ง client (SWFT_DRAWER_SCRIPT_)
 * ไม่มี backend call เพิ่มเลยตอนเปิด Drawer (เข้าเงื่อนไข "dataset เล็ก" ของข้อ 28 เสมอ — AuditLog ต่องานหนึ่ง
 * รายการมีไม่กี่แถวจริง)
 *
 * ขอบเขตที่ตั้งใจไม่ Implement (ตรวจแล้วว่าไม่ปลอดภัยตาม "ห้ามเปลี่ยน Business Rule"): การ "เปลี่ยนผลที่เลือกไป
 * แล้ว" ของขั้นตอนแตกสาย (step 3/7) หลังจากขั้นตอนนั้นผ่านไปแล้วจริง (current_station_key เดินหน้าไปขั้นอื่นแล้ว) ต้องมีการย้อน
 * state กลับซึ่งไม่มี transition ใดใน WorkflowTransitions รองรับไว้จริง — สร้างเส้นทางนี้เองเท่ากับ "เดา"/เพิ่ม
 * business rule ใหม่ จึงไม่ implement ส่วนนี้ (ดูรายละเอียดเต็มใน Final Report) ยังทำได้และปลอดภัยเสมอคือ (1)
 * เลือกผลระหว่างที่ขั้นตอนนั้นยังเป็น "ปัจจุบัน" จริง (ก่อน fire transition) ผ่าน radio ปกติด้านบน และ (2) แก้
 * "วันที่" ย้อนหลังของขั้นที่เสร็จแล้วทุกขั้น (รวม step 3/7) ผ่าน performEditStepDate_ เดิม — ทั้ง 2 กรณีสร้าง
 * AuditLog ที่ Drawer/คอลัมน์ประวัติแสดงได้จริงตามข้อ 25-27 ไม่ fabricate อะไรเพิ่ม
 */
function renderStaffWorkflowRowsTable_(ss, work, history, stationsMap, data, user, baseUrl, stepErrors, stepPrevValues, model) {
  stepPrevValues = stepPrevValues || {};
  var isAdmin = model.isAdmin;

  var errorHtml = (stepErrors && stepErrors.length)
    ? '<div class="error-banner"><ul>' + stepErrors.map(function (m) { return '<li>' + escapeHtml_(m) + '</li>'; }).join('') + '</ul></div>'
    : '';

  var rowsHtml = '';
  var templatesHtml = '';

  model.mainStepNumbers.forEach(function (n) {
    var groupStations = model.allStations.filter(function (s) { return parentStepOrder_(s.station_order) === String(n); });
    var label = staffMainStepLabel_(n, model.allStations);

    var state;
    if (n === model.currentMainStepNumber) state = 'current';
    else if (model.skippedMainSteps[String(n)]) state = 'skipped';
    else if (n < model.currentMainStepNumber) state = 'done';
    else state = 'pending';

    var rep = null;
    groupStations.forEach(function (s) {
      var d = model.doneMap[s.station_key];
      if (d && (!rep || new Date(d.enteredAt).getTime() >= new Date(rep.enteredAt).getTime())) {
        rep = { enteredAt: d.enteredAt, historyId: d.historyId, stationKey: s.station_key };
      }
    });

    var resolvedHere = model.resolvedFirstRound && parentStepOrder_(model.resolvedFirstRound.order) === String(n) ? model.resolvedFirstRound : null;
    var outcome = resolvedHere ? OWNER_RESULT_OUTCOME_[resolvedHere.key] : null;
    var badgeTone = outcome ? STAFF_ORDER_OUTCOME_TONE_MAP_[outcome.tone] : (state === 'skipped' ? 'skip' : state);
    // 2026-11-05 รอบ 2 — ข้อ 2 "ห้ามใช้ ✓ แทนเลขขั้นตอน" วงกลมต้องแสดงเลขขั้นตอนเสมอไม่ว่าสถานะใด (สีวงกลมเป็น
    // ตัวบอกสถานะอยู่แล้วจาก badgeTone ด้านบน — ไม่ต้องเปลี่ยนเลข icon ซ้ำ)
    var badgeIcon = n;

    // 2026-11-05 รอบ 2 — ข้อ 4-10 "แสดงผลที่เลือกต่อท้ายชื่อขั้นตอน" เฉพาะ main step ที่เป็นจุดแตกสายจริง
    // (model.branchFromCount — นับจาก WorkflowTransitions จริง ไม่ hardcode เลข step) และมีผลบันทึกจริงแล้ว
    // (rep.stationKey จาก StatusHistory.to_station จริง ไม่ใช่ bare hub เอง = ยังไม่มีผล -> ไม่แสดง badge เลย
    // ตามข้อ 10 "กรณียังไม่ได้เลือก ไม่ต้องมี badge ว่าง")
    var bareStation = groupStations.filter(function (s) { return String(s.station_order) === String(n); })[0];
    var isDecisionHub = bareStation && model.branchFromCount[bareStation.station_key] > 1;
    // 2026-11-05 รอบ 3 — requirement ใหม่ ข้อ 5/10/14/20 ย้าย badge ผลที่เลือกออกเป็นคอลัมน์แยก "ผลการเลือก /
    // รายละเอียด" (เดิมต่อท้ายชื่อขั้นตอนในคอลัมน์ "ขั้นตอน" — ย้ายเฉยๆ ไม่เปลี่ยน logic การคำนวณผล) ขั้นตอนที่ไม่ใช่
    // จุดแตกสาย หรือจุดแตกสายที่ยังไม่ resolve ให้แสดง "-" เสมอ (ห้าม null/undefined/ว่างเปล่า ตามข้อ 14)
    var resultCellHtml = '-';
    if (isDecisionHub && rep && rep.stationKey !== bareStation.station_key) {
      var resInfo = STAFF_STEP_RESULT_BADGE_[rep.stationKey];
      if (!resInfo) {
        var repStDefForBadge = stationsMap[rep.stationKey];
        resInfo = { text: repStDefForBadge ? splitStationNameDesc_(repStDefForBadge.station_name).main : rep.stationKey, tone: 'neutral' };
      }
      resultCellHtml = '<span class="swft-result-badge swft-result-badge-' + resInfo.tone + '">' + escapeHtml_(resInfo.text) + '</span>';
    }

    var dateInputHtml;
    if (state === 'done' && rep) {
      var repStationDef = stationsMap[rep.stationKey];
      var orgResp = repStationDef ? resolveResponsibleOrg_(repStationDef, work) : '';
      var canEditThis = isAdmin || (orgResp && user.organization === orgResp);
      var isoVal = formatDateYYYYMMDD_(rep.enteredAt);
      dateInputHtml = '<input type="date" class="input swfg-input" form="swfg-form" name="action_date_' + escapeHtml_(rep.historyId) + '"' +
        ' value="' + escapeHtml_(isoVal) + '" data-original="' + escapeHtml_(isoVal) + '"' + (canEditThis ? '' : ' disabled') + '>';
    } else if (state === 'current' && model.eligibleTransitions.length === 1) {
      dateInputHtml = '<input type="date" class="input swfg-input" form="swfg-form" name="transition_date" value="" data-original="" placeholder="เลือกวันที่">' +
        '<input type="hidden" form="swfg-form" name="transition_id" value="' + escapeHtml_(model.eligibleTransitions[0].transition_id) + '">';
    } else if (state === 'current' && model.eligibleTransitions.length > 1) {
      dateInputHtml = '<div class="swft-branch-group" role="radiogroup" aria-label="เลือกผลการพิจารณา">';
      model.eligibleTransitions.forEach(function (t) {
        var panelId = 'swft-branch-panel-' + t.transition_id;
        var isReopenOpt = stepPrevValues.wtbl_action === 'state_transition' && stepPrevValues.transition_id === t.transition_id;
        dateInputHtml += '<label class="swft-branch-option"><input type="radio" class="swft-branch-radio" name="swft_branch_' + n + '"' +
          ' value="' + escapeHtml_(t.transition_id) + '" data-wf-toggle="' + escapeHtml_(panelId) + '"' + (isReopenOpt ? ' checked' : '') + '>' +
          '<span>' + escapeHtml_(t.button_label) + '</span></label>';
      });
      dateInputHtml += '</div>';
      model.eligibleTransitions.forEach(function (t) {
        var panelId = 'swft-branch-panel-' + t.transition_id;
        var isReopen = stepPrevValues.wtbl_action === 'state_transition' && stepPrevValues.transition_id === t.transition_id;
        var targetStation = stationsMap[t.to_state];
        var targetName = targetStation ? splitStationNameDesc_(targetStation.station_name).main : t.to_state;
        var needsDueDate = REVISION_DUE_DATE_STATE_KEYS_[t.to_state];
        dateInputHtml += '<div class="wf-confirm wtbl-panel swft-branch-form" id="' + escapeHtml_(panelId) + '"' + (isReopen ? ' data-auto-open="1"' : '') + '>' +
          '<form method="post" target="_top" action="' + baseUrl + '" class="reg-form" style="border:none;padding:0;margin:0">' +
          '<input type="hidden" name="form_action" value="state_transition">' +
          '<input type="hidden" name="return_to" value="detail">' +
          '<input type="hidden" name="work_id" value="' + escapeHtml_(work.work_id) + '">' +
          '<input type="hidden" name="transition_id" value="' + escapeHtml_(t.transition_id) + '">' +
          '<div class="field"><label>วันที่ดำเนินการ (เป็น ' + escapeHtml_(targetName) + ')</label>' +
          '<input class="input" type="date" name="action_date" value="' + escapeHtml_(isReopen ? (stepPrevValues.action_date || '') : formatDateYYYYMMDD_(now_())) + '" required></div>' +
          (needsDueDate ? '<div class="field"><label>วันครบกำหนดแก้ไข</label>' +
            '<input class="input" type="date" name="revision_due_date" value="' + escapeHtml_(isReopen ? (stepPrevValues.revision_due_date || '') : '') + '" required></div>' : '') +
          '<div class="field"><label>หมายเหตุ' + (t.requires_note ? '' : ' (ถ้ามี)') + '</label>' +
          '<textarea class="input" name="note" rows="2">' + escapeHtml_(isReopen ? (stepPrevValues.note || '') : '') + '</textarea></div>' +
          '<button class="btn-primary swft-branch-submit" type="submit" data-loading-text="กำลังบันทึก...">ยืนยัน' + escapeHtml_(t.button_label) + '</button>' +
          '</form></div>';
      });
    } else if (state === 'skipped') {
      dateInputHtml = '<input type="date" class="input swfg-input" value="" disabled>';
    } else if (state === 'current') { // ไม่มีสิทธิ์ (eligibleTransitions ว่างเพราะ permission ไม่ตรง)
      dateInputHtml = '<input type="date" class="input swfg-input" value="" disabled placeholder="ไม่มีสิทธิ์">';
    } else if (state === 'done') { // เคสขอบ: ไม่ควรเกิดจริง — กันไว้
      dateInputHtml = '<input type="date" class="input swfg-input" value="" disabled>';
    } else { // pending
      dateInputHtml = '<input type="date" class="input swfg-input" value="" disabled placeholder="เลือกวันที่">';
    }

    var auditList = model.auditByMainStep[n] || [];
    var historyCount = auditList.length;
    var historyCellHtml = historyCount > 0 ? ('มี ' + historyCount + ' รายการ') : 'ไม่มี';
    var detailBtnHtml = historyCount > 0
      ? '<button type="button" class="btn-outline swft-detail-btn" data-drawer-step="' + n + '" data-drawer-label="' + escapeHtml_(n + '. ' + label) + '">ดูรายละเอียด</button>'
      : '';

    if (historyCount > 0) {
      var itemsHtml = auditList.map(function (a) {
        return '<div class="swft-drawer-item">' +
          '<div class="swft-drawer-time">' + formatDateTimeThBuddhist_(a.timestamp) + '</div>' +
          '<div class="swft-drawer-row"><span class="swft-drawer-k">ผู้แก้ไข</span><span class="swft-drawer-v">' + escapeHtml_(a.user_email) + '</span></div>' +
          '<div class="swft-drawer-row"><span class="swft-drawer-k">รายการ</span><span class="swft-drawer-v">' + escapeHtml_(swftAuditFieldLabel_(a.field_changed)) + '</span></div>' +
          '<div class="swft-drawer-row"><span class="swft-drawer-k">เดิม</span><span class="swft-drawer-old">' + escapeHtml_(a.old_value || '-') + '</span></div>' +
          '<div class="swft-drawer-row"><span class="swft-drawer-k">ใหม่</span><span class="swft-drawer-new">' + escapeHtml_(a.new_value || '-') + '</span></div>' +
          '</div>';
      }).join('');
      templatesHtml += '<template id="swft-drawer-tpl-' + n + '">' + itemsHtml + '</template>';
    }

    rowsHtml += '<tr class="swft-row swft-row-' + state + '" data-step="' + n + '">' +
      '<td class="swft-col-order"><span class="swfg-badge swfg-badge-' + badgeTone + '">' + badgeIcon + '</span></td>' +
      '<td class="swft-col-step"><span class="swft-step-icon">' + staffStepIcon_(label) + '</span><span class="swft-step-name">' + escapeHtml_(label) + '</span></td>' +
      '<td class="swft-col-result">' + resultCellHtml + '</td>' +
      '<td class="swft-col-date">' + dateInputHtml + '</td>' +
      '<td class="swft-col-history">' + historyCellHtml + '</td>' +
      '<td class="swft-col-detail">' + detailBtnHtml + '</td>' +
      '</tr>';
  });

  var drawerShellHtml = '' +
    '<div class="swft-drawer-overlay" id="swft-drawer-overlay"></div>' +
    '<div class="swft-drawer" id="swft-drawer" role="dialog" aria-modal="true">' +
    '<div class="swft-drawer-head"><div class="swft-drawer-title" id="swft-drawer-title"></div>' +
    '<button type="button" class="swft-drawer-close" id="swft-drawer-close" aria-label="ปิด">&times;</button></div>' +
    '<div class="swft-drawer-body" id="swft-drawer-body"></div>' +
    '<div class="swft-drawer-foot"><button type="button" class="btn-outline" id="swft-drawer-close-btn">ปิด</button></div>' +
    '</div>';

  return '' +
    '<div class="swfg-section">' +
    '<div class="swfg-header"><span class="swfg-header-icon">&#128197;</span>รายละเอียดขั้นตอนและการดำเนินการ</div>' +
    errorHtml +
    '<div class="swft-table-wrap"><table class="swft-table">' +
    '<colgroup><col style="width:6%"><col style="width:27%"><col style="width:20%"><col style="width:20%"><col style="width:15%"><col style="width:12%"></colgroup>' +
    '<thead><tr><th>ลำดับ</th><th>ขั้นตอน</th><th>ผลการเลือก / รายละเอียด</th><th>วันที่ดำเนินการ</th><th>ประวัติการแก้ไข</th><th>ดูรายละเอียด</th></tr></thead>' +
    '<tbody>' + rowsHtml + '</tbody>' +
    '</table></div>' +
    '<form method="post" target="_top" action="' + baseUrl + '" id="swfg-form">' +
    '<input type="hidden" name="form_action" value="save_all_step_dates">' +
    '<input type="hidden" name="return_to" value="detail">' +
    '<input type="hidden" name="work_id" value="' + escapeHtml_(work.work_id) + '">' +
    '<div class="swfg-actions"><button type="submit" class="swfg-update-btn" id="swfg-update-btn" disabled ' +
    'data-loading-text="กำลังบันทึก...">&#10003; อัปเดตข้อมูล</button></div>' +
    '</form>' +
    templatesHtml + drawerShellHtml +
    '</div>' +
    SWFT_DIRTY_SCRIPT_ + SWFT_DRAWER_SCRIPT_;
}

/** ข้อ 17 ของรอบก่อนหน้า (ยังจริงเหมือนกัน) — Dirty-state tracking ของ #swfg-form เวอร์ชันตารางแนวตั้ง 2026-11-05:
 *  ปุ่ม "✓ อัปเดตข้อมูล" disabled ตอนเปิดหน้าเสมอ enable ทันทีที่ .swfg-input (ที่ไม่ disabled) ค่าเปลี่ยนจาก
 *  data-original ของมันเอง — ต่าง renderStaffWorkflowGrid_ เดิมที่ query จาก "form.querySelectorAll(...)" (input
 *  เป็นลูกของฟอร์มตรงๆ) ตอนนี้ query จาก document ทั้งหน้าแทน เพราะ input ผูกฟอร์มด้วย attribute `form="swfg-form"`
 *  ไม่ใช่ลูกของฟอร์มอีกต่อไป (<table> ไม่ได้อยู่ใน <form> แล้ว — ดูเหตุผลเต็มที่คอมเมนต์ renderStaffWorkflowRowsTable_) */
var SWFT_DIRTY_SCRIPT_ = '' +
  '<script>' +
  'document.addEventListener("DOMContentLoaded", function () {' +
  'var btn = document.getElementById("swfg-update-btn");' +
  'if (!btn) return;' +
  'var inputs = Array.prototype.slice.call(document.querySelectorAll(".swfg-input:not([disabled])"));' +
  'function checkDirty() {' +
  'var dirty = inputs.some(function (inp) { return inp.value !== (inp.getAttribute("data-original") || ""); });' +
  'btn.disabled = !dirty;' +
  '}' +
  'inputs.forEach(function (inp) { inp.addEventListener("input", checkDirty); inp.addEventListener("change", checkDirty); });' +
  'checkDirty();' +
  '});' +
  '</script>';

/**
 * Side Drawer "ประวัติการแก้ไข" (ข้อ 19-22/39/46/47) — เนื้อหาต่อขั้นตอนถูก embed ไว้ใน <template> ซ่อนอยู่แล้ว
 * ตั้งแต่โหลดหน้า (renderStaffWorkflowRowsTable_ ด้านบน) เปิด/ปิด Drawer คือสลับ class "open"/คัดลอก innerHTML
 * ของ template ไปลง #swft-drawer-body ล้วนๆ ฝั่ง client ไม่มี fetch/backend call ใดๆ เลย (ข้อ 19 "ไม่ reload",
 * ข้อ 28 "ไม่ยิง backend ซ้ำตอนเปิด Drawer" — dataset ต่องานหนึ่งรายการเล็กพอที่จะ embed ไว้ล่วงหน้าได้เสมอ)
 * ปิดได้ 3 ทาง: ปุ่ม X, ปุ่ม "ปิด", คลิก overlay, หรือกด Escape (ข้อ 39) ไม่มีทางไหน reload หน้าเลย ไม่พบ
 * template ของ step นั้น (ไม่ควรเกิดจริง เพราะปุ่ม "ดูรายละเอียด" render เฉพาะ step ที่มี history>0) ให้ fallback
 * ข้อความ error สั้นๆ แทน raw error (ข้อ 46)
 */
var SWFT_DRAWER_SCRIPT_ = '' +
  '<script>' +
  'document.addEventListener("DOMContentLoaded", function () {' +
  'var overlay = document.getElementById("swft-drawer-overlay");' +
  'var drawer = document.getElementById("swft-drawer");' +
  'var titleEl = document.getElementById("swft-drawer-title");' +
  'var bodyEl = document.getElementById("swft-drawer-body");' +
  'if (!overlay || !drawer) return;' +
  'function openDrawer(step, label) {' +
  'var tpl = document.getElementById("swft-drawer-tpl-" + step);' +
  'titleEl.textContent = "ประวัติการแก้ไข – ขั้นตอนที่ " + label;' +
  'bodyEl.innerHTML = tpl ? tpl.innerHTML : "<div class=\\"swft-drawer-error\\">ไม่สามารถโหลดประวัติการแก้ไขได้</div>";' +
  'overlay.classList.add("open"); drawer.classList.add("open");' +
  '}' +
  'function closeDrawer() { overlay.classList.remove("open"); drawer.classList.remove("open"); }' +
  'document.querySelectorAll("[data-drawer-step]").forEach(function (btn) {' +
  'btn.addEventListener("click", function () { openDrawer(btn.getAttribute("data-drawer-step"), btn.getAttribute("data-drawer-label")); });' +
  '});' +
  'overlay.addEventListener("click", closeDrawer);' +
  'var closeBtn = document.getElementById("swft-drawer-close");' +
  'if (closeBtn) closeBtn.addEventListener("click", closeDrawer);' +
  'var closeBtn2 = document.getElementById("swft-drawer-close-btn");' +
  'if (closeBtn2) closeBtn2.addEventListener("click", closeDrawer);' +
  'document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeDrawer(); });' +
  '});' +
  '</script>';

/**
 * ข้อ 17 — Dirty-state tracking ของฟอร์มกริด (#swfg-form): ปุ่ม "✓ อัปเดตข้อมูล" disabled ตอนเปิดหน้าเสมอ
 * (ข้อ 37 — ไม่มีการแก้ไขจริง ต้องไม่ส่ง request โดยไม่จำเป็น) enable ทันทีที่มี input ใดใน .swfg-input เปลี่ยน
 * ค่าไปจาก data-original ของมันเอง (เทียบ value ตรงๆ ฝั่ง client ล้วนๆ ไม่ใช่ AJAX) field ที่ disabled (ไม่มี
 * สิทธิ์/pending/skipped) ไม่ถูกนับเป็น dirty ได้อยู่แล้วเพราะ browser ไม่ส่งค่าช่อง disabled ไปกับฟอร์มเลย
 */
var SWFG_DIRTY_SCRIPT_ = '' +
  '<script>' +
  'document.addEventListener("DOMContentLoaded", function () {' +
  'var form = document.getElementById("swfg-form");' +
  'if (!form) return;' +
  'var btn = document.getElementById("swfg-update-btn");' +
  'var inputs = Array.prototype.slice.call(form.querySelectorAll(".swfg-input:not([disabled])"));' +
  'function checkDirty() {' +
  'var dirty = inputs.some(function (inp) { return inp.value !== (inp.getAttribute("data-original") || ""); });' +
  'btn.disabled = !dirty;' +
  '}' +
  'inputs.forEach(function (inp) { inp.addEventListener("input", checkDirty); inp.addEventListener("change", checkDirty); });' +
  'checkDirty();' +
  '});' +
  '</script>';

/**
 * toggle พื้นที่ยืนยัน/แก้ไขวันที่ (.wtbl-panel) ของหน้า Staff "Workflow เดียว" (2026-11-03) — generic ด้วย
 * [data-wf-toggle] (ต่างจาก WF_CONFIRM_TOGGLE_SCRIPT_ เดิมที่ผูกกับ .wf-step-actionable/.wf-confirm ตรงๆ สำหรับ
 * หน้าสแกน QR เท่านั้น ไม่ถูกแตะ) รองรับ auto-open panel ที่ validate ไม่ผ่านรอบก่อน (data-auto-open="1" จาก
 * server) ให้เลื่อนไปเห็น+เห็น error ทันทีโดยไม่ต้องกดปุ่มซ้ำ (Edit Mode) ไม่ใช่ AJAX — ฟอร์มข้างในยัง POST เต็ม
 * รูปแบบไปที่ form_action=state_transition/edit_step_date เดิมทุกประการ (ตรวจสิทธิ์/business rule ซ้ำฝั่ง
 * server เสมอ) toggle นี้แค่ซ่อน/โชว์ DOM เฉยๆ
 */
var STAFF_WORKFLOW_TOGGLE_SCRIPT_ = '' +
  '<script>' +
  'document.addEventListener("DOMContentLoaded", function () {' +
  'var buttons = document.querySelectorAll("[data-wf-toggle]");' +
  'var panels = document.querySelectorAll(".wtbl-panel");' +
  'function closeAll() { panels.forEach(function (p) { p.style.display = "none"; }); }' +
  'buttons.forEach(function (btn) {' +
  'btn.addEventListener("click", function () {' +
  'var targetId = btn.getAttribute("data-wf-toggle");' +
  'var target = document.getElementById(targetId);' +
  'if (!target) return;' +
  'var alreadyOpen = target.style.display === "block";' +
  'closeAll();' +
  'if (!alreadyOpen) { target.style.display = "block"; target.scrollIntoView({ behavior: "smooth", block: "center" }); }' +
  '});' +
  '});' +
  'document.querySelectorAll(".wtbl-panel-cancel").forEach(function (btn) {' +
  'btn.addEventListener("click", closeAll);' +
  '});' +
  'var autoOpen = document.querySelector(".wtbl-panel[data-auto-open=\\"1\\"]");' +
  'if (autoOpen) { autoOpen.style.display = "block"; autoOpen.scrollIntoView({ behavior: "smooth", block: "center" }); }' +
  '});' +
  '</script>';

/** หน้าพิมพ์ QR ใหม่ — qr_token เดิมไม่เปลี่ยน จึงสร้างภาพ QR เดิมซ้ำได้ทุกเมื่อ (ใช้ตอน QR บนเอกสารเสีย/หาย) */
function renderQrPrintBody_(work, qrImageUrl, baseUrl) {
  return '' +
    '<div class="success-card">' +
    '<p class="tracking-big">' + escapeHtml_(work.tracking_no) + '</p>' +
    '<img class="qr-img" src="' + escapeHtml_(qrImageUrl) + '" alt="QR code เอกสาร ' + escapeHtml_(work.tracking_no) + '">' +
    '<p class="hint">พิมพ์/แปะ QR นี้ไว้บนเอกสาร ใช้สแกนรับงานที่สถานีถัดไป</p>' +
    '<button class="btn-primary no-print" type="button" onclick="window.print()">พิมพ์ QR นี้</button>' +
    '</div>' +
    '<p class="no-print"><a target="_top" href="' + baseUrl + '?page=detail&id=' + encodeURIComponent(work.work_id) + '">&larr; กลับหน้ารายละเอียด</a></p>';
}

/** ครอบหน้าโซนสาธารณะ (ไม่ Login) — topbar เรียบๆ ไม่มี bottom-nav/FAB ของเจ้าหน้าที่ ใช้ CSS ชุดเดียวกับ STAFF_CSS_ */
function renderPublicPage_(title, bodyHtml) {
  var html = '' +
    '<!doctype html><html><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">' +
    '<title>' + escapeHtml_(title) + '</title>' +
    '<style>' + STAFF_CSS_ + PUBLIC_CSS_ + '</style>' +
    '</head><body class="public-body">' +
    '<header class="topbar"><div class="topbar-title">' + escapeHtml_(title) + '</div></header>' +
    '<main class="content">' + bodyHtml + '</main>' +
    LOADING_FEEDBACK_SCRIPT_ +
    '</body></html>';
  return HtmlService.createHtmlOutput(html)
    .setTitle(title)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * ฟอร์มค้นหาผลงานสาธารณะ (2026-09-15 เปลี่ยนจาก tracking_no+last4 เป็นเลขตำแหน่งเดิม/ชื่อ-นามสกุล — ไม่ยืนยัน
 * ตัวตน ดูแชท requirement ส่วน F-H, ยืนยันกับผู้ใช้แล้ว) POST เสมอ (แนวเดียวกับฟอร์มเดิม กันข้อมูลหลุดใน URL)
 */
function renderPublicTrackFormBody_(baseUrl, errors, prevValues) {
  prevValues = prevValues || {};
  var errorHtml = (errors && errors.length)
    ? '<div class="error-banner"><ul>' + errors.map(function (m) { return '<li>' + escapeHtml_(m) + '</li>'; }).join('') + '</ul></div>'
    : '';
  return '' + errorHtml +
    '<div class="detail-card">' +
    '<p>ค้นหาผลงานของท่านด้วยเลขทะเบียน, เลขตำแหน่งเดิม หรือ ชื่อ/นามสกุล (กรอกอย่างน้อย 1 ช่อง)</p>' +
    '<form method="post" target="_top" action="' + baseUrl + '" class="reg-form" style="border:none;padding:0;">' +
    '<input type="hidden" name="form_action" value="search_public">' +
    '<div class="field"><label>เลขทะเบียน</label>' +
    '<input class="input" name="tracking_no" value="' + escapeHtml_(prevValues.tracking_no || '') + '" placeholder="เช่น 69-176 (กรอกบางส่วนก็ได้)"></div>' +
    '<div class="field"><label>เลขตำแหน่งเดิม</label>' +
    '<input class="input" name="position_no" value="' + escapeHtml_(prevValues.position_no || '') + '" placeholder="กรอกถ้าทราบ"></div>' +
    '<div class="field"><label>ชื่อ หรือ นามสกุล</label>' +
    '<input class="input" name="owner_name" value="' + escapeHtml_(prevValues.owner_name || '') + '" placeholder="กรอกอย่างน้อย 1 ช่อง"></div>' +
    '<button class="btn-primary" type="submit">ค้นหา</button>' +
    '</form>' +
    '<p class="pub-back-link"><a target="_top" href="' + baseUrl + '?page=owner-login">เป็นเจ้าของผลงาน? เข้าสู่ระบบเพื่อดูต่อเนื่อง &rarr;</a></p>' +
    '<div class="qr-scan-divider"><span>หรือ</span></div>' +
    '<input type="file" accept="image/*" capture="environment" id="qr-photo-input" data-base-url="' + escapeHtml_(baseUrl) + '" style="display:none">' +
    '<button type="button" id="qr-photo-btn" class="btn-action btn-action-secondary" style="display:none">' +
    'ถ่ายรูป / เลือกรูป QR เพื่อค้นหา</button>' +
    '<p id="qr-photo-msg" class="hint" style="display:none"></p>' +
    '</div>' +
    QR_PHOTO_SCAN_SCRIPT_;
}

/** ผลการค้นหาหลายรายการ (position_no/name ค้นเจอมากกว่า 1) — จำกัดข้อมูลที่แสดง (ข้อ H) ชื่อยัง mask เหมือนเดิม
 *  (A10) เพราะค้นหาแบบนี้ไม่ยืนยันตัวตน คลิกแต่ละแถวไปหน้าเดิมด้วย qr_token เหมือนสแกน QR ทุกประการ (reuse A14) */
function renderPublicSearchResultsBody_(results, baseUrl) {
  var rows = results.map(function (w) {
    var cls = STATUS_PILL_CLASS_[w.current_status_public] || 'pending';
    var label = PUBLIC_STATUS_LABELS[w.current_status_public] || w.current_status_public || '-';
    var maskedName = maskNameForPublic_(w.title_name, w.first_name, w.last_name);
    return '' +
      '<a class="work-row" target="_top" href="' + baseUrl + '?t=' + encodeURIComponent(w.qr_token) + '">' +
      '<div class="work-main"><span class="tracking">' + escapeHtml_(maskedName) + '</span>' +
      '<span class="worktitle">' + escapeHtml_(w.work_title || '-') + ' &middot; ' + escapeHtml_(w.org_from || '-') +
      ' &middot; ' + escapeHtml_(w.tracking_no) + '</span></div>' +
      '<span class="pill pill-' + cls + '">' + escapeHtml_(label) + '</span>' +
      '<span class="pub-search-cta">ดูรายละเอียด/ติดตาม &rarr;</span>' +
      '</a>';
  }).join('');

  return '' +
    '<p class="pub-subheader-label">พบ ' + results.length + ' รายการ' +
    (results.length >= PUBLIC_SEARCH_RESULT_LIMIT_ ? ' (แสดงสูงสุด ' + PUBLIC_SEARCH_RESULT_LIMIT_ + ' รายการแรก — ลองระบุให้เจาะจงขึ้น)' : '') + '</p>' +
    '<section class="metric-card">' + rows + '</section>' +
    '<p class="pub-back-link"><a target="_top" href="' + baseUrl + '">&larr; ค้นหาใหม่</a></p>';
}

/** ปุ่ม "ถ่ายรูป/เลือกรูป QR" บนหน้าตรวจสอบสถานะสาธารณะ — ค้นหาแบบที่ 2 นอกเหนือจากกรอกเลขติดตามเอง
 *  2026-09-08 เปลี่ยนจาก BarcodeDetector (API มาตรฐานเบราว์เซอร์ แต่ Chrome บนเดสก์ท็อป/หลายแพลตฟอร์มไม่มี
 *  จริง แม้ property จะมีอยู่ก็ตาม — ผู้ใช้จริงเจอปัญหาปุ่มไม่ทำงานใน Chrome) มาใช้ไลบรารี jsQR แทน (pure JS,
 *  ถอดรหัสจาก canvas ตรงๆ ไม่พึ่ง browser API ที่ยังรองรับไม่ทั่วถึง — ทำงานได้ในเบราว์เซอร์สมัยใหม่แทบทุกตัว
 *  รวม Chrome desktop) โหลดจาก CDN (jsdelivr) — ถอดรหัสจากรูปที่ถ่าย/เลือกโดยตรง (ไม่ใช้กล้อง live-stream)
 *  รู้จัก QR ทั้งแบบมี URL เต็ม (?t=XXXX) และแบบเก่าที่ยังไม่ได้ตั้งค่า web_app_base_url (แค่ t=XXXX ตรงๆ) */
var QR_PHOTO_SCAN_SCRIPT_ = '' +
  '<script src="https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js"></script>' +
  '<script>' +
  'document.addEventListener("DOMContentLoaded", function () {' +
  'var btn = document.getElementById("qr-photo-btn");' +
  'var input = document.getElementById("qr-photo-input");' +
  'var msg = document.getElementById("qr-photo-msg");' +
  'if (!btn || !input) return;' +
  'btn.style.display = "block";' +
  'btn.addEventListener("click", function () {' +
  'if (typeof jsQR !== "function") {' +
  'msg.style.display = "block";' +
  'msg.textContent = "โหลดตัวอ่าน QR ไม่สำเร็จ (เช็คอินเทอร์เน็ต) กรุณากรอกเลขติดตามด้วยตนเองด้านบนแทน";' +
  'return;' +
  '}' +
  'input.click();' +
  '});' +
  'input.addEventListener("change", function () {' +
  'var file = input.files && input.files[0];' +
  'if (!file) return;' +
  'msg.style.display = "block"; msg.textContent = "กำลังอ่าน QR Code จากรูป...";' +
  'var img = new Image();' +
  'var objectUrl = URL.createObjectURL(file);' +
  'img.onload = function () {' +
  'var canvas = document.createElement("canvas");' +
  'canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;' +
  'var ctx = canvas.getContext("2d");' +
  'ctx.drawImage(img, 0, 0);' +
  'var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);' +
  'URL.revokeObjectURL(objectUrl);' +
  'var result = jsQR(imageData.data, imageData.width, imageData.height);' +
  'if (!result) { msg.textContent = "ไม่พบ QR Code ในรูปภาพ กรุณาลองใหม่ หรือกรอกเลขติดตามด้วยตนเองด้านบน"; return; }' +
  'var m = result.data.match(/(?:^|[?&])t=([A-Za-z0-9]+)/);' +
  'if (!m) { msg.textContent = "รูปนี้ไม่ใช่ QR ของระบบตรวจสอบผลงานวิชาการ"; return; }' +
  // location.href ในนี้คือ URL ของ iframe sandbox (googleusercontent.com) ไม่ใช่ URL จริงของ Web App —
  // ต้องใช้ baseUrl ที่ฝั่ง server คำนวณมาให้ (getWebAppUrl_) ผ่าน data-base-url แทนเสมอ
  'var target = input.dataset.baseUrl + "?t=" + encodeURIComponent(m[1]);' +
  // iframe sandbox ของ HtmlService บางครั้งบล็อก top-navigation ที่สั่งจาก JS แบบ async (หลุด user-activation
  // window ไปแล้วตอน image decode เสร็จ) — ลองสั่งไปเลยเผื่อได้ พร้อมโชว์ลิงก์ตัวจริงคลิกเองไว้กันค้าง
  // (ลิงก์ target=_top ธรรมดาผ่านสิทธิ์เสมอ เพราะนับเป็น user gesture ใหม่ตอนคลิก — pattern เดียวกับทั้งระบบ)
  'msg.innerHTML = "พบ QR แล้ว — <a target=\\"_top\\" href=\\"" + target + "\\" style=\\"font-weight:700;color:var(--teal)\\">กดที่นี่เพื่อดูสถานะเอกสาร</a>";' +
  'try { window.top.location.href = target; } catch (navErr) { /* เงียบไว้ ใช้ลิงก์ข้างบนแทน */ }' +
  '};' +
  'img.onerror = function () { URL.revokeObjectURL(objectUrl); msg.textContent = "เปิดไฟล์รูปนี้ไม่สำเร็จ กรุณาลองใหม่ หรือกรอกเลขติดตามด้วยตนเองด้านบน"; };' +
  'img.src = objectUrl;' +
  '});' +
  '});' +
  '</script>';

/**
 * "ติดตามผลงานของฉัน" — หน้าผลตรวจสอบสถานะสาธารณะ (2026-09-15 จัดลำดับใหม่ตามแชท requirement ส่วน M):
 * ชื่อเจ้าของผลงาน+ชื่อผลงาน (บนสุด) → สถานะปัจจุบัน (ใหญ่สุด, hero) → สิ่งที่ต้องดำเนินการ → ผู้รับผิดชอบ+เวลาที่รับ
 * → เขตรับเรื่องเมื่อ → ส่งต่อผู้ว่าเมื่อ (ถ้ามี) → Timeline → รายละเอียดที่เหลือ → หมายเหตุ — Read-only, mobile-first
 * เฉพาะฟิลด์ที่เปิดเผยได้ (ชื่อปกปิดบางส่วนตาม A10 เสมอ — ไม่มี audit log/ปุ่มแก้ไข/ข้อมูลคนอื่น)
 * data = { revisionInfo, steps, currentStation, latestNote, governorForwardDate } จาก buildPublicResultData_ (PublicTrack.gs)
 */
/**
 * "ข้อมูลสำคัญ" — Mini Important Info Grid 2x2 (2026-09-24 redesign รอบ compact): รวม "ผู้รับผิดชอบปัจจุบัน"
 * (ผู้รับผิดชอบ/รับงานเมื่อ — เดิมเป็นการ์ดแยก pub-owner-card) เข้ากับ "วันที่สำคัญ" (รับเรื่องเมื่อ/ส่งให้ผู้ว่า —
 * เดิม renderPubDateGrid_) ให้เหลือ grid เดียว การ์ดเดียว ลด section ที่ซ้อนกันตามที่ผู้ใช้ขอ (ข้อ 6/15) reuse
 * ทั้งหน้าสาธารณะและหน้า staff — items: [{label, value}] เสมอ 4 รายการตามลำดับที่ผู้ใช้ระบุ (ข้อ 6)
 */
function renderPubInfoGrid_(items) {
  return '' +
    '<div class="pub-date-section-title">ข้อมูลสำคัญ</div>' +
    '<div class="pub-date-grid pub-info-grid-4">' +
    items.map(function (it) {
      return '<div class="pub-date-card"><div class="pub-date-label">' + escapeHtml_(it.label) + '</div>' +
        '<div class="pub-date-value">' + escapeHtml_(it.value || '-') + '</div></div>';
    }).join('') +
    '</div>';
}

/**
 * การ์ด "สถานะปัจจุบัน" (Compact Status Card) — reuse ทั้งหน้าสาธารณะและหน้า staff (2026-09-24 รอบ 2 ตามที่
 * ผู้ใช้ขอ) ลำดับเนื้อหา: ป้าย "สถานะปัจจุบัน" -> "ขั้นตอนที่ N" -> ชื่อสถานะหลัก (เด่นสุด) -> ผลการพิจารณา/
 * สถานะย่อย (เฉพาะ state ทศนิยมที่มี parent จริง, badge สีตามคำในชื่อจริง: ผ่าน=เขียว/แก้ไข=เหลือง/ไม่ผ่าน=แดง) ->
 * ผู้รับผิดชอบ -> วันที่-เวลาอัปเดตล่าสุด (รูปแบบไทยย่อ) -> ขั้นตอนถัดไป (ไม่เดา — ไม่มีให้แสดงถ้าจุดแตกสาย/จบแล้ว)
 * buildHeroDisplayInfo_/findNextStepDisplay_ (PublicTrack.gs) หา "สถานะหลัก" จากข้อมูลจริงเสมอ ไม่ hardcode
 */
function renderPubHero_(work, currentStation, stationsMap, steps, friendlyMode) {
  var cls = STATUS_PILL_CLASS_[work.current_status_public] || 'pending';
  var info = buildHeroDisplayInfo_(currentStation, stationsMap || {});

  // 2026-10-08 ตามที่ผู้ใช้ขอ — friendlyMode (หน้า Owner Dashboard เท่านั้น) ใช้ OWNER_STATE_LABELS_ แทน
  // station_name ภายในทั้งหมด (ownerLabelForStation_, PublicTrack.gs) ไม่แสดงเลข state/ข้อความวงเล็บภายใน
  // เลยแม้แต่น้อย — info.isSub=false ครอบคลุมทั้ง state หลักจริง (s1/s2/s4 ฯลฯ) และ state ย่อยที่ไม่มี parent
  // บาง (s8_1..s8_6/s9_1..s9_4) เหมือนกัน ownerLabelForStation_(currentStation) จึงใช้ได้ถูกทั้ง 2 กรณี
  var mainLabelText = friendlyMode ? ownerLabelForStation_(info.isSub ? info.parentStation : currentStation) : info.stepSplit.main;
  var bodyHtml = '' +
    (friendlyMode ? '' : '<div class="pub-hero-step-label">ขั้นตอนที่ ' + escapeHtml_(info.stepOrder) + '</div>') +
    '<div class="pub-hero-main">' + escapeHtml_(mainLabelText) + '</div>' +
    (!friendlyMode && info.stepSplit.desc ? '<div class="pub-hero-desc">' + escapeHtml_(info.stepSplit.desc) + '</div>' : '');
  // 2026-10-07 friendlyMode — ข้อความอธิบายสถานะแบบภาษาคน (ข้อ 4) ดึงจาก WorkflowStates.public_hint ของ
  // สถานีปัจจุบันจริง (field ที่มีอยู่แล้ว Admin แก้ไขได้จากหน้า "จัดการ Workflow" โดยไม่ต้องแก้โค้ด) ไม่ได้
  // แต่งข้อความเองทุก state (ห้ามเดา — ตอนนี้มีค่าแค่บาง state ที่เกี่ยวกับการแก้ไขเอกสาร) ถ้าว่างไม่แสดงอะไรเลย
  if (friendlyMode && currentStation && currentStation.public_hint) {
    bodyHtml += '<div class="pub-hero-hint">' + escapeHtml_(currentStation.public_hint) + '</div>';
  }
  if (info.isSub) {
    // 2026-10-08 friendlyMode — บรรทัด "ผลการพิจารณา" ใช้ owner label ของ sub-state เอง (OWNER_STATE_LABELS_)
    // แทนชื่อ station ภายใน ไม่มีเลข state (7.1/7.4) ปนเลยแม้แต่น้อย (ตามที่ผู้ใช้ขอรอบนี้)
    var subLabelText = friendlyMode ? ownerLabelForStation_(info.subStation) : (info.subOrder + ' ' + info.subSplit.main);
    bodyHtml += '' +
      '<div class="pub-hero-sub-row"><span class="pub-hero-sub-label">ผลการพิจารณา</span>' +
      '<span class="pub-hero-sub-badge pub-hero-sub-' + info.subTone + '">' +
      escapeHtml_(subLabelText) + '</span></div>' +
      (!friendlyMode && info.subSplit.desc ? '<div class="pub-hero-desc">' + escapeHtml_(info.subSplit.desc) + '</div>' : '');
  }

  var ownerText = work.handoff_pending ? '(รอสแกนรับเอกสาร)' : (work.current_owner_org || '-');
  // 2026-10-07 friendlyMode (หน้า Owner Dashboard เท่านั้น) — เปลี่ยนจาก label/value แยกฝั่งซ้าย-ขวา เป็น
  // บรรทัดเดียว "ผู้รับผิดชอบ :: ค่า" (ตัวหนา) ตามที่ผู้ใช้ขอ แสดง work.current_owner_org จริงตรงๆ ไม่แก้ field/
  // logic ใดๆ หน้าสาธารณะ/เจ้าหน้าที่ยังเป็น layout เดิม (label ซ้าย/value ขวา)
  bodyHtml += friendlyMode
    ? '<div class="pub-hero-meta-row pub-hero-meta-inline">ผู้รับผิดชอบ :: <b class="pub-hero-meta-value-inline">' + escapeHtml_(ownerText) + '</b></div>'
    : '<div class="pub-hero-meta-row"><span class="pub-hero-meta-label">ผู้รับผิดชอบ</span>' +
      '<span class="pub-hero-meta-value">' + escapeHtml_(ownerText) + '</span></div>';
  bodyHtml += '<div class="pub-hero-updated">อัปเดตล่าสุด ' + escapeHtml_(formatDateThShort_(work.updated_at)) + '</div>';

  var nextStep = findNextStepDisplay_(steps, stationsMap || {});
  if (nextStep) {
    // friendlyMode (ข้อ 3/7) — ป้าย "ถัดไป" แทน "ขั้นตอนถัดไป" และไม่แสดงเลข state นำหน้าชื่อ 2026-10-08:
    // ใช้ owner label ของ nextStep.station แทน station_name ภายใน (fallback เป็น nextStep.split.main เดิม
    // เฉพาะกรณีไม่มี station object จริง — เคสหายากมาก ดู findNextStepDisplay_)
    var nextLabelText = friendlyMode ? (nextStep.station ? ownerLabelForStation_(nextStep.station) : nextStep.split.main) : nextStep.split.main;
    bodyHtml += '<div class="pub-hero-next-row"><span class="pub-hero-next-label">' + (friendlyMode ? 'ถัดไป' : 'ขั้นตอนถัดไป') + '</span>' +
      '<span class="pub-hero-next-value">' + (friendlyMode ? '' : escapeHtml_(nextStep.order) + ' ') + escapeHtml_(nextLabelText) + '</span></div>';
  }

  return '' +
    '<div class="pub-hero pub-hero-' + cls + '">' +
    '<div class="pub-hero-label">สถานะปัจจุบัน</div>' +
    bodyHtml +
    '</div>';
}

/** กล่องแจ้งข้อมูล Legacy เล็กๆ (ไม่แย่งความเด่นจากสถานะปัจจุบัน) แทนข้อความยาวกลางหน้าแบบเดิม (2026-09-24) */
function renderPubLegacyInfoBox_() {
  return '<div class="pub-info-box"><b>&#9432; ข้อมูลเดิม</b><span>ข้อมูลก่อนเริ่มใช้ระบบออนไลน์อาจไม่มีรายละเอียด Timeline ครบทุกขั้นตอน</span></div>';
}

function renderPublicResultBody_(work, data, baseUrl) {
  var maskedName = maskNameForPublic_(work.title_name, work.first_name, work.last_name);

  // ลำดับหัวหน้า (2026-09-24 ตามที่ผู้ใช้ขอ): ชื่อเจ้าของผลงาน (เด่นสุด) -> เลขทะเบียน (รอง, muted) -> ชื่อผลงาน
  var nameBlockHtml = '' +
    '<div class="pub-name-block">' +
    '<div class="pub-name-owner">' + escapeHtml_(maskedName) + '</div>' +
    '<div class="pub-name-tracking">เลขทะเบียน ' + escapeHtml_(work.tracking_no) + '</div>' +
    '<div class="pub-name-title">ชื่อผลงาน: ' + escapeHtml_(work.work_title || '-') + '</div>' +
    '</div>';

  var heroHtml = renderPubHero_(work, data.currentStation, data.stationsMap, data.steps);

  var actionHtml = work.next_step_text
    ? '<div class="pub-action-box"><div class="pub-action-title">สิ่งที่ต้องดำเนินการ</div><p>' + escapeHtml_(work.next_step_text) + '</p></div>'
    : '';

  // Mini Important Info Grid (2026-09-24 redesign รอบ compact) — รวมผู้รับผิดชอบ+วันที่สำคัญไว้ grid เดียว
  // (เดิมแยก 2 การ์ด: pub-owner-card "ผู้รับผิดชอบปัจจุบัน" + renderPubDateGrid_ "วันที่สำคัญ")
  var infoGridHtml = renderPubInfoGrid_([
    { label: 'ผู้รับผิดชอบ', value: work.handoff_pending ? '(รอสแกนรับเอกสาร)' : (work.current_owner_org || '-') },
    { label: 'รับงานเมื่อ', value: formatDateThShort_(work.updated_at) },
    { label: 'รับเรื่องเมื่อ', value: formatDateThShort_(work.received_date) },
    { label: 'ส่งให้ผู้ว่า', value: data.governorForwardDate ? formatDateThShort_(data.governorForwardDate) : 'ยังไม่ส่งให้ผู้ว่า' },
  ]);

  var progressHtml = data.progressSummary ? renderPubProgressSummary_(data.progressSummary) : '';
  // 2026-10-15 ตามที่ผู้ใช้ขอ — Public Search (หน้านี้) เปลี่ยนจาก Timeline เต็ม 1-10 (renderPubTimelineSection_
  // เดิม) เป็น Timeline ย่อแบบเข้าใจง่าย (buildOwnerRevisionTimeline_, PublicTrack.gs) เหมือน Owner Dashboard
  // — หน้า Staff/Admin (renderWorkDetailBody_) ยังใช้ renderPubTimelineSection_(data.fixedTimeline) เดิมเป๊ะ
  // ไม่ถูกแตะ (คนละจุดเรียก ไม่ใช่ shared call site)
  // 2026-10-28 ตามข้อกำหนดล่าสุด — ทุกเส้นทางต้องแสดง 8 ขั้นตอนเสมอ (ดูเหตุผลเต็มที่ buildOwnerRevisionTimeline_,
  // PublicTrack.gs) เลิกแยก branch 4-milestone (buildOwnerMilestoneTimeline_) แล้ว — Public Search ใช้ builder
  // ชุดเดียวกับ Owner Dashboard เป๊ะ ไม่มี logic แยก
  var ownerMilestones = buildOwnerRevisionTimeline_(data.steps, data.stationsMap, work);
  var timelineHtml = renderOwnerMilestoneTimelineSection_(ownerMilestones);
  if (data.isLegacyImportOnly) timelineHtml += renderPubLegacyInfoBox_();

  var ownerHtml = '' +
    '<div class="pub-owner-card">' +
    '<div class="pub-owner-title">ข้อมูลผลงาน</div>' +
    renderPubOwnerRow_('หน่วยงาน', work.org_from) +
    renderPubOwnerRow_('ตำแหน่ง', work.position) +
    renderPubOwnerRow_('ประเภทผลงาน', work.work_type) +
    '</div>';

  var noteHtml = '';
  if (work.current_status_public === 'need_revision' && data.revisionInfo) {
    // 2026-10-28 รอบ 18 — เหมือน renderOwnerDashboardBody_ (OwnerAuth.gs) เป๊ะ ทำ parity กับ Owner Dashboard
    // ตามหลักการเดิมของโปรเจกต์ (เช่นรอบ 59 C6 ที่ยืนยันว่า Public Search ต้องเห็นวันครบกำหนดแก้ไขเหมือน Owner
    // Dashboard) — ดูคอมเมนต์เต็มที่ renderOwnerDashboardBody_
    var revisionDurationHtml = '';
    var resolvedForRevisionBox = getResolvedFirstRoundStep_(data.steps);
    if (resolvedForRevisionBox && (resolvedForRevisionBox.key === 's7_2' || resolvedForRevisionBox.key === 's7_3')) {
      var revisionMonthsText = resolvedForRevisionBox.key === 's7_2' ? '2 เดือน' : '6 เดือน';
      var revisionDueText = formatDateDDMMYYYYBuddhist_(work.revision_due_date);
      revisionDurationHtml = '<p><b>เริ่มกระบวนการแก้ไข (' + revisionMonthsText + ')' +
        (revisionDueText ? ' ภายในวันที่ ' + escapeHtml_(revisionDueText) : '') + '</b></p>';
    }
    noteHtml = '' +
      '<div class="revision-box">' +
      '<p class="revision-title">รายการที่ต้องแก้ไข</p>' +
      '<p>' + escapeHtml_(data.revisionInfo.reasons || '-') + '</p>' +
      revisionDurationHtml +
      (data.revisionInfo.due_date ? '<p>กรุณาส่งฉบับแก้ไขกลับภายใน <b>' + escapeHtml_(data.revisionInfo.due_date) + '</b></p>' : '') +
      '</div>';
  } else if (data.latestNote) {
    noteHtml = '' +
      '<div class="pub-note-box"><div class="pub-note-title">หมายเหตุจากผู้รับผิดชอบ</div><p>' + escapeHtml_(data.latestNote) + '</p></div>';
  }

  return '' +
    '<div class="pub-compact">' +
    nameBlockHtml + heroHtml + actionHtml + infoGridHtml + progressHtml + timelineHtml + ownerHtml + noteHtml +
    '<p class="pub-back-link"><a target="_top" href="' + baseUrl + '">&larr; ตรวจสอบรายการอื่น</a></p>' +
    '</div>';
}

function renderPubOwnerRow_(label, value) {
  return '<div class="pub-owner-row"><span class="pub-owner-label">' + escapeHtml_(label) + '</span>' +
    '<span class="pub-owner-value">' + escapeHtml_(value || '-') + '</span></div>';
}

/**
 * Timeline หลัก 10 ขั้นตอนคงที่ (2026-09-24 ตามที่ผู้ใช้ขอรอบใหม่) — แสดงขั้นตอนที่ 1-10 เสมอ ไม่หยุดที่จุดแตกสาย
 * แบบเดิมอีกต่อไป ✓ เขียว = ผ่านแล้ว / ● กรมท่า = ปัจจุบัน (badge "สถานะปัจจุบัน") / ○ เทา = ยังไม่ถึง (ข้อความ
 * "รอดำเนินการ" เท่านั้น ไม่มีผู้รับผิดชอบ/วันที่ปลอม) ขั้นตอนที่ 10 มี badge เพิ่ม "ขั้นตอนสุดท้าย" เสมอ
 * ขั้นตอนปัจจุบันที่เป็น state ทศนิยม (เช่น 7.1) แสดงบรรทัด "└ ผลการพิจารณา: 7.1 ผ่าน" ซ้อนอยู่ใต้ชื่อขั้นตอน
 * หลัก สีตามคำในชื่อจริง (ผ่าน=เขียว/แก้ไข=เหลือง/ไม่ผ่าน=แดง) — ไม่ใช่ขั้นตอนหลักแยกต่างหาก
 */
function renderPubFixedTimelineItem_(entry) {
  var icon = entry.state === 'current' ? '●' : (entry.state === 'done' ? '✓' : '○');
  var badges = '';
  if (entry.state === 'current') badges += '<span class="pub-tl-badge">สถานะปัจจุบัน</span>';
  if (entry.isLastStep) badges += '<span class="pub-tl-badge pub-tl-badge-last">ขั้นตอนสุดท้าย</span>';

  var metaHtml;
  if (entry.state === 'upcoming') {
    metaHtml = '<span class="pub-tl-meta pub-tl-meta-pending">รอดำเนินการ</span>';
  } else {
    metaHtml = (entry.org || entry.enteredAt)
      ? '<span class="pub-tl-meta">' +
        (entry.org ? 'ผู้รับผิดชอบ: ' + escapeHtml_(entry.org) : '') +
        (entry.org && entry.enteredAt ? ' — ' : '') +
        (entry.enteredAt ? escapeHtml_(formatDateThShort_(entry.enteredAt)) : '') +
        '</span>'
      : '';
  }

  var subHtml = entry.sub
    ? '<span class="pub-tl-sub-row">&#9492; <span class="pub-tl-sub-label">ผลการพิจารณา:</span> ' +
      '<span class="pub-tl-sub-badge pub-hero-sub-' + entry.sub.tone + '">' +
      escapeHtml_(entry.sub.order) + ' ' + escapeHtml_(entry.sub.split.main) + '</span></span>'
    : '';

  return '<div class="pub-tl-item pub-tl-' + entry.state + '">' +
    '<span class="pub-tl-icon">' + icon + '</span>' +
    '<span class="pub-tl-text"><b>ขั้นตอนที่ ' + escapeHtml_(entry.order) + '</b> ' + escapeHtml_(entry.split.main) +
    badges + metaHtml + subHtml + '</span></div>';
}

function renderPubFixedTimeline_(fixedSteps) {
  return '<div class="pub-timeline">' + fixedSteps.map(renderPubFixedTimelineItem_).join('') + '</div>';
}

/**
 * รายการเดียวของ Timeline 4 "milestone" (2026-10-15 ตามที่ผู้ใช้ขอ) — ใช้เฉพาะ Owner Dashboard/Public Search
 * (buildOwnerRevisionTimeline_, PublicTrack.gs) หน้า Staff/Admin (renderWorkDetailBody_) ยังใช้
 * renderPubFixedTimelineItem_/buildFixedMainTimeline_ เดิม 1-10 เต็มไม่ถูกแตะเลย ไอคอน/badge/
 * "รอดำเนินการ"/"ขั้นตอนถัดไป" ใช้ convention เดียวกับ Timeline เดิมทุกจุด (reuse class .pub-tl-*) ผลการพิจารณา
 * ที่ step 3 (entry.outcome, ถ้ามี) ใช้ไอคอน+สีตาม tone เดียวกับการ์ด "ผลการพิจารณา" (owner-result-outcome-*)
 * 2026-10-28 ตามข้อกำหนดล่าสุด — เพิ่ม entry.skipped (step 4-7 ตอนผลเป็น "ผ่าน"/"ไม่ผ่าน" ตรง ไม่มีการแก้ไขจริง)
 * reuse class .owner-tl-skip เดิม (เคยใช้กับ renderOwnerFullDetailItem_ อยู่แล้ว ไม่สร้าง CSS ใหม่) + เพิ่ม 4 tone
 * ใหม่ (pass/revision2/revision3/fail) ให้ entry.outcome
 */
function renderOwnerMilestoneItem_(entry) {
  var icon = entry.state === 'current' ? '&#9679;' : (entry.state === 'done' ? '&#10003;' : '&#9675;');
  var stateClass = entry.skipped ? 'upcoming owner-tl-skip' : entry.state;
  var badges = '';
  if (entry.state === 'current') badges += '<span class="pub-tl-badge">สถานะปัจจุบัน</span>';
  if (entry.isLastStep) badges += '<span class="pub-tl-badge pub-tl-badge-last">ขั้นตอนสุดท้าย</span>';

  var outcomeHtml = '';
  if (entry.outcome) {
    var iconByTone = {
      done: '&#10003;', danger: '&#10007;', revision: '&#9888;', pending: '',
      pass: '&#10003;', revision2: '&#9888;', revision3: '&#9888;', fail: '&#10007;',
    };
    outcomeHtml = '<div class="owner-result-outcome owner-result-outcome-' + entry.outcome.tone + '">' +
      '<span class="owner-result-outcome-icon">' + iconByTone[entry.outcome.tone] + '</span> ' + escapeHtml_(entry.outcome.text) + '</div>';
    // 2026-10-21 ตามข้อแก้ไขผู้บริหาร — บรรทัด "ภายในวันที่ :: dd/mm/yyyy" ต่อท้าย (เฉพาะ s7_2/s7_3 ที่มีวัน
    // ครบกำหนดแก้ไขจริงเท่านั้น — buildOwnerRevisionTimeline_ เป็นผู้กำหนด entry.outcome.dueDateText)
    if (entry.outcome.dueDateText) {
      outcomeHtml += '<div class="owner-result-outcome-duedate">ภายในวันที่ :: ' + escapeHtml_(entry.outcome.dueDateText) + '</div>';
    }
  }

  var metaHtml = entry.skipped
    ? '<span class="owner-tl-skip-reason">' + escapeHtml_(entry.skipReason || 'ไม่ใช้ในกรณีนี้') + '</span>'
    : entry.state === 'upcoming'
      ? '<span class="pub-tl-meta pub-tl-meta-pending">' + (entry.isNext ? 'ขั้นตอนถัดไป' : 'รอดำเนินการ') + '</span>'
      : '';

  return '<div class="pub-tl-item pub-tl-' + stateClass + '">' +
    '<span class="pub-tl-icon">' + icon + '</span>' +
    '<span class="pub-tl-text">' +
    '<div class="owner-tl-station-name">ขั้นตอนที่ ' + entry.order + ' ' + escapeHtml_(entry.label) + badges + '</div>' +
    outcomeHtml + metaHtml +
    '</span></div>';
}

/** Timeline 4 milestone แบบไม่ยุบ/ขยาย (ใช้หน้า Public Search — ต่างจาก Owner Dashboard ที่มี
 *  <details>/<summary> ยุบเก็บได้ของตัวเอง ดู renderOwnerTimelineSection_, OwnerAuth.gs) */
function renderOwnerMilestoneTimelineSection_(milestones) {
  if (!milestones) return '';
  return '<div class="owner-tl-section-title">เส้นทางการดำเนินงาน</div>' +
    '<div class="owner-tl-wrap"><div class="pub-timeline">' +
    milestones.map(renderOwnerMilestoneItem_).join('') + '</div></div>';
}

/** ห่อ Timeline 10 ขั้นตอนไว้ใน <details open> — เปิดแสดงครบทุกขั้นตอนตามค่าเริ่มต้น (ข้อ 11: Desktop ต้องเห็น
 *  ครบ 10 ขั้นตอนแนวตั้ง) ปุ่ม/ป้าย "ดู Timeline ทั้งหมด 10 ขั้นตอน" ใช้ <details>/<summary> มาตรฐานไม่มี JS
 *  พับเก็บได้เองทั้ง desktop/mobile (ข้อ 12/13) — เหลือ Timeline ชุดเดียว ไม่มีของย่อซ้ำอีกแล้ว (ข้อ 10) */
function renderPubTimelineSection_(fixedSteps) {
  if (!fixedSteps) return '';
  return '<details class="pub-tl-full-details" open><summary>ดู Timeline ทั้งหมด 10 ขั้นตอน</summary>' +
    renderPubFixedTimeline_(fixedSteps) + '</details>';
}

/** หน้าสแกน QR — ยังไม่มี token (เข้าจากเมนู ไม่ใช่จากลิงก์ QR) — กรอกรหัสเองได้กรณีกล้องอ่านไม่ออก */
function renderScanEntryBody_(baseUrl, errorMsg) {
  var errorHtml = errorMsg ? '<div class="error-banner">' + escapeHtml_(errorMsg) + '</div>' : '';
  return '' + errorHtml +
    '<div class="stub">' +
    '<p>เปิดกล้องมือถือสแกน QR บนเอกสาร ระบบจะเปิดหน้ารับงานนี้ให้อัตโนมัติ</p>' +
    '<p>หรือกรอกรหัส QR ด้วยตนเอง (8 ตัวอักษร ใต้ QR บนเอกสาร):</p>' +
    '<form method="get" target="_top" action="' + baseUrl + '" class="search-form">' +
    '<input type="hidden" name="page" value="scan">' +
    '<input class="input" type="text" name="t" placeholder="รหัส QR 8 ตัว" maxlength="8" autocapitalize="characters">' +
    '<button class="btn-primary" type="submit">ค้นหา</button>' +
    '</form></div>';
}

/**
 * การ์ดสรุปงาน + ปุ่มเปลี่ยนสถานะ (2026-09-24 ปรับให้สอดคล้องกับหน้าค้นหา/หน้ารายละเอียดตามที่ผู้ใช้ขอ) — reuse
 * building block เดียวกับ renderWorkDetailBody_/renderPublicResultBody_ ทั้งหมด (renderPubHero_/renderPubInfoGrid_/
 * renderPubProgressSummary_/renderPubTimelineSection_ ผ่าน buildPublicResultData_) แทนการ์ด detail-row แบบเดิม
 * ที่มีแค่ 4 บรรทัด ไม่มี Timeline/ความคืบหน้า — คำว่า "สถานีปัจจุบัน" เปลี่ยนเป็น "สถานะปัจจุบัน" ให้ตรงกับคำที่
 * ใช้ทั้งระบบ (มาจาก renderPubHero_ เดียวกันอยู่แล้ว ไม่ต้องเขียนแยก) ปุ่มเปลี่ยนสถานะ (จาก computeEligibleTransitions_)
 * + ปุ่ม utility action เสริม (more_info/terminated/closed/reassigned) วางไว้ระหว่างการ์ดสถานะกับ Progress/Timeline
 * ตามที่ผู้ใช้ระบุ — business logic ของปุ่ม/การ scan ไม่แตะเลย
 */
/**
 * 2026-10-08 — redesign "หน้า Workflow Action" ตามที่ผู้ใช้ขอ: 3 ส่วน A(ข้อมูลเอกสารย่อ) B(เปลี่ยนสถานะ —
 * checklist ✓ผ่านแล้ว/●ปัจจุบัน/[ ]กดได้/○ยังไม่ถึง + ยืนยันแบบ inline ไม่เปลี่ยน state ทันที) C(ลิงก์ประวัติ)
 * reuse data.steps (buildPublicDetailedSteps_, เดินเส้นทางจริงเหมือน Owner Dashboard เป๊ะ — ไม่สร้าง logic
 * คู่ขนาน) + eligibleTransitions (computeEligibleTransitions_ เดิม, ตรวจสิทธิ์/allowed-state ซ้ำฝั่ง server
 * อยู่แล้วตอน submit จริง) ส่วน "การดำเนินการเพิ่มเติม" (ปิดงาน/เปลี่ยนผู้รับผิดชอบ/more_info) ย้ายเข้า
 * <details> ไม่ให้เด่นเท่าปุ่ม workflow หลัก (ข้อ 12/13) ฟอร์ม action เดิม (renderActionFormBody_) ยังทำงาน
 * เหมือนเดิมทุกประการ ไม่แตะ — แค่ลิงก์เข้าถึงย้ายที่
 */
function renderScanWorkBody_(ss, work, eligible, eligibleTransitions, baseUrl, token, errors) {
  var errorHtml = (errors && errors.length)
    ? '<div class="error-banner"><ul>' + errors.map(function (m) { return '<li>' + escapeHtml_(m) + '</li>'; }).join('') + '</ul></div>'
    : '';

  var ownerName = ((work.title_name || '') + (work.first_name || '') + ' ' + (work.last_name || '')).trim();
  var data = buildPublicResultData_(ss, work);
  var stationsMap = data.stationsMap;

  // A. ข้อมูลเอกสารย่อ — ชื่อ/เลขทะเบียน/ชื่อผลงาน/วันที่รับผลงาน (ตัวเดียวกับ formatOwnerReceivedDate_ ที่ใช้
  // ในหน้า "ผลงานของฉัน" — ซ่อนเวลาถ้าไม่มีเวลาจริง) ต่อด้วยกรอบสถานะปัจจุบัน (renderPubHero_ เดิม มีทั้งสถานะ
  // ปัจจุบัน+ผู้รับผิดชอบอยู่แล้ว ไม่สร้างกรอบใหม่ซ้ำ)
  var nameBlockHtml = '' +
    '<div class="pub-name-block">' +
    '<div class="pub-name-owner">' + escapeHtml_(ownerName || '-') + '</div>' +
    '<div class="pub-name-tracking">เลขทะเบียน ' + escapeHtml_(work.tracking_no) + '</div>' +
    '<div class="pub-name-title">ชื่อผลงาน: ' + escapeHtml_(work.work_title || '-') + '</div>' +
    '<div class="pub-name-received">วันที่รับผลงาน: ' + escapeHtml_(formatOwnerReceivedDate_(work.received_date)) + '</div>' +
    '</div>';

  // 2026-10-20 — "ข้อมูลหนังสือนำส่ง" (เลขหนังสือนำส่ง/วันที่ส่งหนังสือ/วันที่ธุรการรับเรื่อง) แสดงเฉพาะตอนมี
  // ข้อมูลจริงอย่างน้อย 1 ช่อง (งานเก่า/งานที่ยังไม่มีหนังสือนำส่งจะไม่เห็น section นี้เลย ไม่โชว์ "-" ว่างเปล่า)
  var hasForwardingInfo = !!(work.forwarding_book_no || work.forwarding_book_date || work.admin_received_date);
  var forwardingInfoHtml = hasForwardingInfo
    ? '<div class="wf-section-title">ข้อมูลหนังสือนำส่ง</div>' +
      (work.forwarding_book_no ? '<div class="detail-row"><span class="detail-label">เลขหนังสือนำส่ง</span><span class="detail-value">' + escapeHtml_(work.forwarding_book_no) + '</span></div>' : '') +
      (work.forwarding_book_date ? '<div class="detail-row"><span class="detail-label">วันที่ส่งหนังสือ</span><span class="detail-value">' + escapeHtml_(formatDateDDMMYYYYBuddhist_(work.forwarding_book_date)) + '</span></div>' : '') +
      (work.admin_received_date ? '<div class="detail-row"><span class="detail-label">วันที่ธุรการรับเรื่อง</span><span class="detail-value">' + escapeHtml_(formatDateDDMMYYYYBuddhist_(work.admin_received_date)) + '</span></div>' : '')
    : '';

  var heroHtml = renderPubHero_(work, data.currentStation, stationsMap, data.steps);

  // B. เปลี่ยนสถานะ — checklist: done -> current -> [ปุ่มกดได้ x N จาก eligibleTransitions] -> locked (steps
  // ที่เหลือจาก data.steps ตัดตัวที่ซ้ำกับปุ่มกดได้ออก กันโชว์ซ้ำ)
  var currentStationName = data.currentStation ? splitStationNameDesc_(data.currentStation.station_name).main : '';
  var eligibleToKeys = eligibleTransitions.map(function (t) { return t.to_state; });

  var checklistRowsHtml = '';
  var confirmPanelsHtml = '';
  if (data.steps) {
    data.steps.forEach(function (s) {
      if (s.state === 'done') {
        checklistRowsHtml += '<div class="wf-step wf-step-done"><div class="wf-step-icon">&#10003;</div>' +
          '<div class="wf-step-label">' + escapeHtml_(s.name) + '</div></div>';
      } else if (s.state === 'current') {
        checklistRowsHtml += '<div class="wf-step wf-step-current"><div class="wf-step-icon">&#9679;</div>' +
          '<div><div class="wf-step-label">' + escapeHtml_(s.name) + '</div>' +
          '<span class="wf-step-badge">สถานะปัจจุบัน</span></div></div>';
      } else if (eligibleToKeys.indexOf(s.key) === -1) { // upcoming ที่ไม่ใช่ปุ่มกดได้ -> locked
        checklistRowsHtml += '<div class="wf-step wf-step-locked"><div class="wf-step-icon">&#9675;</div>' +
          '<div><div class="wf-step-label">' + escapeHtml_(s.name) + '</div>' +
          (s.org ? '<span class="wf-step-locked-resp">อยู่ในความรับผิดชอบของ ' + escapeHtml_(s.org) + '</span>' : '') +
          '</div></div>';
      }
    });
  }

  eligibleTransitions.forEach(function (t) {
    var targetStation = stationsMap[t.to_state];
    var targetName = targetStation ? splitStationNameDesc_(targetStation.station_name).main : t.to_state;
    var confirmId = 'wf-confirm-' + t.transition_id;
    checklistRowsHtml += '' +
      '<button type="button" class="wf-step-actionable" data-confirm-target="' + escapeHtml_(confirmId) + '">' +
      '<span class="wf-step-actionable-label">' + escapeHtml_(t.button_label) + '</span>' +
      '<span class="wf-step-actionable-hint">กดเพื่ออัปเดตเป็นขั้นตอนนี้</span>' +
      '</button>';

    // 2026-10-21 ตามข้อแก้ไขผู้บริหาร — transition ไป s7_2/s7_3 ("แก้ไข 2/6 เดือน") ต้องบังคับให้เจ้าหน้าที่เลือก
    // "วันครบกำหนดแก้ไข" เองจากปฏิทินก่อนบันทึกเสมอ (เช็คจาก t.to_state จริง ไม่ใช่ label — กันกระทบ transition อื่น)
    var dueDateFieldHtml = REVISION_DUE_DATE_STATE_KEYS_[t.to_state]
      ? '<div class="field"><label>วันครบกำหนดแก้ไข</label>' +
        '<input class="input" type="date" name="revision_due_date" required></div>'
      : '';

    confirmPanelsHtml += '' +
      '<div class="wf-confirm" id="' + escapeHtml_(confirmId) + '">' +
      '<div class="wf-confirm-title">กำลังเปลี่ยนสถานะ</div>' +
      '<div class="wf-confirm-from">จาก: <b>' + escapeHtml_(currentStationName) + '</b></div>' +
      '<div class="wf-confirm-to">เป็น: <b>' + escapeHtml_(targetName) + '</b></div>' +
      '<form method="post" target="_top" action="' + baseUrl + '" class="reg-form" style="border:none;padding:0;margin-top:8px">' +
      '<input type="hidden" name="form_action" value="state_transition">' +
      '<input type="hidden" name="work_id" value="' + escapeHtml_(work.work_id) + '">' +
      '<input type="hidden" name="transition_id" value="' + escapeHtml_(t.transition_id) + '">' +
      '<input type="hidden" name="qr_token" value="' + escapeHtml_(token) + '">' +
      dueDateFieldHtml +
      '<div class="field"><label>หมายเหตุ' + (t.requires_note ? '' : ' (ถ้ามี)') + '</label>' +
      '<textarea class="input" name="note" rows="2"></textarea></div>' +
      '<div class="wf-confirm-actions">' +
      '<button class="btn-primary" type="submit" data-loading-text="กำลังบันทึก...">ยืนยันเปลี่ยนสถานะ</button>' +
      '<button type="button" class="btn-outline wf-confirm-cancel">ยกเลิก</button>' +
      '</div></form></div>';
  });

  var checklistHtml = checklistRowsHtml
    ? '<div class="wf-checklist">' + checklistRowsHtml + '</div>' + confirmPanelsHtml
    : '<div class="empty">ไม่มีการกระทำที่ทำได้กับงานนี้ในขณะนี้ (อาจไม่ใช่หน่วยงานที่รับผิดชอบ หรืองานสิ้นสุดแล้ว)</div>';

  // "การดำเนินการเพิ่มเติม" — action พิเศษ (ปิดงาน/เปลี่ยนผู้รับผิดชอบ/more_info) ไม่เด่นเท่าปุ่ม workflow หลัก
  // แสดงเฉพาะเมื่อมีสิทธิ์ (eligible มาจาก computeEligibleActions_ ตรวจ permission มาแล้ว)
  var moreActionsHtml = eligible.length
    ? '<details class="wf-more-actions"><summary>การดำเนินการเพิ่มเติม</summary>' +
      '<div class="action-list">' + eligible.map(function (a) {
        var variant = ACTION_BUTTON_VARIANT_[a] || 'secondary';
        return '<a class="btn-action btn-action-' + variant + '" target="_top" href="' + baseUrl +
          '?page=scan&t=' + encodeURIComponent(token) + '&do=' + a + '">' + escapeHtml_(ACTION_LABELS_[a] || a) + '</a>';
      }).join('') + '</div></details>'
    : '';

  // C. ประวัติ/Timeline แบบย่อ — ลิงก์เดียว ไม่ฝัง Timeline เต็มซ้ำกับ checklist ข้างบน (ข้อ 11)
  var historyLinkHtml = '<p class="pub-back-link"><a target="_top" href="' + baseUrl + '?page=detail&id=' +
    encodeURIComponent(work.work_id) + '">ดูประวัติการดำเนินงาน &rarr;</a></p>';

  // 2026-10-08 ตามที่ผู้ใช้ขอ — ตัดกล่อง "ⓘ ข้อมูลเดิม" (renderPubLegacyInfoBox_) และลิงก์ "← สแกนรายการอื่น"
  // ออกจากหน้านี้โดยเฉพาะ (หน้าสาธารณะ/หน้ารายละเอียดเจ้าหน้าที่อื่นยังมีกล่องนี้เหมือนเดิม ไม่แตะ — ดู
  // renderPubLegacyInfoBox_ อีก 2 จุดที่เหลือใน Views.gs) ไม่ได้ลบฟังก์ชัน/route/logic QR ใดๆ

  return '' +
    '<div class="pub-compact">' +
    errorHtml +
    '<div class="detail-card">' +
    nameBlockHtml + forwardingInfoHtml + heroHtml +
    '<div class="wf-section-title">เปลี่ยนสถานะ</div>' +
    '<div class="wf-section-hint">กดสถานะถัดไปเพื่ออัปเดตเอกสาร</div>' +
    checklistHtml + moreActionsHtml +
    '</div>' +
    historyLinkHtml +
    '</div>' +
    WF_CONFIRM_TOGGLE_SCRIPT_;
}

/** ฟอร์มกรอกข้อมูลเฉพาะ action (หรือหน้ายืนยันเฉยๆ กรณี received/forwarded) — POST กลับไปที่ doPost form_action=work_action
 *  prevValues ใช้คืนค่าที่กรอกไว้เมื่อ validate ไม่ผ่าน (ตาม pattern เดียวกับ renderRegisterFormBody_) */
function renderActionFormBody_(ss, work, station, action, baseUrl, token, errors, prevValues) {
  prevValues = prevValues || {};
  var errorHtml = (errors && errors.length)
    ? '<div class="error-banner"><ul>' + errors.map(function (m) { return '<li>' + escapeHtml_(m) + '</li>'; }).join('') + '</ul></div>'
    : '';
  var label = ACTION_LABELS_[action] || action;

  var hiddenFields = '' +
    '<input type="hidden" name="form_action" value="work_action">' +
    '<input type="hidden" name="work_id" value="' + escapeHtml_(work.work_id) + '">' +
    '<input type="hidden" name="action" value="' + escapeHtml_(action) + '">' +
    '<input type="hidden" name="qr_token" value="' + escapeHtml_(token) + '">';

  var extraHtml = '';
  if (action === 'more_info') {
    extraHtml = '<div class="field"><label>รายละเอียดที่ขอเพิ่มเติม</label>' +
      '<textarea class="input" name="note" rows="3">' + escapeHtml_(prevValues.note || '') + '</textarea></div>';
  } else if (action === 'terminated') {
    extraHtml = '<div class="field"><label>เหตุผลที่ยุติกระบวนการ</label><textarea class="input" name="note" rows="3">' + escapeHtml_(prevValues.note || '') + '</textarea></div>';
  } else if (action === 'closed') {
    extraHtml = '<div class="field"><label>เหตุผลที่ปิดงาน (ข้ามขั้นตอนที่เหลือ)</label><textarea class="input" name="note" rows="3">' + escapeHtml_(prevValues.note || '') + '</textarea></div>';
  } else if (action === 'reassigned') {
    var orgs = getDistinctStationOrgs_(ss);
    var currentTarget = prevValues.target_org || work.current_owner_org;
    var stationsForReassign = listStationsSorted_(ss);
    var currentStationTarget = prevValues.target_station || '';
    extraHtml = '<div class="field"><label>หน่วยงานที่รับผิดชอบใหม่</label><select class="input" name="target_org">' +
      orgs.map(function (o) {
        var sel = o === currentTarget ? ' selected' : '';
        return '<option' + sel + '>' + escapeHtml_(o) + '</option>';
      }).join('') + '</select></div>' +
      '<div class="field"><label>ย้ายไปสถานี (ถ้าต้องการ — ไม่เลือกไว้ = คงสถานีเดิม เปลี่ยนแค่หน่วยงานรับผิดชอบ)</label>' +
      '<select class="input" name="target_station"><option value="">— ไม่เปลี่ยนสถานี —</option>' +
      stationsForReassign.map(function (s) {
        var sel = s.station_key === currentStationTarget ? ' selected' : '';
        return '<option value="' + escapeHtml_(s.station_key) + '"' + sel + '>' + escapeHtml_(s.station_name) + ' (' + escapeHtml_(s.org) + ')</option>';
      }).join('') + '</select>' +
      '<p class="hint" style="margin-top:4px">ใช้ตอนต้องดันงานย้อนกลับเข้าสถานีก่อนหน้า เช่น ส่งกลับเข้ารอบพิจารณาใหม่หลังแก้ไขงาน — เลือกแล้วหน่วยงานรับผิดชอบจะอิงตามสถานีที่เลือกแทนช่องด้านบน</p></div>' +
      '<div class="field"><label>เหตุผล</label><textarea class="input" name="note" rows="2">' + escapeHtml_(prevValues.note || '') + '</textarea></div>';
  }

  return errorHtml +
    '<form method="post" target="_top" action="' + baseUrl + '" class="reg-form">' +
    '<h3 class="action-form-title">' + escapeHtml_(label) + '</h3>' +
    hiddenFields + extraHtml +
    '<button class="btn-primary" type="submit">ยืนยัน' + escapeHtml_(label) + '</button>' +
    '</form>' +
    '<p><a target="_top" href="' + baseUrl + '?page=scan&t=' + encodeURIComponent(token) + '">&larr; ยกเลิก กลับไปเลือกการกระทำ</a></p>';
}

/** ฟอร์มยืนยันเปลี่ยนสถานะ (state transition) — คู่กับ renderActionFormBody_ (utility action) แต่คีย์ด้วย transition_id
 *  แทน action string เพราะ 1 state อาจมีได้หลายปุ่ม (คนละ transition_id แต่ to_state ต่างกัน) */
function renderTransitionFormBody_(work, transition, baseUrl, token, errors, prevValues) {
  prevValues = prevValues || {};
  var errorHtml = (errors && errors.length)
    ? '<div class="error-banner"><ul>' + errors.map(function (m) { return '<li>' + escapeHtml_(m) + '</li>'; }).join('') + '</ul></div>'
    : '';

  var noteFieldHtml = '<div class="field"><label>หมายเหตุ' + (transition.requires_note ? '' : ' (ถ้ามี)') + '</label>' +
    '<textarea class="input" name="note" rows="3">' + escapeHtml_(prevValues.note || '') + '</textarea></div>';

  // 2026-10-21 — ข้อ 8 "Edit Mode" ตามที่ผู้บริหารขอ: validate ไม่ผ่าน (เช่น ลืมกรอกหมายเหตุที่บังคับ) ต้อง
  // reload วันครบกำหนดแก้ไขที่กรอกไว้แล้วกลับมาในช่องปฏิทิน ห้ามหายไปตอน re-render หน้าเดิม (prevValues =
  // e.parameter เดิมจาก Code.gs ซึ่งมี revision_due_date ดิบ "YYYY-MM-DD" ที่ submit มาอยู่แล้ว)
  var dueDateFieldHtml = REVISION_DUE_DATE_STATE_KEYS_[transition.to_state]
    ? '<div class="field"><label>วันครบกำหนดแก้ไข</label>' +
      '<input class="input" type="date" name="revision_due_date" value="' + escapeHtml_(prevValues.revision_due_date || '') + '" required></div>'
    : '';

  return errorHtml +
    '<form method="post" target="_top" action="' + baseUrl + '" class="reg-form">' +
    '<h3 class="action-form-title">' + escapeHtml_(transition.button_label) + '</h3>' +
    '<p>ยืนยันเปลี่ยนสถานะงาน <b>' + escapeHtml_(work.tracking_no) + '</b></p>' +
    '<input type="hidden" name="form_action" value="state_transition">' +
    '<input type="hidden" name="work_id" value="' + escapeHtml_(work.work_id) + '">' +
    '<input type="hidden" name="transition_id" value="' + escapeHtml_(transition.transition_id) + '">' +
    '<input type="hidden" name="qr_token" value="' + escapeHtml_(token) + '">' +
    dueDateFieldHtml +
    noteFieldHtml +
    '<button class="btn-primary" type="submit">ยืนยัน' + escapeHtml_(transition.button_label) + '</button>' +
    '</form>' +
    '<p><a target="_top" href="' + baseUrl + '?page=scan&t=' + encodeURIComponent(token) + '">&larr; ยกเลิก กลับไปเลือกการกระทำ</a></p>';
}

/** หน้าสำเร็จหลังบันทึก action */
function renderActionSuccessBody_(result, baseUrl) {
  return '' +
    '<div class="success-card">' +
    '<p class="success-title">บันทึก "' + escapeHtml_(ACTION_LABELS_[result.action] || result.action) + '" สำเร็จ</p>' +
    '<p><a target="_top" href="' + baseUrl + '?page=detail&id=' + encodeURIComponent(result.work_id) + '">ดูรายละเอียดงาน</a> &nbsp;|&nbsp; ' +
    '<a target="_top" href="' + baseUrl + '?page=scan">สแกนรายการถัดไป</a> &nbsp;|&nbsp; ' +
    '<a target="_top" href="' + baseUrl + '?page=dashboard">กลับหน้าแรก</a></p>' +
    '</div>';
}

/** หน้าที่ยังไม่พัฒนา (สแกน/ค้นหา) — stub รอ Part ถัดไป */
function renderStubBody_(message, baseUrl) {
  return '<div class="stub"><p>' + escapeHtml_(message) + '</p>' +
    '<p><a target="_top" href="' + baseUrl + '?page=dashboard">&larr; กลับหน้าแรก</a></p></div>';
}

/** ฟอร์มรับเอกสารใหม่ (docs/DESIGN.md Part 3) — values/errors ใช้ตอนส่งฟอร์มไม่ผ่าน validation เพื่อคืนค่าที่กรอกไว้ */
/**
 * ฟอร์มรับเอกสารใหม่ (2026-09-15 ปรับลดฟิลด์ + ตำแหน่ง/ด้าน-สาขาเป็น Master Data — ดูแชท requirement)
 * ตัดออก: เลขบัตรประชาชน/ระดับปัจจุบัน/ระดับที่ขอ/ภาพหน้าปก (คอลัมน์เดิมยังอยู่ เขียนค่าว่างที่ Register.gs)
 * เพิ่ม: เลขตำแหน่งเดิม (บังคับ), ตำแหน่งเป็น dropdown จาก MasterPositions, "ด้าน/สาขา" dropdown ชั้นเดียว
 * ผูกกับตำแหน่งที่เลือก (MasterSpecialties, generic ทุกตำแหน่ง — รอบ 3 หลังพบจากข้อมูลจริง 244 รายใน Excel
 * เดิมว่าไม่ใช่แค่นายแพทย์ที่มีด้าน) REG_DYNAMIC_SCRIPT_ กรอง option ตามตำแหน่ง+ซ่อน/โชว์ฝั่ง client
 * ฝั่ง backend validate ซ้ำเสมอที่ registerNewWork_ (Register.gs) ไม่เชื่อ client อย่างเดียว
 */
/** รายการคำนำหน้าชื่อ/ยศทางการ (2026-09-24 เปลี่ยนจาก text input เดิมเป็น dropdown ตามที่ผู้ใช้ขอ) —
 *  free-text เดิม (title_name) ไม่ validate ค่าที่แน่นอนอยู่แล้ว (ดู REGISTER_REQUIRED_FIELDS_/Register.gs
 *  แค่เช็คไม่ว่าง) จึงใส่ dropdown ได้โดยไม่กระทบ validation/backend เดิม — "อื่น ๆ" คู่กับช่อง custom text
 *  reuse pattern เดียวกับ work_type/work_type_other ที่มีอยู่แล้ว (values.title_name ถูก override ด้วย
 *  ค่า custom ตอน submit ใน registerNewWork_) */
var TITLE_NAME_OPTIONS_ = ['นาย', 'นาง', 'นางสาว', 'ดร.', 'ผศ.', 'รศ.', 'ศ.', 'พญ.', 'นพ.', 'ทพ.', 'ภญ.',
  'ว่าที่ ร.ต.', 'ว่าที่ ร.อ.', 'ว่าที่ ร.ต.หญิง', 'ว่าที่ ร.อ.หญิง'];

function renderRegisterFormBody_(ss, values, errors, baseUrl) {
  values = values || {};
  var v = function (key) { return escapeHtml_(values[key] || ''); };

  var errorHtml = (errors && errors.length)
    ? '<div class="error-banner"><b>กรุณาแก้ไข:</b><ul>' +
      errors.map(function (e) { return '<li>' + escapeHtml_(e) + '</li>'; }).join('') + '</ul></div>'
    : '';

  // 2026-10-07: จังหวัดเดิม (dropdown ให้เลือกเอง) ถูกแทนด้วยช่อง readonly เติมอัตโนมัติจากหน่วยงานที่เลือกแล้ว
  // (province_options ไม่ได้ใช้ในฟอร์มนี้แล้ว — ดู reg-org-province ด้านล่าง)
  var positionRows = getActiveMasterRows_(ss, SHEET.MASTER_POSITIONS);
  var specialtyRows = getActiveMasterRows_(ss, SHEET.MASTER_SPECIALTIES);

  function selectHtml(name, options, current, id) {
    return '<select class="input" name="' + name + '"' + (id ? ' id="' + id + '"' : '') + '>' +
      options.map(function (opt) {
        var sel = opt === current ? ' selected' : '';
        return '<option' + sel + '>' + escapeHtml_(opt) + '</option>';
      }).join('') + '</select>';
  }

  var positionOptionsHtml = '<option value="">-- เลือกตำแหน่ง --</option>' + positionRows.map(function (row) {
    var sel = row.position_name === values.position ? ' selected' : '';
    return '<option data-position-code="' + escapeHtml_(row.position_code) + '"' + sel + '>' + escapeHtml_(row.position_name) + '</option>';
  }).join('');

  var specialtyOptionsHtml = '<option value="">-- เลือกด้าน/สาขา --</option>' + specialtyRows.map(function (row) {
    var sel = row.specialty_name === values.specialty ? ' selected' : '';
    return '<option value="' + escapeHtml_(row.specialty_name) + '" data-position-code="' + escapeHtml_(row.position_code) + '"' + sel + '>' +
      escapeHtml_(row.specialty_name) + '</option>';
  }).join('');


  // 2026-09-21: auto-suggest คณะกรรมการที่รับผิดชอบ (ChairMaster) ตามตำแหน่ง+ด้าน/สาขาที่เลือก — ฝัง lookup
  // ทั้งหมดเป็น JSON ให้ client JS ตัดสินใจแบบ reactive (ไม่มี AJAX ในระบบนี้) ฝั่ง backend validate ซ้ำเสมอที่
  // registerNewWork_ (resolveCommitteeForRegistration_ ใช้ logic เดียวกันเป๊ะ ไม่มี drift)
  var committeeLookup = buildCommitteeLookupForRegisterForm_(ss);
  // 2026-11-02 — เพิ่มเลขาคู่กับประธาน (ผู้รับผิดชอบฝั่งซ้ายฟอร์ม) reuse source of truth เดิม
  // (CommitteeSecretaryMap/SecretaryMaster) ไม่สร้าง mapping ใหม่ซ้ำ ดู buildSecretaryLookupForRegisterForm_
  // (CommitteeMigration.gs) — log เตือนเฉพาะคณะที่มีประธานจริงแต่ยังไม่มีเลขาใน mapping (ข้อ 8 — Admin/Developer
  // เห็นได้จาก Apps Script execution log ไม่ต้องสร้างชีต log ใหม่)
  var secretaryLookup = buildSecretaryLookupForRegisterForm_(ss);
  var committeeCodesMissingSecretary = [];
  Object.keys(committeeLookup).forEach(function (profession) {
    committeeLookup[profession].committees.forEach(function (c) {
      if (c.chair_name && !secretaryLookup[c.committee_code]) committeeCodesMissingSecretary.push(c.committee_code);
    });
  });
  if (committeeCodesMissingSecretary.length) {
    Logger.log('[renderRegisterFormBody_] คณะกรรมการที่มีประธานแล้วแต่ยังไม่มีเลขาใน CommitteeSecretaryMap: ' +
      committeeCodesMissingSecretary.join(', '));
  }

  // 2026-10-07 — ข้อมูลหน่วยงาน Master Data เขตสุขภาพที่ 11 เดียวกัน ฝังเป็น JSON จัดกลุ่มตามประเภท (ไม่มี AJAX
  // client กรอง/เติม <datalist> เองจาก JSON ชุดนี้ตามประเภทที่เลือก — ห้ามโหลดทุกประเภทลง dropdown เดียวพร้อมกัน)
  var organizationLookup = buildOrganizationMasterLookupForRegisterForm_(ss);
  // 2026-10-07 รอบ 2 — แจ้งเตือนบนหน้าเองถ้า OrganizationMaster ว่างเปล่า (ผู้ใช้รายงานปัญหาค้นหาหน่วยงานไม่เจอ
  // ซ้ำหลายรอบ — เดิมต้องเปิด Apps Script Editor รัน diagnoseOrganizationSearch() ถึงจะรู้สถานะจริง ตอนนี้เห็น
  // ได้ทันทีบนหน้าเว็บเองโดยไม่ต้องเปิด Editor) นับจากจำนวนจริงที่ embed ลงหน้านี้เป๊ะ ไม่ query ซ้ำ
  var organizationTotalCount = 0;
  Object.keys(organizationLookup).forEach(function (t) { organizationTotalCount += organizationLookup[t].length; });
  var organizationMasterWarningHtml = organizationTotalCount === 0
    ? '<div class="error-banner">⚠️ ยังไม่มีข้อมูลหน่วยงาน (OrganizationMaster) ในระบบเลย — ช่องค้นหาหน่วยงานด้านล่างจะใช้งานไม่ได้ ' +
      'ผู้ดูแลระบบต้องรัน <b>migrateAddOrganizationMaster()</b> จาก Apps Script Editor ก่อน (ครั้งเดียว) แล้วรีเฟรชหน้านี้ใหม่</div>'
    : '';

  // คำนำหน้าชื่อ (2026-09-24 รอบใหม่) — dropdown ยศทางการ + "อื่น ๆ" คู่กับช่อง custom (reuse pattern work_type_other)
  var isKnownTitle = TITLE_NAME_OPTIONS_.indexOf(values.title_name) !== -1;
  var showTitleOther = !!values.title_name && !isKnownTitle;
  var titleOptionsHtml = '<option value="">-- เลือกคำนำหน้าชื่อ --</option>' +
    TITLE_NAME_OPTIONS_.map(function (opt) {
      return '<option' + (opt === values.title_name ? ' selected' : '') + '>' + escapeHtml_(opt) + '</option>';
    }).join('') +
    '<option value="อื่น ๆ"' + (showTitleOther ? ' selected' : '') + '>อื่น ๆ</option>';

  return '' +
    errorHtml +
    organizationMasterWarningHtml +
    '<form method="post" target="_top" action="' + baseUrl + '" class="reg-form" id="reg-form">' +
    '<input type="hidden" name="form_action" value="register_work">' +

    '<div class="reg-section"><div class="reg-section-title">ข้อมูลบุคคล</div>' +
    '<div class="field-row field-row-name">' +
    '<div class="field field-title"><label>คำนำหน้าชื่อ</label><select class="input" name="reg_title_name" id="reg-title-name">' + titleOptionsHtml + '</select></div>' +
    '<div class="field field-first"><label>ชื่อ</label><input class="input" name="reg_first_name" value="' + v('first_name') + '"></div>' +
    '<div class="field field-last"><label>นามสกุล</label><input class="input" name="reg_last_name" value="' + v('last_name') + '"></div>' +
    '</div>' +
    '<div class="field" id="reg-title-other-field" style="' + (showTitleOther ? '' : 'display:none') + '">' +
    '<label>ระบุคำนำหน้าชื่อ</label><input class="input" name="reg_title_name_other" id="reg-title-name-other" value="' + (showTitleOther ? v('title_name') : '') + '" placeholder="ระบุคำนำหน้าชื่อ (ใช้เฉพาะกรณีเลือกอื่น ๆ)"></div>' +
    '<div class="field-row field-row-position">' +
    '<div class="field field-pos"><label>ตำแหน่ง</label><select class="input" name="reg_position" id="reg-position">' + positionOptionsHtml + '</select>' +
    (positionRows.length ? '' : '<p class="hint" style="margin-top:4px">ยังไม่มีตำแหน่งใน Master Data — เพิ่มได้ที่ Admin &gt; ข้อมูลหลัก</p>') + '</div>' +
    '<div class="field field-branch" id="reg-specialty-field"><label>ด้าน/สาขา</label>' +
    '<select class="input" name="reg_specialty" id="reg-specialty">' + specialtyOptionsHtml + '</select>' +
    '<input class="input" id="reg-specialty-display" readonly style="display:none">' +
    '</div>' +
    '<div class="field field-posno"><label>เลขตำแหน่งเดิม</label><input class="input" name="reg_position_no" value="' + v('position_no') + '"></div>' +
    '</div>' + // ปิด field-row-position
    // 2026-11-02 — กล่อง "ผู้รับผิดชอบ" อยู่บรรทัดถัดจากแถวตำแหน่ง/สาขา เต็มความกว้าง (คงเดิม) รอบนี้แก้แค่
    // ลำดับภายในกล่อง: dropdown "คณะกรรมการที่รับผิดชอบ" (โชว์เฉพาะโหมด manual — หลายคณะ) ต้องมาก่อนประธาน/เลขา
    // เสมอ (เดิมอยู่ล่างสุด) + ประธาน/เลขาเปลี่ยนจากสองแถว stack เป็นแนวนอน 2 คอลัมน์บน desktop ตามที่ผู้ใช้ขอ
    // ค่าเริ่มต้น "กำลังโหลดผู้รับผิดชอบ..." (ช่วงสั้นๆ ก่อน DOMContentLoaded ทำงาน) REG_RESPONSIBLE_SCRIPT_ คำนวณ/แสดงผลจริง
    '<div class="reg-responsible-box">' +
    '<div class="reg-section-title">ผู้รับผิดชอบ</div>' +
    '<div class="field" id="reg-committee-field" style="display:none">' +
    '<label>คณะกรรมการที่รับผิดชอบ</label><div id="reg-committee-info"></div></div>' +
    '<div class="reg-resp-cols">' +
    '<div class="reg-resp-col"><div class="reg-resp-label">ประธานคณะกรรมการ</div>' +
    '<div class="reg-resp-value reg-resp-empty" id="reg-chair-name">กำลังโหลดผู้รับผิดชอบ...</div></div>' +
    '<div class="reg-resp-col"><div class="reg-resp-label">เลขา</div>' +
    '<div class="reg-resp-value reg-resp-empty" id="reg-secretary-name">กำลังโหลดผู้รับผิดชอบ...</div></div>' +
    '</div>' + // ปิด reg-resp-cols
    '</div>' + // ปิด reg-responsible-box
    '</div>' + // ปิด reg-section "ข้อมูลบุคคล"

    // 2026-10-20 — "ข้อมูลหนังสือนำส่ง" (ไม่บังคับกรอก) อยู่ก่อนหัวข้อ "ข้อมูลผลงาน" ตามที่ผู้ใช้ขอ 3 ช่อง
    // สัดส่วน 40/30/30 บน desktop (.field-row-forwarding) เรียงลงมา 1 column บนมือถือ 2 ช่องวันที่ใช้
    // <input type="date"> ให้เลือกจาก Calendar ล้วน ไม่ต้องพิมพ์เอง
    '<div class="reg-section"><div class="reg-section-title">ข้อมูลหนังสือนำส่ง</div>' +
    '<div class="field-row field-row-forwarding">' +
    '<div class="field field-fwd-no"><label>เลขหนังสือนำส่ง</label><input class="input" name="reg_forwarding_book_no" value="' + v('forwarding_book_no') + '" placeholder="เช่น สธ 0211/1234"></div>' +
    '<div class="field field-fwd-date"><label>วันที่ส่งหนังสือ</label><input class="input" type="date" name="reg_forwarding_book_date" value="' + v('forwarding_book_date') + '"></div>' +
    '<div class="field field-admin-date"><label>วันที่ธุรการรับเรื่อง</label><input class="input" type="date" name="reg_admin_received_date" value="' + v('admin_received_date') + '"></div>' +
    '</div>' +
    '</div>' +

    // 2026-10-07 ผู้ใช้ขอเอา "ประเภทผลงาน" ออกจากฟอร์มทั้งหมด — เหลือแค่ "ชื่อผลงาน" เป็นหัวข้อแรก/อย่างเดียว
    '<div class="reg-section"><div class="reg-section-title">ข้อมูลผลงาน</div>' +
    '<div class="field"><label>ชื่อผลงาน</label><textarea class="input" name="reg_work_title" rows="2">' + v('work_title') + '</textarea></div>' +
    '</div>' +

    '<div class="reg-section"><div class="reg-section-title">ข้อมูลหน่วยงาน</div>' +
    '<div class="field-row field-row-org">' +
    '<div class="field field-org-type"><label>ประเภทหน่วยงาน</label><select class="input" name="reg_organization_type" id="reg-org-type">' +
    '<option value="">-- เลือกประเภทหน่วยงาน --</option>' +
    ORGANIZATION_TYPE_OPTIONS_.map(function (t) {
      return '<option' + (t === values.organization_type ? ' selected' : '') + '>' + escapeHtml_(t) + '</option>';
    }).join('') + '</select></div>' +
    '<div class="field field-org-name"><label>ชื่อหน่วยงาน</label>' +
    '<div class="org-suggest-wrap">' +
    '<input class="input" name="reg_org_from" id="reg-org-name" autocomplete="off" role="combobox" aria-expanded="false" aria-autocomplete="list" value="' + v('org_from') + '"' +
    (values.organization_type ? '' : ' disabled placeholder="กรุณาเลือกประเภทหน่วยงานก่อน"') + '>' +
    '<div class="org-suggest" id="reg-org-suggest" role="listbox"></div>' +
    // 2026-11-02 — รพศ./รพท. (3/9 แห่งเท่านั้น) ใช้ <select> แสดงครบทันทีไม่ต้องพิมพ์ค้นหา (ตามที่ผู้ใช้ขอ)
    // ประเภทอื่น (สสจ./สสอ./รพช./รพ.สต. — รายการมาก) ยังใช้ autocomplete เดิมทุกประการ (ข้อ 13 ห้ามกระทบ)
    // ซ่อน/โชว์สลับกับ #reg-org-name ด้วย REG_ORG_SCRIPT_ (ไม่ submit ตรง — เซ็ตค่าลง #reg-org-name/#reg-org-id/
    // #reg-org-province เดียวกับ selectOrg() เดิม จึงไม่มี logic ฝั่ง backend ใหม่ซ้ำเลย)
    '<select class="input" id="reg-org-select" style="display:none"></select>' +
    '</div></div>' +
    '<div class="field field-org-province"><label>จังหวัด</label><input class="input" name="reg_province" id="reg-org-province" value="' + v('province') + '" readonly placeholder="เติมอัตโนมัติเมื่อเลือกหน่วยงาน"></div>' +
    // 2026-10-07 รอบ 3 — ย้ายเบอร์โทรมาอยู่แถวเดียวกับข้อมูลหน่วยงาน ตัด section "ข้อมูลติดต่อ" แยกทิ้ง (เหลือ field เดียวไม่จำเป็นต้องแยก section)
    '<div class="field field-org-phone"><label>เบอร์โทร</label><input class="input" name="reg_phone" value="' + v('phone') + '"></div>' +
    '</div>' +
    '<input type="hidden" name="reg_organization_id" id="reg-org-id" value="' + v('organization_id') + '">' +
    '</div>' +

    '<button class="btn-primary" type="submit">บันทึกและออกเลขติดตาม</button>' +
    '</form>' +
    '<script>var REG_COMMITTEE_LOOKUP_ = ' + JSON.stringify(committeeLookup) + ';' +
    'var REG_SECRETARY_LOOKUP_ = ' + JSON.stringify(secretaryLookup) + ';' +
    'var REG_ORG_LOOKUP_ = ' + JSON.stringify(organizationLookup) + ';' +
    // Edit Mode (ข้อ 10) โหมด manual หลายคณะ — ค่าที่เคยเลือกไว้ (ผ่าน registerNewWork_ validate แล้วคืนกลับมา
    // ใน values.committee_code แม้ validate fail ด้วยเหตุอื่น) ให้ dropdown preselect + แสดงประธาน/เลขาทันที
    'var REG_PRESELECTED_COMMITTEE_ = ' + JSON.stringify(values.committee_code || '') + ';</script>' +
    REG_DYNAMIC_SCRIPT_ +
    REG_RESPONSIBLE_SCRIPT_ +
    REG_ORG_SCRIPT_ +
    REG_LAYOUT_TOGGLE_SCRIPT_;
}

/**
 * ด้าน/สาขา ตามตำแหน่งที่เลือก (2026-10-07 แก้ตาม requirement จริง — เดิมมี placeholder "-- เลือก --" เสมอแม้
 * เหลือตัวเลือกเดียว ผู้ใช้ต้องคลิกเลือกเองอยู่ดี) ตอนนี้แบ่ง 3 กรณีตามจำนวนตัวเลือกที่ตรงกับตำแหน่ง:
 *   0 ตัวเลือก -> ช่อง <select> disabled โชว์ "-" (ค่าว่างคือค่าที่ถูกต้องอยู่แล้วสำหรับตำแหน่งที่ไม่มีด้าน/สาขา
 *     ใน Master Data — ไม่ต้อง hidden input เสริม เพราะ blank คือค่าที่ต้องการจริงๆ ไม่ใช่ค่าที่ "หาย")
 *   1 ตัวเลือก  -> auto-select ค่านั้นทันที (2026-11-02 ตาม requirement ล่าสุด — "ห้ามแสดง <select>/dropdown
 *     เลย ถ้าตำแหน่งมีสาขาเดียว") ซ่อน <select> ด้วย display:none (ไม่ใช้ disabled — select ที่ disabled จะไม่
 *     ถูกส่งค่าตาม HTML form spec ทำให้ specialty หายไปตอน Save เลยซ่อนด้วย CSS แทน ค่ายังถูกส่งไปปกติ) แล้ว
 *     โชว์ #reg-specialty-display (readonly input, ไม่มี name — ไม่ submit ซ้ำ) แสดงค่าแทนให้ผู้ใช้เห็น ไม่ต้อง
 *     คลิกเลือกเองอีก (reuse style .input[readonly] เดิมของระบบ — field อื่นในฟอร์มนี้ก็ใช้ readonly แบบเดียวกัน
 *     อยู่แล้ว เช่น ช่องจังหวัด)
 *   >1 ตัวเลือก -> ปกติ มี placeholder "-- เลือกด้าน/สาขา --" ให้ผู้ใช้เลือกเอง เหมือนเดิม (<select> โชว์ปกติ)
 * เปลี่ยนตำแหน่งใหม่ = clear ค่าด้าน/สาขาเดิมทิ้งก่อนเสมอ แล้วคำนวณ 3 กรณีข้างบนใหม่ทันที (กันค่าตำแหน่งก่อน
 * หน้าค้าง) — data-position-code บน <option> ทั้งของ position select และ specialty select (ฝังมาจาก server)
 */
var REG_DYNAMIC_SCRIPT_ = '' +
  '<script>' +
  'document.addEventListener("DOMContentLoaded", function () {' +
  'var posSel = document.getElementById("reg-position");' +
  'var specSel = document.getElementById("reg-specialty");' +
  'var specDisplay = document.getElementById("reg-specialty-display");' +
  'if (!posSel || !specSel) return;' +
  'var allSpecOptions = Array.prototype.slice.call(specSel.options).filter(function (opt) { return opt.value; });' +
  'function getBranchesByPosition(posCode) {' +
  'return allSpecOptions.filter(function (opt) { return opt.dataset.positionCode === posCode; });' +
  '}' +
  'function onPositionChange() {' +
  'specSel.innerHTML = ""; specSel.disabled = false; specSel.style.display = "";' + // clear ค่าเดิมก่อนเสมอ กันค้างจากตำแหน่งก่อนหน้า
  'if (specDisplay) { specDisplay.style.display = "none"; specDisplay.value = ""; }' +
  'var posCode = (posSel.selectedOptions[0] || {}).dataset ? posSel.selectedOptions[0].dataset.positionCode : "";' +
  'var options = getBranchesByPosition(posCode);' +
  'if (options.length === 0) {' +
  'specSel.appendChild(new Option("-", "")); specSel.disabled = true;' +
  '} else if (options.length === 1) {' +
  'specSel.appendChild(options[0].cloneNode(true)); specSel.value = options[0].value;' +
  'if (specDisplay) { specSel.style.display = "none"; specDisplay.value = options[0].value; specDisplay.style.display = ""; }' +
  '} else {' +
  'specSel.appendChild(new Option("-- เลือกด้าน/สาขา --", ""));' +
  'options.forEach(function (opt) { specSel.appendChild(opt.cloneNode(true)); });' +
  '}' +
  '}' +
  'posSel.addEventListener("change", onPositionChange);' +
  // ค่าด้าน/สาขาที่เคยกรอกไว้ (กรณี re-render หลัง validate ไม่ผ่าน) ถูกคงไว้เองโดยอัตโนมัติอยู่แล้ว เพราะ
  // option ต้นฉบับใน allSpecOptions มี attribute "selected" จาก SSR ติดมาด้วย (specialtyOptionsHtml ฝั่ง
  // server) และ cloneNode(true) จะ clone attribute นั้นไปด้วยตอน rebuild — ไม่ต้องเขียนโค้ด restore ซ้ำ
  'onPositionChange();' +
  '});' +
  '</script>';

/**
 * ผู้รับผิดชอบ (ประธานคณะกรรมการ+เลขา) ตามตำแหน่ง+ด้าน/สาขาที่เลือก (2026-11-02 ตาม requirement ล่าสุด — เดิม
 * แสดงแค่ประธานในช่องเล็กๆ ใต้แถวตำแหน่ง ตอนนี้ย้ายไปกล่องซ้ายของฟอร์ม + เพิ่มเลขาคู่กัน) อ่าน
 * REG_COMMITTEE_LOOKUP_/REG_SECRETARY_LOOKUP_ ที่ฝังไว้ก่อนหน้า (buildCommitteeLookupForRegisterForm_/
 * buildSecretaryLookupForRegisterForm_, CommitteeMigration.gs) ไม่มี AJAX ทำงานฝั่ง client ล้วน backend
 * validate ซ้ำเสมอที่ registerNewWork_ (resolveCommitteeForRegistration_ — logic โหมดเดียวกันเป๊ะ, เลขาเป็นแค่
 * ข้อมูลแสดงผลอย่างเดียวไม่ validate/ไม่บันทึกเป็น field ใหม่ — ข้อ 9 ของ requirement)
 *
 * แยก responsibility ชัดตามข้อ 15 ของ requirement:
 *   resolveResponsible() = C. business lookup ล้วนๆ ไม่แตะ DOM เลย คืนผลลัพธ์ {mode, ...}
 *   renderResponsible()  = D. UI renderer รับผลลัพธ์มาเขียนลง DOM อย่างเดียว ไม่ค้นหา/คำนวณเอง
 * mode ที่เป็นไปได้: 'empty' (ยังไม่เลือกตำแหน่ง) / 'none' (ตำแหน่งนี้ไม่มีคณะกรรมการใน Master Data เลย) /
 * 'waiting' (โหมด specialty แต่ยังไม่มีสาขาที่ match — รอ) / 'manual' (หลายคณะ แยกไม่ได้อัตโนมัติ ต้องเลือกเอง
 * — เช่น "พยาบาลวิชาชีพ" จริงที่มี 7 คณะในข้อมูลจริง ไม่มีข้อความแยกในต้นฉบับ ยืนยันแล้วว่าห้าม auto-suggest,
 * ดู buildCommitteeLookupForRegisterForm_ — รอบนี้ไม่เปลี่ยน rule นี้ แค่เพิ่ม onchange ให้ dropdown เดิมอัปเดต
 * ประธาน/เลขาทันทีหลังเลือก ไม่ต้องรอ submit ก่อนถึงจะรู้) / 'resolved' (auto-resolve ได้ มีประธานแน่นอน)
 */
var REG_RESPONSIBLE_SCRIPT_ = '' +
  '<script>' +
  'document.addEventListener("DOMContentLoaded", function () {' +
  'var posSel = document.getElementById("reg-position");' +
  'var specSel = document.getElementById("reg-specialty");' +
  'var committeeField = document.getElementById("reg-committee-field");' +
  'var infoDiv = document.getElementById("reg-committee-info");' +
  'var chairEl = document.getElementById("reg-chair-name");' +
  'var secEl = document.getElementById("reg-secretary-name");' +
  'if (!posSel || !committeeField || !infoDiv || !chairEl || !secEl || typeof REG_COMMITTEE_LOOKUP_ === "undefined") return;' +
  'function escC(s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }' +
  'function secretaryOf(committeeCode) {' +
  'return (typeof REG_SECRETARY_LOOKUP_ !== "undefined" && REG_SECRETARY_LOOKUP_[committeeCode]) || null;' +
  '}' +
  // C. resolveResponsible — business lookup ล้วนๆ ไม่แตะ DOM
  'function resolveResponsible() {' +
  'var posName = posSel.options[posSel.selectedIndex] ? posSel.options[posSel.selectedIndex].text : "";' +
  'if (!posName) return { mode: "empty" };' +
  'var entry = REG_COMMITTEE_LOOKUP_[posName];' +
  'if (!entry || !entry.committees.length) return { mode: "none" };' +
  'if (entry.mode === "manual") return { mode: "manual", committees: entry.committees };' +
  'var match = entry.mode === "single" ? entry.committees[0] :' +
  'entry.committees.filter(function (c) { return c.key === (specSel ? specSel.value : ""); })[0];' +
  'if (!match) return { mode: "waiting" };' +
  'return { mode: "resolved", chairName: match.chair_name, chairOrg: match.chair_org, secretary: secretaryOf(match.committee_code) };' +
  '}' +
  'function setField(el, text, isEmpty) { el.textContent = text; el.className = "reg-resp-value" + (isEmpty ? " reg-resp-empty" : ""); }' +
  'function setBothEmpty(text) { setField(chairEl, text, true); setField(secEl, text, true); }' +
  // Edit Mode (ข้อ 10) — ค่าคณะกรรมการที่เคยเลือกไว้ (values.committee_code ฝั่ง server, คืนมาแม้ validate fail
  // ด้วยเหตุอื่น) ใช้ preselect ได้เฉพาะตอน sync ครั้งแรกหลังโหลดหน้าเท่านั้น (isInitialSync) — เปลี่ยนตำแหน่ง/
  // สาขาเองหลังจากนั้นต้อง "ไม่" ใช้ค่านี้ซ้ำ กันชื่อชุดเดิมค้าง (ข้อ 9)
  'var isInitialSync = true;' +
  // D. renderResponsible — รับผลลัพธ์มาแสดงอย่างเดียว ไม่ค้นหา/คำนวณเอง (ล้างค่าเดิมทุกครั้งก่อนเขียนใหม่เสมอ
  // ด้วย textContent ตรงๆ — ไม่มีทางค้างค่าตำแหน่งก่อนหน้า ตามข้อ 6 ของ requirement)
  'function renderResponsible(result) {' +
  'if (result.mode === "manual") {' +
  'committeeField.style.display = "";' +
  'var preselect = isInitialSync ? REG_PRESELECTED_COMMITTEE_ : "";' +
  'var html = `<select class="input" name="reg_committee_code" id="reg-committee-code" required><option value="">เลือกคณะกรรมการ</option>`;' +
  'result.committees.forEach(function (c) {' +
  'var sel = c.committee_code === preselect ? " selected" : "";' +
  'html += `<option value="` + escC(c.committee_code) + `"` + sel + `>ประธาน: ` + escC(c.chair_name) + ` (` + escC(c.chair_org) + `)</option>`;' +
  '});' +
  'infoDiv.innerHTML = html + `<p class="hint">ตำแหน่งนี้มีหลายคณะ ไม่สามารถจับคู่อัตโนมัติได้ กรุณาเลือกเอง</p>`;' +
  'function applyChosen(code) {' +
  'var chosen = result.committees.filter(function (c) { return c.committee_code === code; })[0];' +
  'if (!chosen) { setBothEmpty("เลือกคณะกรรมการด้านบนก่อน"); return; }' +
  'setField(chairEl, chosen.chair_name + (chosen.chair_org ? " (" + chosen.chair_org + ")" : ""), false);' +
  'var sec = secretaryOf(chosen.committee_code);' +
  'if (sec) setField(secEl, sec.name + (sec.org ? " (" + sec.org + ")" : ""), false);' +
  'else setField(secEl, "ยังไม่ได้กำหนด", true);' +
  '}' +
  'var preselectValid = result.committees.some(function (c) { return c.committee_code === preselect; });' +
  'if (preselectValid) applyChosen(preselect); else setBothEmpty("เลือกคณะกรรมการด้านบนก่อน");' +
  'document.getElementById("reg-committee-code").addEventListener("change", function (ev) { applyChosen(ev.target.value); });' +
  'return;' +
  '}' +
  'committeeField.style.display = "none"; infoDiv.innerHTML = "";' +
  'if (result.mode === "empty") { setBothEmpty("เลือกตำแหน่งก่อน"); return; }' +
  'if (result.mode === "waiting") { setBothEmpty("เลือก \\u0022ด้าน/สาขา\\u0022 ก่อน"); return; }' +
  'if (result.mode === "none") { setBothEmpty("ยังไม่ได้กำหนดคณะกรรมการที่รับผิดชอบ"); return; }' +
  'setField(chairEl, result.chairName + (result.chairOrg ? " (" + result.chairOrg + ")" : ""), false);' +
  'if (result.secretary) setField(secEl, result.secretary.name + (result.secretary.org ? " (" + result.secretary.org + ")" : ""), false);' +
  'else setField(secEl, "ยังไม่ได้กำหนด", true);' +
  '}' +
  'function syncResponsible() { renderResponsible(resolveResponsible()); }' +
  'posSel.addEventListener("change", syncResponsible);' +
  'if (specSel) specSel.addEventListener("change", syncResponsible);' +
  'syncResponsible();' + // Edit Mode (ข้อ 10) — ค่า position/specialty preselect จาก SSR แล้วเรียกทันทีตอนโหลดหน้า ไม่ต้องรอ change event
  'isInitialSync = false;' + // ครั้งถัดไป (เปลี่ยนตำแหน่ง/สาขาเอง) ห้ามใช้ preselect เดิมซ้ำ (ข้อ 9)
  '});' +
  '</script>';

/**
 * ข้อมูลหน่วยงาน Master Data เขตสุขภาพที่ 11 (2026-10-07 รอบ 2 — custom searchable autocomplete) — เลือก
 * ประเภทหน่วยงานก่อน (เปิดช่องชื่อหน่วยงาน) พิมพ์อย่างน้อย 2 ตัวอักษร กรอง REG_ORG_LOOKUP_[ประเภท] แบบ
 * partial-match (substring, case-insensitive) จาก organization_name/organization_full_name/district/province
 * พร้อมกัน ไม่ใช่ exact match เหมือน <datalist> เดิม แสดง suggestion สูงสุด 20 รายการ (ชื่อ + อำเภอ/จังหวัด)
 * รองรับ Arrow Up/Down/Enter/Esc เลือก suggestion แล้วเก็บ organization_id/code + เติมจังหวัด (ฝั่ง server
 * ตรวจซ้ำเสมอที่ registerNewWork_ ไม่เชื่อค่าที่ client เติมมาเลย) แก้ข้อความหลังเลือกแล้ว = ล้าง
 * organization_id ทันที (ข้อ "ห้ามบันทึกข้อความที่พิมพ์เองโดยไม่ได้เลือกจาก Master") ไม่พบผลลัพธ์ = แสดง
 * "ไม่พบหน่วยงานที่ตรงกับคำค้น" ไม่สร้างหน่วยงานใหม่เอง — vanilla JS ล้วน ไม่มี framework/AJAX (ข้อมูลทั้งหมด
 * ฝังมาครั้งเดียวตอนโหลดหน้า กรอง/ค้นหาฝั่ง client ทั้งหมด)
 *
 * 2026-11-02 — สสจ./รพศ./รพท. (7/3/9 แห่งเท่านั้นในข้อมูลจริง — ดู getOrganizationMasterSeed_ ที่มีอยู่แล้ว
 * ไม่ต้องเพิ่ม/แก้ master) ตามที่ผู้ใช้ขอ ต้องแสดงเป็น <select> ครบทุกรายการทันที "ไม่ต้องพิมพ์ค้นหาก่อน" +
 * จังหวัด auto-fill ทันที (readonly เดิม ไม่มี dropdown จังหวัดให้เลือกซ้ำ) ส่วนประเภทอื่น (สสอ./รพช./รพ.สต. —
 * รายการมาก) ยังใช้ autocomplete เดิมทุกประการ (ห้ามกระทบ) สลับ 2 widget นี้ด้วย DROPDOWN_TYPES_ (เป็นแค่ UI
 * toggle ตาม organization_type ไม่ใช่ data ใหม่) #reg-org-select ตั้งค่า #reg-org-name/#reg-org-id/
 * #reg-org-province ชุดเดียวกับ selectOrg() เดิมเป๊ะ — backend (registerNewWork_/findOrganizationMasterById_)
 * ยัง validate organization_id -> province จาก master เสมอ (ข้อ 9/11 — ไม่เชื่อค่า client, เพิ่ม error
 * "ไม่พบข้อมูลจังหวัดของหน่วยงานที่เลือก" + Logger.log กรณี master มีแถวแต่ province_name ว่าง ข้อ 10)
 */
var REG_ORG_SCRIPT_ = '' +
  '<script>' +
  'document.addEventListener("DOMContentLoaded", function () {' +
  'var typeSel = document.getElementById("reg-org-type");' +
  'var nameInput = document.getElementById("reg-org-name");' +
  'var suggestBox = document.getElementById("reg-org-suggest");' +
  'var orgSelect = document.getElementById("reg-org-select");' +
  'var idField = document.getElementById("reg-org-id");' +
  'var provinceField = document.getElementById("reg-org-province");' +
  'if (!typeSel || !nameInput || !suggestBox || !orgSelect) return;' +
  // 2026-11-02 รอบ 2 — เพิ่ม สสจ. (7 แห่ง) เข้า DROPDOWN_TYPES_ ด้วยตามที่ผู้ใช้ขอรอบนี้ (เดิมมีแค่ รพศ./รพท.)
  // logic สลับ widget/auto-fill/clear-ตอนเปลี่ยนประเภท/Edit-mode-preselect ทั้งหมดเป็น generic ตาม type อยู่แล้ว
  // (syncOrgWidgetMode ด้านล่าง) ไม่ต้องเพิ่ม code ใหม่ซ้ำ แค่เพิ่มชื่อประเภทเข้า array นี้
  'var DROPDOWN_TYPES_ = ["สสจ.", "รพศ.", "รพท."];' +
  'var MIN_CHARS = 2, MAX_RESULTS = 20;' +
  'var currentResults = []; var activeIndex = -1;' +
  'function norm(s) { return String(s || "").trim().toLowerCase(); }' +
  'function clearSelection() { idField.value = ""; if (provinceField) provinceField.value = ""; }' +
  'function closeSuggest() { suggestBox.classList.remove("open"); suggestBox.innerHTML = ""; currentResults = []; activeIndex = -1; nameInput.setAttribute("aria-expanded", "false"); }' +
  'function searchOrgs(type, keyword) {' +
  'var list = REG_ORG_LOOKUP_[type] || []; var kw = norm(keyword); var out = [];' +
  'for (var i = 0; i < list.length && out.length < MAX_RESULTS; i++) {' +
  'var o = list[i];' +
  'if (norm(o.name).indexOf(kw) !== -1 || norm(o.fullName).indexOf(kw) !== -1 || norm(o.district).indexOf(kw) !== -1 || norm(o.province).indexOf(kw) !== -1) out.push(o);' +
  '}' +
  'return out;' +
  '}' +
  'function renderActive() {' +
  'var items = suggestBox.querySelectorAll(".org-suggest-item");' +
  'items.forEach(function (el, i) { el.classList.toggle("active", i === activeIndex); });' +
  'if (activeIndex >= 0 && items[activeIndex]) items[activeIndex].scrollIntoView({ block: "nearest" });' +
  '}' +
  'function selectOrg(o) {' +
  'nameInput.value = o.name; idField.value = o.id; if (provinceField) provinceField.value = o.province;' +
  'closeSuggest();' +
  '}' +
  'function renderResults(results, type) {' +
  'suggestBox.innerHTML = ""; activeIndex = -1;' +
  'if (!results.length) {' +
  'var empty = document.createElement("div"); empty.className = "org-suggest-empty";' +
  // แยกข้อความ "ไม่มีข้อมูลเลยทั้งประเภทนี้" (master ยังไม่ import/ว่าง) ออกจาก "มีข้อมูลแต่ไม่ตรงคำค้น" —
  // ช่วย debug ได้ตรงจุดกว่าเดิม (2026-10-07 ตามที่ผู้ใช้รายงานปัญหา)
  'empty.textContent = (REG_ORG_LOOKUP_[type] || []).length === 0' +
  '? "ยังไม่มีข้อมูลหน่วยงานประเภทนี้ในระบบ (กรุณาติดต่อผู้ดูแลระบบ)"' +
  ': "ไม่พบหน่วยงานที่ตรงกับคำค้น";' +
  'suggestBox.appendChild(empty); suggestBox.classList.add("open"); nameInput.setAttribute("aria-expanded", "true"); return;' +
  '}' +
  'results.forEach(function (o) {' +
  'var item = document.createElement("div"); item.className = "org-suggest-item"; item.setAttribute("role", "option");' +
  'var nameEl = document.createElement("div"); nameEl.className = "org-suggest-name"; nameEl.textContent = o.name;' +
  'var metaEl = document.createElement("div"); metaEl.className = "org-suggest-meta"; metaEl.textContent = (o.district ? "อ." + o.district + " \\u2022 " : "") + o.province;' +
  'item.appendChild(nameEl); item.appendChild(metaEl);' +
  'item.addEventListener("mousedown", function (ev) { ev.preventDefault(); selectOrg(o); });' +
  'suggestBox.appendChild(item);' +
  '});' +
  'suggestBox.classList.add("open"); nameInput.setAttribute("aria-expanded", "true");' +
  '}' +
  // รพศ./รพท. เท่านั้น (ข้อ 1/2/6) — เติม <select> ครบทุกรายการของประเภทนั้นทันที ไม่ต้องพิมพ์ (ข้อ "ไม่ต้องพิมพ์
  // ค้นหาก่อน") ใช้ fullName เป็นข้อความที่เห็น (ตรงกับรายชื่อที่ผู้ใช้ระบุ เช่น "โรงพยาบาลทุ่งสง") value เก็บ
  // organization_id เดิม (เหมือน selectOrg()) — ไม่สร้างรายชื่อซ้ำ reuse REG_ORG_LOOKUP_ ชุดเดียวกับ autocomplete
  'function populateOrgSelect(type) {' +
  'orgSelect.innerHTML = "";' +
  'orgSelect.appendChild(new Option("กรุณาเลือกหน่วยงาน", ""));' +
  // ใช้ String(o.id) เสมอตอนตั้ง value (บั๊กจริงที่เคยพบ+แก้ไว้ฝั่ง server แล้ว 2026-10-21 — ถ้าแถวไหนใน
  // OrganizationMaster ถูกแก้ตรงในชีตด้วยมือ Google Sheets จะ auto-convert organization_id เป็น Number ตัด
  // เลข 0 นำหน้า ขณะที่ <select>.value อ่านกลับมาเป็น String เสมอ ถ้าไม่ normalize จะเทียบ === ไม่ตรงกันเงียบๆ
  // แล้วจังหวัดจะไม่ auto-fill เลย — รอบนี้แก้จุดเดียวกันซ้ำฝั่ง client ที่เพิ่งเพิ่มด้วย)
  '(REG_ORG_LOOKUP_[type] || []).forEach(function (o) { orgSelect.appendChild(new Option(o.fullName || o.name, String(o.id))); });' +
  '}' +
  'function applyOrgChoice(o) {' +
  'if (!o) { nameInput.value = ""; clearSelection(); return; }' +
  'nameInput.value = o.fullName || o.name; idField.value = o.id; if (provinceField) provinceField.value = o.province;' +
  '}' +
  // สลับ widget ตามประเภท — preserveExisting=true เฉพาะตอนโหลดหน้าครั้งแรก (Edit Mode ข้อ 9 ของ requirement
  // รอบนี้) ให้ preselect จาก #reg-org-id ที่ SSR เติมมาแล้ว ก่อนค่อยโหลด options (ไม่มีทาง dropdown ว่างเพราะ
  // set ค่าก่อนโหลด options — populateOrgSelect ถูกเรียกก่อนเซ็ต .value เสมอ) เปลี่ยนประเภทเอง (preserveExisting
  // =false) ต้อง "ไม่" preselect ค้างจากประเภทก่อนหน้า (กันชื่อ/จังหวัดเดิมค้างข้อ 7 ของ requirement ก่อนหน้า)
  'function syncOrgWidgetMode(preserveExisting) {' +
  'var type = typeSel.value;' +
  'if (DROPDOWN_TYPES_.indexOf(type) !== -1) {' +
  'closeSuggest(); nameInput.style.display = "none"; orgSelect.style.display = "";' +
  'populateOrgSelect(type);' +
  'var chosen = preserveExisting && idField.value ? (REG_ORG_LOOKUP_[type] || []).filter(function (o) { return String(o.id) === String(idField.value); })[0] : null;' +
  'orgSelect.value = chosen ? String(chosen.id) : "";' +
  'if (chosen) applyOrgChoice(chosen);' +
  '} else {' +
  'orgSelect.style.display = "none"; orgSelect.innerHTML = "";' +
  'nameInput.style.display = "";' +
  '}' +
  '}' +
  'orgSelect.addEventListener("change", function () {' +
  'var type = typeSel.value;' +
  'var chosen = (REG_ORG_LOOKUP_[type] || []).filter(function (o) { return String(o.id) === orgSelect.value; })[0];' +
  'applyOrgChoice(chosen);' +
  '});' +
  'typeSel.addEventListener("change", function () {' +
  'nameInput.value = ""; clearSelection(); closeSuggest();' +
  'if (typeSel.value) { nameInput.disabled = false; nameInput.placeholder = "พิมพ์ชื่อหน่วยงาน (อย่างน้อย 2 ตัวอักษร)..."; }' +
  'else { nameInput.disabled = true; nameInput.placeholder = "กรุณาเลือกประเภทหน่วยงานก่อน"; }' +
  'syncOrgWidgetMode(false);' + // เปลี่ยนประเภทเอง (ข้อ 7) — ล้างค่าเดิมไปแล้วข้างบน ห้าม preselect ซ้ำ
  '});' +
  'nameInput.addEventListener("input", function () {' +
  'clearSelection();' + // แก้ข้อความ = ล้าง organization_id เดิมทันที จนกว่าจะเลือกใหม่
  'var kw = nameInput.value.trim();' +
  'if (!typeSel.value || kw.length < MIN_CHARS) { closeSuggest(); return; }' +
  'currentResults = searchOrgs(typeSel.value, kw);' +
  'renderResults(currentResults, typeSel.value);' +
  '});' +
  'nameInput.addEventListener("keydown", function (ev) {' +
  'if (!suggestBox.classList.contains("open")) return;' +
  'if (ev.key === "ArrowDown") { ev.preventDefault(); if (currentResults.length) { activeIndex = (activeIndex + 1) % currentResults.length; renderActive(); } }' +
  'else if (ev.key === "ArrowUp") { ev.preventDefault(); if (currentResults.length) { activeIndex = (activeIndex - 1 + currentResults.length) % currentResults.length; renderActive(); } }' +
  'else if (ev.key === "Enter") { if (activeIndex >= 0 && currentResults[activeIndex]) { ev.preventDefault(); selectOrg(currentResults[activeIndex]); } }' +
  'else if (ev.key === "Escape") { closeSuggest(); }' +
  '});' +
  'document.addEventListener("click", function (ev) { if (ev.target !== nameInput && !suggestBox.contains(ev.target)) closeSuggest(); });' +
  'syncOrgWidgetMode(true);' + // Edit Mode (ข้อ 9) — typeSel.value/#reg-org-id มาจาก SSR values อยู่แล้ว เรียกทันทีตอนโหลดหน้า
  '});' +
  '</script>';

/** ซ่อน/โชว์ช่อง "ระบุคำนำหน้าชื่อ" เฉพาะตอนเลือก "อื่น ๆ" (2026-09-24 — คนละช่อง จาก REG_DYNAMIC_SCRIPT_/
 *  REG_RESPONSIBLE_SCRIPT_ เดิม กันกระทบ logic ตำแหน่ง/คณะกรรมการที่มีอยู่แล้ว — 2026-10-07 ตัด binding ของ
 *  "ระบุประเภทผลงาน" ออก เพราะตัด field ประเภทผลงานออกจากฟอร์มทั้งหมดแล้วตามที่ผู้ใช้ขอ) */
var REG_LAYOUT_TOGGLE_SCRIPT_ = '' +
  '<script>' +
  'document.addEventListener("DOMContentLoaded", function () {' +
  'function bindOtherToggle(selectId, fieldId, inputId) {' +
  'var sel = document.getElementById(selectId);' +
  'var field = document.getElementById(fieldId);' +
  'if (!sel || !field) return;' +
  'sel.addEventListener("change", function () {' +
  'var isOther = sel.value === "อื่น ๆ";' +
  'field.style.display = isOther ? "" : "none";' +
  'if (!isOther) { var input = document.getElementById(inputId); if (input) input.value = ""; }' +
  '});' +
  '}' +
  'bindOtherToggle("reg-title-name", "reg-title-other-field", "reg-title-name-other");' +
  '});' +
  '</script>';

/**
 * 2026-10-08 — toggle พื้นที่ยืนยัน (.wf-confirm) ของหน้า Workflow Checklist (?page=scan) กดปุ่มกดได้
 * (.wf-step-actionable) แล้วเลื่อนลงมาเห็นฟอร์ม "กำลังเปลี่ยนสถานะ จาก/เป็น + หมายเหตุ + ยืนยัน/ยกเลิก" แทนเปลี่ยน
 * state ทันที (ตามที่ผู้ใช้ขอข้อ 6) ไม่ใช่ AJAX — ฟอร์มข้างในยัง POST เต็มรูปแบบไปที่ form_action=state_transition
 * เดิมทุกประการ (performStateTransition_ ตรวจสิทธิ์/allowed-state ซ้ำฝั่ง server เสมอ) toggle นี้แค่ซ่อน/โชว์
 * DOM เฉยๆ กดได้ปุ่มเดียวต่อครั้ง (เลือกปุ่มอื่นจะปิดฟอร์มเดิมอัตโนมัติ กันสับสนว่ากำลังยืนยันอันไหน)
 */
var WF_CONFIRM_TOGGLE_SCRIPT_ = '' +
  '<script>' +
  'document.addEventListener("DOMContentLoaded", function () {' +
  'var buttons = document.querySelectorAll(".wf-step-actionable");' +
  'var panels = document.querySelectorAll(".wf-confirm");' +
  'function closeAll() { panels.forEach(function (p) { p.style.display = "none"; }); }' +
  'buttons.forEach(function (btn) {' +
  'btn.addEventListener("click", function () {' +
  'var targetId = btn.getAttribute("data-confirm-target");' +
  'var target = document.getElementById(targetId);' +
  'if (!target) return;' +
  'var alreadyOpen = target.style.display === "block";' +
  'closeAll();' +
  'if (!alreadyOpen) { target.style.display = "block"; target.scrollIntoView({ behavior: "smooth", block: "center" }); }' +
  '});' +
  '});' +
  'document.querySelectorAll(".wf-confirm-cancel").forEach(function (btn) {' +
  'btn.addEventListener("click", closeAll);' +
  '});' +
  '});' +
  '</script>';

/**
 * 2026-11-05 — requirement ใหม่ "ป้องกัน record ซ้ำตอน Refresh หน้า Success" (ข้อ 20-22) เดิม doPost
 * (form_action=register_work) render renderRegisterSuccessBody_ ตรงใน response ของ POST เลย — ถ้าผู้ใช้ Refresh
 * หน้านั้น browser จะเสนอ "ส่งฟอร์มซ้ำ?" ซึ่งถ้ากดยืนยันจะเรียก registerNewWork_ ซ้ำ เกิด record ซ้ำจริง
 * เปลี่ยนมาเป็นหน้า "bounce" ชั่วคราวที่พา redirect ไปหน้า GET ?page=register_success&id=<work_id> แทน (GET
 * ล้วนๆ ไม่มีการเขียนชีตใดๆ — Refresh กี่ครั้งก็ปลอดภัย) ใช้ลวดลาย/CSS class เดียวกับ
 * renderOwnerLoginBounceBody_ (OwnerAuth.gs) ที่พิสูจน์แล้วจากรอบนั้นว่า top.location.replace() อัตโนมัติไม่ทำงาน
 * 100% บน Apps Script Web App (sandbox iframe ไม่มี user gesture) จึงต้องมีปุ่มกดได้ทันทีสำรองไว้เสมอ — ไม่ใช่
 * save logic ใหม่ ไม่ใช่ระบบ log ใหม่ แค่เปลี่ยน "Post-save navigation" ตามที่ข้อ 27 อนุญาตให้แก้ได้ตรงๆ
 * dateOrderWarning (ข้อ 10 เดิม) ส่งผ่าน query string ต่อไปเพราะเป็นค่าชั่วคราวตอน save ไม่ได้เก็บลงชีต
 */
function renderRegisterSaveBounceBody_(baseUrl, workId, dateOrderWarning) {
  var url = baseUrl + '?page=register_success&id=' + encodeURIComponent(workId) + (dateOrderWarning ? '&dw=1' : '');
  return '' +
    '<div class="detail-card owner-bounce-loading" id="regsuccess-bounce-fallback">' +
    '<div class="owner-bounce-spinner" aria-hidden="true"></div>' +
    '<p class="owner-bounce-text">กำลังเปิดหน้าบันทึกสำเร็จ...</p>' +
    '<a target="_top" id="regsuccess-bounce-link" class="owner-bounce-link btn-primary" style="display:inline-block;text-decoration:none" href="' + escapeHtml_(url) + '">เปิดหน้าบันทึกสำเร็จ</a>' +
    '</div>' +
    '<script>(function () {' +
    'var u = ' + JSON.stringify(url) + ';' +
    'try { top.location.replace(u); } catch (err) { /* เงียบไว้ ใช้ปุ่มลิงก์แทน — ข้อจำกัด sandbox iframe ไม่มี user gesture */ }' +
    'var link = document.getElementById("regsuccess-bounce-link");' +
    'if (link) link.focus();' +
    '})();</script>';
}

/**
 * Success Confirmation Page หลังบันทึกข้อมูลใหม่สำเร็จ (requirement ใหม่ 2026-11-05 — เดิมหน้านี้โชว์ QR + ลิงก์
 * "ลงทะเบียนรายการถัดไป", ระบบ QR ถูกถอดออกจาก flow นี้แล้วตามที่ระบุ ห้ามเพิ่มกลับมา)
 *
 * รับ "work" ที่โหลดสดจาก work_id ผ่าน findWorkById_ เดิม (เรียกจาก case 'register_success', Code.gs — ไม่ใช่
 * ค่าที่ client เดา/ไม่ใช่ค่าจาก input form เดิม ข้อ 8/9 "ต้องใช้ข้อมูลหลัง Save จริง") เพราะหน้านี้มาจาก GET
 * (reload ซ้ำได้ไม่จำกัดโดยไม่สร้าง record ใหม่ ดูคอมเมนต์ renderRegisterSaveBounceBody_ ด้านบน) ค่าทุกฟิลด์จึง
 * เป็นค่าที่ถูก Save ลงชีต Works จริงเท่านั้น (title_name/first_name/last_name/work_title/tracking_no)
 */
function renderRegisterSuccessBody_(work, baseUrl, dateOrderWarning) {
  var dateWarningHtml = dateOrderWarning
    ? '<div class="warning-banner">วันที่ธุรการรับเรื่องไม่ควรก่อนวันที่ส่งหนังสือ กรุณาตรวจสอบข้อมูล</div>'
    : '';

  // ข้อ 23 — คำนำหน้า+ชื่อ+นามสกุลจริง ห้าม null/undefined/ว่างเปล่าโดยไม่มี fallback (รูปแบบต่อข้อความเดียวกับที่
  // ใช้ทั่วระบบอยู่แล้ว — ดู LegacyMigration.gs/LegacyUpdate1012.gs: title_name+first_name+' '+last_name)
  var ownerName = (String(work.title_name || '') + String(work.first_name || '') + ' ' + String(work.last_name || '')).trim() || '-';

  // ข้อ 24 — ไม่มีชื่อผลงานจริง (ไม่ควรเกิดเพราะเป็นฟิลด์บังคับ แต่กันไว้) ไม่ต้อง render แถวนี้เลย ห้ามแสดง "-"
  // icon &#128221; เดียวกับ summaryItem("ชื่อผลงาน", ...) ของ Owner Summary Card เดิม (renderOwnerDashboardBody_,
  // OwnerAuth.gs) — reuse code point เดิมของระบบ ไม่คิดไอคอนใหม่
  var workTitleRowHtml = work.work_title
    ? regsuccessRow_('&#128221;', 'ชื่อผลงาน', escapeHtml_(work.work_title), '')
    : '';

  return '' +
    dateWarningHtml +
    '<div class="regsuccess-card">' +
    '<div class="regsuccess-icon-ring"><div class="regsuccess-icon-circle" aria-hidden="true">&#10003;</div></div>' +
    '<h1 class="regsuccess-title">บันทึกข้อมูลเรียบร้อยแล้ว</h1>' +
    '<p class="regsuccess-desc">ระบบได้บันทึกข้อมูลผลงานเรียบร้อยแล้ว สามารถดูรายละเอียดหรือติดตามกระบวนการดำเนินงานได้</p>' +
    '<div class="regsuccess-summary">' +
    regsuccessRow_('&#128100;', 'ชื่อเจ้าของผลงาน', escapeHtml_(ownerName), '') +
    workTitleRowHtml +
    // ข้อ 25 — เลขทะเบียน (tracking_no จริงที่ backend สร้าง — ห้ามเลขบัตรประชาชน) ให้เด่นกว่าแถวอื่นเล็กน้อย
    // icon &#128196; เดียวกับ summaryItem("เลขทะเบียน", ...) ของ Owner Summary Card เดิม
    regsuccessRow_('&#128196;', 'เลขทะเบียน', escapeHtml_(work.tracking_no), ' regsuccess-tracking') +
    '</div>' +
    '<div class="regsuccess-actions">' +
    '<a class="btn-primary regsuccess-btn regsuccess-btn-primary" target="_top" href="' + baseUrl + '?page=detail&id=' + encodeURIComponent(work.work_id) + '">' +
    '<span class="regsuccess-btn-icon" aria-hidden="true">&#9881;</span>ดูกระบวนการดำเนินงาน</a>' +
    '<a class="btn-outline regsuccess-btn regsuccess-btn-secondary" target="_top" href="' + baseUrl + '?page=registry">' +
    '<span class="regsuccess-btn-icon" aria-hidden="true">&#9636;</span>กลับไปหน้ารายการ</a>' +
    '</div>' +
    '</div>';
}

/** แถวเดียวของ Summary Panel หน้า Success (icon container | label คงที่ | value) — reuse จุดเดียวกันทั้ง 3 แถว
 *  กันแก้ไม่ครบ/ลืมคลาสตกหล่น (ข้อ 6/7/8 ของ requirement ต้องหน้าตาเดียวกันทุกแถว ต่างกันแค่ icon/label/value) */
function regsuccessRow_(iconHtml, label, valueHtmlEscaped, extraValueClass) {
  return '' +
    '<div class="regsuccess-row">' +
    '<div class="regsuccess-row-icon" aria-hidden="true">' + iconHtml + '</div>' +
    '<div class="regsuccess-row-label">' + escapeHtml_(label) + '</div>' +
    '<div class="regsuccess-row-value' + (extraValueClass || '') + '">' + valueHtmlEscaped + '</div>' +
    '</div>';
}

/* ---------- โซนผู้ดูแลระบบ (Admin) — Part 7 ---------- */

var ADMIN_TABS_ = [
  { tab: 'overview', label: 'ภาพรวม' },
  { tab: 'stations', label: 'Workflow' },
  { tab: 'master', label: 'ข้อมูลหลัก' },
  { tab: 'users', label: 'ผู้ใช้งาน' },
  { tab: 'audit', label: 'Audit Log' },
  { tab: 'report', label: 'รายงาน CSV' },
];

function renderAdminTabs_(activeTab, baseUrl) {
  return '<div class="admin-tabs">' + ADMIN_TABS_.map(function (t) {
    var cls = t.tab === activeTab ? ' active' : '';
    return '<a class="admin-tab' + cls + '" target="_top" href="' + baseUrl + '?page=admin&tab=' + t.tab + '">' + escapeHtml_(t.label) + '</a>';
  }).join('') + '</div>';
}

/** แดชบอร์ดผู้บริหาร — สรุปทุกหน่วยงานในระบบ (ต่างจาก renderDashboardBody_ ที่กรองเฉพาะหน่วยงานผู้ Login) */
function renderAdminOverviewBody_(metrics, baseUrl) {
  var statusRows = Object.keys(PUBLIC_STATUS_LABELS).map(function (k) {
    return '<div class="detail-row"><span class="detail-label">' + escapeHtml_(PUBLIC_STATUS_LABELS[k]) + '</span>' +
      '<span class="detail-value">' + (metrics.statusCounts[k] || 0) + '</span></div>';
  }).join('');

  var orgTableHtml = metrics.orgList.length
    ? '<div class="table-scroll"><table class="admin-table"><thead><tr>' +
      '<th>หน่วยงาน</th><th>รอรับ</th><th>กำลังดำเนินการ</th><th>ใกล้ครบกำหนด</th><th>เกินกำหนด</th></tr></thead><tbody>' +
      metrics.orgList.map(function (r) {
        return '<tr><td>' + escapeHtml_(r.org) + '</td><td>' + r.pendingReceive + '</td><td>' + r.inProgress + '</td>' +
          '<td>' + r.nearDue + '</td><td' + (r.overdue ? ' class="cell-danger"' : '') + '>' + r.overdue + '</td></tr>';
      }).join('') + '</tbody></table></div>'
    : '<div class="empty">ยังไม่มีข้อมูล</div>';

  return '' + renderAdminTabs_('overview', baseUrl) +
    '<section class="metric-card"><div class="metric-head"><span class="metric-label">งานทั้งหมดในระบบ</span>' +
    '<span class="metric-count">' + metrics.totalWorks + '</span></div></section>' +
    '<section class="metric-card"><div class="metric-head"><span class="metric-label">แยกตามสถานะ</span></div>' + statusRows + '</section>' +
    '<section class="metric-card"><div class="metric-head"><span class="metric-label">แยกตามหน่วยงาน</span></div>' + orgTableHtml + '</section>';
}

/** ตาราง WorkStations ทั้งหมด เรียงตามลำดับ + ลิงก์แก้ไข */
function renderAdminStationsBody_(stations, baseUrl) {
  var rows = stations.map(function (s) {
    return '<tr><td>' + s.station_order + '</td><td>' + escapeHtml_(s.station_name) + '</td>' +
      '<td>' + escapeHtml_(s.org) + '</td><td>' + s.standard_days + '</td>' +
      '<td>' + (s.active ? 'เปิด' : 'ปิด') + '</td>' +
      '<td><a target="_top" href="' + baseUrl + '?page=admin&tab=station_form&key=' + encodeURIComponent(s.station_key) + '">แก้ไข</a></td></tr>';
  }).join('');

  return '' + renderAdminTabs_('stations', baseUrl) +
    '<p><a target="_top" class="btn-action btn-action-primary" href="' + baseUrl + '?page=admin&tab=station_form">+ เพิ่มสถานีใหม่</a></p>' +
    '<section class="metric-card"><div class="table-scroll"><table class="admin-table">' +
    '<thead><tr><th>ลำดับ</th><th>ชื่อสถานี</th><th>หน่วยงาน</th><th>วันมาตรฐาน</th><th>สถานะ</th><th></th></tr></thead>' +
    '<tbody>' + rows + '</tbody></table></div></section>';
}

/** ฟอร์มสร้าง/แก้ไขสถานี — station_key แก้ไม่ได้หลังสร้าง (งานเดิมอ้างอิงด้วย key นี้) */
function renderStationFormBody_(ss, station, baseUrl, errors, prevValues) {
  var isNew = !station;
  var v = function (key) {
    if (prevValues && key in prevValues) return prevValues[key];
    return station ? station[key] : '';
  };
  var errorHtml = (errors && errors.length)
    ? '<div class="error-banner"><ul>' + errors.map(function (m) { return '<li>' + escapeHtml_(m) + '</li>'; }).join('') + '</ul></div>'
    : '';

  var statusOptions = Object.keys(PUBLIC_STATUS_LABELS).map(function (k) {
    var sel = v('public_status') === k ? ' selected' : '';
    return '<option value="' + k + '"' + sel + '>' + escapeHtml_(PUBLIC_STATUS_LABELS[k]) + '</option>';
  }).join('');

  var activeChecked = (prevValues && 'active' in prevValues)
    ? (prevValues.active === true || prevValues.active === '1')
    : (station ? !!station.active : true);

  var roleChoices = getDistinctStationRoles_(ss);
  var roleSelectHtml_ = function (fieldName) {
    var current = v(fieldName);
    var opts = roleChoices.slice();
    if (current && opts.indexOf(current) === -1) opts.push(current);
    return '<select class="input" name="' + fieldName + '">' + opts.map(function (r) {
      var sel = current === r ? ' selected' : '';
      return '<option value="' + escapeHtml_(r) + '"' + sel + '>' + escapeHtml_(r) + '</option>';
    }).join('') + '</select>';
  };

  return errorHtml +
    '<form method="post" target="_top" action="' + baseUrl + '" class="reg-form">' +
    '<input type="hidden" name="form_action" value="admin_station_save">' +
    '<input type="hidden" name="is_new" value="' + (isNew ? '1' : '0') + '">' +
    '<div class="field"><label>รหัสสถานี (station_key)</label>' +
    (isNew
      ? '<input class="input" name="station_key" value="' + escapeHtml_(v('station_key')) + '" placeholder="เช่น checking (อังกฤษ ไม่เว้นวรรค)">'
      : '<input class="input" value="' + escapeHtml_(station.station_key) + '" disabled>' +
        '<input type="hidden" name="station_key" value="' + escapeHtml_(station.station_key) + '">') +
    '</div>' +
    '<div class="field-row">' +
    '<div class="field"><label>ลำดับ</label><input class="input" type="text" inputmode="decimal" pattern="[0-9]+(\.[0-9]+)?" ' +
    'placeholder="เช่น 8 หรือ 8.1" name="station_order" value="' + escapeHtml_(v('station_order')) + '"></div>' +
    '<div class="field"><label>วันมาตรฐาน</label><input class="input" type="number" name="standard_days" value="' + escapeHtml_(v('standard_days')) + '"></div>' +
    '</div>' +
    '<div class="field"><label>ชื่อสถานี</label><input class="input" name="station_name" value="' + escapeHtml_(v('station_name')) + '"></div>' +
    '<div class="field"><label>หน่วยงานรับผิดชอบ</label><input class="input" name="org" value="' + escapeHtml_(v('org')) + '">' +
    '<p class="hint" style="margin-top:4px">พิมพ์ชื่อหน่วยงานตรง ๆ (เช่น สนง เขต, เลขา) หรือพิมพ์คำว่า <code>ORG_FROM</code> ' +
    'ถ้าต้องการให้ state นี้เป็นความรับผิดชอบของ "หน่วยงานต้นสังกัดผู้ยื่น" (ต่างกันไปตามแต่ละงาน ไม่ใช่หน่วยงานคงที่)</p></div>' +
    '<div class="field"><label>สถานะสาธารณะที่แสดง</label><select class="input" name="public_status">' + statusOptions + '</select></div>' +
    '<div class="field"><label>บทบาทผู้รับเอกสาร</label>' + roleSelectHtml_('receive_role') + '</div>' +
    '<div class="field"><label>บทบาทผู้อนุมัติ</label>' + roleSelectHtml_('approve_role') + '</div>' +
    '<div class="field"><label>วิธีแจ้งเตือน</label><input class="input" name="notify_method" value="' + escapeHtml_(v('notify_method')) + '"></div>' +
    '<label class="checkbox-row"><input type="checkbox" name="active" value="1"' + (activeChecked ? ' checked' : '') + '> เปิดใช้งานสถานีนี้</label>' +
    '<button class="btn-primary" type="submit">บันทึก</button>' +
    '</form>' +
    '<p><a target="_top" href="' + baseUrl + '?page=admin&tab=stations">&larr; กลับรายการสถานี</a></p>';
}

/**
 * จัดการ Master Data (ตำแหน่ง/ด้าน/สาขาแพทย์) — 2026-09-15 CRUD เดียวใช้ร่วม 3 master ผ่าน MASTER_DATA_CONFIG_
 * (Constants.gs) สลับดูแต่ละชุดด้วยแท็บย่อย ?type= — แก้ไข/เพิ่มรายการได้ไม่ต้องแก้ source code (ข้อ Q)
 */
function renderMasterTypeTabsHtml_(activeType, baseUrl) {
  return '<div class="admin-tabs">' + Object.keys(MASTER_DATA_CONFIG_).map(function (t) {
    var cls = t === activeType ? ' active' : '';
    return '<a class="admin-tab' + cls + '" target="_top" href="' + baseUrl + '?page=admin&tab=master&type=' + t + '">' +
      escapeHtml_(MASTER_DATA_CONFIG_[t].label) + '</a>';
  }).join('') + '</div>';
}

function renderMasterListBody_(rows, masterType, baseUrl) {
  var cfg = MASTER_DATA_CONFIG_[masterType];
  var rowsHtml = rows.map(function (r) {
    var extraCells = cfg.extraFields.map(function (f) { return '<td>' + escapeHtml_(r[f.key]) + '</td>'; }).join('');
    return '<tr><td>' + r.sort_order + '</td><td>' + escapeHtml_(r[cfg.nameField]) + '</td>' + extraCells +
      '<td>' + (r.active ? 'เปิด' : 'ปิด') + '</td>' +
      '<td><a target="_top" href="' + baseUrl + '?page=admin&tab=master_form&type=' + masterType +
      '&code=' + encodeURIComponent(r[cfg.codeField]) + '">แก้ไข</a></td></tr>';
  }).join('');

  var extraHeaders = cfg.extraFields.map(function (f) { return '<th>' + escapeHtml_(f.label) + '</th>'; }).join('');

  return '' + renderAdminTabs_('master', baseUrl) + renderMasterTypeTabsHtml_(masterType, baseUrl) +
    '<p><a target="_top" class="btn-action btn-action-primary" href="' + baseUrl + '?page=admin&tab=master_form&type=' + masterType + '">+ เพิ่ม' + escapeHtml_(cfg.label) + '</a></p>' +
    '<section class="metric-card"><div class="table-scroll"><table class="admin-table">' +
    '<thead><tr><th>ลำดับ</th><th>ชื่อ</th>' + extraHeaders + '<th>สถานะ</th><th></th></tr></thead>' +
    '<tbody>' + (rowsHtml || '<tr><td colspan="9" class="empty">ยังไม่มีรายการ</td></tr>') + '</tbody></table></div></section>';
}

function renderMasterFormBody_(masterType, record, baseUrl, errors, prevValues) {
  var cfg = MASTER_DATA_CONFIG_[masterType];
  var isNew = !record;
  var v = function (key) {
    if (prevValues && key in prevValues) return prevValues[key];
    return record ? record[key] : '';
  };
  var errorHtml = (errors && errors.length)
    ? '<div class="error-banner"><ul>' + errors.map(function (m) { return '<li>' + escapeHtml_(m) + '</li>'; }).join('') + '</ul></div>'
    : '';

  var activeChecked = (prevValues && 'active' in prevValues)
    ? (prevValues.active === true || prevValues.active === '1')
    : (record ? !!record.active : true);

  var extraFieldsHtml = cfg.extraFields.map(function (f) {
    return '<div class="field"><label>' + escapeHtml_(f.label) + '</label><input class="input" name="' + f.key + '" value="' + escapeHtml_(v(f.key)) + '"></div>';
  }).join('');

  return errorHtml +
    '<div class="pub-subheader">' + escapeHtml_(cfg.label) + '</div>' +
    '<form method="post" target="_top" action="' + baseUrl + '" class="reg-form">' +
    '<input type="hidden" name="form_action" value="admin_master_save">' +
    '<input type="hidden" name="master_type" value="' + escapeHtml_(masterType) + '">' +
    '<input type="hidden" name="is_new" value="' + (isNew ? '1' : '0') + '">' +
    '<div class="field"><label>รหัส (' + escapeHtml_(cfg.codeField) + ')</label>' +
    (isNew
      ? '<input class="input" name="' + cfg.codeField + '" value="' + escapeHtml_(v(cfg.codeField)) + '" placeholder="เช่น md (อังกฤษ ไม่เว้นวรรค)">'
      : '<input class="input" value="' + escapeHtml_(record[cfg.codeField]) + '" disabled>' +
        '<input type="hidden" name="' + cfg.codeField + '" value="' + escapeHtml_(record[cfg.codeField]) + '">') +
    '</div>' +
    '<div class="field"><label>ชื่อ (' + escapeHtml_(cfg.nameField) + ')</label><input class="input" name="' + cfg.nameField + '" value="' + escapeHtml_(v(cfg.nameField)) + '"></div>' +
    extraFieldsHtml +
    '<div class="field"><label>ลำดับ (sort_order)</label><input class="input" type="number" name="sort_order" value="' + escapeHtml_(String(v('sort_order') || '0')) + '"></div>' +
    '<label class="checkbox-row"><input type="checkbox" name="active" value="1"' + (activeChecked ? ' checked' : '') + '> เปิดใช้งานรายการนี้</label>' +
    '<button class="btn-primary" type="submit">บันทึก</button>' +
    '</form>' +
    '<p><a target="_top" href="' + baseUrl + '?page=admin&tab=master&type=' + masterType + '">&larr; กลับรายการ</a></p>';
}

/** ตารางผู้ใช้งานทั้งหมด + ลิงก์แก้ไข */
function renderAdminUsersBody_(users, baseUrl) {
  var rows = users.map(function (u) {
    return '<tr><td>' + escapeHtml_(u.display_name) + '</td><td>' + escapeHtml_(u.user_email) + '</td>' +
      '<td>' + escapeHtml_(u.role) + '</td><td>' + escapeHtml_(u.organization) + '</td>' +
      '<td>' + (u.active ? 'เปิด' : 'ปิด') + '</td>' +
      '<td><a target="_top" href="' + baseUrl + '?page=admin&tab=user_form&email=' + encodeURIComponent(u.user_email) + '">แก้ไข</a></td></tr>';
  }).join('');

  return '' + renderAdminTabs_('users', baseUrl) +
    '<p><a target="_top" class="btn-action btn-action-primary" href="' + baseUrl + '?page=admin&tab=user_form">+ เพิ่มผู้ใช้งานใหม่</a></p>' +
    '<section class="metric-card"><div class="table-scroll"><table class="admin-table">' +
    '<thead><tr><th>ชื่อ</th><th>อีเมล</th><th>บทบาท</th><th>หน่วยงาน</th><th>สถานะ</th><th></th></tr></thead>' +
    '<tbody>' + rows + '</tbody></table></div></section>';
}

/** ฟอร์มสร้าง/แก้ไขผู้ใช้ — user_email เป็น key คงที่ (แก้ไม่ได้หลังสร้าง) */
function renderUserFormBody_(user, baseUrl, errors, prevValues) {
  var isNew = !user;
  var v = function (key) {
    if (prevValues && key in prevValues) return prevValues[key];
    return user ? user[key] : '';
  };
  var errorHtml = (errors && errors.length)
    ? '<div class="error-banner"><ul>' + errors.map(function (m) { return '<li>' + escapeHtml_(m) + '</li>'; }).join('') + '</ul></div>'
    : '';

  var roleOptions = ADMIN_ROLE_OPTIONS_.map(function (r) {
    var sel = v('role') === r ? ' selected' : '';
    return '<option' + sel + '>' + escapeHtml_(r) + '</option>';
  }).join('');

  var activeChecked = (prevValues && 'active' in prevValues)
    ? (prevValues.active === true || prevValues.active === '1')
    : (user ? !!user.active : true);

  return errorHtml +
    '<form method="post" target="_top" action="' + baseUrl + '" class="reg-form">' +
    '<input type="hidden" name="form_action" value="admin_user_save">' +
    '<input type="hidden" name="is_new" value="' + (isNew ? '1' : '0') + '">' +
    '<div class="field"><label>อีเมล (บัญชี Google)</label>' +
    (isNew
      ? '<input class="input" type="email" name="user_email" value="' + escapeHtml_(v('user_email')) + '">'
      : '<input class="input" value="' + escapeHtml_(user.user_email) + '" disabled>' +
        '<input type="hidden" name="user_email" value="' + escapeHtml_(user.user_email) + '">') +
    '</div>' +
    '<div class="field"><label>ชื่อที่แสดง</label><input class="input" name="display_name" value="' + escapeHtml_(v('display_name')) + '"></div>' +
    '<div class="field"><label>บทบาท</label><select class="input" name="role">' + roleOptions + '</select></div>' +
    '<div class="field"><label>หน่วยงาน</label><input class="input" name="organization" value="' + escapeHtml_(v('organization')) + '"></div>' +
    '<label class="checkbox-row"><input type="checkbox" name="active" value="1"' + (activeChecked ? ' checked' : '') + '> เปิดใช้งานบัญชีนี้</label>' +
    '<button class="btn-primary" type="submit">บันทึก</button>' +
    '</form>' +
    '<p><a target="_top" href="' + baseUrl + '?page=admin&tab=users">&larr; กลับรายการผู้ใช้งาน</a></p>';
}

/** Audit Log — แสดงล่าสุดก่อน (ฟังก์ชันเรียกมาตัดจำนวนแล้วที่ Admin.gs) */
function renderAdminAuditBody_(logs, baseUrl) {
  var rows = logs.length
    ? '<ul class="timeline">' + logs.map(function (l) {
        return '<li class="tl-item"><div class="tl-head"><b>' + escapeHtml_(l.action) + '</b>' +
          '<span class="tl-date">' + formatDateTh_(l.timestamp) + '</span></div>' +
          '<div class="tl-meta">' + escapeHtml_(l.user_email) + ' — อ้างอิง: ' + escapeHtml_(l.work_id) + '</div>' +
          '<div class="tl-note">' + escapeHtml_(l.field_changed) + ': "' + escapeHtml_(l.old_value) + '" &rarr; "' + escapeHtml_(l.new_value) + '"</div>' +
          '</li>';
      }).join('') + '</ul>'
    : '<div class="empty">ยังไม่มีรายการ</div>';

  return '' + renderAdminTabs_('audit', baseUrl) +
    '<p class="scope-note">แสดง 200 รายการล่าสุด</p>' +
    '<section class="metric-card">' + rows + '</section>';
}

/**
 * หน้ารายงาน CSV — ลิงก์ดาวน์โหลดตรง (GET, Admin เท่านั้น ตรวจซ้ำที่ renderAdminRoute_)
 * 2026-10-06 แก้บั๊กจริง (เจอจากมุมมอง Excel ของหน้าทะเบียน บั๊กเดียวกัน): target="_top" กับลิงก์ที่ตอบกลับเป็น
 * ContentService (ไฟล์ ไม่ใช่หน้า HTML) ผ่าน iframe sandbox ทำให้เจอหน้า Google ไดรฟ์ "ไม่สามารถเปิดไฟล์ได้"
 * แก้เป็น target="_blank" + class "export-download" (GIS_AUTH_SCRIPT_ แนบ auth token ให้เหมือนเดิม)
 */
function renderAdminReportBody_(baseUrl) {
  return '' + renderAdminTabs_('report', baseUrl) +
    '<div class="detail-card">' +
    '<p>ดาวน์โหลดข้อมูลเป็นไฟล์ CSV (เปิดด้วย Excel/Google Sheets)</p>' +
    '<p><a target="_blank" class="btn-action btn-action-secondary export-download" href="' + baseUrl + '?page=admin&tab=report&format=csv&type=works">ดาวน์โหลดรายการงานทั้งหมด (CSV)</a></p>' +
    '<p><a target="_blank" class="btn-action btn-action-secondary export-download" href="' + baseUrl + '?page=admin&tab=report&format=csv&type=audit">ดาวน์โหลด Audit Log (CSV)</a></p>' +
    '</div>';
}

var STAFF_CSS_ = '' +
  ':root{--navy:#1f3b54;--teal:#0e7c86;--bg:#eef4f6;--card:#fff;--border:#dde3e8;--text:#1c2b3a;--muted:#5b7184;' +
  '--pending:#8a94a3;--active:#0e7c86;--revision:#b8860b;--danger:#b23a3a;--done:#1f8a4c;}' +
  '*{box-sizing:border-box;}' +
  'body{font-family:"Sarabun",sans-serif;background:var(--bg);color:var(--text);margin:0;padding-bottom:76px;}' +
  '.topbar{position:sticky;top:0;z-index:5;background:var(--navy);color:#fff;padding:12px 16px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:4px;}' +
  '.topbar-title{font-weight:700;font-size:1.05rem;}' +
  '.topbar-user{font-size:.8rem;opacity:.9;text-align:right;}' +
  '.orgtag{display:block;font-size:.72rem;opacity:.8;}' +
  '.content{width:80%;max-width:1600px;margin:0 auto;padding:14px 12px 12px;box-sizing:border-box;}' +
  '@media print{.topbar,.bottomnav,.fab,.no-print{display:none!important;}.content{width:100%;padding:0;}}' +
  '.scope-note{font-size:.85rem;color:var(--muted);margin:2px 4px 12px;}' +
  '.metric-card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:14px 16px;margin-bottom:12px;box-shadow:0 1px 2px rgba(20,40,55,.06);}' +
  '.metric-head{display:flex;justify-content:space-between;align-items:baseline;}' +
  '.metric-label{font-weight:700;color:var(--navy);}' +
  '.metric-count{font-size:1.3rem;font-weight:700;color:var(--teal);font-variant-numeric:tabular-nums;}' +
  '.metric-hint{font-size:.78rem;color:var(--muted);margin:2px 0 10px;}' +
  // Search Result Card เต็มรูปแบบ (หน้า staff "ค้นหา" เท่านั้น 2026-09-24) — ชื่อเจ้าของผลงานเด่นสุด, เลขทะเบียน
  // รอง (muted), หน่วยงาน, badge สถานะ+ปุ่มดูรายละเอียด แถวล่าง wrap ได้บนจอแคบ (ห้าม horizontal scroll)
  '.search-results-list{display:flex;flex-direction:column;gap:12px;}' +
  '.search-result-card{display:block;background:var(--card);border:1px solid var(--border);border-radius:14px;padding:16px;text-decoration:none;color:inherit;}' +
  '.search-result-owner{font-weight:700;font-size:1.15rem;color:var(--navy);line-height:1.3;word-wrap:break-word;}' +
  '.search-result-tracking{font-size:.82rem;font-weight:500;color:var(--muted);margin-top:4px;}' +
  '.search-result-org{font-size:.88rem;color:var(--text);margin-top:8px;line-height:1.5;word-wrap:break-word;}' +
  '.search-result-org-label{color:var(--muted);margin-right:4px;}' +
  '.search-result-footer{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:8px;margin-top:12px;}' +
  '.search-result-footer .pill{font-size:.8rem;font-weight:600;padding:4px 11px;}' +
  '.search-result-cta{font-size:.8rem;color:var(--teal);font-weight:600;white-space:nowrap;}' +
  '.work-row{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:7px 0;border-top:1px solid var(--border);text-decoration:none;color:inherit;cursor:pointer;}' +
  '.work-row:first-child{border-top:none;}' +
  '.work-main{display:flex;flex-direction:column;min-width:0;}' +
  '.tracking{font-size:.72rem;color:var(--muted);font-variant-numeric:tabular-nums;}' +
  '.worktitle{font-size:.88rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:60vw;}' +
  '.pill{font-size:.72rem;padding:3px 9px;border-radius:999px;color:#fff;white-space:nowrap;background:var(--pending);}' +
  '.pub-search-cta{font-size:.72rem;color:var(--teal);white-space:nowrap;flex-shrink:0;}' +
  '.pill-pending{background:var(--pending);}.pill-active{background:var(--active);}' +
  '.pill-revision{background:var(--revision);}.pill-danger{background:var(--danger);}.pill-done{background:var(--done);}' +
  '.empty{font-size:.8rem;color:var(--muted);padding:6px 0;}' +
  '.stub{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:20px;text-align:center;}' +
  '.fab{position:fixed;right:18px;bottom:88px;width:52px;height:52px;border-radius:50%;background:var(--teal);color:#fff;' +
  'font-size:1.6rem;display:flex;align-items:center;justify-content:center;text-decoration:none;box-shadow:0 3px 8px rgba(20,40,55,.3);z-index:6;}' +
  // 2026-10-08 — ปรับสูงขึ้นเล็กน้อย (~64-72px) + เงาอ่อนมากด้านบน ตามที่ผู้ใช้ขอ (3 เมนูเท่านั้น .navitem{flex:1}
  // เดิมแบ่งพื้นที่เท่ากันอัตโนมัติอยู่แล้ว ไม่ต้องแก้สัดส่วน)
  '.bottomnav{position:fixed;bottom:0;left:0;right:0;display:flex;background:#fff;border-top:1px solid var(--border);' +
  'box-shadow:0 -1px 6px rgba(20,40,55,.05);z-index:5;}' +
  '.navitem{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;' +
  'min-height:64px;padding:10px 0;color:var(--muted);text-decoration:none;font-size:.72rem;box-sizing:border-box;}' +
  '.navitem.active{color:var(--teal);font-weight:700;}' +
  '.navicon{font-size:1.2rem;}' +
  '.reg-form{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:20px 22px;}' +
  '.field{margin-bottom:12px;display:flex;flex-direction:column;gap:4px;}' +
  '.field-row{display:flex;gap:10px;}.field-row .field{flex:1;}' +
  // "รับเอกสารใหม่" — จัดกลุ่มเป็น section (ข้อมูลบุคคล/ผลงาน/หน่วยงาน/ติดต่อ) 2026-09-24 ตามที่ผู้ใช้ขอ
  // ให้ฟอร์มกระชับขึ้น, คำนำหน้าชื่อ+ชื่อ+นามสกุล อยู่บรรทัดเดียวกัน (สัดส่วน ~20/40/40 บน desktop)
  '.reg-section{margin-bottom:16px;}.reg-section:last-of-type{margin-bottom:0;}' +
  '.reg-section-title{font-size:.8rem;font-weight:700;color:var(--navy);margin:0 0 10px;padding-bottom:6px;border-bottom:1px solid var(--border);letter-spacing:.2px;}' +
  '.field-row-name .field-title{flex:1 1 110px;}' +
  '.field-row-name .field-first,.field-row-name .field-last{flex:2 1 140px;}' +
  // ตำแหน่ง | ด้าน/สาขา | เลขตำแหน่งเดิม บรรทัดเดียวกันบน desktop (2026-10-07 แก้ตาม requirement จริง — เดิม
  // ด้าน/สาขา อยู่คนละ row ทำให้ตกบรรทัดใหม่เสมอ) สัดส่วน 40:30:30 ด้วย CSS Grid ตามที่ระบุ
  '.field-row-position{display:grid;grid-template-columns:1.4fr 1fr 1fr;gap:10px;}' +
  '.field-row-position .field{margin-bottom:0;}' +
  '.field-branch select:disabled{background:#f2f4f6;color:var(--muted);}' +
  // 2026-11-02 — กล่อง "ผู้รับผิดชอบ" (ประธานกรรมการ+เลขา) ย้ายจาก grid 2 คอลัมน์ (ซ้ายของตำแหน่ง) มาเป็น
  // block เต็มความกว้างบรรทัดใหม่ถัดจากแถวตำแหน่ง/สาขา ตามที่ผู้ใช้ยืนยันซ้ำ (ห้ามซ้าย/ห้ามข้าง/ห้ามคอลัมน์แยก)
  // ไม่ต้อง grid-column:1/-1 เพราะ parent (.reg-section) ไม่ใช่ grid อยู่แล้ว — เป็น block ปกติจึงเต็มบรรทัดเอง
  // พื้นหลังอ่อน/ไม่มี card ซ้อนหลายชั้นตามที่ระบุ (ข้อ 7) reuse .reg-section-title เดิมเป็นหัวข้อกล่อง
  '.reg-responsible-box{background:#eef6f6;border:1px solid var(--border);border-radius:10px;padding:14px;box-sizing:border-box;margin-top:14px;}' +
  // ประธาน/เลขา แนวนอน 2 คอลัมน์เท่ากันบน desktop (2026-11-02 รอบใหม่ — เดิม stack เป็น 2 แถวเต็มความกว้าง)
  // มือถือ stack 1 column ที่ breakpoint เดียวกับ field-row-position เพื่อกันข้อความล้น (ข้อ 6 — ห้ามบังคับ 2
  // คอลัมน์ถ้าข้อความล้น) ชื่อยาว wrap ได้ปกติด้วย word-wrap ที่ .reg-resp-value อยู่แล้ว
  '.reg-resp-cols{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:10px;}' +
  '@media (max-width:768px){.reg-resp-cols{grid-template-columns:1fr;gap:10px;}}' +
  '.reg-resp-label{font-size:.72rem;color:var(--muted);margin-bottom:2px;}' +
  // ชื่อบุคคลเด่นกว่า label เล็กน้อยตามที่ระบุ (ข้อ 12) — reuse ขนาด/สี navy แบบเดียวกับ .owner-summary-value เดิม
  '.reg-resp-value{font-size:.95rem;font-weight:700;color:var(--navy);line-height:1.35;word-wrap:break-word;}' +
  // "กำลังโหลด...", "ยังไม่ได้กำหนด", "เลือกตำแหน่งก่อน" ฯลฯ — เบากว่าชื่อจริง ไม่ใช้สี navy เด่น (กันสับสนว่าเป็นชื่อจริง)
  '.reg-resp-value.reg-resp-empty{color:var(--muted);font-weight:600;}' +
  // 2026-10-20 — "ข้อมูลหนังสือนำส่ง" เลขหนังสือนำส่ง | วันที่ส่งหนังสือ | วันที่ธุรการรับเรื่อง สัดส่วน
  // 40:30:30 บน desktop ตามที่ผู้ใช้ขอ (ให้ fraction ตรงตัวเลยเพื่อสัดส่วนแม่นกว่า 1.4fr/1fr/1fr)
  '.field-row-forwarding{display:grid;grid-template-columns:4fr 3fr 3fr;gap:10px;}' +
  '.field-row-forwarding .field{margin-bottom:0;}' +
  '@media (max-width:768px){.field-row-forwarding{grid-template-columns:1fr;}}' +
  // ข้อมูลหน่วยงาน (2026-10-07, Master Data เขตสุขภาพที่ 11) — ประเภทหน่วยงาน:ชื่อหน่วยงาน สัดส่วน 30:70 บน desktop
  // ประเภทหน่วยงาน | ชื่อหน่วยงาน | จังหวัด บรรทัดเดียวกันบน desktop (2026-10-07 รอบ 2 แก้ตาม requirement จริง —
  // เดิมจังหวัดอยู่คนละ row) สัดส่วน 25:50:25 ด้วย CSS Grid ตามที่ระบุ (relative position ของ .org-suggest ต้อง
  // อยู่ใน grid item เดียวกับช่องชื่อหน่วยงาน ไม่กระทบ — .org-suggest-wrap อยู่ชั้นในไม่ใช่ grid item เอง)
  '.field-row-org{display:grid;grid-template-columns:1fr 1.4fr 0.8fr 0.8fr;gap:10px;}' +
  '.field-row-org .field{margin-bottom:0;}' +
  '@media (max-width:768px){.field-row-org{grid-template-columns:1fr;}}' +
  '.input[readonly]{background:#f2f4f6;color:var(--muted);}' +
  // Searchable autocomplete ชื่อหน่วยงาน (2026-10-07 รอบ 2) — custom dropdown เอง (ไม่ใช้ <datalist> เดิม เพราะ
  // ต้อง partial-match หลาย field + โชว์จังหวัด/อำเภอใต้ชื่อ + keyboard nav ซึ่ง datalist ทำไม่ได้) vanilla JS
  // ล้วน ไม่มี framework กรองจาก REG_ORG_LOOKUP_ ที่ฝังมาครั้งเดียวเหมือนเดิม
  '.org-suggest-wrap{position:relative;}' +
  '.org-suggest{position:absolute;left:0;right:0;top:calc(100% + 2px);z-index:30;background:#fff;' +
  'border:1px solid var(--border);border-radius:10px;max-height:280px;overflow-y:auto;' +
  'box-shadow:0 6px 18px rgba(20,30,40,.12);display:none;}' +
  '.org-suggest.open{display:block;}' +
  '.org-suggest-item{min-height:44px;padding:8px 12px;display:flex;flex-direction:column;justify-content:center;' +
  'cursor:pointer;border-bottom:1px solid var(--border);}' +
  '.org-suggest-item:last-child{border-bottom:none;}' +
  '.org-suggest-item.active,.org-suggest-item:hover{background:#eaf6f6;}' +
  '.org-suggest-name{font-size:.86rem;font-weight:600;color:var(--text);}' +
  '.org-suggest-meta{font-size:.74rem;color:var(--muted);margin-top:1px;}' +
  '.org-suggest-empty{padding:12px;font-size:.82rem;color:var(--muted);text-align:center;}' +
  // breakpoint 768px ตามที่ระบุเฉพาะแถว ตำแหน่ง/ด้าน-สาขา/เลขตำแหน่งเดิม (คนละ breakpoint จาก field-row อื่นๆ
  // ที่ stack ที่ 640px — ทำตามที่ผู้ใช้ระบุไว้ตรงๆ)
  '@media (max-width:768px){.field-row-position{grid-template-columns:1fr;}}' +
  '@media (max-width:640px){' +
  '.reg-form{padding:16px;}' +
  '.field-row{flex-wrap:wrap;}' +
  '.field-row-name{flex-wrap:wrap;}.field-row-name .field-title{flex:1 1 100%;}' +
  '.field-row-name .field-first,.field-row-name .field-last{flex:1 1 calc(50% - 5px);}' +
  '.reg-form .btn-primary{width:100%;}' +
  '}' +
  '.field label{font-size:.78rem;color:var(--muted);}' +
  '.input{font-family:inherit;font-size:.92rem;padding:9px 10px;border:1px solid var(--border);border-radius:8px;background:#fff;color:var(--text);}' +
  'textarea.input{resize:vertical;}' +
  '.btn-primary{width:100%;padding:12px;border:none;border-radius:10px;background:var(--teal);color:#fff;font-size:1rem;font-weight:700;font-family:inherit;margin-top:6px;}' +
  '.error-banner{background:#fdecec;border:1px solid var(--danger);color:var(--danger);border-radius:10px;padding:10px 14px;margin-bottom:12px;font-size:.85rem;}' +
  '.error-banner ul{margin:6px 0 0;padding-left:18px;}' +
  '.success-banner{background:#e8f6ee;border:1px solid #2f9e57;color:#1f7a40;border-radius:10px;padding:10px 14px;margin-bottom:12px;font-size:.85rem;font-weight:600;}' +
  // 2026-10-20 — เตือนไม่บล็อก (เช่น วันที่ธุรการรับเรื่องก่อนวันที่ส่งหนังสือ) สีเหลือง/ส้มต่างจาก error สีแดง
  '.warning-banner{background:#fff6e5;border:1px solid var(--revision);color:#8a5a00;border-radius:10px;padding:10px 14px;margin-bottom:12px;font-size:.85rem;}' +
  '.registry-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px;margin-bottom:12px;}' +
  '.registry-tile{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:10px 12px;text-decoration:none;text-align:center;}' +
  '.registry-tile-count{display:block;font-size:1.3rem;font-weight:700;color:var(--navy);}' +
  '.registry-tile-label{display:block;font-size:.72rem;color:var(--muted);margin-top:2px;}' +
  '.registry-tile.active{border-color:var(--teal);background:#e8f6f6;}' +
  '.registry-tile.active .registry-tile-count{color:var(--teal);}' +
  // 2026-10-20 ตามที่ผู้ใช้ขอ — การ์ดสรุป "ผลการพิจารณา" 4 ช่อง สีอ่อน/professional (ข้อ 5) desktop แถวเดียว
  // 4 ช่อง มือถือ 2x2 (640px) และ 1 column ถ้าจอเล็กมาก (380px)
  '.registry-result-section-title{font-size:.8rem;font-weight:700;color:var(--navy);margin:4px 0 8px;}' +
  '.registry-result-tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px;}' +
  '@media (max-width:640px){.registry-result-tiles{grid-template-columns:repeat(2,1fr);}}' +
  '@media (max-width:380px){.registry-result-tiles{grid-template-columns:1fr;}}' +
  '.registry-result-tile{display:block;border-radius:10px;padding:10px 12px;text-decoration:none;text-align:center;border:1px solid transparent;}' +
  '.registry-result-tile-count{display:block;font-size:1.3rem;font-weight:700;}' +
  '.registry-result-tile-label{display:block;font-size:.72rem;margin-top:2px;}' +
  '.registry-result-tile.active{border-width:2px;box-shadow:0 1px 4px rgba(20,40,55,.12);}' +
  '.registry-result-tile-pass{background:#e8f6ee;border-color:#cdeadb;}' +
  '.registry-result-tile-pass .registry-result-tile-count,.registry-result-tile-pass .registry-result-tile-label{color:#1f7a40;}' +
  '.registry-result-tile-pass.active{border-color:#2f9e57;}' +
  '.registry-result-tile-revision2{background:#fff8e1;border-color:#f2e2ad;}' +
  '.registry-result-tile-revision2 .registry-result-tile-count,.registry-result-tile-revision2 .registry-result-tile-label{color:#8a6400;}' +
  '.registry-result-tile-revision2.active{border-color:#e3b341;}' +
  '.registry-result-tile-revision6{background:#fff1e6;border-color:#f3d2b3;}' +
  '.registry-result-tile-revision6 .registry-result-tile-count,.registry-result-tile-revision6 .registry-result-tile-label{color:#95430a;}' +
  '.registry-result-tile-revision6.active{border-color:#e08a3c;}' +
  '.registry-result-tile-fail{background:#fdecec;border-color:#f3cfcf;}' +
  '.registry-result-tile-fail .registry-result-tile-count,.registry-result-tile-fail .registry-result-tile-label{color:#b42318;}' +
  '.registry-result-tile-fail.active{border-color:var(--danger);}' +
  '.pager{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:12px;font-size:.8rem;flex-wrap:wrap;}' +
  '.pager a{color:var(--teal);text-decoration:none;font-weight:600;}' +
  '.muted-link{color:var(--muted);}' +
  '.success-card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:24px;text-align:center;}' +
  '.success-title{color:var(--done);font-weight:700;font-size:1.1rem;margin:0 0 8px;}' +
  '.tracking-big{font-size:1.4rem;font-weight:700;color:var(--navy);font-variant-numeric:tabular-nums;margin:0 0 14px;}' +
  '.qr-img{width:200px;height:200px;border:1px solid var(--border);border-radius:8px;}' +
  '.hint{font-size:.8rem;color:var(--muted);margin-top:14px;}' +
  '.search-form{display:flex;gap:8px;margin-bottom:12px;}' +
  '.search-form .input{flex:1;}' +
  '.search-form .btn-primary{width:auto;padding:9px 18px;margin-top:0;}' +
  '.detail-card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:12px;}' +
  '.detail-head{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap;}' +
  '.detail-row{display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-top:1px solid var(--border);font-size:.88rem;}' +
  '.detail-row:first-of-type{border-top:none;}' +
  '.detail-label{color:var(--muted);flex-shrink:0;}' +
  '.detail-value{text-align:right;}' +
  '.timeline{list-style:none;margin:0;padding:0;}' +
  '.tl-item{padding:9px 0;border-top:1px solid var(--border);}' +
  '.tl-item:first-child{border-top:none;}' +
  '.tl-head{display:flex;justify-content:space-between;gap:8px;font-size:.88rem;}' +
  '.tl-date{color:var(--muted);font-size:.76rem;font-variant-numeric:tabular-nums;white-space:nowrap;}' +
  '.tl-meta{font-size:.78rem;color:var(--muted);margin-top:2px;}' +
  '.tl-note{font-size:.82rem;margin-top:3px;}' +
  '.action-list{display:flex;flex-direction:column;gap:8px;margin-bottom:14px;}' +
  // หน้าสแกน QR (2026-09-24) — คั่นปุ่ม action ออกจากการ์ดสถานะ/ข้อมูลสำคัญด้านบน และ Progress/Timeline ด้านล่าง
  // ด้วยเส้นบาง ลดความรู้สึกแน่น/รก ตามที่ผู้ใช้ขอ (ข้อ 9: "แยกจาก timeline")
  '.pub-scan-actions{border-top:1px solid var(--border);padding-top:12px;margin-top:4px;margin-bottom:10px;}' +
  '.pub-scan-actions .action-list:last-child{margin-bottom:0;}' +
  '.btn-action{display:block;text-align:center;padding:12px;border-radius:10px;font-weight:700;font-size:.92rem;text-decoration:none;color:#fff;}' +
  '.btn-action-primary{background:var(--teal);}' +
  '.btn-action-secondary{background:var(--navy);}' +
  '.btn-action-warn{background:var(--revision);}' +
  '.btn-action-danger{background:var(--danger);}' +
  '.btn-action-sm{display:inline-block;padding:9px 16px;flex-shrink:0;}' +
  '.action-form-title{color:var(--navy);margin:0 0 12px;font-size:1rem;}' +
  '.checkbox-row{display:flex;align-items:center;gap:8px;font-size:.88rem;padding:4px 0;}' +
  '.admin-tabs{display:flex;gap:6px;overflow-x:auto;margin-bottom:12px;}' +
  '.admin-tab{flex-shrink:0;padding:7px 14px;border-radius:999px;background:#fff;border:1px solid var(--border);color:var(--muted);text-decoration:none;font-size:.82rem;white-space:nowrap;}' +
  '.admin-tab.active{background:var(--navy);color:#fff;border-color:var(--navy);}' +
  '.table-scroll{overflow-x:auto;}' +
  '.admin-table{width:100%;border-collapse:collapse;font-size:.82rem;white-space:nowrap;}' +
  '.admin-table th,.admin-table td{text-align:left;padding:7px 9px;border-bottom:1px solid var(--border);}' +
  // หัวตารางกดเรียงได้ (หน้าทะเบียน 2026-09-24) — ลิงก์เต็มพื้นที่ th กดง่ายบนมือถือ, คอลัมน์ที่เรียงอยู่เน้นสี teal
  '.th-sort-link{display:block;color:inherit;text-decoration:none;font-weight:600;white-space:nowrap;}' +
  '.th-sort-link:hover{color:var(--teal);}' +
  '.th-sort-active,.th-sort-active .th-sort-link{color:var(--teal);}' +
  '.th-sort-active-link{color:var(--teal);}' +
  '.cell-danger{color:var(--danger);font-weight:700;}' +
  // มุมมอง Excel ของหน้าทะเบียน (2026-09-25 เพิ่มครั้งแรก, 2026-10-06 ปรับรอบ 2 ตามที่ผู้ใช้ขอ — เน้น "หน้าตา/
  // อารมณ์แบบ Excel จริงๆ" พื้นขาว เส้น grid ชัด ลดความรู้สึก dashboard/card ลง) header ติดด้านบน + freeze 3
  // คอลัมน์แรก ด้วย CSS ล้วน (position:sticky) ไม่มี JS แถวสลับสีอ่อนมากอ่านง่ายแบบ spreadsheet จริง
  // 2026-10-21 ตามที่ผู้ใช้ขอ — เปลี่ยน label เป็น "ภาพรวมผลงาน"/"ทะเบียนแบบ Excel" (ยาวกว่าเดิมเล็กน้อย) เพิ่ม
  // flex-wrap+white-space:nowrap กันข้อความล้น/ตัดคำผิด/เกิด horizontal scroll บนมือถือจอแคบมาก
  '.registry-view-toggle{display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;}' +
  '.registry-view-btn{padding:7px 16px;border-radius:999px;border:1px solid var(--border);background:#fff;color:var(--muted);text-decoration:none;font-size:.82rem;font-weight:600;white-space:nowrap;}' +
  '.registry-view-btn.active{background:var(--navy);color:#fff;border-color:var(--navy);}' +
  // Toolbar (ข้อ 2/10) — พื้นอ่อนบางๆ แยกจากตัวตารางที่ต้องขาวล้วน ไม่ใช้การ์ดหนา/เงา
  '.excel-toolbar-buttons{display:flex;gap:8px;align-items:center;margin-top:4px;}' +
  '.excel-toolbar-buttons .btn-primary{width:auto;flex-shrink:0;padding:9px 20px;margin-top:0;}' +
  // แถบ "ทั้งหมด N รายการ + ปุ่ม Export" (2026-10-07 แยกเป็นแถบของตัวเองนอก Filter ที่ยุบได้ ตามที่ผู้ใช้ขอ
  // ข้อ 6 — อยู่นอก <details> เสมอ กดดาวน์โหลดได้โดยไม่ต้องเปิด Filter) minimal: ขาว/กรอบบาง/ไม่มีสีเยอะ (ข้อ 9)
  '.excel-toolbar-meta{display:flex;flex-wrap:wrap;gap:14px;align-items:center;background:#fff;' +
  'border:1px solid var(--border);border-radius:11px;padding:12px 14px;margin-bottom:10px;font-size:.8rem;}' +
  '.excel-toolbar-count{font-weight:700;color:var(--navy);}' +
  '.excel-toolbar-sort{color:var(--muted);}' +
  '.excel-export-primary{width:auto;margin-top:0;padding:8px 18px;font-size:.85rem;}' +
  // Filter ยุบ/ขยายได้ (2026-10-07 ตามที่ผู้ใช้ขอ) — <details> ล้วน ไม่มี JS ปิดเป็นค่าเริ่มต้นเสมอ
  '.excel-filter-details{background:#fff;border:1px solid var(--border);border-radius:11px;margin-bottom:10px;overflow:hidden;}' +
  '.excel-filter-summary{list-style:none;cursor:pointer;padding:12px 14px;display:flex;align-items:center;gap:10px;' +
  'font-size:.88rem;font-weight:600;color:var(--navy);user-select:none;}' +
  '.excel-filter-summary::-webkit-details-marker{display:none;}' +
  '.excel-filter-summary::after{content:"\\25BC";margin-left:auto;font-size:.7rem;color:var(--muted);transition:transform .15s;}' +
  '.excel-filter-details[open] .excel-filter-summary::after{transform:rotate(180deg);}' +
  '.excel-filter-badge{font-size:.72rem;font-weight:700;color:#fff;background:var(--teal);padding:2px 9px;border-radius:999px;}' +
  '.excel-filter-active-summary{padding:0 14px 12px;margin-top:-4px;font-size:.78rem;color:var(--muted);}' +
  '.excel-filter-quickclear{color:var(--teal);font-weight:600;text-decoration:underline;margin-left:4px;}' +
  '.excel-toolbar-form{background:transparent;border:none;padding:0 14px 14px;}' +
  // ตัวตารางเอง — พื้นขาวสนิท กรอบเทาบาง ไม่มีมุมโค้ง/เงาแบบการ์ด ให้ความรู้สึก "เปิดไฟล์ Excel" มากที่สุด
  '.excel-sheet{background:#fff;border:1px solid #c9ced3;border-radius:2px;}' +
  '.excel-table-scroll{overflow:auto;max-height:74vh;}' +
  '.excel-table{width:100%;border-collapse:collapse;background:#fff;font-size:.8rem;white-space:nowrap;}' +
  '.excel-table th,.excel-table td{text-align:left;padding:5px 9px;border:1px solid #d7dbe0;background:#fff;}' +
  '.excel-table td{color:var(--text);}' +
  '.excel-table thead th{position:sticky;top:0;background:#eef2f5;color:var(--navy);z-index:3;white-space:nowrap;font-weight:700;border-color:#c9ced3;}' +
  '.excel-table thead th .th-sort-link{color:var(--navy);}' +
  '.excel-table thead th .th-sort-active-link,.excel-table thead th .th-sort-active{color:var(--teal);}' +
  '.excel-table tbody tr:nth-child(even) td{background:#fafbfc;}' +
  '.excel-table tbody tr:hover td{background:#eaf6f6;}' +
  '.excel-freeze{position:sticky;z-index:1;}' +
  '.excel-table tbody .excel-freeze{background:inherit;}' +
  '.excel-table tbody tr:nth-child(odd) .excel-freeze{background:#fff;}' +
  '.excel-table tbody tr:nth-child(even) .excel-freeze{background:#fafbfc;}' +
  '.excel-table tbody tr:hover .excel-freeze{background:#eaf6f6;}' +
  '.excel-table thead .excel-freeze{z-index:4;background:#eef2f5;}' +
  '.excel-freeze-1{left:0;width:44px;}' +
  '.excel-freeze-2{left:44px;min-width:90px;}' +
  '.excel-freeze-3{left:134px;min-width:160px;}' +
  '.excel-col-no{text-align:center;color:var(--muted);}' +
  '.excel-col-wide{white-space:normal;min-width:160px;}' +
  '.excel-col-month{text-align:center;min-width:56px;}' +
  // 2026-10-08 ตามที่ผู้ใช้ขอ — ความกว้างคอลัมน์ของมุมมองการ์ด (.reg-main-table, 8 คอลัมน์ใหม่) ตามที่ผู้ใช้
  // ระบุ (ข้อ 7) white-space:normal เฉพาะคอลัมน์ข้อความยาว (ชื่อ-สกุล/ตำแหน่ง/ด้าน/สถานะ) กันข้อความล้นคอลัมน์
  '.reg-main-col-seq{width:70px;text-align:center;color:var(--muted);}' +
  '.reg-main-col-name{width:260px;white-space:normal;}' +
  '.reg-main-col-position{width:180px;white-space:normal;}' +
  '.reg-main-col-specialty{width:180px;white-space:normal;}' +
  '.reg-main-col-province{width:130px;}' +
  '.reg-main-col-date{width:130px;}' +
  '.reg-main-col-team{width:90px;text-align:center;}' +
  '.reg-main-col-state{width:220px;white-space:normal;}' +
  '.reg-main-col-action{width:140px;}' +
  '.reg-main-table{table-layout:fixed;}' +
  '.excel-state-empty{color:var(--muted);}' +
  // State — ใช้แค่ text color/badge เล็กๆ (ข้อ 9 "อย่าให้ทั้งแถวมีสีจัด") reuse .pub-hero-sub-* tone เดิมเป๊ะ
  '.excel-state-badge{display:inline-block;padding:1px 7px;border-radius:999px;font-weight:700;font-size:.72rem;}' +
  // Filter หัวคอลัมน์แบบ Excel AutoFilter (ข้อ 5 ระดับ 2) — <details> ล้วน ไม่มี JS เลือกได้ทีละค่า
  '.th-filter{display:inline-block;margin-left:4px;position:relative;}' +
  '.th-filter summary{cursor:pointer;list-style:none;color:var(--muted);font-size:.72rem;padding:0 2px;}' +
  '.th-filter summary::-webkit-details-marker{display:none;}' +
  '.th-filter[open] summary{color:var(--teal);}' +
  '.th-filter-list{position:absolute;margin-top:4px;background:#fff;border:1px solid var(--border);border-radius:6px;' +
  'box-shadow:0 4px 14px rgba(20,40,55,.15);max-height:220px;overflow-y:auto;min-width:140px;z-index:10;white-space:nowrap;}' +
  '.th-filter-item{display:block;padding:6px 12px;font-size:.76rem;font-weight:400;color:var(--text);text-decoration:none;}' +
  '.th-filter-item:hover{background:var(--bg);}' +
  '.th-filter-item.active{background:#eaf6f6;color:var(--teal);font-weight:700;}' +
  '@media (max-width:768px){' +
  '.excel-table{font-size:.72rem;}' +
  '.excel-table th,.excel-table td{padding:5px 7px;}' +
  '.excel-col-wide{min-width:120px;}' +
  '.excel-toolbar-meta{gap:8px;}' +
  '}' +
  // Dashboard ผู้รับผิดชอบ (หน้าแรกใหม่) — KPI grid + กราฟ + งานของฉันแบบย่อ ใช้ token สีเดิมทั้งหมด
  '.dash-filter-form{display:flex;gap:10px;margin-bottom:6px;align-items:flex-end;}' +
  '.dash-filter-form .field{flex:1;margin-bottom:0;}' +
  '.dash-filter-form .btn-primary{width:auto;flex-shrink:0;padding:9px 20px;margin-top:0;}' + // 2026-09-24 รอบ 2 — เดิม width:100% (สืบทอดจาก .btn-primary) ทำให้ปุ่มยาวเต็มแถว
  '.kpi-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:12px 0;}' +
  '.kpi-grid-4{grid-template-columns:repeat(4,1fr);}' + // Dashboard Admin (2026-09-24) — 4 กล่อง KPI หลัก ตาม spec ข้อ 13
  '.kpi-card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:14px 12px;text-align:center;text-decoration:none;display:flex;flex-direction:column;align-items:center;gap:3px;box-shadow:0 1px 2px rgba(20,40,55,.06);}' +
  '.kpi-icon{width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:1rem;margin-bottom:4px;}' +
  '.kpi-icon-navy{background:var(--navy);}.kpi-icon-teal{background:var(--teal);}.kpi-icon-active{background:var(--active);}' +
  '.kpi-icon-revision{background:var(--revision);}.kpi-icon-done{background:var(--done);}.kpi-icon-danger{background:var(--danger);}' +
  '.kpi-count{font-size:1.5rem;font-weight:700;color:var(--navy);font-variant-numeric:tabular-nums;}' +
  '.kpi-label{font-size:.78rem;color:var(--text);font-weight:600;}' +
  '.kpi-hint{font-size:.68rem;color:var(--muted);}' +
  // KPI compact — สโคปเฉพาะ .kpi-grid-4 (Dashboard Admin) เท่านั้น ไม่กระทบ .kpi-grid เดิมของ Dashboard
  // ผู้รับผิดชอบ (2026-09-24 รอบ 2): พื้นขาวเสมอ, เส้น accent ซ้ายแทนวงกลมไอคอนสีเต็ม, สูงกะทัดรัด (~90-100px),
  // label+icon อยู่แถวเดียวกันด้านบน ตัวเลขใหญ่ชิดล่าง
  '.kpi-grid-4 .kpi-card{align-items:flex-start;text-align:left;padding:10px 12px;gap:6px;min-height:0;border-left:3px solid var(--border);border-radius:10px;}' +
  '.kpi-grid-4 .kpi-label{display:flex;align-items:center;gap:6px;font-size:.74rem;color:var(--muted);font-weight:600;}' +
  '.kpi-grid-4 .kpi-icon{width:auto;height:auto;border-radius:0;background:none;color:inherit;font-size:.95rem;margin-bottom:0;}' +
  '.kpi-grid-4 .kpi-count{font-size:1.35rem;}' +
  '.kpi-grid-4 .kpi-card-navy{border-left-color:var(--navy);}.kpi-grid-4 .kpi-card-navy .kpi-icon{color:var(--navy);}' +
  '.kpi-grid-4 .kpi-card-active{border-left-color:var(--active);}.kpi-grid-4 .kpi-card-active .kpi-icon{color:var(--active);}' +
  '.kpi-grid-4 .kpi-card-revision{border-left-color:var(--revision);}.kpi-grid-4 .kpi-card-revision .kpi-icon{color:var(--revision);}' +
  '.kpi-grid-4 .kpi-card-danger{border-left-color:var(--danger);}.kpi-grid-4 .kpi-card-danger .kpi-icon{color:var(--danger);}' +
  '.dash-quick-action-wrap{display:flex;justify-content:flex-end;margin-bottom:10px;}' +
  '.dash-quick-action{display:flex;flex-direction:column;gap:2px;background:var(--card);border:1px solid var(--border);border-radius:10px;padding:10px 16px;text-decoration:none;min-width:220px;}' +
  '.dash-quick-action-title{font-size:.86rem;font-weight:700;color:var(--navy);}' +
  '.dash-quick-action-sub{font-size:.74rem;color:var(--teal);font-weight:600;}' +
  '.chart-row{display:flex;gap:12px;margin-bottom:14px;}' +
  '.chart-box{flex:1;background:var(--card);border:1px solid var(--border);border-radius:12px;padding:14px;min-width:0;}' +
  '.chart-title{font-weight:700;color:var(--navy);font-size:.85rem;margin-bottom:8px;}' +
  '.mywork-box{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:12px 14px;margin-bottom:14px;}' +
  '.mywork-box summary{font-weight:700;color:var(--navy);font-size:.85rem;cursor:pointer;}' +
  '.mywork-section{margin-top:10px;padding-top:10px;border-top:1px solid var(--border);}' +
  '.mywork-head{font-size:.8rem;color:var(--muted);font-weight:600;margin-bottom:6px;}' +
  '@media (max-width:640px){.kpi-grid{grid-template-columns:repeat(2,1fr);}.chart-row{flex-direction:column;}.dash-filter-form{flex-wrap:wrap;}}' +
  // Dashboard Admin (2026-09-24) — section "งานที่ต้องติดตาม"/"งานใกล้ครบกำหนด" การ์ดขาวเรียบๆ badge สีอ่อน
  // (รอบ 2: padding/margin ลดลงเพื่อลด whitespace, ห่อ 2 section แรกเป็น grid 2fr/1fr บน desktop)
  '.dash-row-2-1{display:grid;grid-template-columns:2fr 1fr;gap:14px;align-items:start;}' +
  '.dash-section{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:14px 16px;margin-bottom:14px;}' +
  '.dash-section-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;gap:10px;}' +
  '.dash-section-title{font-weight:600;color:var(--navy);font-size:1rem;}' +
  '.dash-section-head a{font-size:.82rem;color:var(--teal);font-weight:600;text-decoration:none;white-space:nowrap;}' +
  '.dash-follow-row{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:9px 0;border-top:1px solid var(--border);color:inherit;flex-wrap:wrap;}' +
  '.dash-follow-row:first-child{border-top:none;padding-top:0;}' +
  '.dash-follow-main{display:flex;flex-direction:column;min-width:0;gap:2px;}' +
  '.dash-follow-owner{font-size:.88rem;color:var(--navy);font-weight:700;}' +
  '.dash-follow-tracking{font-size:.76rem;color:var(--muted);font-variant-numeric:tabular-nums;}' +
  '.dash-follow-title{font-size:.84rem;color:var(--text);font-weight:600;word-wrap:break-word;}' +
  '.dash-follow-org{font-size:.76rem;color:var(--muted);}' +
  '.dash-follow-side{display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0;}' +
  '.dash-follow-date{font-size:.72rem;color:var(--muted);}' +
  '.dash-follow-cta{font-size:.76rem;color:var(--teal);font-weight:700;text-decoration:none;white-space:nowrap;}' +
  '.dash-due-badge{font-size:.76rem;font-weight:600;padding:4px 10px;border-radius:999px;background:#fdf6e3;color:var(--revision);white-space:nowrap;}' +
  '.dash-due-badge-over{background:#fbeceb;color:var(--danger);}' +
  // "อัปเดตล่าสุด" (ใหม่ทั้งหมด 2026-09-24 รอบ 2) — reuse .dash-section/.dash-section-head เดิม แถวย่อยคลิกได้
  '.dash-recent-row{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:8px 0;border-top:1px solid var(--border);text-decoration:none;color:inherit;flex-wrap:wrap;}' +
  '.dash-recent-row:first-child{border-top:none;padding-top:0;}' +
  '.dash-recent-main{display:flex;flex-direction:column;min-width:0;gap:2px;}' +
  '.dash-recent-tracking{font-size:.76rem;color:var(--muted);font-variant-numeric:tabular-nums;}' +
  '.dash-recent-owner{font-size:.86rem;color:var(--navy);font-weight:700;}' +
  '.dash-recent-move{font-size:.8rem;color:var(--text);}' +
  '.dash-recent-side{display:flex;flex-direction:column;align-items:flex-end;gap:2px;flex-shrink:0;}' +
  '.dash-recent-org{font-size:.76rem;color:var(--teal);font-weight:600;}' +
  '.dash-recent-date{font-size:.72rem;color:var(--muted);}' +
  '@media (max-width:640px){.kpi-grid-4{grid-template-columns:repeat(2,1fr);}.dash-row-2-1{grid-template-columns:1fr;}' +
  '.dash-follow-row,.dash-recent-row{flex-direction:column;align-items:flex-start;}' +
  '.dash-follow-side{align-items:flex-start;flex-direction:row;gap:8px;}.dash-recent-side{align-items:flex-start;}' +
  '.dash-filter-form{flex-wrap:wrap;}.dash-filter-form .btn-primary{width:100%;}}';

var PUBLIC_CSS_ = '' +
  '.public-body{padding-bottom:24px;}' +
  // จำกัดความกว้างเฉพาะโซนสาธารณะ (800px, ไม่ใช่ 80vw ของ .content ส่วนกลางที่เผื่อไว้สำหรับตารางฝั่งเจ้าหน้าที่)
  // มือถือ (viewport < 800px) ได้ความกว้างเต็มจออัตโนมัติ, เดสก์ท็อปเห็นเนื้อหาไม่ยืดกว้างจนอ่านยาก
  '.public-body .content{width:100%;max-width:860px;padding-left:16px;padding-right:16px;box-sizing:border-box;}' +
  '@media (min-width:768px){.public-body .content{padding-left:24px;padding-right:24px;}}' +
  // Single Compact Summary Layout (2026-09-24 redesign รอบ compact ตามที่ผู้ใช้ขอ): container เดียว จำกัด
  // max-width แคบกว่า .content ทั่วไป (760px) จัดกึ่งกลาง — ใช้กับทั้งหน้าสาธารณะ (ซ้อนกับ .public-body .content
  // 860px เดิม ทำให้แคบลงอีก) และหน้า staff (?page=detail ซึ่งปกติอยู่ใน .content กว้าง 80vw/1600px — นี่คือจุด
  // แก้ปัญหาจริงที่ผู้ใช้แจ้ง "content ไปกองด้านขวา พื้นที่ซ้ายว่างมาก" เพราะเดิมไม่มี wrapper จำกัดความกว้างเลย)
  '.pub-compact{max-width:760px;margin:0 auto;}' +
  '.pub-subheader{font-size:.82rem;color:var(--muted);margin:0 2px 14px;}' +
  // บล็อกชื่อเจ้าของผลงาน+ชื่อผลงาน — "Summary Top Bar" กระชับ (2026-09-24 ลด margin/ปรับขนาดตัวอักษรตาม
  // spec typography ข้อ 12) ลำดับหัวหน้า: ชื่อเจ้าของผลงานเด่นสุด -> เลขทะเบียน (รอง, muted) -> ชื่อผลงาน
  '.pub-name-block{margin:0 2px 10px;}' +
  '.pub-name-owner{font-weight:700;font-size:1.2rem;color:var(--navy);line-height:1.25;word-wrap:break-word;}' +
  '.pub-name-tracking{font-size:.8rem;font-weight:500;color:var(--muted);margin-top:2px;}' +
  '.pub-name-title{font-size:.82rem;font-weight:500;color:var(--text);margin-top:3px;line-height:1.35;word-wrap:break-word;}' +
  // 2026-10-08 "วันที่รับผลงาน" ใต้ชื่อผลงาน เฉพาะหน้า Owner Dashboard — ตัวรองเหมือน .pub-name-tracking
  // (เล็ก/สีเทา) ไม่ให้เด่นกว่าการ์ด "สถานะปัจจุบัน" ที่อยู่ถัดไป ตามที่ผู้ใช้ขอ
  '.pub-name-received{font-size:.8rem;font-weight:500;color:var(--muted);margin-top:3px;}' +
  // "Compact Status Card" — hero เตี้ยลง (2026-09-24) ตัดบรรทัด "ขณะนี้ผลงานอยู่ขั้นตอนนี้" ออก (ซ้ำความหมายกับ
  // label "สถานะปัจจุบัน" ด้านบนอยู่แล้ว) เหลือ label/ค่าเด่น/คำอธิบายย่อย/อัปเดตล่าสุด ตามตัวอย่างข้อ 5 พอดี
  '.pub-hero{border-radius:14px;padding:14px 16px 12px;margin-bottom:10px;border:1px solid var(--border);background:var(--bg);}' +
  '.pub-hero-pending{background:#f2f4f6;border-color:#e1e6ea;}' +
  '.pub-hero-active{background:#eaf6f6;border-color:#cdeaea;}' +
  '.pub-hero-revision{background:#fdf6e3;border-color:#f0e0ab;}' +
  '.pub-hero-danger{background:#fbeceb;border-color:#f0cbc8;}' +
  '.pub-hero-done{background:#eaf7ee;border-color:#c9e8d1;}' +
  '.pub-hero-label{font-size:.72rem;color:var(--muted);margin-bottom:3px;}' +
  '.pub-hero-main{font-size:1.55rem;font-weight:700;color:var(--navy);line-height:1.25;}' +
  '.pub-hero-desc{font-size:.82rem;color:var(--muted);margin-top:3px;line-height:1.4;}' +
  '.pub-hero-updated{font-size:.72rem;color:var(--muted);margin-top:6px;}' +
  // สถานะหลัก/สถานะย่อย (2026-09-24 ตามที่ผู้ใช้ขอ) — state ทศนิยมที่มี parent จริง (เช่น 7.1/7.2/7.3/7.4 ของ
  // state 7) แยกแสดง "ขั้นตอนที่ N" (label เล็ก) + ชื่อสถานะหลัก (ใน .pub-hero-main เดิม เด่นสุด) แล้วตามด้วย
  // "ผลการพิจารณา" + badge สถานะย่อยสีตามคำในชื่อจริง (ผ่าน=เขียว/แก้ไข=เหลือง/ไม่ผ่าน=แดง)
  '.pub-hero-step-label{font-size:.72rem;color:var(--muted);margin-bottom:2px;}' +
  '.pub-hero-sub-row{display:flex;align-items:center;gap:8px;margin-top:8px;flex-wrap:wrap;}' +
  '.pub-hero-sub-label{font-size:.72rem;color:var(--muted);}' +
  '.pub-hero-sub-badge{display:inline-block;font-size:.86rem;font-weight:700;padding:3px 10px;border-radius:999px;}' +
  '.pub-hero-sub-done{background:#d9f0e1;color:#166534;}' +
  '.pub-hero-sub-revision{background:#fbecc0;color:#8a6300;}' +
  '.pub-hero-sub-danger{background:#f6d4d1;color:#9a2d24;}' +
  '.pub-hero-sub-pending{background:#e3e8eb;color:var(--muted);}' +
  // การ์ดสถานะปัจจุบัน รอบ 2 (2026-09-24) — เพิ่มแถว "ผู้รับผิดชอบ" และ "ขั้นตอนถัดไป" (label/value ชิดกันแนวนอน)
  '.pub-hero-meta-row,.pub-hero-next-row{display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-top:6px;flex-wrap:wrap;}' +
  '.pub-hero-meta-label,.pub-hero-next-label{font-size:.72rem;color:var(--muted);flex-shrink:0;}' +
  '.pub-hero-meta-value{font-size:.82rem;font-weight:600;color:var(--text);text-align:right;}' +
  '.pub-hero-next-value{font-size:.82rem;font-weight:600;color:var(--muted);text-align:right;}' +
  '.pub-hero-next-row{padding-top:6px;border-top:1px dashed var(--border);}' +
  // บรรทัด "ผู้รับผิดชอบ :: ค่า" แบบบรรทัดเดียว (Owner Dashboard friendlyMode เท่านั้น, 2026-10-07)
  '.pub-hero-meta-inline{display:block;font-size:.82rem;color:var(--muted);}' +
  '.pub-hero-meta-value-inline{font-weight:700;color:var(--navy);}' +
  // กล่อง "สิ่งที่ต้องดำเนินการ" — เด่นรองจากสถานะ พื้นสีอ่อนโทนเดียวกับ revision กันความสับสน
  '.pub-action-box{background:#fff8ec;border:1px solid #f0e0ab;border-radius:12px;padding:10px 14px;margin-bottom:10px;}' +
  '.pub-action-title{font-weight:700;color:var(--revision);font-size:.78rem;margin:0 0 4px;}' +
  '.pub-action-box p{margin:0;font-size:.84rem;line-height:1.5;color:var(--text);}' +
  // Timeline ละเอียด — เส้นบาง ไอคอนเล็ก สีนุ่ม ✓ ผ่านแล้ว/● ปัจจุบัน (เด่น)/○ ยังไม่ถึง (จาง)
  // Summary Card "ความคืบหน้าของผลงาน" (Metro Progress) เหนือ Timeline — ผ่านแล้ว/ปัจจุบัน/เหลือ (2026-09-24
  // ปรับ compact รอบ 2: padding/margin ลดลง, bar เตี้ยลง — logic/ข้อความเดิมไม่เปลี่ยน)
  '.pub-progress-card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:10px 14px;margin-bottom:10px;}' +
  '.pub-progress-title{font-weight:700;color:var(--navy);font-size:.76rem;margin:0 0 6px;}' +
  '.pub-progress-row{display:flex;flex-wrap:wrap;gap:6px 14px;}' +
  '.pub-progress-item{font-size:.8rem;font-weight:600;white-space:nowrap;}' +
  '.pub-progress-done{color:var(--done);}' +
  '.pub-progress-current{color:var(--navy);}' +
  '.pub-progress-remaining{color:var(--muted);font-weight:400;}' +
  '.pub-progress-finished{color:var(--done);font-weight:700;font-size:.84rem;margin-top:4px;}' +
  '.pub-progress-bar{background:var(--bg);border-radius:999px;height:6px;margin-top:8px;overflow:hidden;}' +
  '.pub-progress-bar-fill{background:var(--done);height:100%;border-radius:999px;}' +
  '.pub-progress-bar-label{font-size:.7rem;color:var(--muted);margin-top:4px;}' +
  '.pub-timeline{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:18px 20px 6px;margin-bottom:16px;}' +
  '.pub-tl-item{display:flex;align-items:flex-start;gap:12px;padding-bottom:16px;position:relative;}' +
  '.pub-tl-item::before{content:"";position:absolute;left:10px;top:22px;bottom:0;width:1px;background:var(--border);}' +
  '.pub-tl-item:last-child::before{display:none;}' +
  '.pub-tl-icon{flex-shrink:0;width:21px;height:21px;border-radius:50%;display:flex;align-items:center;justify-content:center;' +
  'font-size:.72rem;font-weight:700;background:#fff;border:1.5px solid var(--border);color:var(--muted);z-index:1;margin-top:1px;}' +
  '.pub-tl-text{font-size:.86rem;color:var(--muted);line-height:1.5;padding-top:1px;}' +
  '.pub-tl-meta{display:block;font-size:.74rem;color:var(--muted);opacity:.85;margin-top:1px;}' +
  '.pub-tl-current .pub-tl-meta{color:var(--navy);opacity:1;}' +
  '.pub-tl-done .pub-tl-icon{background:var(--done);border-color:var(--done);color:#fff;}' +
  '.pub-tl-done .pub-tl-text{color:var(--text);}' +
  '.pub-tl-done.pub-tl-item::before{background:var(--done);}' +
  '.pub-tl-current .pub-tl-icon{background:var(--navy);border-color:var(--navy);color:#fff;width:24px;height:24px;font-size:.78rem;margin-top:-1px;}' +
  '.pub-tl-current .pub-tl-text{color:var(--navy);font-weight:700;}' +
  '.pub-tl-badge{display:inline-block;margin-left:6px;font-size:.66rem;font-weight:700;color:#fff;background:var(--navy);padding:2px 8px;border-radius:999px;vertical-align:middle;}' +
  '.pub-tl-badge-last{background:var(--done);}' +
  // ขั้นตอนอนาคต (upcoming) — "รอดำเนินการ" สีเทา ไม่มีผู้รับผิดชอบ/วันที่ (ข้อ 9 ห้ามแสดงข้อมูลปลอม)
  '.pub-tl-meta-pending{color:var(--muted);font-style:italic;}' +
  // "└ ผลการพิจารณา: 7.1 ผ่าน" ซ้อนใต้ขั้นตอนหลักปัจจุบัน (2026-09-24) — reuse .pub-hero-sub-* tone เดิม
  '.pub-tl-sub-row{display:block;margin-top:4px;font-size:.8rem;color:var(--muted);}' +
  '.pub-tl-sub-label{color:var(--muted);}' +
  '.pub-tl-sub-badge{display:inline-block;font-weight:700;padding:2px 8px;border-radius:999px;font-size:.78rem;margin-left:2px;}' +
  // ปุ่ม "ดู Timeline ทั้งหมด 10 ขั้นตอน" — <details open> ค่าเริ่มต้นเปิดแสดงครบ (ข้อ 11: Desktop ต้องเห็น
  // ครบ 10 ขั้นตอน) พับเก็บได้เองทั้ง desktop/mobile ด้วย <summary> มาตรฐานไม่มี JS (ข้อ 12/13)
  '.pub-tl-full-details{margin-bottom:10px;margin-top:10px;}' +
  '.pub-tl-full-details summary{cursor:pointer;font-size:.78rem;font-weight:600;color:var(--teal);list-style:none;padding:2px 0;text-align:center;}' +
  '.pub-tl-full-details summary::-webkit-details-marker{display:none;}' +
  '.pub-tl-full-details[open] summary{margin-bottom:6px;}' +
  '.pub-tl-full-details .pub-timeline{margin-bottom:0;}' +
  // การ์ดข้อมูลผลงาน + กล่องหมายเหตุ — พื้นหลังสีอ่อน (soft blue-gray) แยกจาก card สีขาวด้านบน (compact รอบ 2)
  '.pub-owner-card,.pub-note-box{background:var(--bg);border-radius:12px;padding:10px 14px;margin-bottom:10px;}' +
  '.pub-owner-title,.pub-note-title{font-weight:700;color:var(--navy);font-size:.78rem;margin:0 0 6px;}' +
  '.pub-owner-row{display:flex;justify-content:space-between;gap:12px;padding:5px 0;border-top:1px solid var(--border);font-size:.82rem;}' +
  '.pub-owner-row:first-of-type{border-top:none;padding-top:0;}' +
  '.pub-owner-label{color:var(--muted);flex-shrink:0;}' +
  '.pub-owner-value{font-weight:600;color:var(--text);text-align:right;}' +
  '.pub-note-box p{margin:0;font-size:.84rem;line-height:1.5;color:var(--text);}' +
  '.pub-back-link{text-align:center;margin-top:2px;min-height:36px;display:flex;align-items:center;justify-content:center;}' +
  '.pub-back-link a{color:var(--muted);font-size:.8rem;}' +
  // "ข้อมูลสำคัญ" — Mini Important Info Grid 2x2 (2026-09-24) เสมอ 2 คอลัมน์ทั้ง desktop/mobile ผ่าน
  // .pub-info-grid-4 (specificity สูงกว่า ชนะ media query 1-คอลัมน์เดิมของ .pub-date-grid เปล่าๆ เสมอ)
  '.pub-date-section-title{font-weight:700;color:var(--navy);font-size:.78rem;margin:0 0 6px;}' +
  '.pub-date-grid{display:grid;grid-template-columns:1fr;gap:8px;margin-bottom:10px;}' +
  '@media (min-width:600px){.pub-date-grid{grid-template-columns:1fr 1fr;}}' +
  '.pub-date-grid.pub-info-grid-4{grid-template-columns:1fr 1fr;gap:8px;}' +
  '.pub-date-card{background:var(--bg);border-radius:10px;padding:8px 10px;}' +
  '.pub-date-label{font-size:.7rem;color:var(--muted);margin-bottom:2px;}' +
  '.pub-date-value{font-weight:700;color:var(--text);font-size:.84rem;line-height:1.3;word-wrap:break-word;}' +
  // กล่องแจ้งข้อมูลย่อยๆ (เช่น ข้อมูล Legacy) — เล็ก ไม่แย่งความเด่นจากสถานะปัจจุบัน
  '.pub-info-box{background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:8px 12px;margin-bottom:10px;' +
  'font-size:.76rem;color:var(--muted);line-height:1.4;display:flex;gap:6px;align-items:flex-start;}' +
  '.pub-info-box b{color:var(--navy);flex-shrink:0;}' +
  // section แบบพับ/กางได้ (ข้อมูลภายใน, ประวัติละเอียด) — ใช้ <details> มาตรฐาน รองรับ keyboard/focus โดยธรรมชาติ
  '.pub-details{margin-bottom:10px;border:1px solid var(--border);border-radius:12px;padding:0 14px;background:var(--card);}' +
  '.pub-details summary{cursor:pointer;font-weight:600;color:var(--navy);font-size:.82rem;padding:10px 0;list-style:none;min-height:36px;display:flex;align-items:center;}' +
  '.pub-details summary::-webkit-details-marker{display:none;}' +
  '.pub-details summary::before{content:"▸";margin-right:8px;transition:transform .15s;display:inline-block;}' +
  '.pub-details[open] summary::before{transform:rotate(90deg);}' +
  '.pub-details summary:focus-visible{outline:2px solid var(--teal);outline-offset:2px;}' +
  '.pub-details-body{padding-bottom:10px;}' +
  '.pub-audit-item{padding:10px 0;border-top:1px solid var(--border);font-size:.83rem;}' +
  '.pub-audit-item:first-child{border-top:none;}' +
  '.pub-audit-head{display:flex;justify-content:space-between;gap:10px;font-weight:600;color:var(--text);}' +
  '.pub-audit-date{color:var(--muted);font-weight:400;font-size:.78rem;white-space:nowrap;}' +
  '.pub-audit-meta{color:var(--muted);font-size:.78rem;margin-top:2px;}' +
  '.pub-audit-note{color:var(--text);font-size:.82rem;margin-top:4px;line-height:1.5;}' +
  // ปุ่ม outline — เบากว่า btn-action/btn-primary ปกติ ใช้กับ action รอง เช่น "พิมพ์ QR ใหม่" ไม่ให้แย่งความเด่น
  '.btn-outline{display:inline-block;padding:11px 18px;border:1.5px solid var(--border);border-radius:10px;color:var(--muted);' +
  'font-size:.85rem;font-weight:600;text-decoration:none;text-align:center;min-height:44px;box-sizing:border-box;line-height:1.6;}' +
  '.btn-outline:focus-visible{outline:2px solid var(--teal);outline-offset:2px;}' +
  '.revision-box{background:#fdf6e3;border:1px solid var(--revision);border-radius:14px;padding:16px 18px;margin-bottom:16px;}' +
  '.revision-title{color:var(--revision);font-weight:700;margin:0 0 6px;font-size:.82rem;}' +
  '.qr-scan-divider{display:flex;align-items:center;gap:10px;margin:14px 0;color:var(--muted);font-size:.8rem;}' +
  '.qr-scan-divider::before,.qr-scan-divider::after{content:"";flex:1;height:1px;background:var(--border);}' +
  // หน้าแรก Login เจ้าของผลงาน (2026-10-06) — ช่อง password แยกทีละตัว (5 ช่อง รูปแบบจริง NN-NNN มีขีดคั่น
  // กลาง ไม่ใช่ 6 ช่องเดา) ขนาดใหญ่พอแตะง่ายบนมือถือ (ข้อ 12)
  '.owner-login-card{text-align:center;}' +
  '.owner-pass-boxes{display:flex;justify-content:center;align-items:center;gap:7px;margin:8px 0 10px;flex-wrap:nowrap;}' +
  '.owner-pass-box{width:42px;height:52px;text-align:center;font-size:1.3rem;font-weight:700;border:1.5px solid var(--border);' +
  'border-radius:10px;color:var(--navy);box-sizing:border-box;padding:0;}' +
  '.owner-pass-box:focus{outline:none;border-color:var(--teal);box-shadow:0 0 0 2px rgba(14,124,134,.18);}' +
  '.owner-pass-sep{font-size:1.3rem;font-weight:700;color:var(--muted);}' +
  '.owner-pass-toggle-btn{background:none;border:none;color:var(--teal);font-size:.78rem;font-weight:600;' +
  'cursor:pointer;padding:4px 0;text-decoration:underline;}' +
  '@media (max-width:360px){.owner-pass-box{width:36px;height:46px;font-size:1.1rem;}}' +
  // 2026-10-12 รอบ 17 — หน้า "กำลังโหลดข้อมูล..." ระหว่างทางหลัง login สำเร็จ (renderOwnerLoginBounceBody_)
  // แทนหน้า "เข้าสู่ระบบสำเร็จ"/ปุ่ม "ไปที่หน้าผลงานของฉัน" เดิม — spinner หมุนเรียบง่าย
  // 2026-10-12 รอบ 18 — ผู้ใช้แจ้งว่าซ่อนปุ่มไว้ก่อน (fade-in หลัง 1.2s ของรอบ 17) ใช้งานยาก ขอปุ่มกดได้ทันที
  // เหมือนเดิม — .owner-bounce-link จึงโชว์เด่นชัดตั้งแต่แรก (ตัด opacity:0/pointer-events:none ออก) .owner-
  // bounce-link-visible เหลือไว้เฉยๆ ไม่ได้ลบ (ไม่มี markup เรียกใช้แล้ว)
  '.owner-bounce-loading{text-align:center;padding:32px 20px;}' +
  '.owner-bounce-spinner{width:32px;height:32px;margin:0 auto 14px;border:3px solid var(--border);' +
  'border-top-color:var(--teal);border-radius:50%;animation:ownerBounceSpin .7s linear infinite;}' +
  '@keyframes ownerBounceSpin{to{transform:rotate(360deg);}}' +
  '.owner-bounce-text{color:var(--muted);font-size:.88rem;margin-bottom:10px;}' +
  '.owner-bounce-link{margin-top:4px;}' +
  '.owner-bounce-link-visible{opacity:1;pointer-events:auto;}' +
  // Timeline "เส้นทางจริง" (Branching Workflow) เฉพาะหน้า Owner Dashboard, 2026-10-07 — ข้อความอธิบายผล
  // การพิจารณา/branch indicator ใต้รายการ Timeline แต่ละขั้น ใช้โทนสีเดิม (muted/navy) ไม่เพิ่มสีใหม่
  '.owner-tl-note{display:block;font-size:.78rem;color:var(--muted);margin-top:3px;line-height:1.5;}' +
  '.owner-tl-branch{margin-top:4px;}' +
  '.owner-tl-branch-row{font-size:.78rem;color:var(--muted);line-height:1.6;}' +
  '.owner-tl-branch-row b{color:var(--navy);}' +
  // redesign Owner Dashboard รอบ 2026-10-07 — ข้อความอธิบายสถานะ (public_hint) ใต้ชื่อสถานะหลักในกรอบสถานะ
  // ปัจจุบัน (ข้อ 4)
  '.pub-hero-hint{font-size:.8rem;color:var(--muted);margin-top:4px;line-height:1.45;}' +
  // การ์ดสรุป "ตอนนี้ / ถัดไป" compact 2 การ์ด มือถือเรียงบน-ล่าง เดสก์ท็อป 2 คอลัมน์ (ข้อ 5)
  '.owner-nownext-grid{display:flex;flex-direction:column;gap:10px;margin:14px 0;}' +
  '.owner-nownext-card{background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:12px 14px;}' +
  '.owner-nownext-label{font-size:.72rem;color:var(--muted);margin-bottom:3px;}' +
  '.owner-nownext-value{font-size:.95rem;font-weight:700;color:var(--navy);line-height:1.3;}' +
  '.owner-nownext-next{background:#eaf6f6;border-color:#cdeaea;}' +
  '@media (min-width:600px){.owner-nownext-grid{flex-direction:row;}.owner-nownext-card{flex:1;}}' +
  // Timeline ภาษาคน (ข้อ 6/7/10/12/13) — แทนที่ "ขั้นตอนที่ N" ด้วยป้ายตำแหน่งสัมพัทธ์ + ชื่อสถานีเด่นขึ้น +
  // "ผู้รับผิดชอบ :: ค่า" รูปแบบเดียวกับกรอบสถานะปัจจุบัน
  '.owner-tl-position-label{font-size:.7rem;color:var(--muted);}' +
  '.owner-tl-station-name{font-size:.92rem;font-weight:600;color:var(--text);margin-top:1px;line-height:1.35;}' +
  '.pub-tl-current .owner-tl-station-name{color:var(--navy);}' +
  '.owner-tl-resp{font-size:.76rem;color:var(--muted);margin-top:4px;}' +
  '.owner-tl-resp b{color:var(--navy);}' +
  '.owner-tl-summary-sub{display:block;font-size:.72rem;font-weight:400;color:var(--muted);margin-top:2px;}' +
  // 2026-10-08 — redesign หน้า Staff "อัปเดตสถานะเอกสาร" (?page=scan หลังสแกน/เลือกงาน) เป็น Workflow
  // Checklist ตามที่ผู้ใช้ขอ: ผ่านแล้ว(เขียว,ปิด)/ปัจจุบัน(navy,ปิด)/กดได้(teal,เด่นสุด)/ยังไม่ถึง(เทา,ปิด)
  // ใช้ token สีเดิมทั้งหมด (--done/--navy/--teal/--pending) ไม่เพิ่มสีใหม่
  '.wf-section-title{font-size:.95rem;font-weight:700;color:var(--navy);margin:18px 0 2px;}' +
  '.wf-section-hint{font-size:.78rem;color:var(--muted);margin-bottom:10px;}' +
  '.wf-checklist{display:flex;flex-direction:column;gap:7px;}' +
  '.wf-step{display:flex;align-items:flex-start;gap:10px;padding:11px 14px;border-radius:12px;border:1.5px solid var(--border);' +
  'background:var(--card);min-height:48px;box-sizing:border-box;}' +
  '.wf-step-icon{flex-shrink:0;width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;' +
  'font-size:.78rem;font-weight:700;margin-top:1px;}' +
  '.wf-step-label{font-size:.88rem;font-weight:600;line-height:1.4;}' +
  '.wf-step-done{border-color:#cfe8d8;background:#f1faf4;}' +
  '.wf-step-done .wf-step-icon{background:var(--done);color:#fff;}' +
  '.wf-step-done .wf-step-label{color:var(--muted);text-decoration:line-through;text-decoration-color:#bcdfc7;}' +
  '.wf-step-current{border-color:var(--navy);background:#eaf0f5;}' +
  '.wf-step-current .wf-step-icon{background:var(--navy);color:#fff;}' +
  '.wf-step-current .wf-step-label{color:var(--navy);}' +
  '.wf-step-badge{display:inline-block;margin-top:3px;font-size:.68rem;font-weight:700;color:#fff;background:var(--navy);' +
  'border-radius:6px;padding:1px 7px;}' +
  '.wf-step-locked{border-color:var(--border);background:#f7f9fa;opacity:.7;}' +
  '.wf-step-locked .wf-step-icon{background:#dde3e8;color:var(--muted);}' +
  '.wf-step-locked .wf-step-label{color:var(--muted);}' +
  '.wf-step-locked-resp{display:block;font-size:.72rem;color:var(--muted);margin-top:2px;}' +
  '.wf-step-actionable{display:flex;flex-direction:column;align-items:flex-start;width:100%;gap:2px;padding:13px 14px;' +
  'border-radius:12px;border:none;background:var(--teal);color:#fff;cursor:pointer;font-family:inherit;min-height:48px;' +
  'box-sizing:border-box;text-align:left;}' +
  '.wf-step-actionable:focus-visible{outline:2px solid var(--navy);outline-offset:2px;}' +
  '.wf-step-actionable .wf-step-actionable-label{font-size:.92rem;font-weight:700;}' +
  '.wf-step-actionable .wf-step-actionable-hint{font-size:.72rem;font-weight:400;opacity:.9;}' +
  '.wf-confirm{display:none;margin-top:8px;padding:14px;border-radius:12px;border:1.5px solid var(--teal);background:#eaf6f6;}' +
  '.wf-confirm-title{font-size:.85rem;font-weight:700;color:var(--navy);margin-bottom:6px;}' +
  '.wf-confirm-from,.wf-confirm-to{font-size:.85rem;color:var(--text);line-height:1.6;}' +
  '.wf-confirm-actions{display:flex;flex-direction:column;gap:8px;margin-top:10px;}' +
  '.wf-more-actions{margin-top:16px;border:1.5px solid var(--border);border-radius:12px;padding:0 14px;background:var(--card);}' +
  '.wf-more-actions summary{padding:13px 0;font-size:.85rem;font-weight:600;color:var(--muted);cursor:pointer;list-style:none;' +
  'display:flex;justify-content:space-between;align-items:center;}' +
  '.wf-more-actions summary::-webkit-details-marker{display:none;}' +
  '.wf-more-actions summary::after{content:"▾";font-size:.75rem;transition:transform .15s;}' +
  '.wf-more-actions[open] summary::after{transform:rotate(180deg);}' +
  '.wf-more-actions .action-list{padding-bottom:12px;}' +
  '@media (min-width:600px){.pub-compact{max-width:860px;}}' +
  // 2026-10-08 — redesign หน้า "ผลการติดตามสถานะ" (Owner Dashboard) ตาม mockup ที่ผู้ใช้ขอ สโคปเฉพาะ class
  // ใหม่ทั้งหมด (owner-*) ไม่แตะ .pub-*/.wf-* เดิมที่หน้าอื่นใช้ร่วมกันเลย (Admin/Staff/Search/Login ไม่กระทบ)
  // 2026-10-08 รอบ 2 — ปรับตาม mockup รูปจริงที่ผู้ใช้ส่งมา (เดิมมีแค่ข้อความ spec ไม่มีรูป): header มีปุ่มขวาบน,
  // การ์ดสรุปมี icon วงกลม, การ์ดผลการพิจารณา/ขั้นตอนถัดไปจัด layout icon+หัวข้อแนวนอน, Timeline แสดงครบ 1-10
  // เสมอ (ขั้นที่ข้ามจริงแสดงจางๆ + ป้าย "(ถ้ามี)" แทนการซ่อนไปเลย) — ตัดปุ่ม "แก้ไข"/ไอคอนแชร์ลอยมุมล่างออก
  // ตามที่ยืนยันกับผู้ใช้แล้ว (ขัดกับสถาปัตยกรรม Owner Dashboard ที่เป็น Read-Only ล้วน)
  '.owner-page-wrap{max-width:860px;}' +
  '@media (min-width:1100px){.owner-page-wrap.pub-compact{max-width:1200px;}}' +
  '.owner-page-header{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;' +
  'background:linear-gradient(135deg,#f4f9fa,#eef4f6);border:1px solid var(--border);border-radius:16px;' +
  'padding:16px 18px;margin-bottom:16px;}' +
  '.owner-back-link{flex-shrink:0;display:inline-flex;align-items:center;gap:4px;color:var(--navy);font-size:.78rem;' +
  'font-weight:600;text-decoration:none;border:1px solid var(--border);border-radius:999px;padding:7px 14px;' +
  'background:#fff;white-space:nowrap;}' +
  // 2026-10-12 ตามที่ผู้ใช้ขอ — ปุ่ม "✕ ปิด" แทน "← กลับหน้าหลัก" (.owner-back-link เดิมเหลือไว้เฉยๆ ไม่ได้ลบ
  // ไม่มีที่ไหนเรียกใช้แล้ว) สี danger token เดิมของระบบ (var(--danger)=#b23a3a) border-radius 999px เท่าเดิม
  // ขนาด compact กว่าเดิมเล็กน้อย กดง่ายบนมือถือ (padding แนวตั้งพอดี ไม่เล็กเกิน touch target)
  '.owner-close-btn{flex-shrink:0;display:inline-flex;align-items:center;gap:4px;color:#fff;font-size:.78rem;' +
  'font-weight:700;text-decoration:none;border:none;border-radius:999px;padding:8px 16px;' +
  'background:var(--danger);white-space:nowrap;}' +
  '.owner-close-btn:hover{background:#9c2f2f;}' +
  '.owner-page-title{font-size:1.3rem;font-weight:700;color:var(--navy);line-height:1.3;}' +
  '.owner-page-subtitle{font-size:.82rem;color:var(--muted);margin-top:3px;}' +
  '@media (max-width:480px){.owner-page-header{flex-direction:column;}}' +
  '.owner-summary-card{background:var(--card);border:1px solid var(--border);border-radius:16px;padding:16px 18px;' +
  'margin-bottom:16px;box-shadow:0 1px 3px rgba(31,59,84,.05);}' +
  '.owner-summary-grid{display:flex;flex-direction:column;gap:16px;}' +
  '.owner-summary-item{display:flex;align-items:center;gap:10px;}' +
  '.owner-summary-icon{flex-shrink:0;width:38px;height:38px;border-radius:10px;background:var(--bg);' +
  'display:flex;align-items:center;justify-content:center;font-size:1.05rem;}' +
  '.owner-summary-label{font-size:.72rem;color:var(--muted);margin-bottom:2px;}' +
  '.owner-summary-value{font-size:.95rem;font-weight:700;color:var(--navy);word-wrap:break-word;}' +
  '@media (min-width:640px){.owner-summary-grid{flex-direction:row;}.owner-summary-item{flex:1;' +
  'padding-right:14px;border-right:1px solid var(--border);}.owner-summary-item:last-child{border-right:none;}}' +
  '.owner-split-grid{display:flex;flex-direction:column;gap:16px;margin-bottom:16px;}' +
  // 2026-10-08 รอบ 4 — สัดส่วน 70/30 (ผลการพิจารณา/ขั้นตอนถัดไป) บน desktop/tablet ตามที่ผู้ใช้ขอ มือถือยัง
  // เรียงแนวตั้งเหมือนเดิม (ผลการพิจารณาก่อน ขั้นตอนถัดไปตามหลัง — ลำดับ markup เดิมอยู่แล้ว ไม่ต้องแก้ HTML)
  '@media (min-width:900px){.owner-split-grid{flex-direction:row;align-items:stretch;}' +
  '.owner-split-grid>div:first-child{flex:0 0 70%;max-width:70%;}' +
  '.owner-split-grid>div:last-child{flex:0 0 calc(30% - 16px);max-width:calc(30% - 16px);}}' +
  // 2026-10-08 รอบ 6 — เพิ่ม margin-bottom ตรงนี้เอง (เดิมพึ่ง .owner-split-grid{margin-bottom:16px} ที่ครอบอยู่
  // ตอนมี 2 การ์ด ตอนนี้การ์ดนี้เต็มความกว้างเดี่ยวๆ ไม่มี wrapper ครอบแล้ว ต้องมีระยะห่างของตัวเองกับ Timeline ด้านล่าง)
  '.owner-result-card{background:#eef9f0;border:1px solid #cfe8d8;border-radius:16px;padding:18px;' +
  'margin-bottom:16px;box-shadow:0 1px 3px rgba(31,59,84,.05);}' +
  '.owner-result-title{font-size:.8rem;font-weight:700;color:var(--navy);margin-bottom:10px;}' +
  // 2026-10-08 รอบ 13 — ผู้ใช้ขอ redesign ให้เรียบ/compact ขึ้น: "ขั้นตอนปัจจุบัน :: ข้อความ" บรรทัดเดียว
  // (ไม่มี "ขั้นตอนที่ N" ตัวใหญ่/badge แยกบรรทัดแบบรอบ 12 แล้ว) .owner-result-current-label (label "::") เป็น
  // <span> inline ใช้ rule เดิมที่มีอยู่แล้วได้ตรงๆ (font-size/color เข้ากัน ไม่ต้องเพิ่ม rule ใหม่)
  '.owner-result-current-label{font-size:.72rem;color:var(--muted);margin-bottom:2px;font-weight:600;}' +
  '.owner-result-current-line{font-size:.92rem;color:var(--text);line-height:1.5;}' +
  // 2026-10-12 รอบ 15 — วันที่ "อัปเดตล่าสุด" (updated_at เดิม) ย้ายมาไว้ใต้บรรทัด "ขั้นตอนปัจจุบัน" เป็นบรรทัด
  // เล็กสีเทา "อัปเดตเมื่อ ..." ตามที่ผู้ใช้ขอ (ข้อ 3) ไม่ให้แย่งความเด่นจากสถานะหลัก
  '.owner-result-updated{font-size:.74rem;color:var(--muted);margin-top:3px;}' +
  '.owner-result-updated-label{font-weight:600;}' +
  // บรรทัดผลการพิจารณา (ถ้ามี) — เด่นกว่าปกติเล็กน้อยด้วยสี tone + น้ำหนักตัวหนา ไม่มี card ซ้อน/ไอคอนวงกลมแล้ว
  // 2026-10-28 ตามข้อกำหนดล่าสุด — เพิ่ม background/border ให้เป็น "result block" ตามที่ผู้ใช้ระบุ (เดิมมีแค่สี
  // ข้อความ) ใช้ร่วมกับทั้ง tone เดิม (done/revision/danger — ผลการพิจารณาครั้งที่ 2) และ tone ใหม่ 4 แบบ
  // (pass/revision2/revision3/fail — ผลการพิจารณาครั้งที่ 1 ที่ Owner เห็น ห้ามมี code 7.1-7.4 โผล่ ดู
  // OWNER_RESULT_OUTCOME_, PublicTrack.gs)
  '.owner-result-outcome{font-size:1rem;font-weight:700;margin-top:6px;display:inline-block;padding:6px 14px;' +
  'border-radius:8px;border:1px solid transparent;}' +
  '.owner-result-outcome-done{background:#d9f0e1;border-color:var(--done);color:#166534;}' +
  '.owner-result-outcome-revision{background:#fbecc0;border-color:var(--revision);color:#8a6300;}' +
  '.owner-result-outcome-danger{background:#f6d4d1;border-color:var(--danger);color:#9a2d24;}' +
  '.owner-result-outcome-pass{background:#d9f0e1;border-color:var(--done);color:#166534;}' +
  '.owner-result-outcome-revision2{background:#fff6da;border-color:#e8c547;color:#8a6300;}' +
  '.owner-result-outcome-revision3{background:#f7dfa0;border-color:var(--revision);color:#6b4a00;}' +
  '.owner-result-outcome-fail{background:#f6d4d1;border-color:var(--danger);color:#9a2d24;}' +
  '.owner-result-outcome-icon{display:inline-block;}' +
  // 2026-10-21 ตามข้อแก้ไขผู้บริหาร — บรรทัด "ภายในวันที่ :: dd/mm/yyyy" รองจากบรรทัดผลการพิจารณา (เบากว่า
  // เล็กน้อย ไม่ชิง tone สีเดียวกับบรรทัดบน กันสับสนว่าเป็นอีก tone หนึ่ง)
  '.owner-result-outcome-duedate{font-size:.9rem;font-weight:600;color:var(--text);margin-top:2px;}' +
  // 2026-10-28 รอบ 17 — Badge ผลการพิจารณาของ Banner Owner (renderOwnerResultCard_, OwnerAuth.gs) เท่านั้น
  // (ไม่แตะ .owner-result-outcome เดิมของ Timeline Step 3) ขนาดกะทัดรัดแบบ pill ไม่เต็มความกว้าง ตามที่ผู้ใช้ขอ
  // ใช้ร่วมกับคลาสสี owner-result-outcome-* เดิม (background/border/color) — multi-class ไม่ใช่ sub-selector
  // จึงไม่กระทบ .owner-result-outcome เดิม — wrap ได้/ไม่ล้น container บนมือถือ (white-space ปกติ + max-width)
  '.owner-result-badge{display:inline-block;max-width:100%;box-sizing:border-box;white-space:normal;' +
  'font-size:.85rem;font-weight:600;padding:6px 14px;border-radius:999px;border:1px solid transparent;' +
  'margin-top:8px;}' +
  // 2026-10-08 รอบ 12 — คลาสเดิมของรอบก่อน (ตัวใหญ่ "ขั้นตอนที่ N"/badge/คำบรรยายยาว) เลิกใช้ในหน้านี้แล้ว ไม่ได้
  // ลบ rule ทิ้ง (เผื่อใช้ที่อื่นภายหลัง): .owner-result-current-main, .owner-result-current-desc,
  // .owner-result-sub-label, .owner-result-head, .owner-result-icon*, .owner-result-main, .owner-result-desc
  '.owner-result-current-main{font-size:1.15rem;font-weight:700;color:var(--navy);display:flex;' +
  'align-items:center;flex-wrap:wrap;gap:0;}' +
  '.owner-result-current-desc{font-size:.85rem;color:var(--text);margin-top:4px;line-height:1.5;}' +
  '.owner-result-sub-label{font-size:.72rem;color:var(--muted);margin-bottom:4px;}' +
  '.owner-result-head{display:flex;align-items:center;gap:12px;margin-bottom:6px;}' +
  '.owner-result-icon{flex-shrink:0;width:40px;height:40px;border-radius:50%;display:flex;align-items:center;' +
  'justify-content:center;font-size:1.15rem;color:#fff;}' +
  '.owner-result-icon-done{background:var(--done);}.owner-result-icon-danger{background:var(--danger);}' +
  '.owner-result-icon-revision{background:var(--revision);}.owner-result-icon-pending{background:var(--muted);}' +
  '.owner-result-main{font-size:1.1rem;font-weight:700;color:var(--navy);}' +
  '.owner-result-desc{font-size:.82rem;color:var(--text);line-height:1.55;margin-bottom:12px;}' +
  '.owner-result-divider{border-top:1px solid #cfe8d8;margin:12px 0;}' +
  '.owner-result-grid{display:flex;flex-direction:column;gap:10px;}' +
  '@media (min-width:560px){.owner-result-grid{flex-direction:row;}.owner-result-grid>div{flex:1;}}' +
  '.owner-result-row{display:flex;align-items:flex-start;gap:8px;}' +
  '.owner-result-row-icon{flex-shrink:0;width:26px;height:26px;border-radius:8px;background:#fff;' +
  'border:1px solid #cfe8d8;display:flex;align-items:center;justify-content:center;font-size:.78rem;}' +
  '.owner-result-row-label{font-size:.7rem;color:var(--muted);margin-bottom:2px;}' +
  '.owner-result-row-value{font-size:.85rem;color:var(--text);font-weight:600;line-height:1.4;}' +
  '.owner-next-card{background:#eaf4fb;border:1px solid #cfe3f3;border-radius:16px;padding:18px;' +
  'box-shadow:0 1px 3px rgba(31,59,84,.05);}' +
  '.owner-next-head{display:flex;align-items:center;gap:10px;margin-bottom:10px;}' +
  '.owner-next-icon{flex-shrink:0;width:34px;height:34px;border-radius:50%;background:var(--teal);color:#fff;' +
  'display:flex;align-items:center;justify-content:center;font-size:1rem;}' +
  '.owner-next-title{font-size:.85rem;font-weight:700;color:var(--navy);}' +
  '.owner-next-text{font-size:.92rem;font-weight:600;color:var(--text);line-height:1.5;margin-bottom:14px;}' +
  '.owner-next-noaction{display:inline-flex;align-items:center;gap:6px;color:var(--done);font-weight:700;' +
  'font-size:.8rem;background:#e3f6e8;border-radius:10px;padding:8px 12px;margin-bottom:8px;}' +
  '.owner-next-subtext{font-size:.78rem;color:var(--muted);line-height:1.6;}' +
  '.owner-next-empty{font-size:.88rem;color:var(--muted);}' +
  // 2026-10-08 — ตัดข้อความรอง (.owner-tl-section-sub) ออกแล้ว เพิ่ม margin-bottom ของหัวข้อเองแทน กันหัวข้อ
  // ติดกับ Timeline จนแน่นเกินไป (class .owner-tl-section-sub เหลือไว้เฉยๆ ไม่มี markup ใช้แล้ว)
  '.owner-tl-section-title{font-size:.95rem;font-weight:700;color:var(--navy);margin-bottom:10px;}' +
  '.owner-tl-section-sub{font-size:.78rem;color:var(--muted);margin-bottom:10px;}' +
  // 2026-10-08 รอบ 3 — ผู้ใช้ขอลบแถบ Timeline แนวนอน compact (.owner-tlc-*) ออกทั้งชุด (วงกลม/เส้นเชื่อม/
  // ข้อความใต้วงกลม/สี completed-current-future) เหลือแค่หัวข้อ + ปุ่ม "ดูรายละเอียดทั้ง 10 ขั้นตอน" ด้านล่าง
  // ปุ่ม "ดูรายละเอียดทั้ง 10 ขั้นตอน" / "ซ่อนรายละเอียด" สลับข้อความตามสถานะเปิด/ปิดด้วย CSS ล้วน (ไม่มี JS,
  // ไม่ reload หน้า — <details>/<summary> มาตรฐาน)
  '.owner-detail-toggle summary{cursor:pointer;font-size:.8rem;font-weight:600;color:var(--teal);list-style:none;' +
  'text-align:center;padding:6px 0;}' +
  '.owner-detail-toggle summary::-webkit-details-marker{display:none;}' +
  '.owner-detail-toggle .owner-toggle-open-text{display:none;}' +
  '.owner-detail-toggle[open] .owner-toggle-open-text{display:inline;}' +
  '.owner-detail-toggle[open] .owner-toggle-closed-text{display:none;}' +
  '.owner-detail-toggle[open] summary{margin-bottom:4px;}' +
  // งาน state ที่ "ข้าม" เพราะแตกสาย (8/9 ตอนผล 7 = ผ่าน) — เทาจาง + บอกเหตุผล แทน "รอดำเนินการ"
  // 2026-10-28 ตามข้อกำหนดล่าสุด — เพิ่ม opacity ~0.5 ให้ตัวแถวจางจริงตามที่ผู้ใช้ระบุ (ยังอ่านได้ ไม่ใช่ซ่อน)
  '.owner-tl-skip{opacity:.55;}' +
  '.owner-tl-skip .pub-tl-icon{background:#f1f2f4;border-color:var(--border);color:var(--muted);}' +
  '.owner-tl-skip .pub-tl-text{color:var(--muted);}' +
  '.owner-tl-skip-reason{display:block;font-size:.76rem;color:var(--muted);font-style:italic;margin-top:2px;}' +
  // 2026-10-08 รอบ 5 — Timeline แนวตั้งตามเส้นทางจริง กลับมาเป็น primary display อีกครั้ง (.pub-timeline/
  // .pub-tl-item เดิมที่หน้าสาธารณะใช้ร่วมกันอยู่แล้ว ไม่แก้ class ฐาน แค่ override gap/width ผ่าน wrapper
  // .owner-tl-wrap สโคปเฉพาะหน้านี้) desktop กว้าง 700-900px กึ่งกลางหน้าตามที่ผู้ใช้ขอ ไม่ยืดเต็ม 1200px เหมือน
  // ส่วนอื่นของหน้า
  '.owner-tl-wrap{max-width:900px;margin:0 auto;}' +
  '.owner-tl-wrap .pub-tl-item{padding-bottom:22px;}' +
  // 2026-10-08 รอบ 9 — ผู้ใช้ขอ shadow อ่อนให้การ์ด Timeline (ข้อ 8) สโคปเฉพาะหน้า Owner (.owner-tl-wrap) ไม่แก้
  // .pub-timeline ฐานที่หน้าสาธารณะ/เจ้าหน้าที่ใช้ร่วมกัน (กันกระทบหน้าอื่นที่ไม่ได้ขอ)
  '.owner-tl-wrap .pub-timeline{box-shadow:0 1px 3px rgba(31,59,84,.06);}' +
  // 2026-10-08 รอบ 10 — ยุบ/ขยายส่วน "เส้นทางการดำเนินงาน" ได้ (ข้อ 5: แถบ minimal ไม่ใช่ card ใหญ่, ข้อ 6:
  // transition สั้นๆ ตอนเปิด, ข้อ 8: focus state ชัดเจน) ปิดเป็นค่าเริ่มต้นเสมอ (ไม่มี [open] attribute ใน HTML)
  '.owner-tl-toggle{background:#fff;border:1px solid var(--border);border-radius:12px;margin-bottom:16px;overflow:hidden;}' +
  '.owner-tl-toggle-summary{cursor:pointer;padding:12px 14px;display:flex;align-items:center;justify-content:space-between;' +
  'gap:10px;list-style:none;}' +
  '.owner-tl-toggle-summary::-webkit-details-marker{display:none;}' +
  '.owner-tl-toggle-summary:focus-visible{outline:2px solid var(--teal);outline-offset:-2px;}' +
  '.owner-tl-toggle-text{display:flex;flex-direction:column;gap:2px;min-width:0;}' +
  '.owner-tl-toggle .owner-tl-section-title{margin-bottom:0;}' +
  '.owner-tl-toggle-sub{font-size:.78rem;color:var(--muted);}' +
  '.owner-tl-toggle-arrow{font-size:.7rem;color:var(--muted);flex-shrink:0;transition:transform .2s ease;}' +
  '.owner-tl-toggle[open] .owner-tl-toggle-arrow{transform:rotate(180deg);}' +
  '.owner-tl-toggle .owner-tl-wrap{padding:0 14px 14px;animation:ownerTlToggleFadeIn .2s ease;}' +
  '@keyframes ownerTlToggleFadeIn{from{opacity:0;transform:translateY(-4px);}to{opacity:1;transform:translateY(0);}}' +
  // 2026-11-03 — หน้า Staff "Workflow เดียว" ใหม่ ส่วน C (renderStaffWorkflowTable_) — แถว "ถูกข้าม" (skipped,
  // 8.x/9.x ตอนผล 7="ผ่าน/ไม่ผ่าน") ใช้โทนเทาจาง (ข้อ 5 "skipped = เทาอ่อน") reuse token เดิมเหมือน .wf-step-locked
  // (opacity .55 ตามแบบ .owner-tl-skip เดิม) ไม่เพิ่มสีใหม่
  '.wf-step-skip{border-color:var(--border);background:#f7f9fa;opacity:.55;}' +
  '.wf-step-skip .wf-step-icon{background:#dde3e8;color:var(--muted);}' +
  '.wf-step-skip .wf-step-label{color:var(--muted);}' +
  '.wf-step-skip-reason{display:block;font-size:.76rem;color:var(--muted);font-style:italic;}' +
  '.wtbl-row-date{font-size:.8rem;color:var(--text);margin-top:4px;line-height:1.5;}' +
  '.wtbl-row-detail{font-size:.82rem;color:var(--muted);margin-top:3px;}' +
  '.wtbl-row-actions{margin-top:8px;display:flex;flex-direction:column;gap:8px;align-items:flex-start;}' +
  // 2026-11-04 — หน้า Staff "Workflow Workspace" redesign ตาม requirement ใหม่ (ใกล้เคียงภาพอ้างอิง): header/
  // summary 4 กล่อง/ไดอะแกรมแนวนอน/progress card ข้างกัน/ตาราง <table> จริง/bottom action bar — คลาส "swf-"
  // ทั้งหมดสโคปเฉพาะหน้านี้เท่านั้น (ไม่กระทบ .wf-*/.pub-*/.owner-* เดิมที่หน้าสแกน QR/Owner Dashboard ใช้ร่วมกัน)
  // สีอ้างอิงตามที่ผู้ใช้ระบุตรงๆ (navy #1f3b54, success #1f8a4c = var(--done), bg #eef4f6 = var(--bg)) ไม่เพิ่ม
  // token สีใหม่นอกจากที่ระบุชัดเจน (เช่น current-row highlight #e8f2ff)
  '.swf-header{display:flex;align-items:center;justify-content:space-between;gap:10px;background:#fff;' +
  'border:1px solid var(--border);border-radius:14px;padding:12px 16px;margin-bottom:14px;}' +
  '.swf-header-title{display:flex;align-items:center;gap:8px;font-size:1.15rem;font-weight:700;color:var(--navy);}' +
  '.swf-header-icon{font-size:1.1rem;}' +
  '.swf-back-btn{flex-shrink:0;display:inline-flex;align-items:center;gap:4px;color:var(--navy);font-size:.8rem;' +
  'font-weight:600;text-decoration:none;border:1px solid var(--border);border-radius:999px;padding:7px 14px;' +
  'background:#fff;white-space:nowrap;}' +
  '@media (max-width:480px){.swf-header{flex-direction:column;align-items:flex-start;}' +
  '.swf-header-title{font-size:1.02rem;}}' +
  '.swf-summary-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:10px;}' +
  '@media (max-width:1024px){.swf-summary-grid{grid-template-columns:repeat(2,1fr);}}' +
  '@media (max-width:420px){.swf-summary-grid{grid-template-columns:1fr;}}' +
  '.swf-summary-box{display:flex;align-items:center;gap:10px;background:#f3f9fc;border:1px solid var(--border);' +
  'border-radius:12px;padding:12px 14px;min-height:58px;box-sizing:border-box;}' +
  '.swf-summary-icon{flex-shrink:0;font-size:1.2rem;}' +
  '.swf-summary-label{font-size:.72rem;color:var(--muted);margin-bottom:2px;}' +
  '.swf-summary-value{font-size:.9rem;font-weight:700;color:var(--navy);word-break:break-word;}' +
  '.swf-overview-row{display:flex;gap:16px;align-items:stretch;margin:16px 0;flex-wrap:wrap;}' +
  '.swf-overview-card{flex:1 1 560px;background:#fff;border:1px solid var(--border);border-radius:14px;' +
  'padding:16px;min-width:280px;box-sizing:border-box;}' +
  '.swf-overview-title{font-size:1rem;font-weight:700;color:var(--navy);margin-bottom:12px;}' +
  '.swf-diagram{display:flex;align-items:flex-start;overflow-x:auto;padding-bottom:6px;}' +
  '.swf-diagram-node{display:flex;flex-direction:column;align-items:center;flex-shrink:0;width:84px;text-align:center;}' +
  '.swf-diagram-circle{width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;' +
  'font-size:.78rem;font-weight:700;color:#fff;border:2px solid transparent;margin-bottom:4px;flex-shrink:0;}' +
  '.swf-diagram-circle-done{background:var(--done);border-color:var(--done);}' +
  '.swf-diagram-circle-current{background:var(--navy);border-color:var(--navy);box-shadow:0 0 0 4px rgba(31,59,84,.15);}' +
  '.swf-diagram-circle-pending{background:#fff;border-color:var(--pending);color:var(--pending);}' +
  '.swf-diagram-circle-skipped{background:#f1f2f4;border-color:var(--border);color:var(--muted);opacity:.5;}' +
  '.swf-diagram-label{font-size:.7rem;color:var(--text);font-weight:600;line-height:1.3;}' +
  '.swf-diagram-status{font-size:.64rem;color:var(--muted);margin-top:1px;}' +
  '.swf-diagram-connector{flex:0 0 26px;height:2px;background:var(--pending);margin-top:14px;align-self:flex-start;}' +
  '.swf-diagram-connector-done{background:var(--done);}' +
  '.swf-diagram-connector-skipped{background:transparent;border-top:2px dashed var(--border);height:0;opacity:.6;}' +
  '@media (max-width:768px){.swf-diagram{flex-direction:column;align-items:flex-start;overflow-x:visible;}' +
  '.swf-diagram-node{flex-direction:row;width:100%;text-align:left;gap:8px;padding:4px 0;}' +
  '.swf-diagram-connector{display:none;}}' +
  '.swf-progress-card{flex:0 0 260px;background:#fff;border:1px solid var(--border);border-radius:14px;' +
  'padding:16px;min-width:220px;box-sizing:border-box;}' +
  '.swf-progress-title{font-size:.92rem;font-weight:700;color:var(--navy);margin-bottom:10px;}' +
  '.swf-progress-bar-track{background:#e5ebf0;border-radius:999px;height:10px;overflow:hidden;margin-bottom:6px;}' +
  '.swf-progress-bar-fill{background:var(--teal);height:100%;border-radius:999px;}' +
  '.swf-progress-percent{font-size:1.3rem;font-weight:700;color:var(--navy);}' +
  '.swf-progress-text{font-size:.8rem;color:var(--muted);margin-top:4px;}' +
  '.swf-progress-target{font-size:.8rem;color:var(--text);margin-top:10px;padding-top:10px;border-top:1px solid var(--border);}' +
  '.swf-table-wrap{overflow-x:auto;}' +
  '.swf-table{width:100%;border-collapse:separate;border-spacing:0;background:#fff;border:1px solid var(--border);' +
  'border-radius:14px;overflow:hidden;font-size:.86rem;}' +
  '.swf-table thead th{background:#f3f7f9;color:var(--navy);font-weight:700;text-align:left;padding:10px 12px;' +
  'font-size:.78rem;position:sticky;top:0;z-index:1;border-bottom:1px solid var(--border);}' +
  '.swf-table tbody td{padding:10px 12px;border-bottom:1px solid var(--border);vertical-align:top;}' +
  '.swf-table tbody tr:last-child td{border-bottom:none;}' +
  '.swf-row-current{background:#e8f2ff;}' +
  '.swf-order-badge{display:inline-flex;align-items:center;justify-content:center;min-width:26px;height:26px;' +
  'border-radius:999px;font-size:.76rem;font-weight:700;color:#fff;padding:0 6px;}' +
  '.swf-order-done{background:var(--done);}.swf-order-current{background:var(--navy);}' +
  '.swf-order-pending{background:var(--pending);}.swf-order-locked{background:var(--pending);}' +
  '.swf-order-revision2{background:#e8c547;}.swf-order-revision3{background:var(--revision);}' +
  '.swf-order-fail{background:var(--danger);}.swf-order-skip{background:#c3c9cf;}' +
  '.swf-step-cell{display:flex;align-items:center;gap:6px;font-weight:600;}' +
  '.swf-step-icon-sm{font-size:.95rem;}' +
  '.swf-desc-cell{color:var(--muted);font-size:.8rem;max-width:240px;}' +
  '.swf-date-text{font-size:.82rem;}' +
  '.swf-badge{display:inline-block;font-size:.74rem;font-weight:700;padding:3px 10px;border-radius:999px;}' +
  '.swf-badge-done{background:#d9f0e1;color:#166534;}' +
  '.swf-badge-current{background:#dbe8f7;color:#1f3b54;}' +
  '.swf-badge-pending{background:#e3e8eb;color:var(--muted);}' +
  '.swf-badge-revision{background:#fbecc0;color:#8a6300;}' +
  '.swf-badge-fail{background:#f6d4d1;color:#9a2d24;}' +
  '.swf-badge-skip{background:#f1f2f4;color:var(--muted);}' +
  // 2026-11-04 — requirement "กระชับ อ่านจบได้ในจอ 1366px ไม่ scroll แนวนอน": ตาราง 4 คอลัมน์ fix สัดส่วน
  // 8/47/20/25% (ข้อ 4), แถวสูง ~46px (ข้อ 12, ระหว่าง 44-52px ตามที่ระบุ), font 13-14px (ข้อ 13), ปุ่ม/input
  // สูง ~34px (ข้อ 14) — ใช้ table-layout:fixed ให้สัดส่วน <col> คุมจริง ไม่ล้น container เกิน scroll
  '.swf-table-compact{table-layout:fixed;}' +
  '.swf-table-compact thead th{padding:8px 10px;font-size:.8rem;font-weight:600;background:#f3f7f9;}' +
  '.swf-table-compact tbody td{padding:0 10px;font-size:.84rem;}' +
  '.swf-crow{height:46px;}' +
  '.swf-crow-order{text-align:center;}' +
  '.swf-crow-name{font-weight:600;white-space:normal;word-break:break-word;line-height:1.3;}' +
  '.swf-crow-date{font-size:.82rem;color:var(--text);white-space:nowrap;}' +
  '.swf-crow-skipped .swf-crow-date,.swf-crow-skipped .swf-crow-name{color:var(--muted);opacity:.6;}' +
  '.swf-crow-action{white-space:nowrap;}' +
  '.swf-crow-btn{height:34px;min-height:34px;padding:0 14px;font-size:.78rem;line-height:34px;}' +
  '.swf-crow-actions{display:flex;flex-wrap:wrap;gap:6px;}' +
  '.swf-crow-muted{color:var(--muted);}' +
  // Section F — current row highlight เบา (ข้อ 9: #eef6ff + border-left 3px navy แทน swf-row-current เดิม
  // #e8f2ff เต็มแถวตรงๆ ที่ requirement รอบก่อนกำหนดไว้ — ใช้คู่กับคอมเมนต์เดิมด้านบน .swf-row-current)
  '.swf-crow-current{background:#eef6ff;border-left:3px solid var(--navy);}' +
  '.swf-crow-current td:first-child{padding-left:7px;}' +
  '@media (max-width:1366px){.swf-table-compact{width:100%;}}' +
  '@media (max-width:768px){' +
  '.swf-table thead{display:none;}' +
  '.swf-table, .swf-table tbody, .swf-table tr, .swf-table td{display:block;width:100%;box-sizing:border-box;}' +
  '.swf-table tr{border:1px solid var(--border);border-radius:12px;margin-bottom:10px;padding:8px 4px;}' +
  '.swf-table td{border-bottom:none;padding:6px 10px;}' +
  '.swf-table td[data-label]::before{content:attr(data-label);display:block;font-size:.68rem;color:var(--muted);' +
  'font-weight:700;margin-bottom:2px;}' +
  '}' +
  '.swf-bottom-bar{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:10px;margin-top:18px;}' +
  '.swf-bottom-note{font-size:.76rem;color:var(--muted);}' +
  '.swf-bottom-actions{display:flex;gap:10px;flex-wrap:wrap;margin-left:auto;}' +
  '.swf-btn-history{display:inline-flex;align-items:center;gap:4px;border:1px solid var(--teal);color:var(--teal);' +
  'background:#fff;border-radius:10px;padding:9px 16px;font-size:.84rem;font-weight:700;cursor:pointer;}' +
  '.swf-btn-saveall{display:inline-flex;align-items:center;gap:4px;border:none;color:#fff;background:var(--done);' +
  'border-radius:10px;padding:9px 16px;font-size:.84rem;font-weight:700;cursor:pointer;}' +
  '.swf-saveall-row{display:flex;align-items:center;gap:10px;padding:6px 0;flex-wrap:wrap;}' +
  '.swf-saveall-row label{flex:1 1 220px;font-size:.82rem;}' +
  '@media (min-width:1100px){.swf-page.pub-compact{max-width:1600px;}}' +
  // 2026-11-04 รอบ 3 — requirement ล่าสุด "ตารางแนวนอน 10 Step เหลือแถวเดียว (วันที่ดำเนินการ)" ใช้ CSS Grid
  // ตามที่ระบุ (ข้อ 25: label column ~130px + 10 คอลัมน์แบ่งเท่ากัน) แทน <table> เดิม (คลาส "swfg-" ใหม่ทั้งหมด
  // สโคปเฉพาะ component นี้ ไม่กระทบ .swf-table/.swf-crow-* เดิมที่เลิกใช้ในหน้านี้แล้วแต่ไม่ได้ลบ CSS ทิ้ง)
  '.swfg-section{background:#fff;border:1px solid var(--border);border-radius:14px;padding:16px;' +
  'box-shadow:0 1px 2px rgba(20,40,55,.04);margin-top:16px;}' +
  '.swfg-header{display:flex;align-items:center;gap:8px;font-family:Sarabun,sans-serif;font-size:18px;' +
  'font-weight:700;color:var(--navy);margin-bottom:12px;}' +
  '.swfg-header-icon{font-size:1rem;}' +
  '.swfg-success-banner{background:#e3f6e8;color:#166534;border:1px solid var(--done);border-radius:10px;' +
  'padding:9px 14px;font-size:.85rem;font-weight:600;margin-bottom:12px;}' +
  '.swfg-wrap{overflow-x:auto;}' + // ข้อ 30 — scroll แนวนอนเฉพาะตารางนี้เท่านั้น ไม่ใช่ทั้งหน้า
  // ข้อ 24/25 — minmax(0,1fr) (ไม่ fix ขั้นต่ำต่อคอลัมน์) ให้ 10 คอลัมน์หดได้จริงพอดี container บนจอ 1366px
  // ไม่ต้อง scroll (ตามที่ระบุตรงๆ) .swfg-wrap ยังมี overflow-x:auto ไว้เป็น safety net เฉพาะจอที่แคบกว่านั้นมาก
  '.swfg-grid{display:grid;grid-template-columns:130px repeat(10, minmax(0, 1fr));gap:1px;' +
  'background:var(--border);border:1px solid var(--border);border-radius:12px;overflow:hidden;}' +
  '.swfg-cell{background:#fff;padding:8px 6px;box-sizing:border-box;display:flex;flex-direction:column;' +
  'align-items:center;justify-content:center;text-align:center;gap:4px;}' +
  '.swfg-label{background:#f7f9fa;align-items:flex-start;justify-content:center;text-align:left;' +
  'font-size:.78rem;font-weight:600;color:var(--navy);padding-left:10px;}' +
  '.swfg-head{min-height:130px;max-height:160px;}' + // ข้อ 23
  '.swfg-step-name{font-size:.76rem;line-height:1.3;color:var(--text);word-break:break-word;}' + // ข้อ 24/26 — wrap 2-3 บรรทัดได้
  '.swfg-date{min-height:52px;}' + // ข้อ 23
  // 2026-11-05 รอบ 2 — ข้อ 3 "ห้ามให้เลข 10 ล้นวงกลม" ขยับ 24->26px (ยังอยู่ในช่วง 24-28px ที่ระบุ) พอสำหรับ
  // เลข 2 หลักที่ font-size เดิมโดยไม่ต้องเพิ่ม logic แยกขนาดต่อ step
  '.swfg-badge{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;' +
  'border-radius:50%;font-size:.72rem;font-weight:700;color:#fff;flex-shrink:0;white-space:nowrap;}' + // ข้อ 26 — 12-13px ขนาด badge เลขให้สมดุลกับ font
  '.swfg-badge-done{background:var(--done);}.swfg-badge-current{background:var(--navy);}' +
  '.swfg-badge-pending{background:var(--pending);}.swfg-badge-skip{background:#c3c9cf;}' +
  '.swfg-badge-revision2{background:#e8c547;}.swfg-badge-revision3{background:var(--revision);}' +
  '.swfg-badge-fail{background:var(--danger);}' +
  '.swfg-col-skipped{opacity:.5;}' + // ข้อ 13
  // ข้อ 29 — highlight ทั้งคอลัมน์ current (หัว+วันที่) เบาๆ #eef6ff แทนที่จะ highlight แค่ cell เดียว
  '.swfg-col-current{background:#eef6ff;}' +
  '.swfg-input{width:100%;max-width:100%;height:34px;box-sizing:border-box;font-size:.78rem;padding:4px 6px;' +
  'border:1px solid var(--border);border-radius:8px;background:#fff;font-family:Sarabun,sans-serif;}' + // ข้อ 27
  '.swfg-col-current .swfg-input{border-color:var(--navy);border-width:1.5px;}' + // ข้อ 11 — border เด่นกว่าเล็กน้อย
  '.swfg-input:disabled{background:#f3f4f6;color:var(--muted);}' +
  '.swfg-branch{display:flex;flex-direction:column;gap:4px;width:100%;}' +
  '.swfg-branch-hint{font-size:.66rem;color:var(--muted);}' +
  '.swfg-branch-btn{font-size:.68rem;padding:4px 6px;border-radius:6px;border:1px solid var(--navy);' +
  'background:#fff;color:var(--navy);cursor:pointer;font-family:Sarabun,sans-serif;}' +
  '.swfg-actions{display:flex;justify-content:center;margin-top:14px;}' +
  '@media (min-width:900px){.swfg-actions{justify-content:flex-end;}}' +
  '.swfg-update-btn{display:inline-flex;align-items:center;gap:6px;height:40px;padding:0 22px;border-radius:10px;' +
  'border:none;background:var(--teal);color:#fff;font-size:.88rem;font-weight:700;cursor:pointer;' +
  'font-family:Sarabun,sans-serif;}' + // ข้อ 15 — compact, สูง 38-42px, ไม่เต็ม width
  '.swfg-update-btn:disabled{background:var(--pending);cursor:not-allowed;opacity:.7;}' +
  '.swfg-history-link{text-align:center;margin-top:10px;}' +
  '.swfg-history-link a{font-size:.78rem;color:var(--teal);text-decoration:none;}' +
  '@media (max-width:640px){.swfg-grid{grid-template-columns:100px repeat(10, minmax(72px, 1fr));}}';

// 2026-11-05 — requirement ใหม่ "ตารางแนวตั้ง 5 คอลัมน์ + Side Drawer" (renderStaffWorkflowRowsTable_, Views.gs)
// คลาส "swft-" ใหม่ทั้งหมด สโคปเฉพาะ component นี้ ไม่กระทบ .swfg-*/.swf-table เดิมที่เลิกใช้ในหน้านี้แล้วแต่ไม่ได้
// ลบ CSS ทิ้ง (.swfg-badge/.swfg-input/.swfg-section/.swfg-header/.swfg-actions/.swfg-update-btn/.wtbl-panel/
// .wf-confirm ยังถูก reuse จริงจากตารางนี้ — ไม่ซ้ำ rule ที่มีอยู่แล้วด้านบน)
PUBLIC_CSS_ += '' +
  // ข้อ 42 — การ์ด white/border #d9e2ea/radius 14-16/shadow เบา (reuse .swfg-section เดิมเป๊ะอยู่แล้ว ไม่ต้องสร้างซ้ำ)
  '.swft-table-wrap{overflow-x:auto;}' + // safety net จอแคบมากๆ — 1366px ไม่ scroll จริงตามที่ทดสอบ (ข้อ 44)
  '.swft-table{width:100%;border-collapse:collapse;table-layout:fixed;font-family:Sarabun,sans-serif;}' +
  // ข้อ 43 — หัวตาราง bg #eef3f6, font 13-14px/600
  '.swft-table thead th{background:#eef3f6;color:var(--navy);font-size:13px;font-weight:600;text-align:left;' +
  'padding:8px 8px;border-bottom:1px solid var(--border);}' +
  '.swft-table tbody td{padding:8px 8px;border-bottom:1px solid var(--border);vertical-align:middle;' +
  'font-size:.82rem;word-break:break-word;}' +
  // ข้อ 7 — row สูง 44-54px ปกติ (min-height ผ่าน padding ของ td ด้านบน + line-height ปกติก็เกินพอแล้ว)
  '.swft-row-current{background:#eef6ff;}' + // ข้อ 29 — highlight ทั้งแถวเบาๆ ห้ามสีหนัก
  '.swft-row-current td:first-child{border-left:3px solid var(--navy);}' +
  '.swft-row-skipped{opacity:.55;}' +
  '.swft-col-order{text-align:center;width:6%;}' +
  '.swft-col-step{display:flex;align-items:center;gap:6px;flex-wrap:wrap;}' +
  '.swft-step-icon{flex-shrink:0;font-size:.9rem;}' +
  '.swft-step-name{color:var(--text);line-height:1.35;}' +
  // 2026-11-05 รอบ 3 — requirement ใหม่ คอลัมน์แยก "ผลการเลือก / รายละเอียด" (เดิมต่อท้ายชื่อขั้นตอนในคอลัมน์
  // ขั้นตอน — ย้ายมาคอลัมน์นี้ตามที่ขอ) ขั้นตอนที่ไม่มีผล/ยังไม่ resolve แสดง "-" สีเทากลาง (ข้อ 14/20 ห้าม
  // null/undefined/ว่างเปล่า)
  '.swft-col-result{text-align:center;color:var(--muted);font-size:.82rem;}' +
  // ข้อ 6/8/15 — badge ผลที่เลือก (Step 3 hub ครบถ้วน/ไม่ครบถ้วน + Step 7) เล็ก กระชับ 1366px (font 11px)
  '.swft-result-badge{display:inline-block;font-size:11px;font-weight:600;padding:2px 8px;border-radius:999px;' +
  'border:1px solid transparent;line-height:1.5;white-space:normal;}' +
  '.swft-result-badge-pass{background:#d9f0e1;color:#166534;border-color:#bfe6cc;}' +
  '.swft-result-badge-fail{background:#f6d4d1;color:#9a2d24;border-color:#eec0bb;}' +
  '.swft-result-badge-revision2{background:#fbecc0;color:#8a6300;border-color:#f3dd96;}' +
  '.swft-result-badge-revision3{background:#f3dd96;color:#6b4e00;border-color:#e8c547;}' +
  '.swft-result-badge-neutral{background:#eef1f3;color:var(--muted);border-color:var(--border);}' +
  '.swft-col-date .swfg-input{height:34px;}' + // ข้อ 7 — ปกติไม่สูงเกินแถว ยกเว้น branch row (ข้อ 7 ข้อยกเว้น)
  '.swft-col-history{color:var(--muted);font-size:.78rem;text-align:center;}' + // ข้อ 17/34 — ข้อความสั้น ไม่โชว์รายละเอียดในเซลล์
  '.swft-col-detail{text-align:center;}' +
  '.swft-detail-btn{font-size:.72rem;padding:4px 10px;border-radius:8px;}' + // ข้อ 18 — outline blue compact (.btn-outline เดิม)
  // ข้อ 10/32/33 — checklist/result แบบ radio segmented inline compact (ไม่ใช่ checkbox, เลือกได้ค่าเดียว)
  '.swft-branch-group{display:flex;flex-direction:column;gap:4px;margin-bottom:4px;}' +
  '.swft-branch-option{display:flex;align-items:center;gap:6px;font-size:.76rem;color:var(--text);' +
  'border:1px solid var(--border);border-radius:8px;padding:4px 8px;cursor:pointer;background:#fff;}' +
  '.swft-branch-option input{margin:0;cursor:pointer;}' +
  // ข้อ 32 — "ไม่ต้องทำ card ใหญ่" ฟอร์มย่อยที่เผยออกมา compact กว่า .wf-confirm เดิม (รอบก่อนหน้าเป็น popup
  // ลอยกลางจอ รอบนี้ inline อยู่ในเซลล์เดียวกันแล้ว ไม่ต้องมี shadow/title ใหญ่)
  '.swft-branch-form{padding:8px;margin-top:4px;border:1px dashed var(--border);border-radius:8px;background:#f9fbfc;' +
  'box-shadow:none;}' +
  '.swft-branch-form .field{margin-bottom:6px;}' +
  '.swft-branch-form .field label{font-size:.72rem;}' +
  '.swft-branch-submit{font-size:.76rem;padding:6px 14px;}' +
  // ข้อ 21 — Drawer ด้านขวา 360-420px, shadow เบา, เต็ม viewport, ปุ่ม X มุมขวาบน
  '.swft-drawer-overlay{position:fixed;inset:0;background:rgba(20,40,55,.35);opacity:0;visibility:hidden;' +
  'transition:opacity .15s;z-index:200;}' +
  '.swft-drawer-overlay.open{opacity:1;visibility:visible;}' +
  '.swft-drawer{position:fixed;top:0;right:0;height:100vh;width:380px;max-width:90vw;background:#fff;' +
  'box-shadow:-4px 0 16px rgba(20,40,55,.12);z-index:201;transform:translateX(100%);transition:transform .2s;' +
  'display:flex;flex-direction:column;font-family:Sarabun,sans-serif;}' +
  '.swft-drawer.open{transform:translateX(0);}' +
  '.swft-drawer-head{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;' +
  'border-bottom:1px solid var(--border);}' +
  '.swft-drawer-title{font-size:.92rem;font-weight:700;color:var(--navy);}' +
  '.swft-drawer-close{border:none;background:none;font-size:1.3rem;line-height:1;color:var(--muted);cursor:pointer;padding:0 4px;}' +
  '.swft-drawer-body{flex:1;overflow-y:auto;padding:12px 16px;}' +
  '.swft-drawer-foot{padding:12px 16px;border-top:1px solid var(--border);}' +
  // ข้อ 22/23 — รายการประวัติ: วันที่/เวลา, ผู้แก้ไข, รายการ, เดิม(neutral)/ใหม่(เขียวอ่อน)
  '.swft-drawer-item{border:1px solid var(--border);border-radius:10px;padding:10px 12px;margin-bottom:10px;}' +
  '.swft-drawer-time{font-size:.74rem;color:var(--muted);margin-bottom:6px;}' +
  '.swft-drawer-row{display:flex;justify-content:space-between;gap:8px;font-size:.78rem;margin-top:3px;}' +
  '.swft-drawer-k{color:var(--muted);flex-shrink:0;}' +
  '.swft-drawer-v{color:var(--text);text-align:right;}' +
  '.swft-drawer-old{color:var(--muted);text-align:right;}' +
  '.swft-drawer-new{background:#e3f6e8;color:#166534;padding:1px 6px;border-radius:6px;text-align:right;font-weight:600;}' +
  '.swft-drawer-error{color:var(--danger);font-size:.82rem;}' +
  // ข้อ 40 — Mobile: Drawer เต็มจอ
  '@media (max-width:640px){.swft-drawer{width:100%;max-width:100%;}}';

// 2026-11-05 รอบ 2 — requirement ใหม่ "ปรับ UX/UI หน้า Success ให้ใกล้เคียงภาพอ้างอิงล่าสุด" (ยังเป็นหน้าเดียวกับ
// renderRegisterSuccessBody_/regsuccessRow_ รอบก่อน — แก้ visual เท่านั้น ไม่แตะ flow/data source/bounce ที่ทำไว้
// แล้ว) คลาส "regsuccess-" เดิมทั้งหมด สโคปเฉพาะหน้านี้ ไม่แก้ .success-card เดิม (renderQrPrintBody_ ใช้ร่วม) —
// เปลี่ยนจาก reuse .detail-row/.detail-label/.detail-value (2 คอลัมน์) เป็น grid 3 คอลัมน์ icon|label|value ของ
// ตัวเอง (ข้อ 12/13 ขอ icon container + label กว้างคงที่ตรงๆ ซึ่ง .detail-row เดิมไม่มี)
PUBLIC_CSS_ += '' +
  // ข้อ 17/18 — max-width 1000-1100px กึ่งกลาง, radius 20-24px, shadow เบา, padding 40-52px desktop, พื้นหลังหน้า #eef4f6 (ใช้ --bg เดิมของ body อยู่แล้ว ไม่ต้องเพิ่ม)
  '.regsuccess-card{max-width:1040px;margin:0 auto;background:#fff;border:1px solid var(--border);' +
  'border-radius:22px;box-shadow:0 4px 18px rgba(31,59,84,.08);padding:48px 44px;text-align:center;}' +
  // ข้อ 2 — วงกลมเขียว 64-80px + outer ring เขียวอ่อน (glow เบาๆ ไม่ใช้ animation)
  '.regsuccess-icon-ring{width:104px;height:104px;border-radius:50%;background:#e3f6e8;' +
  'display:inline-flex;align-items:center;justify-content:center;margin-bottom:18px;}' +
  '.regsuccess-icon-circle{width:72px;height:72px;border-radius:50%;background:var(--done);color:#fff;' +
  'font-size:2rem;font-weight:700;display:inline-flex;align-items:center;justify-content:center;' +
  'box-shadow:0 4px 14px rgba(31,138,76,.3);}' +
  // ข้อ 3 — หัวข้อ 28-34px/700/navy, spacing 12-16px จาก icon, 8px ก่อนคำอธิบาย
  '.regsuccess-title{font-size:1.9rem;font-weight:700;color:var(--navy);margin:0 0 8px;font-family:Sarabun,sans-serif;}' +
  // ข้อ 4 — คำอธิบายสี muted 15-17px line-height อ่านง่าย, spacing 24px ก่อน Summary Panel
  '.regsuccess-desc{color:var(--muted);font-size:1rem;line-height:1.6;margin:0 auto 24px;max-width:640px;}' +
  // ข้อ 5/11 — Summary Panel การ์ดเดียว พื้นฟ้าอ่อนมาก border #d8e5eb radius 12-14px, spacing 24px ก่อนปุ่ม
  '.regsuccess-summary{background:#f7fbfd;border:1px solid #d8e5eb;border-radius:14px;' +
  'margin:0 0 28px;text-align:left;overflow:hidden;}' +
  // ข้อ 6-8/13 — แต่ละแถว icon|label(กว้างคงที่)|value, divider บางระหว่างแถว, padding 14-18px
  '.regsuccess-row{display:grid;grid-template-columns:40px 240px 1fr;align-items:start;gap:14px;' +
  'padding:16px 18px;border-top:1px solid #d8e5eb;}' +
  '.regsuccess-row:first-child{border-top:none;}' +
  // ข้อ 12 — icon container เล็ก teal อ่อน เดี่ยวสี ไม่รก
  '.regsuccess-row-icon{width:34px;height:34px;border-radius:9px;background:rgba(14,124,134,.12);color:var(--teal);' +
  'display:flex;align-items:center;justify-content:center;font-size:1rem;flex-shrink:0;}' +
  '.regsuccess-row-label{color:var(--muted);font-size:.86rem;padding-top:6px;}' +
  // ข้อ 7 — value สี navy/600 ชื่อผลงานยาว wrap 2-3 บรรทัดได้ ห้าม ellipsis
  '.regsuccess-row-value{color:var(--navy);font-weight:600;font-size:.94rem;white-space:normal;' +
  'overflow-wrap:break-word;padding-top:4px;}' +
  // ข้อ 8/25 — เลขทะเบียนเด่นกว่าแถวอื่นเล็กน้อย
  '.regsuccess-tracking{font-size:1.1rem;font-variant-numeric:tabular-nums;}' +
  // ข้อ 14-16 — ปุ่มเรียงแนวนอนกึ่งกลาง gap 16-20px, สูง 48-52px, primary กว้างกว่า secondary เล็กน้อย
  '.regsuccess-actions{display:flex;gap:18px;justify-content:center;flex-wrap:wrap;}' +
  '.regsuccess-btn{text-decoration:none;display:inline-flex;align-items:center;justify-content:center;' +
  'height:50px;padding:0 26px;border-radius:11px;font-weight:600;font-size:.92rem;}' +
  '.regsuccess-btn-icon{margin-right:8px;font-size:1rem;}' +
  '.regsuccess-btn-primary{background:var(--teal);border-color:var(--teal);color:#fff;padding:0 30px;}' +
  '.regsuccess-btn-secondary{color:var(--navy);border-color:var(--border);}' +
  // ข้อ 20/30 — Mobile 375px: การ์ดเกือบเต็มจอ padding ลด, แถว stack icon/label/value, ปุ่ม stack แนวตั้ง, ไม่ horizontal scroll
  '@media (max-width:480px){' +
  '.regsuccess-card{padding:28px 18px;border-radius:18px;}' +
  '.regsuccess-icon-ring{width:88px;height:88px;}' +
  '.regsuccess-icon-circle{width:60px;height:60px;font-size:1.6rem;}' +
  '.regsuccess-title{font-size:1.5rem;}' +
  '.regsuccess-row{grid-template-columns:28px 1fr;grid-template-areas:"icon label" "value value";padding:14px;}' +
  '.regsuccess-row-icon{grid-area:icon;width:28px;height:28px;}' +
  '.regsuccess-row-label{grid-area:label;padding-top:2px;}' +
  '.regsuccess-row-value{grid-area:value;padding-top:6px;}' +
  '.regsuccess-actions{flex-direction:column;}' +
  '.regsuccess-btn{width:100%;}' +
  '}';
