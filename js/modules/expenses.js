// Finanzas personales: ingresos, gastos, fijos, presupuestos, metas de ahorro y análisis con Claude.
import { db, update } from '../store.js';
import { esc, uid, dkey, parseKey, MESES, fmtMoney, toast, sheet, confirmSheet } from '../utils.js';
import { pairBarChart, bindCharts, imageToBase64, tabsHtml, bindTabs } from '../ui.js';
import { askJSON, askText, imageBlock, objSchema, hasKey } from '../ai.js';

export const EXP_CATS = [
  { id: 'super', name: 'Supermercado', e: '🛒' },
  { id: 'food', name: 'Comer fuera', e: '🍽️' },
  { id: 'leisure', name: 'Ocio', e: '🎉' },
  { id: 'transport', name: 'Transporte', e: '🚗' },
  { id: 'home', name: 'Casa', e: '🏠' },
  { id: 'bills', name: 'Facturas', e: '💡' },
  { id: 'health', name: 'Salud', e: '💊' },
  { id: 'clothes', name: 'Ropa', e: '👕' },
  { id: 'sport', name: 'Deporte', e: '🏋️' },
  { id: 'travel', name: 'Viajes', e: '✈️' },
  { id: 'gifts', name: 'Regalos', e: '🎁' },
  { id: 'other', name: 'Otros', e: '📦' },
];
export const INC_CATS = [
  { id: 'salary', name: 'Nómina', e: '💼' },
  { id: 'extra', name: 'Extra / horas', e: '⏱️' },
  { id: 'sale', name: 'Venta', e: '🏷️' },
  { id: 'gift', name: 'Regalo', e: '🎁' },
  { id: 'refund', name: 'Devolución', e: '↩️' },
  { id: 'other', name: 'Otros', e: '💰' },
];
const catOf = (id) => EXP_CATS.find((c) => c.id === id) || EXP_CATS.at(-1);
const incOf = (id) => INC_CATS.find((c) => c.id === id) || INC_CATS.at(-1);
const parseAmount = (v) => parseFloat(String(v).replace(/\s|€/g, '').replace(',', '.'));
const round2 = (n) => Math.round(n * 100) / 100;
const curYm = () => dkey().slice(0, 7);
const shiftYm = (ym, n) => {
  const [y, m] = ym.split('-').map(Number);
  return dkey(new Date(y, m - 1 + n, 1)).slice(0, 7);
};
const ymLabel = (ym) => MESES[+ym.slice(5) - 1];

// ---------- Cálculos ----------
const activeIn = (item, ym) => !item.since || item.since <= ym;
export const subsTotal = (ym = curYm()) => db().subs.filter((s) => activeIn(s, ym)).reduce((a, s) => a + s.amount, 0);
export const fixedIncomeTotal = (ym = curYm()) => db().fixedIncomes.filter((s) => activeIn(s, ym)).reduce((a, s) => a + s.amount, 0);
// Gasto variable apuntado en el mes (sin fijos)
export const monthTotal = (ym = curYm()) => db().expenses.filter((e) => e.date.startsWith(ym)).reduce((a, e) => a + e.amount, 0);

export function monthSummary(ym = curYm()) {
  const d = db();
  const variable = monthTotal(ym);
  const fixed = subsTotal(ym);
  const incomeVar = d.incomes.filter((e) => e.date.startsWith(ym)).reduce((a, e) => a + e.amount, 0);
  const income = incomeVar + fixedIncomeTotal(ym);
  const spent = variable + fixed;
  const byCat = {};
  d.expenses.filter((e) => e.date.startsWith(ym)).forEach((e) => (byCat[e.cat] = (byCat[e.cat] || 0) + e.amount));
  const over = Object.entries(d.budgets).filter(([c, lim]) => lim > 0 && (byCat[c] || 0) > lim).map(([c]) => c);
  return { income, spent, variable, fixed, balance: income - spent, rate: income > 0 ? (income - spent) / income : null, byCat, over };
}

// ---------- Formularios ----------
export function openExpenseSheet(onSaved, prefill = {}) {
  let cat = prefill.cat || 'super';
  const s = sheet({
    title: prefill.fromTicket ? 'Revisa el ticket' : 'Nuevo gasto',
    body: `
      <form>
        <label class="field"><span>Importe (€)</span><input class="input" name="amount" inputmode="decimal" required placeholder="12,50" value="${prefill.amount ? String(prefill.amount).replace('.', ',') : ''}" style="font-size:22px;font-weight:700"></label>
        <label class="field"><span>Concepto</span><input class="input" name="concept" placeholder="Opcional" value="${esc(prefill.concept || '')}"></label>
        <div class="field"><span>Categoría</span><div class="chips" style="flex-wrap:wrap">${EXP_CATS.map((c) => `<button type="button" class="chip ${c.id === cat ? 'active' : ''}" data-c="${c.id}">${c.e} ${c.name}</button>`).join('')}</div></div>
        <label class="field"><span>Fecha</span><input class="input" type="date" name="date" value="${prefill.date || dkey()}"></label>
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
    addExpense({ amount, concept: f.concept.value, cat, date: f.date.value });
    s.close();
    onSaved?.();
  };
}

// Añadir gasto avisando si se pasa del presupuesto
export function addExpense({ amount, concept = '', cat = 'other', date = dkey() }) {
  update((d) => d.expenses.push({ id: uid(), amount: round2(amount), concept: concept.trim(), cat, date: date || dkey() }));
  const ym = (date || dkey()).slice(0, 7);
  const lim = db().budgets[cat];
  const spent = monthSummary(ym).byCat[cat] || 0;
  if (lim > 0 && spent > lim) toast(`⚠️ Te has pasado del presupuesto de ${catOf(cat).name} (${fmtMoney(spent)} de ${fmtMoney(lim)})`);
  else if (lim > 0 && spent > lim * 0.8) toast(`Gasto guardado · llevas el ${Math.round((spent / lim) * 100)}% del presupuesto de ${catOf(cat).name}`);
  else toast(`Gasto de ${fmtMoney(amount)} guardado`);
}

export function addIncome({ amount, concept = '', cat = 'other', date = dkey() }) {
  update((d) => d.incomes.push({ id: uid(), amount: round2(amount), concept: concept.trim(), cat, date: date || dkey() }));
}

function openIncomeSheet(onSaved) {
  let cat = 'salary';
  const s = sheet({
    title: 'Nuevo ingreso',
    body: `
      <form>
        <label class="field"><span>Importe (€)</span><input class="input" name="amount" inputmode="decimal" required placeholder="1.500" style="font-size:22px;font-weight:700"></label>
        <label class="field"><span>Concepto</span><input class="input" name="concept" placeholder="Opcional"></label>
        <div class="field"><span>Tipo</span><div class="chips" style="flex-wrap:wrap">${INC_CATS.map((c) => `<button type="button" class="chip ${c.id === cat ? 'active' : ''}" data-c="${c.id}">${c.e} ${c.name}</button>`).join('')}</div></div>
        <label class="field"><span>Fecha</span><input class="input" type="date" name="date" value="${dkey()}"></label>
        <p class="small muted">Si es tu nómina de todos los meses, mejor añádela en «Fijos» y se sumará sola.</p>
        <button class="btn primary block">Guardar ingreso</button>
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
    addIncome({ amount, concept: f.concept.value, cat, date: f.date.value });
    s.close();
    toast(`Ingreso de ${fmtMoney(amount)} guardado`);
    onSaved?.();
  };
}

function openFixedSheet(kind, onSaved) {
  const isInc = kind === 'income';
  const s = sheet({
    title: isInc ? 'Ingreso fijo mensual' : 'Gasto fijo o suscripción',
    body: `
      <form>
        <label class="field"><span>Nombre</span><input class="input" name="name" required placeholder="${isInc ? 'Nómina' : 'Alquiler, luz, Netflix, gimnasio…'}"></label>
        <div class="row">
          <label class="field grow"><span>€ al mes</span><input class="input" name="amount" inputmode="decimal" required></label>
          <label class="field grow"><span>Día</span><input class="input" type="number" name="day" min="1" max="31" placeholder="1"></label>
        </div>
        <p class="small muted">Se suma automáticamente cada mes desde este mes.</p>
        <button class="btn primary block">Guardar</button>
      </form>`,
  });
  const f = s.el.querySelector('form');
  f.onsubmit = (e) => {
    e.preventDefault();
    const amount = parseAmount(f.amount.value);
    if (!f.name.value.trim() || !(amount > 0)) return toast('Revisa el nombre y el importe');
    const item = { id: uid(), name: f.name.value.trim(), amount: round2(amount), day: parseInt(f.day.value, 10) || null, since: curYm() };
    update((d) => (isInc ? d.fixedIncomes : d.subs).push(item));
    s.close();
    onSaved?.();
  };
}

function openGoalSheet(onSaved, goal) {
  const s = sheet({
    title: goal ? `Aportar a ${goal.name}` : 'Nueva meta de ahorro',
    body: goal
      ? `<form>
          <p class="muted">Llevas ${fmtMoney(goal.saved)} de ${fmtMoney(goal.target)}.</p>
          <label class="field"><span>Cantidad (€). En negativo para retirar</span><input class="input" name="amount" inputmode="decimal" required style="font-size:22px;font-weight:700"></label>
          <button class="btn primary block">Guardar</button>
          <button type="button" class="btn danger block" data-del style="margin-top:6px">Borrar meta</button>
        </form>`
      : `<form>
          <div class="row">
            <label class="field" style="width:76px"><span>Icono</span><input class="input" name="emoji" value="🎯" style="text-align:center;font-size:20px"></label>
            <label class="field grow"><span>Meta</span><input class="input" name="name" required placeholder="Viaje a Japón, fondo de emergencia…"></label>
          </div>
          <div class="row">
            <label class="field grow"><span>Objetivo (€)</span><input class="input" name="target" inputmode="decimal" required></label>
            <label class="field grow"><span>Ya tengo (€)</span><input class="input" name="saved" inputmode="decimal" placeholder="0"></label>
          </div>
          <label class="field"><span>Fecha objetivo (opcional)</span><input class="input" type="date" name="deadline"></label>
          <button class="btn primary block">Crear meta</button>
        </form>`,
  });
  const f = s.el.querySelector('form');
  f.onsubmit = (e) => {
    e.preventDefault();
    if (goal) {
      const amount = parseAmount(f.amount.value);
      if (!amount) return;
      update((d) => {
        const g = d.goals.find((x) => x.id === goal.id);
        g.saved = round2(Math.max(0, g.saved + amount));
      });
      const g = db().goals.find((x) => x.id === goal.id);
      toast(g.saved >= g.target ? `🎉 ¡Meta «${g.name}» conseguida!` : 'Aportación guardada');
    } else {
      const target = parseAmount(f.target.value);
      if (!f.name.value.trim() || !(target > 0)) return toast('Revisa el nombre y el objetivo');
      update((d) => d.goals.push({ id: uid(), name: f.name.value.trim(), emoji: f.emoji.value.trim() || '🎯', target, saved: parseAmount(f.saved.value) || 0, deadline: f.deadline.value || '' }));
    }
    s.close();
    onSaved?.();
  };
  s.el.querySelector('[data-del]')?.addEventListener('click', async () => {
    if (!(await confirmSheet('Se borrará esta meta.'))) return;
    update((d) => (d.goals = d.goals.filter((x) => x.id !== goal.id)));
    s.close();
    onSaved?.();
  });
}

// ---------- Ticket con foto ----------
const TICKET_SCHEMA = objSchema({
  importe: { type: 'number', description: 'Total pagado en euros' },
  comercio: { type: 'string' },
  fecha: { type: 'string', description: 'AAAA-MM-DD, o cadena vacía si no aparece' },
  categoria: { type: 'string', enum: EXP_CATS.map((c) => c.id) },
  concepto: { type: 'string', description: 'Descripción corta, p. ej. «Mercadona – compra semanal»' },
});

export async function scanTicket(file, onSaved) {
  if (!hasKey()) return toast('Añade tu clave de Anthropic en Ajustes para leer tickets');
  toast('📷 Leyendo el ticket…');
  try {
    const b64 = await imageToBase64(file);
    const r = await askJSON({
      system: `Extraes datos de tickets y facturas españolas. Categorías: ${EXP_CATS.map((c) => `${c.id}=${c.name}`).join(', ')}. Si no se ve el total, pon 0.`,
      content: [imageBlock(b64), { type: 'text', text: 'Extrae el total, el comercio, la fecha, la categoría y un concepto corto.' }],
      schema: TICKET_SCHEMA,
      maxTokens: 2000,
    });
    const date = /^\d{4}-\d{2}-\d{2}$/.test(r.fecha) ? r.fecha : dkey();
    openExpenseSheet(onSaved, { amount: r.importe > 0 ? r.importe : '', concept: r.concepto || r.comercio, cat: r.categoria, date, fromTicket: true });
  } catch (e) {
    toast(e.message);
  }
}

// ---------- Análisis con Claude ----------
let analysis = { ym: '', text: '' };

function financeReport(ym) {
  const d = db();
  const months = [shiftYm(ym, -2), shiftYm(ym, -1), ym].map((m) => {
    const s = monthSummary(m);
    return `${ymLabel(m)}: ingresos ${fmtMoney(s.income)}, gastos ${fmtMoney(s.spent)} (fijos ${fmtMoney(s.fixed)}), balance ${fmtMoney(s.balance)}. Por categoría: ${Object.entries(s.byCat).map(([c, v]) => `${catOf(c).name} ${fmtMoney(v)}`).join(', ') || 'sin gastos variables'}.`;
  });
  return [
    `Fecha de hoy: ${dkey()}. Mes analizado: ${ymLabel(ym)} (puede estar a medias).`,
    ...months,
    `Gastos fijos: ${d.subs.map((s) => `${s.name} ${fmtMoney(s.amount)}`).join(', ') || 'ninguno'}.`,
    `Ingresos fijos: ${d.fixedIncomes.map((s) => `${s.name} ${fmtMoney(s.amount)}`).join(', ') || 'ninguno'}.`,
    `Presupuestos: ${Object.entries(d.budgets).filter(([, v]) => v > 0).map(([c, v]) => `${catOf(c).name} ${fmtMoney(v)}`).join(', ') || 'ninguno'}.`,
    `Metas de ahorro: ${d.goals.map((g) => `${g.name}: ${fmtMoney(g.saved)} de ${fmtMoney(g.target)}${g.deadline ? ' para ' + g.deadline : ''}`).join('; ') || 'ninguna'}.`,
  ].join('\n');
}

export const FINANCE_SYSTEM = `Eres el asesor de finanzas personales de la app «Mi Día». Ayudas a controlar gastos, hacer presupuestos y ahorrar, con consejos concretos basados en los números del usuario. Escribe en español, en texto plano sin Markdown, con frases cortas y guiones para las listas. No recomiendes productos financieros ni inversiones concretas (acciones, fondos, criptomonedas); si surge, sugiere consultar a un profesional.`;

async function analyze(ym, box) {
  box.innerHTML = '<span class="muted">🤖 Analizando tus finanzas…</span>';
  try {
    const text = await askText({
      system: FINANCE_SYSTEM,
      content: `${financeReport(ym)}\n\nHaz un análisis breve: 1) cómo va el mes en una frase, 2) en qué se está yendo más el dinero y si es normal, 3) tres acciones concretas para ahorrar más este mes, 4) si las metas de ahorro van al ritmo necesario. Máximo 180 palabras.`,
      effort: 'medium',
    });
    analysis = { ym, text };
    box.innerHTML = `<div class="ai-box">${esc(text)}</div>`;
  } catch (e) {
    box.innerHTML = `<span class="warn-text">${esc(e.message)}</span>`;
  }
}

// ---------- Pantalla ----------
let ym = curYm();
let tab = 'resumen';

export default {
  title: 'Finanzas',
  quickAdd: (rerender) => openExpenseSheet(rerender),
  render(view, { rerender }) {
    const d = db();
    const s = monthSummary(ym);
    const [y, m] = ym.split('-').map(Number);
    const head = `
      <div class="month-head">
        <button class="icon-btn" data-nav="-1" aria-label="Mes anterior">‹</button>
        <h2>${MESES[m - 1]} ${y}</h2>
        <button class="icon-btn" data-nav="1" aria-label="Mes siguiente">›</button>
      </div>`;
    let body = '';

    if (tab === 'resumen') {
      const hist = Array.from({ length: 6 }, (_, i) => shiftYm(ym, i - 5)).map((x) => {
        const ms = monthSummary(x);
        return { label: ymLabel(x).slice(0, 3), a: round2(ms.income), b: round2(ms.spent) };
      });
      const cats = Object.entries(s.byCat).sort((a, b) => b[1] - a[1]);
      body = `
        <div class="card">${head}
          <div class="grid-2" style="gap:8px">
            <div><div class="stat-label">Ingresos</div><div class="stat" style="font-size:20px">${fmtMoney(s.income)}</div></div>
            <div><div class="stat-label">Gastos</div><div class="stat" style="font-size:20px">${fmtMoney(s.spent)}</div></div>
            <div><div class="stat-label">Balance</div><div class="stat" style="font-size:20px;color:${s.balance < 0 ? 'var(--danger)' : 'var(--ok)'}">${s.balance >= 0 ? '+' : ''}${fmtMoney(s.balance)}</div></div>
            <div><div class="stat-label">Ahorro</div><div class="stat" style="font-size:20px">${s.rate === null ? '—' : Math.round(s.rate * 100) + ' %'}</div></div>
          </div>
          ${s.fixed ? `<p class="small muted" style="margin:8px 0 0">Incluye ${fmtMoney(s.fixed)} de gastos fijos.</p>` : ''}
          ${s.over.length ? `<p class="small warn-text" style="margin:8px 0 0">⚠️ Te has pasado del presupuesto en: ${s.over.map((c) => catOf(c).name).join(', ')}</p>` : ''}
        </div>
        <div class="card"><h2>Últimos 6 meses</h2>${pairBarChart(hist, { aName: 'Ingresos', bName: 'Gastos' })}</div>
        <div class="card"><h2>Gasto por categoría</h2>
          ${cats.length ? cats.map(([c, v]) => {
            const lim = d.budgets[c];
            const pct = lim ? Math.min(100, (v / lim) * 100) : (v / cats[0][1]) * 100;
            return `<div class="bar-row"><span class="ellipsis">${catOf(c).e} ${catOf(c).name}</span>
              <div class="progress ${lim && v > lim ? '' : 'ok'}" style="${lim && v > lim ? '--accent:var(--danger)' : ''}"><div style="width:${pct}%;${lim && v > lim ? 'background:var(--danger)' : ''}"></div></div>
              <span class="right">${fmtMoney(v)}${lim ? `<br><span class="muted" style="font-size:11px">de ${fmtMoney(lim)}</span>` : ''}</span></div>`;
          }).join('') : '<div class="muted small">Sin gastos variables este mes.</div>'}
        </div>
        <div class="card"><h2>🤖 Asesor financiero</h2>
          <div id="analysis">${analysis.ym === ym && analysis.text ? `<div class="ai-box">${esc(analysis.text)}</div>` : '<p class="muted small" style="margin:0">Claude revisa tus números y te dice cómo ahorrar más.</p>'}</div>
          <button class="btn block" data-analyze style="margin-top:10px">${analysis.ym === ym && analysis.text ? 'Volver a analizar' : 'Analizar mis finanzas'}</button>
        </div>`;
    } else if (tab === 'movimientos') {
      const moves = [
        ...d.expenses.filter((e) => e.date.startsWith(ym)).map((e) => ({ ...e, kind: 'exp' })),
        ...d.incomes.filter((e) => e.date.startsWith(ym)).map((e) => ({ ...e, kind: 'inc' })),
      ].sort((a, b) => b.date.localeCompare(a.date));
      body = `
        <div class="card">${head}
          <div class="row wrap" style="gap:8px">
            <button class="btn primary grow" data-addexp>− Gasto</button>
            <button class="btn grow" data-addinc>+ Ingreso</button>
            <label class="btn grow">📷 Ticket<input type="file" accept="image/*" capture="environment" data-ticket hidden></label>
          </div>
        </div>
        <div class="card">${moves.length ? `<ul class="list">${moves.map((e) => {
          const c = e.kind === 'exp' ? catOf(e.cat) : incOf(e.cat);
          return `<li><span class="emoji">${c.e}</span>
            <div class="grow"><div class="ellipsis">${esc(e.concept || c.name)}</div><div class="small muted">${parseKey(e.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} · ${c.name}</div></div>
            <b style="color:${e.kind === 'inc' ? 'var(--ok)' : 'inherit'}">${e.kind === 'inc' ? '+' : '−'}${fmtMoney(e.amount)}</b>
            <button class="x-btn" data-del="${e.kind}:${e.id}" aria-label="Borrar">✕</button></li>`;
        }).join('')}</ul>` : '<div class="empty small">Sin movimientos este mes.</div>'}</div>`;
    } else if (tab === 'presupuestos') {
      body = `
        <div class="card">${head}
          <p class="small muted" style="margin-top:0">Pon un límite mensual por categoría. Te aviso al llegar al 80 % y al pasarte.</p>
          ${EXP_CATS.map((c) => {
            const spent = s.byCat[c.id] || 0;
            const lim = d.budgets[c.id] || 0;
            return `<div class="row" style="padding:6px 0;border-bottom:1px solid var(--border)">
              <span class="grow">${c.e} ${c.name}<br><span class="small ${lim && spent > lim ? 'warn-text' : 'muted'}">${fmtMoney(spent)}${lim ? ` de ${fmtMoney(lim)}` : ' gastado'}</span></span>
              <input class="input" style="width:110px" inputmode="decimal" placeholder="Sin límite" data-budget="${c.id}" value="${lim ? String(lim).replace('.', ',') : ''}">
            </div>`;
          }).join('')}
          <p class="small muted">Total presupuestado: ${fmtMoney(Object.values(d.budgets).reduce((a, v) => a + (v || 0), 0))} al mes.</p>
        </div>`;
    } else if (tab === 'metas') {
      body = d.goals.length
        ? d.goals.map((g) => {
            const pct = Math.min(100, (g.saved / g.target) * 100);
            let pace = '';
            if (g.deadline && g.saved < g.target) {
              const months = Math.max(1, (parseKey(g.deadline).getFullYear() - y) * 12 + parseKey(g.deadline).getMonth() - (m - 1));
              pace = `Necesitas ahorrar ${fmtMoney((g.target - g.saved) / months)} al mes hasta ${parseKey(g.deadline).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}.`;
            }
            return `<div class="card" data-goal="${g.id}" style="cursor:pointer">
              <h2>${esc(g.emoji)} ${esc(g.name)} <span class="badge" style="margin-left:auto">${Math.round(pct)} %</span></h2>
              <div class="progress ok"><div style="width:${pct}%"></div></div>
              <div class="row small" style="margin-top:6px"><span>${fmtMoney(g.saved)}</span><span class="right muted">de ${fmtMoney(g.target)}</span></div>
              ${pace ? `<p class="small muted" style="margin:6px 0 0">${pace}</p>` : ''}
              ${g.saved >= g.target ? '<p class="small" style="margin:6px 0 0">🎉 ¡Conseguida!</p>' : ''}
            </div>`;
          }).join('') + '<button class="btn block" data-addgoal>+ Nueva meta</button>'
        : '<div class="empty"><span class="big">🎯</span>Crea metas de ahorro (un viaje, un colchón para imprevistos…) y ve aportando.<br><br><button class="btn primary" data-addgoal>Crear meta</button></div>';
    } else if (tab === 'fijos') {
      const list = (items, kind) => items.length
        ? `<ul class="list">${items.map((x) => `<li><span class="emoji">${kind === 'income' ? '💼' : '🔁'}</span><div class="grow"><div class="ellipsis">${esc(x.name)}</div><div class="small muted">${x.day ? `Día ${x.day}` : 'Mensual'}</div></div><b>${fmtMoney(x.amount)}</b><button class="x-btn" data-delfixed="${kind}:${x.id}" aria-label="Borrar">✕</button></li>`).join('')}</ul>`
        : '<p class="muted small" style="margin:0">Ninguno todavía.</p>';
      body = `
        <div class="card"><h2>💼 Ingresos fijos <span class="right badge">${fmtMoney(fixedIncomeTotal())}/mes</span></h2>${list(d.fixedIncomes, 'income')}
          <button class="btn small block" data-addfixed="income" style="margin-top:8px">+ Añadir ingreso fijo</button></div>
        <div class="card"><h2>🔁 Gastos fijos y suscripciones <span class="right badge">${fmtMoney(subsTotal())}/mes</span></h2>${list(d.subs, 'expense')}
          <button class="btn small block" data-addfixed="expense" style="margin-top:8px">+ Añadir gasto fijo</button>
          ${d.subs.length ? `<p class="small muted">Al año: ${fmtMoney(subsTotal() * 12)}</p>` : ''}</div>`;
    }

    view.innerHTML = tabsHtml([['resumen', 'Resumen'], ['movimientos', 'Movimientos'], ['presupuestos', 'Presupuestos'], ['metas', 'Metas'], ['fijos', 'Fijos']], tab) + body +
      (tab === 'resumen' || tab === 'movimientos' ? '<button class="fab" aria-label="Nuevo gasto">+</button>' : '');

    bindTabs(view, (t) => { tab = t; rerender(); });
    bindCharts(view);
    view.querySelectorAll('[data-nav]').forEach((b) => (b.onclick = () => { ym = shiftYm(ym, +b.dataset.nav); rerender(); }));
    view.querySelector('.fab')?.addEventListener('click', () => openExpenseSheet(rerender));
    view.querySelector('[data-addexp]')?.addEventListener('click', () => openExpenseSheet(rerender));
    view.querySelector('[data-addinc]')?.addEventListener('click', () => openIncomeSheet(rerender));
    view.querySelector('[data-ticket]')?.addEventListener('change', (e) => e.target.files[0] && scanTicket(e.target.files[0], rerender));
    view.querySelector('[data-analyze]')?.addEventListener('click', () => analyze(ym, view.querySelector('#analysis')));
    view.querySelectorAll('[data-addgoal]').forEach((b) => (b.onclick = () => openGoalSheet(rerender)));
    view.querySelectorAll('[data-goal]').forEach((c) => (c.onclick = () => openGoalSheet(rerender, db().goals.find((g) => g.id === c.dataset.goal))));
    view.querySelectorAll('[data-addfixed]').forEach((b) => (b.onclick = () => openFixedSheet(b.dataset.addfixed, rerender)));
    view.querySelectorAll('[data-budget]').forEach((inp) => {
      inp.onchange = () => {
        const v = parseAmount(inp.value);
        update((x) => {
          if (v > 0) x.budgets[inp.dataset.budget] = round2(v);
          else delete x.budgets[inp.dataset.budget];
        });
        toast('Presupuesto guardado');
        rerender();
      };
    });
    view.querySelectorAll('[data-del]').forEach((b) => {
      b.onclick = async () => {
        if (!(await confirmSheet('Se borrará este movimiento.'))) return;
        const [kind, id] = b.dataset.del.split(':');
        update((x) => {
          if (kind === 'exp') x.expenses = x.expenses.filter((e) => e.id !== id);
          else x.incomes = x.incomes.filter((e) => e.id !== id);
        });
        rerender();
      };
    });
    view.querySelectorAll('[data-delfixed]').forEach((b) => {
      b.onclick = async () => {
        if (!(await confirmSheet('Se borrará y dejará de sumarse cada mes.'))) return;
        const [kind, id] = b.dataset.delfixed.split(':');
        update((x) => {
          if (kind === 'income') x.fixedIncomes = x.fixedIncomes.filter((e) => e.id !== id);
          else x.subs = x.subs.filter((e) => e.id !== id);
        });
        rerender();
      };
    });
  },
};
