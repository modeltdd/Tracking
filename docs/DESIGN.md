# ระบบติดตามสถานะผลงานวิชาการ สำนักงานเขตสุขภาพที่ 11
## เอกสารออกแบบระบบ (Design Document) — v2 (ยืนยันแล้ว)

สถานะเอกสาร: ยืนยันทิศทางแล้ว — ใช้เอกสารนี้เป็นสเปกหลักสำหรับเขียนโค้ดจริง
ปรับปรุงล่าสุด: 2026-08-11

> เอกสารนี้แทนที่แนวทางเฟส 1 เดิม (22 สถานะย่อยแบบ 1–10, ตรวจสอบสาธารณะด้วยเลขบัตร 13 หลักเต็ม) ตาม brief ฉบับปรับปรุงที่เน้น mobile-first, action-based workflow และ QR hand-off ระหว่างหน่วยงาน โครงสร้างด้านล่างสะท้อนสิ่งที่ Interactive Prototype ได้ทดสอบแล้วจริง

---

## 1. สรุปความเข้าใจระบบ

แนวคิดหลัก: **"เอกสาร 1 ชุด = QR Code 1 รหัส"** เจ้าหน้าที่ไม่เลือกสถานะจาก dropdown แต่กด "การกระทำ" (รับงาน / ส่งต่อ / ขอข้อมูลเพิ่มเติม / ส่งกลับแก้ไข / ไม่ผ่าน / ยุติ) ระบบคำนวณสถานะใหม่ให้เองตาม Workflow

แบ่งเป็น 2 ระบบ (คนละสิทธิ์ คนละหน้าตา ใช้ทะเบียนเดียวกัน):

- **User Portal** (ไม่ต้อง Login) — ตรวจสอบสถานะด้วยเลขติดตาม + เลขบัตรประชาชน **4 ตัวท้าย** (ไม่ใช่ 13 หลักเต็ม) หรือสแกน QR บนเอกสาร
- **Admin Portal** (ต้อง Login ด้วยบัญชี Google Workspace) — แบ่งเป็นมุมมองเจ้าหน้าที่ปฏิบัติงาน (มือถือ, ปุ่มใหญ่, ไม่มีกราฟ) และมุมมองผู้ดูแล/ผู้บริหาร (Dashboard, จัดการ Workflow, Audit Log)

สถาปัตยกรรม: Google Apps Script Web App + Google Sheets + Google Drive + OCR + HTML/CSS/JS + Bootstrap 5 + ฟอนต์ Sarabun — เหมือนเดิม ไม่เปลี่ยน

หลักการ Hand-off (ใหม่ใน v2): เมื่อเจ้าหน้าที่ต้นทางกด "ผ่านและส่งต่อ" ระบบจะยังไม่ถือว่าเอกสารอยู่ที่หน่วยงานปลายทางจนกว่าเจ้าหน้าที่ปลายทางจะสแกน QR และกด "รับเอกสารและเริ่มดำเนินการ" ด้วยตนเอง — ระหว่างนั้นสถานะแสดงเป็น "ส่งต่อแล้ว รอหน่วยงานปลายทางรับเอกสาร" ทำให้ตรวจสอบย้อนหลังได้เสมอว่าเอกสารอยู่ที่ใคร (ตอบเป้าหมายข้อ 5 ของ brief)

---

## 2. สมมติฐานที่ตั้งไว้

| # | หัวข้อ | สมมติฐาน | จุดที่ปรับได้ภายหลัง |
|---|---|---|---|
| A1 | ตัวตนที่ QR เก็บ | QR เก็บเฉพาะ `https://<web-app-url>/t/<qr_token>` โดย `qr_token` เป็นสตริงสุ่ม 8 ตัว **ไม่ใช่** `tracking_no` ตรงๆ — กันการเดา/ไล่เลขติดตามอื่นจาก QR ที่ถ่ายภาพหลุด (หมายเหตุการเขียนโค้ดจริง Part 3: Apps Script Web App ไม่รองรับ URL แบบ path segment กำหนดเอง จึงใช้ `<web-app-url>?t=<qr_token>` แทน — ยังคงหลักการเดิมคือ token สุ่ม ไม่ใช่ tracking_no ตรงๆ) | สร้างใหม่ได้ต่อ work_id ถ้า token รั่ว (ปุ่ม "ออก QR ใหม่" ใน Admin) |
| A2 | สิทธิ์การเห็นหน้าเมื่อเปิดลิงก์ QR เดียวกัน | เช็ค session: ไม่ Login → หน้าติดตามสถานะสาธารณะ, Login แล้วอยู่ใน `Users` → หน้ารับงาน/สิ้นสุดขั้นตอนของเจ้าหน้าที่, role = Admin → หน้ารายละเอียดเต็ม | ปรับ role mapping ได้ที่ชีต `Users` |
| A3 | ปีในเลขติดตาม/เลขลำดับ | เหมือน v1: ปี พ.ศ. + เลขลำดับ 5 หลัก รันแยกตามปี | `Settings.fiscal_year_current`, `Settings.last_seq_<ปี>` |
| A4 | OCR | Google Cloud Vision API ผ่าน `UrlFetchApp` เกณฑ์ "ไม่มั่นใจ" = confidence < 70% หรือ regex ไม่ผ่าน | `Settings.ocr_provider`, `Settings.ocr_confidence_threshold` |
| A5 | การเก็บเลขบัตรประชาชน | เก็บ 3 รูปแบบต่อ record: `citizen_id_last4` (plain, ใช้ยืนยันตัวตนสาธารณะ), `citizen_id_encrypted` (AES เต็ม 13 หลัก, ใช้ภายในเมื่อ Admin ต้องแก้ไขข้อมูล), `citizen_id_hash` (SHA-256+salt, ใช้ตรวจสอบเอกสารซ้ำ/dedup) — **ไม่มีเลขบัตรอยู่ใน QR หรือ URL ใดๆ** | Key rotation ที่ Script Properties |
| A6 | จำกัดค้นหาผิดหน้า Tracking | นับผิดต่อ session token ใน `CacheService` ครบ 5 ครั้ง/10 นาที → ล็อก 10 นาที (ไม่อิง IP เพราะ Apps Script อ่าน IP จริงไม่ได้) | `Settings.max_failed_search`, `Settings.search_lockout_minutes` |
| A7 | เหตุผลส่งกลับแก้ไข (checklist) | ค่าเริ่มต้น 6 ข้อ: เอกสารไม่ครบถ้วน / ลายมือชื่อไม่ครบ / ข้อมูลในแบบฟอร์มไม่ครบ / รูปแบบผลงานไม่ถูกต้อง / ต้องแนบเอกสารเพิ่มเติม / อื่น ๆ (มีช่องกรอกเพิ่มเมื่อเลือก "อื่น ๆ") | `Settings.revision_reason_options` (comma-separated) |
| A8 | "ปิดงาน" โดย Admin (ข้ามขั้นตอนที่เหลือ) | อนุญาตเฉพาะ role Admin, บังคับกรอกเหตุผลทุกครั้ง, บันทึกสถานะเดิม→ใหม่ใน AuditLog ตามข้อกำหนดความปลอดภัย #8 | — |
| A9 | เกณฑ์ "ใกล้ครบกำหนด/เกินกำหนด" | ใกล้ครบกำหนด = อยู่ในสถานี ≥ 80% ของ `standard_days`, เกินกำหนด = เกิน 100% | `WorkStations.standard_days` ต่อสถานี |
| A10 | ปกปิดชื่อบนหน้า Tracking | ตัวอักษรแรกของชื่อ+นามสกุล ตามด้วย `***` เช่น "นภ\*\*\* ทุม\*\*\*" | — |
| A11 | รูปแบบฟอร์มรับเอกสารใหม่ (เพิ่มใน Part 3) | ใช้ HTML form ธรรมดา (POST ครั้งเดียว ไม่มี AJAX) เพื่อลดความซับซ้อน — OCR จึงรันตอน submit และบันทึกข้อความที่อ่านได้ไว้ใน `StatusHistory.note` ของ action `registered` ให้เจ้าหน้าที่ตรวจสอบย้อนหลัง แทนที่จะ auto-fill ฟอร์มก่อนกด submit (ต้องมี AJAX round-trip เพิ่มถ้าต้องการ auto-fill) | เพิ่ม AJAX preview step ภายหลังได้โดยไม่กระทบ schema |

---

## 3. Workflow — สถานี (Stations) + การกระทำ (Actions)

### 3.1 สถานีปฏิบัติงาน (7 สถานี, เดินหน้าเป็นเส้นตรง + เก็บกลับได้จากขั้น "ส่งกลับแก้ไข")

| # | สถานี (internal) | หน่วยงานรับผิดชอบ | มาตรฐาน (วัน) | สถานะสาธารณะที่แมป |
|---|---|---|---|---|
| 1 | รับเรื่องจากหน่วยงานต้นทาง | กลุ่มงานบริหารทรัพยากรบุคคล | 3 | รับเอกสารแล้ว |
| 2 | ตรวจสอบความครบถ้วนเอกสาร | กลุ่มงานบริหารทรัพยากรบุคคล | 5 | ตรวจสอบความครบถ้วน |
| 3 | เสนอคณะกรรมการพิจารณา | กลุ่มงานพัฒนาบุคลากร | 5 | อยู่ระหว่างพิจารณา |
| 4 | คณะกรรมการพิจารณา | คณะกรรมการประเมินผลงานวิชาการ | 15 | อยู่ระหว่างพิจารณา |
| 5 | เสนอผู้บริหารอนุมัติ | ผู้บริหารสำนักงานเขตสุขภาพที่ 11 | 7 | รออนุมัติ |
| 6 | แจ้งผลการพิจารณา | กลุ่มงานบริหารทรัพยากรบุคคล | 3 | แจ้งผลแล้ว |
| 7 | ปิดงาน/จัดเก็บเอกสาร | กลุ่มงานบริหารทรัพยากรบุคคล | 2 | เสร็จสิ้น |

สถานะสาธารณะรวม 8 ค่า (ตรงตาม brief): รับเอกสารแล้ว, ตรวจสอบความครบถ้วน, **รอเจ้าของผลงานแก้ไข**, อยู่ระหว่างพิจารณา, รออนุมัติ, แจ้งผลแล้ว, เสร็จสิ้น, **ยุติกระบวนการ** — สองรายการหลังไม่ผูกกับสถานีใดสถานีหนึ่ง แต่เป็นผลจาก action

### 3.2 การกระทำ (Action Buttons) แทน Dropdown สถานะ

| Action | ใครกดได้ | ผลลัพธ์ |
|---|---|---|
| รับเอกสารและเริ่มดำเนินการ | เจ้าหน้าที่สถานีปลายทาง (เมื่อ `handoff_pending = true` และ QR ตรงหน่วยงานตน) | `handoff_pending=false`, `current_owner_org` = หน่วยงานตน, สถานะสาธารณะ = ตามสถานี |
| ผ่านและส่งต่อขั้นตอนถัดไป | เจ้าหน้าที่เจ้าของงานปัจจุบัน | เลื่อนไปสถานีถัดไปอัตโนมัติ (ตาม `next_station_key`), ตั้ง `handoff_pending=true`, สถานะ = "ส่งต่อแล้ว รอหน่วยงานปลายทางรับเอกสาร" — ต้อง Confirm modal ก่อนบันทึกเสมอ |
| ขอข้อมูลเพิ่มเติม | เจ้าหน้าที่เจ้าของงานปัจจุบัน | ไม่เปลี่ยนสถานี บันทึก log เท่านั้น (ไม่ถือเป็นการตีกลับ) |
| ส่งกลับให้เจ้าของผลงานแก้ไข | เจ้าหน้าที่เจ้าของงานปัจจุบัน | สถานะสาธารณะ = "รอเจ้าของผลงานแก้ไข", บันทึกเหตุผล (checklist), กำหนดวันส่งกลับ; เมื่อหน่วยงานต้นทางส่งฉบับแก้ไขกลับมา เจ้าหน้าที่กด "รับเอกสารและเริ่มดำเนินการ" ที่สถานีเดิมเพื่อกลับเข้ากระบวนการ |
| ไม่ผ่านการพิจารณา | เจ้าหน้าที่เจ้าของงานปัจจุบัน (โดยหลักคือสถานี 4) | สถานะสาธารณะ = "แจ้งผลแล้ว" (ผลลบ) |
| ยุติกระบวนการ | เจ้าหน้าที่เจ้าของงานปัจจุบัน | สถานะสาธารณะ = "ยุติกระบวนการ" (terminal) |
| ปิดงาน (ข้ามขั้นตอนที่เหลือ) | **Admin เท่านั้น** | สถานะสาธารณะ = "เสร็จสิ้น" ทันที บังคับกรอกเหตุผล |
| เปลี่ยนผู้รับผิดชอบ | **Admin เท่านั้น** | เปลี่ยน `current_owner_org` ตรง บังคับกรอกเหตุผล |

Server-side (`Code.gs`) ตรวจทุกครั้งว่า action ที่ส่งมาถูกต้องกับสถานะปัจจุบันจริง (ป้องกัน POST ตรงข้าม guard ฝั่ง client)

### 3.3 Dashboard เจ้าหน้าที่ (ต่อหน่วยงานของผู้ Login)

งานรอรับ (`handoff_pending` ชี้มาที่หน่วยงานตน) · กำลังดำเนินการ (เป็นเจ้าของ + ไม่ terminal) · ส่งต่อแล้วรอปลายทางรับ (`handoff_pending` ที่ตนเป็นต้นทาง) · ใกล้ครบกำหนด · เกินกำหนด · ส่งกลับแก้ไข (log ล่าสุดเป็นของหน่วยงานตน)

---

## 4. Data Model — Google Sheets (แก้ไขจาก v1 ให้ตรงกับ action-based + hand-off)

### 4.1 Works
`work_id, tracking_no, qr_token, citizen_id_last4, citizen_id_encrypted, citizen_id_hash, title_name, first_name, last_name, position, current_level, requested_level, work_type, work_title, org_from, phone, email, cover_image_url, received_date, current_station_key, current_status_public, handoff_pending, current_owner_org, current_handler_name, updated_at, next_step_text, created_by, created_at`

เปลี่ยนจาก v1: ตัด `current_status_code`/`current_owner` แบบเดี่ยว → แยกเป็น `current_station_key` + `current_owner_org` + `handoff_pending` (บอกได้ว่า "อยู่ที่ใครจริง" ตามเป้าหมายข้อ 5); เพิ่ม `qr_token`; เปลี่ยนเลขบัตรจาก 1 hash เป็น 3 ฟิลด์ตาม A5

### 4.2 StatusHistory (บันทึกทุก action ห้ามเขียนทับ)
`history_id, work_id, tracking_no, action, from_station, to_station, from_org, to_org, action_by, action_by_org, action_date, note, revision_reasons, revision_due_date, attachment_url, created_at`

`action` ∈ {registered, received, forwarded, more_info, revision_requested, rejected, terminated, closed, reassigned, edited}

### 4.3 WorkStations (แทน StatusMaster เดิม — คือหน้า "จัดการ Workflow" ของ Admin)
`station_key, station_order, station_name, org, standard_days, next_station_key, public_status, receive_role, approve_role, notify_method, active`

ค่าเริ่มต้น seed ตามตาราง 3.1 — Admin ปรับลำดับ/หน่วยงาน/วันมาตรฐาน/เปิดปิดสถานีได้จากหน้า UI โดยไม่ต้องแก้โค้ด (ตามที่ Interactive Prototype สาธิตไว้)

### 4.4 Users (เหมือน v1)
`user_email, display_name, role, organization, active` — role: `Admin` / `เจ้าหน้าที่รับเอกสาร` / `เจ้าหน้าที่ผู้รับผิดชอบ` / `ผู้ดูข้อมูลอย่างเดียว`

### 4.5 Settings (key-value)
`setting_key, setting_value, description, updated_at`
Seed: `org_name`, `fiscal_year_current`, `last_seq_<ปี>`, `drive_folder_id_cover`, `drive_folder_id_attachment`, `ocr_provider`, `ocr_confidence_threshold`, `max_failed_search`, `search_lockout_minutes`, `revision_reason_options`, `web_app_base_url`

### 4.6 AuditLog (การแก้ไขข้อมูลโดย Admin — ข้อกำหนด #8, #11)
`audit_id, timestamp, user_email, action, work_id, field_changed, old_value, new_value`

### 4.7 SearchLog (จำกัดค้นหาผิด — ข้อกำหนด #10, #14; เก็บแค่ last4 ไม่เก็บเลขเต็ม)
`log_id, timestamp, tracking_no_attempt, citizen_id_last4_attempt, success, session_token`

---

## 5. Interactive Prototype

ทดลองใช้งานจริง (คลิกได้ทุกปุ่ม ไม่ใช่ภาพนิ่ง): https://claude.ai/code/artifact/be418bea-f071-46de-a63e-482186dc21cf

ครอบคลุมทั้ง 3 มุมมอง — User Portal (5 หน้า), Admin/เจ้าหน้าที่ (10 หน้า), ผู้ดูแล/ผู้บริหาร (6 หน้า) — สาธิต flow รับงาน→ส่งต่อ→ส่งกลับแก้ไข→timeline ด้วยข้อมูลตัวอย่าง 5 เคส ผ่านการทดสอบ headless (jsdom) ครบทุก flow หลักก่อนส่งมอบ

---

## 6. ขอบเขต MVP

ยังไม่ทำ: แจ้งเตือน LINE/Email อัตโนมัติจริง (มีแค่ช่อง `notify_method` และ toggle "แจ้งเจ้าของผลงาน" เตรียมไว้ในฟอร์ม), Dashboard ขั้นสูง (กราฟแนวโน้ม) — โครงสร้างข้อมูลใน `StatusHistory`/`AuditLog` รองรับต่อยอดได้ทันทีโดยไม่ต้อง migrate schema

---

## 7. ลำดับการพัฒนาโค้ด (อัปเดตตาม v2)

1. Project setup + `Code.gs` skeleton + ฟังก์ชันติดตั้ง/สร้างชีตอัตโนมัติ + seed WorkStations/Settings/Users
2. Auth (ตรวจอีเมลกับ Users) + โครง UI เจ้าหน้าที่ (bottom-nav 3 ปุ่มหลัก + Dashboard)
3. ลงทะเบียนเอกสารใหม่: อัปโหลด Drive + OCR + ฟอร์ม + เลขติดตาม + `qr_token` + QR
4. สแกน QR → รับงาน (hand-off receive) + สิ้นสุดขั้นตอน (action outcomes 5 แบบ + confirm modal) — workflow guard ฝั่ง server
5. ค้นหารายการ + รายละเอียดงาน (tabs + Timeline) — responsive table/card
6. User Portal: ตรวจสอบสถานะด้วยเลขติดตาม + last4 (POST, rate limit) + หน้า revision detail
7. Admin: จัดการ Workflow (WorkStations), ผู้ใช้งาน, Dashboard ผู้บริหาร, Audit Log, รายงาน CSV
8. นำเข้า Excel เดิม + สร้างข้อมูลตัวอย่างทดสอบ
9. คู่มือ Deploy + จุดตั้งค่า Drive/OCR/สิทธิ์

แต่ละส่วนส่งมอบเป็นไฟล์ทดสอบได้ทีละก้อนตามลำดับ ไม่รวบทำครั้งเดียว
