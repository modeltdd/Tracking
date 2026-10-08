/**
 * ค่าคงที่ของระบบ — โครงสร้างชีต, สถานี Workflow, สถานะสาธารณะ, ค่าตั้งต้น
 * ตรงตาม docs/DESIGN.md v2 (ห้ามเปลี่ยนชื่อฟิลด์โดยไม่บันทึกเหตุผลในเอกสารออกแบบก่อน)
 */

var SHEET = {
  WORKS: 'Works',
  STATUS_HISTORY: 'StatusHistory',
  WORK_STATIONS: 'WorkStations',
  WORKFLOW_STATES: 'WorkflowStates',
  WORKFLOW_TRANSITIONS: 'WorkflowTransitions',
  USERS: 'Users',
  SETTINGS: 'Settings',
  AUDIT_LOG: 'AuditLog',
  SEARCH_LOG: 'SearchLog',
  MASTER_POSITIONS: 'MasterPositions',
  // 2026-09-15 (รอบ 3) — เลิกใช้ MasterMedicalDomains/MasterMedicalSpecialties (โครง 2 ชั้น ด้าน→สาขา เฉพาะ
  // นายแพทย์) หลังพบจาก Excel จริง 244 รายว่า "ด้าน" มีแค่ชั้นเดียวและมีทุกตำแหน่ง ไม่ใช่แค่นายแพทย์ — แทนที่ด้วย
  // MASTER_SPECIALTIES (generic, ผูกกับ position_code) ชีตเก่า 2 อันไม่ลบทิ้ง (มีข้อมูลจาก seed ครั้งก่อนอยู่แล้ว
  // บนชีต production) แค่ไม่มีโค้ดจุดไหนอ้างอิงอีกต่อไป
  MASTER_MEDICAL_DOMAINS: 'MasterMedicalDomains',
  MASTER_MEDICAL_SPECIALTIES: 'MasterMedicalSpecialties',
  MASTER_SPECIALTIES: 'MasterSpecialties',
  // 2026-09-16 (รอบ 2) — โครงสร้างคณะกรรมการ/ประธาน/เลขานุการ (ดู CommitteeMigration.gs) สร้างใหม่คู่ขนาน ไม่มี
  // ชีต "ประธาน"/"เลขา"/"เลขา2" อยู่ในระบบจริงมาก่อน จึงไม่มีอะไรถูกทับ/ลบ
  CHAIR_MASTER: 'ChairMaster',
  SECRETARY_MASTER: 'SecretaryMaster',
  COMMITTEE_SECRETARY_MAP: 'CommitteeSecretaryMap',
  // 2026-10-06 — Login สำหรับเจ้าของผลงาน (ดู OwnerAuth.gs)
  OWNER_SESSIONS: 'OwnerSessions',
  OWNER_LOGIN_LOG: 'OwnerLoginLog',
  // 2026-10-07 — Master Data หน่วยงานเขตสุขภาพที่ 11 (ดู OrganizationMasterSeed.gs/Setup.gs)
  ORGANIZATION_MASTER: 'OrganizationMaster',
};

var SHEET_HEADERS = {};
SHEET_HEADERS[SHEET.WORKS] = [
  'work_id', 'tracking_no', 'qr_token', 'citizen_id_last4', 'citizen_id_encrypted', 'citizen_id_hash',
  'title_name', 'first_name', 'last_name', 'position', 'current_level', 'requested_level',
  'work_type', 'work_title', 'org_from', 'phone', 'email', 'cover_image_url', 'received_date',
  'current_station_key', 'current_status_public', 'handoff_pending', 'current_owner_org',
  'current_handler_name', 'updated_at', 'next_step_text', 'created_by', 'created_at', 'evaluation_result',
  // เพิ่ม 2026-09-15 (ลดฟิลด์ลงทะเบียน + ตำแหน่ง/ข้อมูลแพทย์แบบ Master Data) — append ท้ายสุดเจตนา ห้าม reorder
  // ของเดิม สำหรับชีต Works ที่มีข้อมูลอยู่แล้วต้องรัน migrateAddWorksColumns_() (Setup.gs) เติม header จริงก่อนใช้
  'position_no', 'medical_domain', 'medical_specialty',
  // เพิ่ม 2026-09-15 (รอบ 2) — จังหวัดในพื้นที่เขตสุขภาพที่ 11 (dropdown คู่กับ org_from ตอนลงทะเบียน)
  'province',
  // เพิ่ม 2026-09-15 (รอบ 3) — "ด้าน/สาขา" generic ทุกตำแหน่ง (แทน medical_domain/medical_specialty ที่เลิกใช้
  // แล้ว — คอลัมน์เดิมทั้งสองยังอยู่ เขียนค่าว่างไปตลอด ไม่ลบทิ้งตามหลักของโปรเจกต์)
  'specialty',
  // เพิ่ม 2026-09-16 (migrate ข้อมูลเก่าจาก Google Sheet ชุดล่าสุด — ดู LegacyMigration.gs) — secretary/
  // requested_org_position เป็นฟิลด์ใหม่จริง (ไม่เคยมีในระบบ), legacy_seq ใช้กันนำเข้าซ้ำ (ลำดับต้นฉบับ ไม่ซ้ำ
  // เลยทั้ง 240 แถว), legacy_team เก็บไว้เผื่อทำ CommitteeMaster ในอนาคต (ยังไม่ใช้งานจริงตอนนี้)
  'secretary', 'requested_org_position', 'report_period', 'legacy_seq', 'legacy_team',
  // เพิ่ม 2026-09-21 — เชื่อมโยง Registration กับคณะกรรมการจริง (ChairMaster) ตอนลงทะเบียน: บันทึก committee_code
  // ที่ auto-suggest ได้ (หรือที่เจ้าหน้าที่เลือกเองกรณีตำแหน่งมีหลายคณะแยกไม่ได้ด้วยข้อมูลที่มี เช่น พยาบาลวิชาชีพ/
  // นักวิชาการสาธารณสุข — ดู resolveCommitteeForRegistration_ ใน CommitteeMigration.gs) ว่างได้ถ้าตำแหน่งนั้นยัง
  // ไม่มีคณะกรรมการในระบบ (ChairMaster ยังไม่ครอบคลุม)
  'committee_code',
  // เพิ่ม 2026-10-06 (Login สำหรับเจ้าของผลงาน) — รหัสผ่าน (hash, ไม่เก็บ plaintext) ที่ Admin ตั้ง/รีเซ็ตให้เป็น
  // รายกรณีผ่านหน้ารายละเอียดผลงาน ว่างได้เสมอ: ถ้าว่าง verifyOwnerLoginCode_ (OwnerAuth.gs) จะ fallback ไป
  // เทียบกับ tracking_no ของงานนั้นตรงๆ แทน (ผู้ใช้ยืนยันแล้ว — ไม่มี field รหัสลับจริงเดิม จึงใช้ tracking_no
  // เป็นค่าเริ่มต้นได้ทันทีทั้งงานเก่า/ใหม่ โดยไม่ต้อง migrate ข้อมูลใดๆ)
  'owner_login_code_hash',
  // เพิ่ม 2026-10-07 (Master Data หน่วยงานเขตสุขภาพที่ 11) — เชื่อม Works กับ OrganizationMaster แบบมี key จริง
  // (organization_id = รหัสหน่วยงาน9หลัก) org_from/province เดิมยังเขียนค่าเหมือนเดิมทุกประการ (ชื่อ/จังหวัดจริง
  // จาก master ที่เลือก) ไม่ทำให้ข้อมูลเดิมเสีย งานเก่าก่อนหน้านี้จะมีค่าว่างใน 2 คอลัมน์นี้ (ยังไม่เคยผูก master)
  'organization_id', 'organization_code',
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
// เหมือน WORK_STATIONS เดิมทุกคอลัมน์ ตัดแค่ next_station_key ออก (1 state ไปได้หลายทางแล้ว ดู WORKFLOW_TRANSITIONS)
// — คงชื่อคอลัมน์เดิมไว้เจตนา ให้ getStationsMap_/listStationsSorted_/ฯลฯ ใช้โค้ดเดิมได้โดยไม่ต้องแก้จุดอ่านข้อมูล
SHEET_HEADERS[SHEET.WORKFLOW_STATES] = [
  'station_key', 'station_order', 'station_name', 'org', 'standard_days',
  'public_status', 'receive_role', 'approve_role', 'notify_method', 'active', 'public_hint',
];
SHEET_HEADERS[SHEET.WORKFLOW_TRANSITIONS] = [
  'transition_id', 'from_state', 'to_state', 'button_label', 'requires_note', 'result_value', 'active',
];
SHEET_HEADERS[SHEET.USERS] = ['user_email', 'display_name', 'role', 'organization', 'active'];
SHEET_HEADERS[SHEET.SETTINGS] = ['setting_key', 'setting_value', 'description', 'updated_at'];
SHEET_HEADERS[SHEET.AUDIT_LOG] = [
  'audit_id', 'timestamp', 'user_email', 'action', 'work_id', 'field_changed', 'old_value', 'new_value',
];
SHEET_HEADERS[SHEET.SEARCH_LOG] = [
  'log_id', 'timestamp', 'tracking_no_attempt', 'citizen_id_last4_attempt', 'success', 'session_token',
];
// Master Data ใหม่ 2026-09-15 (ตำแหน่ง/ด้าน/สาขาแพทย์) — แก้ไข/เพิ่มรายการได้จากหน้า Admin > ข้อมูลหลัก
// โดยไม่ต้องแก้ source code (ดูแผนในแชท requirement ข้อ Q)
SHEET_HEADERS[SHEET.MASTER_POSITIONS] = ['position_code', 'position_name', 'professional_group', 'active', 'sort_order'];
SHEET_HEADERS[SHEET.MASTER_MEDICAL_DOMAINS] = ['domain_code', 'domain_name', 'active', 'sort_order'];
SHEET_HEADERS[SHEET.MASTER_MEDICAL_SPECIALTIES] = ['specialty_code', 'specialty_name', 'domain_code', 'active', 'sort_order'];
// generic "ด้าน/สาขา" ผูกกับตำแหน่งโดยตรง (position_code) ใช้กับทุกตำแหน่ง ไม่ใช่แค่นายแพทย์ (แทน MasterMedicalDomains/Specialties)
SHEET_HEADERS[SHEET.MASTER_SPECIALTIES] = ['specialty_code', 'specialty_name', 'position_code', 'active', 'sort_order'];
// โครงสร้างคณะกรรมการ/ประธาน/เลขานุการ 2026-09-16 (รอบ 2) — ดู CommitteeMigration.gs, schema ตามที่ผู้ใช้กำหนด
SHEET_HEADERS[SHEET.CHAIR_MASTER] = [
  'chair_id', 'committee_code', 'profession', 'field', 'specialty', 'team_no', 'chair_name', 'chair_position',
  'organization', 'province', 'active', 'start_date', 'end_date', 'note',
];
SHEET_HEADERS[SHEET.SECRETARY_MASTER] = ['secretary_id', 'name', 'position', 'organization', 'province', 'email', 'phone', 'active', 'note'];
SHEET_HEADERS[SHEET.COMMITTEE_SECRETARY_MAP] = [
  'map_id', 'committee_code', 'profession', 'field', 'specialty', 'team_no', 'secretary_id', 'role', 'sequence', 'active', 'note',
];

// Login สำหรับเจ้าของผลงาน 2026-10-06 (ดู OwnerAuth.gs) — session เก็บเป็นชีต (ไม่ใช่ CacheService) เพราะต้อง
// รองรับอายุ session ได้ถึง 8 ชม. (CacheService เพดานจริง 6 ชม.) และให้ Admin ตรวจสอบ/audit ย้อนหลังได้จากชีตตรงๆ
SHEET_HEADERS[SHEET.OWNER_SESSIONS] = ['owner_session_id', 'work_id', 'owner_name', 'login_at', 'expires_at', 'active'];
// log การพยายาม login ของเจ้าของผลงานทุกครั้ง (สำเร็จ/ล้มเหลว) — ไม่เก็บรหัสผ่านใดๆ ตามที่ผู้ใช้กำชับ (ข้อ 19)
SHEET_HEADERS[SHEET.OWNER_LOGIN_LOG] = ['log_id', 'timestamp', 'work_id_attempt', 'owner_name_attempt', 'result', 'session_token'];

// Master Data หน่วยงาน เขตสุขภาพที่ 11 (2026-10-07) — import จาก Excel จริงครั้งเดียว ดู OrganizationMasterSeed.gs
// organization_id = รหัสหน่วยงาน9หลัก จริง (ตรวจแล้วไม่ซ้ำกันเลยสักรายการใน 877 แถว ใช้เป็น key ได้ปลอดภัย
// ตามที่ผู้ใช้กำหนด "ห้ามใช้ชื่อหน่วยงานอย่างเดียวเป็น key")
SHEET_HEADERS[SHEET.ORGANIZATION_MASTER] = [
  'organization_id', 'organization_code', 'organization_code_9', 'organization_type', 'organization_name',
  'organization_full_name', 'health_region', 'province_name', 'district_name', 'active',
];
// ประเภทหน่วยงาน 6 แบบ ตามที่ผู้ใช้กำหนด (ตรงกับค่าจริงที่ map มาจากคอลัมน์ "ประเภทหน่วยงาน" ในไฟล์ Excel/ชื่อชีต)
var ORGANIZATION_TYPE_OPTIONS_ = ['สสจ.', 'สสอ.', 'รพ.สต.', 'รพศ.', 'รพท.', 'รพช.'];

// สถานี Workflow เริ่มต้น — ตรงกระบวนการจริงที่ผู้ใช้ให้มา (2026-09-02) แทนชุดเดิม
// แก้ไขได้ภายหลังจากหน้า "จัดการ Workflow" ไม่กระทบ record ที่มีอยู่ เพราะ Works อ้างสถานีด้วย station_key ไม่ใช่ลำดับแถว
//
// รอบพิจารณาที่ 2 (กรณี "แก้ไข") ไม่มีสถานีแยกต่างหาก — ใช้สถานี secretary_send/chair_schedule/
// committee_review/secretary_announce ชุดเดิมซ้ำ โดย Admin ใช้ action "เปลี่ยนผู้รับผิดชอบ" (reassigned)
// เลือกช่อง "ย้ายไปสถานี" กลับไปที่ secretary_send ด้วยตนเองหลังได้รับเอกสารที่แก้ไขแล้วกลับมา
// (forwarded ทำไม่ได้เพราะ next_station_key ของ secretary_announce ชี้ไป final_announce ทางเดียว
// ใช้กับทั้งเคสผ่าน/ไม่ผ่าน — ดู docs/DESIGN.md ก่อนแก้)
var WORKSTATIONS_SEED = [
  { key: 'received', order: 1, name: 'รับเรื่องจากหน่วยงาน', org: 'สนง เขต',
    days: 3, next: 'checking', pub: 'received', receiveRole: 'เจ้าหน้าที่รับเอกสาร', approveRole: '-', notify: 'ไม่มี' },
  { key: 'checking', order: 2, name: 'ตรวจสอบเอกสาร', org: 'สนง เขต',
    days: 5, next: 'secretary_send', pub: 'checking', receiveRole: 'เจ้าหน้าที่รับเอกสาร', approveRole: '-', notify: 'ไม่มี' },
  { key: 'secretary_send', order: 3, name: 'เลขาส่งเอกสารให้กรรมการ', org: 'เลขา',
    days: 3, next: 'chair_schedule', pub: 'in_review', receiveRole: 'เจ้าหน้าที่ผู้รับผิดชอบ', approveRole: '-', notify: 'ไม่มี' },
  { key: 'chair_schedule', order: 4, name: 'ประธานนัดประชุม', org: 'ประธานกรรมการ',
    days: 7, next: 'committee_review', pub: 'in_review', receiveRole: 'เจ้าหน้าที่ผู้รับผิดชอบ', approveRole: '-', notify: 'ไม่มี' },
  { key: 'committee_review', order: 5, name: 'กรรมการประชุมพิจารณา', org: 'กรรมการ',
    days: 15, next: 'secretary_announce', pub: 'in_review', receiveRole: 'เจ้าหน้าที่ผู้รับผิดชอบ', approveRole: 'กรรมการ', notify: 'ไม่มี' },
  { key: 'secretary_announce', order: 6, name: 'เลขาแจ้งผลการพิจารณา มาที่ สนง เขต', org: 'เลขา',
    days: 3, next: 'final_announce', pub: 'pending_approval', receiveRole: 'เจ้าหน้าที่ผู้รับผิดชอบ', approveRole: '-', notify: 'ไม่มี' },
  { key: 'final_announce', order: 7, name: 'แจ้งผลหน่วยงาน (ผ่าน/ไม่ผ่าน)', org: 'สนง เขต',
    days: 3, next: '', pub: 'done', receiveRole: 'เจ้าหน้าที่รับเอกสาร', approveRole: '-', notify: 'เตรียมไว้สำหรับ LINE/SMS ในระยะถัดไป' },
];
// WORKSTATIONS_SEED/ชีต WorkStations เดิมด้านบน "เลิกใช้งานแล้ว" (แทนที่ด้วย WORKFLOW_STATES_SEED/
// WORKFLOW_TRANSITIONS_SEED ด้านล่าง — โมเดล 24-state รองรับแตกสาย/วนกลับ, 2026-09-08) — ไม่ลบทิ้ง
// เพราะห้ามลบข้อมูลเดิม เก็บไว้เป็นหลักฐาน/ยังเปิดดูได้ในชีต Google Sheet ตามปกติ

// 24 state ตามกระบวนการจริงที่ผู้ใช้กำหนด (2026-09-08) — org: 'ORG_FROM' = ค่าพิเศษ แปลว่าให้ resolve
// เป็น work.org_from ของงานนั้น ๆ แทน (ดู resolveResponsibleOrg_ ใน Search.gs) เพราะแต่ละงานมีหน่วยงาน
// ต้นสังกัดต่างกัน ไม่ใช่ org คงที่แบบ 4 หน่วยงานหลัก (สนง เขต/เลขา/ประธานกรรมการ/กรรมการ)
// order เก็บเป็น "String" เจตนา (ไม่ใช่ Number) เพื่อรองรับเลขลำดับย่อยแบบทศนิยม เช่น "3.1"/"8.4" โดยไม่ชนกับ
// สถานีอื่นในกลุ่มเดียวกัน (เดิมทุกสถานีในกลุ่ม 7.x/8.x/9.x ใช้เลขเต็มซ้ำกันหมด เช่น 7,7,7,7,7 ทำให้คอลัมน์
// "ลำดับ" ในหน้า Admin แสดงซ้ำกันจนแยกไม่ออก) เรียงลำดับด้วย compareStationOrder_() (Utils.gs, parseFloat
// เทียบเชิงตัวเลขจริง ไม่ใช่เทียบ string ตรงๆ ที่จะทำให้ "10" มาก่อน "2")
var WORKFLOW_STATES_SEED = [
  { key: 's1', order: '1', name: 'รับเรื่องจากหน่วยงาน', org: 'สนง เขต', days: 3, pub: 'received' },
  { key: 's2', order: '2', name: 'ตรวจสอบเอกสาร', org: 'สนง เขต', days: 5, pub: 'checking' },
  // 2026-10-07 ผู้ใช้ขอเพิ่ม — เดิม 2 แตกสายตรงไป 3.1/3.2 เลย (ไม่มี state หลักคั่นกลาง) ตอนนี้เพิ่ม "3" เป็น
  // ขั้นตอนจริงที่เจ้าหน้าที่ต้องกดส่งเอกสารเข้ามาก่อน (เหมือน pattern เดียวกับ state 7 ที่มีอยู่แล้ว: 6->7(bare)
  // ->แตกสาย 7.1-7.4) แล้วค่อยกดตัดสินครบถ้วน/ไม่ครบถ้วนแยกจาก 3 อีกที (3->3.1 หรือ 3->3.2)
  { key: 's3', order: '3', name: 'ส่งเอกสารให้เลขาคณะกรรมการฯ', org: 'สนง เขต', days: 1, pub: 'checking' },
  { key: 's3_1', order: '3.1', name: 'ครบถ้วน-ส่งเลขา', org: 'สนง เขต', days: 1, pub: 'checking' },
  { key: 's3_2', order: '3.2', name: 'ไม่ครบถ้วน-ส่งคืนหน่วยงาน', org: 'ORG_FROM', days: 7, pub: 'need_revision',
    hint: 'เอกสารส่งกลับให้หน่วยงานต้นสังกัดเนื่องจากไม่ครบถ้วน กรุณาติดต่อหน่วยงานต้นสังกัดเพื่อจัดเตรียมเอกสารเพิ่มเติมและส่งกลับมาใหม่' },
  // 2026-09-25: เคยเพิ่ม 3.3 เป็นขั้นกลาง (3.2->3.3->2) — 2026-10-07 ผู้ใช้ขอเอาออก (ปิด active เท่านั้น ไม่ลบ
  // แถวทิ้ง กันกระทบ StatusHistory/Timeline เก่าที่เคยอ้างอิง) 3.2 กลับไปใช้เส้นทางเดิมก่อนมี 3.3 คือ 3.2->2 ตรงๆ
  // (reactivate transition s3_2_s2 เดิมที่ถูกปิดไว้ตอนเพิ่ม 3.3 — ไม่ใช่เส้นทางใหม่ที่เดาขึ้นเอง)
  { key: 's3_3', order: '3.3', name: 'ไม่ครบถ้วน-รอเจ้าของผลงานแก้ไข', org: 'ORG_FROM', days: 7, pub: 'need_revision',
    hint: 'เอกสารไม่ครบถ้วน อยู่ระหว่างรอเจ้าของผลงานจัดเตรียมเอกสารเพิ่มเติมให้ครบถ้วน กรุณาส่งเอกสารที่จัดเตรียมเสร็จแล้วกลับผ่านหน่วยงานต้นสังกัดโดยเร็ว' },
  { key: 's4', order: '4', name: 'เลขาส่งเอกสารให้กรรมการ', org: 'เลขา', days: 3, pub: 'in_review' },
  { key: 's5', order: '5', name: 'ประธานนัดประชุม', org: 'ประธานกรรมการ', days: 7, pub: 'in_review' },
  { key: 's6', order: '6', name: 'กรรมการประชุมพิจารณา (รอสรุปผล)', org: 'กรรมการ', days: 15, pub: 'in_review' },
  { key: 's7', order: '7', name: 'เลขาแจ้งผลการพิจารณามาที่ สนง เขต', org: 'เลขา', days: 3, pub: 'pending_approval' },
  { key: 's7_1', order: '7.1', name: 'ผ่าน (ผ่านการประเมิน)', org: 'สนง เขต', days: 3, pub: 'pending_approval' },
  { key: 's7_2', order: '7.2', name: 'แก้ไข 2 เดือน (ปรับปรุงแก้ไขไม่เป็นสาระสำคัญ)', org: 'สนง เขต', days: 3, pub: 'need_revision',
    hint: 'กรุณาปรับแก้ผลงานตามข้อเสนอแนะ และส่งเอกสารฉบับแก้ไขกลับภายใน 2 เดือน ผ่านหน่วยงานต้นสังกัด' },
  { key: 's7_3', order: '7.3', name: 'แก้ไข 6 เดือน (ปรับปรุงแก้ไขสาระสำคัญ)', org: 'สนง เขต', days: 3, pub: 'need_revision',
    hint: 'กรุณาปรับแก้ผลงานตามข้อเสนอแนะ และส่งเอกสารฉบับแก้ไขกลับภายใน 6 เดือน ผ่านหน่วยงานต้นสังกัด' },
  { key: 's7_4', order: '7.4', name: 'ไม่ผ่าน (ไม่ผ่านการประเมิน)', org: 'สนง เขต', days: 3, pub: 'pending_approval' },
  { key: 's8_1', order: '8.1', name: 'สนง เขต แจ้งผลหน่วยงาน', org: 'สนง เขต', days: 5, pub: 'need_revision' },
  { key: 's8_2', order: '8.2', name: 'หน่วยงานแจ้งผลเจ้าของผลงาน', org: 'ORG_FROM', days: 5, pub: 'need_revision',
    hint: 'อยู่ระหว่างการแก้ไขผลงานตามข้อเสนอแนะของคณะกรรมการ กรุณาส่งเอกสารฉบับแก้ไขกลับผ่านหน่วยงานต้นสังกัดโดยเร็ว' },
  { key: 's8_3', order: '8.3', name: 'เจ้าของผลงานแก้ไขเอกสาร', org: 'ORG_FROM', days: 45, pub: 'need_revision',
    hint: 'อยู่ระหว่างการแก้ไขผลงานตามข้อเสนอแนะของคณะกรรมการ กรุณาส่งเอกสารฉบับแก้ไขกลับผ่านหน่วยงานต้นสังกัดโดยเร็ว' },
  { key: 's8_4', order: '8.4', name: 'เจ้าของผลงานส่งเอกสารแก้ไขกลับหน่วยงาน', org: 'ORG_FROM', days: 5, pub: 'need_revision',
    hint: 'อยู่ระหว่างการแก้ไขผลงานตามข้อเสนอแนะของคณะกรรมการ กรุณาส่งเอกสารฉบับแก้ไขกลับผ่านหน่วยงานต้นสังกัดโดยเร็ว' },
  { key: 's8_5', order: '8.5', name: 'หน่วยงานส่งเอกสารแก้ไขกลับ สนง เขต', org: 'ORG_FROM', days: 5, pub: 'need_revision' },
  { key: 's8_6', order: '8.6', name: 'สนง เขต ส่งเอกสารแก้ไขให้เลขา', org: 'สนง เขต', days: 3, pub: 'in_review' },
  { key: 's9_1', order: '9.1', name: 'เลขาส่งเอกสารให้กรรมการ ครั้งที่ 2', org: 'เลขา', days: 3, pub: 'in_review' },
  { key: 's9_2', order: '9.2', name: 'ประธานนัดประชุม ครั้งที่ 2', org: 'ประธานกรรมการ', days: 7, pub: 'in_review' },
  { key: 's9_3', order: '9.3', name: 'กรรมการประชุมพิจารณา ครั้งที่ 2', org: 'กรรมการ', days: 15, pub: 'in_review' },
  { key: 's9_4', order: '9.4', name: 'เลขาแจ้งผลการพิจารณา ครั้งที่ 2 มาที่ สนง เขต', org: 'เลขา', days: 3, pub: 'pending_approval' },
  // 2026-09-15: ผู้ใช้ยืนยันว่า s10 เดิมคือขั้น "ส่งต่อให้ผู้ว่าราชการจังหวัด/แจ้งผลหน่วยงาน" อยู่แล้วในตัว
  // (เข้าใจผิดตอนแรกว่าเป็นขั้นตกหล่นต้องเพิ่ม state ใหม่ — ไม่ต้องเพิ่มแล้ว ใช้ s10 เดิมนี่แหละ)
  { key: 's10', order: '10', name: 'แจ้งผลหน่วยงาน (ผ่าน/ไม่ผ่าน)', org: 'สนง เขต', days: 3, pub: 'done' },
];

/**
 * Owner-facing label ต่อ state (2026-10-08 ตามที่ผู้ใช้ขอ) — ข้อความอ่านง่ายสำหรับหน้า "ผลงานของฉัน" เท่านั้น
 * แยกออกจาก station_name ภายใน (Staff/Admin ยังเห็น station_name เดิมทุกที่ ไม่แตะ) เก็บเป็น constant ใน
 * โค้ด ไม่ใช่คอลัมน์ใหม่บนชีต WorkflowStates — ไม่กระทบ state code/WorkflowMaster logic ใดๆ ตามที่ผู้ใช้กำชับ
 * (เพิ่ม/แก้ข้อความที่นี่ไม่ต้อง migrate ชีต) key ต้องตรงกับ station_key ใน WORKFLOW_STATES_SEED ด้านบนเป๊ะ
 * state ไหนไม่มีใน map นี้ (เช่น state ใหม่ที่เพิ่มทีหลังแล้วลืมเติม) โค้งที่เรียกใช้ต้อง fallback ไปใช้ชื่อ
 * internal เดิมเสมอ (ดู ownerLabelForStation_, Utils.gs) ห้ามแสดงหน้าเปล่า/undefined
 */
var OWNER_STATE_LABELS_ = {
  s1: 'สำนักงานเขตรับเรื่องของท่านแล้ว',
  s2: 'อยู่ระหว่างตรวจสอบความครบถ้วนของเอกสาร',
  // 2026-10-08 รอบ 2 — ผู้ใช้ขอเปลี่ยนข้อความตรงๆ เป็น "ส่งเอกสารให้เลขาคณะกรรมการฯ" (ตรงกับชื่อภายใน s3 เป๊ะ)
  // แทนคำบรรยายเดิม "เอกสารถูกส่งเข้าสู่กระบวนการพิจารณาแล้ว"
  s3: 'ส่งเอกสารให้เลขาคณะกรรมการฯ',
  s3_1: 'เอกสารครบถ้วน และส่งต่อเพื่อดำเนินการแล้ว',
  s3_2: 'เอกสารยังไม่ครบถ้วน และถูกส่งกลับเพื่อแก้ไข',
  s3_3: 'เอกสารยังไม่ครบถ้วน และถูกส่งกลับเพื่อแก้ไข', // state เดิมที่เลิกใช้แล้ว (ดู migrateAddState3Hub) เก็บไว้เผื่องานเก่าอ้างถึง
  s4: 'เอกสารถูกส่งให้คณะกรรมการพิจารณาแล้ว',
  s5: 'อยู่ระหว่างกำหนดวันประชุมพิจารณา',
  s6: 'อยู่ระหว่างการพิจารณาของคณะกรรมการ',
  s7: 'ผลการพิจารณาถูกส่งมายังสำนักงานเขตแล้ว',
  s7_1: 'ผ่านการประเมิน',
  s7_2: 'ให้ปรับปรุงแก้ไขภายใน 2 เดือน',
  s7_3: 'ให้ปรับปรุงแก้ไขภายใน 6 เดือน',
  s7_4: 'ไม่ผ่านการประเมิน',
  s8_1: 'สำนักงานเขตแจ้งผลให้หน่วยงานต้นสังกัดแล้ว',
  s8_2: 'หน่วยงานต้นสังกัดแจ้งผลให้ท่านแล้ว',
  s8_3: 'อยู่ระหว่างที่ท่านปรับปรุงแก้ไขเอกสาร',
  s8_4: 'ท่านส่งเอกสารแก้ไขกลับหน่วยงานแล้ว',
  s8_5: 'หน่วยงานส่งเอกสารแก้ไขกลับสำนักงานเขตแล้ว',
  s8_6: 'เอกสารแก้ไขถูกส่งเข้าสู่การพิจารณาอีกครั้ง',
  s9_1: 'เอกสารถูกส่งให้คณะกรรมการพิจารณาครั้งที่ 2 แล้ว',
  s9_2: 'อยู่ระหว่างกำหนดวันประชุมพิจารณาครั้งที่ 2',
  s9_3: 'อยู่ระหว่างการพิจารณาของคณะกรรมการครั้งที่ 2',
  s9_4: 'ผลการพิจารณาครั้งที่ 2 ถูกส่งมายังสำนักงานเขตแล้ว',
  // 2026-10-08 รอบ 2 — ปรับคำให้ใช้ได้ทั้งตอนเป็น "สถานะปัจจุบัน" และตอนเป็น "ขั้นตอนถัดไป" (Next Step Card
  // ใหม่) เดิม "กระบวนการพิจารณาเสร็จสิ้น และแจ้งผลแล้ว" เป็นอดีตกาลอย่างเดียว ใช้เป็นคำบอก "ขั้นตอนถัดไป" ไม่ได้
  // (ยังไม่เกิดขึ้นจริง) ความหมายเดิมยังคงอยู่ แค่ตัดกาลอดีตออก ตรงกับ acceptance test "แจ้งผลให้หน่วยงาน" ด้วย
  s10: 'แจ้งผลให้หน่วยงานต้นสังกัด',
};

// เส้นทาง (transition) ระหว่าง state — 1 state ไปได้หลายทางถ้ามีมากกว่า 1 แถวที่ from ตรงกัน (จุดตัดสินใจ)
// result_value: ถ้าไม่ว่าง จะเขียนลง Works.evaluation_result ตอนกดปุ่มนี้ (ใช้เป็นตัวกรอง "ผลการพิจารณา")
var WORKFLOW_TRANSITIONS_SEED = [
  { id: 's1_s2', from: 's1', to: 's2', label: 'รับเอกสารและเริ่มตรวจสอบ', note: false, result: '' },
  // 2026-10-07: เดิม 2 แตกสายตรงไป 3.1/3.2 — ยกเลิกแล้ว (ปิด active บนชีตจริงผ่าน migrateAddState3Hub(),
  // ไม่ลบทิ้ง) แทนที่ด้วย s2_s3 (2->3 ขั้นตอนจริงใหม่) + s3_s3_1/s3_s3_2 (3 แตกสายแทน 2 เดิม) ด้านล่าง
  { id: 's2_s3_1', from: 's2', to: 's3_1', label: 'ครบถ้วน → ส่งเลขา', note: false, result: '' },
  { id: 's2_s3_2', from: 's2', to: 's3_2', label: 'ไม่ครบถ้วน → ส่งคืนหน่วยงาน', note: true, result: '' },
  { id: 's2_s3', from: 's2', to: 's3', label: 'ส่งเอกสารให้เลขาคณะกรรมการฯ', note: false, result: '' },
  { id: 's3_s3_1', from: 's3', to: 's3_1', label: 'ครบถ้วน → ส่งเลขา', note: false, result: '' },
  { id: 's3_s3_2', from: 's3', to: 's3_2', label: 'ไม่ครบถ้วน → ส่งคืนหน่วยงาน', note: true, result: '' },
  { id: 's3_1_s4', from: 's3_1', to: 's4', label: 'ส่งเอกสารให้เลขาแล้ว', note: false, result: '' },
  // 2026-09-25: เดิม s3_2_s2 ตรงๆ — แยกเป็น 2 ขั้นผ่าน s3_3 ใหม่ (ดูเหตุผลที่ WORKFLOW_STATES_SEED ข้อ s3_3)
  { id: 's3_2_s3_3', from: 's3_2', to: 's3_3', label: 'แจ้งเจ้าของผลงานแล้ว', note: false, result: '' },
  { id: 's3_3_s2', from: 's3_3', to: 's2', label: 'ส่งเอกสารกลับมาแล้ว (ตรวจสอบใหม่)', note: false, result: '' },
  { id: 's4_s5', from: 's4', to: 's5', label: 'ส่งให้ประธานนัดประชุมแล้ว', note: false, result: '' },
  { id: 's5_s6', from: 's5', to: 's6', label: 'นัดประชุมแล้ว → เข้าสู่การพิจารณา', note: false, result: '' },
  { id: 's6_s7', from: 's6', to: 's7', label: 'สรุปผลแล้ว → แจ้ง สนง เขต', note: false, result: '' },
  { id: 's7_s7_1', from: 's7', to: 's7_1', label: 'ผ่าน', note: false, result: 'ผ่าน' },
  { id: 's7_s7_2', from: 's7', to: 's7_2', label: 'แก้ไข 2 เดือน', note: false, result: 'แก้ไข 2 เดือน' },
  { id: 's7_s7_3', from: 's7', to: 's7_3', label: 'แก้ไข 6 เดือน', note: false, result: 'แก้ไข 6 เดือน' },
  { id: 's7_s7_4', from: 's7', to: 's7_4', label: 'ไม่ผ่าน', note: false, result: 'ไม่ผ่าน' },
  { id: 's7_1_s10', from: 's7_1', to: 's10', label: 'แจ้งผลหน่วยงาน', note: false, result: '' },
  { id: 's7_4_s10', from: 's7_4', to: 's10', label: 'แจ้งผลหน่วยงาน', note: false, result: '' },
  { id: 's7_2_s8_1', from: 's7_2', to: 's8_1', label: 'เริ่มกระบวนการแก้ไข (2 เดือน)', note: false, result: '' },
  { id: 's7_3_s8_1', from: 's7_3', to: 's8_1', label: 'เริ่มกระบวนการแก้ไข (6 เดือน)', note: false, result: '' },
  { id: 's8_1_s8_2', from: 's8_1', to: 's8_2', label: 'แจ้งผลหน่วยงานแล้ว', note: false, result: '' },
  { id: 's8_2_s8_3', from: 's8_2', to: 's8_3', label: 'แจ้งเจ้าของผลงานแล้ว', note: false, result: '' },
  { id: 's8_3_s8_4', from: 's8_3', to: 's8_4', label: 'เจ้าของผลงานแก้ไขเสร็จแล้ว', note: false, result: '' },
  { id: 's8_4_s8_5', from: 's8_4', to: 's8_5', label: 'ส่งเอกสารแก้ไขกลับ สนง เขต แล้ว', note: false, result: '' },
  { id: 's8_5_s8_6', from: 's8_5', to: 's8_6', label: 'ส่งเอกสารแก้ไขให้เลขาแล้ว', note: false, result: '' },
  { id: 's8_6_s9_1', from: 's8_6', to: 's9_1', label: 'เข้าสู่รอบพิจารณาที่ 2', note: false, result: '' },
  { id: 's9_1_s9_2', from: 's9_1', to: 's9_2', label: 'ส่งให้ประธานนัดประชุม (รอบ 2)', note: false, result: '' },
  { id: 's9_2_s9_3', from: 's9_2', to: 's9_3', label: 'นัดประชุมแล้ว (รอบ 2)', note: false, result: '' },
  { id: 's9_3_s9_4', from: 's9_3', to: 's9_4', label: 'สรุปผลแล้ว → แจ้ง สนง เขต (รอบ 2)', note: false, result: '' },
  { id: 's9_4_s10_pass', from: 's9_4', to: 's10', label: 'ผ่าน (รอบ 2)', note: false, result: 'ผ่าน' },
  { id: 's9_4_s10_fail', from: 's9_4', to: 's10', label: 'ไม่ผ่าน (รอบ 2)', note: false, result: 'ไม่ผ่าน' },
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

// ชื่อเดือนไทย (index 0 = เดือน 1) — ใช้ที่ Dashboard ผู้รับผิดชอบ (dropdown เดือน + ข้อความสรุปภาพรวม)
// ปียังใช้ ค.ศ. ตรงกับ formatDateTh_/ทั้งระบบเดิม (ไม่มีการแปลง พ.ศ. ที่ไหนในระบบนี้มาก่อน)
var THAI_MONTHS_ = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

// ชื่อเดือนย่อ (2026-09-24) — ใช้กับ formatDateThShort_ เฉพาะหน้าติดตามผลงาน/สถานะปัจจุบัน ตามที่ผู้ใช้ขอ
// รูปแบบ "24 ก.ย. 2569 เวลา 10.15 น." (formatDateTh_ เดิม 24 ชม./คั่นด้วย : ยังใช้ที่อื่นเหมือนเดิมไม่แตะ)
var THAI_MONTHS_SHORT_ = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];

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
  reassigned: 'เปลี่ยนผู้รับผิดชอบ/ย้ายสถานี',
  edited: 'แก้ไขข้อมูล',
  status_updated: 'ปรับสถานะ (ทะเบียนผลงานทั้งหมด)',
  transition: 'เปลี่ยนสถานะ',
  INITIAL_IMPORT: 'นำเข้าข้อมูลเดิมจากระบบก่อนหน้า (ไม่มีรายละเอียด Timeline ย้อนหลังก่อนวันนี้)',
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
    ['max_failed_search', '5', 'จำนวนครั้งค้นหาผิดสูงสุดก่อนล็อกหน้า Tracking ชั่วคราว', ''],
    ['search_lockout_minutes', '10', 'ระยะเวลาล็อกหน้า Tracking หลังค้นหาผิดครบจำนวน (นาที)', ''],
    ['revision_reason_options', 'เอกสารไม่ครบถ้วน,ลายมือชื่อไม่ครบ,ข้อมูลในแบบฟอร์มไม่ครบ,รูปแบบผลงานไม่ถูกต้อง,ต้องแนบเอกสารเพิ่มเติม,อื่น ๆ',
      'ตัวเลือกเหตุผลในฟอร์ม "ส่งกลับให้เจ้าของผลงานแก้ไข" (คั่นด้วยจุลภาค)', ''],
    ['work_type_options', 'ผลงานเชิงวิชาการ,งานวิจัย (R2R),ผลงานเชิงนวัตกรรม,นวัตกรรมดิจิทัล,คู่มือ/แนวปฏิบัติ,อื่น ๆ',
      'ตัวเลือกประเภทผลงานในฟอร์มรับเอกสารใหม่ (คั่นด้วยจุลภาค)', ''],
    ['career_level_options', 'ปฏิบัติการ,ชำนาญการ,ชำนาญการพิเศษ,เชี่ยวชาญ,ทรงคุณวุฒิ',
      'ตัวเลือกระดับตำแหน่ง (ปัจจุบัน/ที่ขอ) ในฟอร์มรับเอกสารใหม่ (คั่นด้วยจุลภาค)', ''],
    ['web_app_base_url', '', 'URL ของ Web App หลัง Deploy ครั้งแรก — ใช้สร้างลิงก์ QR Code', ''],
    ['google_oauth_client_id', '', 'Google OAuth Client ID (Web application) จาก Google Cloud Console — ใช้ยืนยันตัวตนเจ้าหน้าที่ที่ login ด้วย Gmail ส่วนตัว (docs/DESIGN.md A19) เว้นว่างไว้ = ปิดระบบ sign-in สำรองนี้', ''],
    ['district11_provinces', 'นครศรีธรรมราช,กระบี่,พังงา,ภูเก็ต,สุราษฎร์ธานี,ระนอง,ชุมพร',
      'รายชื่อจังหวัดในพื้นที่เขตสุขภาพที่ 11 — ตัวเลือก dropdown "จังหวัด" ในฟอร์มรับเอกสารใหม่ (คั่นด้วยจุลภาค แก้ไข/เพิ่มได้ตรงนี้)', ''],
  ];
}

/**
 * Master Data เริ่มต้น 2026-09-15 — เท่าที่ยืนยันได้จริงจากผู้ใช้เท่านั้น (ห้ามเดารายการเพิ่มเอง)
 * MasterPositions มีแค่ "นายแพทย์" (ตำแหน่งเดียวที่ผู้ใช้ระบุชัดเจน) — ตำแหน่งอื่นในสายงานสาธารณสุขที่เหลือ
 * ให้ Admin เพิ่มเองทีหลังจากหน้า Admin > ข้อมูลหลัก (ไม่ต้องแก้โค้ด) MasterMedicalDomains/Specialties
 * ผู้ใช้ให้รายชื่อมาครบทั้งหมดแล้ว ใส่ seed ได้เต็มจำนวน
 */
function getMasterPositionsSeed_() {
  return [
    { position_code: 'NURSE', position_name: 'พยาบาลวิชาชีพ', professional_group: 'สายพยาบาล', active: true, sort_order: 1 },
    { position_code: 'DOCTOR', position_name: 'นายแพทย์', professional_group: 'สายวิชาชีพแพทย์', active: true, sort_order: 2 },
    { position_code: 'PUBLIC_HEALTH', position_name: 'นักวิชาการสาธารณสุข', professional_group: 'สายวิชาการ', active: true, sort_order: 3 },
    { position_code: 'DENTIST', position_name: 'ทันตแพทย์', professional_group: 'สายวิชาชีพทันตกรรม', active: true, sort_order: 4 },
    { position_code: 'PHARMACIST', position_name: 'เภสัชกร', professional_group: 'สายวิชาชีพเภสัชกรรม', active: true, sort_order: 5 },
    { position_code: 'MED_TECH', position_name: 'นักเทคนิคการแพทย์', professional_group: 'สายวิชาชีพเทคนิคการแพทย์', active: true, sort_order: 6 },
    { position_code: 'GENERAL_ADMIN', position_name: 'นักจัดการงานทั่วไป', professional_group: 'สายสนับสนุน', active: true, sort_order: 7 },
    { position_code: 'PHYSIOTHERAPIST', position_name: 'นักกายภาพบำบัด', professional_group: 'สายวิชาชีพกายภาพบำบัด', active: true, sort_order: 8 },
    { position_code: 'HR_OFFICER', position_name: 'นักทรัพยากรบุคคล', professional_group: 'สายสนับสนุน', active: true, sort_order: 9 },
    { position_code: 'MED_SCIENTIST', position_name: 'นักวิทยาศาสตร์การแพทย์', professional_group: 'สายวิชาชีพวิทยาศาสตร์การแพทย์', active: true, sort_order: 10 },
  ];
}

function getMasterMedicalDomainsSeed_() {
  return [
    { domain_code: 'clinical', domain_name: 'ด้านเวชกรรม', active: true, sort_order: 1 },
    { domain_code: 'preventive', domain_name: 'ด้านเวชกรรมป้องกัน', active: true, sort_order: 2 },
  ];
}

function getMasterMedicalSpecialtiesSeed_() {
  var names = [
    'เวชกรรมทั่วไป', 'อายุรกรรม', 'ศัลยกรรม', 'กุมารเวชกรรม', 'สูติ-นรีเวชกรรม', 'จิตเวช', 'ตจวิทยา',
    'ประสาทวิทยา', 'ประสาทศัลยกรรม', 'รังสีวิทยา', 'วิสัญญีวิทยา', 'โสต ศอ นาสิก', 'ออร์โธปิดิกส์', 'อื่น ๆ',
  ];
  return names.map(function (name, i) {
    return { specialty_code: 'sp' + (i + 1), specialty_name: name, domain_code: 'clinical', active: true, sort_order: i + 1 };
  });
}

/**
 * "ด้าน/สาขา" generic ผูกกับตำแหน่ง (position_code) 2026-09-15 (รอบ 3) — มาจากการสแกนข้อมูลจริง 244 รายใน
 * Excel เดิม (2อวช140969.xlsx) พบว่าทุกตำแหน่งมีคอลัมน์ "ด้าน" ของตัวเอง ไม่ใช่แค่นายแพทย์ และเป็น flat list
 * ชั้นเดียว (ไม่มีด้าน→สาขา 2 ชั้นแบบที่เคยสร้างไว้) — นายแพทย์ใช้ 17 ค่าจริงจาก Excel (ตัดของเดิม 14 ค่าที่เดาไว้
 * ก่อนหน้าออก ไม่ตรงข้อมูลจริง) ตำแหน่งอื่นใช้ค่าที่พบจริงในข้อมูล — เพิ่ม/แก้ภายหลังได้ที่ Admin > ข้อมูลหลัก
 */
function getMasterSpecialtiesSeed_() {
  var byPosition = {
    NURSE: ['การพยาบาล'],
    DOCTOR: [
      'เวชกรรมทั่วไป', 'เวชกรรมป้องกัน', 'เวชศาสตร์ครอบครัว', 'เวชศาสตร์ฉุกเฉิน', 'เวชกรรมฟื้นฟู', 'อายุรกรรม',
      'ศัลยกรรม', 'ศัลยกรรมออร์โธปิดิกส์', 'สูติ-นรีเวชกรรม', 'กุมารเวชกรรม', 'จิตเวช', 'จักษุวิทยา',
      // 2026-09-21: "โสต ศอ นาสิก" ไม่ตรงกับข้อมูลจริงในไฟล์คณะกรรมการ (1อวช140969.xlsx) ที่เขียนเต็มว่า
      // "โสต นาสิก ลาริงซ์วิทยา" — แก้ให้ตรง Excel ตามที่ผู้ใช้ยืนยัน (ชื่อเดิมเป็นการเดาไว้ก่อนเจอไฟล์จริง)
      // แถวที่มีอยู่แล้วบนชีต production ต้องรัน migrateFixDoctorSpecialtyName() (Setup.gs) เพื่อแก้ชื่อในชีตจริง
      'โสต นาสิก ลาริงซ์วิทยา', 'รังสีวิทยา', 'วิสัญญีวิทยา', 'พยาธิวิทยา', 'นิติเวช',
    ],
    PUBLIC_HEALTH: ['นักวิชาการสาธารณสุข', 'บริการทางวิชาการ'],
    DENTIST: ['ทันตกรรม', 'ทันตสาธารณสุข'],
    PHARMACIST: ['เภสัชกรรมคลินิก', 'เภสัชสาธารณสุข'],
    MED_TECH: ['นักเทคนิคการแพทย์', 'บริการทางวิชาการ'],
    GENERAL_ADMIN: ['นักจัดการงานทั่วไป'],
    PHYSIOTHERAPIST: ['นักกายภาพบำบัด'],
    HR_OFFICER: ['นักทรัพยากรบุคคล'],
    MED_SCIENTIST: ['บริการทางวิชาการ'],
  };
  var rows = [];
  Object.keys(byPosition).forEach(function (posCode) {
    byPosition[posCode].forEach(function (name, i) {
      rows.push({
        specialty_code: posCode.toLowerCase() + '_' + (i + 1),
        specialty_name: name, position_code: posCode, active: true, sort_order: i + 1,
      });
    });
  });
  return rows;
}

/**
 * Config กลางสำหรับ Admin CRUD ของ Master Data (Admin.gs renderMasterListBody_/renderMasterFormBody_/
 * performAdminMasterSave_ ใช้ config นี้ตัวเดียว ไม่เขียน CRUD ซ้ำ) key ตรงกับ ?type= ใน query string
 * (2026-09-15 รอบ 3: เอา medical_domain/medical_specialty ออกจาก config นี้ — เลิกใช้แล้ว แทนที่ด้วย specialty
 * ตัวเดียว generic ทุกตำแหน่ง ชีตเก่าไม่ลบ แค่ไม่มี tab ให้จัดการใน Admin UI อีกต่อไป)
 */
var MASTER_DATA_CONFIG_ = {
  position: {
    sheet: SHEET.MASTER_POSITIONS, label: 'ตำแหน่ง', codeField: 'position_code', nameField: 'position_name',
    extraFields: [{ key: 'professional_group', label: 'สายงาน' }],
  },
  specialty: {
    sheet: SHEET.MASTER_SPECIALTIES, label: 'ด้าน/สาขา (ตามตำแหน่ง)', codeField: 'specialty_code', nameField: 'specialty_name',
    extraFields: [{ key: 'position_code', label: 'รหัสตำแหน่ง (position_code)' }],
  },
};
