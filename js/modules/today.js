// Modo Hoy: una pantalla limpia, a pantalla completa, solo con lo que toca ahora.
import { db } from '../store.js';
import { esc, dkey, fmtLong, cap } from '../utils.js';
import * as G from '../google.js';
import { itemsForDay } from './calendar.js';
import { pendingReminders, setDone } from './reminders.js';
import { openTasks } from './tasks.js';
import { isDone, toggleHabit } from './habits.js';
import { dueCares, markCare } from './cares.js';
import { cachedWeather, wInfo } from './weather.js';

const hhmm = () => new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

export default {
  title: 'Hoy',
  focus: true, // sin barras de navegación
  render(view, { rerender }) {
    const d = db();
    const today = dkey();
    let gEvents = [];
    const draw = () => {
      const now = hhmm();
      const items = itemsForDay(today, gEvents).filter((e) => !e.allDay);
      const allDay = itemsForDay(today, gEvents).filter((e) => e.allDay);
      const next = items.filter((e) => (e.end || e.start) >= now);
      const rems = pendingReminders().filter((r) => r.date <= today);
      const tasks = openTasks().filter((t) => !t.due || t.due <= today).slice(0, 6);
      const cares = dueCares();
      const w = cachedWeather();
      view.innerHTML = `
        <div class="row" style="margin:4px 0 14px">
          <div class="grow"><div style="font-size:56px;font-weight:800;line-height:1">${now}</div><div class="muted">${cap(fmtLong(new Date()))}</div></div>
          ${w ? `<div style="text-align:right"><div style="font-size:40px">${wInfo(w.w.current.weather_code, w.w.current.is_day).e}</div><b>${Math.round(w.w.current.temperature_2m)}°</b></div>` : ''}
          <a class="icon-btn" href="#/inicio" aria-label="Salir del modo Hoy" style="text-decoration:none;align-self:flex-start">✕</a>
        </div>
        ${next.length ? `<div class="card" style="border-left:6px solid var(--accent)"><div class="stat-label">${next[0].start <= now ? 'AHORA' : 'SIGUIENTE'} · ${esc(next[0].start)}${next[0].end ? '–' + esc(next[0].end) : ''}</div><div style="font-size:22px;font-weight:800">${esc(next[0].title)}</div>
          ${next.slice(1, 4).map((e) => `<div class="small muted" style="margin-top:4px">${esc(e.start)} · ${esc(e.title)}</div>`).join('')}</div>`
          : `<div class="card"><div class="muted">No te queda nada en la agenda hoy 🎉</div></div>`}
        ${allDay.length ? `<div class="chips" style="flex-wrap:wrap;margin-bottom:12px">${allDay.map((e) => `<span class="chip">${esc(e.title)}</span>`).join('')}</div>` : ''}
        ${rems.length || tasks.length || cares.length ? `<div class="card"><h2>Por hacer</h2><ul class="list">
          ${rems.map((r) => `<li><input type="checkbox" data-rem="${r.id}" style="width:24px;height:24px;flex:none"><span class="grow" style="font-size:17px">⏰ ${esc(r.text)} <span class="small muted">${r.time}</span></span></li>`).join('')}
          ${cares.map((c) => `<li><input type="checkbox" data-care="${c.id}" style="width:24px;height:24px;flex:none"><span class="grow" style="font-size:17px">${esc(c.emoji)} ${esc(c.what)} <span class="small muted">${esc(c.subject)}</span></span></li>`).join('')}
          ${tasks.map((t) => `<li><span style="width:24px;text-align:center">✔️</span><a class="grow" href="#/tareas" style="font-size:17px;color:inherit;text-decoration:none">${esc(t.text)}</a></li>`).join('')}
        </ul></div>` : ''}
        ${d.habits.length ? `<div class="chips" style="flex-wrap:wrap;margin-bottom:12px">${d.habits.map((h) => `<button class="chip ${isDone(h.id) ? 'active' : ''}" data-h="${h.id}" style="font-size:15px;padding:10px 16px">${isDone(h.id) ? '✓' : esc(h.emoji)} ${esc(h.name)}</button>`).join('')}</div>` : ''}`;
      view.querySelectorAll('[data-rem]').forEach((c) => (c.onchange = () => { setDone(c.dataset.rem); draw(); }));
      view.querySelectorAll('[data-care]').forEach((c) => (c.onchange = () => { markCare(c.dataset.care); draw(); }));
      view.querySelectorAll('[data-h]').forEach((b) => (b.onclick = () => { toggleHabit(b.dataset.h); draw(); }));
    };
    draw();
    if (G.isReady()) {
      const n = new Date();
      G.monthEvents(n.getFullYear(), n.getMonth()).then((ev) => { gEvents = ev; draw(); }).catch(() => {});
    }
    // Mantener la pantalla encendida y actualizar la hora
    let lock = null;
    navigator.wakeLock?.request('screen').then((l) => (lock = l)).catch(() => {});
    const timer = setInterval(draw, 30_000);
    return () => { clearInterval(timer); lock?.release().catch(() => {}); };
  },
};
