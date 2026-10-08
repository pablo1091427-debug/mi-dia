// Cocina: recetas con lo que tienes en la nevera (texto o foto); lo que falta va a la compra.
import { db, update } from '../store.js';
import { esc, uid, toast, confirmSheet } from '../utils.js';
import { imageToBase64, tabsHtml, bindTabs } from '../ui.js';
import { askJSON, imageBlock, objSchema, hasKey } from '../ai.js';
import { shopAdd } from './shopping.js';

const SCHEMA = objSchema({
  recetas: {
    type: 'array',
    items: objSchema({
      titulo: { type: 'string' },
      minutos: { type: 'integer' },
      dificultad: { type: 'string', enum: ['fácil', 'media', 'difícil'] },
      ingredientes: { type: 'array', items: objSchema({ nombre: { type: 'string', description: 'Ingrediente con cantidad, p. ej. «2 huevos»' }, lo_tengo: { type: 'boolean' } }) },
      pasos: { type: 'array', items: { type: 'string' } },
    }),
  },
});

let results = [];
let tab = 'buscar';
let photo = null;

function recipeCard(r, i, saved) {
  const missing = r.ingredientes.filter((x) => !x.lo_tengo);
  return `<div class="card">
    <h2>${esc(r.titulo)}</h2>
    <div class="small muted" style="margin:-4px 0 8px">⏱️ ${r.minutos} min · ${esc(r.dificultad)}${missing.length ? ` · faltan ${missing.length}` : ' · ¡lo tienes todo!'}</div>
    <details><summary class="small" style="cursor:pointer">Ver ingredientes y pasos</summary>
      <ul class="small" style="padding-left:18px">${r.ingredientes.map((x) => `<li style="${x.lo_tengo ? '' : 'color:var(--danger)'}">${esc(x.nombre)}${x.lo_tengo ? '' : ' (falta)'}</li>`).join('')}</ul>
      <ol class="small" style="padding-left:18px">${r.pasos.map((p) => `<li style="margin-bottom:4px">${esc(p)}</li>`).join('')}</ol>
    </details>
    <div class="row wrap" style="margin-top:8px;gap:8px">
      ${missing.length ? `<button class="btn small" data-shop="${i}">🛒 Añadir lo que falta</button>` : ''}
      ${saved ? `<button class="btn small danger" data-unsave="${r.id}">Quitar</button>` : `<button class="btn small" data-save="${i}">⭐ Guardar</button>`}
    </div></div>`;
}

export default {
  title: 'Cocina',
  render(view, { rerender }) {
    const saved = db().recipes;
    const list = tab === 'buscar' ? results : saved;
    view.innerHTML = `
      ${tabsHtml([['buscar', 'Qué cocino'], ['guardadas', `Guardadas (${saved.length})`]], tab)}
      ${tab === 'buscar' ? `
        <div class="card">
          <label class="field"><span>¿Qué tienes en la nevera y la despensa?</span>
            <textarea class="input" data-have rows="3" placeholder="Pollo, arroz, pimientos, cebolla, huevos…"></textarea></label>
          <div class="row wrap" style="gap:8px;margin-bottom:10px">
            <label class="btn grow">📷 ${photo ? 'Foto lista ✓' : 'Foto de la nevera'}<input type="file" accept="image/*" capture="environment" data-photo hidden></label>
            <select class="input grow" data-pref style="width:auto"><option value="">Cualquier receta</option><option>Rápida (menos de 20 min)</option><option>Sana y ligera</option><option>Para llevar en tupper</option><option>Vegetariana</option><option>Para impresionar</option></select>
          </div>
          <button class="btn primary block" data-go>🤖 Proponer recetas</button>
          <p class="small muted" style="margin-bottom:0">Puedes usar también la lista de la compra como referencia.</p>
        </div>
        <div id="status"></div>` : ''}
      ${list.map((r, i) => recipeCard(r, i, tab === 'guardadas')).join('') || (tab === 'guardadas' ? '<div class="empty small">Guarda recetas con ⭐ para tenerlas a mano.</div>' : '')}`;

    bindTabs(view, (t) => { tab = t; rerender(); });
    view.querySelector('[data-photo]')?.addEventListener('change', async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      photo = await imageToBase64(f, 1280);
      toast('Foto lista');
      e.target.closest('label').firstChild.textContent = '📷 Foto lista ✓';
    });
    view.querySelector('[data-go]')?.addEventListener('click', async () => {
      if (!hasKey()) return toast('Añade tu clave de Anthropic en Ajustes');
      const have = view.querySelector('[data-have]').value.trim();
      if (!have && !photo) return toast('Escribe lo que tienes o haz una foto');
      const status = view.querySelector('#status');
      status.innerHTML = '<p class="muted">🤖 Pensando recetas…</p>';
      const content = [];
      if (photo) content.push(imageBlock(photo));
      content.push({ type: 'text', text: `Ingredientes que tengo: ${have || '(mira la foto)'}. Preferencia: ${view.querySelector('[data-pref]').value || 'ninguna'}. Propón 3 recetas caseras españolas o internacionales sencillas que aprovechen sobre todo lo que tengo. Marca lo_tengo=false en los ingredientes que no tengo (sal, aceite y especias básicas se suponen en casa).` });
      try {
        const r = await askJSON({ system: 'Eres un cocinero casero práctico. Respondes en español. Pasos claros y cortos.', content, schema: SCHEMA, maxTokens: 8000 });
        results = r.recetas;
        photo = null;
        rerender();
      } catch (e) {
        status.innerHTML = `<p class="warn-text">${esc(e.message)}</p>`;
      }
    });
    view.querySelectorAll('[data-shop]').forEach((b) => (b.onclick = () => {
      const r = list[+b.dataset.shop];
      const items = r.ingredientes.filter((x) => !x.lo_tengo).map((x) => x.nombre);
      const fresh = shopAdd(items);
      toast(`🛒 ${fresh.length} ingredientes añadidos a la compra`);
    }));
    view.querySelectorAll('[data-save]').forEach((b) => (b.onclick = () => {
      update((d) => d.recipes.unshift({ id: uid(), ...results[+b.dataset.save] }));
      toast('⭐ Receta guardada');
      rerender();
    }));
    view.querySelectorAll('[data-unsave]').forEach((b) => (b.onclick = async () => {
      if (!(await confirmSheet('Se quitará de tus recetas guardadas.', 'Quitar'))) return;
      update((d) => (d.recipes = d.recipes.filter((x) => x.id !== b.dataset.unsave)));
      rerender();
    }));
  },
};
