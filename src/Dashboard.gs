/**
 * แดชบอร์ดเจ้าหน้าที่ — สรุปงานตามหน่วยงานของผู้ Login (docs/DESIGN.md ข้อ 3.3)
 *
 * กติกาการนับ (อ้างอิงตาราง Action ในข้อ 3.2 และสมมติฐาน A9):
 *   - งานรอรับ            = handoff_pending=true และหน่วยงานของสถานีปัจจุบัน (WorkStations.org) คือหน่วยงานตน
 *   - กำลังดำเนินการ       = current_owner_org = หน่วยงานตน, handoff_pending=false, ยังไม่ terminal
 *   - ส่งต่อแล้วรอปลายทางรับ = handoff_pending=true และประวัติล่าสุดเป็น action 'forwarded' จากหน่วยงานตน (from_org)
 *   - ใกล้ครบกำหนด/เกินกำหนด = อยู่ในกลุ่ม "กำลังดำเนินการ" + จำนวนวันในสถานีปัจจุบัน ≥ 80% / > 100% ของ standard_days
 *   - ส่งกลับแก้ไข         = current_status_public = 'need_revision' และประวัติล่าสุดของงานนั้นบันทึกโดยหน่วยงานตน (action_by_org)
 */

var TERMINAL_STATUSES_ = ['done', 'terminated'];

function computeDashboardMetrics_(ss, org) {
  var works = readSheetAsObjects_(ss.getSheetByName(SHEET.WORKS));
  var history = readSheetAsObjects_(ss.getSheetByName(SHEET.STATUS_HISTORY));
  var stations = readSheetAsObjects_(ss.getSheetByName(SHEET.WORK_STATIONS));

  var stationByKey = {};
  stations.forEach(function (s) { stationByKey[s.station_key] = s; });

  // ประวัติเรียงตามลำดับที่บันทึก (append-only) แถวหลังสุดของแต่ละ work_id ทับของเดิมเสมอ = ประวัติล่าสุด
  var latestHistoryByWork = {};
  history.forEach(function (h) { latestHistoryByWork[h.work_id] = h; });

  var metrics = {
    pendingReceive: [],
    inProgress: [],
    awaitingDestination: [],
    nearDue: [],
    overdue: [],
    returnedForRevision: [],
  };

  works.forEach(function (w) {
    var station = stationByKey[w.current_station_key];
    var lastHist = latestHistoryByWork[w.work_id];

    if (w.handoff_pending) {
      if (station && station.org === org) metrics.pendingReceive.push(w);
      if (lastHist && lastHist.action === 'forwarded' && lastHist.from_org === org) {
        metrics.awaitingDestination.push(w);
      }
      // ระหว่างรอส่งมอบยังไม่มีใครเป็นเจ้าของงานจริง จึงไม่นับใน "กำลังดำเนินการ/ครบกำหนด" ของฝ่ายใด
    } else if (TERMINAL_STATUSES_.indexOf(w.current_status_public) === -1 && w.current_owner_org === org) {
      metrics.inProgress.push(w);
      var dueBucket = dueBucketFor_(history, w, station);
      if (dueBucket === 'overdue') metrics.overdue.push(w);
      else if (dueBucket === 'near') metrics.nearDue.push(w);
    }

    if (w.current_status_public === 'need_revision' && lastHist && lastHist.action_by_org === org) {
      metrics.returnedForRevision.push(w);
    }
  });

  return metrics;
}

/** คืน 'overdue' / 'near' / null ตามสัดส่วนวันที่อยู่ในสถานีปัจจุบันเทียบ standard_days (A9) */
function dueBucketFor_(history, work, station) {
  if (!station || !station.standard_days) return null;
  var enteredAt = findStationEntryDate_(history, work.work_id, work.current_station_key);
  if (!enteredAt) return null;
  var daysIn = daysBetween_(enteredAt, now_());
  var ratio = daysIn / Number(station.standard_days);
  if (ratio > 1) return 'overdue';
  if (ratio >= 0.8) return 'near';
  return null;
}

/** วันที่เริ่มเข้าสถานีปัจจุบัน = ประวัติล่าสุดที่ to_station ตรงกับสถานีนี้ และเป็น action ที่แปลว่า "เริ่มดำเนินการที่นี่" */
function findStationEntryDate_(history, workId, stationKey) {
  var entryDate = null;
  history.forEach(function (h) {
    if (h.work_id !== workId || h.to_station !== stationKey) return;
    if (h.action !== 'registered' && h.action !== 'received') return;
    entryDate = h.action_date;
  });
  return entryDate;
}
