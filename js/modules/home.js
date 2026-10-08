import { db } from '../store.js';
import { esc, dkey, fmtLong, cap, fmtMoney } from '../utils.js';
import * as G from '../google.js';
import { itemsForDay, renderItems, bindItems, openEventSheet } from './calendar.js';
import { sportStats, sportType, openSportSheet } from './sport.js';
import { openNoteEditor, sortedNotes } from './notes.js';
import { openExpenseSheet, monthTotal } from './expenses.js';
import { isDone, toggleHabit } from './habits.js';
import { upcomingBirthdays, whenLabel } from './birthdays.js';
import { pendingCount } from './shopping.js';
import { fetchWeather, wInfo } from './weather.js';
import { pendingReminders, isOverdue, setDone, whenLabel as remWhen, openReminderSheet } from './reminders.js';

function greeting() {
  const h = new Date().getHours();
  return h < 6 ? 'Buenas noches' : h < 13 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches';
}

export default {
  title: 'Mi Día',
  render(view, { rerender }) {
    const d = db();
    const today = dkey();
    const st = sportStats();
    const nextBd = upcomingBirthdays()[0];
    const notes = sortedNotes().slice(0, 3);
    const shop = pendingCount();
    // Recordatorios vencidos o de hoy/mañana
    const limit = dkey(new Date(Date.now() + 86400000));
    const rems = pendingReminders().filter((r) => r.date <= limit).slice(0, 5);

    view.innerHTML = `
      <div style="margin:2px 4px 14px">
        <div style="font-size:24px;font-weight:800">${greeting()} 👋</div>
        <div class="muted">${cap(fmtLong(new Date()))}</div>
      </div>

      <a class="card row" href="#/tiempo" id="w-card" style="text-decoration:none;color:inherit">
        <span class="muted small">🌤️ Cargando el tiempo…</span>
      </a>

      <div class="card">
        <h2>📅 Hoy <a class="link" href="#/calendario">Ver calendario</a></h2>
        <div id="today-list"></div>
        <button class="btn small block" data-addevent style="margin-top:8px">+ Evento</button>
      </div>

      <div class="card">
        <h2>⏰ Recordatorios <a class="link" href="#/recordatorios">Ver todos</a></h2>
        ${rems.length ? `<ul class="list">${rems.map((r) => `
          <li><input type="checkbox" data-rem="${r.id}" style="width:22px;height:22px;accent-color:var(--accent)" aria-label="Hecho">
            <div class="grow"><div class="ellipsis">${esc(r.text)}</div>
            <div class="small" style="color:${isOverdue(r) ? 'var(--danger)' : 'var(--muted)'}">${remWhen(r)}</div></div></li>`).join('')}</ul>`
          : '<div class="muted small">Nada pendiente para hoy ni mañana.</div>'}
        <button class="btn small block" data-addrem style="margin-top:8px">+ Recordatorio</button>
      </div>

      <div class="card">
        <h2>🏋️ Deporte <a class="link" href="#/deporte">Ver más</a></h2>
        <div class="row">
          <div class="grow"><div class="stat">🔥 ${st.streak}</div><div class="stat-label">días de racha · ${st.week}/${st.goal} esta semana</div></div>
          <button class="btn ${st.doneToday ? '' : 'primary'}" data-sport>${st.doneToday ? sportType(d.sport[today].type).e + ' Hecho' : '💪 Entrené hoy'}</button>
        </div>
        <div class="progress ${st.week >= st.goal ? 'ok' : ''}" style="margin-top:10px"><div style="width:${Math.min(100, (st.week / st.goal) * 100)}%"></div></div>
      </div>

      ${d.habits.length ? `
      <div class="card">
        <h2>✅ Hábitos de hoy <a class="link" href="#/habitos">Ver</a></h2>
        <div class="chips" style="flex-wrap:wrap">${d.habits.map((h) => `<button class="chip ${isDone(h.id) ? 'active' : ''}" data-h="${h.id}">${isDone(h.id) ? '✓' : esc(h.emoji)} ${esc(h.name)}</button>`).join('')}</div>
      </div>` : ''}

      <div class="grid-2">
        <a class="card" href="#/gastos" style="text-decoration:none;color:inherit"><div class="stat-label">💶 Gastado este mes</div><div class="stat" style="font-size:20px">${fmtMoney(monthTotal())}</div></a>
        <a class="card" href="#/compra" style="text-decoration:none;color:inherit"><div class="stat-label">🛒 Lista de la compra</div><div class="stat" style="font-size:20px">${shop} ${shop === 1 ? 'cosa' : 'cosas'}</div></a>
      </div>

      ${nextBd && nextBd.days <= 30 ? `
      <a class="card row" href="#/cumples" style="text-decoration:none;color:inherit;margin-top:12px">
        <span style="font-size:26px">🎂</span><div class="grow"><b>${esc(nextBd.name)}</b>${nextBd.age ? ` cumple ${nextBd.age}` : ''}</div><span class="badge">${whenLabel(nextBd.days)}</span>
      </a>` : ''}

      <div class="card" style="margin-top:12px">
        <h2>📝 Notas recientes <a class="link" href="#/notas">Ver todas</a></h2>
        ${notes.length ? `<ul class="list">${notes.map((n) => `<li data-note="${n.id}" style="cursor:pointer"><div class="grow"><div class="ellipsis" style="font-weight:600">${n.pinned ? '📌 ' : ''}${esc(n.title || 'Sin título')}</div><div class="small muted ellipsis">${esc(n.body)}</div></div></li>`).join('')}</ul>` : '<div class="muted small">Sin notas todavía.</div>'}
      </div>

      <div class="section-title">Añadir rápido</div>
      <div class="tiles">
        <a class="tile" href="javascript:void 0" data-quick="note"><span>📝</span>Nota</a>
        <a class="tile" href="javascript:void 0" data-quick="expense"><span>💶</span>Gasto</a>
        <a class="tile" href="#/asistente?nuevo=1"><span>🎤</span>Díselo a Claude</a>
      </div>`;

    // Agenda de hoy (locales + Google si hay sesión)
    const drawToday = (gEvents = []) => {
      const items = itemsForDay(today, gEvents);
      const el = view.querySelector('#today-list');
      if (!el) return;
      el.innerHTML = renderItems(items);
      bindItems(el, items, rerender);
    };
    drawToday();
    if (G.isReady()) {
      const now = new Date();
      G.monthEvents(now.getFullYear(), now.getMonth()).then(drawToday).catch(() => {});
    }

    // Tiempo
    fetchWeather()
      .then(({ w, place }) => {
        const c = w.current;
        const i = wInfo(c.weather_code, c.is_day);
        const el = view.querySelector('#w-card');
        if (!el) return;
        el.innerHTML = `<span style="font-size:40px">${i.e}</span>
          <div class="grow"><div style="font-size:24px;font-weight:800">${Math.round(c.temperature_2m)}° <span class="small muted" style="font-weight:400">${i.t}</span></div>
          <div class="small muted">📍 ${esc(place || 'Tu zona')} · máx ${Math.round(w.daily.temperature_2m_max[0])}° mín ${Math.round(w.daily.temperature_2m_min[0])}°${w.daily.precipitation_probability_max[0] ? ` · 💧${w.daily.precipitation_probability_max[0]}%` : ''}</div></div>`;
      })
      .catch(() => {
        const el = view.querySelector('#w-card');
        if (el) el.innerHTML = '<span class="muted small">🌤️ Toca para ver el tiempo (necesita permiso de ubicación)</span>';
      });

    view.querySelector('[data-addevent]').onclick = () => openEventSheet(today, rerender);
    view.querySelector('[data-addrem]').onclick = () => openReminderSheet(rerender);
    view.querySelectorAll('[data-rem]').forEach((c) => {
      c.onchange = () => {
        setDone(c.dataset.rem);
        rerender();
      };
    });
    view.querySelector('[data-sport]').onclick = () => openSportSheet(today, rerender);
    view.querySelectorAll('[data-h]').forEach((b) => {
      b.onclick = () => {
        toggleHabit(b.dataset.h);
        rerender();
      };
    });
    view.querySelectorAll('[data-note]').forEach((li) => {
      li.onclick = () => openNoteEditor(db().notes.find((n) => n.id === li.dataset.note), rerender);
    });
    view.querySelector('[data-quick="note"]').onclick = (e) => {
      e.preventDefault();
      openNoteEditor(null, rerender);
    };
    view.querySelector('[data-quick="expense"]').onclick = (e) => {
      e.preventDefault();
      openExpenseSheet(rerender);
    };
  },
};
