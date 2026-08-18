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

/** ประวัติทั้งหมดของงานหนึ่งรายการ เรียงเก่า→ใหม่ (สำหรับ Timeline) */
function getHistoryForWork_(ss, workId) {
  var history = readSheetAsObjects_(ss.getSheetByName(SHEET.STATUS_HISTORY));
  return history.filter(function (h) { return h.work_id === workId; })
    .sort(function (a, b) { return new Date(a.created_at).getTime() - new Date(b.created_at).getTime(); });
}

/** สถานีทั้งหมด ทำเป็น map ด้วย station_key (ใช้แสดงชื่อสถานีในหน้ารายละเอียด/คำนวณขอบเขตค้นหา) */
function getStationsMap_(ss) {
  var stations = readSheetAsObjects_(ss.getSheetByName(SHEET.WORK_STATIONS));
  var map = {};
  stations.forEach(function (s) { map[s.station_key] = s; });
  return map;
}
