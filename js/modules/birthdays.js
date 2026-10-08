import { db, update } from '../store.js';
import { esc, uid, MESES, sheet, confirmSheet } from '../utils.js';

// Próximos cumpleaños ordenados por días que faltan
export function upcomingBirthdays() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return db()
    .birthdays.map((b) => {
      let next = new Date(today.getFullYear(), b.month - 1, b.day);
      if (next < today) next = new Date(today.getFullYear() + 1, b.month - 1, b.day);
      const days = Math.round((next - today) / 86400000);
      return { ...b, days, age: b.year ? next.getFullYear() - b.year : null };
    })
    .sort((a, b) => a.days - b.days);
}

export const whenLabel = (days) => (days === 0 ? '¡Hoy! 🎉' : days === 1 ? 'Mañana' : `En ${days} días`);

function openBirthdaySheet(onSaved) {
  const s = sheet({
    title: 'Nuevo cumpleaños',
    body: `
      <form>
        <label class="field"><span>Nombre</span><input class="input" name="name" required placeholder="Mamá"></label>
        <div class="row">
          <label class="field" style="width:80px"><span>Día</span><input class="input" type="number" name="day" min="1" max="31" required></label>
          <label class="field grow"><span>Mes</span><select class="input" name="month">${MESES.map((m, i) => `<option value="${i + 1}">${m}</option>`).join('')}</select></label>
          <label class="field" style="width:96px"><span>Año</span><input class="input" type="number" name="year" min="1900" max="2100" placeholder="Opc."></label>
        </div>
        <button class="btn primary block">Guardar</button>
      </form>`,
  });
  const f = s.el.querySelector('form');
  f.onsubmit = (e) => {
    e.preventDefault();
    const day = parseInt(f.day.value, 10);
    if (!f.name.value.trim() || !(day >= 1 && day <= 31)) return;
    update((d) => d.birthdays.push({ id: uid(), name: f.name.value.trim(), day, month: +f.month.value, year: parseInt(f.year.value, 10) || null }));
    s.close();
    onSaved?.();
  };
}

export default {
  title: 'Cumpleaños',
  render(view, { rerender }) {
    const list = upcomingBirthdays();
    view.innerHTML = `
      ${list.length ? `<div class="card"><ul class="list">${list.map((b) => `
        <li><span class="emoji">${b.days === 0 ? '🎉' : '🎂'}</span>
          <div class="grow"><div class="ellipsis" style="font-weight:600">${esc(b.name)}</div>
            <div class="small muted">${b.day} de ${MESES[b.month - 1]}${b.age ? ` · cumple ${b.age}` : ''}</div></div>
          <span class="badge">${whenLabel(b.days)}</span>
          <button class="x-btn" data-del="${b.id}" aria-label="Borrar">✕</button></li>`).join('')}</ul></div>
        <p class="small muted" style="text-align:center">También aparecen en el calendario y en Inicio.</p>`
      : '<div class="empty"><span class="big">🎂</span>Apunta los cumpleaños importantes y no se te pasará ninguno.</div>'}
      <button class="fab" aria-label="Nuevo cumpleaños">+</button>`;
    view.querySelector('.fab').onclick = () => openBirthdaySheet(rerender);
    view.querySelectorAll('[data-del]').forEach((b) => {
      b.onclick = async () => {
        if (!(await confirmSheet('Se borrará este cumpleaños.'))) return;
        update((d) => (d.birthdays = d.birthdays.filter((x) => x.id !== b.dataset.del)));
        rerender();
      };
    });
  },
};
