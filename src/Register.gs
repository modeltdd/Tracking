/**
 * รับเอกสารใหม่ — ลงทะเบียนผลงานวิชาการ (docs/DESIGN.md ลำดับพัฒนา Part 3)
 * อัปโหลดภาพหน้าปก (ถ้าตั้งค่า Drive ไว้) + ฟอร์ม + ออกเลขติดตาม + qr_token
 */

var CITIZEN_ID_LENGTH_ = 13;
var QR_TOKEN_LENGTH_ = 8;
var QR_TOKEN_MAX_RETRY_ = 20;

// 2026-09-15 (ลดฟิลด์ลงทะเบียน — ดูแชท requirement ส่วน A): ตัด current_level/requested_level ออกจากฟิลด์บังคับ
// (คอลัมน์เดิมยังอยู่ในชีต เขียนค่าว่างแทน) เพิ่ม position_no (เลขตำแหน่งเดิม) เป็นฟิลด์ใหม่ที่บังคับกรอก
var REGISTER_REQUIRED_FIELDS_ = [
  { key: 'title_name', label: 'คำนำหน้าชื่อ' },
  { key: 'first_name', label: 'ชื่อ' },
  { key: 'last_name', label: 'นามสกุล' },
  { key: 'position', label: 'ตำแหน่ง' },
  { key: 'position_no', label: 'เลขตำแหน่งเดิม' },
  { key: 'work_type', label: 'ประเภทผลงาน' },
  { key: 'work_title', label: 'ชื่อผลงาน' },
  { key: 'org_from', label: 'หน่วยงานต้นสังกัด' },
];

/**
 * รับ e.parameter (จากฟอร์ม HTML ธรรมดา, POST เดียวจบ ไม่มี AJAX)
 * คืน { ok:true, work_id, tracking_no, qr_token, qr_image_url }
 * หรือ { ok:false, errors:[...], values:{...} } ให้แสดงฟอร์มเดิมพร้อมข้อมูลที่กรอกไว้อีกครั้ง
 */
function registerNewWork_(ss, user, e) {
  var p = (e && e.parameter) || {};
  var values = {};
  REGISTER_REQUIRED_FIELDS_.concat([{ key: 'phone' }, { key: 'email' }]).forEach(function (f) {
    values[f.key] = (p['reg_' + f.key] || '').toString().trim();
  });
  values.medical_domain = String(p.reg_medical_domain || '').trim();
  values.medical_specialty = String(p.reg_medical_specialty || '').trim();
  if (values.work_type === 'อื่น ๆ' && p.reg_work_type_other) {
    values.work_type = String(p.reg_work_type_other).trim();
  }

  var errors = [];
  REGISTER_REQUIRED_FIELDS_.forEach(function (f) {
    if (!values[f.key]) errors.push(f.label + 'ห้ามว่าง');
  });

  // 2026-09-15: ตำแหน่ง/ด้าน/สาขาแพทย์ ต้อง valid ตาม Master Data จริง (ห้ามผูก logic กับข้อความเดา — ดูแชท
  // requirement ส่วน B-E, R) — ตรวจเฉพาะเมื่อฟิลด์ตำแหน่งกรอกมาแล้ว (ถ้าว่างจะถูกจับโดยเช็ค required ด้านบนแล้ว)
  var positions = getActiveMasterRows_(ss, SHEET.MASTER_POSITIONS);
  if (values.position && !positions.some(function (row) { return row.position_name === values.position; })) {
    errors.push('ตำแหน่งที่เลือกไม่ถูกต้อง (ไม่พบใน Master Data)');
  }
  if (values.position === 'นายแพทย์') {
    var domains = getActiveMasterRows_(ss, SHEET.MASTER_MEDICAL_DOMAINS);
    var domainRow = domains.filter(function (row) { return row.domain_name === values.medical_domain; })[0];
    if (!domainRow) {
      errors.push('กรุณาเลือก "ด้าน" ให้ถูกต้อง (ตำแหน่งนายแพทย์ต้องระบุด้าน)');
    } else if (domainRow.domain_name === 'ด้านเวชกรรม') {
      var specialties = getActiveMasterRows_(ss, SHEET.MASTER_MEDICAL_SPECIALTIES);
      var specOk = specialties.some(function (row) {
        return row.specialty_name === values.medical_specialty && row.domain_code === domainRow.domain_code;
      });
      if (!specOk) errors.push('กรุณาเลือก "สาขา" ให้ถูกต้อง (ด้านเวชกรรมต้องระบุสาขา)');
    } else {
      values.medical_specialty = ''; // ด้านอื่นที่ไม่ใช่เวชกรรม ไม่เก็บสาขา (ตาม E — เอกสาร requirement)
    }
  } else {
    // ไม่ใช่นายแพทย์ — ไม่เก็บด้าน/สาขา แม้ถูกส่งมาจากฟอร์มก็ตาม (กัน client-side JS พลาด/ปิด JS)
    values.medical_domain = '';
    values.medical_specialty = '';
  }

  if (errors.length) {
    return { ok: false, errors: errors, values: values };
  }

  var station = getFirstActiveStation_(ss);
  var trackingNo = nextTrackingNo_(ss);
  var qrToken = generateUniqueQrToken_(ss);

  var workId = Utilities.getUuid();
  var nowTs = now_();

  var worksSheet = ss.getSheetByName(SHEET.WORKS);
  appendRowByHeader_(worksSheet, SHEET_HEADERS[SHEET.WORKS], {
    work_id: workId,
    tracking_no: trackingNo,
    qr_token: qrToken,
    // เลขบัตรประชาชน/ระดับ/ภาพหน้าปก ตัดออกจากฟอร์มแล้ว (2026-09-15) — คอลัมน์เดิมยังอยู่ เขียนค่าว่างไว้
    citizen_id_last4: '',
    citizen_id_encrypted: '',
    citizen_id_hash: '',
    title_name: values.title_name,
    first_name: values.first_name,
    last_name: values.last_name,
    position: values.position,
    current_level: '',
    requested_level: '',
    work_type: values.work_type,
    work_title: values.work_title,
    org_from: values.org_from,
    phone: values.phone,
    email: values.email,
    cover_image_url: '',
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
    position_no: values.position_no,
    medical_domain: values.medical_domain,
    medical_specialty: values.medical_specialty,
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
    note: '',
    revision_reasons: '',
    revision_due_date: '',
    attachment_url: '',
    created_at: nowTs,
  });

  return {
    ok: true,
    work_id: workId,
    tracking_no: trackingNo,
    qr_token: qrToken,
    qr_image_url: buildQrImageUrl_(ss, qrToken),
  };
}

/** สถานีแรกของ Workflow (station_order ต่ำสุดที่ active) — อ่านจากชีตสด ไม่ hardcode เพราะ Admin ปรับลำดับได้ */
function getFirstActiveStation_(ss) {
  var stations = readSheetAsObjects_(ss.getSheetByName(SHEET.WORKFLOW_STATES))
    .filter(function (s) { return s.active; })
    .sort(function (a, b) { return compareStationOrder_(a.station_order, b.station_order); });
  if (!stations.length) throw new Error('ยังไม่มีสถานี Workflow ที่เปิดใช้งาน (ตรวจสอบชีต WorkflowStates)');
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

/** URL ที่เข้ารหัสลง QR — ชี้กลับมาที่ Web App เดียวกันพร้อม token (path /t/ ตาม A1 ทำไม่ได้จริงบน Apps Script จึงใช้ query param แทน)
 * หมายเหตุ: เดิมใช้ Google Image Charts (chart.googleapis.com) แต่ Google ปิดบริการนี้ไปตั้งแต่ปี 2019 ทำให้ภาพ QR ไม่ขึ้น
 * เปลี่ยนมาใช้ QR Server API (api.qrserver.com) แทน — ฟรี ไม่ต้องมี API key */
function buildQrImageUrl_(ss, qrToken) {
  var base = getSetting_(ss, 'web_app_base_url', '');
  var target = base ? (base + '?t=' + encodeURIComponent(qrToken)) : ('t=' + qrToken);
  return 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&ecc=M&data=' + encodeURIComponent(target);
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
