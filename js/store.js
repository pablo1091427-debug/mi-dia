// Almacenamiento local: todos los datos viven en el móvil (localStorage).
const KEY = 'midia-data-v1';

const defaults = () => ({
  notes: [],          // {id, title, body, color, pinned, updated}
  events: [],         // eventos locales {id, title, date, start, end, allDay, notes}
  sport: {},          // {'2026-10-08': {type, min}}
  sportGoal: 3,       // días por semana
  habits: [],         // {id, name, emoji}
  habitLog: {},       // {'2026-10-08': [habitId, ...]}
  expenses: [],       // {id, amount, concept, cat, date}
  subs: [],           // suscripciones {id, name, amount, day}
  shopping: [],       // {id, text, cat, done}
  birthdays: [],      // {id, name, day, month, year}
  places: [],         // {id, name, note, lat, lon, cat}
  reminders: [],      // {id, text, date, time, done, notified, googleId}
  // Finanzas
  incomes: [],        // {id, amount, concept, cat, date}
  fixedIncomes: [],   // ingresos fijos mensuales {id, name, amount, day}
  budgets: {},        // {categoria: límite mensual}
  goals: [],          // metas de ahorro {id, name, target, saved, deadline, emoji}
  // Organización
  tasks: [],          // {id, text, project, priority (1 alta-3 baja), due, done, doneAt}
  deadlines: [],      // vencimientos {id, name, date, cat, noticeDays, yearly, notes, googleId}
  trips: [],          // {id, dest, lat, lon, from, to, plan: {fecha: texto}, bookings: [], packing: [{id,text,done}], notes}
  // Salud
  gymRoutines: [],    // {id, name, exercises: [nombre]}
  gymSessions: [],    // {id, date, routineId, sets: [{ex, reps, kg}]}
  weights: [],        // {date, kg, waist}
  sleep: {},          // {'AAAA-MM-DD': horas}
  // Ocio
  media: [],          // {id, type: peli|serie|libro, title, status: pendiente|en curso|terminado, rating, notes, updated}
  recipes: [],        // recetas guardadas {id, title, time, ingredients[], steps[]}
  // v4
  reports: [],        // informes mensuales {ym, stats, text, created}
  splitGroups: [],    // gastos compartidos {id, name, members[], expenses: [{id, desc, amount, payer, among[], date}]}
  voiceNotes: [],     // {id, date, title, transcript, summary, actions[]}
  car: { fuel: [], service: [] }, // repostajes {id,date,km,liters,price,full} · mantenimiento {id,date,km,what,cost}
  cares: [],          // cuidados recurrentes {id, subject, emoji, what, everyDays, last}
  diary: {},          // {'AAAA-MM-DD': {text, mood 1-5}}
  challenges: [],     // retos {id, emoji, name, type: daily|amount, target, unit, strict, start, log: {fecha: true}, entries: [{date, value}], done}
  vault: [],          // datos útiles {id, cat, title, fields: [{k, v}]} (protegidos con huella)
  shoppingDeleted: {},// borrados de la compra para sincronizar {id: marca de tiempo}
  modifiedAt: 0,      // última modificación local (para sincronizar)
  chat: [],           // {role, content, actions}
  settings: {
    theme: 'auto',
    googleClientId: '',
    googleConnected: false,
    anthropicKey: '',
    model: 'claude-opus-5-5',
    interests: '',      // para los planes del finde
    lock: false,        // bloqueo con huella
    lockCredId: '',
    driveBackup: false,
    driveFileId: '',
    lastDriveBackup: 0,
    // Sincronización (Supabase)
    syncUrl: '',
    syncKey: '',
    syncCode: '',       // espacio personal: todos tus dispositivos
    syncPulledAt: 0,
    shareCode: '',      // lista de la compra compartida (p. ej. con tu pareja)
    lastReport: '',
    vaultSync: false,   // incluir «Datos útiles» en copias y sincronización     // último mes con informe generado (AAAA-MM)
  },
});

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    const parsed = JSON.parse(raw);
    delete parsed.water; // el registro de agua se eliminó en la v5
    const base = defaults();
    return { ...base, ...parsed, settings: { ...base.settings, ...(parsed.settings || {}) } };
  } catch {
    return defaults();
  }
}

let data = load();
const listeners = new Set();

export const db = () => data;

// fromSync: los datos vienen de otro dispositivo; no marcar como modificación local
export function save({ fromSync = false } = {}) {
  if (!fromSync) data.modifiedAt = Date.now();
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch (e) {
    console.error('No se pudo guardar', e);
  }
  listeners.forEach((fn) => fn(data));
}

export function update(fn, opts) {
  fn(data);
  save(opts);
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Ajustes propios de este móvil que no viajan en las copias de seguridad
const DEVICE_ONLY = ['anthropicKey', 'lock', 'lockCredId', 'googleConnected', 'syncUrl', 'syncKey', 'syncCode', 'syncPulledAt', 'shareCode', 'theme'];

export function exportJSON() {
  const settings = { ...data.settings };
  DEVICE_ONLY.forEach((k) => delete settings[k]);
  const out = { ...data, settings };
  if (!data.settings.vaultSync) delete out.vault; // los datos útiles no salen del móvil salvo que lo actives
  return JSON.stringify({ app: 'mi-dia', version: 3, exported: new Date().toISOString(), data: out });
}

export function importJSON(text, { fromSync = false } = {}) {
  const parsed = typeof text === 'string' ? JSON.parse(text) : text;
  const incoming = parsed.data || parsed;
  if (typeof incoming !== 'object' || !incoming.settings) throw new Error('El archivo no es una copia de Mi Día');
  const base = defaults();
  const keep = Object.fromEntries(DEVICE_ONLY.map((k) => [k, data.settings[k]]));
  const localVault = data.vault;
  data = { ...base, ...incoming, settings: { ...base.settings, ...incoming.settings, ...keep } };
  if (!incoming.vault || !data.settings.vaultSync) data.vault = localVault || [];
  save({ fromSync });
}

export function resetAll() {
  data = defaults();
  save();
}
