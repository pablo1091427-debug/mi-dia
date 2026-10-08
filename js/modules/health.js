// Salud: peso y cintura, y sueño.
import { db, update } from '../store.js';
import { esc, dkey, parseKey, addDays, toast, sheet } from '../utils.js';
import { lineChart, bindCharts } from '../ui.js';

export function logWeight({ kg, waist = null, date = dkey() }) {
  if (!(kg > 20 && kg < 400)) throw new Error('Peso no válido');
  update((d) => {
    d.weights = d.weights.filter((w) => w.date !== date);
    d.weights.push({ date, kg: Math.round(kg * 10) / 10, waist: waist || null });
    d.weights.sort((a, b) => a.date.localeCompare(b.date));
  });
}
export function logSleep(hours, date = dkey()) {
  if (!(hours >= 0 && hours <= 24)) throw new Error('Horas no válidas');
  update((d) => (d.sleep[date] = Math.round(hours * 2) / 2));
}

const dm = (k) => parseKey(k).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

function openWeightSheet(onSaved) {
  const last = db().weights.at(-1);
  const s = sheet({
    title: 'Registrar peso',
    body: `<form>
      <div class="row">
        <label class="field grow"><span>Peso (kg)</span><input class="input" name="kg" inputmode="decimal" required value="${last ? String(last.kg).replace('.', ',') : ''}" style="font-size:22px;font-weight:700"></label>
        <label class="field grow"><span>Cintura (cm, opcional)</span><input class="input" name="waist" inputmode="decimal" value="${last?.waist || ''}"></label>
      </div>
      <label class="field"><span>Fecha</span><input class="input" type="date" name="date" value="${dkey()}"></label>
      <button class="btn primary block">Guardar</button></form>`,
  });
  const f = s.el.querySelector('form');
  f.onsubmit = (e) => {
    e.preventDefault();
    try {
      logWeight({ kg: parseFloat(f.kg.value.replace(',', '.')), waist: parseFloat(f.waist.value.replace(',', '.')) || null, date: f.date.value || dkey() });
      s.close();
      toast('Peso guardado');
      onSaved?.();
    } catch (err) {
      toast(err.message);
    }
  };
}

export default {
  title: 'Salud',
  render(view, { rerender }) {
    const d = db();
    const last14 = Array.from({ length: 14 }, (_, i) => dkey(addDays(new Date(), i - 13)));
    const sleepPts = last14.filter((k) => d.sleep[k] !== undefined).map((k) => ({ label: dm(k), y: d.sleep[k], tip: `${dm(k)}: ${d.sleep[k]} h` }));
    const sleepAvg = sleepPts.length ? sleepPts.reduce((a, p) => a + p.y, 0) / sleepPts.length : null;
    const weights = d.weights.slice(-30);
    const wPts = weights.map((x) => ({ label: dm(x.date), y: x.kg, tip: `${dm(x.date)}: ${x.kg} kg${x.waist ? ` · cintura ${x.waist} cm` : ''}` }));
    const diff = weights.length >= 2 ? Math.round((weights.at(-1).kg - weights[0].kg) * 10) / 10 : null;
    const waists = d.weights.filter((x) => x.waist).slice(-30).map((x) => ({ label: dm(x.date), y: x.waist }));
    const yesterday = dkey(addDays(new Date(), -1));

    view.innerHTML = `
      <div class="card">
        <h2>😴 Sueño ${sleepAvg !== null ? `<span class="badge" style="margin-left:auto">Media ${sleepAvg.toFixed(1)} h</span>` : ''}</h2>
        <div class="row small"><span class="grow">¿Cuánto dormiste anoche?</span>
          <select class="input" style="width:auto" data-sleep>${['', 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10].map((h) => `<option value="${h}" ${d.sleep[dkey()] === h ? 'selected' : ''}>${h === '' ? '—' : h + ' h'}</option>`).join('')}</select></div>
        <div style="margin-top:10px">${lineChart(sleepPts, { unit: ' h', height: 130 })}</div>
        <p class="small muted" style="margin:6px 0 0">Últimos 14 días. Se recomienda dormir entre 7 y 9 horas.</p>
      </div>

      <div class="card">
        <h2>⚖️ Peso ${weights.length ? `<span class="badge" style="margin-left:auto">${weights.at(-1).kg} kg</span>` : ''}</h2>
        ${lineChart(wPts, { unit: ' kg' })}
        ${diff !== null ? `<p class="small muted" style="margin:6px 0 0">${diff > 0 ? '+' : ''}${diff} kg desde el ${dm(weights[0].date)}.</p>` : ''}
        <button class="btn block" data-weight style="margin-top:10px">+ Registrar peso</button>
      </div>
      ${waists.length >= 2 ? `<div class="card"><h2>📏 Cintura (cm)</h2>${lineChart(waists, { unit: ' cm', height: 130 })}</div>` : ''}
      <p class="small muted" style="text-align:center">El sueño se apunta para hoy; si se te olvidó, el de ayer: <a href="javascript:void 0" data-sleepy>apuntar ayer</a></p>`;

    bindCharts(view);
    view.querySelector('[data-sleep]').onchange = (e) => {
      if (e.target.value === '') update((x) => delete x.sleep[dkey()]);
      else logSleep(+e.target.value);
      rerender();
    };
    view.querySelector('[data-sleepy]').onclick = () => {
      const s = sheet({
        title: 'Sueño de ayer',
        body: `<div class="chips" style="flex-wrap:wrap">${[5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9].map((h) => `<button class="chip ${d.sleep[yesterday] === h ? 'active' : ''}" data-h="${h}">${h} h</button>`).join('')}</div>`,
      });
      s.el.querySelectorAll('[data-h]').forEach((b) => (b.onclick = () => { logSleep(+b.dataset.h, yesterday); s.close(); rerender(); }));
    };
    view.querySelector('[data-weight]').onclick = () => openWeightSheet(rerender);
  },
};
