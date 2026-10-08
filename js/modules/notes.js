import { db, update } from '../store.js';
import { esc, uid, toast, sheet, confirmSheet } from '../utils.js';

const COLORS = ['', '#f59e0b', '#10b981', '#3b82f6', '#ec4899', '#8b5cf6', '#ef4444'];
let query = '';

export function openNoteEditor(note, onSaved) {
  const isNew = !note;
  const n = note ? { ...note } : { id: uid(), title: '', body: '', color: '', pinned: false };
  const s = sheet({
    title: isNew ? 'Nueva nota' : 'Editar nota',
    full: true,
    body: `
      <input class="input" name="title" placeholder="Título" value="${esc(n.title)}" style="font-weight:700;margin-bottom:10px">
      <textarea class="input" name="body" placeholder="Escribe aquí…" style="flex:1;min-height:40dvh">${esc(n.body)}</textarea>
      <div class="row wrap" style="margin:12px 0">
        <div class="color-pick">${COLORS.map((c) => `<button type="button" data-c="${c}" class="${c === n.color ? 'active' : ''}" style="background:${c || 'var(--surface-2)'}" aria-label="Color"></button>`).join('')}</div>
        <label class="check right"><input type="checkbox" name="pinned" ${n.pinned ? 'checked' : ''}> 📌 Fijar</label>
      </div>
      <div class="row">
        ${isNew ? '' : '<button class="btn danger" data-del>Eliminar</button>'}
        <button class="btn primary grow" data-save>Guardar</button>
      </div>`,
  });
  const el = s.el;
  el.querySelector('.sheet-body').style.cssText = 'display:flex;flex-direction:column;flex:1';
  el.querySelectorAll('[data-c]').forEach((b) => {
    b.onclick = () => {
      n.color = b.dataset.c;
      el.querySelectorAll('[data-c]').forEach((x) => x.classList.toggle('active', x === b));
    };
  });
  el.querySelector('[data-save]').onclick = () => {
    n.title = el.querySelector('[name=title]').value.trim();
    n.body = el.querySelector('[name=body]').value;
    n.pinned = el.querySelector('[name=pinned]').checked;
    n.updated = Date.now();
    if (!n.title && !n.body.trim()) return s.close();
    update((d) => {
      const i = d.notes.findIndex((x) => x.id === n.id);
      if (i >= 0) d.notes[i] = n;
      else d.notes.unshift(n);
    });
    s.close();
    toast('Nota guardada');
    onSaved?.();
  };
  el.querySelector('[data-del]')?.addEventListener('click', async () => {
    if (!(await confirmSheet('Se eliminará esta nota.'))) return;
    update((d) => (d.notes = d.notes.filter((x) => x.id !== n.id)));
    s.close();
    toast('Nota eliminada');
    onSaved?.();
  });
}

export const sortedNotes = () =>
  [...db().notes].sort((a, b) => (b.pinned - a.pinned) || (b.updated || 0) - (a.updated || 0));

export default {
  title: 'Notas',
  quickAdd: (rerender) => openNoteEditor(null, rerender),
  render(view, { rerender }) {
    view.innerHTML = `
      <input class="input" type="search" placeholder="🔍 Buscar notas" value="${esc(query)}" style="margin-bottom:12px" data-q>
      <div id="notes"></div>
      <button class="fab" aria-label="Nueva nota">+</button>`;

    const draw = () => {
      const q = query.toLowerCase();
      const list = sortedNotes().filter((n) => !q || (n.title + ' ' + n.body).toLowerCase().includes(q));
      const el = view.querySelector('#notes');
      if (!list.length) {
        el.innerHTML = `<div class="empty"><span class="big">📝</span>${q ? 'Sin resultados' : 'Aún no tienes notas. Pulsa + para crear una.'}</div>`;
        return;
      }
      el.innerHTML = `<div class="notes-grid">${list
        .map((n) => `<div class="note-card" data-id="${n.id}" style="--note:${n.color || 'transparent'}">
          <h3>${n.pinned ? '📌 ' : ''}${esc(n.title || 'Sin título')}</h3><p>${esc(n.body.slice(0, 400))}</p></div>`)
        .join('')}</div>`;
      el.querySelectorAll('.note-card').forEach((c) => {
        c.onclick = () => openNoteEditor(db().notes.find((n) => n.id === c.dataset.id), rerender);
      });
    };

    view.querySelector('[data-q]').oninput = (e) => {
      query = e.target.value;
      draw();
    };
    view.querySelector('.fab').onclick = () => openNoteEditor(null, rerender);
    draw();
  },
};
