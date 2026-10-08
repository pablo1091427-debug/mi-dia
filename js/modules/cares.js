// Cuidados que se repiten: mascotas, plantas y tareas de casa (regar cada 3 días, pipeta cada mes…).
import { db, update } from '../store.js';
import { esc, uid, dkey, parseKey, addDays, toast, sheet, confirmSheet } from '../utils.js';

const TEMPLATES = [
  ['🌱', 'Plantas', 'Regar', 3], ['🌱', 'Plantas', 'Abonar', 30],
  ['🐶', 'Perro', 'Pipeta antiparasitaria', 30], ['🐶', 'Perro', 'Vacuna anual', 365], ['🐶', 'Perro', 'Baño', 21],
  ['🐱', 'Gato', 'Cambiar arena', 7], ['🐱', 'Gato', 'Desparasitar', 90], ['🐟', 'Pecera', 'Cambiar agua', 14],
  ['🛏️', 'Casa', 'Cambiar sábanas', 7], ['🧊', 'Casa', 'Limpiar nevera', 30], ['🌀', 'Casa', 'Limpiar filtros del aire', 90],
];

export const nextDue = (c) => (c.last ? dkey(addDays(parseKey(c.last), c.everyDays)) : dkey());
export const daysTo = (c) => Math.round((parseKey(nextDue(c)) - parseKey(dkey())) / 86400000);
export const dueCares = () => db().cares.filter((c) => daysTo(c) <= 0).sort((a, b) => daysTo(a) - daysTo(b));

export function markCare(id, date = dkey()) {
  update((d) => (d.cares.find((c) => c.id === id).last = date));
}

const label = (n) => (n < 0 ? `Toca desde hace ${-n} día${n === -1 ? '' : 's'}` : n === 0 ? 'Toca hoy' : n === 1 ? 'Mañana' : `En ${n} días`);

function openCareSheet(onSaved) {
  const s = sheet({
    title: 'Nuevo cuidado',
    body: `<form>
      <div class="chips" style="flex-wrap:wrap;margin-bottom:12px">${TEMPLATES.map((t, i) => `<button type="button" class="chip" data-t="${i}">${t[0]} ${t[2]}</button>`).join('')}</div>
      <div class="row">
        <label class="field" style="width:76px"><span>Icono</span><input class="input" name="emoji" value="🌱" style="text-align:center;font-size:20px"></label>
        <label class="field grow"><span>¿De quién/qué?</span><input class="input" name="subject" required placeholder="Plantas, Toby, la casa…"></label>
      </div>
      <label class="field"><span>¿Qué hay que hacer?</span><input class="input" name="what" required placeholder="Regar"></label>
      <div class="row">
        <label class="field grow"><span>Cada cuántos días</span><input class="input" type="number" name="every" min="1" required value="7"></label>
        <label class="field grow"><span>Última vez</span><input class="input" type="date" name="last" value="${dkey()}"></label>
      </div>
      <button class="btn primary block">Guardar</button></form>`,
  });
  const f = s.el.querySelector('form');
  s.el.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => {
    const [e, sub, what, every] = TEMPLATES[+b.dataset.t];
    f.emoji.value = e; f.subject.value ||= sub; f.what.value = what; f.every.value = every;
  }));
  f.onsubmit = (e) => {
    e.preventDefault();
    const every = parseInt(f.every.value, 10);
    if (!(every >= 1)) return toast('Pon cada cuántos días');
    update((d) => d.cares.push({ id: uid(), emoji: f.emoji.value.trim() || '🔁', subject: f.subject.value.trim(), what: f.what.value.trim(), everyDays: every, last: f.last.value || '' }));
    s.close();
    onSaved?.();
  };
}

export default {
  title: 'Cuidados',
  quickAdd: (rerender) => openCareSheet(rerender),
  render(view, { rerender }) {
    const list = [...db().cares].sort((a, b) => daysTo(a) - daysTo(b));
    view.innerHTML = `
      ${list.length ? `<div class="card"><ul class="list">${list.map((c) => {
        const n = daysTo(c);
        return `<li><span class="emoji">${esc(c.emoji)}</span>
          <div class="grow"><div style="font-weight:600">${esc(c.what)} <span class="muted" style="font-weight:400">· ${esc(c.subject)}</span></div>
            <div class="small ${n <= 0 ? 'warn-text' : 'muted'}">${label(n)} · cada ${c.everyDays} días</div></div>
          <button class="btn small ${n <= 0 ? 'primary' : ''}" data-done="${c.id}">Hecho</button>
          <button class="x-btn" data-del="${c.id}" aria-label="Borrar">✕</button></li>`;
      }).join('')}</ul></div>
      <p class="small muted" style="text-align:center">Lo que toca hoy aparece también en Inicio.</p>`
      : '<div class="empty"><span class="big">🌱</span>Apunta cuidados que se repiten: regar las plantas, la pipeta del perro, cambiar las sábanas… y te avisaré cuando toque.</div>'}
      <button class="fab" aria-label="Nuevo cuidado">+</button>`;
    view.querySelector('.fab').onclick = () => openCareSheet(rerender);
    view.querySelectorAll('[data-done]').forEach((b) => (b.onclick = () => { markCare(b.dataset.done); toast('✅ Hecho'); rerender(); }));
    view.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => {
      if (!(await confirmSheet('Se borrará este cuidado.'))) return;
      update((d) => (d.cares = d.cares.filter((c) => c.id !== b.dataset.del)));
      rerender();
    }));
  },
};
