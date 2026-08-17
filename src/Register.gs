/**
 * รับเอกสารใหม่ — ลงทะเบียนผลงานวิชาการ (docs/DESIGN.md ลำดับพัฒนา Part 3)
 * อัปโหลดภาพหน้าปก (ถ้าตั้งค่า Drive ไว้) + OCR แบบ best-effort + ฟอร์ม + ออกเลขติดตาม + qr_token
 */

var CITIZEN_ID_LENGTH_ = 13;
var QR_TOKEN_LENGTH_ = 8;
var QR_TOKEN_MAX_RETRY_ = 20;

var REGISTER_REQUIRED_FIELDS_ = [
  { key: 'title_name', label: 'คำนำหน้าชื่อ' },
  { key: 'first_name', label: 'ชื่อ' },
  { key: 'last_name', label: 'นามสกุล' },
  { key: 'position', label: 'ตำแหน่ง' },
  { key: 'current_level', label: 'ระดับปัจจุบัน' },
  { key: 'requested_level', label: 'ระดับที่ขอ' },
  { key: 'work_type', label: 'ประเภทผลงาน' },
  { key: 'work_title', label: 'ชื่อผลงาน' },
  { key: 'org_from', label: 'หน่วยงานต้นสังกัด' },
];

/**
 * รับ e.parameter (จากฟอร์ม HTML ธรรมดา, POST เดียวจบ ไม่มี AJAX — ดูหมายเหตุ A11 ใน Ocr.gs)
 * คืน { ok:true, work_id, tracking_no, qr_token, qr_image_url, ocr_low_confidence }
 * หรือ { ok:false, errors:[...], values:{...} } ให้แสดงฟอร์มเดิมพร้อมข้อมูลที่กรอกไว้อีกครั้ง
 */
function registerNewWork_(ss, user, e) {
  var p = (e && e.parameter) || {};
  var values = {};
  REGISTER_REQUIRED_FIELDS_.concat([{ key: 'phone' }, { key: 'email' }]).forEach(function (f) {
    values[f.key] = (p['reg_' + f.key] || '').toString().trim();
  });
  values.citizen_id = (p.reg_citizen_id || '').toString().trim();
  if (values.work_type === 'อื่น ๆ' && p.reg_work_type_other) {
    values.work_type = String(p.reg_work_type_other).trim();
  }

  var errors = [];
  REGISTER_REQUIRED_FIELDS_.forEach(function (f) {
    if (!values[f.key]) errors.push(f.label + 'ห้ามว่าง');
  });
  if (!/^[0-9]{13}$/.test(values.citizen_id)) {
    errors.push('เลขบัตรประชาชนต้องเป็นตัวเลข ' + CITIZEN_ID_LENGTH_ + ' หลัก');
  }
  if (errors.length) {
    return { ok: false, errors: errors, values: values };
  }

  var station = getFirstActiveStation_(ss);
  var blob = getUploadedCoverBlob_(p);
  var trackingNo = nextTrackingNo_(ss);
  var qrToken = generateUniqueQrToken_(ss);
  var coverUrl = saveCoverImageToDrive_(ss, blob, trackingNo);
  var ocrResult = runOcrOnBlob_(ss, blob);
  var ocrLowConfidence = !!blob && isOcrLowConfidence_(ss, ocrResult);

  var workId = Utilities.getUuid();
  var nowTs = now_();

  var worksSheet = ss.getSheetByName(SHEET.WORKS);
  appendRowByHeader_(worksSheet, SHEET_HEADERS[SHEET.WORKS], {
    work_id: workId,
    tracking_no: trackingNo,
    qr_token: qrToken,
    citizen_id_last4: values.citizen_id.slice(-4),
    citizen_id_encrypted: encryptCitizenId_(values.citizen_id),
    citizen_id_hash: hashCitizenId_(values.citizen_id),
    title_name: values.title_name,
    first_name: values.first_name,
    last_name: values.last_name,
    position: values.position,
    current_level: values.current_level,
    requested_level: values.requested_level,
    work_type: values.work_type,
    work_title: values.work_title,
    org_from: values.org_from,
    phone: values.phone,
    email: values.email,
    cover_image_url: coverUrl,
    received_date: nowTs,
    current_station_key: station.station_key,
    current_status_public: station.public_status,
    handoff_pending: false,
    current_owner_org: station.org,
    current_handler_name: user.display_name || user.user_email,
    updated_at: nowTs,
    next_step_text: '',
    created_by: user.user_email,
    created_at: nowTs,
  });

  var historySheet = ss.getSheetByName(SHEET.STATUS_HISTORY);
  appendRowByHeader_(historySheet, SHEET_HEADERS[SHEET.STATUS_HISTORY], {
    history_id: Utilities.getUuid(),
    work_id: workId,
    tracking_no: trackingNo,
    action: 'registered',
    from_station: '',
    to_station: station.station_key,
    from_org: '',
    to_org: station.org,
    action_by: user.user_email,
    action_by_org: user.organization,
    action_date: nowTs,
    note: buildOcrNote_(ocrResult, ocrLowConfidence),
    revision_reasons: '',
    revision_due_date: '',
    attachment_url: coverUrl,
    created_at: nowTs,
  });

  return {
    ok: true,
    work_id: workId,
    tracking_no: trackingNo,
    qr_token: qrToken,
    qr_image_url: buildQrImageUrl_(ss, qrToken),
    ocr_low_confidence: ocrLowConfidence,
  };
}

function buildOcrNote_(ocrResult, lowConfidence) {
  if (!ocrResult) return '';
  var text = String(ocrResult.text).slice(0, 500);
  return 'OCR: ' + text + (lowConfidence ? ' [OCR ไม่มั่นใจ กรุณาตรวจสอบข้อมูลด้วยตนเอง]' : '');
}

/** สถานีแรกของ Workflow (station_order ต่ำสุดที่ active) — อ่านจากชีตสด ไม่ hardcode เพราะ Admin ปรับลำดับได้ */
function getFirstActiveStation_(ss) {
  var stations = readSheetAsObjects_(ss.getSheetByName(SHEET.WORK_STATIONS))
    .filter(function (s) { return s.active; })
    .sort(function (a, b) { return Number(a.station_order) - Number(b.station_order); });
  if (!stations.length) throw new Error('ยังไม่มีสถานี Workflow ที่เปิดใช้งาน (ตรวจสอบชีต WorkStations)');
  return stations[0];
}

/** เลขติดตาม: <prefix>-<ปี พ.ศ.>-<เลขลำดับ 5 หลัก> รันแยกตามปี, กันชนกันด้วย LockService (docs/DESIGN.md A3) */
function nextTrackingNo_(ss) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var year = String(getSetting_(ss, 'fiscal_year_current', String(getBuddhistYear_(now_()))));
    var prefix = getSetting_(ss, 'tracking_no_prefix', 'อวช11');
    var seqKey = 'last_seq_' + year;
    var seq = Number(getSetting_(ss, seqKey, '0')) + 1;
    setSetting_(ss, seqKey, String(seq), 'เลขลำดับล่าสุดของปี ' + year + ' (ระบบเพิ่มอัตโนมัติ ห้ามแก้มือขณะมีคนใช้งาน)');
    return prefix + '-' + year + '-' + padLeft_(seq, 5);
  } finally {
    lock.releaseLock();
  }
}

/** qr_token สุ่ม 8 ตัว ไม่ซ้ำกับที่มีอยู่แล้ว (docs/DESIGN.md A1) */
function generateUniqueQrToken_(ss) {
  var existing = {};
  readSheetAsObjects_(ss.getSheetByName(SHEET.WORKS)).forEach(function (w) {
    if (w.qr_token) existing[w.qr_token] = true;
  });
  for (var i = 0; i < QR_TOKEN_MAX_RETRY_; i++) {
    var token = randomToken_(QR_TOKEN_LENGTH_);
    if (!existing[token]) return token;
  }
  throw new Error('สร้าง qr_token ไม่ซ้ำไม่สำเร็จหลังลองหลายครั้ง (โอกาสเกิดน้อยมาก ลองใหม่อีกครั้ง)');
}

/** URL ที่เข้ารหัสลง QR — ชี้กลับมาที่ Web App เดียวกันพร้อม token (path /t/ ตาม A1 ทำไม่ได้จริงบน Apps Script จึงใช้ query param แทน) */
function buildQrImageUrl_(ss, qrToken) {
  var base = getSetting_(ss, 'web_app_base_url', '');
  var target = base ? (base + '?t=' + encodeURIComponent(qrToken)) : ('t=' + qrToken);
  return 'https://chart.googleapis.com/chart?chs=300x300&cht=qr&chld=M|0&choe=UTF-8&chl=' + encodeURIComponent(target);
}

/** ไฟล์ภาพหน้าปกที่อัปโหลดมากับฟอร์ม (multipart/form-data) — คืน null ถ้าไม่ได้แนบไฟล์ */
function getUploadedCoverBlob_(p) {
  var blob = p.reg_cover_image;
  if (!blob || typeof blob.getBytes !== 'function') return null;
  if (blob.getBytes().length === 0) return null;
  return blob;
}

/** อัปโหลดภาพหน้าปกเข้า Drive (ถ้าตั้งค่า Settings.drive_folder_id_cover ไว้) — คืน URL หรือ '' ถ้าข้าม/ล้มเหลว */
function saveCoverImageToDrive_(ss, blob, trackingNo) {
  if (!blob) return '';
  var folderId = getSetting_(ss, 'drive_folder_id_cover', '');
  if (!folderId) return '';
  try {
    var folder = DriveApp.getFolderById(folderId);
    var file = folder.createFile(blob.setName(trackingNo + '_cover_' + blob.getName()));
    return file.getUrl();
  } catch (err) {
    Logger.log('อัปโหลดภาพหน้าปกไม่สำเร็จ (ข้ามไป): ' + err.message);
    return '';
  }
}
