// Gastos compartidos (tipo Tricount): grupos, quién pagó, balances y quién debe a quién.
import { db, update } from '../store.js';
import { esc, uid, dkey, parseKey, fmtMoney, toast, sheet, confirmSheet } from '../utils.js';

const round2 = (n) => Math.round(n * 100) / 100;
const parseAmount = (v) => parseFloat(String(v).replace(/\s|€/g, '').replace(',', '.'));

export function balances(g) {
  const bal = Object.fromEntries(g.members.map((m) => [m, 0]));
  g.expenses.forEach((e) => {
    const share = e.amount / e.among.length;
    bal[e.payer] = (bal[e.payer] || 0) + e.amount;
    e.among.forEach((m) => (bal[m] = (bal[m] || 0) - share));
  });
  Object.keys(bal).forEach((k) => (bal[k] = round2(bal[k])));
  return bal;
}

// Mínimo número de pagos para quedar en paz
export function settlements(g) {
  const bal = balances(g);
  const debtors = Object.entries(bal).filter(([, v]) => v < -0.009).map(([m, v]) => [m, -v]).sort((a, b) => b[1] - a[1]);
  const creditors = Object.entries(bal).filter(([, v]) => v > 0.009).sort((a, b) => b[1] - a[1]);
  const out = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = round2(Math.min(debtors[i][1], creditors[j][1]));
    if (pay > 0) out.push({ from: debtors[i][0], to: creditors[j][0], amount: pay });
    debtors[i][1] = round2(debtors[i][1] - pay);
    creditors[j][1] = round2(creditors[j][1] - pay);
    if (debtors[i][1] <= 0.009) i++;
    if (creditors[j][1] <= 0.009) j++;
  }
  return out;
}

function openGroupSheet(onSaved) {
  const s = sheet({
    title: 'Nuevo grupo',
    body: `<form>
      <label class="field"><span>Nombre</span><input class="input" name="name" required placeholder="Piso, Viaje a Asturias, Cenas…"></label>
      <label class="field"><span>Personas (separadas por comas, tú incluido)</span><input class="input" name="members" required placeholder="Yo, Laura, Javi"></label>
      <button class="btn primary block">Crear grupo</button></form>`,
  });
  const f = s.el.querySelector('form');
  f.onsubmit = (e) => {
    e.preventDefault();
    const members = [...new Set(f.members.value.split(',').map((x) => x.trim()).filter(Boolean))];
    if (members.length < 2) return toast('Pon al menos dos personas');
    const g = { id: uid(), name: f.name.value.trim(), members, expenses: [] };
    update((d) => d.splitGroups.push(g));
    current = g.id;
    s.close();
    onSaved?.();
  };
}

function openSplitExpense(g, onSaved) {
  const s = sheet({
    title: 'Nuevo gasto del grupo',
    body: `<form>
      <label class="field"><span>Concepto</span><input class="input" name="desc" required placeholder="Cena, gasolina, compra…"></label>
      <div class="row">
        <label class="field grow"><span>Importe (€)</span><input class="input" name="amount" inputmode="decimal" required></label>
        <label class="field grow"><span>Pagó</span><select class="input" name="payer">${g.members.map((m) => `<option>${esc(m)}</option>`).join('')}</select></label>
      </div>
      <div class="field"><span>Entre quién se reparte</span>${g.members.map((m) => `<label class="check"><input type="checkbox" name="among" value="${esc(m)}" checked> ${esc(m)}</label>`).join('')}</div>
      <label class="field"><span>Fecha</span><input class="input" type="date" name="date" value="${dkey()}"></label>
      <button class="btn primary block">Guardar</button></form>`,
  });
  const f = s.el.querySelector('form');
  f.onsubmit = (e) => {
    e.preventDefault();
    const amount = parseAmount(f.amount.value);
    const among = [...f.querySelectorAll('[name=among]:checked')].map((c) => c.value);
    if (!(amount > 0) || !among.length) return toast('Revisa el importe y entre quién se reparte');
    update((d) => d.splitGroups.find((x) => x.id === g.id).expenses.push({ id: uid(), desc: f.desc.value.trim(), amount: round2(amount), payer: f.payer.value, among, date: f.date.value || dkey() }));
    s.close();
    onSaved?.();
  };
}

let current = null;

function renderGroup(view, g, rerender) {
  const bal = balances(g);
  const plan = settlements(g);
  const total = g.expenses.filter((e) => !e.settle).reduce((a, e) => a + e.amount, 0);
  view.innerHTML = `
    <button class="btn small" data-back style="margin-bottom:10px">‹ Todos los grupos</button>
    <div class="card"><h2 style="font-size:20px">👥 ${esc(g.name)}</h2><div class="muted small">${g.members.map(esc).join(', ')} · total gastado ${fmtMoney(total)}</div></div>
    <div class="card"><h2>Balance</h2><ul class="list">${g.members.map((m) => `
      <li><span class="grow">${esc(m)}</span><b style="color:${bal[m] > 0.009 ? 'var(--ok)' : bal[m] < -0.009 ? 'var(--danger)' : 'inherit'}">${bal[m] > 0 ? '+' : ''}${fmtMoney(bal[m])}</b></li>`).join('')}</ul>
      <p class="small muted" style="margin:6px 0 0">En verde, a quien le deben; en rojo, quien debe.</p></div>
    <div class="card"><h2>Para quedar en paz</h2>${plan.length ? `<ul class="list">${plan.map((p, i) => `
      <li><span class="grow"><b>${esc(p.from)}</b> paga a <b>${esc(p.to)}</b></span><b>${fmtMoney(p.amount)}</b><button class="btn small" data-settle="${i}">Hecho</button></li>`).join('')}</ul>` : '<p class="muted small" style="margin:0">🎉 Estáis en paz.</p>'}</div>
    <div class="row wrap" style="gap:8px;margin-bottom:12px"><button class="btn primary grow" data-add>+ Gasto</button><button class="btn grow" data-share>📤 Enviar resumen</button></div>
    <div class="card">${g.expenses.length ? `<ul class="list">${[...g.expenses].reverse().map((e) => `
      <li><span class="emoji">${e.settle ? '🤝' : '🧾'}</span><div class="grow"><div class="ellipsis">${esc(e.desc)}</div><div class="small muted">${esc(e.payer)} pagó · ${e.settle ? 'saldo' : `entre ${e.among.length}`} · ${parseKey(e.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</div></div>
        <b>${fmtMoney(e.amount)}</b><button class="x-btn" data-del="${e.id}" aria-label="Borrar">✕</button></li>`).join('')}</ul>` : '<p class="muted small" style="margin:0">Sin gastos todavía.</p>'}</div>
    <button class="btn danger block" data-delgroup>Borrar grupo</button>`;

  const save = (fn) => update((d) => fn(d.splitGroups.find((x) => x.id === g.id)));
  view.querySelector('[data-back]').onclick = () => { current = null; rerender(); };
  view.querySelector('[data-add]').onclick = () => openSplitExpense(g, rerender);
  view.querySelectorAll('[data-settle]').forEach((b) => (b.onclick = () => {
    const p = plan[+b.dataset.settle];
    save((x) => x.expenses.push({ id: uid(), desc: `${p.from} → ${p.to}`, amount: p.amount, payer: p.from, among: [p.to], date: dkey(), settle: true }));
    toast('🤝 Pago registrado');
    rerender();
  }));
  view.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => {
    if (!(await confirmSheet('Se borrará este gasto del grupo.'))) return;
    save((x) => (x.expenses = x.expenses.filter((e) => e.id !== b.dataset.del)));
    rerender();
  }));
  view.querySelector('[data-share]').onclick = async () => {
    const text = `👥 ${g.name}\nTotal gastado: ${fmtMoney(total)}\n\n${plan.length ? 'Para quedar en paz:\n' + plan.map((p) => `- ${p.from} paga ${fmtMoney(p.amount)} a ${p.to}`).join('\n') : '¡Estamos en paz!'}\n\nGastos:\n${g.expenses.filter((e) => !e.settle).map((e) => `- ${e.desc}: ${fmtMoney(e.amount)} (pagó ${e.payer})`).join('\n')}`;
    try {
      if (navigator.share) await navigator.share({ title: g.name, text });
      else { await navigator.clipboard.writeText(text); toast('Resumen copiado'); }
    } catch {}
  };
  view.querySelector('[data-delgroup]').onclick = async () => {
    if (!(await confirmSheet('Se borrará el grupo con todos sus gastos.'))) return;
    update((d) => (d.splitGroups = d.splitGroups.filter((x) => x.id !== g.id)));
    current = null;
    rerender();
  };
}

export default {
  title: 'Gastos compartidos',
  render(view, { rerender }) {
    const g = db().splitGroups.find((x) => x.id === current);
    if (g) return renderGroup(view, g, rerender);
    const groups = db().splitGroups;
    view.innerHTML = `
      ${groups.length ? groups.map((x) => {
        const plan = settlements(x);
        return `<button class="card row" data-open="${x.id}" style="width:100%;border:0;text-align:left;cursor:pointer;color:inherit">
          <span style="font-size:26px">👥</span><div class="grow"><b>${esc(x.name)}</b><div class="small muted">${x.members.length} personas · ${x.expenses.length} gastos</div></div>
          <span class="badge">${plan.length ? `${plan.length} pago${plan.length > 1 ? 's' : ''} pendiente${plan.length > 1 ? 's' : ''}` : 'en paz'}</span></button>`;
      }).join('') : '<div class="empty"><span class="big">👥</span>Reparte gastos de piso, viajes o cenas: la app calcula quién debe a quién con el mínimo de pagos.</div>'}
      <button class="fab" aria-label="Nuevo grupo">+</button>`;
    view.querySelector('.fab').onclick = () => openGroupSheet(rerender);
    view.querySelectorAll('[data-open]').forEach((b) => (b.onclick = () => { current = b.dataset.open; rerender(); }));
  },
};
