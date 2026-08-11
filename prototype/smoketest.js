const { JSDOM } = require('jsdom');
const fs = require('fs');

const appJs = fs.readFileSync('prototype.app.js', 'utf8');

const html = `<!doctype html><html><body>
<div class="proto-bar"><div class="portal-switch" id="portalSwitch"></div><span class="proto-hint" id="protoHint"></span></div>
<div id="app"></div>
<div class="toastwrap" id="toastwrap"></div>
</body></html>`;

const errors = [];
const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://example.test/' });
const { window } = dom;
window.onerror = (msg) => { errors.push(String(msg)); };

// stub URL.createObjectURL / revokeObjectURL (not implemented in jsdom)
if (!window.URL.createObjectURL) window.URL.createObjectURL = () => 'blob:stub';
if (!window.URL.revokeObjectURL) window.URL.revokeObjectURL = () => {};

try {
  dom.window.eval(appJs);
} catch (e) {
  console.error('BOOT ERROR:', e.stack || e);
  process.exit(1);
}

function click(sel) {
  const el = window.document.querySelector(sel);
  if (!el) { throw new Error('NOT FOUND: ' + sel); }
  el.dispatchEvent(new window.Event('click', { bubbles: true }));
}
function clickAll(sel, idx) {
  const els = window.document.querySelectorAll(sel);
  if (!els[idx]) throw new Error('NOT FOUND[' + idx + ']: ' + sel);
  els[idx].dispatchEvent(new window.Event('click', { bubbles: true }));
}
function setVal(sel, v) {
  const el = window.document.querySelector(sel);
  if (!el) throw new Error('NOT FOUND (setVal): ' + sel);
  el.value = v;
}
function dump(tag) {
  console.log('--- ' + tag + ' --- route=', window.state.portal, window.state.route, window.state.adminTab);
}

function step(name, fn) {
  try {
    fn();
    console.log('OK   ', name);
  } catch (e) {
    console.log('FAIL ', name, '->', e.message);
    errors.push(name + ': ' + e.message);
  }
}

// ---- PUBLIC FLOW ----
step('public home renders', () => { if (!window.document.querySelector('[data-act="doSearch"]')) throw new Error('no search button'); });
step('public search success -> result', () => {
  setVal('#fTrack', 'อวช11-2569-00218'); setVal('#fLast4', '4821'); click('[data-act="doSearch"]');
  if (window.state.route !== 'result') throw new Error('route=' + window.state.route);
});
step('public timeline', () => { click('[data-act="goTimeline"]'); if (window.state.route !== 'timeline') throw new Error('bad route'); });
step('public back to result then revision case', () => {
  click('[data-act="goResult"]'); click('[data-act="goHome"]');
  setVal('#fTrack', 'อวช11-2569-00209'); setVal('#fLast4', '7765'); click('[data-act="doSearch"]');
  if (!window.document.querySelector('[data-act="goRevision"]')) throw new Error('no revision alert box');
  click('[data-act="goRevision"]');
  if (window.state.route !== 'revision') throw new Error('route=' + window.state.route);
});
step('public not found', () => {
  click('[data-act="goResult"]'); click('[data-act="goHome"]');
  setVal('#fTrack', 'อวช11-2569-99999'); setVal('#fLast4', '0000'); click('[data-act="doSearch"]');
  if (window.state.route !== 'notfound') throw new Error('route=' + window.state.route);
});
step('public scan simulate', () => {
  click('[data-act="goHome"]'); click('[data-act="goScanPublic"]');
  clickAll('[data-act="publicScanPick"]', 0);
  if (window.state.route !== 'result') throw new Error('route=' + window.state.route);
});

// ---- STAFF FLOW: committee login -> close step -> forward ----
step('switch to staff portal, login as committee', () => {
  clickAll('.portal-switch button', 1); // staff
  clickAll('.login-opt', 2); // committee (index 2)
  if (!window.state.staff || window.state.staff.org.indexOf('คณะกรรมการ') < 0) throw new Error('login failed');
});
step('dashboard renders action buttons', () => {
  if (!window.document.querySelector('[data-act="scanMode"][data-mode="action"]')) throw new Error('no action scan button');
});
step('scan action -> pick case1 -> close step screen', () => {
  clickAll('[data-act="scanMode"]', 1); // mode=action
  const chip = window.document.querySelector('[data-act="scanPick"]');
  if (!chip) throw new Error('no scan chip for action mode (case1 expected)');
  chip.dispatchEvent(new window.Event('click', { bubbles: true }));
  if (window.state.route !== 'scanresult') throw new Error('route=' + window.state.route);
  click('[data-act="staffGo"][data-route="closestep"]');
  if (window.state.route !== 'closestep') throw new Error('route=' + window.state.route);
});
step('outcome forwarded -> modal -> confirm', () => {
  click('[data-act="outcome"][data-v="forwarded"]');
  const ok = window.document.getElementById('modalOk');
  if (!ok) throw new Error('modal did not open');
  ok.dispatchEvent(new window.Event('click', { bubbles: true }));
  if (window.state.route !== 'dashboard') throw new Error('route=' + window.state.route);
});

// ---- STAFF FLOW: HR login -> receive incoming (need a fresh handoff; use case2 via propose org login) ----
step('logout, login as กลุ่มงานพัฒนาบุคลากร, receive c214', () => {
  click('[data-act="staffLogout"]');
  clickAll('.login-opt', 1); // propose org
  clickAll('[data-act="scanMode"]', 0); // mode=receive
  const chip = window.document.querySelector('[data-act="scanPick"]');
  if (!chip) throw new Error('no incoming chip (c214 expected)');
  chip.dispatchEvent(new window.Event('click', { bubbles: true }));
  click('[data-act="staffGo"][data-route="receiveconfirm"]');
  click('[data-act="doReceive"]');
  if (window.state.route !== 'scanresult') throw new Error('route=' + window.state.route);
});
step('close step -> revision_requested modal flow', () => {
  click('[data-act="staffGo"][data-route="closestep"]');
  click('[data-act="outcome"][data-v="revision_requested"]');
  // check first reason then confirm
  const cb = window.document.querySelector('.revReason');
  cb.checked = true; cb.dispatchEvent(new window.Event('change', { bubbles: true }));
  window.document.getElementById('revNote').value = 'ทดสอบ';
  const ok = window.document.getElementById('modalOk');
  ok.dispatchEvent(new window.Event('click', { bubbles: true }));
  if (window.state.route !== 'dashboard') throw new Error('route after revision=' + window.state.route);
});

// ---- STAFF register ----
step('register new document flow', () => {
  click('[data-act="staffGo"][data-route="register"]');
  click('[data-act="mockCapture"]');
  click('[data-act="mockOcr"]');
  click('[data-act="doRegister"]');
  if (window.state.route !== 'detail') throw new Error('route=' + window.state.route);
});
step('staff search', () => {
  click('[data-act="staffGo"][data-route="search"]');
  setVal('#searchQ', '218');
  click('[data-act="doStaffSearch"]');
  if (!window.document.querySelector('[data-act="goDetailStaff"]')) throw new Error('no results row');
});

// ---- ADMIN FLOW ----
step('switch to admin, dashboard renders', () => {
  clickAll('.portal-switch button', 2);
  if (window.state.portal !== 'admin') throw new Error('portal=' + window.state.portal);
});
step('admin list -> detail -> tabs -> edit/reassign/close/download', () => {
  click('[data-act="adminGo"][data-tab="list"]');
  const row = window.document.querySelector('[data-act="goDetailStaff"]');
  if (!row) throw new Error('no admin list row');
  row.dispatchEvent(new window.Event('click', { bubbles: true }));
  if (window.state.adminTab !== 'detail') throw new Error('adminTab=' + window.state.adminTab);
  click('[data-act="setTab"][data-tab="notes"]');
  window.document.getElementById('newNote').value = 'บันทึกทดสอบ';
  click('[data-act="addNote"]');

  click('[data-act="adminEditWork"]');
  window.document.getElementById('edTitle').value = 'ชื่อผลงานแก้ไขทดสอบ';
  window.document.getElementById('edPos').value = 'ตำแหน่งทดสอบ';
  window.document.getElementById('modalOk').dispatchEvent(new window.Event('click', { bubbles: true }));

  click('[data-act="adminReassign"]');
  window.document.getElementById('raReason').value = 'เหตุผลทดสอบ';
  window.document.getElementById('modalOk').dispatchEvent(new window.Event('click', { bubbles: true }));

  click('[data-act="adminDownloadHistory"]');

  const closeBtn = window.document.querySelector('[data-act="adminCloseWork"]');
  if (closeBtn) {
    closeBtn.dispatchEvent(new window.Event('click', { bubbles: true }));
    window.document.getElementById('closeReason').value = 'ปิดงานทดสอบ';
    window.document.getElementById('modalOk').dispatchEvent(new window.Event('click', { bubbles: true }));
  }
});
step('admin workflow reorder + toggle', () => {
  click('[data-act="adminGo"][data-tab="workflow"]');
  click('[data-act="wfMove"][data-d="1"]');
  const chk = window.document.querySelector('[data-act="wfToggle"]');
  chk.checked = false; chk.dispatchEvent(new window.Event('change', { bubbles: true }));
});
step('admin users toggle', () => {
  click('[data-act="adminGo"][data-tab="users"]');
  const chk = window.document.querySelector('[data-act="userToggle"]');
  chk.checked = false; chk.dispatchEvent(new window.Event('change', { bubbles: true }));
});
step('admin reports csv export', () => {
  click('[data-act="adminGo"][data-tab="reports"]');
  click('[data-act="exportCsv"]');
});
step('admin auditlog renders', () => {
  click('[data-act="adminGo"][data-tab="auditlog"]');
  if (!window.document.querySelector('table.reg')) throw new Error('no audit table');
});

console.log('\\n=== window.onerror captured ===', errors.length ? errors : 'none');
if (errors.length) process.exit(1);
console.log('\\nALL STEPS DONE');
