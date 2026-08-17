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
    if (response.getResponseCode() !== 200) return null;

    var json = JSON.parse(response.getContentText());
    var result = json.responses && json.responses[0];
    var annotation = result && result.fullTextAnnotation;
    if (!annotation || !annotation.text) return null;

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
