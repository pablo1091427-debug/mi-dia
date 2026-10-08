import { db, update } from '../store.js';
import { esc, dkey, parseKey, MESES, DIAS_CORTOS, fmtLong, cap, toast, sheet, weekStart, addDays } from '../utils.js';

export const SPORT_TYPES = [
  { id: 'gym', name: 'Gimnasio', e: '🏋️' },
  { id: 'run', name: 'Correr', e: '🏃' },
  { id: 'bike', name: 'Bici', e: '🚴' },
  { id: 'futbol', name: 'Fútbol', e: '⚽' },
  { id: 'padel', name: 'Pádel', e: '🎾' },
  { id: 'swim', name: 'Natación', e: '🏊' },
  { id: 'walk', name: 'Caminar', e: '🚶' },
  { id: 'yoga', name: 'Yoga', e: '🧘' },
  { id: 'other', name: 'Otro', e: '✨' },
];
export const sportType = (id) => SPORT_TYPES.find((t) => t.id === id) || SPORT_TYPES.at(-1);

export function sportStats() {
  const { sport, sportGoal } = db();
  const today = new Date();
  // Racha: días seguidos hasta hoy (o hasta ayer si hoy aún no has entrenado)
  let cursor = sport[dkey(today)] ? today : addDays(today, -1);
  let streak = 0;
  while (sport[dkey(cursor)]) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  const keys = Object.keys(sport).sort();
  let best = 0;
  let run = 0;
  let prev = null;
  for (const k of keys) {
    run = prev && dkey(addDays(parseKey(prev), 1)) === k ? run + 1 : 1;
    best = Math.max(best, run);
    prev = k;
  }
  const ws = dkey(weekStart(today));
  const ym = dkey(today).slice(0, 7);
  const y = String(today.getFullYear());
  return {
    streak,
    best,
    week: keys.filter((k) => k >= ws).length,
    month: keys.filter((k) => k.startsWith(ym)).length,
    year: keys.filter((k) => k.startsWith(y)).length,
    goal: sportGoal,
    doneToday: !!sport[dkey(today)],
  };
}

export function openSportSheet(key = dkey(), onSaved) {
  const existing = db().sport[key];
  let type = existing?.type || 'gym';
  const s = sheet({
    title: cap(fmtLong(parseKey(key))),
    body: `
      <div class="type-grid">${SPORT_TYPES.map((t) => `<button type="button" data-t="${t.id}" class="${t.id === type ? 'active' : ''}"><span>${t.e}</span>${t.name}</button>`).join('')}</div>
      <label class="field" style="margin-top:12px"><span>Minutos (opcional)</span><input class="input" type="number" inputmode="numeric" min="0" name="min" value="${existing?.min || ''}" placeholder="60"></label>
      <button class="btn primary block" data-save>${existing ? 'Guardar cambios' : '✅ Marcar como entrenado'}</button>
      ${existing ? '<button class="btn danger block" data-del style="margin-top:6px">Quitar entrenamiento</button>' : ''}`,
  });
  s.el.querySelectorAll('[data-t]').forEach((b) => {
    b.onclick = () => {
      type = b.dataset.t;
      s.el.querySelectorAll('[data-t]').forEach((x) => x.classList.toggle('active', x === b));
    };
  });
  s.el.querySelector('[data-save]').onclick = () => {
    const min = parseInt(s.el.querySelector('[name=min]').value, 10) || 0;
    update((d) => (d.sport[key] = { type, min }));
    s.close();
    toast(`${sportType(type).e} ¡Entrenamiento guardado!`);
    onSaved?.();
  };
  s.el.querySelector('[data-del]')?.addEventListener('click', () => {
    update((d) => delete d.sport[key]);
    s.close();
    toast('Entrenamiento quitado');
    onSaved?.();
  });
}

let vy = new Date().getFullYear();
let vm = new Date().getMonth();

export default {
  title: 'Deporte',
  quickAdd: (rerender) => openSportSheet(dkey(), rerender),
  render(view, { rerender }) {
    const d = db();
    const st = sportStats();
    const today = dkey();

    // Mes
    const first = new Date(vy, vm, 1);
    const start = weekStart(first);
    let grid = DIAS_CORTOS.map((x) => `<div class="cal-dow">${x}</div>`).join('');
    for (let i = 0; i < 42; i++) {
      const day = addDays(start, i);
      if (i >= 35 && day.getMonth() !== vm) break;
      const k = dkey(day);
      const sp = d.sport[k];
      grid += `<button class="cal-day ${day.getMonth() !== vm ? 'other' : ''} ${k === today ? 'today' : ''} ${sp ? 'done' : ''}" data-k="${k}" ${k > today ? 'disabled' : ''}>
        <span class="n">${day.getDate()}</span>${sp ? `<span class="ico">${sportType(sp.type).e}</span>` : ''}</button>`;
    }

    // Heatmap de las últimas 52 semanas
    const hmStart = addDays(weekStart(), -51 * 7);
    let hm = '';
    for (let i = 0; i < 52 * 7; i++) {
      const k = dkey(addDays(hmStart, i));
      hm += k > today ? '<i class="blank"></i>' : `<i class="${d.sport[k] ? 'on' : ''}" title="${k}"></i>`;
    }

    // Reparto por tipo este año
    const y = String(new Date().getFullYear());
    const counts = {};
    Object.entries(d.sport).forEach(([k, v]) => k.startsWith(y) && (counts[v.type] = (counts[v.type] || 0) + 1));
    const max = Math.max(1, ...Object.values(counts));
    const mins = Object.entries(d.sport).filter(([k]) => k.startsWith(y)).reduce((a, [, v]) => a + (v.min || 0), 0);

    view.innerHTML = `
      <button class="btn ${st.doneToday ? '' : 'primary'} block" data-todaybtn style="min-height:54px;font-size:16px;margin-bottom:12px">
        ${st.doneToday ? `${sportType(d.sport[today].type).e} Hoy ya has entrenado · editar` : '💪 He entrenado hoy'}</button>
      <div class="grid-2">
        <div class="card"><div class="stat">🔥 ${st.streak}</div><div class="stat-label">días de racha (mejor: ${st.best})</div></div>
        <div class="card"><div class="stat">${st.week}/${st.goal}</div><div class="stat-label">esta semana</div>
          <div class="progress ${st.week >= st.goal ? 'ok' : ''}" style="margin-top:6px"><div style="width:${Math.min(100, (st.week / st.goal) * 100)}%"></div></div></div>
        <div class="card"><div class="stat">${st.month}</div><div class="stat-label">este mes</div></div>
        <div class="card"><div class="stat">${st.year}</div><div class="stat-label">este año${mins ? ` · ${Math.round(mins / 60)} h` : ''}</div></div>
      </div>
      <div class="card" style="margin-top:12px">
        <div class="month-head">
          <button class="icon-btn" data-nav="-1" aria-label="Mes anterior">‹</button>
          <h2>${MESES[vm]} ${vy}</h2>
          <button class="icon-btn" data-nav="1" aria-label="Mes siguiente">›</button>
        </div>
        <div class="cal-grid">${grid}</div>
        <p class="small muted" style="margin:8px 0 0">Toca un día para marcarlo o editarlo.</p>
      </div>
      <div class="card">
        <h2>Último año</h2>
        <div class="heatmap">${hm}</div>
      </div>
      <div class="card">
        <h2>Por actividad (${y})</h2>
        ${Object.keys(counts).length ? Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([t, n]) => `
          <div class="bar-row"><span>${sportType(t).e} ${esc(sportType(t).name)}</span><div class="progress ok"><div style="width:${(n / max) * 100}%"></div></div><span class="right">${n} días</span></div>`).join('') : '<div class="muted small">Aún no hay entrenamientos este año.</div>'}
      </div>
      <div class="card row">
        <span class="grow">🎯 Objetivo semanal</span>
        <select class="input" style="width:auto" data-goal>${[1, 2, 3, 4, 5, 6, 7].map((n) => `<option ${n === d.sportGoal ? 'selected' : ''} value="${n}">${n} días</option>`).join('')}</select>
      </div>`;

    view.querySelector('[data-todaybtn]').onclick = () => openSportSheet(today, rerender);
    view.querySelectorAll('.cal-day[data-k]').forEach((b) => (b.onclick = () => openSportSheet(b.dataset.k, rerender)));
    view.querySelectorAll('[data-nav]').forEach((b) => {
      b.onclick = () => {
        vm += +b.dataset.nav;
        if (vm < 0) { vm = 11; vy--; }
        if (vm > 11) { vm = 0; vy++; }
        rerender();
      };
    });
    view.querySelector('[data-goal]').onchange = (e) => {
      update((x) => (x.sportGoal = +e.target.value));
      rerender();
    };
  },
};
