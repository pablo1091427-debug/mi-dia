import { db, update } from '../store.js';
import { esc, uid, dkey, addDays, DIAS_CORTOS, weekStart, sheet, confirmSheet } from '../utils.js';

export const isDone = (habitId, key = dkey()) => (db().habitLog[key] || []).includes(habitId);

export function toggleHabit(habitId, key = dkey()) {
  update((d) => {
    const day = d.habitLog[key] || [];
    d.habitLog[key] = day.includes(habitId) ? day.filter((x) => x !== habitId) : [...day, habitId];
    if (!d.habitLog[key].length) delete d.habitLog[key];
  });
}

export function habitStreak(habitId) {
  let cursor = isDone(habitId) ? new Date() : addDays(new Date(), -1);
  let n = 0;
  while (isDone(habitId, dkey(cursor))) {
    n++;
    cursor = addDays(cursor, -1);
  }
  return n;
}

const SUGGESTIONS = [['📖', 'Leer 20 minutos'], ['🧘', 'Meditar'], ['😴', 'Dormir 8 horas'], ['🚭', 'Sin tabaco'], ['🥗', 'Comer sano'], ['📵', 'Sin móvil en la cama'], ['🚶', '10.000 pasos']];

function openHabitSheet(onSaved) {
  const s = sheet({
    title: 'Nuevo hábito',
    body: `
      <form>
        <div class="row">
          <label class="field" style="width:80px"><span>Icono</span><input class="input" name="emoji" value="✅" style="text-align:center;font-size:20px"></label>
          <label class="field grow"><span>Hábito</span><input class="input" name="name" required placeholder="Leer 20 minutos"></label>
        </div>
        <div class="chips" style="flex-wrap:wrap;margin-bottom:12px">${SUGGESTIONS.map(([e, n]) => `<button type="button" class="chip" data-e="${e}" data-n="${n}">${e} ${n}</button>`).join('')}</div>
        <button class="btn primary block">Crear hábito</button>
      </form>`,
  });
  const f = s.el.querySelector('form');
  s.el.querySelectorAll('[data-n]').forEach((b) => {
    b.onclick = () => {
      f.emoji.value = b.dataset.e;
      f.name.value = b.dataset.n;
    };
  });
  f.onsubmit = (e) => {
    e.preventDefault();
    if (!f.name.value.trim()) return;
    update((d) => d.habits.push({ id: uid(), name: f.name.value.trim(), emoji: f.emoji.value.trim() || '✅' }));
    s.close();
    onSaved?.();
  };
}

export default {
  title: 'Hábitos',
  render(view, { rerender }) {
    const { habits } = db();
    const ws = weekStart();
    const done = habits.filter((h) => isDone(h.id)).length;
    view.innerHTML = `
      ${habits.length ? `
      <div class="card">
        <h2>Hoy <span class="badge">${done}/${habits.length}</span></h2>
        <div class="progress ok" style="margin-bottom:6px"><div style="width:${(done / habits.length) * 100}%"></div></div>
        ${habits.map((h) => `
          <div class="habit">
            <button class="habit-toggle ${isDone(h.id) ? 'on' : ''}" data-t="${h.id}" aria-label="Marcar ${esc(h.name)}">${isDone(h.id) ? '✓' : esc(h.emoji)}</button>
            <div class="grow">
              <div class="ellipsis" style="font-weight:600">${esc(h.name)}</div>
              <div class="small muted">🔥 ${habitStreak(h.id)} días</div>
              <div class="week-dots" title="Esta semana">${DIAS_CORTOS.map((_, i) => `<i class="${isDone(h.id, dkey(addDays(ws, i))) ? 'on' : ''}"></i>`).join('')}</div>
            </div>
            <button class="x-btn" data-del="${h.id}" aria-label="Borrar hábito">✕</button>
          </div>`).join('')}
      </div>
      <p class="small muted" style="text-align:center">Los cuadritos muestran tu semana de lunes a domingo.</p>`
      : '<div class="empty"><span class="big">✅</span>Crea hábitos que quieras cumplir cada día y márcalos con un toque.</div>'}
      <button class="fab" aria-label="Nuevo hábito">+</button>`;

    view.querySelectorAll('[data-t]').forEach((b) => {
      b.onclick = () => {
        toggleHabit(b.dataset.t);
        rerender();
      };
    });
    view.querySelectorAll('[data-del]').forEach((b) => {
      b.onclick = async () => {
        if (!(await confirmSheet('Se borrará el hábito y su historial.'))) return;
        update((d) => {
          d.habits = d.habits.filter((h) => h.id !== b.dataset.del);
          Object.keys(d.habitLog).forEach((k) => {
            d.habitLog[k] = d.habitLog[k].filter((x) => x !== b.dataset.del);
            if (!d.habitLog[k].length) delete d.habitLog[k];
          });
        });
        rerender();
      };
    });
    view.querySelector('.fab').onclick = () => openHabitSheet(rerender);
  },
};
