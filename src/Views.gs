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

/** ครอบหน้าเจ้าหน้าที่ด้วยเชลล์เต็มรูปแบบ: header ผู้ใช้ + เนื้อหา + bottom-nav
 *  baseUrl: URL เต็มของ Web App (จาก getWebAppUrl_()) — ลิงก์ภายในทุกอันต้อง absolute + target="_top"
 *  กัน relative href พังใน iframe sandbox ของ HtmlService (ดูคอมเมนต์ getWebAppUrl_ ใน Utils.gs) */
function renderStaffPage_(title, bodyHtml, user, activePage, baseUrl) {
  var navHtml = NAV_ITEMS_.map(function (item) {
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
        var label = ACTION_LABELS_[h.action] || h.action;
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
    '</div>' +
    '<section class="metric-card"><div class="metric-head"><span class="metric-label">ประวัติการดำเนินการ</span></div>' + timelineHtml + '</section>' +
    '<p><a target="_top" href="' + baseUrl + '?page=search">&larr; กลับหน้าค้นหา</a></p>';
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
    '<div class="field"><label>ภาพหน้าปกผลงาน (ถ้ามี — ใช้ OCR ช่วยตรวจสอบ)</label><input class="input" type="file" name="reg_cover_image" accept="image/*"></div>' +
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
    (result.ocr_low_confidence
      ? '<p class="ocr-warn">OCR ไม่มั่นใจในภาพที่อัปโหลด — โปรดตรวจสอบข้อมูลที่บันทึกไว้อีกครั้งในภายหลัง</p>'
      : '') +
    '<p class="hint">พิมพ์/แปะ QR นี้ไว้บนเอกสาร ใช้สแกนรับงานที่สถานีถัดไป</p>' +
    '<p><a target="_top" href="' + baseUrl + '?page=register">+ ลงทะเบียนรายการถัดไป</a> &nbsp;|&nbsp; ' +
    '<a target="_top" href="' + baseUrl + '?page=dashboard">กลับหน้าแรก</a></p>' +
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
  '.content{max-width:640px;margin:0 auto;padding:14px 12px 12px;}' +
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
  '.success-card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:24px;text-align:center;}' +
  '.success-title{color:var(--done);font-weight:700;font-size:1.1rem;margin:0 0 8px;}' +
  '.tracking-big{font-size:1.4rem;font-weight:700;color:var(--navy);font-variant-numeric:tabular-nums;margin:0 0 14px;}' +
  '.qr-img{width:200px;height:200px;border:1px solid var(--border);border-radius:8px;}' +
  '.ocr-warn{color:var(--revision);font-size:.82rem;margin-top:10px;}' +
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
  '.tl-note{font-size:.82rem;margin-top:3px;}';
