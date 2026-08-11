/* ===================== ระบบติดตามสถานะผลงานวิชาการ — Interactive Prototype =====================
   Client-side only demo. All data is in-memory sample data (resets on reload). */

/* ---------- date helpers ---------- */
var TH_MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
function fmtDate(d){ d = new Date(d); return d.getDate() + ' ' + TH_MONTHS[d.getMonth()] + ' ' + (d.getFullYear()+543); }
function fmtDateTime(d){ d = new Date(d);
  var hh = String(d.getHours()).padStart(2,'0'), mm = String(d.getMinutes()).padStart(2,'0');
  return fmtDate(d) + ' เวลา ' + hh + '.' + mm + ' น.'; }
function fmtShort(d){ d = new Date(d); var mo = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  return d.getDate() + ' ' + mo[d.getMonth()] + ' ' + String((d.getFullYear()+543)).slice(2); }
var NOW = new Date(2026,7,11,9,20,0);
function daysBetween(a,b){ return Math.floor((b-a)/86400000); }
function mask2(s){ if(!s) return ''; s = String(s); return s.length<=1 ? s+'**' : s.slice(0,2)+'***'; }

/* ---------- workflow stations ---------- */
var WORKSTATIONS = [
  {key:'received', name:'รับเรื่องจากหน่วยงานต้นทาง', org:'กลุ่มงานบริหารทรัพยากรบุคคล', days:3, pub:'received', order:1, active:true, receiveRole:'เจ้าหน้าที่รับเอกสาร', approveRole:'-', notify:'ไม่มี (เตรียมไว้สำหรับ SMS/LINE ในอนาคต)'},
  {key:'checking', name:'ตรวจสอบความครบถ้วนเอกสาร', org:'กลุ่มงานบริหารทรัพยากรบุคคล', days:5, pub:'checking', order:2, active:true, receiveRole:'เจ้าหน้าที่รับเอกสาร', approveRole:'-', notify:'ไม่มี (เตรียมไว้สำหรับ SMS/LINE ในอนาคต)'},
  {key:'propose', name:'เสนอคณะกรรมการพิจารณา', org:'กลุ่มงานพัฒนาบุคลากร', days:5, pub:'in_review', order:3, active:true, receiveRole:'เจ้าหน้าที่ผู้รับผิดชอบ', approveRole:'-', notify:'ไม่มี'},
  {key:'review', name:'คณะกรรมการพิจารณา', org:'คณะกรรมการประเมินผลงานวิชาการ', days:15, pub:'in_review', order:4, active:true, receiveRole:'เลขานุการคณะกรรมการ', approveRole:'คณะกรรมการ', notify:'ไม่มี'},
  {key:'approve', name:'เสนอผู้บริหารอนุมัติ', org:'ผู้บริหารสำนักงานเขตสุขภาพที่ 11', days:7, pub:'pending_approval', order:5, active:true, receiveRole:'เลขานุการคณะกรรมการ', approveRole:'ผู้อำนวยการเขตสุขภาพที่ 11', notify:'ไม่มี'},
  {key:'announce', name:'แจ้งผลการพิจารณา', org:'กลุ่มงานบริหารทรัพยากรบุคคล', days:3, pub:'result_announced', order:6, active:true, receiveRole:'เจ้าหน้าที่รับเอกสาร', approveRole:'-', notify:'เตรียมไว้สำหรับแจ้งเตือน LINE/SMS'},
  {key:'closed', name:'ปิดงาน/จัดเก็บเอกสาร', org:'กลุ่มงานบริหารทรัพยากรบุคคล', days:2, pub:'done', order:7, active:true, receiveRole:'เจ้าหน้าที่รับเอกสาร', approveRole:'-', notify:'ไม่มี'},
];

var STATUS_META = {
  received:{label:'รับเอกสารแล้ว', cls:'active'},
  checking:{label:'ตรวจสอบความครบถ้วน', cls:'active'},
  need_revision:{label:'รอเจ้าของผลงานแก้ไข', cls:'revision'},
  in_review:{label:'อยู่ระหว่างพิจารณา', cls:'active'},
  pending_approval:{label:'รออนุมัติ', cls:'active'},
  result_announced:{label:'แจ้งผลแล้ว', cls:'done'},
  done:{label:'เสร็จสิ้น', cls:'done'},
  terminated:{label:'ยุติกระบวนการ', cls:'danger'},
};

var ACTION_LABELS = {
  registered:'ลงทะเบียนเอกสารใหม่', received:'รับเอกสารและเริ่มดำเนินการ', forwarded:'ผ่านและส่งต่อขั้นตอนถัดไป',
  revision_requested:'ส่งกลับให้เจ้าของผลงานแก้ไข', more_info:'ขอข้อมูลเพิ่มเติม',
  rejected:'ไม่ผ่านการพิจารณา', terminated:'ยุติกระบวนการ', closed:'ปิดงาน', reassigned:'เปลี่ยนผู้รับผิดชอบ',
};

var REVISION_REASONS = ['เอกสารไม่ครบถ้วน','ลายมือชื่อไม่ครบ','ข้อมูลในแบบฟอร์มไม่ครบ','รูปแบบผลงานไม่ถูกต้อง','ต้องแนบเอกสารเพิ่มเติม','อื่น ๆ'];

/* ---------- sample cases ---------- */
var SEQ = 218;
var CASES = [
  {
    id:'c218', trackingNo:'อวช11-2569-00218', last4:'4821',
    first:'นภสร', last:'ทุมมา', position:'พยาบาลวิชาชีพชำนาญการ', level:'ชำนาญการ → ชำนาญการพิเศษ',
    workTitle:'การพัฒนาแนวปฏิบัติการพยาบาลผู้ป่วยโรคเรื้อรังในชุมชน', workType:'ผลงานเชิงนวัตกรรม',
    orgFrom:'รพ.สต. บ้านโนนสูง อ.เมือง จ.อุบลราชธานี', receivedDate:new Date(2026,7,5),
    stationIdx:3, pub:'in_review', handoff:false, ownerOrg:'คณะกรรมการประเมินผลงานวิชาการ',
    handler:'เลขานุการคณะกรรมการ', updatedAt:new Date(2026,7,10,14,32), revision:null,
    log:[
      {at:new Date(2026,7,5,13,45), by:'สมใจ จันทร์เพ็ญ', org:'กลุ่มงานบริหารทรัพยากรบุคคล', action:'registered', from:null, to:'รับเรื่องจากหน่วยงานต้นทาง'},
      {at:new Date(2026,7,6,10,2), by:'สมใจ จันทร์เพ็ญ', org:'กลุ่มงานบริหารทรัพยากรบุคคล', action:'forwarded', from:'รับเรื่องจากหน่วยงานต้นทาง', to:'ตรวจสอบความครบถ้วนเอกสาร'},
      {at:new Date(2026,7,7,16,20), by:'สมใจ จันทร์เพ็ญ', org:'กลุ่มงานบริหารทรัพยากรบุคคล', action:'forwarded', from:'ตรวจสอบความครบถ้วนเอกสาร', to:'เสนอคณะกรรมการพิจารณา', note:'ตรวจครบตามเกณฑ์ ไม่มีข้อแก้ไข'},
      {at:new Date(2026,7,8,9,10), by:'วิภาวี รุ่งเรือง', org:'กลุ่มงานพัฒนาบุคลากร', action:'forwarded', from:'เสนอคณะกรรมการพิจารณา', to:'คณะกรรมการพิจารณา'},
      {at:new Date(2026,7,10,14,32), by:'เลขานุการคณะกรรมการ', org:'คณะกรรมการประเมินผลงานวิชาการ', action:'received', from:'เสนอคณะกรรมการพิจารณา', to:'คณะกรรมการพิจารณา'},
    ],
    attachments:['เอกสารฉบับเต็ม.pdf','ผลงานวิชาการ.pdf'], internalNotes:[],
  },
  {
    id:'c214', trackingNo:'อวช11-2569-00214', last4:'0193',
    first:'ธนากร', last:'ศรีวิไล', position:'นักวิชาการสาธารณสุขชำนาญการ', level:'ชำนาญการ → ชำนาญการพิเศษ',
    workTitle:'รูปแบบการดูแลผู้ป่วยเบาหวานโดยทีมสหวิชาชีพ', workType:'งานวิจัย (R2R)',
    orgFrom:'รพ.สต. ท่าช้าง อ.วารินชำราบ จ.อุบลราชธานี', receivedDate:new Date(2026,7,9),
    stationIdx:2, pub:'checking', handoff:true, ownerOrg:'กลุ่มงานพัฒนาบุคลากร',
    handler:null, updatedAt:new Date(2026,7,9,15,40), revision:null,
    log:[
      {at:new Date(2026,7,9,9,15), by:'สมใจ จันทร์เพ็ญ', org:'กลุ่มงานบริหารทรัพยากรบุคคล', action:'registered', from:null, to:'รับเรื่องจากหน่วยงานต้นทาง'},
      {at:new Date(2026,7,9,15,40), by:'สมใจ จันทร์เพ็ญ', org:'กลุ่มงานบริหารทรัพยากรบุคคล', action:'forwarded', from:'ตรวจสอบความครบถ้วนเอกสาร', to:'เสนอคณะกรรมการพิจารณา', note:'ตรวจครบตามเกณฑ์'},
    ],
    attachments:['เอกสารฉบับเต็ม.pdf'], internalNotes:[],
  },
  {
    id:'c209', trackingNo:'อวช11-2569-00209', last4:'7765',
    first:'อรุณี', last:'พรหมมา', position:'นักกายภาพบำบัดชำนาญการ', level:'ชำนาญการ → ชำนาญการพิเศษ',
    workTitle:'คู่มือการจัดการขยะติดเชื้อในหน่วยบริการปฐมภูมิ', workType:'คู่มือ/แนวปฏิบัติ',
    orgFrom:'สสอ.เมือง จ.ศรีสะเกษ', receivedDate:new Date(2026,6,30),
    stationIdx:1, pub:'need_revision', handoff:false, ownerOrg:'เจ้าของผลงาน (รอส่งฉบับแก้ไข)',
    handler:'สมใจ จันทร์เพ็ญ', updatedAt:new Date(2026,7,6,11,0),
    revision:{reasons:['เอกสารไม่ครบถ้วน','ต้องแนบเอกสารเพิ่มเติม'], other:'', dueDate:new Date(2026,7,20),
      note:'กรุณาแนบหนังสือรับรองจริยธรรมการวิจัยฉบับล่าสุด และลงนามรับรองสำเนาทุกหน้า'},
    log:[
      {at:new Date(2026,6,30,13,0), by:'สมใจ จันทร์เพ็ญ', org:'กลุ่มงานบริหารทรัพยากรบุคคล', action:'registered', from:null, to:'รับเรื่องจากหน่วยงานต้นทาง'},
      {at:new Date(2026,6,31,9,30), by:'สมใจ จันทร์เพ็ญ', org:'กลุ่มงานบริหารทรัพยากรบุคคล', action:'forwarded', from:'รับเรื่องจากหน่วยงานต้นทาง', to:'ตรวจสอบความครบถ้วนเอกสาร'},
      {at:new Date(2026,7,6,11,0), by:'สมใจ จันทร์เพ็ญ', org:'กลุ่มงานบริหารทรัพยากรบุคคล', action:'revision_requested', from:'ตรวจสอบความครบถ้วนเอกสาร', to:'ตรวจสอบความครบถ้วนเอกสาร',
        note:'เอกสารไม่ครบถ้วน, ต้องแนบเอกสารเพิ่มเติม — กรุณาแนบหนังสือรับรองจริยธรรมการวิจัยฉบับล่าสุด และลงนามรับรองสำเนาทุกหน้า'},
    ],
    attachments:['เอกสารฉบับเต็ม.pdf'], internalNotes:[{by:'สมใจ จันทร์เพ็ญ', at:new Date(2026,7,6,10,55), text:'โทรแจ้งหน่วยงานต้นทางแล้วเบื้องต้น รอส่งฉบับแก้ไขทางไปรษณีย์'}],
  },
  {
    id:'c201', trackingNo:'อวช11-2569-00201', last4:'3340',
    first:'ศิริพร', last:'แก้วมณี', position:'นักวิชาการคอมพิวเตอร์ชำนาญการ', level:'ชำนาญการ → ชำนาญการพิเศษ',
    workTitle:'การพัฒนาระบบนัดหมายผู้ป่วยผ่านไลน์ OA', workType:'นวัตกรรมดิจิทัล',
    orgFrom:'รพ. 50 พรรษา มหาวชิราลงกรณ จ.อุบลราชธานี', receivedDate:new Date(2026,6,10),
    stationIdx:6, pub:'done', handoff:false, ownerOrg:'กลุ่มงานบริหารทรัพยากรบุคคล (จัดเก็บแล้ว)',
    handler:'สมใจ จันทร์เพ็ญ', updatedAt:new Date(2026,7,2,10,15), revision:null,
    log:[
      {at:new Date(2026,6,10,13,0), by:'สมใจ จันทร์เพ็ญ', org:'กลุ่มงานบริหารทรัพยากรบุคคล', action:'registered', from:null, to:'รับเรื่องจากหน่วยงานต้นทาง'},
      {at:new Date(2026,6,11,10,0), by:'สมใจ จันทร์เพ็ญ', org:'กลุ่มงานบริหารทรัพยากรบุคคล', action:'forwarded', from:'รับเรื่องจากหน่วยงานต้นทาง', to:'ตรวจสอบความครบถ้วนเอกสาร'},
      {at:new Date(2026,6,14,9,0), by:'สมใจ จันทร์เพ็ญ', org:'กลุ่มงานบริหารทรัพยากรบุคคล', action:'forwarded', from:'ตรวจสอบความครบถ้วนเอกสาร', to:'เสนอคณะกรรมการพิจารณา'},
      {at:new Date(2026,6,20,14,0), by:'เลขานุการคณะกรรมการ', org:'คณะกรรมการประเมินผลงานวิชาการ', action:'forwarded', from:'คณะกรรมการพิจารณา', to:'เสนอผู้บริหารอนุมัติ', note:'มติที่ประชุม: ผ่าน'},
      {at:new Date(2026,6,26,11,0), by:'ผู้อำนวยการเขตสุขภาพที่ 11', org:'ผู้บริหารสำนักงานเขตสุขภาพที่ 11', action:'forwarded', from:'เสนอผู้บริหารอนุมัติ', to:'แจ้งผลการพิจารณา', note:'อนุมัติผลการประเมิน'},
      {at:new Date(2026,6,28,13,20), by:'สมใจ จันทร์เพ็ญ', org:'กลุ่มงานบริหารทรัพยากรบุคคล', action:'forwarded', from:'แจ้งผลการพิจารณา', to:'ปิดงาน/จัดเก็บเอกสาร'},
      {at:new Date(2026,7,2,10,15), by:'สมใจ จันทร์เพ็ญ', org:'กลุ่มงานบริหารทรัพยากรบุคคล', action:'closed', from:'ปิดงาน/จัดเก็บเอกสาร', to:'ปิดงาน/จัดเก็บเอกสาร'},
    ],
    attachments:['เอกสารฉบับเต็ม.pdf','ผลงานวิชาการ.pdf'], internalNotes:[],
  },
  {
    id:'c160', trackingNo:'อวช11-2569-00160', last4:'2299',
    first:'ประภาส', last:'บุญมี', position:'เจ้าพนักงานสาธารณสุขชำนาญงาน', level:'ชำนาญงาน → อาวุโส',
    workTitle:'แนวทางคัดกรองผู้ป่วยจิตเวชในชุมชน', workType:'ผลงานเชิงวิชาการ',
    orgFrom:'รพ.สต. หนองบัว จ.ยโสธร', receivedDate:new Date(2026,5,20),
    stationIdx:1, pub:'terminated', handoff:false, ownerOrg:'สิ้นสุดกระบวนการ',
    handler:'สมใจ จันทร์เพ็ญ', updatedAt:new Date(2026,6,15,9,0), revision:null,
    log:[
      {at:new Date(2026,5,20,10,0), by:'สมใจ จันทร์เพ็ญ', org:'กลุ่มงานบริหารทรัพยากรบุคคล', action:'registered', from:null, to:'รับเรื่องจากหน่วยงานต้นทาง'},
      {at:new Date(2026,6,15,9,0), by:'สมใจ จันทร์เพ็ญ', org:'กลุ่มงานบริหารทรัพยากรบุคคล', action:'terminated', from:'ตรวจสอบความครบถ้วนเอกสาร', to:'ตรวจสอบความครบถ้วนเอกสาร', note:'เจ้าของผลงานขอยุติเรื่องเนื่องจากโอนย้ายหน่วยงาน'},
    ],
    attachments:['เอกสารฉบับเต็ม.pdf'], internalNotes:[],
  },
];

var STAFF_LOGINS = [
  {org:'กลุ่มงานบริหารทรัพยากรบุคคล', name:'สมใจ จันทร์เพ็ญ', role:'เจ้าหน้าที่รับเอกสาร'},
  {org:'กลุ่มงานพัฒนาบุคลากร', name:'วิภาวี รุ่งเรือง', role:'เจ้าหน้าที่ผู้รับผิดชอบ'},
  {org:'คณะกรรมการประเมินผลงานวิชาการ', name:'เลขานุการคณะกรรมการ', role:'เลขานุการคณะกรรมการ'},
];

var USERS_DIR = [
  {name:'สมใจ จันทร์เพ็ญ', email:'somjai.c@healtharea11.go.th', role:'เจ้าหน้าที่รับเอกสาร', org:'กลุ่มงานบริหารทรัพยากรบุคคล', active:true},
  {name:'วิภาวี รุ่งเรือง', email:'wipawee.r@healtharea11.go.th', role:'เจ้าหน้าที่ผู้รับผิดชอบ', org:'กลุ่มงานพัฒนาบุคลากร', active:true},
  {name:'เลขานุการคณะกรรมการ', email:'secretary.committee@healtharea11.go.th', role:'เจ้าหน้าที่ผู้รับผิดชอบ', org:'คณะกรรมการประเมินผลงานวิชาการ', active:true},
  {name:'ผอ.เขตสุขภาพที่ 11', email:'director@healtharea11.go.th', role:'Admin', org:'สำนักงานเขตสุขภาพที่ 11', active:true},
  {name:'อนุชา ทองดี', email:'anucha.t@healtharea11.go.th', role:'ผู้ดูข้อมูลอย่างเดียว', org:'กลุ่มงานบริหารทรัพยากรบุคคล', active:false},
];

/* ---------- app state ---------- */
var state = {
  portal:'public',
  route:'home',
  params:{},
  staff:null, // {org,name,role}
  scanMode:null,
  scannedCase:null,
  outcomeChoice:null,
  intakeForm:null,
  detailTab:'owner',
  adminTab:'dashboard',
  publicResult:null,
};

function findCase(trackingNo, last4){
  return CASES.find(function(c){ return c.trackingNo===trackingNo && c.last4===last4; });
}
function stationOf(c){ return WORKSTATIONS[c.stationIdx]; }
function daysInStation(c){ return daysBetween(c.updatedAt, NOW); }
function isTerminal(c){ return c.pub==='done' || c.pub==='terminated'; }

/* ---------- small render helpers ---------- */
function esc(s){ return (s==null?'':String(s)); }
function pillFor(pub){ var m = STATUS_META[pub]; return '<span class="pill '+m.cls+'"><span class="dot"></span>'+m.label+'</span>'; }

function el(html){ var t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }

function toast(msg){
  var host = document.getElementById('toastwrap');
  var t = el('<div class="toast">✓ '+esc(msg)+'</div>');
  host.appendChild(t);
  setTimeout(function(){ t.style.opacity='0'; t.style.transition='opacity .3s'; setTimeout(function(){ host.removeChild(t); }, 300); }, 2200);
}

var modalConfirmCb = null;
function openModal(title, bodyHtml, confirmLabel, cb, onMount){
  modalConfirmCb = cb;
  var back = document.getElementById('modalHost');
  back.innerHTML = '<div class="modal-back" id="modalBack"><div class="modal-card">'+
    '<div class="modal-h">'+esc(title)+'</div>'+
    '<div class="modal-b">'+bodyHtml+'</div>'+
    '<div class="modal-f"><button class="btn btn-outline" id="modalCancel">ยกเลิก</button>'+
    '<button class="btn btn-primary" id="modalOk">'+esc(confirmLabel)+'</button></div>'+
    '</div></div>';
  document.getElementById('modalCancel').onclick = closeModal;
  document.getElementById('modalBack').onclick = function(e){ if(e.target.id==='modalBack') closeModal(); };
  document.getElementById('modalOk').onclick = function(){
    var cbf = modalConfirmCb;
    var result = cbf ? cbf() : true;
    if(result !== false) closeModal();
  };
  if(typeof onMount==='function') onMount();
}
function closeModal(){ document.getElementById('modalHost').innerHTML=''; modalConfirmCb=null; }
var ADMIN_IDENTITY = {org:'สำนักงานเขตสุขภาพที่ 11', name:'ผู้ดูแลระบบ (Admin)', role:'Admin'};
function actor(){ return state.staff || ADMIN_IDENTITY; }
function backAfterAction(){
  if(state.portal==='admin'){ state.adminTab='list'; render(); }
  else { setRoute('dashboard'); }
}
function openRevisionModal(c){
  var st = stationOf(c);
  var rows = REVISION_REASONS.map(function(r){
    return '<label class="chk-row"><input type="checkbox" class="revReason" value="'+r+'">'+r+'</label>';
  }).join('');
  var body = '<label>เหตุผล (เลือกได้หลายข้อ)</label><div class="checklist">'+rows+'</div>'+
    '<div class="field" id="revOtherWrap" style="margin-top:10px; display:none;"><label>ระบุรายละเอียดอื่น ๆ</label><textarea class="input" id="revOther" rows="2"></textarea></div>'+
    '<div class="field" style="margin-top:12px;"><label>รายละเอียดที่ต้องแก้ไข</label><textarea class="input" id="revNote" rows="3" placeholder="ระบุให้เจ้าของผลงานเข้าใจง่าย"></textarea></div>'+
    '<div class="field"><label>กำหนดวันที่ส่งกลับ</label><input type="date" class="input" id="revDue"></div>'+
    '<label class="chk-row"><input type="checkbox" checked disabled>แจ้งเจ้าของผลงานผ่านช่องทางที่ลงทะเบียนไว้</label>';
  openModal('ส่งกลับให้เจ้าของผลงานแก้ไข — '+c.trackingNo, body, 'ยืนยันส่งกลับแก้ไข', function(){
    var checked = Array.prototype.slice.call(document.querySelectorAll('.revReason:checked')).map(function(x){return x.value;});
    if(checked.length===0){ toast('กรุณาเลือกเหตุผลอย่างน้อย 1 ข้อ'); return false; }
    var other = document.getElementById('revOther').value.trim();
    var note = document.getElementById('revNote').value.trim();
    var dueVal = document.getElementById('revDue').value;
    var due = dueVal ? new Date(dueVal) : new Date(NOW.getFullYear(),NOW.getMonth(),NOW.getDate()+14);
    c.pub='need_revision'; c.updatedAt=new Date(NOW); c.handoff=false; c.ownerOrg='เจ้าของผลงาน (รอส่งฉบับแก้ไข)';
    c.revision = {reasons:checked.filter(function(r){return r!=='อื่น ๆ';}).concat(other?[other]:[]), other:other, dueDate:due, note:note};
    c.log.push({at:new Date(NOW), by:actor().name, org:actor().org, action:'revision_requested', from:st.name, to:st.name, note:checked.join(', ')+(note?' — '+note:'')});
    toast('ส่งกลับให้เจ้าของผลงานแก้ไขแล้ว');
    backAfterAction();
  }, function(){
    document.querySelectorAll('.revReason').forEach(function(cbEl){
      cbEl.addEventListener('change', function(){
        if(cbEl.value==='อื่น ๆ'){ document.getElementById('revOtherWrap').style.display = cbEl.checked ? 'block' : 'none'; }
      });
    });
  });
}

/* ---------- timeline renderers ---------- */
var PUB_STEPS = [
  {key:'received', label:'รับเอกสารแล้ว', desc:function(c){ return c.log[0] ? (c.log[0].org+'รับเอกสารแล้ว เมื่อวันที่ '+fmtDateTime(c.log[0].at)) : ''; }},
  {key:'checking', label:'ตรวจสอบความครบถ้วน', desc:function(c){ return 'เจ้าหน้าที่ตรวจสอบความครบถ้วนของเอกสารก่อนส่งต่อ'; }},
  {key:'in_review', label:'อยู่ระหว่างพิจารณา', desc:function(c){ return 'อยู่ระหว่างการพิจารณาของคณะกรรมการผู้ทรงคุณวุฒิ'; }},
  {key:'pending_approval', label:'รออนุมัติ', desc:function(c){ return 'รอผู้บริหารลงนามอนุมัติผลการพิจารณา'; }},
  {key:'result_announced', label:'แจ้งผล', desc:function(c){ return 'แจ้งผลการพิจารณาให้หน่วยงานต้นทางทราบ'; }},
  {key:'done', label:'เสร็จสิ้น', desc:function(c){ return 'ดำเนินการครบทุกขั้นตอนแล้ว จัดเก็บเอกสารเข้าทะเบียน'; }},
];
function pubStepOrder(pub){ if(pub==='need_revision') return 1; if(pub==='terminated') return -1; var i = PUB_STEPS.findIndex(function(s){return s.key===pub;}); return i<0?0:i; }

function renderPublicTimeline(c, compact){
  var curOrder = pubStepOrder(c.pub);
  var items = PUB_STEPS.map(function(s,i){
    var cls = i<curOrder ? 'done' : (i===curOrder ? 'now' : '');
    var when = i===curOrder ? fmtDateTime(c.updatedAt) : (i<curOrder ? '' : 'ยังไม่ถึงขั้นตอนนี้');
    return '<div class="tl-item '+cls+'">'+
      (when?'<div class="when">'+when+'</div>':'')+
      '<div class="what">'+s.label+'</div>'+
      (!compact ? '<div class="desc">'+s.desc(c)+'</div>' : '') +
      '</div>';
  }).join('');
  return '<div class="timeline">'+items+'</div>';
}

function renderStaffTimeline(c){
  var items = c.log.slice().reverse().map(function(l,idx){
    return '<div class="tl-item done">'+
      '<div class="when">'+fmtDateTime(l.at)+'</div>'+
      '<div class="what">'+esc(ACTION_LABELS[l.action]||l.action)+(l.to?' — '+esc(l.to):'')+'</div>'+
      '<div class="who">โดย '+esc(l.by)+' ('+esc(l.org)+')</div>'+
      (l.note?'<div class="note">'+esc(l.note)+'</div>':'')+
      '</div>';
  }).join('');
  return '<div class="timeline">'+items+'</div>';
}

/* ---------- registry table ---------- */
function renderRegistry(list, opts){
  opts = opts || {};
  var onClickAttr = opts.onRowClick || 'goDetail';
  var rowsT = list.map(function(c){
    return '<tr data-case="'+c.id+'" data-act="'+onClickAttr+'">'+
      '<td class="tnum">'+c.trackingNo+'</td>'+
      '<td class="namecell"><strong>'+c.first+' '+c.last+'</strong><span>'+c.position+'</span></td>'+
      '<td>'+c.orgFrom.split(' ')[0]+' '+(c.orgFrom.split(' ')[1]||'')+'</td>'+
      '<td class="tnum">'+fmtShort(c.receivedDate)+'</td>'+
      '<td>'+pillFor(c.pub)+'</td>'+
      '<td>'+esc(c.handoff ? (WORKSTATIONS[c.stationIdx].org+' (รอรับ)') : c.ownerOrg)+'</td>'+
      '<td class="tnum">'+fmtShort(c.updatedAt)+'</td>'+
      '<td class="tnum">'+daysInStation(c)+' วัน</td>'+
      '<td style="white-space:nowrap;"><button class="btn btn-ghost btn-sm" data-case="'+c.id+'" data-act="'+onClickAttr+'">ดู</button></td>'+
      '</tr>';
  }).join('');
  var cardsT = list.map(function(c){
    return '<div class="reg-card" data-case="'+c.id+'" data-act="'+onClickAttr+'">'+
      '<div class="top"><div><div class="tno tnum">'+c.trackingNo+'</div><h4>'+c.first+' '+c.last+'</h4></div>'+pillFor(c.pub)+'</div>'+
      '<div class="meta"><span>'+c.orgFrom.split(' ')[0]+'</span><span>·</span><span>รับ '+fmtShort(c.receivedDate)+'</span></div>'+
      '<div class="meta"><span>ผู้รับผิดชอบ: '+esc(c.handoff ? WORKSTATIONS[c.stationIdx].org+' (รอรับ)' : c.ownerOrg)+'</span></div>'+
      '</div>';
  }).join('');
  return '<div class="table-wrap"><table class="reg"><thead><tr>'+
    '<th>เลขติดตาม</th><th>ชื่อ–นามสกุล / ตำแหน่ง</th><th>หน่วยงานต้นทาง</th><th>วันที่รับ</th><th>สถานะ</th><th>ผู้รับผิดชอบปัจจุบัน</th><th>อัปเดตล่าสุด</th><th>อยู่ในสถานะ</th><th></th>'+
    '</tr></thead><tbody>'+(rowsT||'<tr><td colspan="9" class="empty-state">ไม่พบรายการ</td></tr>')+'</tbody></table></div>'+
    '<div class="reg-cards">'+(cardsT||'<div class="empty-state">ไม่พบรายการ</div>')+'</div>';
}

/* ================= ROUTER ================= */
function nav(portal, route, params){
  state.portal = portal || state.portal;
  state.route = route;
  state.params = params || {};
  render();
  window.scrollTo(0,0);
}
function setRoute(route, params){ nav(state.portal, route, params); }

function render(){
  document.getElementById('protoHint').textContent =
    state.portal==='public' ? 'มุมมองประชาชน · ไม่ต้อง Login' :
    state.portal==='staff' ? (state.staff ? 'เจ้าหน้าที่: '+state.staff.name+' · '+state.staff.org : 'เจ้าหน้าที่ · ยังไม่ Login') :
    'ผู้ดูแลระบบ / ผู้บริหาร';
  var app = document.getElementById('app');
  if(state.portal==='public') app.innerHTML = renderPublic();
  else if(state.portal==='staff') app.innerHTML = renderStaff();
  else app.innerHTML = renderAdmin();
  bindActions(app);
}

/* ================= PUBLIC PORTAL ================= */
function renderPublic(){
  if(state.route==='home') return publicHome();
  if(state.route==='result') return publicResult();
  if(state.route==='timeline') return publicTimelineFull();
  if(state.route==='revision') return publicRevisionDetail();
  if(state.route==='notfound') return publicNotFound();
  if(state.route==='scan') return publicScan();
  return publicHome();
}

function publicHome(){
  return '<div class="wrap-narrow">'+
    '<div class="pub-hero"><div class="pub-badge">11</div>'+
    '<h1>ระบบติดตามสถานะผลงานวิชาการ<br>สำนักงานเขตสุขภาพที่ 11</h1>'+
    '<p>ตรวจสอบความก้าวหน้าของเอกสารได้ด้วยตนเอง</p></div>'+
    '<div class="card"><div class="card-b">'+
      '<div class="field"><label>เลขติดตามเอกสาร</label><input class="input tnum" id="fTrack" placeholder="อวช11-2569-00000" value="อวช11-2569-00218"></div>'+
      '<div class="field"><label>เลขบัตรประชาชน 4 ตัวท้าย</label><input class="input tnum" id="fLast4" maxlength="4" placeholder="XXXX" value="4821"></div>'+
      '<button class="btn btn-primary btn-block btn-lg" data-act="doSearch">ตรวจสอบสถานะ</button>'+
      '<button class="btn btn-outline btn-block" style="margin-top:10px;" data-act="goScanPublic">📷 สแกน QR Code บนเอกสาร</button>'+
    '</div></div>'+
    '<div class="contact-box">พบปัญหาการใช้งาน ติดต่อกลุ่มงานบริหารทรัพยากรบุคคล<br>โทร. 045-000-000 ในวันและเวลาราชการ</div>'+
    '</div>';
}

function publicScan(){
  var opts = CASES.map(function(c){
    return '<button class="scan-chip" data-act="publicScanPick" data-case="'+c.id+'"><span><span class="t">จำลองสแกน QR</span><strong>'+c.trackingNo+'</strong></span><span>›</span></button>';
  }).join('');
  return '<div class="wrap-narrow">'+
    '<button class="btn btn-ghost" data-act="goHome" style="margin-bottom:10px;">‹ กลับ</button>'+
    '<div class="scanner"><div class="frame"><div class="line"></div></div><div class="cap">กำลังค้นหา QR Code…</div></div>'+
    '<p class="muted-note" style="text-align:center;">โหมดสาธิต — เลือกเอกสารจำลองด้านล่างแทนการสแกนจริง</p>'+
    '<div class="scan-list">'+opts+'</div>'+
    '</div>';
}

function publicNotFound(){
  return '<div class="wrap-narrow">'+
    '<button class="btn btn-ghost" data-act="goHome" style="margin-bottom:10px;">‹ กลับ</button>'+
    '<div class="card"><div class="card-b" style="text-align:center; padding:34px 18px;">'+
    '<div style="font-size:2.2rem;">🔍</div>'+
    '<h3 style="margin:10px 0 6px;">ไม่พบข้อมูล</h3>'+
    '<p style="color:var(--ink-muted); font-size:.9rem;">กรุณาตรวจสอบเลขติดตามเอกสารและเลขบัตรประชาชน 4 ตัวท้ายอีกครั้ง<br>หากยังไม่พบ กรุณาติดต่อกลุ่มงานบริหารทรัพยากรบุคคล</p>'+
    '<button class="btn btn-primary" data-act="goHome" style="margin-top:14px;">ลองใหม่อีกครั้ง</button>'+
    '</div></div></div>';
}

function publicResult(){
  var c = state.publicResult; if(!c) return publicNotFound();
  var next = isTerminal(c) ? '—' : (STATUS_META[c.pub].label==='รอเจ้าของผลงานแก้ไข' ? 'กรุณาส่งเอกสารฉบับแก้ไขภายในกำหนด' : 'รอเจ้าหน้าที่ดำเนินการขั้นตอนถัดไป');
  var ownerOrgShown = c.handoff ? (WORKSTATIONS[c.stationIdx].org) : c.ownerOrg.replace('(รอส่งฉบับแก้ไข)','').replace('(จัดเก็บแล้ว)','');
  var revisionBox = c.pub==='need_revision' ? (
    '<div class="alert orange"><span class="ico">⚠️</span><div class="body">'+
    '<b>เอกสารถูกส่งกลับเพื่อขอให้แก้ไข</b>'+
    'แจ้งเมื่อ '+fmtDateTime(c.log[c.log.length-1].at)+' · กำหนดส่งกลับภายใน '+fmtDate(c.revision.dueDate)+
    '<div style="margin-top:8px;"><button class="btn btn-outline btn-sm" data-act="goRevision">ดูรายละเอียดที่ต้องแก้ไข →</button></div>'+
    '</div></div>'
  ) : '';
  return '<div class="wrap-narrow">'+
    '<button class="btn btn-ghost" data-act="goHome" style="margin-bottom:6px;">‹ ตรวจสอบรายการอื่น</button>'+
    '<div class="card"><div class="card-b">'+
    '<div class="result-track tnum">เลขติดตาม: '+c.trackingNo+'</div>'+
    '<div class="result-owner">เจ้าของผลงาน: '+mask2(c.first)+' '+mask2(c.last)+'</div>'+
    '<dl class="dl">'+
    '<dt>ชื่อผลงาน</dt><dd>'+c.workTitle+'</dd>'+
    '<dt>ประเภทผลงาน</dt><dd>'+c.workType+'</dd>'+
    '<dt>วันที่รับเอกสาร</dt><dd class="tnum">'+fmtDate(c.receivedDate)+'</dd>'+
    '<dt>สถานะปัจจุบัน</dt><dd>'+pillFor(c.pub)+'</dd>'+
    '<dt>หน่วยงานที่ดำเนินการ</dt><dd>'+ownerOrgShown+'</dd>'+
    '<dt>อัปเดตล่าสุด</dt><dd class="tnum">'+fmtDateTime(c.updatedAt)+'</dd>'+
    '</dl>'+
    '<div class="instr" style="margin-top:14px;">ขั้นตอนต่อไป: '+next+'</div>'+
    revisionBox+
    '<button class="btn btn-outline btn-block" style="margin-top:14px;" data-act="goTimeline">ดู Timeline การดำเนินงานทั้งหมด</button>'+
    '</div></div>'+
    '<div class="contact-box">พบปัญหาการใช้งาน ติดต่อกลุ่มงานบริหารทรัพยากรบุคคล<br>โทร. 045-000-000</div>'+
    '</div>';
}

function publicTimelineFull(){
  var c = state.publicResult; if(!c) return publicNotFound();
  return '<div class="wrap-narrow">'+
    '<button class="btn btn-ghost" data-act="goResult" style="margin-bottom:6px;">‹ กลับ</button>'+
    '<div class="card"><div class="card-h">Timeline การดำเนินงาน · <span class="tnum">'+c.trackingNo+'</span></div>'+
    '<div class="card-b">'+renderPublicTimeline(c,false)+'</div></div>'+
    '</div>';
}

function publicRevisionDetail(){
  var c = state.publicResult; if(!c || !c.revision) return publicNotFound();
  var r = c.revision;
  var reasons = r.reasons.map(function(x){ return '<li>'+x+'</li>'; }).join('');
  return '<div class="wrap-narrow">'+
    '<button class="btn btn-ghost" data-act="goResult" style="margin-bottom:6px;">‹ กลับ</button>'+
    '<div class="card"><div class="card-h" style="background:var(--st-revision-bg); color:var(--st-revision-ink);">รายการที่ต้องแก้ไข</div>'+
    '<div class="card-b">'+
    '<ul style="margin:0 0 14px; padding-left:20px; font-size:.92rem;">'+reasons+'</ul>'+
    (r.note ? '<p style="font-size:.9rem; color:var(--ink-muted); background:var(--surface-muted); padding:10px 12px; border-radius:8px;">'+r.note+'</p>' : '')+
    '<dl class="dl" style="margin-top:12px;"><dt>วันที่แจ้ง</dt><dd class="tnum">'+fmtDate(c.log[c.log.length-1].at)+'</dd>'+
    '<dt>กำหนดส่งกลับ</dt><dd class="tnum">'+fmtDate(r.dueDate)+'</dd></dl>'+
    '<div class="contact-box" style="border-top:none; padding-top:6px;">ติดต่อกลุ่มงานบริหารทรัพยากรบุคคล โทร. 045-000-000</div>'+
    '</div></div></div>';
}

/* ================= STAFF PORTAL ================= */
function renderStaff(){
  if(!state.staff) return staffLogin();
  var body;
  switch(state.route){
    case 'dashboard': body = staffDashboard(); break;
    case 'scan': body = staffScan(); break;
    case 'scanresult': body = staffScanResult(); break;
    case 'receiveconfirm': body = staffReceiveConfirm(); break;
    case 'closestep': body = staffCloseStep(); break;
    case 'search': body = staffSearch(); break;
    case 'detail': body = staffDetail(); break;
    case 'register': body = staffRegister(); break;
    default: body = staffDashboard();
  }
  return staffShell(body);
}

function staffShell(bodyHtml){
  return '<div class="staff-top"><div><div class="name">'+state.staff.name+'</div><div class="org">'+state.staff.org+' · '+state.staff.role+'</div></div>'+
    '<button data-act="staffLogout">ออกจากระบบ</button></div>'+
    '<div class="staff-body">'+bodyHtml+'</div>'+
    '<nav class="bottomnav">'+
    '<button class="bn-link '+(state.route==='dashboard'?'active':'')+'" data-act="staffGo" data-route="dashboard"><span class="bn-ico">🏠</span>หน้าหลัก</button>'+
    '<button class="bn-link '+(state.route==='search'?'active':'')+'" data-act="staffGo" data-route="search"><span class="bn-ico">🔎</span>ค้นหา</button>'+
    '<button class="bn-link qr" data-act="staffScanCenter"><span class="bn-ico">▦</span></button>'+
    '<button class="bn-link '+(state.route==='register'?'active':'')+'" data-act="staffGo" data-route="register"><span class="bn-ico">📥</span>ลงทะเบียน</button>'+
    '<button class="bn-link" data-act="noop"><span class="bn-ico">👤</span>บัญชี</button>'+
    '</nav>';
}

function staffLogin(){
  var opts = STAFF_LOGINS.map(function(s,i){
    return '<button class="login-opt" data-act="doLogin" data-idx="'+i+'"><span class="av">'+s.name.slice(0,1)+'</span>'+
      '<span><strong>'+s.name+'</strong><span>'+s.org+' · '+s.role+'</span></span></button>';
  }).join('');
  return '<div class="wrap-narrow">'+
    '<div class="pub-hero" style="padding-top:34px;"><div class="pub-badge">11</div>'+
    '<h1>ระบบสำหรับเจ้าหน้าที่</h1><p>เข้าสู่ระบบด้วยบัญชี Google ของหน่วยงาน (จำลอง)</p></div>'+
    '<div class="card"><div class="card-b"><label>เลือกบัญชีสาธิตเพื่อเข้าสู่ระบบ</label><div class="login-list">'+opts+'</div>'+
    '<p class="muted-note">ระบบจริงตรวจสอบสิทธิ์จากอีเมล Google Workspace เทียบกับชีต Users</p>'+
    '</div></div></div>';
}

function staffScopedCases(){
  return CASES.filter(function(c){ return !isTerminal(c) || c.pub==='terminated'; });
}
function orgCases(){
  var org = state.staff.org;
  return {
    incoming: CASES.filter(function(c){ return c.handoff && WORKSTATIONS[c.stationIdx].org===org; }),
    outgoing: CASES.filter(function(c){ return c.handoff && c.log[c.log.length-1].org===org && WORKSTATIONS[c.stationIdx].org!==org; }),
    active: CASES.filter(function(c){ return !c.handoff && c.ownerOrg===org && !isTerminal(c); }),
    revision: CASES.filter(function(c){ return c.pub==='need_revision' && c.log[c.log.length-1].org===org; }),
  };
}
function staffDashboard(){
  var oc = orgCases();
  var soon = oc.active.filter(function(c){ var st=stationOf(c); var d=daysInStation(c); return d>=st.days*0.8 && d<=st.days; });
  var over = oc.active.filter(function(c){ var st=stationOf(c); return daysInStation(c)>st.days; });
  var mine = oc.active.slice(0,5).map(function(c){
    return '<div class="mywork-row"><div><div class="t tnum">'+c.trackingNo+'</div><strong>'+c.first+' '+c.last+'</strong>'+
      '<div class="sub">'+c.workTitle.slice(0,28)+'…</div></div>'+
      '<div style="text-align:right;">'+pillFor(c.pub)+'<div class="sub tnum">'+daysInStation(c)+' วัน</div></div></div>';
  }).join('') || '<div class="empty-state">ไม่มีงานที่กำลังดำเนินการ</div>';
  return '<div class="actiongrid">'+
    '<button class="actionbtn primary" data-act="scanMode" data-mode="receive"><span class="ico">📥</span><span class="t">สแกนรับงาน</span></button>'+
    '<button class="actionbtn" data-act="scanMode" data-mode="action"><span class="ico">📤</span><span class="t">สแกนส่งต่อ / สิ้นสุดขั้นตอน</span></button>'+
    '<button class="actionbtn" data-act="staffGo" data-route="search"><span class="ico">🔎</span><span class="t">ค้นหารายการ</span></button>'+
    '</div>'+
    '<div class="stats2">'+
    '<div class="stat"><div class="n">'+oc.incoming.length+'</div><div class="l">งานรอรับ</div></div>'+
    '<div class="stat"><div class="n">'+oc.active.length+'</div><div class="l">กำลังดำเนินการ</div></div>'+
    '<div class="stat"><div class="n">'+oc.outgoing.length+'</div><div class="l">ส่งต่อแล้ว รอปลายทางรับ</div></div>'+
    '<div class="stat warn"><div class="n">'+soon.length+'</div><div class="l">ใกล้ครบกำหนด</div></div>'+
    '<div class="stat danger"><div class="n">'+over.length+'</div><div class="l">เกินกำหนด</div></div>'+
    '<div class="stat warn"><div class="n">'+oc.revision.length+'</div><div class="l">ส่งกลับแก้ไข</div></div>'+
    '</div>'+
    '<div class="card"><div class="card-h">งานของฉันวันนี้</div><div class="card-b" style="padding:6px 16px;">'+mine+'</div></div>';
}

function staffScan(){
  var mode = state.scanMode;
  var org = state.staff.org;
  var list = mode==='receive' ? CASES.filter(function(c){ return c.handoff && WORKSTATIONS[c.stationIdx].org===org; })
                               : CASES.filter(function(c){ return !c.handoff && c.ownerOrg===org && !isTerminal(c); });
  var chips = list.map(function(c){
    return '<button class="scan-chip" data-act="scanPick" data-case="'+c.id+'"><span><span class="t">จำลองสแกน QR</span><strong>'+c.trackingNo+' · '+c.first+' '+c.last+'</strong></span><span>›</span></button>';
  }).join('') || '<div class="empty-state">'+(mode==='receive' ? 'ไม่มีเอกสารรอรับในขณะนี้' : 'ไม่มีเอกสารที่กำลังดำเนินการอยู่กับหน่วยงานของท่าน')+'</div>';
  return '<button class="btn btn-ghost" data-act="staffGo" data-route="dashboard" style="margin-bottom:10px;">‹ กลับ</button>'+
    '<h2 style="margin-bottom:12px;">'+(mode==='receive'?'สแกนรับงาน':'สแกนส่งต่อ / สิ้นสุดขั้นตอน')+'</h2>'+
    '<div class="scanner"><div class="frame"><div class="line"></div></div><div class="cap">กำลังค้นหา QR Code…</div></div>'+
    '<p class="muted-note" style="text-align:center;">โหมดสาธิต — เลือกเอกสารจำลองด้านล่างแทนการสแกนกล้องจริง</p>'+
    '<div class="scan-list">'+chips+'</div>';
}

function staffScanResult(){
  var c = state.scannedCase; if(!c) return staffDashboard();
  var st = stationOf(c);
  var incomingHere = c.handoff && st.org===state.staff.org;
  var actionHere = !c.handoff && c.ownerOrg===state.staff.org && !isTerminal(c);
  return '<button class="btn btn-ghost" data-act="staffGo" data-route="dashboard" style="margin-bottom:10px;">‹ กลับหน้าหลัก</button>'+
    '<div class="card"><div class="card-h"><span class="tnum">'+c.trackingNo+'</span>'+pillFor(c.pub)+'</div>'+
    '<div class="card-b">'+
    '<dl class="dl">'+
    '<dt>เจ้าของผลงาน</dt><dd>'+mask2(c.first)+' '+mask2(c.last)+'</dd>'+
    '<dt>ชื่อผลงาน</dt><dd>'+c.workTitle+'</dd>'+
    '<dt>หน่วยงานต้นทาง</dt><dd>'+c.orgFrom+'</dd>'+
    '<dt>ขั้นตอนปัจจุบัน</dt><dd>'+st.name+'</dd>'+
    '<dt>ระยะเวลามาตรฐาน</dt><dd>'+st.days+' วัน</dd>'+
    '</dl>'+
    (incomingHere ? '<button class="btn btn-primary btn-block btn-lg" style="margin-top:16px;" data-act="staffGo" data-route="receiveconfirm">รับเอกสารและเริ่มดำเนินการ</button>' : '') +
    (actionHere ? '<button class="btn btn-primary btn-block btn-lg" style="margin-top:16px;" data-act="staffGo" data-route="closestep">สิ้นสุดขั้นตอนนี้</button>' : '') +
    (!incomingHere && !actionHere ? '<p class="muted-note" style="margin-top:14px;">เอกสารนี้ไม่ได้อยู่ในความรับผิดชอบของหน่วยงานท่านในขณะนี้ — สามารถดูรายละเอียดได้จากหน้าค้นหา</p>' : '') +
    '</div></div>';
}

function staffReceiveConfirm(){
  var c = state.scannedCase; var st = stationOf(c);
  return '<button class="btn btn-ghost" data-act="staffGo" data-route="scanresult" style="margin-bottom:10px;">‹ กลับ</button>'+
    '<div class="card"><div class="card-h">ยืนยันรับเอกสาร</div><div class="card-b">'+
    '<div class="confirm-flow">'+
    '<div><span class="tnum">'+c.trackingNo+'</span> · '+c.workTitle+'</div>'+
    '<div class="step2"><span class="pill pending">'+c.orgFrom.split(' ')[0]+'</span><span class="arrow">→</span><span class="pill active">'+st.org+'</span></div>'+
    '<div>ผู้ดำเนินการ: <b>'+state.staff.name+'</b></div>'+
    '<div>วันที่และเวลา: <b class="tnum">'+fmtDateTime(NOW)+'</b> (ระบบบันทึกอัตโนมัติ)</div>'+
    '</div>'+
    '<button class="btn btn-primary btn-block btn-lg" style="margin-top:18px;" data-act="doReceive">รับเอกสารและเริ่มดำเนินการ</button>'+
    '</div></div>';
}

function staffCloseStep(){
  var c = state.scannedCase;
  return '<button class="btn btn-ghost" data-act="staffGo" data-route="scanresult" style="margin-bottom:10px;">‹ กลับ</button>'+
    '<div class="card"><div class="card-h"><span class="tnum">'+c.trackingNo+'</span> · ผลการดำเนินการขั้นตอนนี้</div>'+
    '<div class="card-b">'+
    '<div class="outcome-grid">'+
    '<button class="outcome-btn go" data-act="outcome" data-v="forwarded">ผ่านและส่งต่อขั้นตอนถัดไป<div class="sub">ระบบเลือกขั้นตอนถัดไปให้อัตโนมัติ</div></button>'+
    '<button class="outcome-btn warn" data-act="outcome" data-v="more_info">ขอข้อมูลเพิ่มเติม<div class="sub">แจ้งหน่วยงานต้นทางให้ส่งข้อมูลเพิ่ม โดยไม่ถือเป็นการตีกลับ</div></button>'+
    '<button class="outcome-btn warn" data-act="outcome" data-v="revision_requested">ส่งกลับให้เจ้าของผลงานแก้ไข<div class="sub">ระบุเหตุผลและกำหนดวันส่งกลับ</div></button>'+
    '<button class="outcome-btn stop" data-act="outcome" data-v="rejected">ไม่ผ่านการพิจารณา</button>'+
    '<button class="outcome-btn stop" data-act="outcome" data-v="terminated">ยุติกระบวนการ</button>'+
    '</div></div></div>';
}

function staffSearch(){
  var q = (state.params.q||'').trim().toLowerCase();
  var list = CASES.filter(function(c){
    if(!q) return true;
    return c.trackingNo.toLowerCase().indexOf(q)>=0 || (c.first+c.last).toLowerCase().indexOf(q)>=0;
  });
  return '<h2 style="margin-bottom:12px;">ค้นหารายการ</h2>'+
    '<div class="filterbar"><div class="field grow"><label>ค้นหา (ชื่อ / เลขติดตาม)</label>'+
    '<input class="input" id="searchQ" placeholder="เช่น อวช11-2569-00218" value="'+esc(state.params.q||'')+'"></div>'+
    '<div class="field"><label>สถานะ</label><select class="input"><option>ทั้งหมด</option></select></div>'+
    '<button class="btn btn-primary" data-act="doStaffSearch">ค้นหา</button></div>'+
    renderRegistry(list, {onRowClick:'goDetailStaff'});
}

function staffDetail(){
  var c = state.scannedCase; if(!c) return staffSearch();
  var tabs = [['owner','ข้อมูลเจ้าของผลงาน'],['work','รายละเอียดผลงาน'],['status','สถานะและ Timeline'],['files','เอกสารแนบ']];
  var tabBtns = tabs.map(function(t){ return '<button class="tabbtn2 '+(state.detailTab===t[0]?'active':'')+'" data-act="setTab" data-tab="'+t[0]+'">'+t[1]+'</button>'; }).join('');
  var body = '';
  if(state.detailTab==='owner'){
    body = '<dl class="dl"><dt>ชื่อ–นามสกุล</dt><dd>'+c.first+' '+c.last+'</dd>'+
      '<dt>ตำแหน่ง</dt><dd>'+c.position+'</dd><dt>ระดับ</dt><dd>'+c.level+'</dd>'+
      '<dt>หน่วยงาน</dt><dd>'+c.orgFrom+'</dd><dt>เลขบัตร (4 ตัวท้าย)</dt><dd class="tnum">••••••••'+c.last4+'</dd></dl>';
  } else if(state.detailTab==='work'){
    body = '<dl class="dl"><dt>ชื่อผลงาน</dt><dd>'+c.workTitle+'</dd><dt>ประเภทผลงาน</dt><dd>'+c.workType+'</dd>'+
      '<dt>วันที่รับเอกสาร</dt><dd class="tnum">'+fmtDate(c.receivedDate)+'</dd></dl>';
  } else if(state.detailTab==='status'){
    body = '<div class="kv-list" style="margin-bottom:16px;"><dl class="dl">'+
      '<dt>สถานะปัจจุบัน</dt><dd>'+pillFor(c.pub)+'</dd>'+
      '<dt>ผู้รับผิดชอบ</dt><dd>'+esc(c.handoff? WORKSTATIONS[c.stationIdx].org+' (รอรับ)':c.ownerOrg)+'</dd>'+
      '<dt>อัปเดตล่าสุด</dt><dd class="tnum">'+fmtDateTime(c.updatedAt)+'</dd></dl></div>'+
      renderStaffTimeline(c);
  } else if(state.detailTab==='files'){
    body = c.attachments.map(function(f){ return '<div style="display:flex;align-items:center;gap:8px;padding:8px 0;">📄 '+f+'</div>'; }).join('');
  }
  return '<button class="btn btn-ghost" data-act="staffGo" data-route="search" style="margin-bottom:6px;">‹ กลับไปค้นหา</button>'+
    '<div class="row-between" style="margin-bottom:8px;"><h2 class="tnum">'+c.trackingNo+'</h2><button class="btn btn-outline btn-sm">🖨️ พิมพ์ QR</button></div>'+
    '<div class="tabs">'+tabBtns+'</div><div class="card"><div class="card-b">'+body+'</div></div>';
}

function staffRegister(){
  var f = state.intakeForm;
  if(!f){
    return '<h2 style="margin-bottom:12px;">ลงทะเบียนเอกสารใหม่</h2>'+
      '<div class="steps"><div class="step now"><span class="num">1</span>ถ่ายรูปหน้าปก</div>'+
      '<div class="step"><span class="num">2</span>OCR อ่านข้อมูล</div><div class="step"><span class="num">3</span>ตรวจสอบ</div><div class="step"><span class="num">4</span>ลงทะเบียน</div></div>'+
      '<div class="dropzone" style="margin:0 auto;"><div class="cover-mock"><div class="doc"></div><span style="font-size:.72rem;">ยังไม่มีภาพหน้าปก</span></div></div>'+
      '<button class="btn btn-primary btn-block btn-lg" style="margin-top:14px; max-width:230px; margin-left:auto; margin-right:auto;" data-act="mockCapture">📷 ถ่ายภาพ / อัปโหลด</button>';
  }
  if(!f.ocrDone){
    return '<h2 style="margin-bottom:12px;">ลงทะเบียนเอกสารใหม่</h2>'+
      '<div class="steps"><div class="step done"><span class="num">✓</span>ถ่ายรูปหน้าปก</div>'+
      '<div class="step now"><span class="num">2</span>OCR อ่านข้อมูล</div><div class="step"><span class="num">3</span>ตรวจสอบ</div><div class="step"><span class="num">4</span>ลงทะเบียน</div></div>'+
      '<div class="dropzone" style="margin:0 auto;"><div class="cover-mock"><div class="doc"></div></div></div>'+
      '<button class="btn btn-primary btn-block btn-lg" style="margin-top:14px; max-width:260px; margin-left:auto; margin-right:auto;" data-act="mockOcr">🪄 จำลองอ่านข้อมูลด้วย OCR</button>';
  }
  return '<h2 style="margin-bottom:12px;">ลงทะเบียนเอกสารใหม่</h2>'+
    '<div class="steps"><div class="step done"><span class="num">✓</span>ถ่ายรูปหน้าปก</div>'+
    '<div class="step done"><span class="num">✓</span>OCR อ่านข้อมูล</div><div class="step now"><span class="num">3</span>ตรวจสอบ</div><div class="step"><span class="num">4</span>ลงทะเบียน</div></div>'+
    '<div class="grid2">'+
    '<div class="field"><div class="flabel-row"><label>ชื่อ–นามสกุล</label><span class="confidence high">OCR 95%</span></div><input class="input" id="ifName" value="'+f.name+'"></div>'+
    '<div class="field"><div class="flabel-row"><label>เลขบัตรประชาชน</label><span class="confidence low">OCR 58%</span></div><input class="input unsure" id="ifCid" value="'+f.cid+'"></div>'+
    '<div class="field"><label>ตำแหน่ง</label><input class="input" id="ifPos" value="'+f.pos+'"></div>'+
    '<div class="field"><label>ระดับ</label><input class="input" id="ifLevel" value="'+f.level+'"></div>'+
    '<div class="field" style="grid-column:1/-1;"><div class="flabel-row"><label>ชื่อผลงาน</label><span class="confidence low">OCR 62%</span></div><input class="input unsure" id="ifTitle" value="'+f.title+'"></div>'+
    '<div class="field"><label>ประเภทผลงาน</label><input class="input" id="ifType" value="'+f.type+'"></div>'+
    '<div class="field"><label>หน่วยงาน</label><input class="input" id="ifOrg" value="'+f.org+'"></div>'+
    '</div>'+
    '<button class="btn btn-primary btn-block btn-lg" style="margin-top:6px;" data-act="doRegister">ลงทะเบียนและออกเลขติดตาม →</button>';
}

/* ================= ADMIN PORTAL ================= */
function renderAdmin(){
  var body;
  switch(state.adminTab){
    case 'dashboard': body = adminDashboard(); break;
    case 'list': body = adminList(); break;
    case 'workflow': body = adminWorkflow(); break;
    case 'users': body = adminUsers(); break;
    case 'reports': body = adminReports(); break;
    case 'auditlog': body = adminAudit(); break;
    case 'detail': body = adminDetail(); break;
    default: body = adminDashboard();
  }
  var items = [['dashboard','📊','Dashboard ผู้บริหาร'],['list','📋','จัดการรายการทั้งหมด'],['workflow','🔀','จัดการ Workflow'],
    ['users','👤','ผู้ใช้งานและสิทธิ์'],['reports','🧾','รายงาน'],['auditlog','🕵️','Audit Log']];
  var side = items.map(function(it){ return '<div class="admin-link '+(state.adminTab===it[0]?'active':'')+'" data-act="adminGo" data-tab="'+it[0]+'"><span>'+it[1]+'</span>'+it[2]+'</div>'; }).join('');
  var top = items.map(function(it){ return '<button class="'+(state.adminTab===it[0]?'active':'')+'" data-act="adminGo" data-tab="'+it[0]+'">'+it[1]+' '+it[2]+'</button>'; }).join('');
  return '<div class="admin-app"><nav class="admin-side"><div class="brand">อวช.11 · Admin<br><small>สำนักงานเขตสุขภาพที่ 11</small></div>'+side+'</nav>'+
    '<div><div class="admin-topbar-mobile">'+top+'</div><div class="admin-main">'+body+'</div></div></div>';
}

function adminDashboard(){
  var total = CASES.length;
  var byStatus = {};
  CASES.forEach(function(c){ byStatus[c.pub] = (byStatus[c.pub]||0)+1; });
  var bars = Object.keys(STATUS_META).map(function(k){
    var n = byStatus[k]||0; var pct = total? Math.round(n/total*100):0;
    return '<div class="barrow"><span>'+STATUS_META[k].label+'</span><div class="track"><div class="fill" style="width:'+pct+'%;"></div></div><span class="n">'+n+'</span></div>';
  }).join('');
  var doneCount = CASES.filter(function(c){return c.pub==='done';}).length;
  var overdue = CASES.filter(function(c){ var st=stationOf(c); return !isTerminal(c) && daysInStation(c)>st.days; }).length;
  var byType = {}; CASES.forEach(function(c){ byType[c.workType]=(byType[c.workType]||0)+1; });
  var typeRows = Object.keys(byType).map(function(k){ return '<div class="barrow"><span>'+k+'</span><div class="track"><div class="fill" style="width:'+Math.round(byType[k]/total*100)+'%; background:var(--accent);"></div></div><span class="n">'+byType[k]+'</span></div>'; }).join('');
  var longPending = CASES.filter(function(c){return !isTerminal(c);}).sort(function(a,b){return daysInStation(b)-daysInStation(a);}).slice(0,5);
  return '<div class="section-title">ภาพรวมทั้งหมด</div>'+
    '<div class="dashgrid">'+
    '<div class="stat"><div class="n">'+total+'</div><div class="l">เอกสารทั้งหมด</div></div>'+
    '<div class="stat"><div class="n">'+doneCount+'</div><div class="l">เสร็จสิ้นแล้ว</div></div>'+
    '<div class="stat danger"><div class="n">'+overdue+'</div><div class="l">เกินกำหนด</div></div>'+
    '<div class="stat"><div class="n">12.4</div><div class="l">วันเฉลี่ยต่อขั้นตอน</div></div>'+
    '</div>'+
    '<div class="card" style="margin-bottom:14px;"><div class="card-h">จำนวนงานแยกตามสถานะ</div><div class="card-b barlist">'+bars+'</div></div>'+
    '<div class="card" style="margin-bottom:14px;"><div class="card-h">จำนวนงานแยกตามประเภทผลงาน</div><div class="card-b barlist">'+typeRows+'</div></div>'+
    '<div class="card"><div class="card-h">รายการที่ค้างนานที่สุด</div><div class="card-b" style="padding:0;">'+renderRegistry(longPending,{onRowClick:'goDetailStaff'})+'</div></div>';
}

function adminList(){
  return '<div class="section-title">จัดการรายการทั้งหมด</div>'+
    '<div class="filterbar"><div class="field grow"><label>ค้นหา</label><input class="input" placeholder="ชื่อ / เลขติดตาม"></div>'+
    '<div class="field"><label>สถานะ</label><select class="input"><option>ทั้งหมด</option></select></div>'+
    '<div class="field"><label>หน่วยงาน</label><select class="input"><option>ทั้งหมด</option></select></div>'+
    '<button class="btn btn-primary">ค้นหา</button></div>'+
    '<div class="card"><div class="card-b" style="padding:0;">'+renderRegistry(CASES,{onRowClick:'goDetailStaff'})+'</div></div>'+
    '<p class="muted-note">Admin สามารถเปลี่ยนสถานะย้อนหลังหรือข้ามขั้นตอนได้จากหน้ารายละเอียด โดยต้องกรอกเหตุผลทุกครั้ง</p>';
}

function adminWorkflow(){
  var rows = WORKSTATIONS.map(function(w,i){
    return '<div class="wf-row">'+
      '<div class="wf-order"><button data-act="wfMove" data-i="'+i+'" data-d="-1" '+(i===0?'disabled':'')+'>▲</button><button data-act="wfMove" data-i="'+i+'" data-d="1" '+(i===WORKSTATIONS.length-1?'disabled':'')+'>▼</button></div>'+
      '<div class="wf-name"><b>'+w.order+'. '+w.name+'</b><span>ถัดไป: '+(WORKSTATIONS[i+1]?WORKSTATIONS[i+1].name:'— (ขั้นสุดท้าย)')+'</span></div>'+
      '<div>'+w.org+'</div>'+
      '<div class="tnum">'+w.days+' วัน</div>'+
      '<div style="font-size:.78rem; color:var(--ink-muted);">รับงาน: '+w.receiveRole+'</div>'+
      '<label class="switch"><input type="checkbox" data-act="wfToggle" data-i="'+i+'" '+(w.active?'checked':'')+'><span class="track"></span><span class="thumb"></span></label>'+
      '</div>';
  }).join('');
  return '<div class="section-title">จัดการ Workflow</div>'+
    '<p class="muted-note" style="margin-bottom:12px;">กำหนดลำดับขั้นตอน หน่วยงานรับผิดชอบ และระยะเวลามาตรฐานได้โดยไม่ต้องแก้ไขโค้ด — ป้องกันการข้ามขั้นตอนโดยไม่ได้รับอนุญาตโดยอัตโนมัติ</p>'+
    '<div class="card"><div class="card-b" style="padding:4px 8px;">'+rows+'</div></div>'+
    '<button class="btn btn-outline" style="margin-top:12px;">+ เพิ่มขั้นตอน</button>';
}

function adminUsers(){
  var rows = USERS_DIR.map(function(u,i){
    return '<tr><td><strong>'+u.name+'</strong><div style="font-size:.76rem;color:var(--ink-muted);">'+u.email+'</div></td>'+
      '<td>'+u.role+'</td><td>'+u.org+'</td>'+
      '<td><label class="switch"><input type="checkbox" data-act="userToggle" data-i="'+i+'" '+(u.active?'checked':'')+'><span class="track"></span><span class="thumb"></span></label></td></tr>';
  }).join('');
  return '<div class="section-title">ผู้ใช้งานและสิทธิ์</div>'+
    '<div class="card"><div class="card-b" style="padding:0;"><div class="table-wrap"><table class="reg">'+
    '<thead><tr><th>ผู้ใช้งาน</th><th>บทบาท</th><th>หน่วยงาน</th><th>ใช้งาน</th></tr></thead><tbody>'+rows+'</tbody></table></div></div></div>'+
    '<button class="btn btn-outline" style="margin-top:12px;">+ เพิ่มผู้ใช้งาน</button>';
}

function adminDetail(){
  var c = state.scannedCase; if(!c) return adminList();
  var st = stationOf(c);
  var tabs = [['owner','ข้อมูลเจ้าของผลงาน'],['work','รายละเอียดผลงาน'],['status','สถานะและ Timeline'],['files','เอกสารแนบ'],['notes','หมายเหตุภายใน'],['history','ประวัติการดำเนินการ'],['notif','ประวัติการแจ้งเตือน']];
  var tabBtns = tabs.map(function(t){ return '<button class="tabbtn2 '+(state.detailTab===t[0]?'active':'')+'" data-act="setTab" data-tab="'+t[0]+'">'+t[1]+'</button>'; }).join('');
  var body='';
  if(state.detailTab==='owner'){
    body = '<dl class="dl"><dt>ชื่อ–นามสกุล</dt><dd>'+c.first+' '+c.last+'</dd>'+
      '<dt>ตำแหน่ง</dt><dd>'+c.position+'</dd><dt>ระดับ</dt><dd>'+c.level+'</dd>'+
      '<dt>หน่วยงานต้นทาง</dt><dd>'+c.orgFrom+'</dd><dt>เลขบัตร (4 ตัวท้าย)</dt><dd class="tnum">••••••••'+c.last4+'</dd></dl>';
  } else if(state.detailTab==='work'){
    body = '<dl class="dl"><dt>ชื่อผลงาน</dt><dd>'+c.workTitle+'</dd><dt>ประเภทผลงาน</dt><dd>'+c.workType+'</dd>'+
      '<dt>วันที่รับเอกสาร</dt><dd class="tnum">'+fmtDate(c.receivedDate)+'</dd></dl>';
  } else if(state.detailTab==='status'){
    body = '<dl class="dl" style="margin-bottom:16px;"><dt>สถานะปัจจุบัน</dt><dd>'+pillFor(c.pub)+'</dd>'+
      '<dt>ผู้รับผิดชอบ</dt><dd>'+esc(c.handoff? WORKSTATIONS[c.stationIdx].org+' (รอรับ)':c.ownerOrg)+'</dd>'+
      '<dt>อัปเดตล่าสุด</dt><dd class="tnum">'+fmtDateTime(c.updatedAt)+'</dd>'+
      '<dt>อยู่ในสถานะนี้มา</dt><dd class="tnum">'+daysInStation(c)+' วัน (มาตรฐาน '+st.days+' วัน)</dd></dl>'+
      renderPublicTimeline(c,true);
  } else if(state.detailTab==='files'){
    body = c.attachments.map(function(f){ return '<div style="display:flex;align-items:center;gap:8px;padding:8px 0;">📄 '+f+'</div>'; }).join('') || '<div class="empty-state">ไม่มีไฟล์แนบ</div>';
  } else if(state.detailTab==='notes'){
    var notes = c.internalNotes.map(function(n){ return '<div class="tl-item done"><div class="when">'+fmtDateTime(n.at)+'</div><div class="who">'+n.by+'</div><div class="desc">'+esc(n.text)+'</div></div>'; }).join('');
    body = '<div class="field"><textarea class="input" id="newNote" rows="2" placeholder="เพิ่มหมายเหตุภายใน (ไม่แสดงต่อสาธารณะ)"></textarea>'+
      '<button class="btn btn-outline btn-sm" style="margin-top:8px;" data-act="addNote">+ เพิ่มหมายเหตุ</button></div>'+
      '<div class="timeline" style="margin-top:14px;">'+(notes||'<div class="empty-state">ยังไม่มีหมายเหตุภายใน</div>')+'</div>';
  } else if(state.detailTab==='history'){
    body = renderStaffTimeline(c);
  } else if(state.detailTab==='notif'){
    body = '<div class="empty-state">ยังไม่เปิดใช้งานการแจ้งเตือนอัตโนมัติ (LINE/Email) ในเฟสนี้ — เตรียมโครงสร้างข้อมูลไว้รองรับการเพิ่มในระยะถัดไป</div>';
  }
  return '<button class="btn btn-ghost" data-act="adminGo" data-tab="list" style="margin-bottom:6px;">‹ กลับไปรายการทั้งหมด</button>'+
    '<div class="row-between" style="margin-bottom:10px;"><h2 class="tnum">'+c.trackingNo+'</h2>'+
    '<div style="display:flex; gap:8px; flex-wrap:wrap;">'+
    '<button class="btn btn-outline btn-sm">🖨️ พิมพ์ QR</button>'+
    '<button class="btn btn-outline btn-sm" data-act="adminEditWork">✎ แก้ไขข้อมูล</button>'+
    (!isTerminal(c) ? '<button class="btn btn-outline btn-sm" data-act="outcome" data-v="forwarded">➜ ส่งต่อ</button>' : '')+
    (!isTerminal(c) ? '<button class="btn btn-outline btn-sm" data-act="outcome" data-v="revision_requested">↩ ส่งกลับแก้ไข</button>' : '')+
    '<button class="btn btn-outline btn-sm" data-act="adminReassign">🔁 เปลี่ยนผู้รับผิดชอบ</button>'+
    '<button class="btn btn-outline btn-sm" data-act="adminDownloadHistory">⬇ ดาวน์โหลดประวัติ</button>'+
    (!isTerminal(c) ? '<button class="btn btn-danger-outline btn-sm" data-act="adminCloseWork">■ ปิดงาน</button>' : '')+
    '</div></div>'+
    '<div class="tabs">'+tabBtns+'</div><div class="card"><div class="card-b">'+body+'</div></div>';
}

function adminReports(){
  return '<div class="section-title">รายงาน</div>'+
    '<div class="filterbar"><div class="field"><label>ช่วงวันที่</label><input class="input" placeholder="เลือกช่วงวันที่"></div>'+
    '<div class="field"><label>ประเภทผลงาน</label><select class="input"><option>ทั้งหมด</option></select></div>'+
    '<div class="field"><label>หน่วยงาน</label><select class="input"><option>ทั้งหมด</option></select></div>'+
    '<button class="btn btn-primary" data-act="exportCsv">⬇ ดาวน์โหลดรายงาน (CSV)</button></div>'+
    '<div class="card"><div class="card-b" style="padding:0;">'+renderRegistry(CASES,{onRowClick:'goDetailStaff'})+'</div></div>';
}

function adminAudit(){
  var rows = [];
  CASES.forEach(function(c){
    c.log.forEach(function(l){ rows.push({at:l.at, by:l.by, org:l.org, action:ACTION_LABELS[l.action]||l.action, track:c.trackingNo, note:l.note||((l.from&&l.to&&l.from!==l.to)?(l.from+' → '+l.to):'')}); });
  });
  rows.sort(function(a,b){ return b.at-a.at; });
  var trs = rows.map(function(r){
    return '<tr><td class="tnum">'+fmtDateTime(r.at)+'</td><td>'+r.by+'<div style="font-size:.74rem;color:var(--ink-muted);">'+r.org+'</div></td>'+
      '<td>'+r.action+'</td><td class="tnum">'+r.track+'</td><td style="font-size:.82rem;color:var(--ink-muted);">'+esc(r.note)+'</td></tr>';
  }).join('');
  return '<div class="section-title">Audit Log</div>'+
    '<p class="muted-note" style="margin-bottom:12px;">บันทึกทุกการดำเนินการแบบอ่านอย่างเดียว ห้ามลบหรือแก้ไขย้อนหลัง</p>'+
    '<div class="card"><div class="card-b" style="padding:0;"><div class="table-wrap"><table class="reg">'+
    '<thead><tr><th>เวลา</th><th>ผู้ดำเนินการ</th><th>การกระทำ</th><th>เลขติดตาม</th><th>รายละเอียด</th></tr></thead><tbody>'+trs+'</tbody></table></div></div></div>';
}

/* ================= ACTIONS ================= */
function bindActions(root){
  root.querySelectorAll('[data-act]').forEach(function(node){
    var act = node.getAttribute('data-act');
    if(node._bound) return; node._bound = true;
    node.addEventListener('click', function(e){ ACTIONS[act] && ACTIONS[act](node,e); });
    if(node.tagName==='INPUT' && act==='wfToggle'){ node.addEventListener('change', function(){ ACTIONS.wfToggle(node); }); }
    if(node.tagName==='INPUT' && act==='userToggle'){ node.addEventListener('change', function(){ ACTIONS.userToggle(node); }); }
  });
}

var ACTIONS = {
  noop:function(){},
  goHome:function(){ nav('public','home'); },
  goScanPublic:function(){ nav('public','scan'); },
  publicScanPick:function(node){ var c = CASES.find(function(x){return x.id===node.getAttribute('data-case');}); state.publicResult=c; nav('public','result'); },
  goResult:function(){ nav('public','result'); },
  goTimeline:function(){ nav('public','timeline'); },
  goRevision:function(){ nav('public','revision'); },
  doSearch:function(){
    var track = document.getElementById('fTrack').value.trim();
    var last4 = document.getElementById('fLast4').value.trim();
    var c = findCase(track,last4);
    if(c){ state.publicResult=c; nav('public','result'); } else { nav('public','notfound'); }
  },

  doLogin:function(node){ state.staff = STAFF_LOGINS[+node.getAttribute('data-idx')]; nav('staff','dashboard'); },
  staffLogout:function(){ state.staff=null; state.scannedCase=null; nav('staff','dashboard'); },
  staffGo:function(node){ setRoute(node.getAttribute('data-route')); },
  staffScanCenter:function(){ nav('staff','scan'); state.scanMode='action'; render(); },
  scanMode:function(node){ state.scanMode = node.getAttribute('data-mode'); setRoute('scan'); },
  scanPick:function(node){ state.scannedCase = CASES.find(function(c){return c.id===node.getAttribute('data-case');}); setRoute('scanresult'); },
  goDetail:function(node){ state.publicResult = CASES.find(function(c){return c.id===node.getAttribute('data-case');}); nav('public','result'); },
  goDetailStaff:function(node){
    var c = CASES.find(function(x){return x.id===node.getAttribute('data-case');});
    state.scannedCase = c; state.detailTab='owner';
    if(state.portal==='admin'){ state.adminTab='detail'; render(); } else { setRoute('detail'); }
  },

  doReceive:function(){
    var c = state.scannedCase; var st = stationOf(c);
    c.handoff = false; c.ownerOrg = st.org; c.handler = actor().name; c.updatedAt = new Date(NOW);
    c.pub = st.pub;
    c.log.push({at:new Date(NOW), by:actor().name, org:actor().org, action:'received', from:c.log[c.log.length-1].to, to:st.name});
    toast('รับเอกสารเรียบร้อยแล้ว');
    setRoute('scanresult');
  },
  outcome:function(node){
    var v = node.getAttribute('data-v'); state.outcomeChoice = v;
    var c = state.scannedCase; var st = stationOf(c);
    if(v==='forwarded'){
      var next = WORKSTATIONS[c.stationIdx+1];
      var body = '<div class="confirm-flow"><div>ยืนยันการส่งต่อเอกสาร</div>'+
        '<div class="step2"><span class="pill active">'+st.name+'</span><span class="arrow">→</span><span class="pill pending">'+(next?next.name:'สิ้นสุดกระบวนการ')+'</span></div>'+
        '<div>หน่วยงานปลายทาง: <b>'+(next?next.org:'-')+'</b></div>'+
        '<div>ผู้ดำเนินการ: <b>'+actor().name+'</b></div>'+
        '<div>วันที่และเวลา: <b class="tnum">'+fmtDateTime(NOW)+'</b> (ระบบบันทึกอัตโนมัติ)</div></div>';
      openModal('ยืนยันการส่งต่อเอกสาร', body, 'ยืนยัน', function(){
        var fromName = st.name;
        if(next){ c.stationIdx += 1; c.handoff = true; c.pub = next.pub; }
        else { c.pub='done'; c.handoff=false; c.ownerOrg='กลุ่มงานบริหารทรัพยากรบุคคล (จัดเก็บแล้ว)'; }
        c.updatedAt = new Date(NOW);
        c.log.push({at:new Date(NOW), by:actor().name, org:actor().org, action:'forwarded', from:fromName, to: next?next.name:fromName});
        toast('ส่งต่อเอกสารเรียบร้อยแล้ว');
        backAfterAction();
      });
    } else if(v==='revision_requested'){
      openRevisionModal(c);
    } else if(v==='more_info'){
      openModal('ขอข้อมูลเพิ่มเติม', '<div class="field"><label>ระบุข้อมูลที่ต้องการเพิ่มเติม</label><textarea class="input" id="miNote" rows="3"></textarea></div>', 'ส่งคำขอ', function(){
        var note = document.getElementById('miNote').value.trim();
        if(!note){ toast('กรุณาระบุข้อมูลที่ต้องการเพิ่มเติม'); return false; }
        c.log.push({at:new Date(NOW), by:actor().name, org:actor().org, action:'more_info', from:st.name, to:st.name, note:note});
        c.updatedAt = new Date(NOW);
        toast('ส่งคำขอข้อมูลเพิ่มเติมแล้ว');
        backAfterAction();
      });
    } else if(v==='rejected'){
      openModal('ยืนยันผลไม่ผ่านการพิจารณา', '<p style="font-size:.9rem;">การดำเนินการนี้จะแจ้งผลไม่ผ่านให้เจ้าของผลงานทราบ และปิดกระบวนการ</p>', 'ยืนยัน', function(){
        c.pub='result_announced'; c.updatedAt=new Date(NOW);
        c.log.push({at:new Date(NOW), by:actor().name, org:actor().org, action:'rejected', from:st.name, to:st.name, note:'ไม่ผ่านการพิจารณา'});
        toast('บันทึกผลไม่ผ่านการพิจารณาแล้ว'); backAfterAction();
      });
    } else if(v==='terminated'){
      openModal('ยืนยันยุติกระบวนการ', '<div class="field"><label>เหตุผลที่ยุติกระบวนการ</label><textarea class="input" id="tNote" rows="3"></textarea></div>', 'ยืนยันยุติ', function(){
        var note = document.getElementById('tNote').value.trim();
        if(!note){ toast('กรุณาระบุเหตุผลที่ยุติกระบวนการ'); return false; }
        c.pub='terminated'; c.updatedAt=new Date(NOW);
        c.log.push({at:new Date(NOW), by:actor().name, org:actor().org, action:'terminated', from:st.name, to:st.name, note:note});
        toast('ยุติกระบวนการเรียบร้อยแล้ว'); backAfterAction();
      });
    }
  },

  doStaffSearch:function(){ setRoute('search',{q:document.getElementById('searchQ').value}); },
  setTab:function(node){ state.detailTab = node.getAttribute('data-tab'); render(); },

  mockCapture:function(){ state.intakeForm = {ocrDone:false}; render(); },
  mockOcr:function(){
    state.intakeForm = {ocrDone:true, name:'กมลชนก ศรีสุข', cid:'1-4599-00XXX-XX-3', pos:'นักวิชาการสาธารณสุขปฏิบัติการ', level:'ปฏิบัติการ → ชำนาญการ',
      title:'การพัฒนาสื่อให้ความรู้โรคไม่ติดต่อเรื้อรังสำหรับ อสม. (ตรวจสอบ)', type:'สื่อสุขศึกษา', org:'รพ.สต. เมืองใหม่ จ.อำนาจเจริญ'};
    render();
  },
  doRegister:function(){
    SEQ += 1;
    var trackingNo = 'อวช11-2569-'+String(SEQ).padStart(5,'0');
    var newCase = {
      id:'c'+SEQ, trackingNo:trackingNo, last4:String(1000+Math.floor(Math.random()*9000)),
      first:document.getElementById('ifName').value.split(' ')[0]||'ไม่ระบุ', last:document.getElementById('ifName').value.split(' ')[1]||'',
      position:document.getElementById('ifPos').value, level:document.getElementById('ifLevel').value,
      workTitle:document.getElementById('ifTitle').value, workType:document.getElementById('ifType').value,
      orgFrom:document.getElementById('ifOrg').value, receivedDate:new Date(NOW),
      stationIdx:0, pub:'received', handoff:false, ownerOrg:'กลุ่มงานบริหารทรัพยากรบุคคล', handler:state.staff.name,
      updatedAt:new Date(NOW), revision:null,
      log:[{at:new Date(NOW), by:state.staff.name, org:state.staff.org, action:'registered', from:null, to:'รับเรื่องจากหน่วยงานต้นทาง'}],
      attachments:[], internalNotes:[],
    };
    CASES.unshift(newCase);
    state.scannedCase = newCase; state.intakeForm=null;
    toast('ลงทะเบียนเอกสารสำเร็จ เลขติดตาม '+trackingNo);
    state.detailTab='status'; setRoute('detail');
  },

  adminGo:function(node){ state.adminTab = node.getAttribute('data-tab'); render(); },
  addNote:function(){
    var c = state.scannedCase; var val = document.getElementById('newNote').value.trim();
    if(!val) return;
    c.internalNotes.push({by:actor().name, at:new Date(NOW), text:val});
    render();
  },
  adminCloseWork:function(){
    var c = state.scannedCase; var st = stationOf(c);
    openModal('ยืนยันปิดงาน (ข้ามขั้นตอนที่เหลือ)',
      '<div class="field"><label>เหตุผลที่ปิดงานก่อนครบขั้นตอน <span style="color:var(--st-danger-ink)">*จำเป็นต้องระบุ</span></label>'+
      '<textarea class="input" id="closeReason" rows="3" placeholder="เช่น ดำเนินการเสร็จสิ้นตามมติที่ประชุมกรณีพิเศษ"></textarea></div>',
      'ยืนยันปิดงาน', function(){
        var reason = document.getElementById('closeReason').value.trim();
        if(!reason){ toast('กรุณาระบุเหตุผลก่อนปิดงาน'); return false; }
        var prevStatus = STATUS_META[c.pub].label;
        c.pub='done'; c.handoff=false; c.ownerOrg='กลุ่มงานบริหารทรัพยากรบุคคล (จัดเก็บแล้ว)'; c.updatedAt=new Date(NOW);
        c.log.push({at:new Date(NOW), by:actor().name, org:actor().org, action:'closed', from:st.name, to:'ปิดงาน/จัดเก็บเอกสาร', note:'ปิดงานโดย Admin จากสถานะเดิม "'+prevStatus+'" — เหตุผล: '+reason});
        toast('ปิดงานเรียบร้อยแล้ว');
        backAfterAction();
      });
  },
  adminReassign:function(){
    var c = state.scannedCase;
    var uniqOrgs = []; WORKSTATIONS.forEach(function(w){ if(uniqOrgs.indexOf(w.org)<0) uniqOrgs.push(w.org); });
    var opts = uniqOrgs.map(function(o){ return '<option value="'+o+'">'+o+'</option>'; }).join('');
    openModal('เปลี่ยนผู้รับผิดชอบ',
      '<div class="field"><label>หน่วยงานผู้รับผิดชอบใหม่</label><select class="input" id="raOrg">'+opts+'</select></div>'+
      '<div class="field"><label>เหตุผล <span style="color:var(--st-danger-ink)">*จำเป็นต้องระบุ</span></label><textarea class="input" id="raReason" rows="2"></textarea></div>',
      'ยืนยันเปลี่ยนผู้รับผิดชอบ', function(){
        var reason = document.getElementById('raReason').value.trim();
        if(!reason){ toast('กรุณาระบุเหตุผล'); return false; }
        var newOrg = document.getElementById('raOrg').value; var oldOrg = c.ownerOrg;
        c.ownerOrg = newOrg; c.handoff=false; c.updatedAt=new Date(NOW);
        c.log.push({at:new Date(NOW), by:actor().name, org:actor().org, action:'reassigned', from:oldOrg, to:newOrg, note:'เปลี่ยนผู้รับผิดชอบโดย Admin — เหตุผล: '+reason});
        toast('เปลี่ยนผู้รับผิดชอบแล้ว');
        render();
      });
  },
  adminEditWork:function(){
    var c = state.scannedCase;
    openModal('แก้ไขข้อมูลผลงาน',
      '<div class="field"><label>ชื่อผลงาน</label><input class="input" id="edTitle" value="'+esc(c.workTitle)+'"></div>'+
      '<div class="field"><label>ตำแหน่งเจ้าของผลงาน</label><input class="input" id="edPos" value="'+esc(c.position)+'"></div>',
      'บันทึกการแก้ไข', function(){
        var newTitle = document.getElementById('edTitle').value.trim();
        var newPos = document.getElementById('edPos').value.trim();
        if(!newTitle||!newPos){ toast('กรุณากรอกข้อมูลให้ครบ'); return false; }
        var oldTitle=c.workTitle, oldPos=c.position;
        c.workTitle=newTitle; c.position=newPos;
        c.internalNotes.push({by:actor().name, at:new Date(NOW), text:'แก้ไขข้อมูล — ชื่อผลงาน: "'+oldTitle+'" → "'+newTitle+'", ตำแหน่ง: "'+oldPos+'" → "'+newPos+'"'});
        toast('บันทึกการแก้ไขแล้ว');
        render();
      });
  },
  adminDownloadHistory:function(){
    var c = state.scannedCase;
    var lines = ['ประวัติการดำเนินการ: '+c.trackingNo, ''];
    c.log.forEach(function(l){ lines.push(fmtDateTime(l.at)+' | '+(ACTION_LABELS[l.action]||l.action)+' | '+l.by+' ('+l.org+')'+(l.note?' | '+l.note:'')); });
    var blob = new Blob(['﻿'+lines.join('\r\n')], {type:'text/plain;charset=utf-8;'});
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a'); a.href=url; a.download='ประวัติ_'+c.trackingNo+'.txt'; document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('ดาวน์โหลดประวัติแล้ว');
  },
  wfMove:function(node){
    var i = +node.getAttribute('data-i'), d = +node.getAttribute('data-d');
    var j = i+d; if(j<0||j>=WORKSTATIONS.length) return;
    var tmp = WORKSTATIONS[i]; WORKSTATIONS[i]=WORKSTATIONS[j]; WORKSTATIONS[j]=tmp;
    WORKSTATIONS.forEach(function(w,idx){ w.order=idx+1; });
    render();
  },
  wfToggle:function(node){ WORKSTATIONS[+node.getAttribute('data-i')].active = node.checked; },
  userToggle:function(node){ USERS_DIR[+node.getAttribute('data-i')].active = node.checked; },
  exportCsv:function(){
    var head = ['เลขติดตาม','ชื่อ-นามสกุล','หน่วยงานต้นทาง','วันที่รับ','สถานะ','ผู้รับผิดชอบ','อัปเดตล่าสุด'];
    var lines = [head.join(',')].concat(CASES.map(function(c){
      return [c.trackingNo, c.first+' '+c.last, c.orgFrom, fmtShort(c.receivedDate), STATUS_META[c.pub].label, c.ownerOrg, fmtShort(c.updatedAt)]
        .map(function(v){ return '"'+String(v).replace(/"/g,'""')+'"'; }).join(',');
    }));
    var blob = new Blob(['﻿'+lines.join('\r\n')], {type:'text/csv;charset=utf-8;'});
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a'); a.href=url; a.download='รายงานทะเบียนผลงาน.csv'; document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('ดาวน์โหลดรายงานแล้ว');
  },
};

/* ---------- portal switch chrome ---------- */
function renderPortalSwitch(){
  var host = document.getElementById('portalSwitch');
  var opts = [['public','ประชาชน'],['staff','เจ้าหน้าที่'],['admin','ผู้ดูแล/ผู้บริหาร']];
  host.innerHTML = opts.map(function(o){ return '<button class="'+(state.portal===o[0]?'active':'')+'" data-portal="'+o[0]+'">'+o[1]+'</button>'; }).join('');
  host.querySelectorAll('button').forEach(function(b){
    b.addEventListener('click', function(){
      var p = b.getAttribute('data-portal');
      if(p==='staff') nav('staff', state.staff?'dashboard':'login');
      else if(p==='admin') nav('admin','dashboard');
      else nav('public','home');
      renderPortalSwitch();
    });
  });
}

/* ---------- boot ---------- */
document.body.insertAdjacentHTML('beforeend','<div id="modalHost"></div>');
renderPortalSwitch();
render();
