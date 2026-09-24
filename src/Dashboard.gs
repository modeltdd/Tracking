/**
 * แดชบอร์ดเจ้าหน้าที่ — สรุปงานตามหน่วยงานของผู้ Login (docs/DESIGN.md ข้อ 3.3)
 *
 * กติกาการนับ (อ้างอิงตาราง Action ในข้อ 3.2 และสมมติฐาน A9):
 *   - งานรอรับ            = handoff_pending=true และหน่วยงานของสถานีปัจจุบัน (WorkflowStates.org) คือหน่วยงานตน
 *   - กำลังดำเนินการ       = current_owner_org = หน่วยงานตน, handoff_pending=false, ยังไม่ terminal
 *   - ส่งต่อแล้วรอปลายทางรับ = handoff_pending=true และประวัติล่าสุดเป็น action 'forwarded' จากหน่วยงานตน (from_org)
 *   - ใกล้ครบกำหนด/เกินกำหนด = อยู่ในกลุ่ม "กำลังดำเนินการ" + จำนวนวันในสถานีปัจจุบัน ≥ 80% / > 100% ของ standard_days
 *   - ส่งกลับแก้ไข         = current_status_public = 'need_revision' และประวัติล่าสุดของงานนั้นบันทึกโดยหน่วยงานตน (action_by_org)
 *
 * หมายเหตุ (2026-09-08, โมเดล 24-state): handoff_pending ไม่ใช้แล้ว (คลิกเดียวเปลี่ยน state เลย) — bucket
 * "งานรอรับ"/"ส่งต่อแล้วรอปลายทางรับ" จะว่างเปล่าเสมอสำหรับงานที่เดินผ่าน state ใหม่ (ไม่ใช่บั๊ก แค่ไม่เกิดกรณีนี้อีก)
 * ตัวคำนวณ "ใกล้ครบกำหนด/เกินกำหนด" ยังทำงานตามปกติ (ดู findStationEntryDate_ — เปลี่ยนไปจับ action='transition' แทน 'received')
 */

var TERMINAL_STATUSES_ = ['done', 'terminated'];

/**
 * filters (2026-09-24 เพิ่มตามที่ผู้ใช้ขอ — หน้า Dashboard เจ้าหน้าที่/Admin เดิมกรองไม่ได้เลย): เดือน/ปี
 * (received_date, ตาม convention เดียวกับ computeResponsibleDashboardMetrics_), orgFrom (หน่วยงานต้นสังกัด
 * ผู้ยื่น — org_from), province — ทุกตัวเป็น optional (ไม่ส่งมา = ไม่กรอง แสดงครบเหมือนพฤติกรรมเดิมทุกประการ
 * กันเปลี่ยน business logic โดยไม่จำเป็น) กรองที่ระดับ `works` ก่อนคำนวณ bucket เดิมทั้งหมด ไม่แตะ logic บัคเก็ต
 */
function computeDashboardMetrics_(ss, org, filters) {
  filters = filters || {};
  var works = readSheetAsObjects_(ss.getSheetByName(SHEET.WORKS));
  if (filters.month || filters.year) {
    works = works.filter(function (w) {
      var d = new Date(w.received_date);
      if (isNaN(d.getTime())) return false;
      if (filters.year && d.getFullYear() !== Number(filters.year)) return false;
      if (filters.month && (d.getMonth() + 1) !== Number(filters.month)) return false;
      return true;
    });
  }
  if (filters.orgFrom) works = works.filter(function (w) { return w.org_from === filters.orgFrom; });
  if (filters.province) works = works.filter(function (w) { return w.province === filters.province; });

  var history = readSheetAsObjects_(ss.getSheetByName(SHEET.STATUS_HISTORY));
  var stations = readSheetAsObjects_(ss.getSheetByName(SHEET.WORKFLOW_STATES));

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
    if (h.action !== 'registered' && h.action !== 'transition') return;
    entryDate = h.action_date;
  });
  return entryDate;
}

/** "กำหนดเสร็จ" ของสถานีปัจจุบัน = วันที่เข้าสถานี + standard_days (2026-09-24, ใช้กับส่วน "งานใกล้ครบกำหนด"
 *  หน้า Dashboard) คืน null ถ้าคำนวณไม่ได้ (ไม่มี standard_days หรือยังไม่มีประวัติเข้าสถานีนี้) — ไม่เดา */
function computeStationDueDate_(history, work, station) {
  if (!station || !station.standard_days) return null;
  var enteredAt = findStationEntryDate_(history, work.work_id, work.current_station_key);
  if (!enteredAt) return null;
  var due = new Date(enteredAt);
  due.setDate(due.getDate() + Number(station.standard_days));
  return due;
}

/**
 * เมตริกสำหรับ Dashboard ใหม่ของบทบาท "ผู้รับผิดชอบ" (หน้าแรก) — ต่างจาก computeDashboardMetrics_ เดิม
 * (ที่คืน list งานตาม bucket การกระทำ) ฟังก์ชันนี้คืนตัวเลข KPI + ข้อมูลกราฟ + รายการล่าสุด กรองตามเดือน/ปีที่เลือก
 *
 * ขอบเขตหน่วยงาน = current_owner_org (convention เดียวกับ computeDashboardMetrics_/searchWorks_)
 * ขอบเขตเดือน = received_date อยู่ในเดือน/ปีที่เลือก (ยืนยันกับผู้ใช้แล้วว่าการ์ด "รายการทั้งหมด" ไม่กรองเดือน
 * ส่วนที่เหลือทั้งหมด — การ์ด 2-6, โดนัท, บาร์ชาร์ต, รายการล่าสุด — กรองตามเดือน/ปีที่เลือกทั้งหมด)
 */
function computeResponsibleDashboardMetrics_(ss, org, month, year) {
  var allWorks = readSheetAsObjects_(ss.getSheetByName(SHEET.WORKS));
  var stationsMap = getStationsMap_(ss);

  var orgWorks = allWorks.filter(function (w) { return w.current_owner_org === org; });

  var monthWorks = orgWorks.filter(function (w) {
    if (!w.received_date) return false;
    var d = new Date(w.received_date);
    return d.getMonth() + 1 === month && d.getFullYear() === year;
  });

  var result = {
    totalAllTime: orgWorks.length,
    monthCount: monthWorks.length,
    inProgress: 0,
    needRevision: 0,
    passed: 0,
    failedOrClosed: 0,
    donutBuckets: [],
    topStations: [],
    recentWorks: [],
  };

  var donutCounts = { inProgress: 0, needRevision: 0, passed: 0, failedOrClosed: 0, other: 0 };
  var stationCounts = {};

  monthWorks.forEach(function (w) {
    if (w.evaluation_result === 'ผ่าน') {
      result.passed++;
      donutCounts.passed++;
    } else if (w.evaluation_result === 'ไม่ผ่าน' || w.current_status_public === 'terminated') {
      result.failedOrClosed++;
      donutCounts.failedOrClosed++;
    } else if (w.current_status_public === 'need_revision') {
      result.needRevision++;
      donutCounts.needRevision++;
    } else if (TERMINAL_STATUSES_.indexOf(w.current_status_public) === -1) {
      result.inProgress++;
      donutCounts.inProgress++;
    } else {
      donutCounts.other++;
    }

    var stationKey = w.current_station_key;
    stationCounts[stationKey] = (stationCounts[stationKey] || 0) + 1;
  });

  result.donutBuckets = [
    { label: 'อยู่ระหว่างดำเนินการ', count: donutCounts.inProgress },
    { label: 'รอแก้ไข', count: donutCounts.needRevision },
    { label: 'ผ่านแล้ว', count: donutCounts.passed },
    { label: 'ไม่ผ่าน/ปิดเรื่อง', count: donutCounts.failedOrClosed },
    { label: 'อื่น ๆ', count: donutCounts.other },
  ].filter(function (b) { return b.count > 0; });

  result.topStations = Object.keys(stationCounts).map(function (key) {
    var station = stationsMap[key];
    var label = station ? (station.station_order + ' ' + station.station_name) : key;
    return { label: label, count: stationCounts[key] };
  }).sort(function (a, b) { return b.count - a.count; }).slice(0, 5);

  result.recentWorks = monthWorks.slice().sort(byUpdatedAtDesc_).slice(0, 10);

  return result;
}
