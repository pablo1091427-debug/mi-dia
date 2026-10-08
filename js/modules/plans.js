// Planes del finde: Claude propone planes según el tiempo, tu zona y tus gustos.
import { db, update } from '../store.js';
import { esc, dkey, parseKey, addDays, toast } from '../utils.js';
import { askText, hasKey } from '../ai.js';
import { fetchWeather, wInfo } from './weather.js';
import { PLACE_CATS } from './bars.js';

const CACHE = 'midia-plans';

// Próximo sábado y domingo (o los de hoy si ya es finde)
function weekend() {
  const t = new Date();
  const dow = t.getDay();
  const sat = dow === 0 ? addDays(t, -1) : addDays(t, (6 - dow + 7) % 7);
  return [dkey(sat), dkey(addDays(sat, 1))];
}

export default {
  title: 'Planes del finde',
  render(view, { rerender }) {
    const [sat, sun] = weekend();
    let cached = null;
    try { cached = JSON.parse(localStorage.getItem(CACHE) || 'null'); } catch {}
    if (cached?.sat !== sat) cached = null;
    const d = db();
    view.innerHTML = `
      <div class="card" id="wk"><span class="muted">Cargando el tiempo del finde…</span></div>
      <div class="card">
        <label class="field"><span>¿Qué te gusta hacer?</span>
          <input class="input" data-interests value="${esc(d.settings.interests)}" placeholder="Senderismo, tapas, cine, playa, planes con niños…"></label>
        <label class="field"><span>¿Con quién?</span><select class="input" data-who>
          <option>Solo</option><option>En pareja</option><option>Con amigos</option><option>En familia con niños</option></select></label>
        <button class="btn primary block" data-go>🤖 Proponer planes</button>
      </div>
      <div id="out">${cached ? `<div class="card"><h2>Tus planes</h2><div class="ai-box">${esc(cached.text)}</div></div>` : ''}</div>`;

    let forecast = '';
    let place = '';
    fetchWeather()
      .then(({ w, place: p }) => {
        place = p;
        const rows = [sat, sun].map((k) => {
          const i = w.daily.time.indexOf(k);
          if (i < 0) return '';
          const wi = wInfo(w.daily.weather_code[i]);
          forecast += `${k === sat ? 'Sábado' : 'Domingo'}: ${wi.t}, máx ${Math.round(w.daily.temperature_2m_max[i])}°, mín ${Math.round(w.daily.temperature_2m_min[i])}°, lluvia ${w.daily.precipitation_probability_max[i]}%. `;
          return `<div class="day-row"><b>${k === sat ? 'Sábado' : 'Domingo'}</b><span style="font-size:22px">${wi.e}</span><span class="small muted">${wi.t}${w.daily.precipitation_probability_max[i] ? ` · 💧${w.daily.precipitation_probability_max[i]}%` : ''}</span><span class="right"><b>${Math.round(w.daily.temperature_2m_max[i])}°</b> <span class="muted">${Math.round(w.daily.temperature_2m_min[i])}°</span></span></div>`;
        }).join('');
        const box = view.querySelector('#wk');
        if (box) box.innerHTML = `<h2>🌤️ El finde en ${esc(place || 'tu zona')}</h2>${rows || '<span class="muted small">Sin previsión todavía.</span>'}`;
      })
      .catch(() => { const box = view.querySelector('#wk'); if (box) box.innerHTML = '<span class="muted small">Activa la ubicación para tener en cuenta el tiempo.</span>'; });

    view.querySelector('[data-interests]').onchange = (e) => update((x) => (x.settings.interests = e.target.value.trim()));
    view.querySelector('[data-go]').onclick = async () => {
      if (!hasKey()) return toast('Añade tu clave de Anthropic en Ajustes');
      const out = view.querySelector('#out');
      out.innerHTML = '<p class="muted">🤖 Pensando planes…</p>';
      const favs = d.places.filter((p) => (p.rating || 0) >= 4 || p.cat === 'fav').map((p) => `${p.name} (${(PLACE_CATS.find((c) => c.id === p.cat) || {}).name || 'favorito'})`);
      try {
        const text = await askText({
          system: 'Propones planes de fin de semana concretos y realistas, en español y en texto plano sin Markdown. Adapta los planes al tiempo (si llueve, planes de interior). Da 5 planes variados con: nombre del plan, sábado o domingo y franja, qué hacer y una idea para comer. Usa sitios reales y conocidos de la zona solo si estás seguro de que existen; si no, describe el tipo de sitio.',
          content: `Zona: ${place || 'desconocida'}. Fin de semana: sábado ${sat} y domingo ${sun}. Tiempo: ${forecast || 'desconocido'}. Gustos: ${view.querySelector('[data-interests]').value || 'variados'}. Plan: ${view.querySelector('[data-who]').value}. Sitios favoritos guardados: ${favs.join(', ') || 'ninguno'}.`,
          effort: 'medium',
        });
        try { localStorage.setItem(CACHE, JSON.stringify({ sat, text })); } catch {}
        out.innerHTML = `<div class="card"><h2>Tus planes</h2><div class="ai-box">${esc(text)}</div></div>`;
      } catch (e) {
        out.innerHTML = `<p class="warn-text">${esc(e.message)}</p>`;
      }
    };
  },
};
