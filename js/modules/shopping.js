import { db, update } from '../store.js';
import { esc, uid, toast, sheet } from '../utils.js';

// Secciones del súper, en el orden habitual de recorrido
const AISLES = [
  { id: 'fruta', name: 'Fruta y verdura', e: '🥦', words: 'manzana platano plátano naranja limon limón tomate lechuga cebolla patata ajo pimiento zanahoria fruta verdura aguacate pepino fresa uva pera calabacin calabacín espinaca champiñon champiñón' },
  { id: 'pan', name: 'Panadería', e: '🥖', words: 'pan barra baguette bolleria bollería croissant tostada' },
  { id: 'carne', name: 'Carne y pescado', e: '🥩', words: 'pollo carne ternera cerdo filete hamburguesa salchicha pescado salmon salmón merluza atun atún gamba jamon jamón pavo chorizo lomo' },
  { id: 'lacteos', name: 'Lácteos y huevos', e: '🥛', words: 'leche yogur yogures queso mantequilla nata huevo huevos kefir' },
  { id: 'despensa', name: 'Despensa', e: '🥫', words: 'arroz pasta macarrones espaguetis aceite sal azucar azúcar harina legumbres lentejas garbanzos tomate frito conserva cafe café cacao cereales galletas especias vinagre' },
  { id: 'bebidas', name: 'Bebidas', e: '🥤', words: 'agua cerveza vino refresco zumo coca cola tonica tónica' },
  { id: 'congelados', name: 'Congelados', e: '🧊', words: 'congelado congelados helado pizza hielo' },
  { id: 'limpieza', name: 'Limpieza y hogar', e: '🧽', words: 'detergente lejia lejía suavizante papel higienico higiénico cocina bolsas basura lavavajillas fregasuelos estropajo servilletas' },
  { id: 'higiene', name: 'Higiene', e: '🧴', words: 'champu champú gel desodorante pasta dientes cepillo cuchillas crema compresas' },
  { id: 'otros', name: 'Otros', e: '📦', words: '' },
];
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
export function guessAisle(text) {
  const t = norm(text);
  const hit = AISLES.find((a) => a.words && norm(a.words).split(' ').some((w) => w.length > 2 && t.includes(w)));
  return hit ? hit.id : 'otros';
}

export const pendingItems = () => db().shopping.filter((i) => !i.done);
export const pendingCount = () => pendingItems().length;

// ---------- Cambios en la lista (cada cambio lleva marca de tiempo «u» para poder sincronizar) ----------
// Devuelve los textos realmente añadidos (no repite lo que ya está pendiente)
export function shopAdd(texts) {
  const have = new Set(pendingItems().map((i) => norm(i.text)));
  const fresh = texts.map((t) => String(t).trim()).filter((t) => t && !have.has(norm(t)) && have.add(norm(t)));
  if (fresh.length) update((d) => fresh.forEach((text) => d.shopping.push({ id: uid(), text, cat: guessAisle(text), done: false, u: Date.now() })));
  return fresh;
}
export function shopSetDone(ids, done = true) {
  update((d) => d.shopping.forEach((i) => ids.includes(i.id) && Object.assign(i, { done, u: Date.now() })));
}
export function shopRemove(ids) {
  update((d) => {
    d.shopping = d.shopping.filter((i) => !ids.includes(i.id));
    ids.forEach((id) => (d.shoppingDeleted[id] = Date.now()));
  });
}

// Mezcla la lista de otra persona: gana la versión más reciente de cada producto
export function mergeShopping(remote) {
  const d = db();
  const deleted = { ...d.shoppingDeleted };
  Object.entries(remote.deleted || {}).forEach(([id, t]) => (deleted[id] = Math.max(deleted[id] || 0, t)));
  const byId = new Map(d.shopping.map((i) => [i.id, i]));
  (remote.items || []).forEach((r) => {
    const l = byId.get(r.id);
    if (!l || (r.u || 0) > (l.u || 0)) byId.set(r.id, r);
  });
  const items = [...byId.values()].filter((i) => !(deleted[i.id] >= (i.u || 0)));
  // Olvidar borrados de hace más de 30 días
  const limit = Date.now() - 30 * 86400000;
  Object.keys(deleted).forEach((id) => deleted[id] < limit && delete deleted[id]);
  const changed = JSON.stringify(items) !== JSON.stringify(d.shopping) || JSON.stringify(deleted) !== JSON.stringify(d.shoppingDeleted);
  if (changed) update((x) => { x.shopping = items; x.shoppingDeleted = deleted; });
  return changed;
}

export default {
  title: 'Lista de la compra',
  quickAdd: (_, view) => view.querySelector('[name=text]')?.focus(),
  render(view, { rerender }) {
    const { shopping, settings } = db();
    const groups = AISLES.map((a) => ({ ...a, items: shopping.filter((i) => i.cat === a.id) })).filter((g) => g.items.length);
    const doneCount = shopping.filter((i) => i.done).length;

    view.innerHTML = `
      ${settings.shareCode ? '<div class="small muted" style="margin:-4px 4px 8px">👫 Lista compartida en directo</div>' : ''}
      <form class="row" style="margin-bottom:12px" data-add>
        <input class="input grow" name="text" placeholder="Añadir (ej: leche, pan, tomates)…" autocomplete="off">
        <button class="btn primary">Añadir</button>
      </form>
      ${groups.length ? groups.map((g) => `
        <div class="section-title">${g.e} ${g.name}</div>
        <div class="card"><ul class="list">${g.items.map((i) => `
          <li class="shop-item ${i.done ? 'done' : ''}">
            <label class="check grow"><input type="checkbox" data-t="${i.id}" ${i.done ? 'checked' : ''}><span class="grow">${esc(i.text)}</span></label>
            <button class="x-btn" data-del="${i.id}" aria-label="Quitar">✕</button>
          </li>`).join('')}</ul></div>`).join('')
        : '<div class="empty"><span class="big">🛒</span>La lista está vacía. Se ordena sola por secciones del súper.</div>'}
      ${doneCount ? `<button class="btn block" data-clear>🧹 Quitar ${doneCount} comprado${doneCount > 1 ? 's' : ''}</button>` : ''}
      ${shopping.some((i) => !i.done) ? '<button class="btn block" data-share style="margin-top:8px">📤 Enviar lista (WhatsApp…)</button>' : ''}
      <p class="small muted" style="text-align:center">${settings.shareCode ? 'Los cambios llegan a la otra persona en unos segundos.' : 'Para compartirla en directo con tu pareja, actívalo en Ajustes → Sincronización.'}</p>`;

    // Enlace compartido: #/compra?add=leche|pan|huevos
    const shared = location.hash.match(/[?&]add=([^&]*)/);
    if (shared) {
      history.replaceState(null, '', '#/compra');
      const items = decodeURIComponent(shared[1]).split('|').map((s) => s.trim()).filter(Boolean).slice(0, 100);
      if (items.length) {
        const s = sheet({
          title: 'Lista compartida',
          body: `<p>Te han compartido ${items.length} producto${items.length > 1 ? 's' : ''}:</p><p class="muted">${esc(items.join(', '))}</p>
            <button class="btn primary block" data-yes>Añadir a mi lista</button>`,
        });
        s.el.querySelector('[data-yes]').onclick = () => {
          const fresh = shopAdd(items);
          s.close();
          toast(`🛒 ${fresh.length} añadidos${items.length > fresh.length ? ` (${items.length - fresh.length} ya los tenías)` : ''}`);
          rerender();
        };
      }
    }

    const form = view.querySelector('[data-add]');
    form.onsubmit = (e) => {
      e.preventDefault();
      // Se pueden añadir varios separados por comas
      if (!shopAdd(form.text.value.split(',')).length) toast('Ya estaba en la lista');
      rerender();
      setTimeout(() => view.querySelector('[name=text]')?.focus(), 0);
    };
    view.querySelectorAll('[data-t]').forEach((c) => (c.onchange = () => { shopSetDone([c.dataset.t], c.checked); rerender(); }));
    view.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => { shopRemove([b.dataset.del]); rerender(); }));
    view.querySelector('[data-clear]')?.addEventListener('click', () => {
      shopRemove(db().shopping.filter((i) => i.done).map((i) => i.id));
      toast('Lista limpia');
      rerender();
    });
    view.querySelector('[data-share]')?.addEventListener('click', async () => {
      const pending = pendingItems().map((i) => i.text);
      const link = `${location.origin}${location.pathname}#/compra?add=${encodeURIComponent(pending.join('|'))}`;
      const text = `🛒 Lista de la compra:\n${pending.map((t) => `- ${t}`).join('\n')}\n\nAñádela a tu Mi Día: ${link}`;
      try {
        if (navigator.share) await navigator.share({ title: 'Lista de la compra', text });
        else {
          await navigator.clipboard.writeText(text);
          toast('Lista copiada: pégala en WhatsApp');
        }
      } catch {}
    });
  },
};
