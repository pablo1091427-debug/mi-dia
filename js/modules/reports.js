// Informe mensual: se genera solo el primer día que abres la app en un mes nuevo.
import { db, update } from '../store.js';
import { esc, dkey, parseKey, MESES, fmtMoney, toast, cap } from '../utils.js';
import { askText, hasKey } from '../ai.js';
import { monthSummary, EXP_CATS } from './expenses.js';
import { MOODS } from './diary.js';

const shiftYm = (ym, n) => {
  const [y, m] = ym.split('-').map(Number);
  return dkey(new Date(y, m - 1 + n, 1)).slice(0, 7);
};
const ymName = (ym) => `${MESES[+ym.slice(5) - 1]} ${ym.slice(0, 4)}`;
const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);

export function computeStats(ym) {
  const d = db();
  const inMonth = (k) => k.startsWith(ym);
  const fin = monthSummary(ym);
  const topCat = Object.entries(fin.byCat).sort((a, b) => b[1] - a[1])[0];
  const daysInMonth = new Date(+ym.slice(0, 4), +ym.slice(5), 0).getDate();
  const elapsed = ym === dkey().slice(0, 7) ? new Date().getDate() : daysInMonth;
  const habitDone = Object.entries(d.habitLog).filter(([k]) => inMonth(k)).reduce((a, [, v]) => a + v.length, 0);
  const weights = d.weights.filter((w) => inMonth(w.date));
  const mood = avg(Object.entries(d.diary).filter(([k, v]) => inMonth(k) && v.mood).map(([, v]) => v.mood));
  return {
    income: fin.income, spent: fin.spent, balance: fin.balance, rate: fin.rate,
    topCat: topCat ? `${(EXP_CATS.find((c) => c.id === topCat[0]) || {}).name} (${fmtMoney(topCat[1])})` : '',
    overBudget: fin.over.map((c) => (EXP_CATS.find((x) => x.id === c) || {}).name),
    sportDays: Object.keys(d.sport).filter(inMonth).length,
    gym: d.gymSessions.filter((s) => inMonth(s.date)).length,
    sleep: avg(Object.entries(d.sleep).filter(([k]) => inMonth(k)).map(([, v]) => v)),
    habits: d.habits.length ? Math.round((habitDone / (d.habits.length * elapsed)) * 100) : null,
    tasksDone: d.tasks.filter((t) => t.done && t.doneAt && inMonth(dkey(new Date(t.doneAt)))).length,
    weight: weights.length >= 2 ? Math.round((weights.at(-1).kg - weights[0].kg) * 10) / 10 : null,
    mood,
    diaryDays: Object.keys(d.diary).filter(inMonth).length,
    days: elapsed,
  };
}

function statsText(ym, s) {
  return [
    `Informe de ${ymName(ym)}${s.days ? ` (${s.days} días)` : ''}:`,
    `Dinero: ingresos ${fmtMoney(s.income)}, gastos ${fmtMoney(s.spent)}, balance ${fmtMoney(s.balance)}${s.rate !== null ? `, ahorro ${Math.round(s.rate * 100)} %` : ''}. Categoría con más gasto: ${s.topCat || 'ninguna'}.${s.overBudget.length ? ` Presupuesto superado en ${s.overBudget.join(', ')}.` : ''}`,
    `Deporte: ${s.sportDays} días, ${s.gym} sesiones de gimnasio.`,
    `Salud: sueño medio ${s.sleep ? s.sleep.toFixed(1) + ' h' : 'sin datos'}${s.weight !== null ? `, peso ${s.weight > 0 ? '+' : ''}${s.weight} kg` : ''}.`,
    `Hábitos cumplidos: ${s.habits !== null ? s.habits + ' %' : 'sin hábitos'}. Tareas completadas: ${s.tasksDone}.`,
    `Diario: ${s.diaryDays} días escritos${s.mood ? `, ánimo medio ${s.mood.toFixed(1)}/5` : ''}.`,
  ].join('\n');
}

export async function generateReport(ym) {
  const stats = computeStats(ym);
  let text = '';
  if (hasKey()) {
    try {
      text = await askText({
        system: 'Eres el asistente personal de «Mi Día». Escribes en español, cercano y motivador, en texto plano sin Markdown, con guiones para las listas. No inventes datos.',
        content: `${statsText(ym, stats)}\n\nEscribe un informe breve del mes: 1) una frase de resumen, 2) lo que ha ido bien, 3) lo que se puede mejorar, 4) tres objetivos concretos para el mes que viene. Máximo 170 palabras.`,
        effort: 'medium',
      });
    } catch {}
  }
  update((d) => {
    d.reports = d.reports.filter((r) => r.ym !== ym);
    d.reports.push({ ym, stats, text, created: Date.now() });
    d.reports.sort((a, b) => b.ym.localeCompare(a.ym));
  });
  return ym;
}

// El primer día que abres la app en un mes nuevo, preparar el informe del mes anterior
export async function maybeMonthlyReport() {
  const prev = shiftYm(dkey().slice(0, 7), -1);
  const d = db();
  if ((d.settings.lastReport || '') >= prev) return;
  const has = [...d.expenses, ...d.incomes].some((x) => x.date.startsWith(prev)) || Object.keys(d.sport).some((k) => k.startsWith(prev)) || Object.keys(d.diary).some((k) => k.startsWith(prev));
  update((x) => (x.settings.lastReport = prev));
  if (!has) return;
  await generateReport(prev);
  toast(`📊 Tu informe de ${MESES[+prev.slice(5) - 1]} está listo (Más → Informes)`);
}

let open = null;

export default {
  title: 'Informes',
  render(view, { rerender }) {
    const reports = db().reports;
    const r = reports.find((x) => x.ym === open);
    if (r) {
      const s = r.stats;
      const tile = (label, value) => `<div class="card"><div class="stat-label">${label}</div><div class="stat" style="font-size:19px">${value}</div></div>`;
      view.innerHTML = `
        <button class="btn small" data-back style="margin-bottom:10px">‹ Todos los informes</button>
        <h2 style="margin:0 4px 10px">📊 ${cap(ymName(r.ym))}</h2>
        ${r.text ? `<div class="card"><div class="ai-box">${esc(r.text)}</div></div>` : ''}
        <div class="grid-2">
          ${tile('💶 Balance', `${s.balance >= 0 ? '+' : ''}${fmtMoney(s.balance)}`)}
          ${tile('Ahorro', s.rate !== null ? Math.round(s.rate * 100) + ' %' : '—')}
          ${tile('Ingresos', fmtMoney(s.income))}
          ${tile('Gastos', fmtMoney(s.spent))}
          ${tile('🏋️ Días de deporte', s.sportDays)}
          ${tile('💪 Gimnasio', `${s.gym} sesiones`)}
          ${tile('😴 Sueño medio', s.sleep ? s.sleep.toFixed(1) + ' h' : '—')}
          ${tile('✅ Hábitos', s.habits !== null ? s.habits + ' %' : '—')}
          ${tile('✔️ Tareas hechas', s.tasksDone)}
          ${tile('⚖️ Peso', s.weight !== null ? `${s.weight > 0 ? '+' : ''}${s.weight} kg` : '—')}
          ${tile('📔 Ánimo', s.mood ? MOODS[Math.round(s.mood) - 1] + ' ' + s.mood.toFixed(1) : '—')}
        </div>
        ${s.topCat ? `<p class="small muted" style="margin-top:10px">Donde más gastaste: ${esc(s.topCat)}.${s.overBudget.length ? ` Presupuesto superado en ${esc(s.overBudget.join(', '))}.` : ''}</p>` : ''}`;
      view.querySelector('[data-back]').onclick = () => { open = null; rerender(); };
      return;
    }
    const cur = dkey().slice(0, 7);
    view.innerHTML = `
      ${reports.length ? `<div class="card"><ul class="list">${reports.map((x) => `
        <li data-open="${x.ym}" style="cursor:pointer"><span class="emoji">📊</span><div class="grow"><b>${cap(ymName(x.ym))}</b><div class="small muted">Balance ${fmtMoney(x.stats.balance)} · ${x.stats.sportDays} días de deporte</div></div><span class="muted">›</span></li>`).join('')}</ul></div>`
      : '<div class="empty"><span class="big">📊</span>El día 1 de cada mes tendrás aquí el informe del mes anterior: dinero, deporte, sueño, hábitos y ánimo.</div>'}
      <button class="btn block" data-gen>📊 Ver informe de ${MESES[+cur.slice(5) - 1]} hasta hoy</button>`;
    view.querySelectorAll('[data-open]').forEach((li) => (li.onclick = () => { open = li.dataset.open; rerender(); }));
    view.querySelector('[data-gen]').onclick = async (e) => {
      e.target.disabled = true;
      e.target.textContent = 'Generando…';
      open = await generateReport(cur);
      rerender();
    };
  },
};
