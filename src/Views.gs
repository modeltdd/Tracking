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

var NAV_ITEMS_ = [
  { page: 'dashboard', label: 'หน้าแรก', icon: '⌂' },
  { page: 'scan', label: 'สแกน QR', icon: '⌗' },
  { page: 'forward', label: 'ส่งต่อ', icon: '→' },
  { page: 'search', label: 'ค้นหา', icon: '⌕' },
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
      '<td><a class="btn-action btn-action-primary btn-action-sm" target="_top" href="' + baseUrl +
      '?page=scan&t=' + encodeURIComponent(w.qr_token) + '">จัดการ</a></td>' +
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
          '<a class="btn-action btn-action-primary btn-action-sm" target="_top" href="' + baseUrl +
          '?page=scan&t=' + encodeURIComponent(w.qr_token) + '">ดำเนินการ</a>' +
          '</div>';
      }).join('')
    : '<div class="empty">ไม่มีงานที่ต้องดำเนินการในขณะนี้</div>';

  return '' +
    '<p class="scope-note">งานของหน่วยงาน <b>' + escapeHtml_(org) + '</b> ที่ดำเนินการได้ทันที</p>' +
    '<section class="metric-card">' + listHtml + '</section>';
}

/** หน้าทะเบียนผลงานทั้งหมด (เฉพาะ ผู้รับผิดชอบ/Admin) — ช่องค้นหา + ตัวกรองสถานะ + ตาราง + pagination */
function renderRegistryListBody_(ss, pageResult, rp, totalAllCount, bucketCounts, baseUrl, flashMessage) {
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

  var filterFormHtml = '' +
    '<form method="get" target="_top" action="' + baseUrl + '" class="reg-form" style="margin-bottom:12px;">' +
    '<input type="hidden" name="page" value="registry">' +
    '<div class="field-row">' +
    '<div class="field"><label>ค้นหา</label><input class="input" type="text" name="q" value="' + escapeHtml_(rp.q) +
    '" placeholder="เลขทะเบียน / ชื่อเจ้าของผลงาน / ชื่อผลงาน / หน่วยงาน"></div>' +
    '</div>' +
    '<div class="field-row">' +
    '<div class="field"><label>สถานะ</label><select class="input" name="state">' + stateOptions + '</select></div>' +
    '<div class="field"><label>ผู้รับผิดชอบ</label><select class="input" name="resp">' + respOptions + '</select></div>' +
    '</div>' +
    '<div class="field-row">' +
    '<div class="field"><label>หน่วยงาน</label><select class="input" name="org">' + orgOptions + '</select></div>' +
    '<div class="field"><label>ผลการพิจารณา</label><select class="input" name="result">' + resultOptions + '</select></div>' +
    '</div>' +
    '<div class="field-row">' +
    '<div class="field"><label>แสดง</label><select class="input" name="per">' + perOptions + '</select></div>' +
    '</div>' +
    '<button class="btn-primary" type="submit">ค้นหา/กรอง</button>' +
    '</form>';

  var rows = pageResult.items.map(function (w) {
    var ownerName = (w.title_name || '') + (w.first_name || '') + ' ' + (w.last_name || '');
    var state = stationsMap[w.current_station_key];
    return '<tr>' +
      '<td>' + escapeHtml_(w.tracking_no) + '</td>' +
      '<td>' + escapeHtml_(w.work_title || '-') + '</td>' +
      '<td>' + escapeHtml_(w.org_from || '-') + '</td>' +
      '<td>' + escapeHtml_(ownerName) + '</td>' +
      '<td>' + escapeHtml_(state ? state.station_name : w.current_station_key) + '</td>' +
      '<td>' + escapeHtml_(w.current_owner_org || '-') + '</td>' +
      '<td>' + formatDateTh_(w.updated_at) + '</td>' +
      '<td><a class="btn-action btn-action-primary btn-action-sm" target="_top" href="' + baseUrl +
      '?page=scan&t=' + encodeURIComponent(w.qr_token) + '">ดูรายละเอียด/จัดการ</a></td>' +
      '</tr>';
  }).join('');

  // หัวตารางกดเรียงได้ (2026-09-24 ตามที่ผู้ใช้ขอ) — คลิกครั้งแรกเรียง asc, คลิกซ้ำสลับ desc/asc คอลัมน์เดิม
  var theadHtml = '<tr>' +
    registrySortHeaderHtml_('เลขทะเบียน', 'tracking_no', rp, baseUrl) +
    registrySortHeaderHtml_('ชื่อผลงาน', 'work_title', rp, baseUrl) +
    registrySortHeaderHtml_('หน่วยงาน', 'org_from', rp, baseUrl) +
    registrySortHeaderHtml_('เจ้าของผลงาน', 'owner', rp, baseUrl) +
    registrySortHeaderHtml_('สถานะปัจจุบัน', 'state', rp, baseUrl) +
    registrySortHeaderHtml_('ผู้รับผิดชอบ', 'current_owner_org', rp, baseUrl) +
    registrySortHeaderHtml_('วันที่อัปเดตล่าสุด', 'updated_at', rp, baseUrl) +
    '<th>จัดการ</th></tr>';
  var tableHtml = pageResult.items.length
    ? '<div class="table-scroll"><table class="admin-table"><thead>' + theadHtml + '</thead><tbody>' + rows + '</tbody></table></div>'
    : '<div class="empty">ไม่พบรายการที่ตรงกับเงื่อนไข</div>';

  var pagerHtml = '';
  if (pageResult.totalItems > 0) {
    var hasFilter = rp.q || rp.state || rp.resp || rp.org || rp.result || rp.bucket;
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

  return flashHtml + viewToggleHtml + tilesHtml + filterFormHtml +
    '<p class="hint" style="margin:0 0 10px">คลิก "ดูรายละเอียด/จัดการ" — เห็นได้ทุกรายการ แก้สถานะได้เฉพาะที่หน่วยงานตนรับผิดชอบ ณ สถานะปัจจุบันเท่านั้น</p>' +
    '<section class="metric-card">' + tableHtml + pagerHtml + '</section>';
}

/** ปุ่มสลับ [มุมมองการ์ด] [มุมมอง Excel] (2026-09-25 ตามที่ผู้ใช้ขอข้อ 10) — ข้อมูล/filter/permission ชุดเดียวกัน
 *  ต่างแค่การแสดงผล ใช้ร่วมกันทั้ง 2 ฟังก์ชัน render */
function renderRegistryViewToggle_(rp, baseUrl) {
  var isExcel = rp.view === 'excel';
  return '<div class="registry-view-toggle">' +
    '<a class="registry-view-btn' + (isExcel ? '' : ' active') + '" target="_top" href="' + baseUrl + '?' + buildRegistryQuery_(rp, { view: 'card', p: 1 }) + '">มุมมองการ์ด</a>' +
    '<a class="registry-view-btn' + (isExcel ? ' active' : '') + '" target="_top" href="' + baseUrl + '?' + buildRegistryQuery_(rp, { view: 'excel', p: 1 }) + '">มุมมอง Excel</a>' +
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
function renderWorkDetailBody_(ss, work, history, stationsMap, baseUrl, user, errors) {
  var ownerName = ((work.title_name || '') + (work.first_name || '') + ' ' + (work.last_name || '')).trim();
  var data = buildPublicResultData_(ss, work);

  // ลำดับหัวหน้า (2026-09-24 ตามที่ผู้ใช้ขอ): ชื่อเจ้าของผลงาน (เด่นสุด) -> เลขทะเบียน (รอง, muted) -> ชื่อผลงาน
  var nameBlockHtml = '' +
    '<div class="pub-name-block">' +
    '<div class="pub-name-owner">' + escapeHtml_(ownerName || '-') + '</div>' +
    '<div class="pub-name-tracking">เลขทะเบียน ' + escapeHtml_(work.tracking_no) + '</div>' +
    '<div class="pub-name-title">ชื่อผลงาน: ' + escapeHtml_(work.work_title || '-') + '</div>' +
    '</div>';

  var heroHtml = renderPubHero_(work, data.currentStation, stationsMap, data.steps);

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
  var timelineHtml = renderPubTimelineSection_(data.fixedTimeline);
  if (data.isLegacyImportOnly) timelineHtml += renderPubLegacyInfoBox_();

  // ข้อมูลภายในสำหรับเจ้าหน้าที่ — พับเก็บด้วย <details> ไม่ให้เด่นเกินสถานะ/Timeline ตามที่ผู้ใช้ขอ 2026-09-24
  var infoHtml = '' +
    '<details class="pub-details"><summary>ข้อมูลเพิ่มเติมสำหรับเจ้าหน้าที่</summary>' +
    '<div class="pub-details-body">' +
    renderPubOwnerRow_('ตำแหน่ง', work.position) +
    renderPubOwnerRow_('หน่วยงานต้นสังกัด', work.org_from) +
    '</div></details>';

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

  // ประวัติละเอียดทุกแถวจริง (ใครทำอะไรเมื่อไร+หมายเหตุ) — พับด้วย <details> ไม่ให้ดูเหมือน log ดิบกลางหน้า
  // + แปล LEGACY_IMPORT_MARKER_ เป็นข้อความอ่านง่าย ไม่โชว์ email ภายในดิบๆ (2026-09-24) ไม่ลบข้อมูลจริง แค่จัดรูปแบบ
  var auditLogHtml = history.length
    ? '<details class="pub-details"><summary>ดูประวัติการดำเนินการทั้งหมด</summary><div class="pub-details-body">' +
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
          '</div>';
      }).join('') + '</div></details>'
    : '';

  return '' +
    '<div class="pub-compact">' +
    '<div class="detail-card">' +
    nameBlockHtml + heroHtml + actionHtml + infoGridHtml + progressHtml + timelineHtml + noteHtml + auditLogHtml + infoHtml + coverHtml + ownerCodeHtml +
    '<p style="margin-top:12px"><a class="btn-outline" target="_top" href="' + baseUrl + '?page=qrprint&id=' + encodeURIComponent(work.work_id) + '">พิมพ์ QR ใหม่</a></p>' +
    '</div>' +
    '<p class="pub-back-link"><a target="_top" href="' + baseUrl + '?page=search">&larr; กลับหน้าค้นหา</a></p>' +
    '</div>';
}

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

  var bodyHtml = '' +
    (friendlyMode ? '' : '<div class="pub-hero-step-label">ขั้นตอนที่ ' + escapeHtml_(info.stepOrder) + '</div>') +
    '<div class="pub-hero-main">' + escapeHtml_(info.stepSplit.main) + '</div>' +
    (info.stepSplit.desc ? '<div class="pub-hero-desc">' + escapeHtml_(info.stepSplit.desc) + '</div>' : '');
  // 2026-10-07 friendlyMode — ข้อความอธิบายสถานะแบบภาษาคน (ข้อ 4) ดึงจาก WorkflowStates.public_hint ของ
  // สถานีปัจจุบันจริง (field ที่มีอยู่แล้ว Admin แก้ไขได้จากหน้า "จัดการ Workflow" โดยไม่ต้องแก้โค้ด) ไม่ได้
  // แต่งข้อความเองทุก state (ห้ามเดา — ตอนนี้มีค่าแค่บาง state ที่เกี่ยวกับการแก้ไขเอกสาร) ถ้าว่างไม่แสดงอะไรเลย
  if (friendlyMode && currentStation && currentStation.public_hint) {
    bodyHtml += '<div class="pub-hero-hint">' + escapeHtml_(currentStation.public_hint) + '</div>';
  }
  if (info.isSub) {
    // 2026-10-07 friendlyMode (หน้า Owner Dashboard เท่านั้น) — ซ่อนเลข state ย่อย (7.1/7.4 ฯลฯ) ออกจากบรรทัด
    // "ผลการพิจารณา" และใช้คำเต็มจากชื่อ state จริง (ส่วนในวงเล็บ) แทนคำสั้นๆ "ผ่าน"/"ไม่ผ่าน" ที่กำกวม —
    // "ผ่านการประเมิน"/"ไม่ผ่านการประเมิน" มาจาก station_name จริงในชีต WorkflowStates เอง (ไม่ได้เดา/สร้างคำใหม่)
    var subLabelText = friendlyMode
      ? ((info.subSplit.main === 'ผ่าน' || info.subSplit.main === 'ไม่ผ่าน') && info.subSplit.desc
        ? info.subSplit.desc : info.subSplit.main)
      : (info.subOrder + ' ' + info.subSplit.main);
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
    // friendlyMode (ข้อ 3/7) — ป้าย "ถัดไป" แทน "ขั้นตอนถัดไป" และไม่แสดงเลข state นำหน้าชื่อ
    bodyHtml += '<div class="pub-hero-next-row"><span class="pub-hero-next-label">' + (friendlyMode ? 'ถัดไป' : 'ขั้นตอนถัดไป') + '</span>' +
      '<span class="pub-hero-next-value">' + (friendlyMode ? '' : escapeHtml_(nextStep.order) + ' ') + escapeHtml_(nextStep.split.main) + '</span></div>';
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
  var timelineHtml = renderPubTimelineSection_(data.fixedTimeline);
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
function renderScanWorkBody_(ss, work, eligible, eligibleTransitions, baseUrl, token, errors) {
  var errorHtml = (errors && errors.length)
    ? '<div class="error-banner"><ul>' + errors.map(function (m) { return '<li>' + escapeHtml_(m) + '</li>'; }).join('') + '</ul></div>'
    : '';

  var ownerName = ((work.title_name || '') + (work.first_name || '') + ' ' + (work.last_name || '')).trim();
  var data = buildPublicResultData_(ss, work);
  var stationsMap = data.stationsMap;

  var nameBlockHtml = '' +
    '<div class="pub-name-block">' +
    '<div class="pub-name-owner">' + escapeHtml_(ownerName || '-') + '</div>' +
    '<div class="pub-name-tracking">เลขทะเบียน ' + escapeHtml_(work.tracking_no) + '</div>' +
    '<div class="pub-name-title">ชื่อผลงาน: ' + escapeHtml_(work.work_title || '-') + '</div>' +
    '</div>';

  var heroHtml = renderPubHero_(work, data.currentStation, stationsMap, data.steps);

  var actionInfoHtml = work.next_step_text
    ? '<div class="pub-action-box"><div class="pub-action-title">สิ่งที่ต้องดำเนินการ</div><p>' + escapeHtml_(work.next_step_text) + '</p></div>'
    : '';

  var infoGridHtml = renderPubInfoGrid_([
    { label: 'ผู้รับผิดชอบ', value: work.handoff_pending ? '(รอสแกนรับเอกสาร)' : (work.current_owner_org || '-') },
    { label: 'รับงานเมื่อ', value: formatDateThShort_(work.updated_at) },
    { label: 'รับเรื่องเมื่อ', value: formatDateThShort_(work.received_date) },
    { label: 'ส่งให้ผู้ว่า', value: data.governorForwardDate ? formatDateThShort_(data.governorForwardDate) : 'ยังไม่ส่งให้ผู้ว่า' },
  ]);

  var transitionButtonsHtml = eligibleTransitions.length
    ? '<div class="action-list">' + eligibleTransitions.map(function (t) {
        return '<a class="btn-action btn-action-primary" target="_top" href="' + baseUrl +
          '?page=scan&t=' + encodeURIComponent(token) + '&trans=' + encodeURIComponent(t.transition_id) + '">' +
          escapeHtml_(t.button_label) + '</a>';
      }).join('') + '</div>'
    : '';

  var utilityButtonsHtml = eligible.length
    ? '<div class="action-list">' + eligible.map(function (a) {
        var variant = ACTION_BUTTON_VARIANT_[a] || 'secondary';
        return '<a class="btn-action btn-action-' + variant + '" target="_top" href="' + baseUrl +
          '?page=scan&t=' + encodeURIComponent(token) + '&do=' + a + '">' + escapeHtml_(ACTION_LABELS_[a] || a) + '</a>';
      }).join('') + '</div>'
    : '';

  var buttonsHtml = '<div class="pub-scan-actions">' + ((transitionButtonsHtml || utilityButtonsHtml)
    ? transitionButtonsHtml + utilityButtonsHtml
    : '<div class="empty">ไม่มีการกระทำที่ทำได้กับงานนี้ในขณะนี้ (อาจไม่ใช่หน่วยงานที่รับผิดชอบ หรืองานสิ้นสุดแล้ว)</div>') + '</div>';

  var progressHtml = data.progressSummary ? renderPubProgressSummary_(data.progressSummary) : '';
  var timelineHtml = renderPubTimelineSection_(data.fixedTimeline);
  if (data.isLegacyImportOnly) timelineHtml += renderPubLegacyInfoBox_();

  return '' +
    '<div class="pub-compact">' +
    errorHtml +
    '<div class="detail-card">' +
    nameBlockHtml + heroHtml + actionInfoHtml + infoGridHtml + buttonsHtml + progressHtml + timelineHtml +
    '</div>' +
    '<p class="pub-back-link"><a target="_top" href="' + baseUrl + '?page=detail&id=' + encodeURIComponent(work.work_id) + '">ดูรายละเอียด/ประวัติทั้งหมด &rarr;</a></p>' +
    '<p class="pub-back-link"><a target="_top" href="' + baseUrl + '?page=scan">&larr; สแกนรายการอื่น</a></p>' +
    '</div>';
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

  return errorHtml +
    '<form method="post" target="_top" action="' + baseUrl + '" class="reg-form">' +
    '<h3 class="action-form-title">' + escapeHtml_(transition.button_label) + '</h3>' +
    '<p>ยืนยันเปลี่ยนสถานะงาน <b>' + escapeHtml_(work.tracking_no) + '</b></p>' +
    '<input type="hidden" name="form_action" value="state_transition">' +
    '<input type="hidden" name="work_id" value="' + escapeHtml_(work.work_id) + '">' +
    '<input type="hidden" name="transition_id" value="' + escapeHtml_(transition.transition_id) + '">' +
    '<input type="hidden" name="qr_token" value="' + escapeHtml_(token) + '">' +
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
    '<div class="field field-branch" id="reg-specialty-field"><label>ด้าน/สาขา</label><select class="input" name="reg_specialty" id="reg-specialty">' + specialtyOptionsHtml + '</select></div>' +
    '<div class="field field-posno"><label>เลขตำแหน่งเดิม</label><input class="input" name="reg_position_no" value="' + v('position_no') + '"></div>' +
    '</div>' +
    '<div class="field" id="reg-committee-field" style="display:none">' +
    '<label>คณะกรรมการที่รับผิดชอบ</label><div id="reg-committee-info"></div></div>' +
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
    'var REG_ORG_LOOKUP_ = ' + JSON.stringify(organizationLookup) + ';</script>' +
    REG_DYNAMIC_SCRIPT_ +
    REG_COMMITTEE_SCRIPT_ +
    REG_ORG_SCRIPT_ +
    REG_LAYOUT_TOGGLE_SCRIPT_;
}

/**
 * ด้าน/สาขา ตามตำแหน่งที่เลือก (2026-10-07 แก้ตาม requirement จริง — เดิมมี placeholder "-- เลือก --" เสมอแม้
 * เหลือตัวเลือกเดียว ผู้ใช้ต้องคลิกเลือกเองอยู่ดี) ตอนนี้แบ่ง 3 กรณีตามจำนวนตัวเลือกที่ตรงกับตำแหน่ง:
 *   0 ตัวเลือก -> ช่อง disabled โชว์ "-" (ค่าว่างคือค่าที่ถูกต้องอยู่แล้วสำหรับตำแหน่งที่ไม่มีด้าน/สาขาใน
 *     Master Data — ไม่ต้อง hidden input เสริม เพราะ blank คือค่าที่ต้องการจริงๆ ไม่ใช่ค่าที่ "หาย")
 *   1 ตัวเลือก  -> auto-select ทันที ไม่ใส่ placeholder เลย (ผู้ใช้ไม่ต้องคลิกซ้ำ) ยังเป็น <select> ธรรมดา
 *     (ไม่ disabled) เพื่อให้ค่าถูกส่งไปตอน submit แน่นอน (select ที่ disabled จะไม่ถูกส่งค่าตาม HTML spec —
 *     ถ้า disable ต้องมี hidden input คู่กันเสมอ เลยเลือกไม่ disable แทน ปลอดภัยกว่า ไม่มีจุดพลาด)
 *   >1 ตัวเลือก -> ปกติ มี placeholder "-- เลือกด้าน/สาขา --" ให้ผู้ใช้เลือกเอง เหมือนเดิม
 * เปลี่ยนตำแหน่งใหม่ = clear ค่าด้าน/สาขาเดิมทิ้งก่อนเสมอ แล้วคำนวณ 3 กรณีข้างบนใหม่ทันที (กันค่าตำแหน่งก่อน
 * หน้าค้าง) — data-position-code บน <option> ทั้งของ position select และ specialty select (ฝังมาจาก server)
 */
var REG_DYNAMIC_SCRIPT_ = '' +
  '<script>' +
  'document.addEventListener("DOMContentLoaded", function () {' +
  'var posSel = document.getElementById("reg-position");' +
  'var specSel = document.getElementById("reg-specialty");' +
  'if (!posSel || !specSel) return;' +
  'var allSpecOptions = Array.prototype.slice.call(specSel.options).filter(function (opt) { return opt.value; });' +
  'function getBranchesByPosition(posCode) {' +
  'return allSpecOptions.filter(function (opt) { return opt.dataset.positionCode === posCode; });' +
  '}' +
  'function onPositionChange() {' +
  'specSel.innerHTML = ""; specSel.disabled = false;' + // clear ค่าเดิมก่อนเสมอ กันค้างจากตำแหน่งก่อนหน้า
  'var posCode = (posSel.selectedOptions[0] || {}).dataset ? posSel.selectedOptions[0].dataset.positionCode : "";' +
  'var options = getBranchesByPosition(posCode);' +
  'if (options.length === 0) {' +
  'specSel.appendChild(new Option("-", "")); specSel.disabled = true;' +
  '} else if (options.length === 1) {' +
  'specSel.appendChild(options[0].cloneNode(true)); specSel.value = options[0].value;' +
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

/** auto-suggest คณะกรรมการที่รับผิดชอบ (ChairMaster) ตามตำแหน่ง+ด้าน/สาขาที่เลือก — อ่าน REG_COMMITTEE_LOOKUP_
 *  ที่ฝังไว้ก่อนหน้า (buildCommitteeLookupForRegisterForm_) ไม่มี AJAX ทำงานฝั่ง client ล้วน backend validate
 *  ซ้ำเสมอที่ registerNewWork_ (resolveCommitteeForRegistration_ — logic โหมดเดียวกันเป๊ะ) */
var REG_COMMITTEE_SCRIPT_ = '' +
  '<script>' +
  'document.addEventListener("DOMContentLoaded", function () {' +
  'var posSel = document.getElementById("reg-position");' +
  'var specSel = document.getElementById("reg-specialty");' +
  'var committeeField = document.getElementById("reg-committee-field");' +
  'var infoDiv = document.getElementById("reg-committee-info");' +
  'if (!posSel || !committeeField || !infoDiv || typeof REG_COMMITTEE_LOOKUP_ === "undefined") return;' +
  'function escC(s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }' +
  'function syncCommittee() {' +
  'var posName = posSel.options[posSel.selectedIndex] ? posSel.options[posSel.selectedIndex].text : "";' +
  'var entry = REG_COMMITTEE_LOOKUP_[posName];' +
  'if (!entry || !entry.committees.length) { committeeField.style.display = "none"; infoDiv.innerHTML = ""; return; }' +
  'committeeField.style.display = "";' +
  'if (entry.mode === "manual") {' +
  'var html = `<select class="input" name="reg_committee_code" required><option value="">-- เลือกคณะกรรมการ --</option>`;' +
  'entry.committees.forEach(function (c) {' +
  'html += `<option value="` + escC(c.committee_code) + `">ประธาน: ` + escC(c.chair_name) + ` (` + escC(c.chair_org) + `)</option>`;' +
  '});' +
  'infoDiv.innerHTML = html + `<p class="hint">ตำแหน่งนี้มีหลายคณะ ไม่สามารถจับคู่อัตโนมัติได้ กรุณาเลือกเอง</p>`;' +
  'return;' +
  '}' +
  'var match = entry.mode === "single" ? entry.committees[0] :' +
  'entry.committees.filter(function (c) { return c.key === (specSel ? specSel.value : ""); })[0];' +
  'infoDiv.innerHTML = match' +
  '? `<p class="hint">ประธาน: ` + escC(match.chair_name) + ` (` + escC(match.chair_org) + `)</p>`' +
  ': `<p class="hint">เลือก "ด้าน/สาขา" เพื่อดูคณะกรรมการที่รับผิดชอบ</p>`;' +
  '}' +
  'posSel.addEventListener("change", syncCommittee);' +
  'if (specSel) specSel.addEventListener("change", syncCommittee);' +
  'syncCommittee();' +
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
 */
var REG_ORG_SCRIPT_ = '' +
  '<script>' +
  'document.addEventListener("DOMContentLoaded", function () {' +
  'var typeSel = document.getElementById("reg-org-type");' +
  'var nameInput = document.getElementById("reg-org-name");' +
  'var suggestBox = document.getElementById("reg-org-suggest");' +
  'var idField = document.getElementById("reg-org-id");' +
  'var provinceField = document.getElementById("reg-org-province");' +
  'if (!typeSel || !nameInput || !suggestBox) return;' +
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
  'typeSel.addEventListener("change", function () {' +
  'nameInput.value = ""; clearSelection(); closeSuggest();' +
  'if (typeSel.value) { nameInput.disabled = false; nameInput.placeholder = "พิมพ์ชื่อหน่วยงาน (อย่างน้อย 2 ตัวอักษร)..."; }' +
  'else { nameInput.disabled = true; nameInput.placeholder = "กรุณาเลือกประเภทหน่วยงานก่อน"; }' +
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
  '});' +
  '</script>';

/** ซ่อน/โชว์ช่อง "ระบุคำนำหน้าชื่อ" เฉพาะตอนเลือก "อื่น ๆ" (2026-09-24 — คนละช่อง จาก REG_DYNAMIC_SCRIPT_/
 *  REG_COMMITTEE_SCRIPT_ เดิม กันกระทบ logic ตำแหน่ง/คณะกรรมการที่มีอยู่แล้ว — 2026-10-07 ตัด binding ของ
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

/** หน้าสำเร็จหลังลงทะเบียน — แสดงเลขติดตาม + QR ให้พิมพ์แปะเอกสาร */
function renderRegisterSuccessBody_(result, baseUrl) {
  return '' +
    '<div class="success-card">' +
    '<p class="success-title">ลงทะเบียนสำเร็จ</p>' +
    '<p class="tracking-big">' + escapeHtml_(result.tracking_no) + '</p>' +
    '<img class="qr-img" src="' + escapeHtml_(result.qr_image_url) + '" alt="QR code เอกสาร ' + escapeHtml_(result.tracking_no) + '">' +
    '<p class="hint">พิมพ์/แปะ QR นี้ไว้บนเอกสาร ใช้สแกนรับงานที่สถานีถัดไป</p>' +
    '<p><a target="_top" href="' + baseUrl + '?page=register">+ ลงทะเบียนรายการถัดไป</a> &nbsp;|&nbsp; ' +
    '<a target="_top" href="' + baseUrl + '?page=dashboard">กลับหน้าแรก</a></p>' +
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
  '.bottomnav{position:fixed;bottom:0;left:0;right:0;display:flex;background:#fff;border-top:1px solid var(--border);z-index:5;}' +
  '.navitem{flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;padding:9px 0 8px;color:var(--muted);text-decoration:none;font-size:.72rem;}' +
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
  '.registry-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px;margin-bottom:12px;}' +
  '.registry-tile{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:10px 12px;text-decoration:none;text-align:center;}' +
  '.registry-tile-count{display:block;font-size:1.3rem;font-weight:700;color:var(--navy);}' +
  '.registry-tile-label{display:block;font-size:.72rem;color:var(--muted);margin-top:2px;}' +
  '.registry-tile.active{border-color:var(--teal);background:#e8f6f6;}' +
  '.registry-tile.active .registry-tile-count{color:var(--teal);}' +
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
  '.registry-view-toggle{display:flex;gap:8px;margin-bottom:12px;}' +
  '.registry-view-btn{padding:7px 16px;border-radius:999px;border:1px solid var(--border);background:#fff;color:var(--muted);text-decoration:none;font-size:.82rem;font-weight:600;}' +
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
  '.owner-tl-summary-sub{display:block;font-size:.72rem;font-weight:400;color:var(--muted);margin-top:2px;}';
