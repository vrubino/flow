import { isNative, App, APP_URL, calendar, connectGoogle, tryQuietConnect, signedIn, wasConnected, forgetGoogle, accountEmail,
  driveDownload, driveUpload, scheduleReview, scheduleTaskReminder, onNotificationTap } from './platform.js';

/* ---------- helpers ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const fromYmd = s => { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate()+n); return x; };
const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const startOfWeek = d => { const x = startOfDay(d); return addDays(x, -((x.getDay()+6)%7)); };
const localIso = d => `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
const hm = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const DAYS_L = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MON_L = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const todayYmd = () => ymd(new Date());
const tomorrowYmd = () => ymd(addDays(new Date(), 1));
const uid = (p = 't') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const isTouch = matchMedia('(hover: none)').matches;
const isMobile = () => matchMedia('(max-width: 900px)').matches;
const DAY = 864e5;

function dayLabel(s) {
  if (!s) return '';
  const d = fromYmd(s), t = startOfDay(new Date());
  const diff = Math.round((d - t) / DAY);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 1 && diff < 7) return DAYS_L[d.getDay()];
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`;
}
const ago = ts => { const d = Math.floor((Date.now() - ts) / DAY); return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d + 'd ago'; };
const I = {
  clock: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  sun: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  trash: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>',
  open: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>',
  x: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>'
};

/* ---------- quick-add parser ---------- */
const WD = {sun:0,sunday:0,domenica:0,mon:1,monday:1,lunedi:1,tue:2,tues:2,tuesday:2,martedi:2,wed:3,wednesday:3,mercoledi:3,
  thu:4,thur:4,thurs:4,thursday:4,giovedi:4,fri:5,friday:5,venerdi:5,sat:6,saturday:6,sabato:6};
function parseQuick(raw, now = new Date()) {
  let idea = false;
  raw = raw.replace(/^\s*(idea|idee|i)\s*:\s*/i, () => { idea = true; return ''; });
  let s = ' ' + raw.replace(/\s+/g, ' ').trim() + ' ';
  const today = startOfDay(now);
  let due = null, sh = null, sm = 0, eh = null, em = 0, dur = null, prio = false, allDay = false;
  const tags = [];
  const take = (re, fn) => { s = s.replace(re, (...m) => (fn(...m) === false ? m[0] : ' ')); };
  const to24 = (h, ap) => { h = +h; if (ap) { ap = ap.toLowerCase(); if (ap === 'pm' && h < 12) h += 12; if (ap === 'am' && h === 12) h = 0; } return h; };

  take(/\s#([\p{L}\p{N}_-]+)(?=\s)/gu, (_, t) => { tags.push(t); });
  take(/\s!{1,3}(?=\s)/, () => { prio = true; });
  take(/\s(all[- ]day|tutto il giorno)(?=\s)/i, () => { allDay = true; });
  const pre = '(?:on |il |lo |next |prossimo |prossima |entro |by )?';
  take(new RegExp('\\s' + pre + '(dopodomani)(?=\\s)', 'i'), () => { due = addDays(today, 2); });
  take(new RegExp('\\s' + pre + '(today|tod|oggi|tonight|stasera)(?=\\s)', 'i'), () => { due = today; });
  take(new RegExp('\\s' + pre + '(tomorrow|tmr|tmrw|domani)(?=\\s)', 'i'), () => { due = addDays(today, 1); });
  take(/\s(next week|prossima settimana|settimana prossima)(?=\s)/i, () => { due = addDays(startOfWeek(today), 7); });
  take(/\s(?:in|tra|fra) (\d+) ?(d|days?|giorni|g|w|weeks?|settimane?|settimana)(?=\s)/i, (_, n, u) => { due = addDays(today, /^(w|week|sett)/i.test(u) ? n * 7 : +n); });
  take(/\s(\d{4})-(\d{1,2})-(\d{1,2})(?=\s)/, (_, y, m, d) => { due = new Date(+y, m - 1, +d); });
  take(/\s(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?=\s)/, (_, d, m, y) => {
    if (+m < 1 || +m > 12 || +d < 1 || +d > 31) return false;
    const yy = y ? (+y < 100 ? 2000 + +y : +y) : today.getFullYear();
    let dt = new Date(yy, m - 1, +d);
    if (!y && today - dt > 60 * DAY) dt = new Date(yy + 1, m - 1, +d);
    due = dt;
  });
  take(new RegExp('\\s' + pre + '(sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?|luned[iì]|marted[iì]|mercoled[iì]|gioved[iì]|venerd[iì]|sabato|domenica)(?=\\s)', 'i'), (_, w) => {
    const wd = WD[w.toLowerCase().replace('ì', 'i')]; if (wd === undefined) return false;
    let diff = (wd - today.getDay() + 7) % 7; if (diff === 0) diff = 7;
    due = addDays(today, diff);
  });
  take(/\s(at |alle |ore |dalle |from |@)?(\d{1,2})(?:([:.])(\d{2}))?\s?(am|pm)?\s?(?:-|–|to |alle |until )\s?(\d{1,2})(?:[:.](\d{2}))?\s?(am|pm)?(?=\s)/i,
    (_, p, h1, sep, m1, a1, h2, m2, a2) => {
      if (!(p || sep === ':' || m2 || a1 || a2)) return false;
      if (sep === '.' && !p) return false;
      const H1 = to24(h1, a1 || a2), H2 = to24(h2, a2);
      if (H1 > 23 || H2 > 24 || +(m1 || 0) > 59 || +(m2 || 0) > 59) return false;
      sh = H1; sm = +(m1 || 0); eh = H2; em = +(m2 || 0);
    });
  if (sh === null) take(/\s(?:(?:at|alle|ore)\s|@)?(\d{1,2}):(\d{2})\s?(am|pm)?(?=\s)/i, (_, h, m, a) => {
    const H = to24(h, a); if (H > 23 || +m > 59) return false; sh = H; sm = +m; });
  if (sh === null) take(/\s(?:(?:at|alle|ore)\s|@)(\d{1,2})(?:\.(\d{2}))?\s?(am|pm)?(?=\s)/i, (_, h, m, a) => {
    const H = to24(h, a); if (H > 23 || +(m || 0) > 59) return false; sh = H; sm = +(m || 0); });
  if (sh === null) take(/\s(\d{1,2})\s?(am|pm)(?=\s)/i, (_, h, a) => { const H = to24(h, a); if (H > 23) return false; sh = H; sm = 0; });
  take(/\s(?:for |per )?(\d+(?:[.,]\d+)?)\s?(?:h|hr|hrs|hours?)(?:\s?(\d{1,2})\s?(?:m|min)?)?(?=\s)/i, (_, h, m) => { dur = Math.round(parseFloat(h.replace(',', '.')) * 60) + +(m || 0); });
  take(/\s(?:for |per )?(\d+)\s?(?:m|min|mins|minutes?|minuti)(?=\s)/i, (_, m) => { dur = (dur || 0) + +m; });

  const title = s.replace(/\s+/g, ' ').trim().replace(/^(on|at|alle|il|per|for)\s+/i, '').replace(/\s+(on|at|alle|il|per|for|by|entro)$/i, '').trim();
  if (sh !== null && !due) due = today;
  let start = null, end = null;
  if (sh !== null) {
    start = new Date(due); start.setHours(sh, sm, 0, 0);
    if (eh !== null) { end = new Date(due); end.setHours(eh, em, 0, 0); if (end <= start) end = new Date(end.getTime() + DAY); }
    else end = new Date(start.getTime() + (dur || 60) * 6e4);
  }
  const kind = idea ? 'idea' : (sh !== null || allDay) ? 'appt' : (due || prio) ? 'todo' : 'inbox';
  return { title, due, start, end, allDay: allDay && sh === null, prio, tags, dur, kind, wantsEvent: sh !== null || allDay };
}

/* ---------- state ---------- */
const S = {
  todos: [], loaded: false, dbState: 'connecting', dbErr: null,
  settings: {}, settingsLoaded: false,
  events: [], calState: 'loading', calErr: null, calAt: null, account: (() => { try { return localStorage.getItem('flow.account') || ''; } catch (e) { return ''; } })(),
  view: 'today', selId: null, editing: null, weekStart: startOfWeek(new Date()),
  forceKind: null, showDone: false, zones: {}, zoneId: null, folder: '__all', capId: null, detailId: null
};
try { const v = localStorage.getItem('flow.view'); S.view = ['today','inbox','later','zones','ideas','week'].includes(v) ? v : ({ upcoming: 'later', anytime: 'later', done: 'later' }[v] || 'today'); } catch (e) {}
const kindOf = t => t.kind || 'todo';
const isTask = t => kindOf(t) === 'todo';
const idleDays = t => Math.floor((Date.now() - (t.progressAt || t.createdAt || Date.now())) / DAY);
const stepsOf = t => Array.isArray(t.steps) ? t.steps : [];

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

/* ---------- Google Calendar ---------- */
const CAL = 'Google Calendar';
let mcp = null, unwatch = null, calKey = null, calInput = null;
function parseWhen(v) {
  if (!v) return null;
  if (typeof v === 'object') {
    if (v.dateTime) { const d = new Date(v.dateTime); return isNaN(d) ? null : { d, allDay: false }; }
    if (v.date) return { d: fromYmd(v.date), allDay: true };
    return null;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return { d: fromYmd(v), allDay: true };
  const d = new Date(v); return isNaN(d) ? null : { d, allDay: false };
}
function normEvent(e) {
  if (!e || typeof e !== 'object') return null;
  const s = parseWhen(e.start ?? e.startTime); if (!s) return null;
  const en = parseWhen(e.end ?? e.endTime) || { d: new Date(s.d.getTime() + 36e5) };
  if (String(e.status || '').toLowerCase() === 'cancelled') return null;
  return {
    id: e.id || e.eventId || '', title: e.summary || e.title || '(No title)', start: s.d, end: en.d,
    allDay: e.allDay ?? s.allDay, location: e.location || '', link: e.htmlLink || e.url || e.link || '',
    declined: Array.isArray(e.attendees) && e.attendees.some(a => a && a.self && a.responseStatus === 'declined')
  };
}
function extractEvents(p) {
  if (typeof p === 'string') { try { p = JSON.parse(p); } catch (e) { return []; } }
  const arr = Array.isArray(p) ? p : (p && (p.events || p.items || (p.result && p.result.events) || (p.data && p.data.events))) || [];
  return arr.map(normEvent).filter(Boolean);
}
function calWindow() {
  const t = startOfDay(new Date());
  const a = S.weekStart < t ? S.weekStart : t;
  const wEnd = addDays(S.weekStart, 7), tEnd = addDays(t, 2);
  return [a, wEnd > tEnd ? wEnd : tEnd];
}
const DENIALS = ['needs_reauth', 'server_not_connected', 'blocked_by_policy', 'approval_required', 'not_in_manifest', 'selection_required', 'not_granted', 'capability_disabled', 'capability_removed', 'server_not_found', 'consent_required'];
function onCalEvent(ev) {
  if (ev.type === 'data') {
    S.events = extractEvents(ev.result.payload !== undefined ? ev.result.payload : ev.result);
    S.calState = 'ok'; S.calErr = null; S.calAt = (ev.result.cache && ev.result.cache.storedAt) || Date.now();
  } else {
    const e = ev.error || {};
    if (DENIALS.includes(e.code)) S.events = [];
    S.calState = 'error'; S.calErr = e;
  }
  render();
}
function watchCal(force) {
  if (!mcp) return;
  const [a, b] = calWindow(); const key = ymd(a) + '_' + ymd(b);
  if (key === calKey && !force) return;
  calKey = key; if (unwatch) unwatch();
  calInput = { startTime: localIso(a), endTime: localIso(b), orderBy: 'startTime', pageSize: 250 };
  try { unwatch = mcp.watchTool(CAL, 'list_events', calInput, onCalEvent, { refetchInterval: 120000, cache: { staleTime: 60000, gcTime: DAY } }); }
  catch (e) { S.calState = 'error'; S.calErr = { code: 'bad_request', message: String(e) }; render(); }
}
async function initCal() {
  if (!signedIn()) { S.calState = 'signedout'; mcp = null; render(); return; }
  mcp = calendar; S.calState = S.events.length ? S.calState : 'loading'; watchCal(true);
}
async function allowCal() { if (!signedIn()) return doConnect(); calendar.refresh(); }
function calProblem() {
  if (S.calState === 'signedout' || S.calState === 'off') return { info: true, html: '<b>Connect Google</b> to sync with your other devices and see your calendar. Until then everything is saved on this device.', button: 'Connect Google' };
  if (S.calState !== 'error' || !S.calErr) return null;
  const e = S.calErr, m = esc(e.message || '');
  switch (e.code) {
    case 'needs_reauth': return { html: '<b>Google sign-in expired.</b>', button: 'Reconnect Google' };
    case 'server_unavailable': return { info: true, html: 'Google Calendar isn’t answering right now — showing the last events, retrying shortly.' };
    case 'tool_error': {
      const perm = e.status === 403 || /permission|scope|insufficient/i.test(e.message || '');
      return perm ? { html: '<b>Calendar access was refused.</b> Reconnect and allow calendar access when Google asks.', button: 'Reconnect Google' } : { html: '<b>Google Calendar returned an error.</b> ' + m };
    }
    default: return { html: '<b>Calendar unavailable.</b> ' + m };
  }
}
function calErrShort(e, write) {
  const c = e && e.code;
  if (c === 'needs_reauth') return 'Google sign-in expired — tap the status dots to reconnect.';
  if (c === 'approval_required' || c === 'consent_required') return 'Calendar access wasn’t approved.';
  if (write && (c === 'server_unavailable' || c === 'upstream_error')) return 'Calendar didn’t confirm — check it before trying again.';
  if (c === 'tool_error' && (e.status === 403 || /permission|scope/i.test(e.message || ''))) return 'Calendar access refused — reconnect Google and allow calendar access.';
  return 'Calendar error: ' + ((e && (e.message || c)) || 'unknown');
}
async function createEvent({ title, start, end, allDay, popupAt, recurrence, description, quiet, noOptimistic }) {
  if (!mcp) { toast('Connect Google to use the calendar (tap the status dots).'); return null; }
  const input = allDay
    ? { summary: title, allDay: true, startTime: ymd(start) + 'T00:00:00', endTime: ymd(addDays(start, 1)) + 'T00:00:00' }
    : { summary: title, startTime: localIso(start), endTime: localIso(end) };
  if (popupAt !== undefined) input.overrideReminders = [{ method: 'popup', minutes: popupAt }];
  if (recurrence) { input.recurrenceData = recurrence; input.availability = 'AVAILABILITY_FREE'; }
  if (description) input.description = description;
  let tmp = null;
  if (!recurrence && !noOptimistic) {
    tmp = { id: '', title, start: allDay ? startOfDay(start) : start, end: allDay ? addDays(startOfDay(start), 1) : end, allDay: !!allDay, pending: true, location: '', link: '' };
    S.events = [...S.events, tmp]; render();
  }
  try {
    const r = await mcp.callTool(CAL, 'create_event', input);
    const p = r && r.payload; const ev = p && (p.event || p);
    if (!quiet) toast(`Added to Google Calendar · ${dayLabel(ymd(start))}${allDay ? '' : ' ' + hm(start)}`);
    mcp.invalidate(CAL, 'list_events').catch(() => {});
    return (ev && (ev.id || ev.eventId)) || true;
  } catch (e) {
    if (tmp) { S.events = S.events.filter(x => x !== tmp); render(); }
    toast(calErrShort(e, true)); return null;
  }
}
async function deleteEvent(ev) {
  try {
    await mcp.callTool(CAL, 'delete_event', { eventId: ev.id });
    S.events = S.events.filter(x => x !== ev); render();
    toast('Event deleted');
    mcp.invalidate(CAL, 'list_events').catch(() => {});
  } catch (e) { toast(calErrShort(e, true)); }
}
const eventsOn = d => {
  const a = startOfDay(d), b = addDays(a, 1);
  return S.events.filter(e => e.start < b && e.end > a).sort((x, y) => (y.allDay - x.allDay) || (x.start - y.start));
};

/* ---------- undo & toast ---------- */
let undoFn = null, toastT = null;
function toast(msg, undo) {
  $('#toastMsg').textContent = msg; undoFn = undo || null;
  $('#toastUndo').hidden = !undo;
  $('#toast').classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => { $('#toast').classList.remove('show'); undoFn = null; }, undo ? 6000 : 3500);
}
function doUndo() { if (undoFn) { const f = undoFn; undoFn = null; f(); $('#toast').classList.remove('show'); } }
$('#toastUndo').addEventListener('click', doUndo);

/* ---------- item actions ---------- */
function capture(raw) {
  const p = parseQuick(raw), kind = S.forceKind || p.kind;
  if (!p.title) { toast('Add some text.'); return null; }
  const z = p.tags.length ? resolveZone(p.tags[0]) : null;
  const t = { id: uid(), title: p.title, kind, done: false, tags: z ? [z] : [], prio: !!p.prio, createdAt: Date.now() };
  if (p.due) t.due = ymd(p.due);
  if (kind === 'appt') Object.assign(t, p.start ? { due: ymd(p.start), start: hm(p.start), end: hm(p.end), allDay: false }
    : p.allDay ? { due: t.due || todayYmd(), allDay: true } : toAppt(t));
  put(t);
  if (kind === 'appt') syncAppt(t.id);
  return { t, p };
}
function toggleDone(id) {
  const t = S.todos.find(x => x.id === id); if (!t) return;
  const was = { done: t.done, doneAt: t.doneAt ?? null };
  if (!t.done && S.selId === id) moveSel(1, true);
  patch(id, { done: !t.done, doneAt: t.done ? null : Date.now(), ...(t.done ? {} : { progressAt: Date.now() }) });
  if (!t.done) toast('Completed', () => patch(id, was));
}
function delItem(id) {
  const t = S.todos.find(x => x.id === id); if (!t) return;
  if (S.selId === id) moveSel(1, true);
  remove(id); toast('Deleted', () => put({ ...t }));
}
function setDue(id, due, { silent } = {}) {
  const t = S.todos.find(x => x.id === id); if (!t) return;
  const old = t.due ?? null;
  const p = isAppt(t) ? { due } : { due, kind: 'todo' };
  if (old && due && due > old) p.bumps = (t.bumps || 0) + 1;
  patch(id, p);
  if (!silent) toast(due ? `Moved to ${dayLabel(due)}` : 'Moved to Anytime', () => patch(id, { due: old, bumps: t.bumps || 0, kind: kindOf(t) }));
}
function toggleFocus(id) {
  const t = S.todos.find(x => x.id === id); if (!t) return;
  const td = todayYmd(), on = t.focus === td;
  if (!on && S.todos.filter(x => x.focus === td && !x.done).length >= 3) { toast('Focus is capped at 3 — unstar one first.'); return false; }
  patch(id, on ? { focus: null } : { focus: td, due: t.due && t.due <= td ? t.due : td, kind: 'todo' });
  return true;
}
function checkIn(id, r) {
  const t = S.todos.find(x => x.id === id); if (!t) return;
  const checks = [...(t.checks || []).slice(-11), { at: Date.now(), r }];
  const p = { checks }; if (r === 'progress') p.progressAt = Date.now();
  patch(id, p);
}

/* ---------- appointments ---------- */
const isAppt = t => kindOf(t) === 'appt';
function apptRange(t) {
  const s = fromYmd(t.due || todayYmd());
  if (t.allDay || !t.start) return { s, e: addDays(s, 1), allDay: true };
  const [h, m] = t.start.split(':'); s.setHours(+h, +m, 0, 0);
  let e;
  if (t.end) { e = fromYmd(t.due || todayYmd()); const [h2, m2] = t.end.split(':'); e.setHours(+h2, +m2, 0, 0); if (e <= s) e = new Date(s.getTime() + 36e5); }
  else e = new Date(s.getTime() + 36e5);
  return { s, e, allDay: false };
}
function nextSlot() { const d = new Date(); d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0); return d; }
const addMin = (hhmm, n) => { const [h, m] = hhmm.split(':'); const d = new Date(2000, 0, 1, +h, +m + n); return hm(d); };
const minsBetween = (a, b) => { const [h1, m1] = a.split(':'), [h2, m2] = b.split(':'); const d = (+h2 * 60 + +m2) - (+h1 * 60 + +m1); return d > 0 ? d : 60; };
function toAppt(t) {
  const start = t.start || t.time || hm(nextSlot());
  return { kind: 'appt', due: t.due || todayYmd(), start, end: t.end || addMin(start, 60), allDay: false };
}
function setKind(id, k) {
  const t = S.todos.find(x => x.id === id); if (!t || kindOf(t) === k) return;
  if (k === 'appt') { patch(id, toAppt(t)); syncAppt(id); return; }
  const p = { kind: k };
  if (isAppt(t)) { p.start = null; p.end = null; p.allDay = null; if (t.onCal) toast('It’s still on Google Calendar — delete it there if you don’t need it.'); }
  patch(id, p);
}
async function syncAppt(id) {
  const t = S.todos.find(x => x.id === id); if (!t || !isAppt(t) || !mcp) return;
  if (t.onCal) return updateApptCal(t);
  patch(id, { calPending: true }, { quiet: true });
  const r = apptRange(t);
  const res = await createEvent({ title: t.title, start: r.s, end: r.e, allDay: r.allDay, quiet: true, noOptimistic: true });
  if (res) { patch(id, { onCal: true, calPending: null, eventId: typeof res === 'string' ? res : null }); toast(`On Google Calendar · ${dayLabel(t.due)}${r.allDay ? '' : ' ' + t.start}`); }
  else patch(id, { calPending: null });
  if (S.capId === id) renderCard(); if (S.detailId === id) renderDetail();
}
async function updateApptCal(t) {
  if (!mcp || !t.onCal) return;
  if (!t.eventId) { toast('Updated in Flow — change it in Google Calendar too.'); return; }
  const r = apptRange(t);
  const input = r.allDay ? { eventId: t.eventId, summary: t.title, allDay: true, startTime: ymd(r.s) + 'T00:00:00', endTime: ymd(r.e) + 'T00:00:00' }
    : { eventId: t.eventId, summary: t.title, startTime: localIso(r.s), endTime: localIso(r.e) };
  try { await mcp.callTool(CAL, 'update_event', input); mcp.invalidate(CAL, 'list_events').catch(() => {}); toast('Updated in Google Calendar'); }
  catch (e) { toast(calErrShort(e, true)); }
}
function deleteAppt(id) {
  const t = S.todos.find(x => x.id === id); if (!t) return;
  remove(id);
  if (t.onCal && t.eventId && mcp) mcp.callTool(CAL, 'delete_event', { eventId: t.eventId }).then(() => { mcp.invalidate(CAL, 'list_events').catch(() => {}); toast('Deleted here and from Google Calendar'); }, e => toast(calErrShort(e, true)));
  else toast(t.onCal ? 'Deleted from Flow — remove it from Google Calendar too' : 'Deleted', t.onCal ? null : () => put({ ...t }));
}
function editApptField(id, f, v) {
  const t = S.todos.find(x => x.id === id); if (!t || !v) return;
  const p = { [f]: v, allDay: false };
  if (f === 'start' && t.start && t.end) p.end = addMin(v, minsBetween(t.start, t.end));
  if (f === 'start' && !t.end) p.end = addMin(v, 60);
  patch(id, p, { quiet: true });
  const t2 = S.todos.find(x => x.id === id); if (t2.onCal) updateApptCal(t2);
  render();
}
const sameAppt = (t, e) => (t.eventId && t.eventId === e.id) || (t.title === e.title && Math.abs(apptRange(t).s - e.start) < 6e4);
const matchAppt = e => S.todos.find(t => isAppt(t) && sameAppt(t, e));
function dayItems(d) {
  const k = ymd(startOfDay(d));
  const cal = S.calState === 'off' ? [] : eventsOn(d);
  const local = S.todos.filter(t => isAppt(t) && t.due === k && !cal.some(e => sameAppt(t, e)))
    .map(t => { const r = apptRange(t); return { local: true, id: t.id, title: t.title, start: r.s, end: r.e, allDay: r.allDay, location: '', link: '', zone: (t.tags || [])[0], pending: !!t.calPending }; });
  return [...cal, ...local].sort((x, y) => (y.allDay - x.allDay) || (x.start - y.start));
}
const evAttr = e => e.local ? `data-act="open" data-id="${esc(e.id)}"` : `data-act="event" data-eidx="${S.events.indexOf(e)}"`;
function calStatusHTML(t, a) {
  if (t.onCal) return '<span class="cc-hint">✓ On Google Calendar</span>';
  if (t.calPending) return '<span class="cc-hint">Adding to Google Calendar…</span>';
  if (mcp) return `<button class="chip go" data-${a}="tocal">Add to Google Calendar</button>`;
  return '<span class="cc-hint">Saved in Flow — connect Google to add it to your calendar</span>';
}

/* ---------- zones ---------- */
const zoneKey = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9_\-~:@+]/g, '_').slice(0, 120) || 'zone';
const slugify = v => String(v).trim().replace(/^#/, '').replace(/\s+/g, ' ').slice(0, 60);
const ZPAL = ['#3D5A50', '#B4532A', '#2F5D8A', '#7A4A7A', '#A8741A', '#1F7A7A', '#A8445E', '#4B4FA6', '#6B7A2F', '#4A5568'];
const znorm = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[\s_\-]+/g, '');
const zhash = s => { let x = 0; for (const ch of String(s)) x = (x * 31 + ch.codePointAt(0)) >>> 0; return x; };
function zoneColor(name) { const d = S.zones[zoneKey(name)]; return (d && d.color) || ZPAL[zhash(znorm(name)) % ZPAL.length]; }
function freshColor() { const used = new Set(Object.values(S.zones).map(z => z && z.color)); return ZPAL.find(c => !used.has(c)) || ZPAL[Object.keys(S.zones).length % ZPAL.length]; }
function findZone(tag) {
  const n = znorm(tag), all = folders(); if (!n) return null;
  return all.find(z => znorm(z) === n) || (n.length >= 3 ? (m => m.length === 1 ? m[0] : null)(all.filter(z => znorm(z).startsWith(n))) : null);
}
function resolveZone(tag) {
  const ex = findZone(tag); if (ex) return ex;
  const name = String(tag).replace(/[-_]+/g, ' ').trim(); if (!name) return null;
  const nice = name.charAt(0).toUpperCase() + name.slice(1);
  putZone(nice, {}); return nice;
}
const zstyle = name => `style="--zc:${zoneColor(name)}"`;
const zoneDoc = slug => S.zones[zoneKey(slug)] || null;
function putZone(slug, data) {
  const k = zoneKey(slug);
  const z = clean({ ...(DB.zones[k] || { createdAt: Date.now(), color: freshColor() }), ...data, name: slug, _m: Date.now() });
  DB.zones[k] = z; delete DB.zdeleted[k]; fromDB(); persist();
}
function delZoneDoc(slug) { const k = zoneKey(slug); delete DB.zones[k]; DB.zdeleted[k] = Date.now(); fromDB(); persist(); }
function zonesList() {
  const m = new Map();
  const get = s => { if (!m.has(s)) m.set(s, { slug: s, open: 0, done: 0, ideas: 0, next: null, last: 0 }); return m.get(s); };
  Object.values(S.zones).forEach(z => z && z.name && get(z.name));
  S.todos.forEach(t => (t.tags || []).forEach(g => {
    const z = get(g), k = kindOf(t); z.last = Math.max(z.last, t.updatedAt || t.createdAt || 0);
    if (k === 'idea') z.ideas++;
    else if (k === 'todo') { if (t.done) z.done++; else { z.open++; if (t.due && (!z.next || t.due < z.next.due)) z.next = t; } }
    else if (k === 'inbox') z.open++;
  }));
  return [...m.values()].sort((a, b) => b.open - a.open || b.last - a.last || a.slug.localeCompare(b.slug));
}
const folders = () => zonesList().map(z => z.slug);
const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } };
function zonesForEvent(title) {
  const tl = ' ' + String(title || '').toLowerCase() + ' ';
  return folders().filter(s => {
    const name = s.replace(/[-_]/g, ' ').toLowerCase().trim();
    if (name.length >= 3 && tl.includes(name)) return true;
    const d = zoneDoc(s); return !!(d && (d.match || []).some(m => m.length >= 2 && tl.includes(m.toLowerCase())));
  });
}
function evZoneHTML(e) {
  const own = e.local ? e.zone : ((matchAppt(e) || {}).tags || [])[0];
  const zs = [...new Set([...(own ? [own] : []), ...zonesForEvent(e.title)])]; if (!zs.length) return '';
  return `<span class="evz">${zs.slice(0, 2).map(s => {
    const d = zoneDoc(s) || {};
    return `<button class="zfill" data-act="zone" data-z="${esc(s)}" ${zstyle(s)}>${esc(s)}</button>` + (d.links || []).slice(0, 2).map(l => `<a href="${esc(l.url)}" target="_blank" rel="noopener" data-act="noop">${esc(l.label || host(l.url))} ↗</a>`).join('');
  }).join('')}</span>`;
}
function openZone(slug) { S.zoneId = slug; S.view = 'zone'; S.selId = null; S.editing = null; renderNav(); renderMain(); window.scrollTo(0, 0); }
function renameZone(oldS, newS) {
  newS = slugify(newS); if (!newS || newS === oldS) { renderMain(); return; }
  S.todos.filter(t => (t.tags || []).includes(oldS)).forEach(t => patch(t.id, { tags: (t.tags || []).map(g => g === oldS ? newS : g) }, { quiet: true }));
  const d = zoneDoc(oldS); if (d) { const { name, ...rest } = d; putZone(newS, rest); delZoneDoc(oldS); }
  S.zoneId = newS; render(); toast(`Renamed to ${newS}`);
}
function deleteZone(slug) {
  const items = S.todos.filter(t => (t.tags || []).includes(slug));
  items.forEach(t => patch(t.id, { tags: (t.tags || []).filter(g => g !== slug) }, { quiet: true }));
  delZoneDoc(slug); setView('zones'); render();
  toast(`Zone deleted — ${items.length} item${items.length === 1 ? '' : 's'} kept without a zone`);
}
function zonesHTML() {
  const zs = zonesList(), c = counts();
  return `<div class="lbl">Zones${zs.length ? ` · ${zs.length}` : ''}</div>
    <div class="zgrid">${zs.map(z => {
      const d = zoneDoc(z.slug) || {}, nres = (d.links || []).length + (d.snippets || []).length, tot = z.open + z.done;
      return `<button class="ztile" data-act="zone" data-z="${esc(z.slug)}" ${zstyle(z.slug)}><span class="zt">${esc(z.slug)}</span>
        <span class="zfoot">${z.next ? `<span class="zn">→ ${esc(z.next.title)}</span>` : ''}
        <span class="zm">${z.open} open${z.ideas ? ` · ${z.ideas} idea${z.ideas > 1 ? 's' : ''}` : ''}${nres ? ` · ${nres} link${nres > 1 ? 's' : ''}` : ''}</span>
        ${tot ? `<span class="zbar"><b style="width:${Math.round(z.done / tot * 100)}%"></b></span>` : ''}</span></button>`;
    }).join('')}
    <div class="ztile znew"><input class="zin" id="newZone" placeholder="+ New zone"></div></div>
    ${zs.length ? '' : '<p class="empty">A zone is an area of your work — a paper, the cluster, supervision. It keeps its tasks, ideas, links and commands together, so switching costs one tap.</p>'}
    <button class="more mobonly" style="margin-top:22px" data-act="view" data-view="ideas">All ideas (${c.ideas}) →</button>`;
}
function zoneHTML() {
  const slug = S.zoneId, d = zoneDoc(slug) || {};
  const items = S.todos.filter(t => (t.tags || []).includes(slug));
  const td = todayYmd();
  const appts = items.filter(t => isAppt(t) && t.due >= td).sort((a, b) => apptRange(a).s - apptRange(b).s);
  const open = items.filter(t => !['idea', 'appt'].includes(kindOf(t)) && !t.done).sort((a, b) => (a.due || '9999') < (b.due || '9999') ? -1 : (a.due || '9999') > (b.due || '9999') ? 1 : (b.prio - a.prio) || (a.createdAt - b.createdAt));
  const done = items.filter(t => isTask(t) && t.done), ideas = items.filter(t => kindOf(t) === 'idea');
  const links = d.links || [], snips = d.snippets || [], tot = open.length + done.length;
  const left = `<div class="sec"><div class="lbl">Links</div>
      ${links.length ? `<ul class="res">${links.map(l => `<li><a href="${esc(l.url)}" target="_blank" rel="noopener" data-act="noop">${esc(l.label || host(l.url))}</a><span class="host">${esc(host(l.url))}</span><button class="xbtn" data-act="dellink" data-lid="${esc(l.id)}" title="Remove">${I.x}</button></li>`).join('')}</ul>` : ''}
      <input class="sh-in" id="zLink" placeholder="Paste a link — “Zoom https://…” names it"></div>
    <div class="sec"><div class="lbl">Commands & snippets</div>
      ${snips.map(s => `<div class="snip"><div class="sl">${esc(s.label || 'Snippet')}<button class="copy" data-act="copysnip" data-sid="${esc(s.id)}">Copy</button><button class="xbtn" data-act="delsnip" data-sid="${esc(s.id)}" title="Remove">${I.x}</button></div><pre id="snip_${esc(s.id)}">${esc(s.text)}</pre></div>`).join('')}
      <details class="addsnip"${snips.length ? '' : ' open'}><summary>Add a snippet</summary>
        <input class="sh-in" id="zSnipL" placeholder="Label — e.g. Submit job array">
        <textarea class="sh-ta" id="zSnipT" placeholder="sbatch --array=1-50 run.sh" spellcheck="false"></textarea>
        <button class="btn" data-act="addsnip">Add snippet</button></details></div>
    <div class="sec"><div class="lbl">Notes</div><textarea class="sh-ta" id="zNotes" placeholder="What you need to remember when you switch into this zone">${esc(d.notes || '')}</textarea></div>
    <div class="sec"><div class="lbl">Show next to calendar events containing</div><input class="sh-in" id="zMatch" value="${esc((d.match || []).join(', '))}" placeholder="e.g. Manuela, supervision (the zone name already matches)"></div>`;
  const right = `<div class="sec"><div class="lbl">Tasks${tot ? `<span class="r">${done.length}/${tot} done</span>` : ''}</div>
      ${tot ? `<div class="bigbar zb"><b style="width:${Math.round(done.length / tot * 100)}%"></b></div>` : ''}
      ${open.length ? `<ul class="list">${open.map(todoRow).join('')}</ul>` : '<p class="empty" style="padding:8px 0">No open tasks here.</p>'}
      <input class="sh-in" id="zTask" placeholder="Add a to-do — e.g. “draft intro fri”" style="margin-top:8px"></div>
    ${appts.length ? `<div class="sec"><div class="lbl">Appointments</div><ul class="timeline">${appts.slice(0, 8).map(t => { const r = apptRange(t); return `<li class="ev" data-act="open" data-id="${esc(t.id)}"><span class="evtime">${r.allDay ? '—' : t.start}</span><span class="evtitle">${esc(t.title)}<small>${esc(dayLabel(t.due))}${r.allDay ? ' · all day' : ' · until ' + t.end}</small></span></li>`; }).join('')}</ul></div>` : ''}
    ${ideas.length ? `<div class="sec"><div class="lbl">Ideas</div>${ideas.map(t => `<div class="idea" data-act="open" data-id="${esc(t.id)}"><div class="it">${esc(t.title)}</div>${t.body ? `<div class="ib">${esc(t.body)}</div>` : ''}</div>`).join('')}</div>` : ''}`;
  const col = zoneColor(slug);
  return `<div class="zhead" style="--zc:${col}"><button class="back" data-act="view" data-view="zones">← Zones</button>
      <div class="zrow"><input class="ztitle" id="zName" value="${esc(slug)}" aria-label="Zone name"><button class="btn danger" data-act="zdelete">Delete</button></div>
      <div class="swatches">${ZPAL.map(c => `<button class="sw${c === col ? ' on' : ''}" style="background:${c}" data-act="zcolor" data-c="${c}" aria-label="Colour"></button>`).join('')}</div></div>
    <div class="split zsplit" style="--zc:${col}"><div>${left}</div><div>${right}</div></div>`;
}
function zoneKeydown(e) {
  const id = e.target.id; if (e.key !== 'Enter' || e.target.tagName === 'TEXTAREA') return;
  const v = e.target.value.trim();
  if (id === 'newZone') { e.preventDefault(); const s = slugify(v); if (!s) return; const ex = folders().find(z => znorm(z) === znorm(s)); if (ex) { openZone(ex); return; } putZone(s, {}); openZone(s); return; }
  if (id === 'zName') { e.preventDefault(); e.target.blur(); return; }
  if (id === 'zMatch') { e.preventDefault(); e.target.blur(); return; }
  if (id === 'zLink') {
    e.preventDefault(); if (!v) return;
    const m = v.match(/(https?:\/\/\S+|www\.\S+)/i);
    if (!m) { toast('Paste a link starting with https://'); return; }
    let url = m[1]; if (!/^https?:/i.test(url)) url = 'https://' + url;
    const label = v.replace(m[1], '').trim().replace(/[:\-–]\s*$/, '').trim();
    const d = zoneDoc(S.zoneId) || {};
    putZone(S.zoneId, { links: [...(d.links || []), { id: uid('l'), url, label: label || '' }] });
    renderMain(); const i = $('#zLink'); if (i) i.focus(); return;
  }
  if (id === 'zTask') {
    e.preventDefault(); if (!v) return;
    const p = parseQuick(v); if (!p.title) return;
    const t = { id: uid(), title: p.title, kind: p.start ? 'appt' : 'todo', done: false, tags: [S.zoneId], prio: !!p.prio, createdAt: Date.now() };
    if (p.due) t.due = ymd(p.due);
    if (p.start) Object.assign(t, { due: ymd(p.start), start: hm(p.start), end: hm(p.end), allDay: false });
    put(t, { quiet: true }); if (p.start) syncAppt(t.id); renderNav(); renderMain(); const i = $('#zTask'); if (i) i.focus(); return;
  }
}
function zoneChange(e) {
  const id = e.target.id, v = e.target.value;
  if (S.view !== 'zone') return;
  if (id === 'zNotes') putZone(S.zoneId, { notes: v });
  if (id === 'zMatch') putZone(S.zoneId, { match: v.split(',').map(x => x.trim()).filter(Boolean) });
  if (id === 'zName') renameZone(S.zoneId, v);
}

/* ---------- render ---------- */
const VIEWS = [['today', 'Today'], ['inbox', 'Inbox'], ['later', 'Later'], ['zones', 'Zones'], ['ideas', 'Ideas'], ['week', 'Week']];
const TABICON = {
  today: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  inbox: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5 5h14l2 8v6H3v-6z"/></svg>',
  later: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
  ideas: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z"/></svg>',
  zones: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/><rect x="13" y="13" width="8" height="8" rx="2"/></svg>',
  week: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>'
};
function mainBusy() { const a = document.activeElement; return !!(a && a.closest && a.closest('#main') && /INPUT|TEXTAREA/.test(a.tagName) && a.id !== 'editInput'); }
function render() { renderHeader(); renderStatus(); renderNav(); if (!mainBusy()) renderMain(); }
function renderTodos() { renderNav(); renderMain(); }
function renderAgenda() { if (S.view === 'today' && !S.editing) renderMain(); }
function renderIdeas() { if (S.view === 'ideas') renderMain(); }
function renderWeek() { if (S.view === 'week') renderMain(); }
function renderHeader() {
  const d = new Date();
  $('#hdrDay').textContent = DAYS_L[d.getDay()];
  $('#hdrDate').textContent = `${d.getDate()} ${MON_L[d.getMonth()]}`;
}
function statusText() {
  const db = { synced: 'Synced with Google Drive', saving: 'Syncing…', connecting: 'Connecting…', offline: 'Offline — changes sync when you’re back online',
    local: 'Saved on this device — connect Google to sync', reauth: 'Google sign-in needed to sync', error: 'Sync error: ' + (S.dbErr || '') }[S.dbState];
  const pr = calProblem();
  const cal = pr ? pr.html.replace(/<[^>]+>/g, '') : S.calState === 'ok' ? 'Google Calendar connected' + (S.calAt ? ' · updated ' + hm(new Date(S.calAt)) : '') : 'Loading calendar…';
  return db + ' · ' + cal;
}
function renderStatus() {
  $('#stDb').className = 'dot ' + ({ synced: 'ok', saving: 'busy', connecting: 'busy', offline: 'busy', local: '', reauth: 'err', error: 'err' }[S.dbState] || '');
  const transient = S.calErr && ['server_unavailable', 'rate_limited'].includes(S.calErr.code);
  $('#stCal').className = 'dot ' + (transient ? 'busy' : { ok: 'ok', loading: 'busy', error: 'err', off: '', signedout: '' }[S.calState] || '');
  $('#stDb').parentElement.title = statusText();
  $('#rvBtn').hidden = !reviewDue();
}
function renderNav() {
  const c = counts();
  const n = { today: c.today, inbox: c.inbox, later: c.upcoming + c.anytime, zones: 0, ideas: c.ideas, week: 0 };
  const cur = S.view === 'zone' ? 'zones' : S.view;
  const hot = { today: c.overdue > 0, inbox: c.inbox > 0 };
  $('#views').innerHTML = VIEWS.map(([k, l], i) => `<button class="vbtn${cur === k ? ' on' : ''}${hot[k] ? ' hot' : ''}" data-act="view" data-view="${k}" title="${l} (${i + 1})">${l}${n[k] ? `<span class="n">${n[k]}</span>` : ''}</button>`).join('');
  $('#tabbar').innerHTML = VIEWS.filter(([k]) => k !== 'ideas').map(([k, l]) => `<button class="${cur === k || (k === 'zones' && cur === 'ideas') ? 'on' : ''}" data-act="view" data-view="${k}">${TABICON[k]}${l}${k === 'inbox' && c.inbox ? `<span class="badge">${c.inbox}</span>` : ''}</button>`).join('');
}
function metaFor(t) {
  const td = todayYmd(), od = !t.done && t.due && t.due < td, meta = [];
  if (kindOf(t) === 'inbox') { meta.push(`<span>${ago(t.createdAt)}</span>`); if (t.due) meta.push(`<span>${esc(dayLabel(t.due))}</span>`); }
  else if (t.due && (od || (S.view !== 'today' && S.view !== 'later') || t.done)) meta.push(`<span class="${od ? 'od' : ''}">${esc(dayLabel(t.due))}</span>`);
  if (t.scheduled) meta.push(`<span class="sch">◷ ${esc(dayLabel(t.scheduled.slice(0, 10)))} ${esc(t.scheduled.slice(11, 16))}</span>`);
  if (t.remindAt) meta.push(`<span class="sch">⏰ ${esc(dayLabel(t.remindAt.slice(0, 10)))} ${esc(t.remindAt.slice(11, 16))}</span>`);
  const st = stepsOf(t);
  if (st.length) { const d = st.filter(x => x.done).length; meta.push(`<span class="mbar"><i><b style="width:${Math.round(d / st.length * 100)}%"></b></i>${d}/${st.length}</span>`); }
  const nx = st.find(x => !x.done); if (nx && !t.done) meta.push(`<span class="nx">→ ${esc(nx.t)}</span>`);
  if (!t.done && isTask(t)) {
    const idle = idleDays(t); if (idle >= 3) meta.push(`<span class="idle">idle ${idle}d</span>`);
    if ((t.bumps || 0) >= 2) meta.push(`<span class="idle">↻ ${t.bumps}×</span>`);
  }
  if (S.view !== 'zone') (t.tags || []).slice(0, 1).forEach(g => meta.push(`<span class="tag" data-act="zone" data-z="${esc(g)}" ${zstyle(g)}><span class="zdot"></span>${esc(g)}</span>`));
  return meta.join('');
}
function todoRow(t) {
  const td = todayYmd(), editing = S.editing === t.id, inbox = kindOf(t) === 'inbox';
  return `<li class="todo${t.done ? ' done' : ''}${t.prio ? ' prio' : ''}${S.selId === t.id ? ' sel' : ''}" data-id="${esc(t.id)}">
    <div class="swipe-bg"><span>${inbox ? '→ Today' : '✓ Done'}</span><span>Delete</span></div>
    ${inbox ? '<span class="inboxdot"></span>' : `<button class="check" data-act="toggle" aria-label="${t.done ? 'Mark not done' : 'Complete'}"></button>`}
    <div class="tbody" data-act="select">
      ${editing ? `<input class="edit" id="editInput" value="${esc(t.title)}" aria-label="Rename">` : `<div class="ttitle">${t.focus === td && !t.done ? '<span class="star">★</span>' : ''}${esc(t.title)}</div>`}
      <div class="tmeta">${metaFor(t)}</div>
    </div>
    <div class="tacts">
      ${t.done ? '' : inbox ? `<button data-act="today" title="To-do today (T)">${I.sun}</button>` : `<button data-act="schedule" title="Block time (S)">${I.clock}</button>
      <button data-act="${t.due === td ? 'tomorrow' : 'today'}" title="${t.due === td ? 'Tomorrow (M)' : 'Today (T)'}">${I.sun}</button>`}
      <button data-act="delete" title="Delete (D)">${I.trash}</button>
      <button data-act="open" title="Open (Enter)">${I.open}</button>
    </div></li>`;
}
function viewItems(view) {
  const td = todayYmd(), open = S.todos.filter(t => isTask(t) && !t.done);
  const byP = (a, b) => (b.prio - a.prio) || ((a.time || '99') < (b.time || '99') ? -1 : (a.time || '99') > (b.time || '99') ? 1 : 0) || (a.createdAt - b.createdAt);
  if (view === 'inbox') return [{ items: S.todos.filter(t => kindOf(t) === 'inbox').sort((a, b) => b.createdAt - a.createdAt) }];
  if (view === 'today') {
    const focus = open.filter(t => t.focus === td).sort(byP);
    const od = open.filter(t => t.focus !== td && t.due && t.due < td).sort((a, b) => a.due < b.due ? -1 : 1);
    const now = open.filter(t => t.focus !== td && t.due === td).sort(byP);
    return [{ label: 'Focus', cls: 'acc', items: focus }, { label: 'Overdue', cls: 'warn', items: od }, { label: 'Today', items: now }];
  }
  if (view === 'later') {
    const up = open.filter(t => t.due && t.due > td).sort((a, b) => a.due < b.due ? -1 : a.due > b.due ? 1 : byP(a, b));
    const groups = []; for (const t of up) { const g = groups[groups.length - 1]; if (g && g.key === t.due) g.items.push(t); else groups.push({ key: t.due, label: dayLabel(t.due), items: [t] }); }
    groups.push({ label: 'Anytime', items: open.filter(t => !t.due).sort(byP) });
    if (S.showDone) groups.push({ label: 'Completed', items: S.todos.filter(t => isTask(t) && t.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0)).slice(0, 40) });
    return groups;
  }
  if (view === 'zone' && S.zoneId) return [{ items: S.todos.filter(t => (t.tags || []).includes(S.zoneId) && !['idea', 'appt'].includes(kindOf(t)) && !t.done).sort((a, b) => (a.due || '9999') < (b.due || '9999') ? -1 : (a.due || '9999') > (b.due || '9999') ? 1 : (b.prio - a.prio) || (a.createdAt - b.createdAt)) }];
  return [];
}
const flatIds = () => viewItems(S.view).flatMap(g => g.items.map(t => t.id));
function counts() {
  const td = todayYmd(), open = S.todos.filter(t => isTask(t) && !t.done);
  return { inbox: S.todos.filter(t => kindOf(t) === 'inbox').length, today: open.filter(t => t.due && t.due <= td).length, upcoming: open.filter(t => t.due && t.due > td).length,
    anytime: open.filter(t => !t.due).length, done: S.todos.filter(t => isTask(t) && t.done).length, overdue: open.filter(t => t.due && t.due < td).length,
    ideas: S.todos.filter(t => kindOf(t) === 'idea').length };
}
function moveSel(dir, keepIfMissing) {
  const ids = flatIds(); if (!ids.length) { S.selId = null; return; }
  const i = ids.indexOf(S.selId);
  if (i < 0) { S.selId = ids[dir > 0 ? 0 : ids.length - 1]; return; }
  if (keepIfMissing) { const j = i + 1 < ids.length ? i + 1 : i - 1; S.selId = j >= 0 ? ids[j] : null; return; }
  S.selId = ids[Math.max(0, Math.min(ids.length - 1, i + dir))];
}
function toteCandidates() {
  const td = todayYmd();
  return S.todos.filter(t => isTask(t) && !t.done && ((t.due && t.due <= td) || idleDays(t) >= 3 || (t.bumps || 0) >= 2))
    .sort((a, b) => ((a.due && a.due < td) ? 0 : 1) - ((b.due && b.due < td) ? 0 : 1) || (b.bumps || 0) - (a.bumps || 0) || idleDays(b) - idleDays(a));
}
const reviewDue = () => S.settingsLoaded && S.settings.lastReview !== todayYmd();
const groupsHTML = groups => groups.filter(g => g.items.length).map(g => `<div class="sec">${g.label ? `<div class="lbl ${g.cls || ''}">${esc(g.label)}</div>` : ''}<ul class="list">${g.items.map(todoRow).join('')}</ul></div>`).join('');

function renderMain() {
  const el = $('#main'), c = counts();
  if (S.selId && !flatIds().includes(S.selId)) S.selId = null;
  let html = '';
  if (S.view === 'today') {
    const banner = reviewDue() && S.loaded ? `<div class="rvbanner"><div><b>☀ Morning review</b><span>${c.inbox} to sort · ${toteCandidates().length} to check</span></div><button class="btn primary" data-act="review">Start</button></div>` : '';
    const groups = viewItems('today'), total = groups.reduce((n, g) => n + g.items.length, 0);
    const tasks = !S.loaded ? '<div class="empty">Loading…</div>' : total ? groupsHTML(groups)
      : `<div class="empty"><b>Nothing due today.</b>${c.inbox ? `${c.inbox} capture${c.inbox > 1 ? 's' : ''} waiting in the Inbox.` : 'Capture whatever comes to mind above.'}</div>`;
    html = `${banner}<div class="split"><div>${nextUpLine()}${tasks}</div><div>${agendaHTML()}</div></div>`;
  } else if (S.view === 'inbox') {
    const items = viewItems('inbox')[0].items;
    html = `<div class="lbl">Inbox${items.length ? ` · ${items.length}` : ''}${items.length ? '<span class="r"><button class="linkbtn" data-act="review">Sort now →</button></span>' : ''}</div>
      ${items.length ? `<ul class="list">${items.map(todoRow).join('')}</ul>` : '<div class="empty"><b>All clear.</b>Anything you capture without a date lands here until you sort it.</div>'}`;
  } else if (S.view === 'later') {
    const groups = viewItems('later'), total = groups.reduce((n, g) => n + g.items.length, 0);
    html = (total ? groupsHTML(groups) : '<div class="empty"><b>Nothing planned ahead.</b>Add a date like “fri” or “21/11” when you capture.</div>')
      + (c.done ? `<div class="row" style="gap:18px"><button class="more" data-act="showdone">${S.showDone ? 'Hide completed' : `Show completed (${c.done})`}</button>${S.showDone ? '<button class="more" data-act="cleardone">Clear completed</button>' : ''}</div>` : '');
  } else if (S.view === 'zones') html = zonesHTML();
  else if (S.view === 'zone') html = S.zoneId ? zoneHTML() : zonesHTML();
  else if (S.view === 'ideas') html = ideasHTML();
  else if (S.view === 'week') html = weekHTML();
  el.innerHTML = html;
  if (S.editing) { const inp = $('#editInput'); if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); } }
}
function nextUpLine() {
  const now = new Date(), timed = dayItems(now).filter(e => !e.allDay);
  const live = timed.find(e => e.start <= now && e.end > now), next = timed.find(e => e.start > now);
  if (live) return `<div class="nextup mobonly">Now · <b>${esc(live.title)}</b> until ${hm(live.end)}${evZoneHTML(live)}</div>`;
  if (next) return `<div class="nextup mobonly">Next · <b>${esc(next.title)}</b> at ${hm(next.start)}${evZoneHTML(next)}</div>`;
  return '';
}
function evRow(e, now) {
  const past = e.end <= now, live = e.start <= now && e.end > now;
  return `<li class="ev${past ? ' past' : ''}${live ? ' live' : ''}${e.pending ? ' pending' : ''}${e.declined ? ' declined' : ''}" ${evAttr(e)}>
    <span class="evtime">${e.allDay ? '—' : hm(e.start)}</span><span class="evtitle">${esc(e.title)}<small>${e.allDay ? 'all day' : 'until ' + hm(e.end)}${e.location ? ' · ' + esc(e.location) : ''}</small>${evZoneHTML(e)}</span></li>`;
}
function agendaHTML() {
  const now = new Date(), today = dayItems(now), tm = dayItems(addDays(now, 1));
  const timed = today.filter(e => !e.allDay), ad = today.filter(e => e.allDay);
  const next = timed.find(e => e.start > now);
  let r = '';
  if (next) { const mins = Math.round((next.start - now) / 6e4); r = `next in ${mins < 60 ? mins + ' min' : Math.floor(mins / 60) + 'h' + (mins % 60 ? ' ' + (mins % 60) + 'm' : '')}`; }
  const prob = calProblem();
  let html = `<div class="sec"><div class="lbl">Schedule${r ? `<span class="r">${r}</span>` : ''}</div>`;
  if (prob) html += `<div class="banner${prob.info ? ' info' : ''}">${prob.html}${prob.button ? `<br><button data-act="allowcal">${prob.button}</button>` : ''}</div>`;
  if (ad.length) html += `<div class="alldays">${ad.map(e => `<span class="adchip" ${evAttr(e)}>${esc(e.title)}</span>`).join('')}</div>`;
  if (S.calState === 'loading' && !today.length) html += '<div class="empty">Loading calendar…</div>';
  else {
    if (!timed.length) html += `<div class="empty">No appointments today.</div>`;
    else {
      let rows = '', placed = false;
      for (const e of timed) { if (!placed && e.start > now) { rows += `<li class="nowline">${hm(now)}</li>`; placed = true; } rows += evRow(e, now); }
      if (!placed) rows += `<li class="nowline">${hm(now)}</li>`;
      html += `<ol class="timeline">${rows}</ol>`;
    }
  }
  html += '</div>';
  if (tm.length) html += `<div class="sec"><div class="lbl">Tomorrow</div><ol class="timeline">${tm.slice(0, 6).map(e => evRow(e, now)).join('')}</ol></div>`;
  return html;
}
function ideasHTML() {
  const all = S.todos.filter(t => kindOf(t) === 'idea').sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));
  const fs = [...new Set(all.flatMap(t => t.tags || []))];
  if (S.folder !== '__all' && S.folder !== '__none' && !fs.includes(S.folder)) S.folder = '__all';
  const list = S.folder === '__all' ? all : S.folder === '__none' ? all.filter(t => !(t.tags || []).length) : all.filter(t => (t.tags || []).includes(S.folder));
  const chips = [['__all', 'All'], ...fs.map(f => [f, f]), ...(all.some(t => !(t.tags || []).length) && fs.length ? [['__none', 'No zone']] : [])];
  return `<div class="lbl">Ideas${all.length ? ` · ${all.length}` : ''}</div>
    ${fs.length ? `<div class="folders">${chips.map(([k, l]) => `<button class="chip${k.startsWith('__') ? '' : ' zc'}${S.folder === k ? ' on' : ''}" data-act="folder" data-f="${esc(k)}" ${k.startsWith('__') ? '' : zstyle(k)}>${esc(l)}</button>`).join('')}</div>` : ''}
    ${list.length ? `<div class="ideas">${list.slice(0, 80).map(t => `<div class="idea" data-act="open" data-id="${esc(t.id)}"><div class="it">${esc(t.title)}</div>${t.body ? `<div class="ib">${esc(t.body)}</div>` : ''}
      <div class="im">${(t.tags || []).slice(0, 1).map(g => `<b ${zstyle(g)}>${esc(g)}</b> · `).join('')}${ago(t.createdAt)}</div></div>`).join('')}</div>`
      : '<div class="empty"><b>No ideas yet.</b>Start a capture with “idea:” — or file an inbox item as an idea.</div>'}`;
}
function weekHTML() {
  const td = todayYmd(), ws = S.weekStart, we = addDays(ws, 6);
  const range = ws.getMonth() === we.getMonth() ? `${ws.getDate()} – ${we.getDate()} ${MON_L[we.getMonth()]}` : `${ws.getDate()} ${MON[ws.getMonth()]} – ${we.getDate()} ${MON[we.getMonth()]}`;
  let days = '';
  for (let i = 0; i < 7; i++) {
    const d = addDays(ws, i), k = ymd(d);
    const evs = dayItems(d);
    const tds = S.todos.filter(t => isTask(t) && t.due === k && (!t.done || (t.doneAt && ymd(new Date(t.doneAt)) === k))).sort((a, b) => a.done - b.done || b.prio - a.prio);
    const items = evs.map(e => `<div class="wev" ${evAttr(e)}>${e.allDay ? '' : `<b>${hm(e.start)}</b>`}${esc(e.title)}</div>`).join('')
      + tds.map(t => `<div class="wtd${t.done ? ' done' : ''}" data-id="${esc(t.id)}"><button class="check" data-act="toggle" aria-label="Complete"></button><span data-act="open">${esc(t.title)}</span></div>`).join('');
    days += `<div class="wday${k === td ? ' today' : ''}${k < td ? ' past' : ''}"><div class="wdh"><span class="wdn">${DAYS[d.getDay()]}</span><span class="wdd">${d.getDate()}</span>
      <button class="wadd" data-act="addon" data-date="${k}" title="Add on this day">+</button></div><div class="wdi">${items}</div></div>`;
  }
  return `<div class="lbl">${range}<span class="r wnav"><button data-act="wprev" title="Previous week ([)">‹</button><button data-act="wtoday" title="This week (G)">This week</button><button data-act="wnext" title="Next week (])">›</button></span></div>
    <div class="days">${days}</div>`;
}

/* ---------- capture box: preview + post-save card ---------- */
const addInput = $('#addInput'), drop = $('#drop');
const KINDS = ['inbox', 'todo', 'appt', 'idea'];
const KLABEL = { inbox: 'Inbox', todo: 'To-do', appt: 'Appointment', idea: 'Idea' };
function renderPreview() {
  const v = addInput.value.trim();
  if (!v) { if (!S.capId) drop.hidden = true; return; }
  S.capId = null;
  const p = parseQuick(v), kind = S.forceKind || p.kind, bits = [];
  if (kind === 'appt') { bits.push(p.start ? `${dayLabel(ymd(p.start))} · ${hm(p.start)}–${hm(p.end)}` : p.allDay ? `${dayLabel(ymd(p.due || new Date()))} · all day` : `${dayLabel(ymd(p.due || new Date()))} · set the time after`); if (mcp) bits.push('+ Google Calendar'); }
  else if (kind === 'todo') bits.push(p.due ? dayLabel(ymd(p.due)) : 'Anytime');
  else if (kind === 'inbox') bits.push('sort it later');
  if (p.tags.length) { const z = findZone(p.tags[0]); bits.push(z ? `<span class="zdot" ${zstyle(z)}></span>${esc(z)}` : `new zone “${esc(p.tags[0].replace(/[-_]+/g, ' '))}”`); }
  if (p.prio) bits.push('priority');
  drop.innerHTML = `<div class="preview"><button type="button" class="ptype ${kind}" data-act="cyclekind" title="Change type (Tab)">${KLABEL[kind]}</button>
    <span class="ptitle">${esc(p.title || '…')}</span><span class="pmeta">${bits.join(' · ')}</span>${isTouch ? '' : '<span class="phint">Tab type · ↵ save</span>'}</div>`;
  drop.hidden = false;
}
function cycleKind() {
  const p = parseQuick(addInput.value), cur = S.forceKind || p.kind;
  S.forceKind = KINDS[(KINDS.indexOf(cur) + 1) % KINDS.length]; if (S.forceKind === p.kind) S.forceKind = null;
  renderPreview(); addInput.focus();
}
function closeCard() { S.capId = null; if (!addInput.value.trim()) drop.hidden = true; }
function renderCard(parsed) {
  const t = S.todos.find(x => x.id === S.capId); if (!t) { closeCard(); return; }
  const k = kindOf(t), td = todayYmd(), tm = tomorrowYmd();
  const fs = folders().slice(0, 8);
  let rows = `<div class="cc-row"><span class="cc-l">Type</span>${KINDS.map(v => `<button class="chip${k === v ? ' on' : ''}" data-c="kind" data-v="${v}">${KLABEL[v]}</button>`).join('')}</div>`;
  if (k === 'todo') {
    rows += `<div class="cc-row"><span class="cc-l">Day</span>
      <button class="chip${t.due === td ? ' on' : ''}" data-c="due" data-v="${td}">Today</button>
      <button class="chip${t.due === tm ? ' on' : ''}" data-c="due" data-v="${tm}">Tomorrow</button>
      <button class="chip${!t.due ? ' on' : ''}" data-c="due" data-v="">Anytime</button>
      <input type="date" class="cc-in sm" data-c="duepick" value="${esc(t.due || '')}" aria-label="Pick a day"></div>
      <div class="cc-row"><span class="cc-l">Done when</span><input class="cc-in" data-c="exit" value="${esc(t.exit || '')}" placeholder="the test that ends it — e.g. “draft sent for feedback”"></div>`;
  }
  if (k === 'appt') {
    rows += `<div class="cc-row"><span class="cc-l">When</span><input type="date" class="cc-in sm" data-c="adate" value="${esc(t.due || td)}" aria-label="Date">
      <input type="time" class="cc-in sm" data-c="astart" value="${esc(t.start || '')}" step="300" aria-label="Start"><span class="cc-hint">to</span>
      <input type="time" class="cc-in sm" data-c="aend" value="${esc(t.end || '')}" step="300" aria-label="End"></div>
      <div class="cc-row"><span class="cc-l">Calendar</span>${calStatusHTML(t, 'c')}</div>`;
  }
  if (k !== 'inbox') {
    const cur = (t.tags || [])[0];
    rows += `<div class="cc-row"><span class="cc-l">Zone</span>${fs.map(f => `<button class="chip zc${cur === f ? ' on' : ''}" data-c="folder" data-v="${esc(f)}" ${zstyle(f)}>${esc(f)}</button>`).join('')}
      <input class="cc-in" data-c="newfolder" placeholder="${fs.length ? 'new zone…' : 'e.g. Cluster, Talk'}" style="max-width:150px"></div>`;
  }
  if (k === 'idea') rows += `<div class="cc-row"><span class="cc-l">Note</span><input class="cc-in" data-c="body" value="${esc(t.body || '')}" placeholder="optional detail"></div>`;
  if (k === 'inbox') rows += `<div class="cc-row"><span class="cc-hint">It’s safe in the Inbox — you’ll sort it in the morning review.</span></div>`;
  drop.innerHTML = `<div class="capcard"><div class="cc-h"><span class="cc-ok">✓ Saved</span><span class="cc-t">${esc(t.title)}</span>
    <button class="xbtn" data-c="del" title="Delete">${I.trash}</button><button class="xbtn" data-c="close" title="Close (Esc)">${I.x}</button></div>${rows}</div>`;
  drop.hidden = false;
}
drop.addEventListener('click', e => {
  const a = e.target.closest('[data-c]'); if (!a || !S.capId) return;
  const id = S.capId, t = S.todos.find(x => x.id === id), c = a.dataset.c; if (!t) return;
  switch (c) {
    case 'close': closeCard(); return;
    case 'del': closeCard(); if (isAppt(t)) deleteAppt(id); else delItem(id); return;
    case 'kind': setKind(id, a.dataset.v); break;
    case 'tocal': syncAppt(id); break;
    case 'due': setDue(id, a.dataset.v || null, { silent: true }); break;
    case 'folder': patch(id, { tags: (t.tags || [])[0] === a.dataset.v ? [] : [a.dataset.v] }); break;
    case 'addcal': { const [h, m] = t.time.split(':'); const s = fromYmd(t.due); s.setHours(+h, +m, 0, 0);
      createEvent({ title: t.title, start: s, end: new Date(s.getTime() + 36e5) }).then(r => { if (r) { patch(id, { scheduled: localIso(s), eventId: typeof r === 'string' ? r : null }); if (S.capId === id) renderCard(); } }); return; }
    case 'block': closeCard(); openSchedule(id, addInput); return;
    case 'remind': $('#ccRemind').hidden = false; return;
    case 'remindset': setReminder(id, $('#ccRd').value, $('#ccRt').value).then(() => { if (S.capId === id) renderCard(); }); return;
    default: return;
  }
  renderCard();
});
drop.addEventListener('change', e => {
  const a = e.target.closest('[data-c]'); if (!a || !S.capId) return;
  const id = S.capId, c = a.dataset.c, v = a.value.trim();
  if (c === 'duepick' && v) { setDue(id, v, { silent: true }); renderCard(); }
  if (c === 'adate' || c === 'astart' || c === 'aend') { editApptField(id, { adate: 'due', astart: 'start', aend: 'end' }[c], v); renderCard(); }
  if (c === 'exit') patch(id, { exit: v || null }, { quiet: true });
  if (c === 'body') patch(id, { body: v || null }, { quiet: true });
  if (c === 'newfolder' && v) { const s = slugify(v); if (s) { const z = folders().find(x => znorm(x) === znorm(s)) || (putZone(s, {}), s); patch(id, { tags: [z] }); } renderCard(); }
});
drop.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('input.cc-in')) { e.preventDefault(); e.target.blur(); } if (e.key === 'Escape') { closeCard(); addInput.focus(); } });
async function setReminder(id, d, tm) {
  const t = S.todos.find(x => x.id === id); if (!t || !d || !tm) return;
  const s = fromYmd(d); const [h, m] = tm.split(':'); s.setHours(+h, +m, 0, 0);
  if (isNative) {
    if (await scheduleTaskReminder(id, t.title, s)) { patch(id, { remindAt: localIso(s), kind: 'todo' }); toast(`Reminder set · ${dayLabel(d)} ${tm}`); }
    else toast('Allow notifications for Flow in Android settings to get reminders.');
    return;
  }
  const r = await createEvent({ title: '⏰ ' + t.title, start: s, end: new Date(s.getTime() + 15 * 6e4), popupAt: 0, description: `Reminder from Flow: ${APP_URL}`, quiet: true });
  if (r) { patch(id, { remindAt: localIso(s), remindId: typeof r === 'string' ? r : null, kind: 'todo' }); toast(`Reminder set · ${dayLabel(d)} ${tm} (Google Calendar)`); }
}

addInput.addEventListener('input', renderPreview);
addInput.addEventListener('focus', () => { if (addInput.value.trim()) renderPreview(); });
document.addEventListener('pointerdown', e => { if (!drop.hidden && !e.target.closest('#addwrap') && !e.target.closest('.pop')) { S.capId = null; drop.hidden = true; } });
addInput.addEventListener('keydown', e => {
  if (e.key === 'Tab' && addInput.value.trim()) { e.preventDefault(); cycleKind(); }
  else if (e.key === 'Escape') { if (addInput.value) { addInput.value = ''; S.forceKind = null; renderPreview(); } else if (S.capId) closeCard(); else addInput.blur(); }
  else if (e.key === 'ArrowDown' && S.capId) { const f = drop.querySelector('button.chip'); if (f) { e.preventDefault(); f.focus(); } }
});
$('#addForm').addEventListener('submit', e => {
  e.preventDefault();
  const raw = addInput.value.trim(); if (!raw) return;
  const res = capture(raw); if (!res) return;
  addInput.value = ''; S.forceKind = null;
  S.capId = res.t.id; renderCard(res.p);
});

/* ---------- popovers ---------- */
let popEl = null, scrimEl = null;
function closePop() { if (popEl) { popEl.remove(); scrimEl.remove(); popEl = scrimEl = null; } }
function openPop(html, anchor) {
  closePop();
  scrimEl = document.createElement('div'); scrimEl.className = 'scrim'; scrimEl.addEventListener('click', closePop);
  popEl = document.createElement('div'); popEl.className = 'pop'; popEl.innerHTML = html;
  document.body.append(scrimEl, popEl);
  if (!isMobile() && anchor) {
    const r = anchor.getBoundingClientRect(), w = popEl.offsetWidth, h = popEl.offsetHeight;
    const left = Math.min(Math.max(12, r.left), innerWidth - w - 12); let top = r.bottom + 6;
    if (top + h > innerHeight - 12) top = Math.max(12, r.top - h - 6);
    popEl.style.left = left + 'px'; popEl.style.top = top + 'px';
  }
  return popEl;
}
function openSchedule(id, anchor) {
  const t = S.todos.find(x => x.id === id); if (!t) return;
  if (!mcp) { toast('Connect Google to use the calendar (tap the status dots).'); return; }
  const now = new Date(), d = t.due && t.due >= todayYmd() ? fromYmd(t.due) : startOfDay(now);
  let start;
  if (t.time) { const [h, m] = t.time.split(':'); start = new Date(d); start.setHours(+h, +m, 0, 0); }
  else if (ymd(d) === todayYmd()) { start = new Date(now); start.setMinutes(now.getMinutes() < 30 ? 30 : 60, 0, 0); }
  else { start = new Date(d); start.setHours(9, 0, 0, 0); }
  let dur = 60;
  const p = openPop(`<h3>${esc(t.title)}</h3><div class="pmeta">Block time on Google Calendar</div>
    <div class="prow"><input type="date" id="sDate" value="${ymd(start)}"><input type="time" id="sTime" value="${hm(start)}" step="900"></div>
    <div class="durs">${[15, 30, 60, 90, 120].map(m => `<button class="dur${m === dur ? ' on' : ''}" data-m="${m}">${m < 60 ? m + 'm' : m / 60 + 'h'}</button>`).join('')}</div>
    <div class="pacts"><button class="btn" data-x="cancel">Cancel</button><button class="btn primary" data-x="go">Add to calendar</button></div>`, anchor);
  p.querySelectorAll('.dur').forEach(b => b.addEventListener('click', () => { dur = +b.dataset.m; p.querySelectorAll('.dur').forEach(x => x.classList.toggle('on', x === b)); }));
  const go = async () => {
    const dv = p.querySelector('#sDate').value, tv = p.querySelector('#sTime').value; if (!dv || !tv) return;
    const s = fromYmd(dv); const [h, m] = tv.split(':'); s.setHours(+h, +m, 0, 0);
    closePop();
    const res = await createEvent({ title: t.title, start: s, end: new Date(s.getTime() + dur * 6e4) });
    if (res) { patch(id, { scheduled: localIso(s), eventId: typeof res === 'string' ? res : null, due: ymd(s), kind: 'todo' }); if (S.detailId === id) renderDetail(); }
  };
  p.querySelector('[data-x=go]').addEventListener('click', go);
  p.querySelector('[data-x=cancel]').addEventListener('click', closePop);
  p.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
  setTimeout(() => p.querySelector('#sTime').focus(), 30);
}
function openEvent(ev, anchor) {
  const when = ev.allDay ? `${dayLabel(ymd(ev.start))} · all day` : `${dayLabel(ymd(ev.start))} · ${hm(ev.start)}–${hm(ev.end)}`;
  const safeLink = /^https:\/\//.test(ev.link) ? ev.link : '';
  const p = openPop(`<h3>${esc(ev.title)}</h3><div class="pmeta">${esc(when)}${ev.location ? '<br>' + esc(ev.location) : ''}</div>
    <div class="pacts">${safeLink ? `<a href="${esc(safeLink)}" target="_blank" rel="noopener">Open in Google Calendar ↗</a>` : ''}
    ${ev.id && !ev.pending ? '<button class="btn danger" data-x="del">Delete</button>' : ''}<button class="btn" data-x="close">Close</button></div>`, anchor);
  p.querySelector('[data-x=close]').addEventListener('click', closePop);
  const del = p.querySelector('[data-x=del]');
  if (del) del.addEventListener('click', () => {
    if (!del.classList.contains('armed')) { del.classList.add('armed'); del.textContent = 'Confirm delete'; return; }
    closePop(); deleteEvent(ev);
  });
}

async function openAccount(anchor) {
  const on = signedIn() || wasConnected();
  const em = on ? (S.account || await accountEmail()) : '';
  const p = openPop(`<h3>${on ? 'Google account' : 'Not connected'}</h3>
    <div class="pmeta">${on ? esc(em || 'Connected') : 'Everything is saved on this device. Connect Google to sync with your other devices and use your calendar.'}</div>
    <div class="pmeta" style="font-size:14px">${esc(statusText())}${lastSync ? '<br>Last sync ' + hm(new Date(lastSync)) : ''}</div>
    <div class="pacts">${on ? '<button class="btn danger" data-x="out">Disconnect</button><button class="btn" data-x="sync">Sync now</button>' : ''}
    <button class="btn primary" data-x="in">${on ? 'Reconnect' : 'Connect Google'}</button></div>`, anchor);
  p.querySelector('[data-x=in]').addEventListener('click', () => { closePop(); doConnect(); });
  const sy = p.querySelector('[data-x=sync]'); if (sy) sy.addEventListener('click', () => { closePop(); syncNow().then(() => toast(S.dbState === 'synced' ? 'Synced' : statusText())); calendar.refresh(); });
  const out = p.querySelector('[data-x=out]'); if (out) out.addEventListener('click', () => {
    if (!out.classList.contains('armed')) { out.classList.add('armed'); out.textContent = 'Confirm'; return; } closePop(); doDisconnect(); });
}

/* ---------- detail sheet (task TOTE / idea) ---------- */
let sheetEl = null, sheetScrim = null;
function openDetail(id) {
  closeDetail(); closePop(); S.detailId = id;
  sheetScrim = document.createElement('div'); sheetScrim.className = 'scrim dim'; sheetScrim.style.zIndex = 44; sheetScrim.addEventListener('click', closeDetail);
  sheetEl = document.createElement('div'); sheetEl.className = 'sheet'; sheetEl.setAttribute('role', 'dialog');
  document.body.append(sheetScrim, sheetEl);
  sheetEl.addEventListener('click', onSheetClick);
  sheetEl.addEventListener('change', onSheetChange);
  sheetEl.addEventListener('keydown', onSheetKey);
  renderDetail();
}
function closeDetail() {
  if (!sheetEl) return;
  const a = document.activeElement; if (a && sheetEl.contains(a)) a.blur();
  sheetEl.remove(); sheetScrim.remove(); sheetEl = sheetScrim = null; S.detailId = null;
}
function renderDetail() {
  if (!sheetEl) return;
  const t = S.todos.find(x => x.id === S.detailId); if (!t) { closeDetail(); return; }
  const k = kindOf(t), td = todayYmd(), tm = tomorrowYmd(), fs = folders().slice(0, 10), cur = (t.tags || [])[0];
  const kindRow = `<div class="checkins" style="margin-top:6px">${KINDS.map(v => `<button class="chip${k === v ? ' on' : ''}" data-s="kind" data-v="${v}">${KLABEL[v]}</button>`).join('')}</div>`;
  const folderRow = `<div class="sh-sec"><div class="sh-l">Zone</div><div class="checkins">${fs.map(f => `<button class="chip zc${cur === f ? ' on' : ''}" data-s="folder" data-v="${esc(f)}" ${zstyle(f)}>${esc(f)}</button>`).join('')}
    <input class="cc-in" data-s="newfolder" placeholder="new zone…" style="max-width:160px"></div></div>`;
  let html = `<input class="sh-title" data-s="title" value="${esc(t.title)}" aria-label="Title">${kindRow}`;
  if (k === 'todo') {
    const st = stepsOf(t), dn = st.filter(x => x.done).length, idle = idleDays(t);
    const sig = [];
    if (t.done) sig.push(`<span class="sig">✓ done ${ago(t.doneAt || Date.now())}</span>`);
    else {
      sig.push(`<span class="sig${idle >= 3 ? ' warn' : ''}">${idle >= 1 ? `no progress for ${idle}d` : 'progress today'}</span>`);
      if (t.bumps) sig.push(`<span class="sig${t.bumps >= 2 ? ' warn' : ''}">postponed ${t.bumps}×</span>`);
      if (t.due && t.due < td) sig.push('<span class="sig warn">overdue</span>');
    }
    const hist = (t.checks || []).slice(-5).reverse().map(c => `${new Date(c.at).getDate()} ${MON[new Date(c.at).getMonth()]} · ${c.r === 'progress' ? 'made progress' : c.r === 'stuck' ? 'stuck' : c.r}`).join('<br>');
    html += `<div class="signals">${sig.join('')}</div>
    <div class="sh-sec"><div class="sh-l">Test · done when… <small>the exit condition</small></div><input class="sh-in" data-s="exit" value="${esc(t.exit || '')}" placeholder="e.g. draft sent for feedback"></div>
    <div class="sh-sec"><div class="sh-l">Operate · steps ${st.length ? `<small>${dn}/${st.length}</small>` : '<small>break it into small actions</small>'}</div>
      ${st.length ? `<div class="bigbar"><b style="width:${Math.round(dn / st.length * 100)}%"></b></div>` : ''}
      <ul class="steps">${st.map(s => `<li class="step${s.done ? ' done' : ''}" data-step="${esc(s.id)}"><button class="check${s.done ? ' on' : ''}" data-s="step"></button><span>${esc(s.t)}</span><button class="xbtn" data-s="delstep" title="Remove">${I.x}</button></li>`).join('')}</ul>
      <input class="sh-in" data-s="addstep" id="addStep" placeholder="${st.length ? 'Add a step…' : 'Smallest next step…'}"></div>
    <div class="sh-sec"><div class="sh-l">When</div><div class="checkins">
      <button class="chip${t.due === td ? ' on' : ''}" data-s="due" data-v="${td}">Today</button>
      <button class="chip${t.due === tm ? ' on' : ''}" data-s="due" data-v="${tm}">Tomorrow</button>
      <button class="chip${!t.due ? ' on' : ''}" data-s="due" data-v="">Anytime</button>
      <input type="date" class="cc-in sm" data-s="duepick" value="${esc(t.due || '')}">
      <button class="chip${t.focus === td ? ' on' : ''}" data-s="focus">★ Focus today</button></div></div>
    <div class="sh-sec"><div class="sh-l">Calendar <small>optional</small></div><div class="checkins">
      ${t.scheduled ? `<span class="sig">◷ ${esc(dayLabel(t.scheduled.slice(0, 10)))} ${esc(t.scheduled.slice(11, 16))}</span>` : ''}<button class="chip" data-s="block">Block time to work on it…</button>
      ${t.remindAt ? `<span class="sig">⏰ ${esc(dayLabel(t.remindAt.slice(0, 10)))} ${esc(t.remindAt.slice(11, 16))}</span>` : '<button class="chip" data-s="showremind">Remind me…</button>'}</div>
      <div class="checkins" id="shRemind" hidden style="margin-top:8px"><input type="date" class="cc-in sm" id="shRd" value="${esc(t.due && t.due >= td ? t.due : td)}"><input type="time" class="cc-in sm" id="shRt" value="09:00"><button class="chip go" data-s="remind">Set reminder</button></div></div>
    ${folderRow}
    ${t.done ? '' : `<div class="sh-sec"><div class="sh-l">Check in</div><div class="checkins"><button class="btn" data-s="progress">↗ Made progress</button><button class="btn" data-s="stuck">Stuck</button><button class="btn ok" data-s="done">✓ Done — exit</button></div>
      ${hist ? `<div class="hist">${hist}</div>` : ''}</div>`}`;
  } else if (k === 'appt') {
    html += `<div class="sh-sec"><div class="sh-l">When</div><div class="checkins"><input type="date" class="cc-in sm" data-s="adate" value="${esc(t.due || td)}" aria-label="Date">
      <input type="time" class="cc-in sm" data-s="astart" value="${esc(t.start || '')}" step="300" aria-label="Start"><span class="cc-hint">to</span>
      <input type="time" class="cc-in sm" data-s="aend" value="${esc(t.end || '')}" step="300" aria-label="End"></div></div>
      <div class="sh-sec"><div class="sh-l">Calendar</div><div class="checkins">${calStatusHTML(t, 's')}</div></div>
      <div class="sh-sec"><div class="sh-l">Notes</div><textarea class="sh-ta" data-s="body" placeholder="Agenda, address, what to bring…">${esc(t.body || '')}</textarea></div>${folderRow}`;
  } else {
    html += `<div class="sh-sec"><div class="sh-l">Notes</div><textarea class="sh-ta" data-s="body" placeholder="Details, links, what triggered it…">${esc(t.body || '')}</textarea></div>${folderRow}
      ${k === 'idea' ? '' : `<div class="sh-sec"><div class="sh-l">Make it a to-do</div><div class="checkins"><button class="chip" data-s="due" data-v="${td}">Today</button><button class="chip" data-s="due" data-v="${tm}">Tomorrow</button><button class="chip" data-s="due" data-v="">Anytime</button></div></div>`}
      <div class="hist">Captured ${ago(t.createdAt)}</div>`;
  }
  html += `<div class="pacts" style="margin-top:16px"><button class="btn danger" data-s="delete">Delete</button><span style="flex:1"></span><button class="btn primary" data-s="close">Close</button></div>`;
  sheetEl.innerHTML = html;
}
function onSheetClick(e) {
  const a = e.target.closest('[data-s]'); if (!a) return;
  const id = S.detailId, t = S.todos.find(x => x.id === id); if (!t) return;
  const s = a.dataset.s, li = a.closest('[data-step]');
  switch (s) {
    case 'close': closeDetail(); return;
    case 'delete': if (isAppt(t)) { if (t.onCal && !a.classList.contains('armed')) { a.classList.add('armed'); a.textContent = t.eventId ? 'Delete — also from Google Calendar' : 'Confirm delete'; return; } closeDetail(); deleteAppt(id); return; }
      closeDetail(); delItem(id); return;
    case 'kind': setKind(id, a.dataset.v); break;
    case 'tocal': syncAppt(id); return;
    case 'showremind': { const r = sheetEl.querySelector('#shRemind'); r.hidden = false; return; }
    case 'folder': patch(id, { tags: (t.tags || [])[0] === a.dataset.v ? [] : [a.dataset.v] }); break;
    case 'due': setDue(id, a.dataset.v || null, { silent: true }); break;
    case 'focus': toggleFocus(id); break;
    case 'step': { const steps = stepsOf(t).map(x => x.id === li.dataset.step ? { ...x, done: !x.done } : x); const nowDone = steps.find(x => x.id === li.dataset.step).done;
      patch(id, nowDone ? { steps, progressAt: Date.now() } : { steps });
      if (nowDone && steps.every(x => x.done) && !t.done) toast('All steps done — does it pass the “done when” test?'); break; }
    case 'delstep': patch(id, { steps: stepsOf(t).filter(x => x.id !== li.dataset.step) }); break;
    case 'progress': checkIn(id, 'progress'); toast('Progress logged'); break;
    case 'stuck': checkIn(id, 'stuck'); renderDetail(); { const i = sheetEl.querySelector('#addStep'); i.placeholder = 'What’s the smallest next step you could take?'; i.focus(); } return;
    case 'done': closeDetail(); toggleDone(id); return;
    case 'block': openSchedule(id, a); return;
    case 'remind': setReminder(id, sheetEl.querySelector('#shRd').value, sheetEl.querySelector('#shRt').value).then(renderDetail); return;
    default: return;
  }
  renderDetail();
}
function onSheetChange(e) {
  const a = e.target.closest('[data-s]'); if (!a) return;
  const id = S.detailId, t = S.todos.find(x => x.id === id); if (!t) return;
  const s = a.dataset.s, v = a.value.trim();
  if (s === 'title' && v && v !== t.title) patch(id, { title: v }, { quiet: true });
  if (s === 'exit') patch(id, { exit: v || null }, { quiet: true });
  if (s === 'body') patch(id, { body: a.value || null }, { quiet: true });
  if (s === 'duepick' && v) { setDue(id, v, { silent: true }); renderDetail(); }
  if (s === 'adate' || s === 'astart' || s === 'aend') { editApptField(id, { adate: 'due', astart: 'start', aend: 'end' }[s], v); renderDetail(); }
  if (s === 'title' && isAppt(t) && t.onCal && v && v !== t.title) setTimeout(() => updateApptCal(S.todos.find(x => x.id === id)), 0);
  if (s === 'newfolder' && v) { const nz = slugify(v); if (nz) { const z = folders().find(x => znorm(x) === znorm(nz)) || (putZone(nz, {}), nz); patch(id, { tags: [z] }); } renderDetail(); }
  render();
}
function onSheetKey(e) {
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeDetail(); return; }
  if (e.key !== 'Enter' || e.target.tagName === 'TEXTAREA') return;
  if (e.target.dataset.s === 'addstep') {
    e.preventDefault(); const v = e.target.value.trim(); if (!v) return;
    const t = S.todos.find(x => x.id === S.detailId); if (!t) return;
    patch(t.id, { steps: [...stepsOf(t), { id: uid('s'), t: v, done: false }], kind: 'todo' });
    renderDetail(); const i = sheetEl.querySelector('#addStep'); if (i) i.focus();
  } else if (e.target.matches('input')) { e.preventDefault(); e.target.blur(); }
}

/* ---------- morning review ---------- */
let RV = null, rvEl = null, rvScrim = null;
function startReview() {
  closeDetail(); closePop();
  const inbox = S.todos.filter(t => kindOf(t) === 'inbox').sort((a, b) => a.createdAt - b.createdAt).slice(0, 15);
  const tote = toteCandidates().slice(0, 8);
  RV = { steps: [{ k: 'intro' }, ...inbox.map(t => ({ k: 'inbox', id: t.id })), ...tote.map(t => ({ k: 'tote', id: t.id })), { k: 'focus' }, { k: 'end' }], i: 0, phase: 'test', n: { sorted: 0, done: 0, moved: 0, steps: 0 } };
  rvScrim = document.createElement('div'); rvScrim.className = 'scrim dim'; rvScrim.style.zIndex = 47;
  rvEl = document.createElement('div'); rvEl.className = 'review'; rvEl.setAttribute('role', 'dialog');
  document.body.append(rvScrim, rvEl);
  rvEl.addEventListener('click', onReviewClick);
  rvEl.addEventListener('keydown', onReviewKey);
  renderReview();
}
function closeReview() { if (!rvEl) return; rvEl.remove(); rvScrim.remove(); rvEl = rvScrim = null; RV = null; if (location.hash === '#review') history.replaceState(null, '', location.pathname + location.search); render(); }
function rvNext() { RV.i++; RV.phase = 'test'; skipMissing(); renderReview(); }
function skipMissing() { while (RV.i < RV.steps.length) { const st = RV.steps[RV.i]; if (st.id && !S.todos.find(x => x.id === st.id && (st.k !== 'inbox' || kindOf(x) === 'inbox'))) RV.i++; else break; } }
function renderReview() {
  if (!rvEl) return;
  const st = RV.steps[RV.i], td = todayYmd(), tm = tomorrowYmd();
  const prog = Math.round(RV.i / (RV.steps.length - 1) * 100);
  let body = '';
  const t = st.id ? S.todos.find(x => x.id === st.id) : null;
  if (st.k === 'intro') {
    const now = new Date(), its = dayItems(now), evs = its.filter(e => !e.allDay), ad = its.filter(e => e.allDay);
    const y = ymd(addDays(now, -1)), yDone = S.todos.filter(x => x.doneAt && ymd(new Date(x.doneAt)) === y).length;
    const nIn = RV.steps.filter(s => s.k === 'inbox').length, nT = RV.steps.filter(s => s.k === 'tote').length;
    body = `<div class="rv-k">Good morning</div><h2 class="rv-h">${DAYS_L[now.getDay()]} ${now.getDate()} ${MON_L[now.getMonth()]}</h2>
      <p class="rv-p">${yDone ? `Yesterday you finished ${yDone} task${yDone > 1 ? 's' : ''}. ` : ''}${nIn} capture${nIn === 1 ? '' : 's'} to sort, ${nT} task${nT === 1 ? '' : 's'} to check.</p>
      ${evs.length || ad.length ? `<ul class="rv-list">${ad.map(e => `<li><span class="t">all day</span>${esc(e.title)}</li>`).join('')}${evs.map(e => `<li><span class="t">${hm(e.start)}</span>${esc(e.title)}</li>`).join('')}</ul>` : '<p class="rv-p">No appointments today — open space.</p>'}
      ${S.calState === 'ok' ? '' : `<p class="rv-p" style="font-size:14px">(${S.calState === 'loading' ? 'Google Calendar still loading…' : 'Google Calendar not connected — showing Flow appointments only.'})</p>`}
      <div class="rv-acts"><button class="btn primary full" data-r="next">Let’s go</button></div>`;
  } else if (st.k === 'inbox' && t) {
    const fs = folders().slice(0, 6);
    body = `<div class="rv-k">Sort the inbox</div><h2 class="rv-h">${esc(t.title)}</h2><p class="rv-p">Captured ${ago(t.createdAt)}. What is it?</p>
      <div class="rv-acts"><button class="btn primary" data-r="in-today">To-do today</button><button class="btn" data-r="in-tomorrow">To-do tomorrow</button>
      <button class="btn" data-r="in-anytime">To-do, no date</button><button class="btn" data-r="in-idea">Idea</button>
      <button class="btn danger" data-r="in-del">Delete</button><button class="btn" data-r="next">Leave for now</button></div>
      ${fs.length ? `<p class="rv-p" style="margin:14px 0 6px;font-size:13px">File as an idea in a zone:</p><div class="checkins">${fs.map(f => `<button class="chip zc" data-r="in-idea" data-f="${esc(f)}" ${zstyle(f)}>${esc(f)}</button>`).join('')}</div>` : ''}`;
  } else if (st.k === 'tote' && t) {
    const steps = stepsOf(t), nx = steps.find(x => !x.done), idle = idleDays(t), why = [];
    if (t.due && t.due < td) why.push(`overdue since ${dayLabel(t.due).toLowerCase()}`); else if (t.due === td) why.push('due today');
    if (idle >= 3) why.push(`no progress for ${idle} days`);
    if ((t.bumps || 0) >= 2) why.push(`postponed ${t.bumps}×`);
    if (RV.phase === 'test') {
      body = `<div class="rv-k warn">Test</div><h2 class="rv-h">${esc(t.title)}</h2><p class="rv-p">${esc(why.join(' · '))}</p>
        ${t.exit ? `<p class="rv-p"><b style="color:var(--ink)">Done when:</b> ${esc(t.exit)}</p>` : `<input class="sh-in" id="rvExit" placeholder="Done when… (optional — what would end this?)" style="margin-bottom:12px">`}
        ${steps.length ? `<div class="bigbar"><b style="width:${Math.round(steps.filter(x => x.done).length / steps.length * 100)}%"></b></div><p class="rv-p" style="font-size:13px">${steps.filter(x => x.done).length}/${steps.length} steps${nx ? ` · next: ${esc(nx.t)}` : ''}</p>` : ''}
        <p class="rv-p" style="color:var(--ink);font-weight:600">Is it done?</p>
        <div class="rv-acts"><button class="btn ok" data-r="t-done">Yes — exit ✓</button><button class="btn primary" data-r="t-no">Not yet</button></div>`;
    } else {
      body = `<div class="rv-k">Operate</div><h2 class="rv-h">${esc(t.title)}</h2>
        <p class="rv-p">${nx ? `Next step: <b style="color:var(--ink)">${esc(nx.t)}</b>` : 'What’s the smallest next step?'}</p>
        <input class="sh-in" id="rvStep" placeholder="${nx ? 'Add another step (optional)' : 'e.g. open the draft and reread section 2'}" style="margin-bottom:12px">
        <div class="rv-acts"><button class="btn primary" data-r="t-today">Do it today</button><button class="btn" data-r="t-tomorrow">Tomorrow</button>
        <button class="btn" data-r="t-anytime">Remove the date</button><button class="btn danger" data-r="t-drop">Drop it</button>
        <button class="btn full" data-r="t-keep">Keep as is</button></div>`;
    }
  } else if (st.k === 'focus') {
    const cand = S.todos.filter(x => isTask(x) && !x.done && x.due && x.due <= td).sort((a, b) => (b.focus === td) - (a.focus === td) || b.prio - a.prio);
    const n = cand.filter(x => x.focus === td).length;
    body = `<div class="rv-k">Focus</div><h2 class="rv-h">Pick up to 3 for today</h2><p class="rv-p">${n}/3 chosen. These go to the top of your list.</p>
      ${cand.length ? `<ul class="rv-list">${cand.slice(0, 12).map(x => `<li class="rv-pick${x.focus === td ? ' on' : ''}" data-r="pick" data-id="${esc(x.id)}"><span class="star">${x.focus === td ? '★' : '☆'}</span>${esc(x.title)}</li>`).join('')}</ul>` : '<p class="rv-p">Nothing due today — enjoy the space, or pull something from Anytime.</p>'}
      <div class="rv-acts"><button class="btn primary full" data-r="next">Done</button></div>`;
  } else if (st.k === 'end') {
    if (S.settings.lastReview !== td) saveSettings({ lastReview: td });
    const has = isNative ? !!S.settings.reviewLocal : !!S.settings.reviewEventId, n = RV.n;
    body = `<div class="rv-k">All set</div><h2 class="rv-h">Have a good day ☀</h2>
      <p class="rv-p">${[n.sorted && `${n.sorted} sorted`, n.done && `${n.done} closed`, n.moved && `${n.moved} replanned`, n.steps && `${n.steps} next steps defined`].filter(Boolean).join(' · ') || 'Review complete.'}</p>
      ${has ? `<p class="rv-p" style="font-size:14px">Daily reminder is on at ${esc(S.settings.reviewTime || '08:30')}${isNative ? ' on this phone' : ' (Google Calendar)'}.</p>`
        : `<div class="sh-sec" style="background:var(--bg);border-radius:12px;padding:12px"><div class="sh-l" style="color:var(--ink)">Get nudged every morning on your phone</div>
          <p class="rv-p" style="font-size:14px;margin-bottom:10px">${isNative ? 'Flow will notify you on this phone every morning; tapping it opens this review.' : 'Creates a daily Google Calendar event with a notification and a link straight into this review.'}</p>
          <div class="checkins"><input type="time" class="cc-in sm" id="rvTime" value="${esc(S.settings.reviewTime || '08:30')}"><button class="btn primary" data-r="remind">Create daily reminder</button></div></div>`}
      <div class="rv-acts" style="margin-top:14px"><button class="btn full" data-r="close">Close</button></div>`;
  } else { rvNext(); return; }
  rvEl.innerHTML = `<div class="rv-top"><b>Morning review</b><div class="rv-prog"><i style="width:${prog}%"></i></div><button class="xbtn" data-r="close" title="Close">${I.x}</button></div>${body}
    ${st.k !== 'end' && st.k !== 'intro' ? '<button class="rv-skip" data-r="finish">Skip to the end</button>' : ''}`;
  const f = rvEl.querySelector('#rvStep, #rvExit'); if (f && !isTouch) f.focus();
}
function rvSaveInputs(t) {
  const ex = rvEl.querySelector('#rvExit'), sp = rvEl.querySelector('#rvStep');
  const p = {};
  if (ex && ex.value.trim()) p.exit = ex.value.trim();
  if (sp && sp.value.trim()) { p.steps = [...stepsOf(t), { id: uid('s'), t: sp.value.trim(), done: false }]; RV.n.steps++; }
  if (Object.keys(p).length) patch(t.id, p, { quiet: true });
}
function onReviewClick(e) {
  const a = e.target.closest('[data-r]'); if (!a || !RV) return;
  const r = a.dataset.r, st = RV.steps[RV.i], t = st.id ? S.todos.find(x => x.id === st.id) : null, td = todayYmd(), tm = tomorrowYmd();
  if (r === 'close') { closeReview(); return; }
  if (r === 'finish') { RV.i = RV.steps.length - 1; renderReview(); return; }
  if (r === 'next') { rvNext(); return; }
  if (r === 'remind') {
    const tv = rvEl.querySelector('#rvTime').value || '08:30'; const [h, m] = tv.split(':');
    if (isNative) { scheduleReview(tv).then(ok => { if (ok) { saveSettings({ reviewLocal: true, reviewTime: tv }); toast(`Every morning at ${tv}`); } else toast('Allow notifications for Flow in Android settings.'); renderReview(); }); return; }
    let s = new Date(); s.setHours(+h, +m, 0, 0); if (s < new Date()) s = addDays(s, 1);
    a.disabled = true; a.textContent = 'Creating…';
    createEvent({ title: '☀ Morning review', start: s, end: new Date(s.getTime() + 10 * 6e4), popupAt: 0, recurrence: ['RRULE:FREQ=DAILY'],
      description: `Open your Flow morning review: ${APP_URL}#review`, quiet: true })
      .then(id => { if (id) { saveSettings({ reviewEventId: typeof id === 'string' ? id : 'set', reviewTime: tv }); toast(`Daily reminder set for ${tv}`); } renderReview(); });
    return;
  }
  if (r === 'pick') { toggleFocus(a.dataset.id); renderReview(); return; }
  if (!t) { rvNext(); return; }
  switch (r) {
    case 'in-today': patch(t.id, { kind: 'todo', due: td }); RV.n.sorted++; break;
    case 'in-tomorrow': patch(t.id, { kind: 'todo', due: tm }); RV.n.sorted++; break;
    case 'in-anytime': patch(t.id, { kind: 'todo', due: null }); RV.n.sorted++; break;
    case 'in-idea': patch(t.id, { kind: 'idea', ...(a.dataset.f ? { tags: [a.dataset.f] } : {}) }); RV.n.sorted++; break;
    case 'in-del': remove(t.id); RV.n.sorted++; break;
    case 't-done': rvSaveInputs(t); patch(t.id, { done: true, doneAt: Date.now(), progressAt: Date.now() }); RV.n.done++; break;
    case 't-no': rvSaveInputs(t); RV.phase = 'operate'; renderReview(); return;
    case 't-today': rvSaveInputs(t); if (t.due !== td) setDue(t.id, td, { silent: true }); RV.n.moved++; break;
    case 't-tomorrow': rvSaveInputs(t); setDue(t.id, tm, { silent: true }); RV.n.moved++; break;
    case 't-anytime': rvSaveInputs(t); patch(t.id, { due: null }); RV.n.moved++; break;
    case 't-drop': remove(t.id); RV.n.done++; break;
    case 't-keep': rvSaveInputs(t); break;
    default: return;
  }
  rvNext();
}
function onReviewKey(e) {
  if (e.key === 'Escape') { e.preventDefault(); closeReview(); }
  if (e.key === 'Enter' && e.target.matches('#rvStep, #rvExit')) { e.preventDefault(); const b = rvEl.querySelector('[data-r="t-today"], [data-r="t-no"]'); if (b) b.click(); }
}

/* ---------- click delegation ---------- */
document.addEventListener('click', e => {
  const a = e.target.closest('[data-act]'); if (!a || (sheetEl && sheetEl.contains(a)) || (rvEl && rvEl.contains(a))) return;
  const act = a.dataset.act, row = a.closest('[data-id]'), id = row && row.dataset.id;
  switch (act) {
    case 'toggle': toggleDone(id); break;
    case 'select': if (S.editing === id) return;
      if (isTouch || S.selId === id) { openDetail(id); return; }
      S.selId = id; renderMain(); break;
    case 'open': openDetail(id); break;
    case 'delete': delItem(id); break;
    case 'today': setDue(id, todayYmd()); break;
    case 'tomorrow': setDue(id, tomorrowYmd()); break;
    case 'schedule': openSchedule(id, a); break;
    case 'view': setView(a.dataset.view); break;
    case 'folder': S.folder = a.dataset.f; renderMain(); break;
    case 'zone': e.stopPropagation(); openZone(a.dataset.z); break;
    case 'zcolor': putZone(S.zoneId, { color: a.dataset.c }); renderMain(); break;
    case 'noop': return;
    case 'dellink': { const d = zoneDoc(S.zoneId) || {}; putZone(S.zoneId, { links: (d.links || []).filter(l => l.id !== a.dataset.lid) }); renderMain(); break; }
    case 'delsnip': { const d = zoneDoc(S.zoneId) || {}; putZone(S.zoneId, { snippets: (d.snippets || []).filter(l => l.id !== a.dataset.sid) }); renderMain(); break; }
    case 'addsnip': { const L = $('#zSnipL'), T = $('#zSnipT'); if (!T.value.trim()) { T.focus(); return; } const d = zoneDoc(S.zoneId) || {};
      putZone(S.zoneId, { snippets: [...(d.snippets || []), { id: uid('c'), label: L.value.trim(), text: T.value.replace(/\s+$/, '') }] }); renderMain(); break; }
    case 'copysnip': { const s = ((zoneDoc(S.zoneId) || {}).snippets || []).find(x => x.id === a.dataset.sid); if (!s) return;
      const sel = () => { const pre = document.getElementById('snip_' + s.id); if (pre) { const r = document.createRange(); r.selectNodeContents(pre); const g = getSelection(); g.removeAllRanges(); g.addRange(r); } toast('Selected — press Ctrl/⌘+C to copy'); };
      try { navigator.clipboard.writeText(s.text).then(() => { a.textContent = 'Copied ✓'; setTimeout(() => { a.textContent = 'Copy'; }, 1500); }, sel); } catch (x) { sel(); } break; }
    case 'zdelete': if (!a.classList.contains('armed')) { a.classList.add('armed'); a.textContent = 'Confirm delete'; setTimeout(() => { a.classList.remove('armed'); a.textContent = 'Delete'; }, 4000); return; } deleteZone(S.zoneId); break;
    case 'event': { const ev = S.events[+a.dataset.eidx]; if (ev) openEvent(ev, a); break; }
    case 'wprev': S.weekStart = addDays(S.weekStart, -7); renderMain(); watchCal(); break;
    case 'wnext': S.weekStart = addDays(S.weekStart, 7); renderMain(); watchCal(); break;
    case 'wtoday': S.weekStart = startOfWeek(new Date()); renderMain(); watchCal(); break;
    case 'addon': { const d = fromYmd(a.dataset.date); addInput.value = `${d.getDate()}/${d.getMonth() + 1} `; addInput.focus(); renderPreview(); break; }
    case 'cyclekind': cycleKind(); break;
    case 'allowcal': allowCal(); break;
    case 'review': startReview(); break;
    case 'statusinfo': openAccount(a); break;
    case 'showdone': S.showDone = !S.showDone; renderMain(); break;
    case 'help': $('#help').hidden = false; break;
    case 'closehelp': $('#help').hidden = true; break;
    case 'cleardone': {
      const done = S.todos.filter(t => isTask(t) && t.done); done.forEach(t => remove(t.id, { quiet: true })); render();
      toast(`Cleared ${done.length}`, () => { done.forEach(t => put({ ...t }, { quiet: true })); render(); }); break;
    }
  }
});
$('#help').addEventListener('click', e => { if (e.target.id === 'help') $('#help').hidden = true; });
$('#main').addEventListener('keydown', zoneKeydown);
$('#main').addEventListener('change', zoneChange);

/* ---------- inline rename ---------- */
document.addEventListener('keydown', e => {
  if (e.target.id !== 'editInput') return;
  if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
  else if (e.key === 'Escape') { e.preventDefault(); S.editing = null; renderTodos(); }
  e.stopPropagation();
}, true);
document.addEventListener('focusout', e => { if (e.target.id === 'editInput') setTimeout(() => { if (S.editing) commitEdit(); }, 0); });
function commitEdit() {
  const inp = $('#editInput'), id = S.editing; S.editing = null;
  if (!inp) { renderTodos(); return; }
  const p = parseQuick(inp.value), t = S.todos.find(x => x.id === id);
  if (!t || !p.title) { renderTodos(); return; }
  const upd = { title: p.title };
  if (p.due) { upd.due = ymd(p.due); upd.kind = 'todo'; }
  if (p.prio) upd.prio = true;
  if (p.tags.length) { const z = resolveZone(p.tags[0]); if (z) upd.tags = [z]; }
  if (upd.title !== t.title || Object.keys(upd).length > 1) patch(id, upd); else renderTodos();
}

/* ---------- keyboard ---------- */
function setView(v) { S.view = v; S.selId = null; S.editing = null; try { if (v !== 'zone') localStorage.setItem('flow.view', v); } catch (x) {} renderNav(); renderMain(); window.scrollTo(0, 0); }
function scrollSel() { const el = document.querySelector('.todo.sel'); if (el) el.scrollIntoView({ block: 'nearest' }); }
document.addEventListener('keydown', e => {
  const tag = (e.target.tagName || '').toLowerCase();
  if (e.key === 'Escape') {
    if (popEl) { closePop(); return; } if (rvEl) { closeReview(); return; } if (sheetEl) { closeDetail(); return; }
    if (!$('#help').hidden) { $('#help').hidden = true; return; } if (S.selId) { S.selId = null; renderMain(); } return;
  }
  if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable || popEl || sheetEl || rvEl) return;
  if (e.metaKey || e.altKey) return;
  if (e.ctrlKey) { if (e.key === 'z') { e.preventDefault(); doUndo(); } return; }
  const k = e.key, id = S.selId;
  const need = fn => { if (!id) { moveSel(1); renderMain(); return; } fn(); };
  const nav = d => () => { moveSel(d); renderMain(); scrollSel(); };
  const wk = n => () => { S.weekStart = n === 0 ? startOfWeek(new Date()) : addDays(S.weekStart, n); if (S.view !== 'week') setView('week'); else renderMain(); watchCal(); };
  const map = {
    n: () => addInput.focus(), '/': () => addInput.focus(),
    '1': () => setView('today'), '2': () => setView('inbox'), '3': () => setView('later'), '4': () => setView('zones'), '5': () => setView('ideas'), '6': () => setView('week'),
    j: nav(1), ArrowDown: nav(1), k: nav(-1), ArrowUp: nav(-1),
    x: () => need(() => { const t = S.todos.find(q => q.id === id); if (t && kindOf(t) !== 'inbox') toggleDone(id); }), ' ': () => need(() => toggleDone(id)),
    e: () => need(() => { S.editing = id; renderMain(); }), Enter: () => need(() => openDetail(id)), o: () => need(() => openDetail(id)),
    d: () => need(() => delItem(id)), Delete: () => need(() => delItem(id)), Backspace: () => need(() => delItem(id)),
    t: () => need(() => setDue(id, todayYmd())), m: () => need(() => setDue(id, tomorrowYmd())), a: () => need(() => setDue(id, null)),
    f: () => need(() => toggleFocus(id)),
    p: () => need(() => { const t = S.todos.find(x => x.id === id); if (t) patch(id, { prio: !t.prio }); }),
    s: () => need(() => openSchedule(id, document.querySelector(`.todo[data-id="${CSS.escape(id)}"]`))),
    r: startReview, z: doUndo, '?': () => { $('#help').hidden = false; },
    '[': wk(-7), ']': wk(7), g: wk(0)
  };
  const fn = map[k] || map[k.toLowerCase()];
  if (fn) { e.preventDefault(); fn(); }
});

/* ---------- swipe (touch) ---------- */
let sw = null, swEnded = 0;
document.addEventListener('pointerdown', e => {
  if (e.pointerType !== 'touch') return;
  const row = e.target.closest('#main .todo'); if (!row || e.target.closest('input')) return;
  sw = { row, id: row.dataset.id, x0: e.clientX, y0: e.clientY, dx: 0, active: false };
}, { passive: true });
document.addEventListener('pointermove', e => {
  if (!sw) return;
  const dx = e.clientX - sw.x0, dy = e.clientY - sw.y0;
  if (!sw.active) { if (Math.abs(dy) > 10) { sw = null; return; } if (Math.abs(dx) > 12) sw.active = true; else return; }
  sw.dx = dx; sw.row.style.transform = `translateX(${dx}px)`;
  const bg = sw.row.querySelector('.swipe-bg');
  bg.style.opacity = Math.min(1, Math.abs(dx) / 80); bg.style.background = dx > 0 ? 'var(--accent)' : 'var(--warn)';
  bg.style.transform = `translateX(${-dx}px)`; bg.style.justifyContent = dx > 0 ? 'flex-start' : 'flex-end';
  bg.children[0].style.display = dx > 0 ? '' : 'none'; bg.children[1].style.display = dx > 0 ? 'none' : '';
}, { passive: true });
const endSwipe = () => {
  if (!sw) return; const { row, id, dx, active } = sw; sw = null;
  row.style.transition = 'transform .18s'; row.style.transform = '';
  const bg = row.querySelector('.swipe-bg'); if (bg) bg.style.opacity = 0;
  setTimeout(() => { row.style.transition = ''; }, 200);
  if (!active) return;
  swEnded = Date.now();
  const t = S.todos.find(x => x.id === id); if (!t) return;
  if (dx > 80) { if (kindOf(t) === 'inbox') setDue(id, todayYmd()); else toggleDone(id); }
  else if (dx < -80) delItem(id);
};
document.addEventListener('pointerup', endSwipe);
document.addEventListener('pointercancel', endSwipe);
document.addEventListener('click', e => { if (Date.now() - swEnded < 450 && e.target.closest('#main .todo')) { e.stopPropagation(); e.preventDefault(); } }, true);

/* ---------- boot ---------- */
render();
initStore();
onNotificationTap(x => { if (x.kind === 'review') startReview(); else if (x.kind === 'task' && x.id) openDetail(x.id); });
if (isNative) {
  App.addListener('appStateChange', ({ isActive }) => { if (isActive) { scheduleSync(300); if (mcp) calendar.refresh(); renderHeader(); renderMain(); } });
  App.addListener('backButton', () => {
    if (popEl) closePop(); else if (rvEl) closeReview(); else if (sheetEl) closeDetail(); else if (!$('#help').hidden) $('#help').hidden = true;
    else if (S.capId || addInput.value) { addInput.value = ''; S.forceKind = null; closeCard(); renderPreview(); addInput.blur(); }
    else if (S.view === 'zone') setView('zones'); else if (S.view !== 'today') setView('today'); else App.minimizeApp();
  });
  if (S.settings.reviewLocal) scheduleReview(S.settings.reviewTime || '08:30');
} else if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') scheduleSync(300); });
setInterval(() => { if (document.visibilityState === 'visible') syncNow(); }, 60000);
window.addEventListener('online', () => scheduleSync(300));
setInterval(() => { renderHeader(); renderStatus(); if (!S.editing && !document.activeElement.closest?.('#main')) renderAgenda(); }, 60000);
let lastDay = todayYmd();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && todayYmd() !== lastDay) { lastDay = todayYmd(); S.weekStart = startOfWeek(new Date()); watchCal(); render(); }
});
window.addEventListener('hashchange', () => { if (location.hash === '#review' && !rvEl && S.loaded) startReview(); });
