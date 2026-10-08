// Ocio: películas, series y libros (pendientes, en curso, terminados) con valoración.
import { db, update } from '../store.js';
import { esc, uid, toast, sheet, confirmSheet } from '../utils.js';
import { starsHtml, bindStars, starsText, tabsHtml, bindTabs } from '../ui.js';
import { askText, hasKey } from '../ai.js';

export const MEDIA_TYPES = { peli: { name: 'Película', e: '🎬' }, serie: { name: 'Serie', e: '📺' }, libro: { name: 'Libro', e: '📚' } };
export const STATUSES = { pendiente: 'Pendiente', 'en curso': 'En curso', terminado: 'Terminado' };

export function addMedia({ type = 'peli', title, status = 'pendiente', rating = 0, notes = '' }) {
  title = String(title || '').trim();
  if (!title) throw new Error('Falta el título');
  const m = { id: uid(), type: MEDIA_TYPES[type] ? type : 'peli', title, status: STATUSES[status] ? status : 'pendiente', rating: +rating || 0, notes, updated: Date.now() };
  update((d) => d.media.push(m));
  return m;
}

function openMediaSheet(onSaved, item) {
  const m = item || { type: filter !== 'todo' ? filter : 'peli', title: '', status: 'pendiente', rating: 0, notes: '' };
  const s = sheet({
    title: item ? 'Editar' : 'Añadir',
    body: `<form>
      <div class="chips" style="margin-bottom:12px">${Object.entries(MEDIA_TYPES).map(([k, v]) => `<button type="button" class="chip ${k === m.type ? 'active' : ''}" data-type="${k}">${v.e} ${v.name}</button>`).join('')}</div>
      <label class="field"><span>Título</span><input class="input" name="title" required value="${esc(m.title)}"></label>
      <label class="field"><span>Estado</span><select class="input" name="status">${Object.entries(STATUSES).map(([k, v]) => `<option value="${k}" ${k === m.status ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <div class="field"><span>Valoración</span>${starsHtml(m.rating)}</div>
      <label class="field"><span>Notas</span><input class="input" name="notes" value="${esc(m.notes)}" placeholder="Me la recomendó…, temporada 2…"></label>
      <button class="btn primary block">Guardar</button>
      ${item ? '<button type="button" class="btn danger block" data-del style="margin-top:6px">Borrar</button>' : ''}</form>`,
  });
  let type = m.type;
  bindStars(s.el);
  s.el.querySelectorAll('[data-type]').forEach((b) => (b.onclick = () => { type = b.dataset.type; s.el.querySelectorAll('[data-type]').forEach((x) => x.classList.toggle('active', x === b)); }));
  const f = s.el.querySelector('form');
  f.onsubmit = (e) => {
    e.preventDefault();
    const rating = +s.el.querySelector('[data-stars]').dataset.value;
    try {
      if (item) update((d) => Object.assign(d.media.find((x) => x.id === item.id), { type, title: f.title.value.trim(), status: f.status.value, rating, notes: f.notes.value.trim(), updated: Date.now() }));
      else addMedia({ type, title: f.title.value, status: f.status.value, rating, notes: f.notes.value.trim() });
      s.close();
      onSaved?.();
    } catch (err) {
      toast(err.message);
    }
  };
  s.el.querySelector('[data-del]')?.addEventListener('click', async () => {
    if (!(await confirmSheet('Se borrará de la lista.'))) return;
    update((d) => (d.media = d.media.filter((x) => x.id !== item.id)));
    s.close();
    onSaved?.();
  });
}

async function recommend(box) {
  if (!hasKey()) return toast('Añade tu clave de Anthropic en Ajustes');
  const d = db();
  const liked = d.media.filter((m) => m.rating >= 4).map((m) => `${MEDIA_TYPES[m.type].name}: ${m.title} (${m.rating}★)`);
  const disliked = d.media.filter((m) => m.rating && m.rating <= 2).map((m) => `${m.title} (${m.rating}★)`);
  const all = d.media.map((m) => m.title);
  const type = filter === 'todo' ? 'películas, series o libros' : MEDIA_TYPES[filter].name.toLowerCase() + 's';
  box.innerHTML = '<p class="muted">🤖 Buscando recomendaciones…</p>';
  try {
    const text = await askText({
      system: 'Recomiendas películas, series y libros de forma cercana, en español y en texto plano sin Markdown. Para cada recomendación: título (año), una línea de por qué le puede gustar y dónde suele estar disponible si lo sabes con seguridad.',
      content: `Recomiéndame 5 ${type}. Me gustaron: ${liked.join('; ') || 'aún no he valorado nada'}. No me gustaron: ${disliked.join('; ') || 'nada'}. No recomiendes nada de esta lista porque ya lo tengo: ${all.join('; ') || '(vacía)'}.`,
      effort: 'medium',
    });
    box.innerHTML = `<div class="card"><h2>🤖 Para ti</h2><div class="ai-box">${esc(text)}</div></div>`;
  } catch (e) {
    box.innerHTML = `<p class="warn-text">${esc(e.message)}</p>`;
  }
}

let filter = 'todo';
let status = 'pendiente';

export default {
  title: 'Pelis, series y libros',
  quickAdd: (rerender) => openMediaSheet(rerender),
  render(view, { rerender }) {
    const list = db().media.filter((m) => (filter === 'todo' || m.type === filter) && m.status === status).sort((a, b) => (b.rating - a.rating) || b.updated - a.updated);
    view.innerHTML = `
      ${tabsHtml([['todo', 'Todo'], ['peli', '🎬 Pelis'], ['serie', '📺 Series'], ['libro', '📚 Libros']], filter)}
      <div class="chips" style="margin-bottom:12px">${Object.entries(STATUSES).map(([k, v]) => `<button class="chip ${k === status ? 'active' : ''}" data-st="${k}">${v} (${db().media.filter((m) => (filter === 'todo' || m.type === filter) && m.status === k).length})</button>`).join('')}</div>
      ${list.length ? `<div class="card"><ul class="list">${list.map((m) => `
        <li data-edit="${m.id}" style="cursor:pointer"><span class="emoji">${MEDIA_TYPES[m.type].e}</span>
          <div class="grow"><div class="ellipsis" style="font-weight:600">${esc(m.title)}</div>
          <div class="small muted ellipsis">${m.rating ? `<span style="color:#f59e0b">${starsText(m.rating)}</span> ` : ''}${esc(m.notes)}</div></div></li>`).join('')}</ul></div>`
      : '<div class="empty small">Nada por aquí. Pulsa + para añadir.</div>'}
      <div id="rec"></div>
      <button class="btn block" data-rec>🤖 Recomiéndame algo</button>
      <button class="fab" aria-label="Añadir">+</button>`;
    bindTabs(view, (t) => { filter = t; rerender(); });
    view.querySelectorAll('[data-st]').forEach((b) => (b.onclick = () => { status = b.dataset.st; rerender(); }));
    view.querySelectorAll('[data-edit]').forEach((li) => (li.onclick = () => openMediaSheet(rerender, db().media.find((m) => m.id === li.dataset.edit))));
    view.querySelector('[data-rec]').onclick = () => recommend(view.querySelector('#rec'));
    view.querySelector('.fab').onclick = () => openMediaSheet(rerender);
  },
};
