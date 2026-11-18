// Platform layer: Google sign-in (Android native / web GIS), Google API fetch,
// Google Calendar adapter, Drive appData sync, local notifications.
import { Capacitor, registerPlugin } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { App } from '@capacitor/app';

export const isNative = Capacitor.isNativePlatform();
export { App, LocalNotifications };
const GoogleAuth = registerPlugin('GoogleAuth');
const CONFIG = window.FLOW_CONFIG || {};
export const APP_URL = CONFIG.appUrl || location.origin + location.pathname;

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/drive.appdata'
];

/* ---------------- auth ---------------- */
let token = null, tokenExp = 0, gisClient = null, gisWaiters = null;
try { const s = JSON.parse(sessionStorage.getItem('flow.tok') || 'null'); if (s && s.exp > Date.now() + 60e3) { token = s.t; tokenExp = s.exp; } } catch (e) {}
export const wasConnected = () => { try { return localStorage.getItem('flow.google') === '1'; } catch (e) { return false; } };
function remember(t, ttlMs) {
  token = t; tokenExp = Date.now() + ttlMs;
  try { localStorage.setItem('flow.google', '1'); sessionStorage.setItem('flow.tok', JSON.stringify({ t, exp: tokenExp })); } catch (e) {}
}
export function forgetGoogle() {
  const old = token; token = null; tokenExp = 0;
  try { localStorage.removeItem('flow.google'); sessionStorage.removeItem('flow.tok'); localStorage.removeItem('flow.account'); } catch (e) {}
  if (!isNative && old && window.google && google.accounts && google.accounts.oauth2) google.accounts.oauth2.revoke(old, () => {});
}
function loadGis() {
  if (window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
    s.onload = () => res(); s.onerror = () => rej(new Error('Could not load Google sign-in'));
    document.head.appendChild(s);
  });
}
async function gisToken(interactive) {
  if (!CONFIG.webClientId || CONFIG.webClientId.startsWith('PASTE')) throw Object.assign(new Error('Add your Web client ID to config.js'), { code: 'not_configured' });
  await loadGis();
  if (!gisClient) {
    gisClient = google.accounts.oauth2.initTokenClient({
      client_id: CONFIG.webClientId, scope: SCOPES.join(' '),
      callback: r => { const w = gisWaiters; gisWaiters = null; if (!w) return; if (r.error) w.rej(Object.assign(new Error(r.error), { code: 'auth_failed' })); else w.res(r); },
      error_callback: e => { const w = gisWaiters; gisWaiters = null; if (w) w.rej(Object.assign(new Error(e && e.type || 'popup'), { code: 'cancelled' })); }
    });
  }
  const r = await new Promise((res, rej) => {
    gisWaiters = { res, rej };
    gisClient.requestAccessToken({ prompt: interactive ? '' : 'none' });
    if (!interactive) setTimeout(() => { if (gisWaiters) { gisWaiters = null; rej(Object.assign(new Error('silent sign-in timed out'), { code: 'consent_required' })); } }, 8000);
  });
  remember(r.access_token, (r.expires_in || 3600) * 1000);
  return token;
}
export async function getToken(interactive = false) {
  if (token && Date.now() < tokenExp - 60e3) return token;
  if (isNative) {
    const r = await GoogleAuth.authorize({ scopes: SCOPES, interactive: !!interactive });
    remember(r.accessToken, 45 * 60e3);
    return token;
  }
  return gisToken(interactive);
}
export async function connectGoogle() { token = null; await getToken(true); return accountEmail(true); }
export async function tryQuietConnect() { if (!wasConnected()) return false; try { await getToken(false); return true; } catch (e) { return false; } }
export const signedIn = () => !!token && Date.now() < tokenExp;

/** fetch with the Google token; retries once on 401 */
export async function gfetch(url, opts = {}, retried = false) {
  let t;
  try { t = await getToken(false); }
  catch (e) { throw Object.assign(new Error('Google sign-in needed'), { code: 'needs_reauth' }); }
  let r;
  try { r = await fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: 'Bearer ' + t } }); }
  catch (e) { throw Object.assign(new Error('Network unavailable'), { code: 'server_unavailable', retryable: true }); }
  if (r.status === 401 && !retried) { token = null; return gfetch(url, opts, true); }
  if (r.status === 401) throw Object.assign(new Error('Google sign-in expired'), { code: 'needs_reauth' });
  if (r.status >= 500) throw Object.assign(new Error('Google is not answering (' + r.status + ')'), { code: 'server_unavailable', retryable: true });
  if (!r.ok && r.status !== 404) {
    let msg = 'HTTP ' + r.status; try { const j = await r.json(); msg = (j.error && (j.error.message || j.error)) || msg; } catch (e) {}
    throw Object.assign(new Error(msg), { code: 'tool_error', status: r.status });
  }
  return r;
}
export async function accountEmail(refresh) {
  try { if (!refresh) { const c = localStorage.getItem('flow.account'); if (c) return c; } } catch (e) {}
  try {
    const r = await gfetch('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)');
    const j = await r.json(); const em = j.user && j.user.emailAddress || '';
    try { localStorage.setItem('flow.account', em); } catch (e) {}
    return em;
  } catch (e) { return ''; }
}

/* ---------------- Google Calendar adapter (same shape as the old connector) ---------------- */
const CALAPI = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Rome';
const toRfc = local => new Date(local).toISOString();
function when(local, allDay) { return allDay ? { date: local.slice(0, 10) } : { dateTime: local, timeZone: TZ }; }
const watches = new Set();
export const calendar = {
  async callTool(_server, tool, input) {
    if (tool === 'list_events') {
      const q = new URLSearchParams({ timeMin: toRfc(input.startTime), timeMax: toRfc(input.endTime), singleEvents: 'true', orderBy: 'startTime', maxResults: String(input.pageSize || 250) });
      const r = await gfetch(CALAPI + '?' + q); const j = await r.json();
      return { payload: { events: j.items || [] } };
    }
    if (tool === 'create_event') {
      const body = { summary: input.summary, start: when(input.startTime, input.allDay), end: when(input.endTime, input.allDay) };
      if (input.description) body.description = input.description;
      if (input.overrideReminders) body.reminders = { useDefault: false, overrides: input.overrideReminders };
      if (input.recurrenceData) body.recurrence = input.recurrenceData;
      if (input.availability === 'AVAILABILITY_FREE') body.transparency = 'transparent';
      const r = await gfetch(CALAPI, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      return { payload: await r.json() };
    }
    if (tool === 'update_event') {
      const body = {};
      if (input.summary) body.summary = input.summary;
      if (input.startTime) body.start = when(input.startTime, input.allDay);
      if (input.endTime) body.end = when(input.endTime, input.allDay);
      const r = await gfetch(CALAPI + '/' + encodeURIComponent(input.eventId), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      return { payload: await r.json() };
    }
    if (tool === 'delete_event') {
      await gfetch(CALAPI + '/' + encodeURIComponent(input.eventId), { method: 'DELETE' });
      return { payload: { deleted: true } };
    }
    throw Object.assign(new Error('unknown tool ' + tool), { code: 'bad_request' });
  },
  watchTool(server, tool, input, handler, opts = {}) {
    const w = { run: null, timer: null, dead: false };
    w.run = async () => {
      if (w.dead) return;
      try { const r = await calendar.callTool(server, tool, input); if (!w.dead) handler({ type: 'data', result: { ...r, cache: { storedAt: Date.now(), revalidating: false } } }); }
      catch (e) { if (!w.dead) handler({ type: 'error', error: e }); }
    };
    watches.add(w); w.run();
    if (opts.refetchInterval) w.timer = setInterval(() => { if (document.visibilityState === 'visible') w.run(); }, Math.max(30000, opts.refetchInterval));
    return () => { w.dead = true; clearInterval(w.timer); watches.delete(w); };
  },
  async invalidate() { watches.forEach(w => w.run()); },
  refresh() { watches.forEach(w => w.run()); }
};

/* ---------------- Drive appData sync ---------------- */
const DRIVE = 'https://www.googleapis.com/drive/v3', UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const FILE = 'flow-data.json';
let fileId = null; try { fileId = localStorage.getItem('flow.driveFileId'); } catch (e) {}
function setFileId(id) { fileId = id; try { id ? localStorage.setItem('flow.driveFileId', id) : localStorage.removeItem('flow.driveFileId'); } catch (e) {} }
async function findFile() {
  const q = encodeURIComponent(`name='${FILE}'`);
  const r = await gfetch(`${DRIVE}/files?spaces=appDataFolder&q=${q}&fields=files(id,modifiedTime)&orderBy=modifiedTime desc`);
  const j = await r.json(); return (j.files && j.files[0] && j.files[0].id) || null;
}
export async function driveDownload() {
  if (!fileId) setFileId(await findFile());
  if (!fileId) return null;
  const r = await gfetch(`${DRIVE}/files/${fileId}?alt=media`);
  if (r.status === 404) { setFileId(null); return driveDownload(); }
  try { return await r.json(); } catch (e) { return null; }
}
export async function driveUpload(obj) {
  const data = JSON.stringify(obj);
  if (fileId) {
    const r = await gfetch(`${UPLOAD}/files/${fileId}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: data });
    if (r.status !== 404) return;
    setFileId(null);
  }
  const b = 'flow' + Math.random().toString(36).slice(2);
  const meta = { name: FILE, parents: ['appDataFolder'], mimeType: 'application/json' };
  const body = `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${b}\r\nContent-Type: application/json\r\n\r\n${data}\r\n--${b}--`;
  const r = await gfetch(`${UPLOAD}/files?uploadType=multipart&fields=id`, { method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + b }, body });
  const j = await r.json(); setFileId(j.id);
}

/* ---------------- local notifications (Android) ---------------- */
const REVIEW_ID = 1;
const nid = s => { let x = 7; for (const c of String(s)) x = (x * 31 + c.charCodeAt(0)) % 2000000000; return x + 100; };
async function notifPermission() {
  try { let p = await LocalNotifications.checkPermissions(); if (p.display !== 'granted') p = await LocalNotifications.requestPermissions(); return p.display === 'granted'; }
  catch (e) { return false; }
}
export async function scheduleReview(hhmm) {
  if (!isNative) return false;
  if (!(await notifPermission())) return false;
  const [h, m] = hhmm.split(':').map(Number);
  await LocalNotifications.cancel({ notifications: [{ id: REVIEW_ID }] }).catch(() => {});
  await LocalNotifications.schedule({ notifications: [{ id: REVIEW_ID, title: '☀ Morning review', body: 'Two minutes to plan your day', smallIcon: 'ic_stat_flow',
    schedule: { on: { hour: h, minute: m }, repeats: true, allowWhileIdle: true }, extra: { kind: 'review' } }] });
  return true;
}
export async function cancelReview() { if (isNative) await LocalNotifications.cancel({ notifications: [{ id: REVIEW_ID }] }).catch(() => {}); }
export async function scheduleTaskReminder(id, title, date) {
  if (!isNative) return false;
  if (!(await notifPermission())) return false;
  await LocalNotifications.schedule({ notifications: [{ id: nid(id), title: '⏰ ' + title, body: 'Reminder from Flow', smallIcon: 'ic_stat_flow',
    schedule: { at: date, allowWhileIdle: true }, extra: { kind: 'task', id } }] });
  return true;
}
export function onNotificationTap(fn) {
  if (!isNative) return;
  LocalNotifications.addListener('localNotificationActionPerformed', ev => fn((ev && ev.notification && ev.notification.extra) || {}));
}
