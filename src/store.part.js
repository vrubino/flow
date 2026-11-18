/* ---------- store: local first, synced through Google Drive ---------- */
const LS = 'flow.state.v1';
let DB = { items: {}, zones: {}, settings: {}, settingsAt: 0, deleted: {}, zdeleted: {} };
let syncing = false, syncAgain = false, syncTimer = null, lastSync = 0;
const clean = o => { const r = {}; for (const k in o) if (o[k] !== undefined) r[k] = o[k]; return r; };
function loadLocal() { try { const s = JSON.parse(localStorage.getItem(LS) || 'null'); if (s) DB = { ...DB, ...s }; } catch (e) {} }
function saveLocal() { try { localStorage.setItem(LS, JSON.stringify(DB)); } catch (e) {} }
function fromDB() { S.todos = Object.values(DB.items); S.zones = { ...DB.zones }; S.settings = { ...DB.settings }; }
function persist() { saveLocal(); scheduleSync(1500); }
function put(t, { quiet } = {}) {
  const it = clean({ ...t, _m: Date.now() });
  DB.items[it.id] = it; delete DB.deleted[it.id];
  fromDB(); persist();
  if (!quiet) render();
}
function patch(id, p, opts) { const t = DB.items[id]; if (t) put({ ...t, ...p, updatedAt: Date.now() }, opts); }
function remove(id, { quiet } = {}) {
  delete DB.items[id]; DB.deleted[id] = Date.now();
  fromDB(); persist();
  if (!quiet) render();
}
function saveSettings(p) {
  DB.settings = clean({ ...DB.settings, ...p }); DB.settingsAt = Date.now();
  fromDB(); persist(); renderStatus();
}
/* merge two states item by item: the newest edit wins, deletions are remembered */
function mergeState(a, b) {
  const out = { items: {}, zones: {}, deleted: { ...(a.deleted || {}) }, zdeleted: { ...(a.zdeleted || {}) } };
  for (const [k, v] of Object.entries(b.deleted || {})) out.deleted[k] = Math.max(out.deleted[k] || 0, v);
  for (const [k, v] of Object.entries(b.zdeleted || {})) out.zdeleted[k] = Math.max(out.zdeleted[k] || 0, v);
  const pick = (x, y) => !x ? y : !y ? x : ((y._m || 0) > (x._m || 0) ? y : x);
  for (const id of new Set([...Object.keys(a.items || {}), ...Object.keys(b.items || {})])) {
    const it = pick((a.items || {})[id], (b.items || {})[id]);
    if (!((out.deleted[id] || 0) >= (it._m || 0))) { out.items[id] = it; delete out.deleted[id]; }
  }
  for (const k of new Set([...Object.keys(a.zones || {}), ...Object.keys(b.zones || {})])) {
    const z = pick((a.zones || {})[k], (b.zones || {})[k]);
    if (!((out.zdeleted[k] || 0) >= (z._m || 0))) { out.zones[k] = z; delete out.zdeleted[k]; }
  }
  const newer = (b.settingsAt || 0) > (a.settingsAt || 0) ? b : a;
  out.settings = { ...(newer.settings || {}) }; out.settingsAt = newer.settingsAt || 0;
  const cutoff = Date.now() - 90 * DAY;
  for (const m of [out.deleted, out.zdeleted]) for (const k in m) if (m[k] < cutoff) delete m[k];
  return out;
}
const stable = v => Array.isArray(v) ? '[' + v.map(stable).join(',') + ']' : v && typeof v === 'object' ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}' : JSON.stringify(v);
const core = s => ({ items: s.items || {}, zones: s.zones || {}, deleted: s.deleted || {}, zdeleted: s.zdeleted || {}, settings: s.settings || {}, settingsAt: s.settingsAt || 0 });
function scheduleSync(ms) { clearTimeout(syncTimer); syncTimer = setTimeout(syncNow, ms); }
async function syncNow() {
  if (!signedIn()) { if (wasConnected() && !(await tryQuietConnect())) { S.dbState = 'reauth'; renderStatus(); return; } if (!signedIn()) { S.dbState = 'local'; renderStatus(); return; } }
  if (syncing) { syncAgain = true; return; }
  syncing = true; if (S.dbState !== 'synced') { S.dbState = 'saving'; renderStatus(); }
  try {
    const remote = await driveDownload();
    const merged = remote ? mergeState(core(DB), core(remote)) : core(DB);
    const localChanged = stable(core(merged)) !== stable(core(DB));
    DB = { ...DB, ...merged };
    saveLocal();
    if (localChanged) { fromDB(); render(); if (S.detailId && sheetEl && !sheetEl.contains(document.activeElement)) renderDetail(); }
    if (!remote || stable(core(remote)) !== stable(core(DB))) await driveUpload({ v: 1, savedAt: Date.now(), ...core(DB) });
    lastSync = Date.now(); S.dbState = 'synced'; S.dbErr = null;
  } catch (e) {
    S.dbState = e && e.code === 'needs_reauth' ? 'reauth' : (navigator.onLine === false || (e && e.code === 'server_unavailable')) ? 'offline' : 'error';
    S.dbErr = (e && e.message) || String(e);
  }
  syncing = false; renderStatus();
  if (syncAgain) { syncAgain = false; scheduleSync(400); }
}
async function initStore() {
  loadLocal(); fromDB();
  S.loaded = S.settingsLoaded = true;
  S.dbState = wasConnected() ? 'connecting' : 'local';
  if (!wasConnected()) S.calState = 'signedout';
  render(); afterLoad();
  if (wasConnected() && await tryQuietConnect()) { await syncNow(); initCal(); pushPendingAppts(); }
  else if (wasConnected()) { S.dbState = 'reauth'; S.calState = 'signedout'; render(); }
}
let booted = false;
function afterLoad() {
  if (booted || !S.loaded || !S.settingsLoaded) return; booted = true;
  if (location.hash === '#review') startReview();
}
async function doConnect() {
  try {
    toast('Connecting to Google…');
    const em = await connectGoogle();
    S.account = em; toast(em ? `Connected as ${em}` : 'Connected to Google');
    await syncNow(); initCal(true); pushPendingAppts();
    if (isNative && S.settings.reviewLocal) scheduleReview(S.settings.reviewTime || '08:30');
  } catch (e) {
    toast(e && e.code === 'not_configured' ? 'Add your Web client ID in config.js first (see SETUP.md).' : e && e.code === 'cancelled' ? 'Sign-in cancelled' : 'Google sign-in failed: ' + ((e && e.message) || e));
  }
  render();
}
/* appointments captured while offline / signed out go to Google Calendar once connected */
function pushPendingAppts() {
  if (!mcp) return;
  const td = todayYmd();
  S.todos.filter(t => kindOf(t) === 'appt' && !t.onCal && !t.calPending && (t.due || td) >= td).slice(0, 20).forEach((t, i) => setTimeout(() => syncAppt(t.id), i * 400));
}
function doDisconnect() {
  forgetGoogle(); mcp = null; if (unwatch) unwatch(); unwatch = null; calKey = null;
  S.events = []; S.calState = 'signedout'; S.dbState = 'local'; S.account = '';
  render(); toast('Disconnected — your data stays on this device');
}

