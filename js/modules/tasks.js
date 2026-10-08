// Tareas y proyectos con prioridad y fecha límite.
import { db, update } from '../store.js';
import { esc, uid, dkey, parseKey, addDays, fmtShort, toast, sheet, confirmSheet } from '../utils.js';

const PRIOS = { 1: '🔴 Alta', 2: '🟡 Media', 3: '⚪ Baja' };
export const openTasks = () =>
  db().tasks.filter((t) => !t.done).sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999') || a.priority - b.priority);
export const projects = () => [...new Set(db().tasks.map((t) => t.project).filter(Boolean))].sort();

export function addTask({ text, project = '', priority = 2, due = '' }) {
  text = String(text || '').trim();
  if (!text) throw new Error('Falta el texto de la tarea');
  const t = { id: uid(), text, project: project.trim(), priority: [1, 2, 3].includes(+priority) ? +priority : 2, due, done: false };
  update((d) => d.tasks.push(t));
  return t;
}

export function dueLabel(t) {
  if (!t.due) return '';
  const today = dkey();
  if (t.due < today) return `⚠️ Venció ${fmtShort(parseKey(t.due))}`;
  if (t.due === today) return 'Hoy';
  if (t.due === dkey(addDays(new Date(), 1))) return 'Mañana';
  return fmtShort(parseKey(t.due));
}

function openTaskSheet(onSaved, task) {
  const t = task || { text: '', project: filter !== 'todas' ? filter : '', priority: 2, due: '' };
  const s = sheet({
    title: task ? 'Editar tarea' : 'Nueva tarea',
    body: `
      <form>
        <label class="field"><span>Tarea</span><input class="input" name="text" required value="${esc(t.text)}" placeholder="Pedir presupuesto del coche"></label>
        <label class="field"><span>Proyecto (opcional)</span><input class="input" name="project" list="projects" value="${esc(t.project)}" placeholder="Casa, Trabajo, Boda…">
          <datalist id="projects">${projects().map((p) => `<option value="${esc(p)}">`).join('')}</datalist></label>
        <div class="row">
          <label class="field grow"><span>Prioridad</span><select class="input" name="priority">${[1, 2, 3].map((p) => `<option value="${p}" ${p === t.priority ? 'selected' : ''}>${PRIOS[p]}</option>`).join('')}</select></label>
          <label class="field grow"><span>Fecha límite</span><input class="input" type="date" name="due" value="${t.due}"></label>
        </div>
        <button class="btn primary block">Guardar</button>
        ${task ? '<button type="button" class="btn danger block" data-del style="margin-top:6px">Borrar</button>' : ''}
      </form>`,
  });
  const f = s.el.querySelector('form');
  f.onsubmit = (e) => {
    e.preventDefault();
    try {
      if (task) {
        update((d) => Object.assign(d.tasks.find((x) => x.id === task.id), { text: f.text.value.trim(), project: f.project.value.trim(), priority: +f.priority.value, due: f.due.value }));
      } else addTask({ text: f.text.value, project: f.project.value, priority: f.priority.value, due: f.due.value });
      s.close();
      onSaved?.();
    } catch (err) {
      toast(err.message);
    }
  };
  s.el.querySelector('[data-del]')?.addEventListener('click', async () => {
    if (!(await confirmSheet('Se borrará esta tarea.'))) return;
    update((d) => (d.tasks = d.tasks.filter((x) => x.id !== task.id)));
    s.close();
    onSaved?.();
  });
}

let filter = 'todas';

export default {
  title: 'Tareas',
  quickAdd: (rerender) => openTaskSheet(rerender),
  render(view, { rerender }) {
    const list = openTasks().filter((t) => filter === 'todas' || t.project === filter);
    const done = db().tasks.filter((t) => t.done && (filter === 'todas' || t.project === filter)).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
    const projs = projects();
    view.innerHTML = `
      ${projs.length ? `<div class="chips" style="margin-bottom:12px"><button class="chip ${filter === 'todas' ? 'active' : ''}" data-f="todas">Todas</button>${projs.map((p) => `<button class="chip ${filter === p ? 'active' : ''}" data-f="${esc(p)}">📁 ${esc(p)}</button>`).join('')}</div>` : ''}
      ${list.length ? `<div class="card"><ul class="list">${list.map((t) => `
        <li><input type="checkbox" data-done="${t.id}" style="width:22px;height:22px;accent-color:var(--accent);flex:none" aria-label="Completar">
          <div class="grow" data-edit="${t.id}" style="cursor:pointer">
            <div style="font-weight:600">${esc(t.text)}</div>
            <div class="small"><span class="prio-${t.priority}">●</span> <span class="${t.due && t.due < dkey() ? 'warn-text' : 'muted'}">${[dueLabel(t), t.project && filter === 'todas' ? '📁 ' + esc(t.project) : ''].filter(Boolean).join(' · ') || 'Sin fecha'}</span></div>
          </div></li>`).join('')}</ul></div>`
      : '<div class="empty"><span class="big">✔️</span>No hay tareas pendientes.</div>'}
      ${done.length ? `<details class="card"><summary class="muted">Completadas (${done.length})</summary><ul class="list">${done.slice(0, 30).map((t) => `
        <li><span class="grow muted" style="text-decoration:line-through">${esc(t.text)}</span><button class="x-btn" data-undo="${t.id}" aria-label="Deshacer">↩</button></li>`).join('')}</ul>
        <button class="btn small block" data-clear>Borrar completadas</button></details>` : ''}
      <button class="fab" aria-label="Nueva tarea">+</button>`;

    view.querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => { filter = b.dataset.f; rerender(); }));
    view.querySelector('.fab').onclick = () => openTaskSheet(rerender);
    view.querySelectorAll('[data-edit]').forEach((el) => (el.onclick = () => openTaskSheet(rerender, db().tasks.find((t) => t.id === el.dataset.edit))));
    view.querySelectorAll('[data-done]').forEach((c) => {
      c.onchange = () => {
        update((d) => Object.assign(d.tasks.find((t) => t.id === c.dataset.done), { done: true, doneAt: Date.now() }));
        toast('✅ Tarea completada');
        rerender();
      };
    });
    view.querySelectorAll('[data-undo]').forEach((b) => (b.onclick = () => { update((d) => (d.tasks.find((t) => t.id === b.dataset.undo).done = false)); rerender(); }));
    view.querySelector('[data-clear]')?.addEventListener('click', () => {
      update((d) => (d.tasks = d.tasks.filter((t) => !t.done || (filter !== 'todas' && t.project !== filter))));
      rerender();
    });
  },
};
