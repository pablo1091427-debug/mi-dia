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
  chat: [],           // {role, content}
  settings: {
    theme: 'auto',
    googleClientId: '',
    googleConnected: false,
    anthropicKey: '',
    model: 'claude-opus-5-5',
  },
});

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    const parsed = JSON.parse(raw);
    const base = defaults();
    return { ...base, ...parsed, settings: { ...base.settings, ...(parsed.settings || {}) } };
  } catch {
    return defaults();
  }
}

let data = load();
const listeners = new Set();

export const db = () => data;

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch (e) {
    console.error('No se pudo guardar', e);
  }
  listeners.forEach((fn) => fn(data));
}

export function update(fn) {
  fn(data);
  save();
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function exportJSON() {
  return JSON.stringify({ app: 'mi-dia', version: 1, exported: new Date().toISOString(), data }, null, 2);
}

export function importJSON(text) {
  const parsed = JSON.parse(text);
  const incoming = parsed.data || parsed;
  if (typeof incoming !== 'object' || !incoming.settings) throw new Error('El archivo no es una copia de Mi Día');
  const base = defaults();
  data = { ...base, ...incoming, settings: { ...base.settings, ...incoming.settings } };
  save();
}

export function resetAll() {
  data = defaults();
  save();
}
