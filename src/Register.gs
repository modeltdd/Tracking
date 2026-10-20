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
  // 2026-10-07 ผู้ใช้ขอเอา "ประเภทผลงาน" ออกจากฟอร์มทั้งหมด (field/validation/"อื่น ๆ") — คอลัมน์ work_type
  // เดิมในชีต Works ยังอยู่ ไม่ลบ (กันกระทบข้อมูลเก่า/รายงานเดิม) งานใหม่เขียนค่าว่างแทน ดูจุดอื่นที่ยังอ้างอิง
  // work_type อยู่ (แสดงผลเฉยๆ ไม่บังคับ): renderPubOwnerRow_('ประเภทผลงาน', ...) ในหน้ารายละเอียด (Views.gs),
  // คอลัมน์ CSV รายงาน (Admin.gs) — ยังไม่ได้ตัดออกจากจุดเหล่านั้นตามที่ผู้ใช้สั่งไว้ชัดเจนว่า "อย่าลบทันที"
  { key: 'work_title', label: 'ชื่อผลงาน' },
  // 2026-10-07 (ข้อมูลหน่วยงานแบบ Master Data เขตสุขภาพที่ 11) — org_from/province ยังบังคับเหมือนเดิม แต่ตอนนี้
  // มาจากการเลือกหน่วยงานจริงเท่านั้น (validate เพิ่มด้วย organization_id ด้านล่าง ไม่ใช่ free text อีกต่อไป)
  { key: 'organization_type', label: 'ประเภทหน่วยงาน' },
  { key: 'org_from', label: 'หน่วยงานต้นสังกัด' },
  { key: 'province', label: 'จังหวัด' },
];

/**
 * รับ e.parameter (จากฟอร์ม HTML ธรรมดา, POST เดียวจบ ไม่มี AJAX)
 * คืน { ok:true, work_id, tracking_no, qr_token, qr_image_url }
 * หรือ { ok:false, errors:[...], values:{...} } ให้แสดงฟอร์มเดิมพร้อมข้อมูลที่กรอกไว้อีกครั้ง
 */
function registerNewWork_(ss, user, e) {
  var p = (e && e.parameter) || {};
  var values = {};
  // 2026-10-07 ตัด email ออกจากฟอร์ม (ผู้ใช้ขอ) — ไม่อ่าน p.reg_email อีกต่อไป เขียนค่าว่างแทนตอนบันทึก
  REGISTER_REQUIRED_FIELDS_.concat([{ key: 'phone' }]).forEach(function (f) {
    values[f.key] = (p['reg_' + f.key] || '').toString().trim();
  });
  values.medical_domain = ''; // เลิกใช้แล้ว (2026-09-15 รอบ 3) — คอลัมน์เดิมยังอยู่ เขียนค่าว่างเสมอ
  values.specialty = String(p.reg_specialty || '').trim();
  values.organization_id = String(p.reg_organization_id || '').trim();
  // 2026-10-20 — ส่วน "ข้อมูลหนังสือนำส่ง" (ไม่บังคับกรอก) เก็บ string ดิบไว้ใน values เสมอ (คืนค่าตอน error
  // ให้ฟอร์ม <input type="date"> แสดงค่าเดิมถูกต้อง — ต้องเป็น "YYYY-MM-DD" ดิบ ไม่ใช่ Date object/dd-mm-yyyy)
  values.forwarding_book_no = String(p.reg_forwarding_book_no || '').trim();
  values.forwarding_book_date = String(p.reg_forwarding_book_date || '').trim();
  values.admin_received_date = String(p.reg_admin_received_date || '').trim();
  // 2026-09-24: คำนำหน้าชื่อเปลี่ยนจาก text input เป็น dropdown — เลือก "อื่น ๆ" คู่กับช่อง custom
  // title_name ยัง free-text ไม่ validate ค่าตายตัวเหมือนเดิม
  if (values.title_name === 'อื่น ๆ' && p.reg_title_name_other) {
    values.title_name = String(p.reg_title_name_other).trim();
  }

  var errors = [];

  // 2026-10-07 (ข้อมูลหน่วยงานแบบ Master Data เขตสุขภาพที่ 11) — ต้องเลือกหน่วยงานจริงจากรายการเท่านั้น (ห้าม
  // free text ตามที่ผู้ใช้กำชับ) ตรวจฝั่ง server เสมอ ไม่เชื่อค่า org_from/province ที่ client ส่งมาตรงๆ เลย —
  // ใช้ organization_id (รหัสหน่วยงาน9หลัก) หา record จริงใน OrganizationMaster แล้ว "เขียนทับ" org_from/province
  // ด้วยค่าจริงจาก master เสมอ (กัน mismatch/ของปลอมแม้ client JS จะพังหรือถูกแก้ไข) — ต้องทำ "ก่อน" เช็ค required
  // fields ด้านล่างเสมอ (พบบั๊กจริงตอนเทส: ถ้าทำหลัง required check จะเจอ org_from/province ว่างจากค่าดิบของ
  // client ก่อนเสมอ ทำให้ error message ออกเป็น "ห้ามว่าง" แทนที่จะเป็น "กรุณาเลือกหน่วยงานจากรายการ" ที่ตรงจุดกว่า)
  values.organization_code = '';
  if (values.organization_type && values.organization_id) {
    var orgRow = findOrganizationMasterById_(ss, values.organization_id);
    if (!orgRow || orgRow.organization_type !== values.organization_type || !orgRow.active) {
      errors.push('กรุณาเลือกหน่วยงานจากรายการ (ไม่พบหน่วยงานที่ตรงกับที่เลือก)');
    } else {
      values.org_from = orgRow.organization_name;
      values.province = orgRow.province_name;
      values.organization_code = orgRow.organization_code;
    }
  } else if (values.organization_type) {
    errors.push('กรุณาเลือกหน่วยงานจากรายการ');
  }

  REGISTER_REQUIRED_FIELDS_.forEach(function (f) {
    if (!values[f.key]) errors.push(f.label + 'ห้ามว่าง');
  });

  // 2026-10-20 — วันที่ส่งหนังสือ/วันที่ธุรการรับเรื่อง ไม่บังคับกรอก แต่ถ้ากรอกต้องเป็นวันที่จริง (input
  // type="date" ส่ง "YYYY-MM-DD" มาอยู่แล้วตามปกติ เช็คซ้ำฝั่ง server เผื่อ client ถูกแก้ไข/ปิด JS)
  var forwardingBookDateObj = null;
  if (values.forwarding_book_date) {
    forwardingBookDateObj = new Date(values.forwarding_book_date);
    if (isNaN(forwardingBookDateObj.getTime())) { errors.push('วันที่ส่งหนังสือไม่ถูกต้อง'); forwardingBookDateObj = null; }
  }
  var adminReceivedDateObj = null;
  if (values.admin_received_date) {
    adminReceivedDateObj = new Date(values.admin_received_date);
    if (isNaN(adminReceivedDateObj.getTime())) { errors.push('วันที่ธุรการรับเรื่องไม่ถูกต้อง'); adminReceivedDateObj = null; }
  }
  // ถ้ามีทั้งสองวันที่และลำดับผิดปกติ (ธุรการรับเรื่องก่อนวันที่ส่งหนังสือ) แค่ "เตือน" ไม่บังคับห้ามบันทึก
  // (ผู้ใช้ยืนยันแล้ว — อาจมีกรณีย้อนหลังพิเศษจริงในทางปฏิบัติ) ส่งต่อ flag ไปแสดงเตือนที่หน้าสำเร็จแทน
  var dateOrderWarning = !!(forwardingBookDateObj && adminReceivedDateObj && adminReceivedDateObj.getTime() < forwardingBookDateObj.getTime());

  // 2026-09-15 รอบ 3: ตำแหน่งต้อง valid ตาม MasterPositions จริง — "ด้าน/สาขา" เป็น dropdown ชั้นเดียว generic
  // ผูกกับตำแหน่งที่เลือก (MasterSpecialties.position_code) ไม่ใช่แค่นายแพทย์อีกต่อไป (พบจากข้อมูลจริง 244 ราย
  // ใน Excel เดิมว่าทุกตำแหน่งมีด้านของตัวเอง — ดูแชท requirement รอบ 3) ตำแหน่งที่ยังไม่มีด้านใน Master Data
  // (เช่น Admin เพิ่งเพิ่มตำแหน่งใหม่ยังไม่ทันตั้งด้าน) ถือว่าไม่บังคับกรอกด้าน
  var positions = getActiveMasterRows_(ss, SHEET.MASTER_POSITIONS);
  var positionRow = positions.filter(function (row) { return row.position_name === values.position; })[0];
  if (values.position && !positionRow) {
    errors.push('ตำแหน่งที่เลือกไม่ถูกต้อง (ไม่พบใน Master Data)');
  }
  if (positionRow) {
    var specialtyOptions = getActiveMasterRows_(ss, SHEET.MASTER_SPECIALTIES)
      .filter(function (row) { return row.position_code === positionRow.position_code; });
    if (specialtyOptions.length) {
      var specOk = specialtyOptions.some(function (row) { return row.specialty_name === values.specialty; });
      if (!specOk) errors.push('กรุณาเลือก "ด้าน/สาขา" ให้ถูกต้องสำหรับตำแหน่งนี้');
    } else {
      values.specialty = ''; // ตำแหน่งนี้ยังไม่มีด้าน/สาขาใน Master Data — ไม่บังคับ เคลียร์ค่าทิ้งกันข้อมูลเพี้ยน
    }
  }

  // 2026-09-21: เชื่อมโยงกับคณะกรรมการจริง (ChairMaster) — คำนวณ/validate เสมอฝั่ง backend ไม่เชื่อ client
  // (ดู resolveCommitteeForRegistration_ ใน CommitteeMigration.gs สำหรับที่มาของ 4 โหมด)
  values.committee_code = '';
  if (positionRow) {
    var committeeResolution = resolveCommitteeForRegistration_(ss, values.position, values.specialty);
    if (committeeResolution.mode === 'single' || committeeResolution.mode === 'specialty') {
      values.committee_code = committeeResolution.committee.committee_code;
    } else if (committeeResolution.mode === 'manual') {
      var chosenCommittee = String(p.reg_committee_code || '').trim();
      var validCodes = committeeResolution.committees.map(function (c) { return c.committee_code; });
      if (!chosenCommittee || validCodes.indexOf(chosenCommittee) === -1) {
        errors.push('ตำแหน่งนี้มีหลายคณะกรรมการ ไม่สามารถจับคู่อัตโนมัติได้ กรุณาเลือกคณะกรรมการที่รับผิดชอบ');
      } else {
        values.committee_code = chosenCommittee;
      }
    }
    // mode 'none' — ตำแหน่งนี้ยังไม่มีคณะกรรมการในระบบ ไม่บังคับ ปล่อย committee_code ว่าง
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
    work_type: '', // 2026-10-07 ตัดออกจากฟอร์มแล้ว (ผู้ใช้ขอ) — คอลัมน์เดิมยังอยู่ กันกระทบข้อมูลเก่า/รายงานเดิม
    work_title: values.work_title,
    org_from: values.org_from,
    phone: values.phone,
    email: '', // 2026-10-07 ตัดออกจากฟอร์มแล้วเช่นกัน — คอลัมน์เดิมยังอยู่ งานเก่าที่เคยมีอีเมลไม่ถูกแตะ
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
    medical_specialty: '', // เลิกใช้แล้ว (2026-09-15 รอบ 3) — คอลัมน์เดิมยังอยู่ เขียนค่าว่างเสมอ
    province: values.province,
    specialty: values.specialty,
    committee_code: values.committee_code,
    organization_id: values.organization_id,
    organization_code: values.organization_code,
    forwarding_book_no: values.forwarding_book_no,
    forwarding_book_date: forwardingBookDateObj || '',
    admin_received_date: adminReceivedDateObj || '',
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
    dateOrderWarning: dateOrderWarning,
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

/** เลขทะเบียน: <ปี พ.ศ. 2 หลัก>-<เลขลำดับ 3 หลัก> (เช่น "69-001") รันแยกตามปี, กันชนกันด้วย LockService
 *  (docs/DESIGN.md A3) — 2026-09-24: เพิ่ม pad เลข 0 ให้ครบ 3 หลักตามที่ผู้ใช้ยืนยัน (ตัวอย่าง "69-001" ถึง
 *  "69-244") ถ้าเกิน 999 ต่อปีจะไม่ตัดทอน แค่ยาวกว่า 3 หลัก (padLeft_ ไม่ตัดของเดิม) — Settings key last_seq_<ปี>
 *  ภายในยังใช้ปีเต็ม 4 หลักเหมือนเดิม (กันชนข้ามศตวรรษ) แค่ตอน "แสดง" ตัดเหลือ 2 หลักท้ายด้วย shortBuddhistYear_
 *  (tracking_no_prefix ใน Settings ไม่ได้ใช้ต่อแล้ว แต่ไม่ลบทิ้ง เผื่อย้อนดู) */
function nextTrackingNo_(ss) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var year = String(getSetting_(ss, 'fiscal_year_current', String(getBuddhistYear_(now_()))));
    var seqKey = 'last_seq_' + year;
    var seq = Number(getSetting_(ss, seqKey, '0')) + 1;
    setSetting_(ss, seqKey, String(seq), 'เลขลำดับล่าสุดของปี ' + year + ' (ระบบเพิ่มอัตโนมัติ ห้ามแก้มือขณะมีคนใช้งาน)');
    return shortBuddhistYear_(year) + '-' + padLeft_(seq, 3);
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

/**
 * Master Data หน่วยงาน เขตสุขภาพที่ 11 (2026-10-07) — หา record เดียวด้วย organization_id (รหัสหน่วยงาน9หลัก)
 * ใช้ตรวจสอบฝั่ง server ตอน submit (registerNewWork_) ห้ามเชื่อ org_from/province ที่ client ส่งมาตรงๆ
 */
function findOrganizationMasterById_(ss, organizationId) {
  if (!organizationId) return null;
  var sheet = ss.getSheetByName(SHEET.ORGANIZATION_MASTER);
  if (!sheet) return null;
  var rows = readSheetAsObjects_(sheet);
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].organization_id === organizationId) return rows[i];
  }
  return null;
}

/**
 * ข้อมูลหน่วยงานทั้งหมด (เขตสุขภาพ 11 เท่านั้น — ชีตเก็บแค่เขต 11 อยู่แล้วตั้งแต่ import) จัดกลุ่มตาม
 * organization_type ฝังเป็น JSON ในหน้าฟอร์มลงทะเบียนครั้งเดียว (reuse pattern เดียวกับ
 * buildCommitteeLookupForRegisterForm_ — ไม่มี AJAX ในระบบนี้ client กรอง/ค้นหาเองจาก JSON ชุดนี้) โหลดเฉพาะ
 * ประเภทที่เลือกเท่านั้นไปแสดงใน <datalist> (ข้อ 12 — ห้ามโหลดหน่วยงานทั้งหมดพร้อมกันในช่องเดียว)
 * แต่ละรายการ: { id, code, name, fullName, province, district } — ชื่อ key สั้นช่วยลดขนาด JSON ที่ฝังในหน้า
 */
function buildOrganizationMasterLookupForRegisterForm_(ss) {
  var sheet = ss.getSheetByName(SHEET.ORGANIZATION_MASTER);
  if (!sheet) return {};
  var rows = readSheetAsObjects_(sheet).filter(function (r) { return r.active; });
  var byType = {};
  ORGANIZATION_TYPE_OPTIONS_.forEach(function (t) { byType[t] = []; });
  rows.forEach(function (r) {
    if (!byType[r.organization_type]) byType[r.organization_type] = [];
    byType[r.organization_type].push({
      id: r.organization_id, code: r.organization_code, name: r.organization_name,
      fullName: r.organization_full_name, province: r.province_name, district: r.district_name,
    });
  });
  return byType;
}
