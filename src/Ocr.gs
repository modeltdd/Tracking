/**
 * OCR อ่านภาพหน้าปกผลงาน — Google Cloud Vision API ผ่าน UrlFetchApp (docs/DESIGN.md A4)
 *
 * ทำงานแบบ best-effort เท่านั้น: ถ้าไม่ได้ตั้งค่า ocr_api_key ไว้ หรือเรียก API ไม่สำเร็จไม่ว่าเหตุผลใด
 * ฟังก์ชันคืน null เงียบๆ — การลงทะเบียนเอกสารต้องสำเร็จได้เสมอแม้ OCR ใช้งานไม่ได้ (เจ้าหน้าที่กรอกฟอร์มเองแทน)
 *
 * หมายเหตุสมมติฐาน A11 (เพิ่มใน Part 3): ฟอร์มรับเอกสารใหม่เป็น HTML form ธรรมดา (POST ครั้งเดียว ไม่มี AJAX)
 * OCR จึงรันตอน submit และ "บันทึกข้อความที่อ่านได้" ไว้ใน StatusHistory.note ของ action แรก (registered)
 * ให้เจ้าหน้าที่ตรวจสอบย้อนหลังได้ ไม่ใช่การ auto-fill ฟอร์มก่อน submit (ต้องมี AJAX round-trip เพิ่มถ้าต้องการ)
 */
function runOcrOnBlob_(ss, blob) {
  var apiKey = getSetting_(ss, 'ocr_api_key', '');
  if (!apiKey || !blob) return null;

  try {
    var base64Image = Utilities.base64Encode(blob.getBytes());
    var payload = {
      requests: [{
        image: { content: base64Image },
        features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
      }],
    };
    var response = UrlFetchApp.fetch(
      'https://vision.googleapis.com/v1/images:annotate?key=' + encodeURIComponent(apiKey),
      {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify(payload),
        muteHttpExceptions: true,
      }
    );
    if (response.getResponseCode() !== 200) {
      Logger.log('OCR: Vision API ตอบ HTTP ' + response.getResponseCode() + ' — ' + response.getContentText().slice(0, 500));
      return null;
    }

    var json = JSON.parse(response.getContentText());
    var result = json.responses && json.responses[0];
    if (result && result.error) {
      Logger.log('OCR: Vision API คืน error — ' + JSON.stringify(result.error).slice(0, 500));
      return null;
    }
    var annotation = result && result.fullTextAnnotation;
    if (!annotation || !annotation.text) {
      Logger.log('OCR: Vision API สำเร็จแต่ไม่พบข้อความในภาพ (fullTextAnnotation ว่าง)');
      return null;
    }

    var pages = annotation.pages || [];
    var confidence = pages.length ? averagePageConfidence_(pages) : null;

    return { text: annotation.text, confidence: confidence };
  } catch (err) {
    Logger.log('OCR ล้มเหลว (ข้ามไป ให้กรอกฟอร์มเอง): ' + err.message);
    return null;
  }
}

function averagePageConfidence_(pages) {
  var sum = 0;
  var n = 0;
  pages.forEach(function (p) {
    if (typeof p.confidence === 'number') { sum += p.confidence; n++; }
  });
  return n ? sum / n : null;
}

/** true ถ้า OCR ไม่มั่นใจ (ต่ำกว่า Settings.ocr_confidence_threshold) หรือไม่มีผล OCR เลย */
function isOcrLowConfidence_(ss, ocrResult) {
  if (!ocrResult || ocrResult.confidence == null) return true;
  var threshold = Number(getSetting_(ss, 'ocr_confidence_threshold', '0.7'));
  return ocrResult.confidence < threshold;
}

/**
 * Client-callable ผ่าน google.script.run จากหน้าฟอร์มรับเอกสารใหม่ (เลือกไฟล์ปุ๊บรันทันที)
 * อ่านภาพหน้าปกผลงานด้วย OCR แล้วพยายามแยกฟิลด์ (ชื่อ-สกุล/ตำแหน่ง/ระดับ/ชื่อผลงาน/สังกัด) ให้อัตโนมัติ
 * เพื่อลดงานพิมพ์ของเจ้าหน้าที่ — ผลลัพธ์เป็นแค่ "ข้อเสนอ" เติมเฉพาะช่องที่ยังว่าง เจ้าหน้าที่ต้องตรวจสอบ/แก้ไขก่อนกด
 * "บันทึกและออกเลขติดตาม" เสมอ (OCR ตอน submit จริงยังทำงานเหมือนเดิมเป็น fallback + log ใน StatusHistory.note)
 *
 * google.script.run ไม่ได้วิ่งผ่าน doGet/doPost จึงไม่ผ่านการเช็คสิทธิ์ตรงนั้น ต้องเช็คเองในนี้ (กันคนนอกยิงตรง
 * มาใช้ ocr_api_key ของระบบฟรีๆ)
 */
function ocrPreviewCoverImage(base64Data, mimeType, filename) {
  var email = getCurrentUserEmail_();
  var user = email ? findUserByEmail_(email) : null;
  if (!user) {
    return { ok: false, message: 'ไม่มีสิทธิ์เข้าใช้งาน' };
  }

  var ss = getSpreadsheet_();
  var blob = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType || 'image/jpeg', filename || 'cover.jpg');
  var ocrResult = runOcrOnBlob_(ss, blob);
  if (!ocrResult) {
    return { ok: false, message: 'OCR ไม่พร้อมใช้งาน (ยังไม่ได้ตั้งค่า ocr_api_key ใน Settings หรืออ่านภาพไม่สำเร็จ) — กรอกข้อมูลด้วยตนเอง' };
  }
  return {
    ok: true,
    fields: parseCoverImageOcrText_(ocrResult.text),
    low_confidence: isOcrLowConfidence_(ss, ocrResult),
  };
}

/**
 * แยกฟิลด์แบบ best-effort จากข้อความ OCR ของหน้าปกผลงาน — หาแพทเทิร์นป้ายกำกับภาษาไทยที่พบทั่วไป
 * (ชื่อ-นามสกุล/ตำแหน่ง/ระดับ/ชื่อผลงาน/สังกัด) ไม่ครบทุกฟิลด์เสมอไป แม่นยำแค่ระดับ "ช่วยร่าง" เจ้าหน้าที่ต้องตรวจซ้ำ
 */
function parseCoverImageOcrText_(text) {
  var fields = {};
  var lines = String(text || '').split(/\r?\n/).map(function (l) { return l.trim(); }).filter(function (l) { return l; });

  function grabAfterLabel(labelPatterns) {
    for (var i = 0; i < lines.length; i++) {
      for (var p = 0; p < labelPatterns.length; p++) {
        var m = lines[i].match(labelPatterns[p]);
        if (!m) continue;
        var rest = lines[i].slice(m[0].length).replace(/^[:\-–\s]+/, '').trim();
        if (rest) return rest;
        if (lines[i + 1]) return lines[i + 1].trim();
      }
    }
    return '';
  }

  var nameLine = grabAfterLabel([/^ชื่อ[-\s]*(?:นามสกุล|สกุล)?\s*[:\-–]?/]);
  if (nameLine) {
    var nm = nameLine.match(/^(นาย|นาง|นางสาว|น\.ส\.|ดร\.)?\s*([ก-๙]+)\s+([ก-๙]+)/);
    if (nm) {
      if (nm[1]) fields.title_name = nm[1];
      fields.first_name = nm[2];
      fields.last_name = nm[3];
    }
  }

  fields.position = grabAfterLabel([/^ตำแหน่ง\s*[:\-–]?/]);
  fields.current_level = grabAfterLabel([/^ระดับปัจจุบัน\s*[:\-–]?/]);
  fields.requested_level = grabAfterLabel([/^ระดับที่ขอ(?:ประเมิน|เลื่อน)?\s*[:\-–]?/, /^ขอประเมินเลื่อนเป็นระดับ\s*[:\-–]?/]);
  if (!fields.current_level && !fields.requested_level) {
    var lvl = grabAfterLabel([/^ระดับ\s*[:\-–]?/]);
    if (lvl) fields.requested_level = lvl;
  }
  fields.work_title = grabAfterLabel([/^ชื่อผลงาน\s*[:\-–]?/, /^ชื่อเรื่อง\s*[:\-–]?/]);
  fields.org_from = grabAfterLabel([/^สังกัด\s*[:\-–]?/, /^หน่วยงาน(?:ต้นสังกัด)?\s*[:\-–]?/]);

  Object.keys(fields).forEach(function (k) { if (!fields[k]) delete fields[k]; });
  return fields;
}
