/**
 * ค่าคงที่ของระบบ — โครงสร้างชีต, สถานี Workflow, สถานะสาธารณะ, ค่าตั้งต้น
 * ตรงตาม docs/DESIGN.md v2 (ห้ามเปลี่ยนชื่อฟิลด์โดยไม่บันทึกเหตุผลในเอกสารออกแบบก่อน)
 */

var SHEET = {
  WORKS: 'Works',
  STATUS_HISTORY: 'StatusHistory',
  WORK_STATIONS: 'WorkStations',
  USERS: 'Users',
  SETTINGS: 'Settings',
  AUDIT_LOG: 'AuditLog',
  SEARCH_LOG: 'SearchLog',
};

var SHEET_HEADERS = {};
SHEET_HEADERS[SHEET.WORKS] = [
  'work_id', 'tracking_no', 'qr_token', 'citizen_id_last4', 'citizen_id_encrypted', 'citizen_id_hash',
  'title_name', 'first_name', 'last_name', 'position', 'current_level', 'requested_level',
  'work_type', 'work_title', 'org_from', 'phone', 'email', 'cover_image_url', 'received_date',
  'current_station_key', 'current_status_public', 'handoff_pending', 'current_owner_org',
  'current_handler_name', 'updated_at', 'next_step_text', 'created_by', 'created_at',
];
SHEET_HEADERS[SHEET.STATUS_HISTORY] = [
  'history_id', 'work_id', 'tracking_no', 'action', 'from_station', 'to_station', 'from_org', 'to_org',
  'action_by', 'action_by_org', 'action_date', 'note', 'revision_reasons', 'revision_due_date',
  'attachment_url', 'created_at',
];
SHEET_HEADERS[SHEET.WORK_STATIONS] = [
  'station_key', 'station_order', 'station_name', 'org', 'standard_days', 'next_station_key',
  'public_status', 'receive_role', 'approve_role', 'notify_method', 'active',
];
SHEET_HEADERS[SHEET.USERS] = ['user_email', 'display_name', 'role', 'organization', 'active'];
SHEET_HEADERS[SHEET.SETTINGS] = ['setting_key', 'setting_value', 'description', 'updated_at'];
SHEET_HEADERS[SHEET.AUDIT_LOG] = [
  'audit_id', 'timestamp', 'user_email', 'action', 'work_id', 'field_changed', 'old_value', 'new_value',
];
SHEET_HEADERS[SHEET.SEARCH_LOG] = [
  'log_id', 'timestamp', 'tracking_no_attempt', 'citizen_id_last4_attempt', 'success', 'session_token',
];

// สถานี Workflow เริ่มต้น (ตรง docs/DESIGN.md ตาราง 3.1) — แก้ไขได้ภายหลังจากหน้า "จัดการ Workflow"
// ไม่กระทบ record ที่มีอยู่ เพราะ Works อ้างสถานีด้วย station_key ไม่ใช่ลำดับแถว
var WORKSTATIONS_SEED = [
  { key: 'received', order: 1, name: 'รับเรื่องจากหน่วยงานต้นทาง', org: 'กลุ่มงานบริหารทรัพยากรบุคคล',
    days: 3, next: 'checking', pub: 'received', receiveRole: 'เจ้าหน้าที่รับเอกสาร', approveRole: '-', notify: 'ไม่มี' },
  { key: 'checking', order: 2, name: 'ตรวจสอบความครบถ้วนเอกสาร', org: 'กลุ่มงานบริหารทรัพยากรบุคคล',
    days: 5, next: 'propose', pub: 'checking', receiveRole: 'เจ้าหน้าที่รับเอกสาร', approveRole: '-', notify: 'ไม่มี' },
  { key: 'propose', order: 3, name: 'เสนอคณะกรรมการพิจารณา', org: 'กลุ่มงานพัฒนาบุคลากร',
    days: 5, next: 'review', pub: 'in_review', receiveRole: 'เจ้าหน้าที่ผู้รับผิดชอบ', approveRole: '-', notify: 'ไม่มี' },
  { key: 'review', order: 4, name: 'คณะกรรมการพิจารณา', org: 'คณะกรรมการประเมินผลงานวิชาการ',
    days: 15, next: 'approve', pub: 'in_review', receiveRole: 'เลขานุการคณะกรรมการ', approveRole: 'คณะกรรมการ', notify: 'ไม่มี' },
  { key: 'approve', order: 5, name: 'เสนอผู้บริหารอนุมัติ', org: 'ผู้บริหารสำนักงานเขตสุขภาพที่ 11',
    days: 7, next: 'announce', pub: 'pending_approval', receiveRole: 'เลขานุการคณะกรรมการ', approveRole: 'ผู้อำนวยการเขตสุขภาพที่ 11', notify: 'ไม่มี' },
  { key: 'announce', order: 6, name: 'แจ้งผลการพิจารณา', org: 'กลุ่มงานบริหารทรัพยากรบุคคล',
    days: 3, next: 'closed', pub: 'result_announced', receiveRole: 'เจ้าหน้าที่รับเอกสาร', approveRole: '-', notify: 'เตรียมไว้สำหรับ LINE/SMS ในระยะถัดไป' },
  { key: 'closed', order: 7, name: 'ปิดงาน/จัดเก็บเอกสาร', org: 'กลุ่มงานบริหารทรัพยากรบุคคล',
    days: 2, next: '', pub: 'done', receiveRole: 'เจ้าหน้าที่รับเอกสาร', approveRole: '-', notify: 'ไม่มี' },
];

// สถานะสาธารณะ 8 ค่า (ตรง docs/DESIGN.md 3.1) — ใช้อ้างอิงใน UI ชั้นถัดไป ยังไม่ใช้ใน Part 1
var PUBLIC_STATUS_LABELS = {
  received: 'รับเอกสารแล้ว',
  checking: 'ตรวจสอบความครบถ้วน',
  need_revision: 'รอเจ้าของผลงานแก้ไข',
  in_review: 'อยู่ระหว่างพิจารณา',
  pending_approval: 'รออนุมัติ',
  result_announced: 'แจ้งผลแล้ว',
  done: 'เสร็จสิ้น',
  terminated: 'ยุติกระบวนการ',
};

// ป้ายชื่อ action ใน StatusHistory (ตรง docs/DESIGN.md 4.2) — ใช้แสดงบน Timeline หน้ารายละเอียดงาน
var ACTION_LABELS_ = {
  registered: 'ลงทะเบียนรับเรื่อง',
  received: 'รับเอกสารและเริ่มดำเนินการ',
  forwarded: 'ผ่านและส่งต่อขั้นตอนถัดไป',
  more_info: 'ขอข้อมูลเพิ่มเติม',
  revision_requested: 'ส่งกลับให้เจ้าของผลงานแก้ไข',
  rejected: 'ไม่ผ่านการพิจารณา',
  terminated: 'ยุติกระบวนการ',
  closed: 'ปิดงาน (ข้ามขั้นตอนที่เหลือ)',
  reassigned: 'เปลี่ยนผู้รับผิดชอบ',
  edited: 'แก้ไขข้อมูล',
};

// ค่าตั้งต้นของ Settings (key-value) — ตรง docs/DESIGN.md 4.5 / A-list ในหัวข้อ 2
function getSettingsSeed_() {
  var fiscalYear = getBuddhistYear_(new Date());
  return [
    ['org_name', 'สำนักงานเขตสุขภาพที่ 11', 'ชื่อหน่วยงานที่แสดงบนหัวกระดาษ/ใบรับเอกสาร', ''],
    ['tracking_no_prefix', 'อวช11', 'คำนำหน้าของเลขติดตามเอกสาร เช่น อวช11-2569-00218', ''],
    ['fiscal_year_current', String(fiscalYear), 'ปี พ.ศ. ที่ใช้ในเลขติดตามเอกสารปัจจุบัน', ''],
    ['last_seq_' + fiscalYear, '0', 'เลขลำดับล่าสุดของปีนี้ (ระบบเพิ่มอัตโนมัติ ห้ามแก้มือขณะมีคนใช้งาน)', ''],
    ['drive_folder_id_cover', '', 'Folder ID ใน Google Drive สำหรับเก็บภาพหน้าปก — ต้องตั้งค่าก่อนใช้งานจริง (เว้นว่างได้ ระบบจะข้ามการอัปโหลด)', ''],
    ['drive_folder_id_attachment', '', 'Folder ID ใน Google Drive สำหรับเก็บไฟล์แนบ — ต้องตั้งค่าก่อนใช้งานจริง', ''],
    ['ocr_provider', 'google_vision', 'ผู้ให้บริการ OCR ที่ใช้อ่านภาพหน้าปก', ''],
    ['ocr_api_key', '', 'API key ของ Google Cloud Vision — เว้นว่าง = ข้ามขั้นตอน OCR อัตโนมัติ (กรอกฟอร์มเองล้วนๆ)', ''],
    ['ocr_confidence_threshold', '0.7', 'ค่า confidence ต่ำกว่านี้ถือว่า OCR ไม่มั่นใจ (ไฮไลต์ให้ตรวจสอบ)', ''],
    ['max_failed_search', '5', 'จำนวนครั้งค้นหาผิดสูงสุดก่อนล็อกหน้า Tracking ชั่วคราว', ''],
    ['search_lockout_minutes', '10', 'ระยะเวลาล็อกหน้า Tracking หลังค้นหาผิดครบจำนวน (นาที)', ''],
    ['revision_reason_options', 'เอกสารไม่ครบถ้วน,ลายมือชื่อไม่ครบ,ข้อมูลในแบบฟอร์มไม่ครบ,รูปแบบผลงานไม่ถูกต้อง,ต้องแนบเอกสารเพิ่มเติม,อื่น ๆ',
      'ตัวเลือกเหตุผลในฟอร์ม "ส่งกลับให้เจ้าของผลงานแก้ไข" (คั่นด้วยจุลภาค)', ''],
    ['work_type_options', 'ผลงานเชิงวิชาการ,งานวิจัย (R2R),ผลงานเชิงนวัตกรรม,นวัตกรรมดิจิทัล,คู่มือ/แนวปฏิบัติ,อื่น ๆ',
      'ตัวเลือกประเภทผลงานในฟอร์มรับเอกสารใหม่ (คั่นด้วยจุลภาค)', ''],
    ['career_level_options', 'ปฏิบัติการ,ชำนาญการ,ชำนาญการพิเศษ,เชี่ยวชาญ,ทรงคุณวุฒิ',
      'ตัวเลือกระดับตำแหน่ง (ปัจจุบัน/ที่ขอ) ในฟอร์มรับเอกสารใหม่ (คั่นด้วยจุลภาค)', ''],
    ['web_app_base_url', '', 'URL ของ Web App หลัง Deploy ครั้งแรก — ใช้สร้างลิงก์ QR Code', ''],
  ];
}
