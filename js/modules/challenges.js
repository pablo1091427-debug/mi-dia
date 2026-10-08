// Retos personales con progreso y medallas (30 días sin azúcar, 10.000 pasos, ahorrar 100 €…).
import { db, update } from '../store.js';
import { esc, uid, dkey, parseKey, addDays, toast, sheet, confirmSheet } from '../utils.js';
import { tabsHtml, bindTabs } from '../ui.js';

const TEMPLATES = [
  ['🍬', '30 días sin azúcar', 'daily', 30, true, ''],
  ['🍺', 'Un mes sin alcohol', 'daily', 30, true, ''],
  ['🚶', '10.000 pasos al día', 'daily', 30, false, ''],
  ['📖', 'Leer 20 páginas al día', 'daily', 21, false, ''],
  ['🧘', 'Meditar 10 minutos', 'daily', 21, false, ''],
  ['📵', 'Sin móvil en la cama', 'daily', 14, false, ''],
  ['💶', 'Ahorrar 100 € este mes', 'amount', 100, false, '€'],
  ['🏃', 'Correr 50 km este mes', 'amount', 50, false, 'km'],
];
const MEDALS = [[0.25, '🥉', 'Bronce'], [0.5, '🥈', 'Plata'], [1, '🥇', 'Oro']];

// Racha de días seguidos marcados hasta hoy (o ayer)
function streak(c) {
  let cursor = c.log[dkey()] ? new Date() : addDays(new Date(), -1);
  let n = 0;
  while (c.log[dkey(cursor)] && dkey(cursor) >= c.start) { n++; cursor = addDays(cursor, -1); }
  return n;
}
// Un reto «seguido» se rompe si falta algún día entre el inicio y ayer
const broken = (c) => c.strict && c.type === 'daily' && !c.done && dkey(addDays(new Date(), -1)) >= c.start && streak(c) < Math.round((parseKey(dkey()) - parseKey(c.start)) / 86400000);

export function progress(c) {
  const value = c.type === 'daily' ? (c.strict ? streak(c) : Object.keys(c.log).length) : (c.entries || []).reduce((a, e) => a + e.value, 0);
  return { value, pct: Math.min(1, value / c.target) };
}
export const medalsOf = (c) => MEDALS.filter(([p]) => progress(c).pct >= p);
export const activeChallenges = () => db().challenges.filter((c) => !c.done);

function celebrate(c, before) {
  const after = medalsOf(c).length;
  if (after > before) {
    const [, e, name] = MEDALS[after - 1];
    toast(after === 3 ? `🏆 ¡Reto «${c.name}» completado! Medalla de oro 🥇` : `${e} ¡Medalla de ${name} en «${c.name}»!`);
  }
  if (progress(c).pct >= 1 && !c.done) update((d) => Object.assign(d.challenges.find((x) => x.id === c.id), { done: true, finishedAt: dkey() }));
}

// Marcar hoy (retos diarios) o sumar una cantidad (retos de cantidad)
export function checkIn(id, value = null, date = dkey()) {
  const c = db().challenges.find((x) => x.id === id);
  if (!c) throw new Error('Reto no encontrado');
  const before = medalsOf(c).length;
  update((d) => {
    const x = d.challenges.find((y) => y.id === id);
    if (x.type === 'daily') {
      if (x.log[date]) delete x.log[date];
      else x.log[date] = true;
    } else {
      if (!(value > 0)) throw new Error('Indica la cantidad');
      (x.entries ||= []).push({ date, value });
    }
  });
  celebrate(db().challenges.find((x) => x.id === id), before);
}

function restart(id) {
  update((d) => Object.assign(d.challenges.find((x) => x.id === id), { start: dkey(), log: {}, entries: [], done: false, restarts: (d.challenges.find((x) => x.id === id).restarts || 0) + 1 }));
}

function openChallengeSheet(onSaved) {
  const s = sheet({
    title: 'Nuevo reto',
    body: `<form>
      <div class="chips" style="flex-wrap:wrap;margin-bottom:12px">${TEMPLATES.map((t, i) => `<button type="button" class="chip" data-t="${i}">${t[0]} ${t[1]}</button>`).join('')}</div>
      <div class="row">
        <label class="field" style="width:76px"><span>Icono</span><input class="input" name="emoji" value="🎯" style="text-align:center;font-size:20px"></label>
        <label class="field grow"><span>Reto</span><input class="input" name="name" required></label>
      </div>
      <label class="field"><span>Tipo</span><select class="input" name="type"><option value="daily">Marcar cada día que lo cumplo</option><option value="amount">Llegar a una cantidad (€, km, libros…)</option></select></label>
      <div class="row">
        <label class="field grow"><span data-tlabel>Días</span><input class="input" type="number" name="target" min="1" required value="30"></label>
        <label class="field grow" data-unitbox style="display:none"><span>Unidad</span><input class="input" name="unit" placeholder="€, km…"></label>
      </div>
      <label class="check" data-strictbox><input type="checkbox" name="strict"> Días seguidos (si fallas uno, vuelves a empezar)</label>
      <button class="btn primary block" style="margin-top:8px">Empezar reto</button></form>`,
  });
  const f = s.el.querySelector('form');
  const sync = () => {
    const amount = f.type.value === 'amount';
    s.el.querySelector('[data-tlabel]').textContent = amount ? 'Objetivo' : 'Días';
    s.el.querySelector('[data-unitbox]').style.display = amount ? '' : 'none';
    s.el.querySelector('[data-strictbox]').style.display = amount ? 'none' : '';
  };
  f.type.onchange = sync;
  s.el.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => {
    const [e, name, type, target, strict, unit] = TEMPLATES[+b.dataset.t];
    Object.assign(f.emoji, { value: e }); f.name.value = name; f.type.value = type; f.target.value = target; f.strict.checked = strict; f.unit.value = unit;
    sync();
  }));
  f.onsubmit = (e) => {
    e.preventDefault();
    const target = parseFloat(f.target.value);
    if (!(target > 0)) return toast('Pon un objetivo');
    update((d) => d.challenges.push({ id: uid(), emoji: f.emoji.value.trim() || '🎯', name: f.name.value.trim(), type: f.type.value, target, unit: f.unit.value.trim(), strict: f.type.value === 'daily' && f.strict.checked, start: dkey(), log: {}, entries: [], done: false }));
    s.close();
    toast('🎯 ¡Reto en marcha!');
    onSaved?.();
  };
}

function openAmountSheet(c, onSaved) {
  const s = sheet({
    title: `${c.emoji} ${c.name}`,
    body: `<form><label class="field"><span>¿Cuánto sumas hoy?${c.unit ? ` (${esc(c.unit)})` : ''}</span><input class="input" name="v" inputmode="decimal" required style="font-size:22px;font-weight:700"></label>
      <button class="btn primary block">Sumar</button></form>`,
  });
  s.el.querySelector('form').onsubmit = (e) => {
    e.preventDefault();
    const v = parseFloat(e.target.v.value.replace(',', '.'));
    try { checkIn(c.id, v); s.close(); onSaved?.(); } catch (err) { toast(err.message); }
  };
}

// Tarjeta de un reto (también se usa en Inicio)
export function challengeCard(c) {
  const p = progress(c);
  const medals = medalsOf(c);
  const fmt = (n) => Number(n.toFixed(1)).toLocaleString('es-ES');
  const today = c.type === 'daily' && c.log[dkey()];
  return `<div class="card">
    <h2>${esc(c.emoji)} ${esc(c.name)} <span style="margin-left:auto;font-size:18px">${medals.map((m) => m[1]).join('')}</span><button class="x-btn" data-delc="${c.id}" aria-label="Borrar reto">✕</button></h2>
    <div class="progress ok"><div style="width:${p.pct * 100}%"></div></div>
    <div class="row small" style="margin-top:6px"><span>${c.type === 'daily' ? `${p.value} de ${c.target} días${c.strict ? ' seguidos' : ''}` : `${fmt(p.value)} de ${fmt(c.target)} ${esc(c.unit)}`}</span>
      <span class="right muted">${Math.round(p.pct * 100)} %</span></div>
    ${broken(c) ? `<p class="small warn-text" style="margin:6px 0 0">Se rompió la racha. ¡No pasa nada, vuelve a intentarlo!</p><button class="btn small block" data-restart="${c.id}" style="margin-top:6px">↻ Empezar de nuevo</button>`
      : c.done ? '<p class="small" style="margin:6px 0 0">🏆 ¡Completado!</p>'
      : c.type === 'daily' ? `<button class="btn ${today ? '' : 'primary'} block" data-check="${c.id}" style="margin-top:8px">${today ? '✓ Hoy cumplido (tocar para deshacer)' : '✅ Hoy lo he cumplido'}</button>`
      : `<button class="btn primary block" data-add="${c.id}" style="margin-top:8px">+ Sumar</button>`}
  </div>`;
}

export function bindChallengeCards(root, rerender) {
  root.querySelectorAll('[data-check]').forEach((b) => (b.onclick = () => { checkIn(b.dataset.check); rerender(); }));
  root.querySelectorAll('[data-add]').forEach((b) => (b.onclick = () => openAmountSheet(db().challenges.find((c) => c.id === b.dataset.add), rerender)));
  root.querySelectorAll('[data-delc]').forEach((b) => (b.onclick = async () => { await deleteChallenge(b.dataset.delc); rerender(); }));
  root.querySelectorAll('[data-restart]').forEach((b) => (b.onclick = () => { restart(b.dataset.restart); rerender(); }));
}

let tab = 'activos';

export default {
  title: 'Retos',
  quickAdd: (rerender) => openChallengeSheet(rerender),
  render(view, { rerender }) {
    const all = db().challenges;
    const active = all.filter((c) => !c.done);
    const done = all.filter((c) => c.done);
    const shelf = all.flatMap((c) => medalsOf(c).map((m) => m[1]));
    const count = (e) => shelf.filter((x) => x === e).length;
    view.innerHTML = `
      <div class="card row" style="justify-content:space-around;text-align:center">
        ${MEDALS.map(([, e, n]) => `<div><div style="font-size:30px">${e}</div><b>${count(e)}</b><div class="small muted">${n}</div></div>`).join('')}
        <div><div style="font-size:30px">🏆</div><b>${done.length}</b><div class="small muted">Completados</div></div>
      </div>
      ${tabsHtml([['activos', `En marcha (${active.length})`], ['hechos', `Completados (${done.length})`]], tab)}
      ${(tab === 'activos' ? active : done).map(challengeCard).join('') ||
        (tab === 'activos' ? '<div class="empty"><span class="big">🎯</span>Proponte un reto (hay plantillas) y gana medallas: 🥉 al 25 %, 🥈 a la mitad y 🥇 al completarlo.</div>' : '<div class="empty small">Aún no has completado ningún reto. ¡A por el primero!</div>')}
      <button class="fab" aria-label="Nuevo reto">+</button>`;
    bindTabs(view, (t) => { tab = t; rerender(); });
    bindChallengeCards(view, rerender);
    view.querySelector('.fab').onclick = () => openChallengeSheet(rerender);
  },
};

export async function deleteChallenge(id) {
  if (await confirmSheet('Se borrará este reto.')) update((d) => (d.challenges = d.challenges.filter((c) => c.id !== id)));
}
