import { db, update } from '../store.js';
import { esc, uid, getPosition, distance, fmtDist, mapsLink, toast, sheet, confirmSheet } from '../utils.js';
import { PLACE_CATS } from './bars.js';

const EXTRA = [{ id: 'fav', e: '⭐' }, { id: 'parking', e: '🅿️' }, { id: 'home', e: '🏠' }];
const icon = (cat) => (PLACE_CATS.find((c) => c.id === cat) || EXTRA.find((c) => c.id === cat) || EXTRA[0]).e;

function openPlaceSheet(onSaved) {
  const s = sheet({
    title: 'Guardar mi ubicación actual',
    body: `
      <form>
        <label class="field"><span>Nombre</span><input class="input" name="name" required placeholder="Dónde he aparcado, bar de Juan…"></label>
        <label class="field"><span>Nota</span><input class="input" name="note" placeholder="Opcional"></label>
        <label class="field"><span>Tipo</span><select class="input" name="cat">
          <option value="fav">⭐ Favorito</option><option value="parking">🅿️ Aparcamiento</option><option value="home">🏠 Casa / trabajo</option>
          ${PLACE_CATS.map((c) => `<option value="${c.id}">${c.e} ${c.name}</option>`).join('')}</select></label>
        <button class="btn primary block">📍 Guardar aquí</button>
      </form>`,
  });
  const f = s.el.querySelector('form');
  f.onsubmit = async (e) => {
    e.preventDefault();
    const btn = f.querySelector('button');
    btn.disabled = true;
    btn.textContent = 'Obteniendo ubicación…';
    try {
      const pos = await getPosition({ force: true });
      update((d) => d.places.unshift({ id: uid(), name: f.name.value.trim(), note: f.note.value.trim(), lat: pos.lat, lon: pos.lon, cat: f.cat.value }));
      s.close();
      toast('Lugar guardado');
      onSaved?.();
    } catch (err) {
      btn.disabled = false;
      btn.textContent = '📍 Guardar aquí';
      toast(err.message);
    }
  };
}

export default {
  title: 'Mis lugares',
  render(view, { rerender }) {
    const { places } = db();
    view.innerHTML = `
      ${places.length ? `<div class="card"><ul class="list">${places.map((p) => `
        <li><span class="emoji">${icon(p.cat)}</span>
          <div class="grow"><div class="ellipsis" style="font-weight:600">${esc(p.name)}</div>
            <div class="small muted ellipsis" data-dist="${p.id}">${esc(p.note)}</div></div>
          <a class="btn small" href="${mapsLink(p.lat, p.lon)}" target="_blank" rel="noopener">Ir</a>
          <button class="x-btn" data-del="${p.id}" aria-label="Borrar">✕</button></li>`).join('')}</ul></div>`
      : '<div class="empty"><span class="big">⭐</span>Guarda tus sitios favoritos, dónde aparcaste o bares que te gustan (también desde «Cerca de mí» con ⭐).</div>'}
      <button class="fab" aria-label="Guardar lugar">+</button>`;
    view.querySelector('.fab').onclick = () => openPlaceSheet(rerender);
    view.querySelectorAll('[data-del]').forEach((b) => {
      b.onclick = async () => {
        if (!(await confirmSheet('Se borrará este lugar.'))) return;
        update((d) => (d.places = d.places.filter((x) => x.id !== b.dataset.del)));
        rerender();
      };
    });
    // Añadir distancia si ya tenemos la ubicación
    if (places.length) {
      getPosition()
        .then((pos) => {
          places.forEach((p) => {
            const el = view.querySelector(`[data-dist="${p.id}"]`);
            if (el) el.textContent = `A ${fmtDist(distance(pos.lat, pos.lon, p.lat, p.lon))}${p.note ? ' · ' + p.note : ''}`;
          });
        })
        .catch(() => {});
    }
  },
};
