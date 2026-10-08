import { db, update } from '../store.js';
import { esc, uid, dkey, parseKey, MESES, fmtMoney, toast, sheet, confirmSheet } from '../utils.js';

export const EXP_CATS = [
  { id: 'super', name: 'Supermercado', e: '🛒' },
  { id: 'food', name: 'Comer fuera', e: '🍽️' },
  { id: 'leisure', name: 'Ocio', e: '🎉' },
  { id: 'transport', name: 'Transporte', e: '🚗' },
  { id: 'home', name: 'Casa', e: '🏠' },
  { id: 'health', name: 'Salud', e: '💊' },
  { id: 'clothes', name: 'Ropa', e: '👕' },
  { id: 'sport', name: 'Deporte', e: '🏋️' },
  { id: 'other', name: 'Otros', e: '📦' },
];
const catOf = (id) => EXP_CATS.find((c) => c.id === id) || EXP_CATS.at(-1);

export const monthTotal = (ym = dkey().slice(0, 7)) =>
  db().expenses.filter((e) => e.date.startsWith(ym)).reduce((a, e) => a + e.amount, 0);
export const subsTotal = () => db().subs.reduce((a, s) => a + s.amount, 0);

const parseAmount = (v) => parseFloat(String(v).replace(',', '.'));

export function openExpenseSheet(onSaved) {
  let cat = 'super';
  const s = sheet({
    title: 'Nuevo gasto',
    body: `
      <form>
        <label class="field"><span>Importe (€)</span><input class="input" name="amount" inputmode="decimal" required placeholder="12,50" style="font-size:22px;font-weight:700"></label>
        <label class="field"><span>Concepto</span><input class="input" name="concept" placeholder="Opcional"></label>
        <div class="field"><span>Categoría</span><div class="chips" style="flex-wrap:wrap">${EXP_CATS.map((c) => `<button type="button" class="chip ${c.id === cat ? 'active' : ''}" data-c="${c.id}">${c.e} ${c.name}</button>`).join('')}</div></div>
        <label class="field"><span>Fecha</span><input class="input" type="date" name="date" value="${dkey()}"></label>
        <button class="btn primary block">Guardar gasto</button>
      </form>`,
  });
  const f = s.el.querySelector('form');
  s.el.querySelectorAll('[data-c]').forEach((b) => {
    b.onclick = () => {
      cat = b.dataset.c;
      s.el.querySelectorAll('[data-c]').forEach((x) => x.classList.toggle('active', x === b));
    };
  });
  f.onsubmit = (e) => {
    e.preventDefault();
    const amount = parseAmount(f.amount.value);
    if (!(amount > 0)) return toast('Escribe un importe válido');
    update((d) => d.expenses.push({ id: uid(), amount: Math.round(amount * 100) / 100, concept: f.concept.value.trim(), cat, date: f.date.value || dkey() }));
    s.close();
    toast(`Gasto de ${fmtMoney(amount)} guardado`);
    onSaved?.();
  };
}

function openSubSheet(onSaved) {
  const s = sheet({
    title: 'Nueva suscripción',
    body: `
      <form>
        <label class="field"><span>Nombre</span><input class="input" name="name" required placeholder="Netflix, gimnasio, Spotify…"></label>
        <div class="row">
          <label class="field grow"><span>€ al mes</span><input class="input" name="amount" inputmode="decimal" required placeholder="9,99"></label>
          <label class="field grow"><span>Día de cobro</span><input class="input" type="number" name="day" min="1" max="31" placeholder="1"></label>
        </div>
        <button class="btn primary block">Guardar</button>
      </form>`,
  });
  const f = s.el.querySelector('form');
  f.onsubmit = (e) => {
    e.preventDefault();
    const amount = parseAmount(f.amount.value);
    if (!f.name.value.trim() || !(amount > 0)) return toast('Revisa el nombre y el importe');
    update((d) => d.subs.push({ id: uid(), name: f.name.value.trim(), amount, day: parseInt(f.day.value, 10) || null }));
    s.close();
    onSaved?.();
  };
}

let ym = dkey().slice(0, 7);

export default {
  title: 'Gastos',
  render(view, { rerender }) {
    const d = db();
    const [y, m] = ym.split('-').map(Number);
    const list = d.expenses.filter((e) => e.date.startsWith(ym)).sort((a, b) => b.date.localeCompare(a.date));
    const total = list.reduce((a, e) => a + e.amount, 0);
    const prevYm = `${m === 1 ? y - 1 : y}-${String(m === 1 ? 12 : m - 1).padStart(2, '0')}`;
    const prevTotal = monthTotal(prevYm);
    const byCat = {};
    list.forEach((e) => (byCat[e.cat] = (byCat[e.cat] || 0) + e.amount));
    const max = Math.max(1, ...Object.values(byCat));
    const subs = subsTotal();

    view.innerHTML = `
      <div class="card">
        <div class="month-head">
          <button class="icon-btn" data-nav="-1" aria-label="Mes anterior">‹</button>
          <h2>${MESES[m - 1]} ${y}</h2>
          <button class="icon-btn" data-nav="1" aria-label="Mes siguiente">›</button>
        </div>
        <div class="stat">${fmtMoney(total)}</div>
        <div class="stat-label">${prevTotal ? `Mes anterior: ${fmtMoney(prevTotal)} (${total >= prevTotal ? '+' : ''}${fmtMoney(total - prevTotal)})` : 'gastado este mes'}${subs ? ` · + ${fmtMoney(subs)} en suscripciones` : ''}</div>
        ${Object.keys(byCat).length ? '<div class="hr"></div>' : ''}
        ${Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([c, v]) => `
          <div class="bar-row"><span class="ellipsis">${catOf(c).e} ${catOf(c).name}</span><div class="progress"><div style="width:${(v / max) * 100}%"></div></div><span class="right">${fmtMoney(v)}</span></div>`).join('')}
      </div>

      <div class="section-title">Movimientos</div>
      <div class="card">${list.length ? `<ul class="list">${list.map((e) => `
        <li><span class="emoji">${catOf(e.cat).e}</span>
          <div class="grow"><div class="ellipsis">${esc(e.concept || catOf(e.cat).name)}</div><div class="small muted">${parseKey(e.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</div></div>
          <b>${fmtMoney(e.amount)}</b><button class="x-btn" data-del="${e.id}" aria-label="Borrar">✕</button></li>`).join('')}</ul>`
        : '<div class="empty small">Sin gastos este mes. Pulsa + para añadir uno.</div>'}</div>

      <div class="section-title">Suscripciones y pagos fijos</div>
      <div class="card">
        ${d.subs.length ? `<ul class="list">${d.subs.map((s) => `
          <li><span class="emoji">🔁</span><div class="grow"><div class="ellipsis">${esc(s.name)}</div><div class="small muted">${s.day ? `Se cobra el día ${s.day}` : 'Mensual'}</div></div>
          <b>${fmtMoney(s.amount)}</b><button class="x-btn" data-delsub="${s.id}" aria-label="Borrar">✕</button></li>`).join('')}</ul>
          <div class="hr"></div><div class="row"><span class="muted">Total</span><b class="right">${fmtMoney(subs)}/mes · ${fmtMoney(subs * 12)}/año</b></div>`
          : '<p class="muted small" style="margin:0 0 10px">Apunta tus suscripciones para saber cuánto pagas al año.</p>'}
        <button class="btn block" data-addsub style="margin-top:10px">+ Añadir suscripción</button>
      </div>
      <button class="fab" aria-label="Nuevo gasto">+</button>`;

    view.querySelectorAll('[data-nav]').forEach((b) => {
      b.onclick = () => {
        const dt = new Date(y, m - 1 + +b.dataset.nav, 1);
        ym = dkey(dt).slice(0, 7);
        rerender();
      };
    });
    view.querySelector('.fab').onclick = () => openExpenseSheet(rerender);
    view.querySelector('[data-addsub]').onclick = () => openSubSheet(rerender);
    view.querySelectorAll('[data-del]').forEach((b) => {
      b.onclick = async () => {
        if (!(await confirmSheet('Se borrará este gasto.'))) return;
        update((x) => (x.expenses = x.expenses.filter((e) => e.id !== b.dataset.del)));
        rerender();
      };
    });
    view.querySelectorAll('[data-delsub]').forEach((b) => {
      b.onclick = async () => {
        if (!(await confirmSheet('Se borrará esta suscripción.'))) return;
        update((x) => (x.subs = x.subs.filter((s) => s.id !== b.dataset.delsub)));
        rerender();
      };
    });
  },
};
