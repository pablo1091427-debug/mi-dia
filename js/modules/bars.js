import { update } from '../store.js';
import { esc, uid, getPosition, distance, fmtDist, loadScript, loadCss, mapsLink, toast } from '../utils.js';

const LEAFLET_JS = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
const LEAFLET_CSS = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';

export const PLACE_CATS = [
  { id: 'bar', name: 'Bares', e: '🍺', q: '"amenity"~"^(bar|pub|biergarten)$"' },
  { id: 'cafe', name: 'Cafeterías', e: '☕', q: '"amenity"="cafe"' },
  { id: 'restaurant', name: 'Restaurantes', e: '🍽️', q: '"amenity"="restaurant"' },
  { id: 'fast', name: 'Comida rápida', e: '🍔', q: '"amenity"~"^(fast_food|ice_cream)$"' },
  { id: 'super', name: 'Súper', e: '🛒', q: '"shop"~"^(supermarket|convenience)$"' },
  { id: 'pharmacy', name: 'Farmacias', e: '💊', q: '"amenity"="pharmacy"' },
];

let cat = 'bar';
let radius = 1000;
const cache = new Map();

async function search(pos) {
  const k = `${cat}|${radius}|${pos.lat.toFixed(3)}|${pos.lon.toFixed(3)}`;
  if (cache.has(k)) return cache.get(k);
  const c = PLACE_CATS.find((x) => x.id === cat);
  const q = `[out:json][timeout:25];nwr[${c.q}](around:${radius},${pos.lat},${pos.lon});out center 100;`;
  const res = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: 'data=' + encodeURIComponent(q) });
  if (!res.ok) throw new Error('El servicio de mapas está ocupado, prueba en unos segundos');
  const json = await res.json();
  const list = json.elements
    .map((e) => {
      const lat = e.lat ?? e.center?.lat;
      const lon = e.lon ?? e.center?.lon;
      const t = e.tags || {};
      return {
        id: e.id, name: t.name, lat, lon, dist: distance(pos.lat, pos.lon, lat, lon),
        hours: t.opening_hours, cuisine: t.cuisine, street: [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' '),
        phone: t.phone || t['contact:phone'], terrace: t.outdoor_seating === 'yes',
      };
    })
    .filter((p) => p.name && p.lat)
    .sort((a, b) => a.dist - b.dist);
  cache.set(k, list);
  return list;
}

export default {
  title: 'Cerca de mí',
  render(view) {
    let map = null;
    let layer = null;
    view.innerHTML = `
      <div class="chips" data-cats>${PLACE_CATS.map((c) => `<button class="chip ${c.id === cat ? 'active' : ''}" data-c="${c.id}">${c.e} ${c.name}</button>`).join('')}</div>
      <div class="chips" style="margin:8px 0 12px" data-rad>${[500, 1000, 2000, 5000].map((r) => `<button class="chip ${r === radius ? 'active' : ''}" data-r="${r}">${fmtDist(r)}</button>`).join('')}</div>
      <div class="map" id="map"></div>
      <div id="results"><div class="empty"><span class="big">📍</span>Buscando tu ubicación…</div></div>`;

    const results = view.querySelector('#results');

    const draw = async () => {
      results.innerHTML = '<div class="empty"><span class="big">⏳</span>Buscando sitios cercanos…</div>';
      try {
        const pos = await getPosition();
        const [list] = await Promise.all([search(pos), setupMap(pos)]);
        layer.clearLayers();
        L.circleMarker([pos.lat, pos.lon], { radius: 8, color: '#fff', weight: 3, fillColor: '#4f46e5', fillOpacity: 1 }).addTo(layer).bindPopup('Estás aquí');
        list.slice(0, 60).forEach((p) => L.circleMarker([p.lat, p.lon], { radius: 7, color: '#fff', weight: 2, fillColor: '#ea580c', fillOpacity: 0.95 }).addTo(layer).bindPopup(`<b>${esc(p.name)}</b><br>${fmtDist(p.dist)}`));
        const zoom = { 500: 16, 1000: 15, 2000: 14, 5000: 13 }[radius];
        map.setView([pos.lat, pos.lon], zoom);

        if (!list.length) {
          results.innerHTML = '<div class="empty"><span class="big">🤷</span>No hay resultados en este radio. Prueba a ampliarlo.</div>';
          return;
        }
        results.innerHTML = `<div class="card"><ul class="list">${list.slice(0, 60).map((p, i) => `
          <li>
            <div class="grow">
              <div class="ellipsis" style="font-weight:600">${esc(p.name)}</div>
              <div class="small muted ellipsis">${fmtDist(p.dist)}${p.street ? ' · ' + esc(p.street) : ''}${p.terrace ? ' · ☀️ terraza' : ''}</div>
              ${p.hours ? `<div class="small muted ellipsis">🕒 ${esc(p.hours)}</div>` : ''}
            </div>
            <button class="x-btn" data-save="${i}" aria-label="Guardar en mis lugares">⭐</button>
            <a class="btn small" href="${mapsLink(p.lat, p.lon)}" target="_blank" rel="noopener">Ir</a>
          </li>`).join('')}</ul></div>
          <p class="small muted" style="text-align:center">Datos de © OpenStreetMap</p>`;
        results.querySelectorAll('[data-save]').forEach((b) => {
          b.onclick = () => {
            const p = list[+b.dataset.save];
            update((d) => d.places.unshift({ id: uid(), name: p.name, note: p.street || '', lat: p.lat, lon: p.lon, cat }));
            toast(`⭐ ${p.name} guardado en Mis lugares`);
          };
        });
      } catch (e) {
        results.innerHTML = `<div class="empty"><span class="big">⚠️</span>${esc(e.message)}<br><br><button class="btn primary" data-retry>Reintentar</button></div>`;
        results.querySelector('[data-retry]').onclick = draw;
      }
    };

    async function setupMap(pos) {
      if (map) return;
      loadCss(LEAFLET_CSS);
      await loadScript(LEAFLET_JS);
      map = L.map(view.querySelector('#map'), { zoomControl: false, attributionControl: true }).setView([pos.lat, pos.lon], 15);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
      layer = L.layerGroup().addTo(map);
    }

    view.querySelectorAll('[data-c]').forEach((b) => {
      b.onclick = () => {
        cat = b.dataset.c;
        view.querySelectorAll('[data-c]').forEach((x) => x.classList.toggle('active', x === b));
        draw();
      };
    });
    view.querySelectorAll('[data-r]').forEach((b) => {
      b.onclick = () => {
        radius = +b.dataset.r;
        view.querySelectorAll('[data-r]').forEach((x) => x.classList.toggle('active', x === b));
        draw();
      };
    });
    draw();
    return () => map?.remove();
  },
};
