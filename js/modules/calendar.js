import { db, update } from '../store.js';
import { esc, dkey, parseKey, uid, MESES, DIAS_CORTOS, fmtLong, cap, toast, sheet, confirmSheet, weekStart, addDays } from '../utils.js';
import * as G from '../google.js';
import { SPORT_TYPES } from './sport.js';

let viewYear = new Date().getFullYear();
let viewMonth = new Date().getMonth();
let selected = dkey();

// Todo lo que ocurre un día concreto: eventos locales, de Google, cumpleaños y deporte.
export function itemsForDay(key, googleEvents = []) {
  const d = db();
  const date = parseKey(key);
  const items = [];
  d.events.filter((e) => e.date === key).forEach((e) => items.push({ ...e, source: 'local' }));
  googleEvents.filter((e) => e.date === key).forEach((e) => items.push(e));
  d.birthdays
    .filter((b) => b.day === date.getDate() && b.month === date.getMonth() + 1)
    .forEach((b) => items.push({ id: b.id, title: `🎂 Cumpleaños de ${b.name}${b.year ? ` (${date.getFullYear() - b.year})` : ''}`, allDay: true, source: 'bday' }));
  // Recordatorios que no están ya en Google (esos llegan como evento de Google)
  (d.reminders || [])
    .filter((r) => r.date === key && !r.done && !r.googleId)
    .forEach((r) => items.push({ id: r.id, title: `⏰ ${r.text}`, start: r.time, allDay: false, source: 'reminder' }));
  const sp = d.sport[key];
  if (sp) {
    const t = SPORT_TYPES.find((x) => x.id === sp.type) || SPORT_TYPES.at(-1);
    items.push({ id: 'sport-' + key, title: `${t.e} ${t.name}${sp.min ? ` · ${sp.min} min` : ''}`, allDay: true, source: 'sport' });
  }
  return items.sort((a, b) => (a.allDay === b.allDay ? (a.start || '').localeCompare(b.start || '') : a.allDay ? -1 : 1));
}

export function renderItems(items) {
  if (!items.length) return '<div class="empty small">Nada planificado</div>';
  return items
    .map(
      (e, i) => `
    <div class="event-item" data-i="${i}" style="cursor:pointer">
      <div class="event-time">${e.allDay ? 'Todo el día' : esc(e.start)}${!e.allDay && e.end ? `<br><span class="muted" style="font-weight:400">${esc(e.end)}</span>` : ''}</div>
      <div class="event-bar ${e.source}"></div>
      <div class="grow"><div class="ellipsis" style="font-weight:600">${esc(e.title)}</div>
        ${e.notes ? `<div class="small muted ellipsis">${esc(e.notes)}</div>` : ''}
        ${e.source === 'google' ? '<div class="small muted">Google Calendar</div>' : ''}</div>
    </div>`,
    )
    .join('');
}

export function bindItems(container, items, onChange) {
  container.querySelectorAll('.event-item').forEach((el) => {
    el.onclick = () => openEventDetail(items[+el.dataset.i], onChange);
  });
}

function openEventDetail(ev, onChange) {
  if (ev.source === 'bday') return location.assign('#/cumples');
  if (ev.source === 'sport') return location.assign('#/deporte');
  if (ev.source === 'reminder') return location.assign('#/recordatorios');
  const s = sheet({
    title: ev.title,
    body: `
      <p class="muted">${cap(fmtLong(parseKey(ev.date)))} · ${ev.allDay ? 'Todo el día' : `${esc(ev.start)}${ev.end ? ' – ' + esc(ev.end) : ''}`}</p>
      ${ev.notes ? `<p style="white-space:pre-wrap">${esc(ev.notes)}</p>` : ''}
      <p class="small muted">${ev.source === 'google' ? 'Guardado en Google Calendar' : 'Guardado en esta app'}</p>
      <div class="row">
        ${ev.link ? `<a class="btn grow" href="${esc(ev.link)}" target="_blank" rel="noopener">Abrir en Google</a>` : ''}
        <button class="btn danger grow" data-del>Eliminar</button>
      </div>`,
  });
  s.el.querySelector('[data-del]').onclick = async () => {
    if (!(await confirmSheet('Se eliminará este evento.'))) return;
    try {
      if (ev.source === 'google') await G.deleteEvent(ev.id);
      else update((d) => (d.events = d.events.filter((x) => x.id !== ev.id)));
      s.close();
      toast('Evento eliminado');
      onChange?.();
    } catch (e) {
      toast(e.message);
    }
  };
}

export function openEventSheet(date = dkey(), onSaved) {
  const toGoogle = G.isReady();
  const s = sheet({
    title: 'Nuevo evento',
    body: `
      <form>
        <label class="field"><span>Título</span><input class="input" name="title" required placeholder="Cena con amigos"></label>
        <label class="field"><span>Fecha</span><input class="input" type="date" name="date" value="${date}" required></label>
        <label class="check"><input type="checkbox" name="allDay"> Todo el día</label>
        <div class="row times">
          <label class="field grow"><span>Empieza</span><input class="input" type="time" name="start" value="10:00"></label>
          <label class="field grow"><span>Termina</span><input class="input" type="time" name="end" value="11:00"></label>
        </div>
        <label class="field"><span>Notas</span><input class="input" name="notes" placeholder="Opcional"></label>
        ${toGoogle ? `<label class="field"><span>🔔 Aviso en el móvil</span><select class="input" name="reminder">
          <option value="">Avisos por defecto de mi calendario</option><option value="0">A la hora del evento</option>
          <option value="10">10 minutos antes</option><option value="30">30 minutos antes</option><option value="60">1 hora antes</option>
          <option value="1440">1 día antes</option></select></label>` : ''}
        <p class="small muted">${toGoogle ? '📅 Se guardará en tu Google Calendar.' : G.isConnected() ? '⚠️ La sesión de Google ha caducado: se guardará solo en la app. Pulsa «Reconectar Google» en Calendario para guardarlo allí.' : 'Se guardará en la app. Conecta Google Calendar en Ajustes para sincronizar.'}</p>
        <button class="btn primary block">Guardar</button>
      </form>`,
  });
  const f = s.el.querySelector('form');
  f.allDay.onchange = () => (s.el.querySelector('.times').style.display = f.allDay.checked ? 'none' : '');
  f.onsubmit = async (e) => {
    e.preventDefault();
    const ev = {
      title: f.title.value.trim(), date: f.date.value, allDay: f.allDay.checked,
      start: f.allDay.checked ? '' : f.start.value, end: f.allDay.checked ? '' : f.end.value, notes: f.notes.value.trim(),
    };
    if (!ev.title || !ev.date) return;
    const btn = f.querySelector('button');
    btn.disabled = true;
    try {
      if (toGoogle) await G.createEvent({ ...ev, reminderMinutes: f.reminder.value === '' ? null : +f.reminder.value });
      else update((d) => d.events.push({ id: uid(), ...ev }));
      s.close();
      toast(toGoogle ? 'Evento creado en Google Calendar' : 'Evento guardado');
      onSaved?.(ev);
    } catch (err) {
      btn.disabled = false;
      toast(err.message);
    }
  };
}

export default {
  title: 'Calendario',
  render(view) {
    let gEvents = [];
    let gError = '';
    G.preload();

    view.innerHTML = `
      <div id="g-banner"></div>
      <div class="card">
        <div class="month-head">
          <button class="icon-btn" data-nav="-1" aria-label="Mes anterior">‹</button>
          <h2 id="month-title"></h2>
          <button class="btn small" data-today>Hoy</button>
          <button class="icon-btn" data-nav="1" aria-label="Mes siguiente">›</button>
        </div>
        <div class="cal-grid" id="grid"></div>
      </div>
      <div class="section-title" id="day-title"></div>
      <div class="card" id="day-list"></div>
      <button class="fab" aria-label="Nuevo evento">+</button>`;

    const banner = () => {
      const el = view.querySelector('#g-banner');
      if (!G.isConfigured() || !G.isConnected()) {
        el.innerHTML = `<div class="card small row"><span class="grow muted">Conecta tu Google Calendar para ver y crear eventos allí.</span><a class="btn small" href="#/ajustes">Conectar</a></div>`;
      } else if (!G.hasToken()) {
        el.innerHTML = `<div class="card small row"><span class="grow">🔄 La sesión de Google ha caducado.</span><button class="btn small primary" data-reconnect>Reconectar Google</button></div>`;
        el.querySelector('[data-reconnect]').onclick = () =>
          G.connect().then(() => { toast('Google conectado'); loadGoogle(true); banner(); }).catch((e) => toast(e.message));
      } else {
        el.innerHTML = gError ? `<div class="card small">⚠️ ${esc(gError)}</div>` : '';
      }
    };

    const drawGrid = () => {
      const d = db();
      view.querySelector('#month-title').textContent = `${MESES[viewMonth]} ${viewYear}`;
      const first = new Date(viewYear, viewMonth, 1);
      const start = weekStart(first);
      const today = dkey();
      let html = DIAS_CORTOS.map((x) => `<div class="cal-dow">${x}</div>`).join('');
      for (let i = 0; i < 42; i++) {
        const day = addDays(start, i);
        if (i >= 35 && day.getMonth() !== viewMonth) break;
        const k = dkey(day);
        const dots = [];
        if (d.events.some((e) => e.date === k)) dots.push('');
        if (gEvents.some((e) => e.date === k)) dots.push('google');
        if (d.birthdays.some((b) => b.day === day.getDate() && b.month === day.getMonth() + 1)) dots.push('bday');
        if (d.sport[k]) dots.push('sport');
        html += `<button class="cal-day ${day.getMonth() !== viewMonth ? 'other' : ''} ${k === today ? 'today' : ''} ${k === selected ? 'selected' : ''}" data-k="${k}">
          <span class="n">${day.getDate()}</span><span class="dots">${dots.map((c) => `<i class="dot ${c}"></i>`).join('')}</span></button>`;
      }
      const grid = view.querySelector('#grid');
      grid.innerHTML = html;
      grid.querySelectorAll('.cal-day').forEach((b) => {
        b.onclick = () => {
          selected = b.dataset.k;
          const sd = parseKey(selected);
          if (sd.getMonth() !== viewMonth) {
            viewMonth = sd.getMonth();
            viewYear = sd.getFullYear();
            loadGoogle();
          }
          drawGrid();
          drawDay();
        };
      });
    };

    const drawDay = () => {
      view.querySelector('#day-title').textContent = cap(fmtLong(parseKey(selected)));
      const items = itemsForDay(selected, gEvents);
      const list = view.querySelector('#day-list');
      list.innerHTML = renderItems(items);
      bindItems(list, items, () => loadGoogle(true));
    };

    const loadGoogle = async (force = false) => {
      if (!G.isReady()) {
        gEvents = [];
        drawGrid();
        drawDay();
        return;
      }
      try {
        gEvents = await G.monthEvents(viewYear, viewMonth, { force });
        gError = '';
      } catch (e) {
        gError = e.code === 'auth' ? '' : e.message;
      }
      banner();
      drawGrid();
      drawDay();
    };

    view.querySelectorAll('[data-nav]').forEach((b) => {
      b.onclick = () => {
        viewMonth += +b.dataset.nav;
        if (viewMonth < 0) { viewMonth = 11; viewYear--; }
        if (viewMonth > 11) { viewMonth = 0; viewYear++; }
        drawGrid();
        loadGoogle();
      };
    });
    view.querySelector('[data-today]').onclick = () => {
      const t = new Date();
      viewYear = t.getFullYear();
      viewMonth = t.getMonth();
      selected = dkey(t);
      loadGoogle();
    };
    view.querySelector('.fab').onclick = () => openEventSheet(selected, () => loadGoogle(true));

    banner();
    drawGrid();
    drawDay();
    loadGoogle();
  },
};
