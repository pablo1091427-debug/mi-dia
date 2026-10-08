// Datos útiles: Wi-Fi, tallas, números de documentos… protegidos con la huella.
// Nunca se envían al asistente y no viajan en copias ni sincronización salvo que lo actives.
import { db, update } from '../store.js';
import { esc, uid, toast, sheet, confirmSheet } from '../utils.js';
import { lockSupported, lockEnabled, enableLock, verify } from '../lock.js';

const CATS = {
  wifi: { e: '📶', name: 'Wi-Fi', fields: ['Red (SSID)', 'Contraseña'] },
  sizes: { e: '👕', name: 'Tallas', fields: ['Persona', 'Camiseta', 'Pantalón', 'Calzado', 'Anillo'] },
  docs: { e: '🪪', name: 'Documentos', fields: ['Número', 'Caduca'] },
  home: { e: '🏠', name: 'Casa', fields: ['Dato', 'Valor'] },
  other: { e: '🗂️', name: 'Otros', fields: ['Dato', 'Valor'] },
};
const SECRET = /contraseña|clave|pin|número|numero|iban|cuenta|password/i;
const UNLOCK_MINUTES = 5;
let unlockedUntil = 0;

function openItemSheet(onSaved, item) {
  const it = item || { cat: 'wifi', title: '', fields: CATS.wifi.fields.map((k) => ({ k, v: '' })) };
  const s = sheet({
    title: item ? 'Editar' : 'Nuevo dato',
    body: `<form>
      <label class="field"><span>Tipo</span><select class="input" name="cat">${Object.entries(CATS).map(([k, c]) => `<option value="${k}" ${k === it.cat ? 'selected' : ''}>${c.e} ${c.name}</option>`).join('')}</select></label>
      <label class="field"><span>Nombre</span><input class="input" name="title" required value="${esc(it.title)}" placeholder="Wi-Fi de casa, Tallas de Laura…"></label>
      <div data-fields></div>
      <button type="button" class="btn small" data-addf>+ Campo</button>
      <button class="btn primary block" style="margin-top:10px">Guardar</button>
      ${item ? '<button type="button" class="btn danger block" data-del style="margin-top:6px">Borrar</button>' : ''}</form>`,
  });
  const f = s.el.querySelector('form');
  let fields = it.fields.map((x) => ({ ...x }));
  const box = s.el.querySelector('[data-fields]');
  const draw = () => {
    box.innerHTML = fields.map((x, i) => `<div class="row" style="margin-bottom:8px">
      <input class="input" style="width:40%" data-k="${i}" value="${esc(x.k)}" placeholder="Campo">
      <input class="input grow" data-v="${i}" value="${esc(x.v)}" placeholder="Valor" autocomplete="off">
      <button type="button" class="x-btn" data-rm="${i}" aria-label="Quitar">✕</button></div>`).join('');
    box.querySelectorAll('[data-k]').forEach((inp) => (inp.oninput = () => (fields[+inp.dataset.k].k = inp.value)));
    box.querySelectorAll('[data-v]').forEach((inp) => (inp.oninput = () => (fields[+inp.dataset.v].v = inp.value)));
    box.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = () => { fields.splice(+b.dataset.rm, 1); draw(); }));
  };
  draw();
  f.cat.onchange = () => {
    if (fields.every((x) => !x.v)) { fields = CATS[f.cat.value].fields.map((k) => ({ k, v: '' })); draw(); }
  };
  s.el.querySelector('[data-addf]').onclick = () => { fields.push({ k: '', v: '' }); draw(); };
  f.onsubmit = (e) => {
    e.preventDefault();
    const clean = fields.filter((x) => x.k.trim() || x.v.trim()).map((x) => ({ k: x.k.trim(), v: x.v.trim() }));
    const data = { cat: f.cat.value, title: f.title.value.trim(), fields: clean };
    update((d) => {
      if (item) Object.assign(d.vault.find((x) => x.id === item.id), data);
      else d.vault.push({ id: uid(), ...data });
    });
    s.close();
    onSaved?.();
  };
  s.el.querySelector('[data-del]')?.addEventListener('click', async () => {
    if (!(await confirmSheet('Se borrará este dato.'))) return;
    update((d) => (d.vault = d.vault.filter((x) => x.id !== item.id)));
    s.close();
    onSaved?.();
  });
}

const revealed = new Set();

export default {
  title: 'Datos útiles',
  render(view, { rerender }) {
    // Pantalla de bloqueo propia de esta sección
    if (lockEnabled() && Date.now() > unlockedUntil) {
      view.innerHTML = `<div class="empty"><span class="big">🔐</span>Tus datos útiles están protegidos.<br><br><button class="btn primary" data-unlock>👆 Ver con huella</button></div>`;
      const go = () => verify().then(() => { unlockedUntil = Date.now() + UNLOCK_MINUTES * 60000; rerender(); }).catch(() => toast('No se pudo verificar'));
      view.querySelector('[data-unlock]').onclick = go;
      go();
      return;
    }
    const items = [...db().vault].sort((a, b) => a.cat.localeCompare(b.cat) || a.title.localeCompare(b.title));
    view.innerHTML = `
      ${lockEnabled() ? '' : `<div class="card small row"><span class="grow">⚠️ Activa la huella para proteger esta sección.</span><button class="btn small primary" data-enable>Activar</button></div>`}
      ${items.length ? items.map((it) => `
        <div class="card">
          <h2>${CATS[it.cat]?.e || '🗂️'} ${esc(it.title)}<button class="x-btn" data-edit="${it.id}" style="margin-left:auto" aria-label="Editar">✏️</button></h2>
          ${it.fields.map((x, i) => {
            const key = `${it.id}:${i}`;
            const hidden = SECRET.test(x.k) && !revealed.has(key);
            return `<div class="row" style="padding:6px 0;border-top:1px solid var(--border)">
              <span class="small muted" style="width:38%">${esc(x.k)}</span>
              <span class="grow" style="font-weight:600;word-break:break-all">${hidden ? '••••••••' : esc(x.v)}</span>
              ${SECRET.test(x.k) ? `<button class="x-btn" data-eye="${key}" aria-label="Mostrar u ocultar">${hidden ? '👁️' : '🙈'}</button>` : ''}
              <button class="x-btn" data-copy="${key}" aria-label="Copiar">📋</button></div>`;
          }).join('')}
        </div>`).join('')
      : '<div class="empty"><span class="big">🗂️</span>Guarda datos que siempre buscas: la Wi-Fi de casa, las tallas de la familia, el número del seguro…</div>'}
      <p class="small muted" style="text-align:center">No se envían al asistente. ${db().settings.vaultSync ? 'Se incluyen en copias y sincronización.' : 'No salen de este móvil (puedes cambiarlo en Ajustes).'}</p>
      <button class="fab" aria-label="Nuevo dato">+</button>`;
    view.querySelector('.fab').onclick = () => openItemSheet(rerender);
    view.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => openItemSheet(rerender, db().vault.find((x) => x.id === b.dataset.edit))));
    view.querySelectorAll('[data-eye]').forEach((b) => (b.onclick = () => { revealed.has(b.dataset.eye) ? revealed.delete(b.dataset.eye) : revealed.add(b.dataset.eye); rerender(); }));
    view.querySelectorAll('[data-copy]').forEach((b) => (b.onclick = () => {
      const [id, i] = b.dataset.copy.split(':');
      navigator.clipboard.writeText(db().vault.find((x) => x.id === id).fields[+i].v).then(() => toast('📋 Copiado')).catch(() => toast('No se pudo copiar'));
    }));
    view.querySelector('[data-enable]')?.addEventListener('click', async () => {
      if (!(await lockSupported())) return toast('Este dispositivo no tiene huella o bloqueo compatible');
      try { await enableLock(); unlockedUntil = Date.now() + UNLOCK_MINUTES * 60000; toast('🔒 Huella activada'); rerender(); } catch { toast('No se pudo activar'); }
    });
    // Al salir de la sección, se vuelve a bloquear
    return () => { if (!location.hash.startsWith('#/datos')) { unlockedUntil = 0; revealed.clear(); } };
  },
};
