/**
 * เลขบัตรประชาชน — เข้ารหัส/ถอดรหัส/แฮช (docs/DESIGN.md A5)
 * ใช้ AesCtr จาก ThirdPartyAes.gs สำหรับ citizen_id_encrypted (ย้อนกลับได้ ใช้ตอน Admin แก้ไขข้อมูล)
 * และ Utilities.computeDigest (SHA-256+salt) สำหรับ citizen_id_hash (ตรวจสอบซ้ำเท่านั้น ย้อนกลับไม่ได้)
 */

var AES_KEY_BITS_ = 256;

// AesCtr (vendored) เขียนมาสำหรับ browser/Node (btoa/atob/Buffer) — GAS ไม่มีทั้งคู่ จึงสลับมาใช้ Utilities แทน
AesCtr.base64Encode = function (str) {
  var bytes = [];
  for (var i = 0; i < str.length; i++) bytes.push(str.charCodeAt(i) & 0xff);
  return Utilities.base64Encode(bytes);
};
AesCtr.base64Decode = function (str) {
  var bytes = Utilities.base64Decode(str);
  var chars = [];
  for (var i = 0; i < bytes.length; i++) chars.push(String.fromCharCode(bytes[i] & 0xff));
  return chars.join('');
};

/** คีย์เข้ารหัส AES — สุ่มสร้างครั้งแรกที่ใช้งานและเก็บถาวรใน Script Properties (ไม่อยู่ในชีตที่คนอื่นเปิดดูได้) */
function getCitizenIdCryptoKey_() {
  var props = PropertiesService.getScriptProperties();
  var key = props.getProperty('CITIZEN_ID_AES_KEY');
  if (!key) {
    key = Utilities.base64Encode(Utilities.getUuid() + Utilities.getUuid());
    props.setProperty('CITIZEN_ID_AES_KEY', key);
  }
  return key;
}

/** salt สำหรับ hash — เก็บถาวรเช่นเดียวกับคีย์เข้ารหัส (เปลี่ยน salt ภายหลัง = hash เดิมทั้งหมดใช้เทียบซ้ำไม่ได้อีก) */
function getCitizenIdHashSalt_() {
  var props = PropertiesService.getScriptProperties();
  var salt = props.getProperty('CITIZEN_ID_HASH_SALT');
  if (!salt) {
    salt = Utilities.getUuid();
    props.setProperty('CITIZEN_ID_HASH_SALT', salt);
  }
  return salt;
}

/** เข้ารหัสเลขบัตร 13 หลักเต็ม — เก็บใน Works.citizen_id_encrypted */
function encryptCitizenId_(citizenId13) {
  return AesCtr.encrypt(String(citizenId13), getCitizenIdCryptoKey_(), AES_KEY_BITS_);
}

/** ถอดรหัส — ใช้เฉพาะหน้า Admin แก้ไขข้อมูล (ยังไม่มี UI เรียกใช้จนกว่าจะถึง Part หลังบ้าน Admin) */
function decryptCitizenId_(cipherText) {
  return AesCtr.decrypt(cipherText, getCitizenIdCryptoKey_(), AES_KEY_BITS_);
}

/** แฮชเลขบัตร 13 หลักเต็ม (SHA-256+salt) — ใช้ตรวจสอบเอกสารซ้ำเท่านั้น เก็บใน Works.citizen_id_hash */
function hashCitizenId_(citizenId13) {
  var salted = String(citizenId13) + '|' + getCitizenIdHashSalt_();
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salted, Utilities.Charset.UTF_8);
  return bytes.map(function (b) {
    var v = (b + 256) % 256;
    return ('0' + v.toString(16)).slice(-2);
  }).join('');
}
