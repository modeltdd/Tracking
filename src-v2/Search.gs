/**
 * ค้นหารายการ + ดึงข้อมูลรายละเอียดงานเดี่ยว (docs/DESIGN.md ลำดับพัฒนา #5)
 * ไม่พิมพ์คำค้น -> แสดงงานของหน่วยงานตนเอง (ขอบเขตเดียวกับ Dashboard)
 * พิมพ์คำค้น -> ค้นหาทุกหน่วยงาน (เจ้าหน้าที่ต้องตามงานที่ส่งออกไปหน่วยงานอื่นได้ด้วย)
 */
function searchWorks_(ss, org, query) {
  var works = readSheetAsObjects_(ss.getSheetByName(SHEET.WORKS));
  query = String(query || '').trim();

  if (!query) {
    var stationByKey = getStationsMap_(ss);
    return works.filter(function (w) {
      if (w.current_owner_org === org) return true;
      var station = stationByKey[w.current_station_key];
      return !!(w.handoff_pending && station && station.org === org);
    }).sort(byUpdatedAtDesc_);
  }

  var needle = query.toLowerCase();
  return works.filter(function (w) {
    return String(w.tracking_no || '').toLowerCase().indexOf(needle) !== -1 ||
      String(w.first_name || '').toLowerCase().indexOf(needle) !== -1 ||
      String(w.last_name || '').toLowerCase().indexOf(needle) !== -1 ||
      String(w.work_title || '').toLowerCase().indexOf(needle) !== -1;
  }).sort(byUpdatedAtDesc_);
}

function byUpdatedAtDesc_(a, b) {
  return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
}

/** หา Work ตัวเดียวด้วย work_id — ใช้กับหน้ารายละเอียด */
function findWorkById_(ss, workId) {
  var works = readSheetAsObjects_(ss.getSheetByName(SHEET.WORKS));
  for (var i = 0; i < works.length; i++) {
    if (works[i].work_id === workId) return works[i];
  }
  return null;
}

/** หา Work ด้วย qr_token (ตัวพิมพ์ใหญ่/เล็กไม่สำคัญ) — ใช้ตอนสแกน QR / กรอกรหัสเองที่หน้าสแกน */
function findWorkByQrToken_(ss, token) {
  var needle = String(token || '').trim().toUpperCase();
  if (!needle) return null;
  var works = readSheetAsObjects_(ss.getSheetByName(SHEET.WORKS));
  for (var i = 0; i < works.length; i++) {
    if (String(works[i].qr_token || '').toUpperCase() === needle) return works[i];
  }
  return null;
}

/** หา Work ด้วยเลขติดตาม + เลขบัตรประชาชน 4 ตัวท้าย (ตรงทั้งคู่เท่านั้น) — ใช้เฉพาะหน้าตรวจสอบสถานะสาธารณะ */
function findWorkByTrackingAndLast4_(ss, trackingNo, last4) {
  var needleTracking = String(trackingNo || '').trim();
  var needleLast4 = String(last4 || '').trim();
  if (!needleTracking || !needleLast4) return null;
  var works = readSheetAsObjects_(ss.getSheetByName(SHEET.WORKS));
  for (var i = 0; i < works.length; i++) {
    if (String(works[i].tracking_no || '').trim() === needleTracking &&
        String(works[i].citizen_id_last4 || '').trim() === needleLast4) {
      return works[i];
    }
  }
  return null;
}

/** ประวัติทั้งหมดของงานหนึ่งรายการ เรียงเก่า→ใหม่ (สำหรับ Timeline) */
function getHistoryForWork_(ss, workId) {
  var history = readSheetAsObjects_(ss.getSheetByName(SHEET.STATUS_HISTORY));
  return history.filter(function (h) { return h.work_id === workId; })
    .sort(function (a, b) { return new Date(a.created_at).getTime() - new Date(b.created_at).getTime(); });
}

/**
 * สิทธิ์เปิดดูรายละเอียดงานเดี่ยว (หน้า detail มีข้อมูลส่วนบุคคลเต็ม: ชื่อ-สกุล, เลขบัตร 4 ตัวท้าย, เบอร์โทร, อีเมล)
 * ค้นหาข้ามหน่วยงานได้ (searchWorks_) ไม่ได้แปลว่าดูรายละเอียดได้ทุกงาน — ต้องเกี่ยวข้องกับงานนั้นจริง:
 * Admin เห็นทุกงาน, หรือหน่วยงานตนเองเป็นเจ้าของอยู่ตอนนี้ / เป็นต้นสังกัดผู้ยื่น / เคยรับ-ส่งงานนี้มาก่อน (ดูจาก StatusHistory)
 */
function canViewWorkDetail_(work, user, history) {
  if (user.role === 'Admin') return true;
  if (work.current_owner_org === user.organization) return true;
  if (work.org_from === user.organization) return true;
  return history.some(function (h) {
    return h.from_org === user.organization || h.to_org === user.organization;
  });
}

/** สถานีทั้งหมด (โมเดล 24-state, WorkflowStates) ทำเป็น map ด้วย station_key
 *  ใช้แสดงชื่อสถานีในหน้ารายละเอียด/คำนวณขอบเขตค้นหา/SLA ใกล้ครบกำหนด — เดิมอ่านจากชีต WorkStations
 *  (7 สถานีเส้นตรง) เปลี่ยนมาอ่าน WorkflowStates แทน (2026-09-08) โดยตั้งใจคงชื่อฟังก์ชัน/รูปแบบผลลัพธ์
 *  เดิมไว้ทุกประการ ให้โค้ดทุกจุดที่เรียกใช้ (Dashboard/Views/Actions) ทำงานต่อได้โดยไม่ต้องแก้ */
function getStationsMap_(ss) {
  var stations = readSheetAsObjects_(ss.getSheetByName(SHEET.WORKFLOW_STATES));
  var map = {};
  stations.forEach(function (s) { map[s.station_key] = s; });
  return map;
}

/** หน่วยงานผู้รับผิดชอบที่แท้จริงของ state นี้สำหรับงานนี้ — 'ORG_FROM' เป็นค่าพิเศษใน
 *  WorkflowStates.org แปลว่าให้ใช้ work.org_from (หน่วยงานต้นสังกัดผู้ยื่น) แทนค่าคงที่
 *  เพราะ state ที่ผู้รับผิดชอบคือ "หน่วยงานต้นสังกัด/เจ้าของผลงาน" ต่างกันไปตามงานแต่ละชิ้น */
function resolveResponsibleOrg_(stateDef, work) {
  if (!stateDef) return '';
  return stateDef.org === 'ORG_FROM' ? (work.org_from || '') : stateDef.org;
}
