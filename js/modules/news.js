// Noticias a tu medida: Claude busca en internet lo último de tus equipos y la actualidad.
import { db } from '../store.js';
import { esc, dkey, fmtLong } from '../utils.js';
import { createMessage, hasKey } from '../ai.js';
import { me } from './profile.js';

const KEY = 'midia-news';

export function cachedNews() {
  try {
    const n = JSON.parse(localStorage.getItem(KEY) || 'null');
    return n?.date === dkey() ? n : null;
  } catch {
    return null;
  }
}

// Una línea por noticia: SECCIÓN|titular|resumen|enlace
function parse(text) {
  return text.split('\n').map((l) => l.replace(/^[-•*\s]+/, '').split('|').map((x) => x.trim()))
    .filter((p) => p.length >= 3 && p[1])
    .map(([sec, title, summary, url]) => ({ sec, title, summary, url: /^https?:\/\//.test(url || '') ? url : '' }));
}

let loading = null;
export function fetchNews() {
  loading ??= (async () => {
    const p = me();
    // Haiku no admite la búsqueda con filtrado dinámico: usa la versión básica
    const search = db().settings.model === 'claude-haiku-5-5'
      ? { type: 'web_search_20250305', name: 'web_search', max_uses: 6 }
      : { type: 'web_search_20260209', name: 'web_search', max_uses: 6 };
    const messages = [{ role: 'user', content: `Hoy es ${fmtLong(new Date())} (${dkey()}). Busca en internet las noticias más recientes (últimas 24-48 horas) sobre: ${p.news || 'actualidad general'}. Equipos favoritos: ${p.teams || 'ninguno'}. Ciudad: ${p.city || 'España'}.

Devuelve entre 6 y 9 noticias, priorizando sus equipos (resultados, próximo partido con fecha y hora, lesiones, fichajes), luego LaLiga en general y luego actualidad de España y el mundo. Responde SOLO con una noticia por línea, sin nada más, con este formato exacto:
SECCIÓN|Titular breve|Resumen de una o dos frases|URL de la fuente
SECCIÓN es una palabra corta con emoji, por ejemplo «🟢 Elche», «🔵🔴 Barça», «⚽ LaLiga», «🌍 Actualidad». No inventes nada que no hayas encontrado.` }];
    let text = '';
    for (let step = 0; step < 4; step++) {
      const resp = await createMessage({ system: 'Eres un editor de noticias que escribe en español de España, claro y neutral.', messages, tools: [search], maxTokens: 8000 });
      if (resp.stop_reason === 'refusal') throw new Error('Claude no ha podido preparar las noticias.');
      text = resp.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
      if (resp.stop_reason !== 'pause_turn') break;
      messages.push({ role: 'assistant', content: resp.content }); // la búsqueda sigue en marcha: continuar
    }
    const items = parse(text);
    if (!items.length) throw new Error('No se han encontrado noticias; inténtalo de nuevo.');
    const out = { date: dkey(), at: Date.now(), items };
    try { localStorage.setItem(KEY, JSON.stringify(out)); } catch {}
    return out;
  })().finally(() => (loading = null));
  return loading;
}

export const newsList = (items) => `<ul class="list">${items.map((n) => `
  <li style="align-items:flex-start"><div class="grow">
    <div class="small muted" style="font-weight:700">${esc(n.sec)}</div>
    <div style="font-weight:700">${n.url ? `<a href="${esc(n.url)}" target="_blank" rel="noopener" style="color:inherit">${esc(n.title)}</a>` : esc(n.title)}</div>
    ${n.summary ? `<div class="small muted">${esc(n.summary)}</div>` : ''}
  </div></li>`).join('')}</ul>`;

export default {
  title: 'Noticias',
  render(view) {
    const draw = (n, msg = '') => {
      view.innerHTML = `
        <div class="card">
          <h2>📰 Tus noticias ${n ? `<span class="badge" style="margin-left:auto">${new Date(n.at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</span>` : ''}</h2>
          <p class="small muted" style="margin-top:0">Según tus intereses en «Sobre mí»: ${esc(me().news || 'actualidad general')}. <a href="#/perfil">Cambiar</a></p>
          ${msg}
          ${n ? newsList(n.items) : ''}
          ${hasKey() ? `<button class="btn ${n ? '' : 'primary'} block" data-load style="margin-top:8px">${n ? '↻ Actualizar' : '✨ Buscar noticias de hoy'}</button>`
            : '<p class="small warn-text">Añade tu clave de Anthropic en Ajustes para ver noticias.</p>'}
        </div>`;
      view.querySelector('[data-load]')?.addEventListener('click', load);
    };
    const load = () => {
      draw(cachedNews(), '<p class="muted small">🔎 Buscando lo último… (tarda unos segundos)</p>');
      fetchNews().then((n) => alive && draw(n)).catch((e) => alive && draw(cachedNews(), `<p class="small warn-text">${esc(e.message)}</p>`));
    };
    let alive = true;
    draw(cachedNews());
    return () => (alive = false);
  },
};
