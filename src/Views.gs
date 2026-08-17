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
  { page: 'search', label: 'ค้นหา', icon: '⌕' },
];

var METRIC_SECTIONS_ = [
  { key: 'pendingReceive', label: 'งานรอรับ', hint: 'สแกน QR แล้วกด "รับเอกสารและเริ่มดำเนินการ"' },
  { key: 'inProgress', label: 'กำลังดำเนินการ', hint: 'งานที่หน่วยงานนี้เป็นเจ้าของอยู่ในขณะนี้' },
  { key: 'awaitingDestination', label: 'ส่งต่อแล้ว รอปลายทางรับ', hint: 'ส่งต่อไปแล้ว ยังไม่มีใครสแกนรับที่ปลายทาง' },
  { key: 'nearDue', label: 'ใกล้ครบกำหนด', hint: 'อยู่ในสถานีเกิน 80% ของเวลามาตรฐาน' },
  { key: 'overdue', label: 'เกินกำหนด', hint: 'อยู่ในสถานีเกินเวลามาตรฐานแล้ว' },
  { key: 'returnedForRevision', label: 'ส่งกลับแก้ไข', hint: 'รอเจ้าของผลงานส่งฉบับแก้ไขกลับมา' },
];

/** ครอบหน้าเจ้าหน้าที่ด้วยเชลล์เต็มรูปแบบ: header ผู้ใช้ + เนื้อหา + bottom-nav */
function renderStaffPage_(title, bodyHtml, user, activePage) {
  var navHtml = NAV_ITEMS_.map(function (item) {
    var isActive = item.page === activePage;
    return '<a class="navitem' + (isActive ? ' active' : '') + '" href="?page=' + item.page + '">' +
      '<span class="navicon">' + item.icon + '</span><span>' + escapeHtml_(item.label) + '</span></a>';
  }).join('');

  var html = '' +
    '<!doctype html><html><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">' +
    '<title>' + escapeHtml_(title) + '</title>' +
    '<style>' + STAFF_CSS_ + '</style>' +
    '</head><body>' +
    '<header class="topbar">' +
    '<div class="topbar-title">' + escapeHtml_(title) + '</div>' +
    '<div class="topbar-user">' + escapeHtml_(user.display_name || user.user_email) +
    '<span class="orgtag">' + escapeHtml_(user.organization) + '</span></div>' +
    '</header>' +
    '<main class="content">' + bodyHtml + '</main>' +
    '<a class="fab" href="?page=register" title="รับเอกสารใหม่">+</a>' +
    '<nav class="bottomnav">' + navHtml + '</nav>' +
    '</body></html>';

  return HtmlService.createHtmlOutput(html)
    .setTitle(title)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** เนื้อหาหน้า Dashboard — การ์ดสรุป 6 กลุ่มตามข้อ 3.3 ต่อหน่วยงานของผู้ Login */
function renderDashboardBody_(user, metrics) {
  var sections = METRIC_SECTIONS_.map(function (sec) {
    var items = metrics[sec.key] || [];
    return '' +
      '<section class="metric-card">' +
      '<div class="metric-head"><span class="metric-label">' + escapeHtml_(sec.label) + '</span>' +
      '<span class="metric-count">' + items.length + '</span></div>' +
      '<div class="metric-hint">' + escapeHtml_(sec.hint) + '</div>' +
      (items.length ? renderWorkList_(items) : '<div class="empty">ไม่มีรายการ</div>') +
      '</section>';
  }).join('');

  return '' +
    '<p class="scope-note">แสดงงานของหน่วยงาน: <b>' + escapeHtml_(user.organization) + '</b></p>' +
    sections;
}

/** รายการงานแบบย่อ (ใช้ในการ์ด Dashboard) — tracking_no, ชื่อผลงาน, ป้ายสถานะ */
function renderWorkList_(works) {
  var rows = works.slice(0, 5).map(function (w) {
    var cls = STATUS_PILL_CLASS_[w.current_status_public] || 'pending';
    var label = PUBLIC_STATUS_LABELS[w.current_status_public] || w.current_status_public || '-';
    return '' +
      '<div class="work-row">' +
      '<div class="work-main"><span class="tracking">' + escapeHtml_(w.tracking_no) + '</span>' +
      '<span class="worktitle">' + escapeHtml_(w.work_title || '-') + '</span></div>' +
      '<span class="pill pill-' + cls + '">' + escapeHtml_(label) + '</span>' +
      '</div>';
  }).join('');
  var more = works.length > 5 ? '<div class="empty">และอีก ' + (works.length - 5) + ' รายการ</div>' : '';
  return rows + more;
}

/** หน้าที่ยังไม่พัฒนา (สแกน/ค้นหา/รับเอกสารใหม่) — stub รอ Part ถัดไป */
function renderStubBody_(message) {
  return '<div class="stub"><p>' + escapeHtml_(message) + '</p>' +
    '<p><a href="?page=dashboard">&larr; กลับหน้าแรก</a></p></div>';
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
  '.content{max-width:640px;margin:0 auto;padding:14px 12px 12px;}' +
  '.scope-note{font-size:.85rem;color:var(--muted);margin:2px 4px 12px;}' +
  '.metric-card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:14px 16px;margin-bottom:12px;box-shadow:0 1px 2px rgba(20,40,55,.06);}' +
  '.metric-head{display:flex;justify-content:space-between;align-items:baseline;}' +
  '.metric-label{font-weight:700;color:var(--navy);}' +
  '.metric-count{font-size:1.3rem;font-weight:700;color:var(--teal);font-variant-numeric:tabular-nums;}' +
  '.metric-hint{font-size:.78rem;color:var(--muted);margin:2px 0 10px;}' +
  '.work-row{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:7px 0;border-top:1px solid var(--border);}' +
  '.work-row:first-child{border-top:none;}' +
  '.work-main{display:flex;flex-direction:column;min-width:0;}' +
  '.tracking{font-size:.72rem;color:var(--muted);font-variant-numeric:tabular-nums;}' +
  '.worktitle{font-size:.88rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:60vw;}' +
  '.pill{font-size:.72rem;padding:3px 9px;border-radius:999px;color:#fff;white-space:nowrap;background:var(--pending);}' +
  '.pill-pending{background:var(--pending);}.pill-active{background:var(--active);}' +
  '.pill-revision{background:var(--revision);}.pill-danger{background:var(--danger);}.pill-done{background:var(--done);}' +
  '.empty{font-size:.8rem;color:var(--muted);padding:6px 0;}' +
  '.stub{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:20px;text-align:center;}' +
  '.fab{position:fixed;right:18px;bottom:88px;width:52px;height:52px;border-radius:50%;background:var(--teal);color:#fff;' +
  'font-size:1.6rem;display:flex;align-items:center;justify-content:center;text-decoration:none;box-shadow:0 3px 8px rgba(20,40,55,.3);z-index:6;}' +
  '.bottomnav{position:fixed;bottom:0;left:0;right:0;display:flex;background:#fff;border-top:1px solid var(--border);z-index:5;}' +
  '.navitem{flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;padding:9px 0 8px;color:var(--muted);text-decoration:none;font-size:.72rem;}' +
  '.navitem.active{color:var(--teal);font-weight:700;}' +
  '.navicon{font-size:1.2rem;}';
