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
  'if (btn && !btn.disabled) { btn.textContent = "กำลังดำเนินการ..."; btn.disabled = true; btn.style.opacity = "0.6"; }' +
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
    '<style>' + STAFF_CSS_ + '</style>' +
    '</head><body>' +
    '<header class="topbar">' +
    '<div class="topbar-title">' + escapeHtml_(title) + '</div>' +
    '<div class="topbar-user">' + escapeHtml_(user.display_name || user.user_email) +
    '<span class="orgtag">' + escapeHtml_(user.organization) + '</span></div>' +
    '</header>' +
    '<main class="content">' + bodyHtml + '</main>' +
    '<a class="fab" target="_top" href="' + baseUrl + '?page=register" title="รับเอกสารใหม่">+</a>' +
    '<nav class="bottomnav">' + navHtml + '</nav>' +
    LOADING_FEEDBACK_SCRIPT_ +
    '</body></html>';

  return HtmlService.createHtmlOutput(html)
    .setTitle(title)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** เนื้อหาหน้า Dashboard — การ์ดสรุป 6 กลุ่มตามข้อ 3.3 ต่อหน่วยงานของผู้ Login */
function renderDashboardBody_(user, metrics, baseUrl) {
  var sections = METRIC_SECTIONS_.map(function (sec) {
    var items = metrics[sec.key] || [];
    return '' +
      '<section class="metric-card">' +
      '<div class="metric-head"><span class="metric-label">' + escapeHtml_(sec.label) + '</span>' +
      '<span class="metric-count">' + items.length + '</span></div>' +
      '<div class="metric-hint">' + escapeHtml_(sec.hint) + '</div>' +
      (items.length ? renderWorkList_(items, false, baseUrl) : '<div class="empty">ไม่มีรายการ</div>') +
      '</section>';
  }).join('');

  return '' +
    '<p class="scope-note">แสดงงานของหน่วยงาน: <b>' + escapeHtml_(user.organization) + '</b></p>' +
    sections;
}

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

  var stateOptions = '<option value="">ทุก state</option>' + allStates.map(function (s) {
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
    '<div class="field"><label>State</label><select class="input" name="state">' + stateOptions + '</select></div>' +
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

  var tableHtml = pageResult.items.length
    ? '<div class="table-scroll"><table class="admin-table"><thead><tr>' +
      '<th>เลขทะเบียน</th><th>ชื่อผลงาน</th><th>หน่วยงาน</th><th>เจ้าของผลงาน</th>' +
      '<th>State ปัจจุบัน</th><th>ผู้รับผิดชอบ</th><th>วันที่อัปเดตล่าสุด</th><th>จัดการ</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>'
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

  return flashHtml + tilesHtml + filterFormHtml +
    '<p class="hint" style="margin:0 0 10px">คลิก "ดูรายละเอียด/จัดการ" — เห็นได้ทุกรายการ แก้สถานะได้เฉพาะที่หน่วยงานตนรับผิดชอบ ณ state ปัจจุบันเท่านั้น</p>' +
    '<section class="metric-card">' + tableHtml + pagerHtml + '</section>';
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
function renderSearchBody_(org, query, results, baseUrl) {
  var q = escapeHtml_(query || '');
  var listHtml = results.length
    ? renderWorkList_(results, true, baseUrl)
    : '<div class="empty">' + (query ? 'ไม่พบรายการที่ตรงกับ "' + q + '"' : 'ไม่มีงานของหน่วยงานนี้ในขณะนี้') + '</div>';

  return '' +
    '<form method="get" target="_top" action="' + baseUrl + '" class="search-form">' +
    '<input type="hidden" name="page" value="search">' +
    '<input class="input" type="text" name="q" value="' + q + '" placeholder="เลขติดตาม / ชื่อ-สกุล / ชื่อผลงาน">' +
    '<button class="btn-primary" type="submit">ค้นหา</button>' +
    '</form>' +
    '<p class="scope-note">' + (query ? 'ผลการค้นหาทุกหน่วยงาน' : 'งานของหน่วยงาน: <b>' + escapeHtml_(org) + '</b>') + '</p>' +
    '<section class="metric-card">' + listHtml + '</section>';
}

/** หน้ารายละเอียดงาน — ข้อมูลเต็ม + Timeline จาก StatusHistory (อ่านอย่างเดียว ปุ่มการกระทำจะเพิ่มใน Part ถัดไป) */
function renderWorkDetailBody_(work, history, stationsMap, baseUrl) {
  var cls = STATUS_PILL_CLASS_[work.current_status_public] || 'pending';
  var statusLabel = PUBLIC_STATUS_LABELS[work.current_status_public] || work.current_status_public || '-';
  var station = stationsMap[work.current_station_key];

  var fields = [
    ['ชื่อ-สกุล', (work.title_name || '') + (work.first_name || '') + ' ' + (work.last_name || '')],
    ['ตำแหน่ง', work.position],
    ['ระดับ', (work.current_level || '-') + ' → ' + (work.requested_level || '-')],
    ['ประเภทผลงาน', work.work_type],
    ['ชื่อผลงาน', work.work_title],
    ['หน่วยงานต้นสังกัด', work.org_from],
    ['เลขบัตรประชาชน', 'xxxxxxxxx' + (work.citizen_id_last4 || '----')],
    ['เบอร์โทร', work.phone || '-'],
    ['อีเมล', work.email || '-'],
    ['สถานีปัจจุบัน', station ? station.station_name : work.current_station_key],
    ['หน่วยงานที่รับผิดชอบ', work.handoff_pending ? '(รอปลายทางรับเอกสาร)' : (work.current_owner_org || '-')],
    ['ผู้ดำเนินการล่าสุด', work.current_handler_name || '-'],
    ['ขั้นตอนถัดไป', work.next_step_text || '-'],
  ];

  var fieldsHtml = fields.map(function (f) {
    return '<div class="detail-row"><span class="detail-label">' + escapeHtml_(f[0]) + '</span>' +
      '<span class="detail-value">' + escapeHtml_(f[1] || '-') + '</span></div>';
  }).join('');

  var coverHtml = work.cover_image_url
    ? '<p><a href="' + escapeHtml_(work.cover_image_url) + '" target="_blank" rel="noopener">ดูภาพหน้าปกที่อัปโหลด</a></p>'
    : '';

  var timelineHtml = history.length
    ? '<ul class="timeline">' + history.map(function (h) {
        var label = h.action === 'transition'
          ? (stationsMap[h.to_station] ? stationsMap[h.to_station].station_name : h.to_station)
          : (ACTION_LABELS_[h.action] || h.action);
        return '<li class="tl-item">' +
          '<div class="tl-head"><b>' + escapeHtml_(label) + '</b><span class="tl-date">' + formatDateTh_(h.action_date) + '</span></div>' +
          '<div class="tl-meta">' + escapeHtml_(h.action_by_org || '-') + (h.action_by ? ' (' + escapeHtml_(h.action_by) + ')' : '') + '</div>' +
          (h.note ? '<div class="tl-note">' + escapeHtml_(h.note) + '</div>' : '') +
          (h.revision_reasons ? '<div class="tl-note">เหตุผล: ' + escapeHtml_(h.revision_reasons) + '</div>' : '') +
          '</li>';
      }).join('') + '</ul>'
    : '<div class="empty">ยังไม่มีประวัติ</div>';

  return '' +
    '<div class="detail-card">' +
    '<div class="detail-head"><span class="tracking-big">' + escapeHtml_(work.tracking_no) + '</span>' +
    '<span class="pill pill-' + cls + '">' + escapeHtml_(statusLabel) + '</span></div>' +
    fieldsHtml + coverHtml +
    '<p><a target="_top" href="' + baseUrl + '?page=qrprint&id=' + encodeURIComponent(work.work_id) + '">พิมพ์ QR ใหม่</a></p>' +
    '</div>' +
    '<section class="metric-card"><div class="metric-head"><span class="metric-label">ประวัติการดำเนินการ</span></div>' + timelineHtml + '</section>' +
    '<p><a target="_top" href="' + baseUrl + '?page=search">&larr; กลับหน้าค้นหา</a></p>';
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

/** ฟอร์มตรวจสอบสถานะสาธารณะ — เลขติดตาม + เลขบัตรประชาชน 4 ตัวท้าย, POST เสมอ (กันเลขบัตรหลุดใน URL/ประวัติเบราว์เซอร์) */
function renderPublicTrackFormBody_(baseUrl, sessionToken, errors, prevValues) {
  prevValues = prevValues || {};
  var errorHtml = (errors && errors.length)
    ? '<div class="error-banner"><ul>' + errors.map(function (m) { return '<li>' + escapeHtml_(m) + '</li>'; }).join('') + '</ul></div>'
    : '';
  return '' + errorHtml +
    '<div class="detail-card">' +
    '<p>กรอกเลขติดตามเอกสารและเลขบัตรประชาชน 4 ตัวท้าย เพื่อตรวจสอบสถานะผลงานวิชาการ</p>' +
    '<form method="post" target="_top" action="' + baseUrl + '" class="reg-form" style="border:none;padding:0;">' +
    '<input type="hidden" name="form_action" value="track_status">' +
    '<input type="hidden" name="session_token" value="' + escapeHtml_(sessionToken) + '">' +
    '<div class="field"><label>เลขติดตามเอกสาร</label>' +
    '<input class="input" name="tracking_no" value="' + escapeHtml_(prevValues.tracking_no || '') + '" placeholder="เช่น อวช11-2569-00218"></div>' +
    '<div class="field"><label>เลขบัตรประชาชน 4 ตัวท้าย</label>' +
    '<input class="input" name="citizen_id_last4" maxlength="4" inputmode="numeric" pattern="[0-9]{4}"></div>' +
    '<button class="btn-primary" type="submit">ตรวจสอบสถานะ</button>' +
    '</form>' +
    '<div class="qr-scan-divider"><span>หรือ</span></div>' +
    '<input type="file" accept="image/*" capture="environment" id="qr-photo-input" style="display:none">' +
    '<button type="button" id="qr-photo-btn" class="btn-action btn-action-secondary" style="display:none">' +
    'ถ่ายรูป / เลือกรูป QR เพื่อค้นหา</button>' +
    '<p id="qr-photo-msg" class="hint" style="display:none"></p>' +
    '</div>' +
    QR_PHOTO_SCAN_SCRIPT_;
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
  'msg.textContent = "พบ QR แล้ว กำลังเปิดสถานะเอกสาร...";' +
  'var base = location.href.split("?")[0];' +
  'window.top.location.href = base + "?t=" + encodeURIComponent(m[1]);' +
  '};' +
  'img.onerror = function () { URL.revokeObjectURL(objectUrl); msg.textContent = "เปิดไฟล์รูปนี้ไม่สำเร็จ กรุณาลองใหม่ หรือกรอกเลขติดตามด้วยตนเองด้านบน"; };' +
  'img.src = objectUrl;' +
  '});' +
  '});' +
  '</script>';

/** ผลตรวจสอบสถานะสาธารณะ — เฉพาะฟิลด์ที่เปิดเผยได้ (ไม่มีชื่อ-สกุล/ผู้ดำเนินการ/timeline ภายใน)
 *  ถ้าสถานะ = need_revision แสดงกล่อง "รายการที่ต้องแก้ไข" (revision detail) แยกจากการ์ดสถานะหลัก */
function renderPublicResultBody_(work, revisionInfo, steps, baseUrl) {
  var cls = STATUS_PILL_CLASS_[work.current_status_public] || 'pending';
  var label = PUBLIC_STATUS_LABELS[work.current_status_public] || work.current_status_public || '-';
  var maskedName = maskNameForPublic_(work.title_name, work.first_name, work.last_name);

  var revisionHtml = '';
  if (work.current_status_public === 'need_revision' && revisionInfo) {
    revisionHtml = '' +
      '<div class="revision-box">' +
      '<p class="revision-title">รายการที่ต้องแก้ไข</p>' +
      '<p>' + escapeHtml_(revisionInfo.reasons || '-') + '</p>' +
      (revisionInfo.due_date ? '<p>กรุณาส่งฉบับแก้ไขกลับภายใน <b>' + escapeHtml_(revisionInfo.due_date) + '</b></p>' : '') +
      (revisionInfo.note ? '<p class="tl-note">หมายเหตุ: ' + escapeHtml_(revisionInfo.note) + '</p>' : '') +
      '</div>';
  }

  var stepperHtml = '';
  if (steps) {
    stepperHtml = '<div class="pub-stepper">' + steps.map(function (s) {
      var icon = s.state === 'done' ? '✓' : (s.state === 'current' ? '●' : '');
      return '<div class="pub-step pub-step-' + s.state + '">' +
        '<span class="pub-step-icon">' + icon + '</span><span class="pub-step-label">' + escapeHtml_(s.label) + '</span></div>';
    }).join('') + '</div>';
  }

  return '' +
    '<div class="detail-card">' +
    '<div class="detail-head"><span class="tracking-big">' + escapeHtml_(work.tracking_no) + '</span>' +
    '<span class="pill pill-' + cls + '">' + escapeHtml_(label) + '</span></div>' +
    '<div class="detail-row"><span class="detail-label">เจ้าของผลงาน</span><span class="detail-value">' + escapeHtml_(maskedName) + '</span></div>' +
    '<div class="detail-row"><span class="detail-label">ชื่อผลงาน</span><span class="detail-value">' + escapeHtml_(work.work_title || '-') + '</span></div>' +
    '<div class="detail-row"><span class="detail-label">วันที่รับเอกสาร</span><span class="detail-value">' + formatDateTh_(work.received_date) + '</span></div>' +
    '<div class="detail-row"><span class="detail-label">อัปเดตล่าสุด</span><span class="detail-value">' + formatDateTh_(work.updated_at) + '</span></div>' +
    (work.next_step_text ? '<div class="detail-row"><span class="detail-label">ขั้นตอนถัดไป</span><span class="detail-value">' + escapeHtml_(work.next_step_text) + '</span></div>' : '') +
    '</div>' +
    stepperHtml +
    revisionHtml +
    '<p><a target="_top" href="' + baseUrl + '">&larr; ตรวจสอบรายการอื่น</a></p>';
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

/** การ์ดสรุปงาน + ปุ่มเปลี่ยนสถานะหลัก (จาก computeEligibleTransitions_) + ปุ่ม utility action เสริม (more_info/terminated/closed/reassigned) */
function renderScanWorkBody_(work, station, eligible, eligibleTransitions, baseUrl, token, errors) {
  var errorHtml = (errors && errors.length)
    ? '<div class="error-banner"><ul>' + errors.map(function (m) { return '<li>' + escapeHtml_(m) + '</li>'; }).join('') + '</ul></div>'
    : '';
  var cls = STATUS_PILL_CLASS_[work.current_status_public] || 'pending';
  var statusLabel = PUBLIC_STATUS_LABELS[work.current_status_public] || work.current_status_public || '-';

  var summaryHtml = '' +
    '<div class="detail-card">' +
    '<div class="detail-head"><span class="tracking-big">' + escapeHtml_(work.tracking_no) + '</span>' +
    '<span class="pill pill-' + cls + '">' + escapeHtml_(statusLabel) + '</span></div>' +
    '<div class="detail-row"><span class="detail-label">ชื่อผลงาน</span><span class="detail-value">' + escapeHtml_(work.work_title || '-') + '</span></div>' +
    '<div class="detail-row"><span class="detail-label">เจ้าของผลงาน</span><span class="detail-value">' +
    escapeHtml_((work.title_name || '') + (work.first_name || '') + ' ' + (work.last_name || '')) + '</span></div>' +
    '<div class="detail-row"><span class="detail-label">สถานีปัจจุบัน</span><span class="detail-value">' +
    escapeHtml_(station ? station.station_name : work.current_station_key) + '</span></div>' +
    '<div class="detail-row"><span class="detail-label">ผู้รับผิดชอบ</span><span class="detail-value">' +
    escapeHtml_(work.handoff_pending ? '(รอสแกนรับเอกสาร)' : (work.current_owner_org || '-')) + '</span></div>' +
    '</div>';

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

  var buttonsHtml = (transitionButtonsHtml || utilityButtonsHtml)
    ? transitionButtonsHtml + utilityButtonsHtml
    : '<div class="empty">ไม่มีการกระทำที่ทำได้กับงานนี้ในขณะนี้ (อาจไม่ใช่หน่วยงานที่รับผิดชอบ หรืองานสิ้นสุดแล้ว)</div>';

  return errorHtml + summaryHtml + buttonsHtml +
    '<p><a target="_top" href="' + baseUrl + '?page=detail&id=' + encodeURIComponent(work.work_id) + '">ดูรายละเอียด/ประวัติทั้งหมด &rarr;</a></p>' +
    '<p><a target="_top" href="' + baseUrl + '?page=scan">&larr; สแกนรายการอื่น</a></p>';
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
function renderRegisterFormBody_(ss, values, errors, baseUrl) {
  values = values || {};
  var v = function (key) { return escapeHtml_(values[key] || ''); };

  var errorHtml = (errors && errors.length)
    ? '<div class="error-banner"><b>กรุณาแก้ไข:</b><ul>' +
      errors.map(function (e) { return '<li>' + escapeHtml_(e) + '</li>'; }).join('') + '</ul></div>'
    : '';

  var levelOptions = getSettingList_(ss, 'career_level_options', ['ปฏิบัติการ', 'ชำนาญการ', 'ชำนาญการพิเศษ', 'เชี่ยวชาญ', 'ทรงคุณวุฒิ']);
  var typeOptions = getSettingList_(ss, 'work_type_options', ['อื่น ๆ']);

  function selectHtml(name, options, current) {
    return '<select class="input" name="' + name + '">' +
      options.map(function (opt) {
        var sel = opt === current ? ' selected' : '';
        return '<option' + sel + '>' + escapeHtml_(opt) + '</option>';
      }).join('') + '</select>';
  }

  return '' +
    errorHtml +
    '<form method="post" target="_top" action="' + baseUrl + '" enctype="multipart/form-data" class="reg-form">' +
    '<input type="hidden" name="form_action" value="register_work">' +
    '<div class="field"><label>คำนำหน้าชื่อ</label><input class="input" name="reg_title_name" value="' + v('title_name') + '" placeholder="นาย / นาง / นางสาว"></div>' +
    '<div class="field-row">' +
    '<div class="field"><label>ชื่อ</label><input class="input" name="reg_first_name" value="' + v('first_name') + '"></div>' +
    '<div class="field"><label>นามสกุล</label><input class="input" name="reg_last_name" value="' + v('last_name') + '"></div>' +
    '</div>' +
    '<div class="field"><label>ตำแหน่ง</label><input class="input" name="reg_position" value="' + v('position') + '"></div>' +
    '<div class="field-row">' +
    '<div class="field"><label>ระดับปัจจุบัน</label>' + selectHtml('reg_current_level', levelOptions, values.current_level) + '</div>' +
    '<div class="field"><label>ระดับที่ขอ</label>' + selectHtml('reg_requested_level', levelOptions, values.requested_level) + '</div>' +
    '</div>' +
    '<div class="field"><label>ประเภทผลงาน</label>' + selectHtml('reg_work_type', typeOptions, values.work_type) + '</div>' +
    '<div class="field"><label>ถ้าเลือก "อื่น ๆ" ข้างต้น ระบุประเภทผลงาน</label><input class="input" name="reg_work_type_other" placeholder="ระบุประเภทผลงาน (ใช้เฉพาะกรณีเลือกอื่น ๆ)"></div>' +
    '<div class="field"><label>ชื่อผลงาน</label><textarea class="input" name="reg_work_title" rows="2">' + v('work_title') + '</textarea></div>' +
    '<div class="field"><label>หน่วยงานต้นสังกัด</label><input class="input" name="reg_org_from" value="' + v('org_from') + '"></div>' +
    '<div class="field"><label>เลขบัตรประชาชน (13 หลัก)</label><input class="input" name="reg_citizen_id" value="' + v('citizen_id') + '" maxlength="13" inputmode="numeric" pattern="[0-9]{13}"></div>' +
    '<div class="field-row">' +
    '<div class="field"><label>เบอร์โทร (ถ้ามี)</label><input class="input" name="reg_phone" value="' + v('phone') + '"></div>' +
    '<div class="field"><label>อีเมล (ถ้ามี)</label><input class="input" name="reg_email" value="' + v('email') + '"></div>' +
    '</div>' +
    '<div class="field"><label>ภาพหน้าปกผลงาน (ถ้ามี)</label>' +
    '<input class="input" type="file" name="reg_cover_image" accept="image/*" id="reg-cover-input">' +
    '</div>' +
    '<button class="btn-primary" type="submit">บันทึกและออกเลขติดตาม</button>' +
    '</form>';
}

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

/** หน้ารายงาน CSV — ลิงก์ดาวน์โหลดตรง (GET, Admin เท่านั้น ตรวจซ้ำที่ renderAdminRoute_) */
function renderAdminReportBody_(baseUrl) {
  return '' + renderAdminTabs_('report', baseUrl) +
    '<div class="detail-card">' +
    '<p>ดาวน์โหลดข้อมูลเป็นไฟล์ CSV (เปิดด้วย Excel/Google Sheets)</p>' +
    '<p><a target="_top" class="btn-action btn-action-secondary" href="' + baseUrl + '?page=admin&tab=report&format=csv&type=works">ดาวน์โหลดรายการงานทั้งหมด (CSV)</a></p>' +
    '<p><a target="_top" class="btn-action btn-action-secondary" href="' + baseUrl + '?page=admin&tab=report&format=csv&type=audit">ดาวน์โหลด Audit Log (CSV)</a></p>' +
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
  '.work-row{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:7px 0;border-top:1px solid var(--border);text-decoration:none;color:inherit;cursor:pointer;}' +
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
  '.navicon{font-size:1.2rem;}' +
  '.reg-form{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:16px;}' +
  '.field{margin-bottom:12px;display:flex;flex-direction:column;gap:4px;}' +
  '.field-row{display:flex;gap:10px;}.field-row .field{flex:1;}' +
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
  '.cell-danger{color:var(--danger);font-weight:700;}';

var PUBLIC_CSS_ = '' +
  '.public-body{padding-bottom:24px;}' +
  '.revision-box{background:#fdf6e3;border:1px solid var(--revision);border-radius:12px;padding:14px 16px;margin-bottom:12px;}' +
  '.revision-title{color:var(--revision);font-weight:700;margin:0 0 6px;}' +
  '.pub-stepper{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:16px 18px;margin-bottom:12px;}' +
  '.pub-step{display:flex;align-items:center;gap:12px;padding:6px 0;position:relative;}' +
  '.pub-step:not(:last-child){padding-bottom:20px;}' +
  '.pub-step:not(:last-child)::before{content:"";position:absolute;left:11px;top:26px;bottom:-4px;width:2px;background:var(--border);}' +
  '.pub-step-icon{flex-shrink:0;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;' +
  'font-size:.8rem;font-weight:700;background:#fff;border:2px solid var(--border);color:var(--muted);z-index:1;}' +
  '.pub-step-label{font-size:.88rem;color:var(--muted);}' +
  '.pub-step-done .pub-step-icon{background:var(--teal);border-color:var(--teal);color:#fff;}' +
  '.pub-step-done .pub-step-label{color:var(--text);}' +
  '.pub-step-done:not(:last-child)::before{background:var(--teal);}' +
  '.pub-step-current .pub-step-icon{background:var(--navy);border-color:var(--navy);color:#fff;}' +
  '.pub-step-current .pub-step-label{color:var(--navy);font-weight:700;}' +
  '.qr-scan-divider{display:flex;align-items:center;gap:10px;margin:14px 0;color:var(--muted);font-size:.8rem;}' +
  '.qr-scan-divider::before,.qr-scan-divider::after{content:"";flex:1;height:1px;background:var(--border);}';
