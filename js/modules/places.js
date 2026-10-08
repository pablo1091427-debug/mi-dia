import { db, update } from '../store.js';
import { esc, uid, getPosition, distance, fmtDist, mapsLink, toast, sheet, confirmSheet, loadScript, loadCss } from '../utils.js';
import { starsHtml, bindStars, starsText, tabsHtml, bindTabs } from '../ui.js';
import { PLACE_CATS } from './bars.js';

const EXTRA = [{ id: 'fav', e: '⭐', name: 'Favorito' }, { id: 'parking', e: '🅿️', name: 'Aparcamiento' }, { id: 'home', e: '🏠', name: 'Casa / trabajo' }];
const ALL = [...EXTRA, ...PLACE_CATS];
const icon = (cat) => (ALL.find((c) => c.id === cat) || EXTRA[0]).e;
const catOptions = (sel) => ALL.map((c) => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${c.e} ${c.name}</option>`).join('');

function openPlaceSheet(onSaved) {
  const s = sheet({
    title: 'Guardar mi ubicación actual',
    body: `
      <form>
        <label class="field"><span>Nombre</span><input class="input" name="name" required placeholder="Dónde he aparcado, bar de Juan…"></label>
        <label class="field"><span>Nota</span><input class="input" name="note" placeholder="Opcional"></label>
        <label class="field"><span>Tipo</span><select class="input" name="cat">${catOptions('fav')}</select></label>
        <div class="field"><span>Mi valoración</span>${starsHtml(0)}</div>
        <button class="btn primary block">📍 Guardar aquí</button>
      </form>`,
  });
  bindStars(s.el);
  const f = s.el.querySelector('form');
  f.onsubmit = async (e) => {
    e.preventDefault();
    const btn = f.querySelector('button.primary');
    btn.disabled = true;
    btn.textContent = 'Obteniendo ubicación…';
    try {
      const pos = await getPosition({ force: true });
      const rating = +s.el.querySelector('[data-stars]').dataset.value;
      update((d) => d.places.unshift({ id: uid(), name: f.name.value.trim(), note: f.note.value.trim(), lat: pos.lat, lon: pos.lon, cat: f.cat.value, rating }));
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

function openEditSheet(p, onSaved) {
  const s = sheet({
    title: p.name,
    body: `<form>
      <label class="field"><span>Nombre</span><input class="input" name="name" required value="${esc(p.name)}"></label>
      <label class="field"><span>Nota</span><input class="input" name="note" value="${esc(p.note)}"></label>
      <label class="field"><span>Tipo</span><select class="input" name="cat">${catOptions(p.cat)}</select></label>
      <div class="field"><span>Mi valoración</span>${starsHtml(p.rating || 0)}</div>
      <div class="row"><a class="btn grow" href="${mapsLink(p.lat, p.lon)}" target="_blank" rel="noopener">🧭 Cómo llegar</a><button class="btn primary grow">Guardar</button></div>
      <button type="button" class="btn danger block" data-del style="margin-top:6px">Borrar lugar</button></form>`,
  });
  bindStars(s.el);
  const f = s.el.querySelector('form');
  f.onsubmit = (e) => {
    e.preventDefault();
    update((d) => Object.assign(d.places.find((x) => x.id === p.id), { name: f.name.value.trim(), note: f.note.value.trim(), cat: f.cat.value, rating: +s.el.querySelector('[data-stars]').dataset.value }));
    s.close();
    onSaved?.();
  };
  s.el.querySelector('[data-del]').onclick = async () => {
    if (!(await confirmSheet('Se borrará este lugar.'))) return;
    update((d) => (d.places = d.places.filter((x) => x.id !== p.id)));
    s.close();
    onSaved?.();
  };
}

let mode = 'lista';
let sortBy = 'recientes';

export default {
  title: 'Mis lugares',
  render(view, { rerender }) {
    let places = [...db().places];
    if (sortBy === 'valoracion') places.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    view.innerHTML = `
      ${places.length ? tabsHtml([['lista', '📋 Lista'], ['mapa', '🗺️ Mapa']], mode) : ''}
      ${!places.length ? '<div class="empty"><span class="big">⭐</span>Guarda tus sitios favoritos con tu propia valoración, dónde aparcaste o bares que te gustan (también desde «Cerca de mí» con ⭐).</div>'
        : mode === 'mapa' ? '<div class="map" id="pmap" style="height:60dvh"></div>'
        : `<div class="chips" style="margin-bottom:10px"><button class="chip ${sortBy === 'recientes' ? 'active' : ''}" data-sort="recientes">Recientes</button><button class="chip ${sortBy === 'valoracion' ? 'active' : ''}" data-sort="valoracion">Mejor valorados</button></div>
          <div class="card"><ul class="list">${places.map((p) => `
          <li data-edit="${p.id}" style="cursor:pointer"><span class="emoji">${icon(p.cat)}</span>
            <div class="grow"><div class="ellipsis" style="font-weight:600">${esc(p.name)}</div>
              ${p.rating ? `<div class="small" style="color:#f59e0b">${starsText(p.rating)}</div>` : ''}
              <div class="small muted ellipsis" data-dist="${p.id}">${esc(p.note)}</div></div>
            <a class="btn small" href="${mapsLink(p.lat, p.lon)}" target="_blank" rel="noopener" data-stop>Ir</a></li>`).join('')}</ul></div>`}
      <button class="fab" aria-label="Guardar lugar">+</button>`;

    bindTabs(view, (t) => { mode = t; rerender(); });
    view.querySelectorAll('[data-sort]').forEach((b) => (b.onclick = () => { sortBy = b.dataset.sort; rerender(); }));
    view.querySelector('.fab').onclick = () => openPlaceSheet(rerender);
    view.querySelectorAll('[data-stop]').forEach((a) => a.addEventListener('click', (e) => e.stopPropagation()));
    view.querySelectorAll('[data-edit]').forEach((li) => (li.onclick = () => openEditSheet(db().places.find((p) => p.id === li.dataset.edit), rerender)));

    let map = null;
    if (places.length && mode === 'mapa') {
      loadCss('https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css');
      loadScript('https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js').then(() => {
        const el = view.querySelector('#pmap');
        if (!el) return;
        map = L.map(el, { zoomControl: false });
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
        const pts = places.map((p) => {
          L.circleMarker([p.lat, p.lon], { radius: 9, color: '#fff', weight: 2, fillColor: '#ea580c', fillOpacity: 0.95 }).addTo(map)
            .bindPopup(`<b>${esc(p.name)}</b>${p.rating ? `<br>${starsText(p.rating)}` : ''}${p.note ? `<br>${esc(p.note)}` : ''}<br><a href="${mapsLink(p.lat, p.lon)}" target="_blank" rel="noopener">Cómo llegar</a>`);
          return [p.lat, p.lon];
        });
        map.fitBounds(pts, { padding: [30, 30], maxZoom: 15 });
      }).catch(() => toast('No se pudo cargar el mapa'));
    } else if (places.length) {
      getPosition().then((pos) => places.forEach((p) => {
        const el = view.querySelector(`[data-dist="${p.id}"]`);
        if (el) el.textContent = `A ${fmtDist(distance(pos.lat, pos.lon, p.lat, p.lon))}${p.note ? ' · ' + p.note : ''}`;
      })).catch(() => {});
    }
    return () => map?.remove();
  },
};
