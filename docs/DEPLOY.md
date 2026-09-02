# คู่มือ Deploy — ระบบติดตามสถานะผลงานวิชาการ สำนักงานเขตสุขภาพที่ 11

ลำดับพัฒนา #9 (docs/DESIGN.md ข้อ 7) — คู่มือนี้สำหรับผู้ดูแลระบบที่ deploy ครั้งแรก หรือทีมพัฒนาที่ต้องอัปเดตโค้ดภายหลัง

---

## 1. สิ่งที่ต้องมีก่อนเริ่ม

- บัญชี Google ที่จะเป็นเจ้าของระบบ (แนะนำบัญชี Google Workspace ขององค์กร ไม่ใช่บัญชีส่วนตัว เพราะ Spreadsheet ฐานข้อมูล + Apps Script project จะผูกกับบัญชีนี้ตลอดไป)
- สิทธิ์ Login ด้วยบัญชี Google Workspace เดียวกันสำหรับเจ้าหน้าที่ทุกคนที่จะใช้ระบบ (ระบบตรวจสิทธิ์จากอีเมลที่ Login เทียบกับชีต `Users` — ดู `Auth.gs`)
- [clasp](https://github.com/google/clasp) ติดตั้งแล้ว (`npm install -g @google/clasp`) และ `clasp login` ด้วยบัญชีเดียวกับข้อแรก — ใช้ push โค้ดจาก `src/` เข้า Apps Script project
- Node.js (สำหรับรัน `node --check` ตรวจ syntax ก่อน push — ดู workflow ด้านล่าง)

---

## 2. Deploy ครั้งแรก

### 2.1 สร้าง Apps Script project

```
cd src
clasp create --type webapp --title "ระบบติดตามสถานะผลงานวิชาการ เขต 11"
```

คำสั่งนี้จะสร้างไฟล์ `src/.clasp.json` ใหม่พร้อม `scriptId` ของ project — **เก็บค่า scriptId นี้ไว้** ใช้อ้างอิงตลอดไป (ถ้า clone โปรเจกต์นี้มาต่อจากที่มี `src/.clasp.json` อยู่แล้ว ให้ข้ามขั้นตอนนี้ ใช้ scriptId เดิม)

### 2.2 Push โค้ด + ตรวจ syntax

```
cd src
node --check ... # (ดูรายละเอียด workflow ตรวจ syntax ด้านล่าง หัวข้อ 5)
clasp push --force
```

### 2.3 รัน installSystem() ครั้งแรก

1. `clasp open` เปิด Apps Script Editor
2. เลือกฟังก์ชัน `installSystem` จาก dropdown ด้านบน แล้วกด **Run**
3. ระบบจะขอ Authorize OAuth scopes ตามที่ระบุใน `appsscript.json` (spreadsheets, drive, userinfo.email) — กด Allow
4. ดู **Log** (Ctrl+Enter) จะเจอลิงก์ Spreadsheet ที่สร้างขึ้นใหม่ (บันทึก `SPREADSHEET_ID` ไว้ใน Script Properties อัตโนมัติแล้ว ไม่ต้องตั้งเอง)
5. ผู้ที่รัน `installSystem()` จะกลายเป็น **Admin คนแรก** โดยอัตโนมัติ (`seedFirstAdminUser_`) — เพิ่มเจ้าหน้าที่คนอื่นภายหลังจากหน้า Admin > ผู้ใช้งาน ในเว็บแอป ไม่ต้องแก้ชีต `Users` ตรงๆ

รันซ้ำได้ปลอดภัย (idempotent) — จะไม่ทับข้อมูล/การตั้งค่าที่มีอยู่แล้ว

### 2.4 Deploy เป็น Web App

1. ใน Apps Script Editor → **Deploy** → **New deployment**
2. เลือกประเภท **Web app**
3. ตรวจว่าตรงกับ `appsscript.json`: **Execute as** = *Me* (เจ้าของบัญชีที่ deploy), **Who has access** = *Anyone* (จำเป็น เพราะโซนประชาชนไม่ต้อง Login — ฝั่งเจ้าหน้าที่ยังเช็คสิทธิ์จากชีต `Users` อยู่ดี ไม่ใช่ทุกคนที่เปิดลิงก์จะเห็นข้อมูลภายใน)
4. กด **Deploy** → คัดลอก Web app URL ที่ได้ (รูปแบบ `https://script.google.com/macros/s/<deploymentId>/exec`)
5. **เก็บ deploymentId นี้ไว้** — ใช้ redeploy ทับ URL เดิมทุกครั้งที่อัปเดตโค้ดในอนาคต (ดูหัวข้อ 4) ไม่เช่นนั้น QR ที่พิมพ์ไปแล้วและลิงก์ที่แชร์ไว้จะใช้ไม่ได้

### 2.5 ตั้งค่า Settings ในชีต

เปิด Spreadsheet ฐานข้อมูล (ลิงก์จาก Log ขั้นตอน 2.4) → ชีต `Settings` → แก้ค่าเหล่านี้ให้ตรงหน่วยงานจริง:

| setting_key | ค่าที่ต้องตั้ง |
|---|---|
| `org_name` | ชื่อหน่วยงานที่แสดงบนหัวกระดาษ |
| `tracking_no_prefix` | คำนำหน้าเลขติดตาม (ค่าเริ่มต้น `อวช11`) |
| `web_app_base_url` | **วาง Web app URL จากขั้นตอน 2.4** — QR code ที่พิมพ์บนเอกสารใช้ค่านี้สร้างลิงก์ (`buildQrImageUrl_` ใน Register.gs) ถ้าเว้นว่างไว้ QR จะไม่มี URL เต็ม |
| `drive_folder_id_cover` | Folder ID ใน Google Drive สำหรับเก็บภาพหน้าปก (สร้าง Folder ใหม่ → คัดลอก ID จาก URL ส่วนหลัง `/folders/`) — เว้นว่างได้ ระบบจะข้ามการอัปโหลดภาพ (ยังลงทะเบียนได้ปกติ แค่ไม่มีภาพแนบ) |
| `drive_folder_id_attachment` | Folder ID สำหรับไฟล์แนบอื่น (เตรียมไว้สำหรับใช้งานต่อยอด) |

ค่าที่เหลือ (`max_failed_search`, `revision_reason_options`, `work_type_options`, `career_level_options` ฯลฯ) มีค่าเริ่มต้นที่ใช้งานได้ทันที ปรับได้ภายหลังตามต้องการ — ดูความหมายแต่ละคีย์ในคอลัมน์ `description` ของชีตเอง

### 2.6 ทดสอบก่อนใช้งานจริง

1. เปิด Web app URL แบบ **ไม่ Login** (เช่น หน้าต่าง Incognito) — ต้องเจอฟอร์ม "ตรวจสอบสถานะผลงานวิชาการ" (โซนประชาชน)
2. เปิดแบบ Login ด้วยบัญชี Admin คนแรก — ต้องเจอ Dashboard เจ้าหน้าที่ + เมนู "ผู้ดูแล" ที่ bottom-nav
3. รันฟังก์ชัน `seedSampleData()` จาก Editor เพื่อสร้างข้อมูลตัวอย่าง 6 เคส แล้วทดสอบ flow จริงในเว็บ: ค้นหา, สแกน QR (กรอกรหัส 8 ตัวเองได้ที่หน้าสแกน), กดปุ่ม action, ตรวจสอบสถานะฝั่งประชาชน (ใช้ tracking_no `SAMPLE-001`..`006` + last4 `0001`..`0006`), เข้าเมนู Admin ทุกแท็บ
4. **รัน `clearSampleData()` ก่อนเปิดใช้งานจริง** — ลบข้อมูลตัวอย่างออกทั้งหมด ไม่กระทบข้อมูลจริงที่ลงทะเบียนไปแล้ว (กรองด้วย `created_by`/`action_by` ไม่ใช่ลบทั้งชีต)
5. เพิ่มเจ้าหน้าที่จริงจากเมนู Admin > ผู้ใช้งาน ให้ครบตามหน่วยงาน/บทบาท ก่อนประกาศใช้งาน

---

## 3. สิทธิ์การเข้าถึง (Permissions)

ระบบมี "สิทธิ์" อยู่ 2 ชั้นที่แยกกันโดยสิ้นเชิง อย่าสับสน:

**ชั้นที่ 1 — ใครแก้โค้ด/เข้าถึง Spreadsheet ฐานข้อมูลได้ตรงๆ** (ควบคุมผ่าน Google Drive sharing ปกติ)
- Apps Script project: จำกัดเฉพาะทีมพัฒนา/ผู้ดูแลระบบจริงเท่านั้น — คนที่แก้โค้ดได้ = อ่าน Script Properties ได้ ซึ่งเก็บกุญแจถอดรหัส `CITIZEN_ID_AES_KEY` และ `CITIZEN_ID_HASH_SALT` (ดู `Crypto.gs`) เท่ากับเข้าถึงเลขบัตรประชาชนเต็ม 13 หลักของทุกคนในระบบได้
- Spreadsheet ฐานข้อมูล: **ไม่ควรแชร์ให้เจ้าหน้าที่ทั่วไป** — เจ้าหน้าที่ใช้งานผ่าน Web App เท่านั้น (ที่มีการกรองข้อมูลตาม role/organization ในโค้ด) การเปิดชีตตรงจะเห็นข้อมูลทุกหน่วยงานและ `citizen_id_encrypted`/`citizen_id_hash` ดิบๆ

**ชั้นที่ 2 — ใครใช้ Web App ได้ และเห็นอะไรบ้าง** (ควบคุมในโค้ด ผ่านชีต `Users`)
- `access: ANYONE` ใน `appsscript.json` หมายถึง "ใครก็เปิดลิงก์ได้" ไม่ใช่ "ใครก็เห็นข้อมูลภายในได้" — คนที่ไม่ Login หรือ Login ด้วยอีเมลที่ไม่อยู่ในชีต `Users` (หรือ `active=false`) จะเห็นแค่โซนประชาชน (ตรวจสอบสถานะด้วยเลขติดตาม+last4) หรือหน้า "ไม่มีสิทธิ์เข้าใช้งาน" เท่านั้น
- role ในชีต `Users` (`Admin` / `เจ้าหน้าที่รับเอกสาร` / `เจ้าหน้าที่ผู้รับผิดชอบ` / `ผู้ดูข้อมูลอย่างเดียว`) กำหนดว่าเห็นเมนู "ผู้ดูแล" ไหม (`role === 'Admin'` เท่านั้น — ดู `NAV_ITEMS_` ใน Views.gs) — ส่วน `organization` กำหนดขอบเขตข้อมูลที่เห็นบน Dashboard/ปุ่ม action (เห็นเฉพาะงานของหน่วยงานตน ยกเว้นค้นหาที่ค้นข้ามหน่วยงานได้)
- **ทุกจุดตรวจสิทธิ์ซ้ำที่ server เสมอ** ไม่เชื่อค่าจาก client (ปุ่มที่ซ่อนในหน้าเว็บไม่ใช่การป้องกันจริง — ดู `computeEligibleActions_` ใน Actions.gs และ guard ใน `doPost`)

**OAuth scopes ที่ระบบขอ** (ใน `appsscript.json`) และเหตุผล:
- `spreadsheets` — อ่าน/เขียนฐานข้อมูล
- `drive` — อัปโหลดภาพหน้าปกเข้า Google Drive folder ที่ตั้งค่าไว้ (ผ่าน `DriveApp`)
- `userinfo.email` — อ่านอีเมลผู้ Login เทียบกับชีต `Users`

---

## 4. อัปเดตโค้ดภายหลัง (Redeploy)

**สำคัญที่สุด: ต้อง deploy ทับ deploymentId เดิมเสมอ** ไม่เช่นนั้น URL จะเปลี่ยน ทำให้ QR ที่พิมพ์ไปแล้วและลิงก์ที่แชร์ไว้ใช้ไม่ได้

```
cd src
node --check ...     # ตรวจ syntax ไฟล์ที่แก้ (ดูหัวข้อ 5)
clasp push --force
clasp deploy -i <deploymentId เดิม> -d "คำอธิบายการเปลี่ยนแปลง"
```

ดู deploymentId เดิมได้จาก `clasp deployments` (เลือกอันที่ไม่ใช่ `@HEAD`/dev)

---

## 5. workflow ตรวจ syntax ก่อน push

Apps Script ใช้นามสกุลไฟล์ `.gs` ซึ่ง `node --check` อ่านไม่ได้ตรงๆ (`ERR_UNKNOWN_FILE_EXTENSION`) วิธีแก้ที่ใช้ตลอดโปรเจกต์นี้: คัดลอกไฟล์ `.gs` ที่แก้ไปเป็น `.js` ในโฟลเดอร์ชั่วคราวก่อนตรวจ แล้วลบทิ้ง — ไม่กระทบไฟล์จริงใน `src/`

---

## 6. สำรองข้อมูล (Backup)

- **Spreadsheet ฐานข้อมูล**: ใช้ Google Sheets version history ปกติ (File > Version history) หรือตั้ง export อัตโนมัติเพิ่มเติมถ้าต้องการ backup แยกที่
- **Script Properties** (`CITIZEN_ID_AES_KEY`, `CITIZEN_ID_HASH_SALT`, `SPREADSHEET_ID`): **ไม่มี UI export ในตัว Apps Script** — ถ้าคีย์เข้ารหัสหายไป (เช่น ลบ/สร้าง project ใหม่โดยไม่ได้ตั้งใจ) เลขบัตรประชาชนที่เข้ารหัสไว้เดิม (`citizen_id_encrypted`) จะถอดรหัสไม่ได้อีก (ข้อมูล `citizen_id_last4` และ `citizen_id_hash` ยังใช้งานได้ปกติ ไม่กระทบ) — ผู้ดูแลระบบควรบันทึกค่าทั้งสองนี้ไว้ในที่ปลอดภัยแยกต่างหากหลัง `installSystem()` รันครั้งแรก (Project Settings > Script Properties ใน Apps Script Editor)
