// Integración con Google Calendar (OAuth en el navegador con Google Identity Services).
import { db, update } from './store.js';
import { loadScript, dkey, addDays, pad } from './utils.js';

const GSI = 'https://accounts.google.com/gsi/client';
const SCOPE_CAL = 'https://www.googleapis.com/auth/calendar.events';
const SCOPE_DRIVE = 'https://www.googleapis.com/auth/drive.file'; // solo los archivos que crea la app
const SCOPE = `${SCOPE_CAL} ${SCOPE_DRIVE}`;
const BACKUP_NAME = 'mi-dia-copia.json';
const API = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const TOKEN_KEY = 'midia-gtoken';
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

const cache = new Map(); // 'AAAA-MM' -> eventos

function token() {
  try {
    const t = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null');
    if (t && t.exp > Date.now() + 60_000) return t.token;
  } catch {}
  return null;
}

export const isConfigured = () => !!db().settings.googleClientId;
export const isConnected = () => db().settings.googleConnected;
export const hasToken = () => !!token();
export const isReady = () => isConnected() && hasToken();
// true/false si hay sesión; null si no se sabe
export function hasDrive() {
  try {
    const t = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null');
    return t ? !!t.drive : null;
  } catch {
    return null;
  }
}

// Cargar la librería de Google antes de que el usuario pulse "Conectar"
// (la ventana de acceso tiene que abrirse directamente desde el toque).
export function preload() {
  if (isConfigured()) loadScript(GSI).catch(() => {});
}

export function connect() {
  const clientId = db().settings.googleClientId.trim();
  if (!clientId) return Promise.reject(new Error('Falta el ID de cliente de Google (Ajustes)'));
  if (!window.google?.accounts?.oauth2) {
    preload();
    return Promise.reject(new Error('Cargando Google… vuelve a pulsar en un segundo'));
  }
  return new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (resp) => {
        if (resp.error) return reject(new Error(resp.error_description || resp.error));
        localStorage.setItem(TOKEN_KEY, JSON.stringify({
          token: resp.access_token, exp: Date.now() + resp.expires_in * 1000,
          drive: google.accounts.oauth2.hasGrantedAllScopes(resp, SCOPE_DRIVE),
        }));
        cache.clear();
        update((d) => (d.settings.googleConnected = true));
        resolve();
      },
      error_callback: (e) => reject(new Error(e?.type === 'popup_closed' ? 'Ventana cerrada' : e?.message || 'No se pudo conectar')),
    });
    // Si falta algún permiso nuevo (p. ej. Drive), volver a pedir consentimiento
    client.requestAccessToken({ prompt: isConnected() && hasDrive() !== false ? '' : 'consent' });
  });
}

export function disconnect() {
  const t = token();
  if (t && window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(t, () => {});
  localStorage.removeItem(TOKEN_KEY);
  cache.clear();
  update((d) => (d.settings.googleConnected = false));
}

async function api(url, opts = {}) {
  const t = token();
  if (!t) throw Object.assign(new Error('Sesión de Google caducada'), { code: 'auth' });
  const res = await fetch(url, { ...opts, headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  if (res.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    throw Object.assign(new Error('Sesión de Google caducada'), { code: 'auth' });
  }
  if (!res.ok) throw new Error(`Google Calendar respondió ${res.status}`);
  return res.status === 204 ? null : res.json();
}

function normalize(ev) {
  const allDay = !!ev.start.date;
  const s = allDay ? null : new Date(ev.start.dateTime);
  const e = allDay ? null : new Date(ev.end.dateTime);
  return {
    id: ev.id,
    title: ev.summary || '(Sin título)',
    date: allDay ? ev.start.date : dkey(s),
    start: allDay ? '' : `${pad(s.getHours())}:${pad(s.getMinutes())}`,
    end: allDay ? '' : `${pad(e.getHours())}:${pad(e.getMinutes())}`,
    allDay,
    notes: ev.description || '',
    link: ev.htmlLink,
    source: 'google',
  };
}

// Eventos de un mes (year, month 0-11). Usa caché salvo force.
export async function monthEvents(year, month, { force = false } = {}) {
  const k = `${year}-${month}`;
  if (!force && cache.has(k)) return cache.get(k);
  const min = new Date(year, month, 1);
  const max = new Date(year, month + 1, 1);
  const params = new URLSearchParams({
    timeMin: min.toISOString(), timeMax: max.toISOString(),
    singleEvents: 'true', orderBy: 'startTime', maxResults: '250',
  });
  const json = await api(`${API}?${params}`);
  const list = (json.items || []).filter((e) => e.status !== 'cancelled').map(normalize);
  cache.set(k, list);
  return list;
}

// reminderMinutes: null = avisos por defecto de tu calendario; número = aviso en el móvil X minutos antes
export async function createEvent({ title, date, start, end, allDay, notes, reminderMinutes = null, durationMin = 60 }) {
  let body;
  if (allDay) {
    body = { start: { date }, end: { date: dkey(addDays(new Date(date + 'T00:00'), 1)) } };
  } else {
    const s = new Date(`${date}T${start}`);
    let e = end ? new Date(`${date}T${end}`) : null;
    if (!e || e <= s) e = new Date(s.getTime() + durationMin * 60 * 1000);
    body = { start: { dateTime: s.toISOString(), timeZone: TZ }, end: { dateTime: e.toISOString(), timeZone: TZ } };
  }
  body.summary = title;
  if (notes) body.description = notes;
  if (reminderMinutes !== null && reminderMinutes !== '' && reminderMinutes !== undefined) {
    body.reminders = { useDefault: false, overrides: [{ method: 'popup', minutes: Number(reminderMinutes) }] };
  }
  const created = await api(API, { method: 'POST', body: JSON.stringify(body) });
  cache.clear();
  return created?.id;
}

export async function deleteEvent(id) {
  await api(`${API}/${encodeURIComponent(id)}`, { method: 'DELETE' });
  cache.clear();
}

// ---------- Copia de seguridad en Google Drive ----------
async function driveFetch(url, opts = {}) {
  const t = token();
  if (!t) throw Object.assign(new Error('Sesión de Google caducada'), { code: 'auth' });
  const res = await fetch(url, { ...opts, headers: { Authorization: `Bearer ${t}`, ...(opts.headers || {}) } });
  if (res.status === 401 || res.status === 403) throw Object.assign(new Error('Falta permiso de Google Drive: pulsa «Reconectar» en Ajustes'), { code: 'auth' });
  return res;
}

export async function driveFindBackup() {
  const q = encodeURIComponent(`name='${BACKUP_NAME}' and trashed=false`);
  const res = await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=modifiedTime desc&fields=files(id,modifiedTime)`);
  if (!res.ok) throw new Error(`Google Drive respondió ${res.status}`);
  return (await res.json()).files?.[0] || null;
}

// Sube la copia. Devuelve el id del archivo en Drive.
export async function driveSaveBackup(json, fileId) {
  if (fileId) {
    const res = await driveFetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: json,
    });
    if (res.ok) return fileId;
    if (res.status !== 404) throw new Error(`Google Drive respondió ${res.status}`);
  }
  const boundary = 'midia' + Date.now();
  const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: BACKUP_NAME, mimeType: 'application/json' })}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${json}\r\n--${boundary}--`;
  const res = await driveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body,
  });
  if (!res.ok) throw new Error(`Google Drive respondió ${res.status}`);
  return (await res.json()).id;
}

export async function driveLoadBackup(fileId) {
  const res = await driveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
  if (!res.ok) throw new Error(`Google Drive respondió ${res.status}`);
  return res.text();
}
