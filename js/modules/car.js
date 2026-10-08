// Coche: repostajes y consumo, mantenimiento e ITV.
import { db, update } from '../store.js';
import { esc, uid, dkey, parseKey, fmtMoney, toast, sheet, confirmSheet } from '../utils.js';
import { lineChart, bindCharts, tabsHtml, bindTabs } from '../ui.js';
import { addExpense } from './expenses.js';

const num = (v) => parseFloat(String(v).replace(/\s|€/g, '').replace(',', '.'));
const lastKm = () => Math.max(0, ...db().car.fuel.map((f) => f.km || 0), ...db().car.service.map((s) => s.km || 0));

// Consumo entre llenados completos: litros repostados desde el anterior lleno / km recorridos
export function consumption() {
  const fills = [...db().car.fuel].filter((f) => f.km).sort((a, b) => a.km - b.km);
  const out = [];
  let prevFull = null;
  let liters = 0;
  for (const f of fills) {
    if (prevFull) liters += f.liters;
    if (f.full) {
      if (prevFull && f.km > prevFull.km) out.push({ date: f.date, l100: (liters / (f.km - prevFull.km)) * 100, km: f.km - prevFull.km });
      prevFull = f;
      liters = 0;
    }
  }
  return out;
}

export function addFuel({ date = dkey(), km = 0, liters, price, full = true, asExpense = true }) {
  if (!(liters > 0) || !(price > 0)) throw new Error('Faltan litros o importe');
  update((d) => d.car.fuel.push({ id: uid(), date, km: km || 0, liters: Math.round(liters * 100) / 100, price: Math.round(price * 100) / 100, full }));
  if (asExpense) addExpense({ amount: price, concept: `Gasolina ${liters} L`, cat: 'transport', date });
}

function openFuelSheet(onSaved) {
  const s = sheet({
    title: '⛽ Repostaje',
    body: `<form>
      <div class="row">
        <label class="field grow"><span>Litros</span><input class="input" name="liters" inputmode="decimal" required></label>
        <label class="field grow"><span>Total (€)</span><input class="input" name="price" inputmode="decimal" required></label>
      </div>
      <div class="row">
        <label class="field grow"><span>Km del cuentakilómetros</span><input class="input" name="km" inputmode="numeric" placeholder="${lastKm() || ''}"></label>
        <label class="field grow"><span>Fecha</span><input class="input" type="date" name="date" value="${dkey()}"></label>
      </div>
      <label class="check"><input type="checkbox" name="full" checked> Depósito lleno (necesario para calcular el consumo)</label>
      <label class="check"><input type="checkbox" name="exp" checked> Apuntarlo también en Finanzas</label>
      <button class="btn primary block" style="margin-top:8px">Guardar</button></form>`,
  });
  const f = s.el.querySelector('form');
  f.onsubmit = (e) => {
    e.preventDefault();
    try {
      addFuel({ date: f.date.value || dkey(), km: parseInt(f.km.value, 10) || 0, liters: num(f.liters.value), price: num(f.price.value), full: f.full.checked, asExpense: f.exp.checked });
      s.close();
      toast('⛽ Repostaje guardado');
      onSaved?.();
    } catch (err) {
      toast(err.message);
    }
  };
}

function openServiceSheet(onSaved) {
  const s = sheet({
    title: '🔧 Mantenimiento',
    body: `<form>
      <label class="field"><span>¿Qué se hizo?</span><input class="input" name="what" required placeholder="Cambio de aceite, ruedas, frenos…" list="svc">
        <datalist id="svc"><option value="Cambio de aceite y filtros"><option value="Neumáticos"><option value="Pastillas de freno"><option value="Revisión oficial"><option value="ITV"><option value="Batería"></datalist></label>
      <div class="row">
        <label class="field grow"><span>Coste (€)</span><input class="input" name="cost" inputmode="decimal"></label>
        <label class="field grow"><span>Km</span><input class="input" name="km" inputmode="numeric" placeholder="${lastKm() || ''}"></label>
      </div>
      <label class="field"><span>Fecha</span><input class="input" type="date" name="date" value="${dkey()}"></label>
      <label class="check"><input type="checkbox" name="exp" checked> Apuntarlo también en Finanzas</label>
      <button class="btn primary block" style="margin-top:8px">Guardar</button></form>`,
  });
  const f = s.el.querySelector('form');
  f.onsubmit = (e) => {
    e.preventDefault();
    const cost = num(f.cost.value) || 0;
    update((d) => d.car.service.push({ id: uid(), date: f.date.value || dkey(), km: parseInt(f.km.value, 10) || 0, what: f.what.value.trim(), cost }));
    if (cost > 0 && f.exp.checked) addExpense({ amount: cost, concept: f.what.value.trim(), cat: 'transport', date: f.date.value || dkey() });
    s.close();
    onSaved?.();
  };
}

let tab = 'resumen';

export default {
  title: 'Coche',
  quickAdd: (rerender) => openFuelSheet(rerender),
  render(view, { rerender }) {
    const { fuel, service } = db().car;
    const cons = consumption();
    const avg = cons.length ? cons.reduce((a, c) => a + c.l100 * c.km, 0) / cons.reduce((a, c) => a + c.km, 0) : null;
    const year = String(new Date().getFullYear());
    const fuelYear = fuel.filter((f) => f.date.startsWith(year)).reduce((a, f) => a + f.price, 0);
    const svcYear = service.filter((x) => x.date.startsWith(year)).reduce((a, x) => a + x.cost, 0);
    const kmFills = [...fuel].filter((f) => f.km).sort((a, b) => a.km - b.km);
    const kmDriven = kmFills.length >= 2 ? kmFills.at(-1).km - kmFills[0].km : 0;
    const euroKm = kmDriven ? kmFills.slice(1).reduce((a, f) => a + f.price, 0) / kmDriven : null;
    const itv = db().deadlines.find((x) => /itv/i.test(x.name));
    let body = '';
    if (tab === 'resumen') {
      body = `
        <div class="grid-2">
          <div class="card"><div class="stat-label">Consumo medio</div><div class="stat" style="font-size:22px">${avg ? avg.toFixed(1).replace('.', ',') + ' L' : '—'}</div><div class="small muted">cada 100 km</div></div>
          <div class="card"><div class="stat-label">Coste por km</div><div class="stat" style="font-size:22px">${euroKm ? (euroKm * 100).toFixed(1).replace('.', ',') + ' €' : '—'}</div><div class="small muted">cada 100 km en gasolina</div></div>
          <div class="card"><div class="stat-label">Gasolina ${year}</div><div class="stat" style="font-size:20px">${fmtMoney(fuelYear)}</div></div>
          <div class="card"><div class="stat-label">Taller ${year}</div><div class="stat" style="font-size:20px">${fmtMoney(svcYear)}</div></div>
        </div>
        <div class="card" style="margin-top:12px"><h2>Consumo (L/100 km)</h2>${lineChart(cons.map((c) => ({ label: parseKey(c.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }), y: Math.round(c.l100 * 10) / 10 })), { unit: ' L' })}
          <p class="small muted" style="margin:6px 0 0">Se calcula entre dos repostajes con el depósito lleno y los km apuntados.</p></div>
        <div class="card row"><span style="font-size:24px">📌</span><div class="grow">${itv ? `ITV: <b>${parseKey(itv.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}</b>` : 'No tienes la ITV apuntada'}</div><a class="btn small" href="#/vencimientos?nuevo=1">${itv ? 'Ver' : 'Añadir'}</a></div>
        <div class="row wrap" style="gap:8px"><button class="btn primary grow" data-fuel>⛽ Repostaje</button><button class="btn grow" data-svc>🔧 Mantenimiento</button></div>`;
    } else if (tab === 'repostajes') {
      body = `<div class="card">${fuel.length ? `<ul class="list">${[...fuel].sort((a, b) => b.date.localeCompare(a.date)).map((f) => `
        <li><span class="emoji">⛽</span><div class="grow"><div>${f.liters} L · <b>${fmtMoney(f.price)}</b> <span class="small muted">(${(f.price / f.liters).toFixed(3).replace('.', ',')} €/L)</span></div>
          <div class="small muted">${parseKey(f.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}${f.km ? ` · ${f.km.toLocaleString('es-ES')} km` : ''}${f.full ? '' : ' · parcial'}</div></div>
          <button class="x-btn" data-delf="${f.id}" aria-label="Borrar">✕</button></li>`).join('')}</ul>` : '<p class="muted small" style="margin:0">Sin repostajes.</p>'}</div>
        <button class="btn primary block" data-fuel>⛽ Nuevo repostaje</button>`;
    } else {
      body = `<div class="card">${service.length ? `<ul class="list">${[...service].sort((a, b) => b.date.localeCompare(a.date)).map((x) => `
        <li><span class="emoji">🔧</span><div class="grow"><div>${esc(x.what)}</div><div class="small muted">${parseKey(x.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}${x.km ? ` · ${x.km.toLocaleString('es-ES')} km` : ''}</div></div>
          ${x.cost ? `<b>${fmtMoney(x.cost)}</b>` : ''}<button class="x-btn" data-dels="${x.id}" aria-label="Borrar">✕</button></li>`).join('')}</ul>` : '<p class="muted small" style="margin:0">Sin mantenimientos.</p>'}</div>
        <button class="btn primary block" data-svc>🔧 Nuevo mantenimiento</button>`;
    }
    view.innerHTML = tabsHtml([['resumen', 'Resumen'], ['repostajes', 'Repostajes'], ['taller', 'Taller']], tab) + body;
    bindTabs(view, (t) => { tab = t; rerender(); });
    bindCharts(view);
    view.querySelectorAll('[data-fuel]').forEach((b) => (b.onclick = () => openFuelSheet(rerender)));
    view.querySelectorAll('[data-svc]').forEach((b) => (b.onclick = () => openServiceSheet(rerender)));
    view.querySelectorAll('[data-delf]').forEach((b) => (b.onclick = async () => {
      if (!(await confirmSheet('Se borrará este repostaje (el gasto en Finanzas se mantiene).'))) return;
      update((d) => (d.car.fuel = d.car.fuel.filter((x) => x.id !== b.dataset.delf)));
      rerender();
    }));
    view.querySelectorAll('[data-dels]').forEach((b) => (b.onclick = async () => {
      if (!(await confirmSheet('Se borrará este mantenimiento.'))) return;
      update((d) => (d.car.service = d.car.service.filter((x) => x.id !== b.dataset.dels)));
      rerender();
    }));
  },
};
