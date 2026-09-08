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

สถาปัตยกรรม: Google Apps Script Web App + Google Sheets + Google Drive + HTML/CSS/JS + Bootstrap 5 + ฟอนต์ Sarabun — เหมือนเดิม ไม่เปลี่ยน (OCR ถูกตัดออกภายหลัง ดู A4)

หลักการ Hand-off (ใหม่ใน v2): เมื่อเจ้าหน้าที่ต้นทางกด "ผ่านและส่งต่อ" ระบบจะยังไม่ถือว่าเอกสารอยู่ที่หน่วยงานปลายทางจนกว่าเจ้าหน้าที่ปลายทางจะสแกน QR และกด "รับเอกสารและเริ่มดำเนินการ" ด้วยตนเอง — ระหว่างนั้นสถานะแสดงเป็น "ส่งต่อแล้ว รอหน่วยงานปลายทางรับเอกสาร" ทำให้ตรวจสอบย้อนหลังได้เสมอว่าเอกสารอยู่ที่ใคร (ตอบเป้าหมายข้อ 5 ของ brief)

---

## 2. สมมติฐานที่ตั้งไว้

| # | หัวข้อ | สมมติฐาน | จุดที่ปรับได้ภายหลัง |
|---|---|---|---|
| A1 | ตัวตนที่ QR เก็บ | QR เก็บเฉพาะ `https://<web-app-url>/t/<qr_token>` โดย `qr_token` เป็นสตริงสุ่ม 8 ตัว **ไม่ใช่** `tracking_no` ตรงๆ — กันการเดา/ไล่เลขติดตามอื่นจาก QR ที่ถ่ายภาพหลุด (หมายเหตุการเขียนโค้ดจริง Part 3: Apps Script Web App ไม่รองรับ URL แบบ path segment กำหนดเอง จึงใช้ `<web-app-url>?t=<qr_token>` แทน — ยังคงหลักการเดิมคือ token สุ่ม ไม่ใช่ tracking_no ตรงๆ) | สร้างใหม่ได้ต่อ work_id ถ้า token รั่ว (ปุ่ม "ออก QR ใหม่" ใน Admin) |
| A2 | สิทธิ์การเห็นหน้าเมื่อเปิดลิงก์ QR เดียวกัน | เช็ค session: ไม่ Login → หน้าติดตามสถานะสาธารณะ, Login แล้วอยู่ใน `Users` → หน้ารับงาน/สิ้นสุดขั้นตอนของเจ้าหน้าที่, role = Admin → หน้ารายละเอียดเต็ม | ปรับ role mapping ได้ที่ชีต `Users` |
| A3 | ปีในเลขติดตาม/เลขลำดับ | เหมือน v1: ปี พ.ศ. + เลขลำดับ 5 หลัก รันแยกตามปี | `Settings.fiscal_year_current`, `Settings.last_seq_<ปี>` |
| A4 | OCR — **ตัดออกทั้งหมดภายหลัง (2026-09-02)** | เดิมใช้ Drive API OCR (Advanced Drive Service, `Drive.Files.insert({ocr:true})` แปลงภาพ→Google Doc แล้ว export text/plain) แทน Cloud Vision — เลือกเพราะฟรี ไม่ต้องเปิด billing บน GCP project แลกกับความแม่นยำต่ำกว่าและไม่รายงานค่า confidence เลย ผู้ใช้สั่งตัดฟีเจอร์นี้ทิ้งทั้งหมด (ไม่ใช่แค่ปิดใช้งาน) — ลบ `src/Ocr.gs`, ถอด `enabledAdvancedServices`/`script.external_request` scope ออกจาก `appsscript.json`, ถอด auto-fill ออกจากฟอร์มรับเอกสารใหม่ ดู A11/A11b | ฟอร์มรับเอกสารใหม่กลับไปกรอกเองทั้งหมด อัปโหลดภาพหน้าปกยังทำได้ปกติ (เก็บเป็นไฟล์แนบเฉยๆ ผ่าน `DriveApp`) |
| A5 | การเก็บเลขบัตรประชาชน | เก็บ 3 รูปแบบต่อ record: `citizen_id_last4` (plain, ใช้ยืนยันตัวตนสาธารณะ), `citizen_id_encrypted` (AES เต็ม 13 หลัก, ใช้ภายในเมื่อ Admin ต้องแก้ไขข้อมูล), `citizen_id_hash` (SHA-256+salt, ใช้ตรวจสอบเอกสารซ้ำ/dedup) — **ไม่มีเลขบัตรอยู่ใน QR หรือ URL ใดๆ** | Key rotation ที่ Script Properties |
| A6 | จำกัดค้นหาผิดหน้า Tracking | นับผิดต่อ session token ใน `CacheService` ครบ 5 ครั้ง/10 นาที → ล็อก 10 นาที (ไม่อิง IP เพราะ Apps Script อ่าน IP จริงไม่ได้) | `Settings.max_failed_search`, `Settings.search_lockout_minutes` |
| A7 | เหตุผลส่งกลับแก้ไข (checklist) | ค่าเริ่มต้น 6 ข้อ: เอกสารไม่ครบถ้วน / ลายมือชื่อไม่ครบ / ข้อมูลในแบบฟอร์มไม่ครบ / รูปแบบผลงานไม่ถูกต้อง / ต้องแนบเอกสารเพิ่มเติม / อื่น ๆ (มีช่องกรอกเพิ่มเมื่อเลือก "อื่น ๆ") | `Settings.revision_reason_options` (comma-separated) |
| A8 | "ปิดงาน" โดย Admin (ข้ามขั้นตอนที่เหลือ) | อนุญาตเฉพาะ role Admin, บังคับกรอกเหตุผลทุกครั้ง, บันทึกสถานะเดิม→ใหม่ใน AuditLog ตามข้อกำหนดความปลอดภัย #8 | — |
| A9 | เกณฑ์ "ใกล้ครบกำหนด/เกินกำหนด" | ใกล้ครบกำหนด = อยู่ในสถานี ≥ 80% ของ `standard_days`, เกินกำหนด = เกิน 100% | `WorkStations.standard_days` ต่อสถานี |
| A10 | ปกปิดชื่อบนหน้า Tracking | ตัวอักษรแรกของชื่อ+นามสกุล ตามด้วย `***` เช่น "นภ\*\*\* ทุม\*\*\*" | — |
| A11 | รูปแบบฟอร์มรับเอกสารใหม่ (เพิ่มใน Part 3) | ฟอร์ม submit แบบ POST ครั้งเดียวจบ (ไม่มี AJAX ตอนบันทึกจริง) | เพิ่ม AJAX step ภายหลังได้โดยไม่กระทบ schema |
| A11b | Auto-fill จากภาพหน้าปกผลงานด้วย OCR — **ตัดออกพร้อม A4 (2026-09-02)** | เดิม: เลือกไฟล์ภาพ → JS ฝั่ง client อ่านเป็น base64 → `google.script.run` เรียก `ocrPreviewCoverImage()` → OCR แล้วแยกฟิลด์ด้วย regex ป้ายกำกับภาษาไทยเติมฟอร์มอัตโนมัติ — ตัดออกทั้งหมดพร้อม A4 | ไม่มี — เจ้าหน้าที่กรอกฟอร์มเองทั้งหมด |
| A12 | สถานี Workflow ตั้งต้น = กระบวนการจริง 7 ขั้น (แทนชุดสมมติเดิม, 2026-09-02) | `received → checking → secretary_send(เลขา) → chair_schedule(ประธานกรรมการ) → committee_review(กรรมการ) → secretary_announce(เลขา) → final_announce(สนง เขต)` — รอบพิจารณาที่ 2 (กรณี "แก้ไข") ไม่มีสถานีแยก ใช้สถานี secretary_send–secretary_announce ชุดเดิมซ้ำ เพราะ `forwarded` มี `next_station_key` ทางเดียว ไม่รองรับแตกสายตามผลตัดสิน จึงขยาย action `reassigned` (Admin) ให้เลือก "ย้ายไปสถานี" ได้ด้วย (ไม่ใช่แค่เปลี่ยนหน่วยงาน) — ใช้ตอนเอกสารแก้ไขกลับมาแล้ว ดัน `current_station_key` กลับไป `secretary_send` ด้วยตนเอง | สถานี/ชื่อ/หน่วยงาน/วันมาตรฐานปรับได้จากหน้า Admin ปกติ ไม่กระทบ; ระบบสด (มีข้อมูลเดิมอยู่แล้ว) ย้ายมาใช้ชุดนี้ด้วย `migrateWorkStationsToRealProcess()` (Setup.gs, รันมือครั้งเดียว — ล้าง WorkStations เดิมทั้งหมด ต้องเคลียร์ Works ที่อ้าง station_key เดิมก่อน) |
| A13 | หน้า "ทะเบียนผลงานทั้งหมด" (`page=registry`) — เห็นงานข้ามหน่วยงานได้เต็ม, แก้สถานะได้เฉพาะที่ตนรับผิดชอบ (**แก้ไขเพิ่มเติม 2026-09-08 รอบสอง — ดู A15**) | เดิม (2026-09-08 รอบแรก) ตั้งใจให้บัญชี role `ผู้รับผิดชอบ` ทุกคนแก้สถานะได้ทุกงานไม่เช็ค org ผ่านฟอร์มอิสระ (`performRegistryStatusUpdate_`) — **ผู้ใช้ระบุชัดในสเปก 23-state (A15) ว่าต้อง walk back**: "จัดการ" ตอนนี้ลิงก์ไปหน้าสแกน QR เดียวกัน (`page=scan&t=`) ปุ่มเปลี่ยนสถานะคำนวณจาก `computeEligibleTransitions_` เหมือนทุกที่ — เห็นได้ทุกงาน แต่แก้ได้เฉพาะ state ที่หน่วยงานตนรับผิดชอบ ณ ขณะนั้น (ไม่ใช่ Admin ก็ตาม) `performRegistryStatusUpdate_`/`renderRegistryEditBody_` ถูกลบทิ้ง (ไม่ใช้แล้ว, ลด duplicate function) | ถ้าต้องการกลับไปแบบแก้ได้ทุกอย่างอีก ต้องเพิ่ม bypass ใน `computeEligibleTransitions_` เฉพาะ route นี้ — ปัจจุบันไม่มี |
| A14 | โซนสาธารณะ: สแกน QR เข้าดูสถานะได้ทันที ไม่ต้องกรอกเลขบัตร 4 ตัวท้ายอีก (2026-09-08, **กลับคำ**จาก A1/การแก้ QR-prefill รอบก่อนหน้าในวันเดียวกัน) | รอบแรก (บ่ายวันเดียวกัน) ทำแค่ prefill เลขติดตามจาก `?t=`, ยังบังคับกรอกเลขบัตร 4 ตัวท้ายเพื่อกันคนอื่นที่เห็นเอกสารแอบดูสถานะ — ผู้ใช้ยืนยันชัดเจนว่าต้องการให้สแกนแล้วเห็นสถานะทันทีจริง ๆ (`handlePublicTrackGet_`, PublicTrack.gs) จึงตัดขั้นกรอกเลขบัตรออกเฉพาะเส้นทางมาจาก QR โดยตรง (`findWorkByQrToken_` เจอทันที render ผลลัพธ์เลย ไม่ผ่านฟอร์ม/ไม่ผ่าน `checkSearchLock_`) — **ผลคือใครก็ตามที่เห็น/ถ่ายภาพ QR บนเอกสารจะเปิดดูสถานะ+ชื่อแบบปกปิดบางส่วน (A10) ได้โดยไม่ต้องรู้เลขบัตร** ไม่มีเลขบัตร/PII เต็มรั่ว (A10 ยังปิดชื่อบางส่วนเหมือนเดิม) แต่เป็นการลดชั้นความเป็นส่วนตัวที่ A6 ตั้งใจไว้ในทางปฏิบัติ — บันทึกไว้ให้เห็นชัดเป็นการตัดสินใจของผู้ใช้ ไม่ใช่บั๊ก | ทางเข้าฟอร์มกรอกเอง (ไม่มี `t` หรือหา QR ไม่เจอ) ยังคงบังคับเลขบัตร 4 ตัวท้าย+ `checkSearchLock_` เหมือนเดิมทุกประการ |
| A15 | Workflow เปลี่ยนจาก 7 สถานีเส้นตรง (A12) เป็น 23-state รองรับแตกสาย/วนกลับตามกระบวนการจริงละเอียด (2026-09-08) | ผู้ใช้ให้สเปกกระบวนการ 23 state พร้อมจุดตัดสินใจแตกสาย 2 จุด (state 2: ครบ/ไม่ครบ → วนกลับเข้า state 2 เมื่อส่งเอกสารกลับมา; state 7: ผ่าน/ไม่ผ่าน/แก้ไข 2 เดือน/แก้ไข 6 เดือน → ถ้าแก้ไขเข้ารอบพิจารณาที่ 2 เต็มรูปแบบ state 8.1-8.6/9.1-9.4) และวงรอบที่ 2 จบด้วยแตกสายอีกครั้ง (state 9.4: ผ่าน/ไม่ผ่าน) — โมเดล A12 (`next_station_key` เดียวต่อสถานี) ทำสิ่งนี้ไม่ได้โดยไม่ hack (ที่ทำไปแล้วคือขยาย `reassigned` ให้ย้ายสถานีเองได้ ซึ่งเป็นการ hack จริง ๆ) จึงแทนที่ด้วยโมเดลใหม่ทั้งชุด: sheet ใหม่ 2 ตัว `WorkflowStates` (23 state, คอลัมน์ชุดเดียวกับ `WorkStations` เดิมทุกตัวยกเว้นตัด `next_station_key`) + `WorkflowTransitions` (~27 เส้นทาง, `from_state/to_state/button_label/requires_note/result_value`) — `Works.current_station_key` ไม่เปลี่ยนชื่อคอลัมน์ แค่ค่าเปลี่ยนจาก 7 key เดิมเป็น 23 key ใหม่ (`s1`...`s10`) ผ่าน `migrateToWorkflowStates()` (Setup.gs, รันมือครั้งเดียว, ชีต `WorkStations`/`WORKSTATIONS_SEED` เดิมไม่ลบทิ้งแค่เลิกใช้งาน) — `getStationsMap_`/`listStationsSorted_`/`findStationByKey_` (ใช้ทั่วระบบ: Dashboard/Views/Actions/Admin) repoint ไปอ่าน `WorkflowStates` แทนโดยคงชื่อฟังก์ชัน/รูปแบบผลลัพธ์เดิมทุกประการ — เพิ่มคอลัมน์ใหม่ `Works.evaluation_result` (ผลการพิจารณาล่าสุด ตั้งค่าจาก transition ที่มี `result_value` เท่านั้น คือ 4 เส้นจาก state 7 และ 2 เส้นจาก state 9.4) ใช้เป็นตัวกรองในหน้าทะเบียน — `org: 'ORG_FROM'` เป็นค่า sentinel ใน `WorkflowStates` แปลว่า resolve เป็น `work.org_from` แทน (ใช้กับ state ที่ผู้รับผิดชอบคือ "หน่วยงานต้นสังกัด"/เจ้าของผลงาน ต่างกันไปตามแต่ละงาน) ผ่าน `resolveResponsibleOrg_()` (Search.gs) — state 8.3/8.4 ("เจ้าของผลงานแก้ไข/ส่งกลับ") ให้หน่วยงานต้นสังกัดกดแทนเพราะเจ้าของผลงานไม่มีบัญชี login (ตกลงไว้ก่อนหน้า A ใน USER_GUIDE) — action เดิม `received`/`forwarded`/`revision_requested`/`rejected` (`performWorkAction_`) ถูกลบทั้งหมด แทนที่ด้วย `performStateTransition_`/`computeEligibleTransitions_` (Actions.gs) — คงไว้ `more_info`/`terminated`/`closed`/`reassigned` เป็น utility action นอก flow หลัก — `handoff_pending` (กลไก "ส่ง→รอรับ" 2 คลิก) เลิกใช้ตามที่ผู้ใช้ยืนยัน (คลิกเดียวเปลี่ยน state เลย, ความละเอียดของ 23 state ทำหน้าที่แทนอยู่แล้ว) ตั้งเป็น `false` เสมอทุก transition — ผลคือ Dashboard bucket "งานรอรับ"/"ส่งต่อแล้วรอปลายทางรับ" ว่างเปล่าเสมอ (ไม่ใช่บั๊ก) — ทดสอบผ่าน mock harness (vm module, ไม่ commit) ครบ 4 flow ที่ผู้ใช้กำหนด (เอกสารครบ→ผ่าน / ไม่ครบ→ส่งคืน→ส่งใหม่→ผ่าน / แก้ไข 2 เดือน→รอบ 2→ผ่าน / แก้ไข 6 เดือน→รอบ 2→ไม่ผ่าน) + org-gating spot check + Admin override — 77/77 assertion ผ่าน | ไม่มี UI แก้ไข `WorkflowTransitions` (เส้นทาง) จาก Admin ในรอบนี้ — แก้ตรงชีต Google Sheet ได้เอง (เหมือน Settings บางค่าที่แก้ตรงชีต); ต้องมีบัญชี Users (role ผู้รับผิดชอบ, `organization` ตรงกับ `org_from` เป๊ะ) ต่อหน่วยงานต้นสังกัดแต่ละแห่งถึงจะกด state 3.2/8.2/8.3/8.4/8.5 ได้เอง — งาน operational ของ Admin ไม่ใช่โค้ด |
| A16 | หน้าสาธารณะ: เพิ่ม Step Progress + ปกปิดชื่อ (A10 เพิ่งถูก implement จริง) + ปุ่ม tile สรุปในหน้าทะเบียน (2026-09-08) | ผู้ใช้ทวนโจทย์ระบบ ("ตอนนี้เอกสารถึงขั้นไหนแล้ว") — พบว่า A10 (ปกปิดชื่อ) เขียนไว้ในเอกสารตั้งแต่ต้นแต่ไม่เคยถูก implement จริง (`renderPublicResultBody_` เดิมไม่แสดงชื่อเลย) และหน้าสาธารณะไม่มี timeline ภาพ มีแค่ pill สถานะเดียว ผู้ใช้ให้ตัวอย่างที่ต้องการชัดเจน: "รับเอกสาร ✓ → ตรวจสอบ ✓ → ส่งกรรมการ ● → รอแก้ไข → เสนออนุมัติ → เสร็จสิ้น" — implement เป็น `PUBLIC_STEP_SEQUENCE_` (Constants.gs) ลำดับคงที่ 6 ขั้นใช้ `PUBLIC_STATUS_LABELS` จริง ไม่ใช่ชื่อสมมติ, คำนวณ done/current/upcoming จาก public_status ของทุกสถานีที่ StatusHistory เคยผ่านจริง (`buildPublicMacroSteps_`, PublicTrack.gs) — ไม่ติ๊กมั่วขั้นที่ไม่เคยถึง เช่นงานที่ไม่เคยถูกขอแก้ไขจะไม่ติ๊ก "รอแก้ไข" แม้ current status จะอยู่หลังขั้นนั้นแล้ว, งาน terminated ไม่แสดง stepper (ไม่ใช่เส้นทางปกติ) — ออกแบบเป็น**แนวตั้ง**ไม่ใช่แนวนอนตามตัวอย่าง เพื่อความเหมาะกับ mobile-first (ตัดสินใจเอง ไม่ได้ถาม) เพิ่ม `maskNameForPublic_()` (Utils.gs, ตาม A10: 2 ตัวอักษรแรก+`***`) แสดงชื่อเจ้าของผลงานแบบปกปิดบนหน้าสาธารณะเป็นครั้งแรก + `received_date` — หน้าทะเบียนผลงานทั้งหมด (Registry) เพิ่ม tile สรุป 5 กลุ่ม (ทั้งหมด/อยู่ระหว่างดำเนินการ/รอแก้ไข/เสร็จสิ้น/ค้างนาน) คลิกกรองได้ผ่าน query param ใหม่ `bucket` (`computeRegistryBuckets_`, Registry.gs — ค้างนาน reuse `dueBucketFor_` เดิมจาก Dashboard.gs) — ทดสอบผ่าน mock harness เพิ่ม 12 assertion (รวม 89/89) | ตรวจสอบให้หน่วยงานที่ยังไม่คุ้นชื่อสถานะ 6 ขั้นนี้เข้าใจตรงกับที่ใช้จริงในกระบวนการ 23-state (เป็นการย่อ/จัดกลุ่ม ไม่ใช่ state ทั้งหมด) |
| A17 | หน้าตรวจสอบสถานะสาธารณะ: เพิ่มค้นหาด้วยถ่ายรูป/เลือกรูป QR ในหน้าเว็บเอง (2026-09-08, ปรับ 2 รอบ) | ผู้ใช้ขอทางค้นหาที่ 2 นอกจากพิมพ์เลขติดตามเอง — "ถ่ายรูป/scan QR แล้ววิ่งไปสถานะเลย" ตีความเป็น `<input type="file" accept="image/*" capture="environment">` (เปิดตัวเลือกกล้อง/คลังภาพของเครื่อง ไม่ใช่ live video stream) **รอบแรก** ถอดรหัสด้วย `BarcodeDetector` มาตรฐานเบราว์เซอร์ — พบว่าไม่ทำงานจริงใน Chrome (property มีอยู่แต่ desktop Chrome หลายเครื่องไม่มี component ถอดรหัสจริงติดตั้งอยู่) ผู้ใช้ทดสอบแล้วปุ่มไม่ขึ้น/ไม่ทำงาน 2 ครั้งติด **รอบสอง** เปลี่ยนมาใช้ไลบรารี `jsQR` (pure JS, โหลดจาก CDN `cdn.jsdelivr.net/npm/jsqr@1.4.0`, ถอดรหัสจาก canvas ImageData ตรงๆ ไม่พึ่ง browser API ที่รองรับไม่ทั่วถึง) เป็น external library ตัวแรกที่ระบบนี้โหลดจาก CDN (เดิมทุกอย่างเป็น vanilla JS ไม่มี dependency) — รู้จัก QR ทั้งแบบมี URL เต็มและแบบเก่าที่ยังไม่ได้ตั้ง `web_app_base_url` (แค่ `t=XXXX`) ด้วย regex เดียวกันทั้ง 2 รอบ `QR_PHOTO_SCAN_SCRIPT_` (Views.gs) | ยังไม่ได้ทำแบบเดียวกันในหน้าสแกน QR ของเจ้าหน้าที่ (`page=scan`) — ตอนนี้เจ้าหน้าที่ยังต้องพึ่งกล้อง/แอปสแกนภายนอกเหมือนเดิม ถ้าต้องการแบบเดียวกันแจ้งเพิ่มได้; ต้องพึ่ง CDN ภายนอก (jsdelivr) ครั้งแรกในระบบนี้ — ถ้า CDN ล่ม/บล็อกในเครือข่ายบางแห่ง ปุ่มจะขึ้นข้อความ "โหลดตัวอ่าน QR ไม่สำเร็จ" (มี fallback กรอกเองเสมอ) |
| A18 | ออกแบบหน้า "ติดตามผลงานของฉัน" ใหม่ทั้งหน้า — premium minimal, การ์ดสถานะเด่น + Timeline ละเอียด + สิ่งที่ต้องดำเนินการ (2026-09-08) | ผู้ใช้ให้ brief ออกแบบละเอียด (โทนสี/typography/layout/mobile-first) ยึด Design System เดิม (สี navy/teal/bg/muted/pending/active/revision/danger/done ที่มีอยู่แล้วใน `:root` ตรงกับที่ขอเป๊ะอยู่แล้ว ไม่ต้องเพิ่ม token ใหม่) — เปลี่ยนจาก stepper 6 ขั้นแบบย่อ (A16) เป็น **Timeline ละเอียดตาม state จริงทั้ง 23 ตัว**: `buildPublicDetailedSteps_()` (PublicTrack.gs) แสดง state ที่ผ่านมาจริงจาก StatusHistory (✓) + state ปัจจุบัน (●) + เดินหน้าต่อแบบไม่เดา — ถ้า state ถัดไปมีทางเดียว (ไม่แตกสาย) ถือว่าแน่นอนใส่เป็น upcoming (○) ได้ ถ้าแตกสายจริง (เช่น state 2, state 7) หยุดเดาทันที ยกเว้นกรณีแตกสายแต่ปลายทางเดียวกัน (state 9.4 ผ่าน/ไม่ผ่าน ทั้งคู่ไปจบที่ state 10) ยังถือว่าแน่นอนเดินต่อได้ — กลุ่ม state 8.x/9.x ห่อด้วย `<details>/<summary>` มาตรฐาน HTML (ไม่ใช้ JS) พับ/กางได้ตามที่ขอ เปิดค้างอัตโนมัติถ้ามีขั้นในกลุ่มที่ผ่านแล้ว/ปัจจุบัน — เพิ่มคอลัมน์ใหม่ `WorkflowStates.public_hint` (ข้อความ "สิ่งที่ต้องดำเนินการ" ต่อ state, seed เฉพาะ state ที่ผู้ยื่น/หน่วยงานต้นสังกัดต้องทำอะไรจริง คือ s3_2/s7_2/s7_3/s8_2/s8_3/s8_4) — พบว่า `performStateTransition_` เดิมตั้ง `next_step_text: ''` เสมอทุก transition (ไม่เคยมีข้อความจริงเลยตั้งแต่เปลี่ยนมาใช้ 23-state) แก้ให้ดึงจาก `public_hint` ของ state ปลายทางแทน — เพิ่ม "หมายเหตุจากผู้รับผิดชอบ" section ทั่วไป (`getLatestTransitionNote_`) นอกเหนือจากกล่อง "รายการที่ต้องแก้ไข" เดิมที่โชว์เฉพาะตอน need_revision — **คงมาสก์ชื่อ (A10) ไว้เหมือนเดิม แม้ brief จะขอโชว์ "ชื่อ-สกุล" เต็ม** เพราะขัดกับการตัดสินใจเรื่อง QR-direct-view ไม่ต้องยืนยันตัวตนที่ทำไปก่อนหน้า (A14) — ตัดสินใจเองไม่ถามซ้ำ ถ้าต้องการโชว์เต็มจริงๆ ต้องแจ้งยืนยันอีกครั้ง — จำกัดความกว้างเฉพาะโซนสาธารณะ (`max-width:800px`) แยกจาก `.content` ส่วนกลางที่ 80vw (กว้างเกินไปสำหรับอ่านบนมือถือ ทำ mobile เต็มจอถูกต้องผ่าน `width:100%` ก่อน cap) — ทดสอบผ่าน mock harness เพิ่ม assertion ตรวจ deterministic-forward-walk/branch-stop/9.4-convergence/next_step_text ครบ (รวม 119/119) | ลบ `PUBLIC_STEP_SEQUENCE_`/`buildPublicMacroSteps_` (A16) ทิ้งไปเลยแทนที่จะเก็บคู่ขนาน เพราะเป็นการ redesign หน้าเดียวกันในเซสชันเดียวกัน ไม่ใช่ข้อมูลที่ต้องคง — ถ้าจะย้อนกลับไปแบบย่อ 6 ขั้นต้องเขียนใหม่ |
| A19 | เจ้าหน้าที่ทุกคนที่ไม่ใช่บัญชีที่ deploy ครั้งแรก login ไม่ติด (เห็นแต่โซนสาธารณะ) — เพิ่ม Google Sign-In (GIS) เป็นช่องทางระบุตัวตนสำรอง (2026-09-08) | ยืนยันด้วย debug page ชั่วคราว + สืบค้นเว็บ + ผู้ใช้ยืนยันว่าทุกบัญชีเป็น Gmail ส่วนตัว (ไม่มี Google Workspace domain): `Session.getActiveUser().getEmail()` **คืนค่าว่างเสมอ** สำหรับผู้เข้าดู Gmail ส่วนตัวที่ต่างบัญชีจากผู้ deploy ภายใต้ `executeAs: USER_DEPLOYING` — ข้อจำกัดของแพลตฟอร์ม Google เอง แก้ด้วยการตั้งค่าไม่ได้ (อ้างอิง [Google groups](https://groups.google.com/g/google-apps-script-community/c/Ehzo_aWJnJI), [bulldo.gs](https://bulldo.gs/get-the-active-users-email-in-apps-script/)) เปลี่ยนไปใช้ `executeAs: USER_ACCESSING` ไม่ได้เพราะระบบมีโซนสาธารณะ (`access: ANYONE`) ใช้ executeAs เดียวกันทั้ง 2 โซน ถ้าเปลี่ยนประชาชนทั่วไปจะต้องมีสิทธิ์เข้าถึง Sheet ตรงๆ — จึงเพิ่มชั้นระบุตัวตนสำรองด้วย **Google Identity Services (GIS)** ยืนยันฝั่ง client แทน: `renderAuthBootstrapPage_()` (Views.gs) หน้า sign-in เล็กๆ ใช้ GIS ขอ ID token (silent ถ้าเคย sign-in แล้ว, ปุ่มจริงถ้ายัง) → redirect กลับ URL เดิมพร้อม `&auth=<token>` → `verifyAuthToken_()` (Auth.gs) ตรวจผ่าน Google เอง (`oauth2.googleapis.com/tokeninfo`) เช็ค `aud` ตรงกับ Settings.`google_oauth_client_id` (**จุดสำคัญที่สุด** กัน token จากแอปอื่น/ปลอมสวมรอย) + `email_verified` + `exp` ไม่หมดอายุ — `doGet`/`doPost` (Code.gs) ใช้ `getCurrentUserEmail_() || verifyAuthToken_(ss, params.auth)` เป็นอีเมลจริง (ยังลอง `Session.getActiveUser()` ก่อนเสมอ เผื่อมีบัญชี Workspace ในอนาคต) — **ไม่แตะ href/form ที่มีอยู่แล้ว ~130 จุดทั่วระบบเลยสักจุด**: `GIS_AUTH_SCRIPT_` (Views.gs, คู่กับ `LOADING_FEEDBACK_SCRIPT_` ที่มีอยู่แล้ว pattern เดียวกัน) อ่าน token จาก query string ของหน้าปัจจุบันแล้วดักทุกคลิก `<a target=_top>`/ทุก `<form>` submit ต่อท้าย `auth=` ให้อัตโนมัติ ใส่เฉพาะ `renderStaffPage_` ไม่ใส่ `renderPublicPage_` (โซนสาธารณะไม่ต้องรู้ตัวตนเลย) — เข้าทางลิงก์เจ้าหน้าที่โดยเฉพาะ `?staff=1` (ลิงก์ปกติที่แจกประชาชนยังเป็นโซนสาธารณะเหมือนเดิมทุกประการ ไม่กระทบ) เพิ่ม scope `script.external_request` กลับเข้า `appsscript.json` (ถอดไปตอนตัด OCR, ตอนนี้ `UrlFetchApp` ต้องใช้เรียก tokeninfo) — ทดสอบผ่าน mock harness เพิ่ม 9 assertion (mock `UrlFetchApp.fetch` ครบทุกเงื่อนไขปฏิเสธ: aud ผิด/หมดอายุ/email ไม่ verified/HTTP ไม่ 200/ไม่ตั้ง client id) รวม 130/130 | **ต้องทำ Google Cloud Console setup เพิ่มเติมนอก Apps Script** (สร้าง OAuth Client ID ชนิด Web application แล้วเอามาใส่ Settings.`google_oauth_client_id`) ถึงจะใช้งานได้จริง — ดูขั้นตอนใน docs/DEPLOY.md; token หมดอายุ ~1 ชม. แล้วต้อง sign-in ใหม่ (เงียบๆ ถ้ายังมี session Google อยู่) ยังไม่ได้ทำ auto-refresh ระหว่าง session; Safari/iOS มีข้อจำกัด third-party cookie อาจทำให้ silent sign-in ไม่ลื่นเท่า Chrome/Android |

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

### 4.4 Users
`user_email, display_name, role, organization, active` — role: `Admin` / `ผู้รับผิดชอบ`

**รวม role เหลือ 2 แบบ (2026-09-08, เดิมมี 4 แบบ: Admin/เจ้าหน้าที่รับเอกสาร/เจ้าหน้าที่ผู้รับผิดชอบ/ผู้ดูข้อมูลอย่างเดียว)** — role เดิมไม่เคยมีผลต่อสิทธิ์กดปุ่ม action จริง (อิงจาก `organization` เป็นหลัก, role มีผลแค่แยก `Admin` ออกเท่านั้น) การมี 4 label จึงสร้างภาพลวงว่ามี permission tier ที่ไม่มีจริง รวมเหลือ `ผู้รับผิดชอบ` ตัวเดียวให้ตรงกับพฤติกรรมจริง ระบบผู้ใช้งานทั้งหมดของโปรเจกต์นี้จึงเป็น 3 กลุ่มตามที่ผู้ใช้กำหนด: **Admin** (ผู้ดูแลระบบ) / **ผู้รับผิดชอบ** (เจ้าหน้าที่ทุกหน่วยงานในกระบวนการ เป็นผู้ส่งต่องานไปตามสถานี — มีบัญชี login) / **เจ้าของผลงาน** (ผู้ยื่นขอ ไม่มีบัญชี login ใช้โซนสาธารณะตรวจสอบสถานะด้วยเลขติดตาม+เลขบัตร 4 ตัวท้าย หรือสแกน QR) — migration ข้อมูลเดิมผ่าน `migrateUserRolesToResponsible()` (Setup.gs, รันครั้งเดียวจาก Editor)

### 4.5 Settings (key-value)
`setting_key, setting_value, description, updated_at`
Seed: `org_name`, `fiscal_year_current`, `last_seq_<ปี>`, `drive_folder_id_cover`, `drive_folder_id_attachment`, `max_failed_search`, `search_lockout_minutes`, `revision_reason_options`, `web_app_base_url`

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
