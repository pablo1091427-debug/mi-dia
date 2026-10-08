// Diario: una línea al día con tu estado de ánimo.
import { db, update } from '../store.js';
import { esc, dkey, parseKey, addDays, fmtLong, cap, toast } from '../utils.js';
import { lineChart, bindCharts } from '../ui.js';

export const MOODS = ['😞', '😕', '😐', '🙂', '😄'];

export function writeDiary({ text = '', mood = 0, date = dkey() }) {
  update((d) => {
    const prev = d.diary[date] || {};
    d.diary[date] = { text: text || prev.text || '', mood: mood || prev.mood || 0 };
    if (!d.diary[date].text && !d.diary[date].mood) delete d.diary[date];
  });
}

export function diaryStreak() {
  const d = db().diary;
  let cursor = d[dkey()] ? new Date() : addDays(new Date(), -1);
  let n = 0;
  while (d[dkey(cursor)]) { n++; cursor = addDays(cursor, -1); }
  return n;
}

export default {
  title: 'Diario',
  render(view, { rerender }) {
    const d = db().diary;
    const today = dkey();
    const entry = d[today] || {};
    const days = Object.keys(d).sort().reverse();
    const yearAgo = dkey(addDays(new Date(), -365));
    const last30 = Array.from({ length: 30 }, (_, i) => dkey(addDays(new Date(), i - 29))).filter((k) => d[k]?.mood);
    const avg = last30.length ? last30.reduce((a, k) => a + d[k].mood, 0) / last30.length : null;

    view.innerHTML = `
      <div class="card">
        <h2>¿Qué tal hoy? <span class="badge" style="margin-left:auto">🔥 ${diaryStreak()} días</span></h2>
        <div class="row" style="justify-content:space-between;margin-bottom:10px">${MOODS.map((m, i) => `<button class="btn" data-mood="${i + 1}" style="font-size:28px;width:54px;${entry.mood === i + 1 ? 'background:var(--accent-soft);outline:2px solid var(--accent)' : ''}" aria-label="Ánimo ${i + 1}">${m}</button>`).join('')}</div>
        <textarea class="input" data-text rows="2" placeholder="Una línea sobre tu día…">${esc(entry.text || '')}</textarea>
        <button class="btn primary block" data-save style="margin-top:8px">Guardar</button>
      </div>
      ${d[yearAgo] ? `<div class="card"><h2>📅 Hace un año</h2><p style="margin:0">${MOODS[(d[yearAgo].mood || 3) - 1]} ${esc(d[yearAgo].text)}</p></div>` : ''}
      <div class="card"><h2>Ánimo (30 días)${avg ? ` <span class="badge" style="margin-left:auto">Media ${MOODS[Math.round(avg) - 1]}</span>` : ''}</h2>
        ${lineChart(last30.map((k) => ({ label: parseKey(k).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }), y: d[k].mood, tip: `${parseKey(k).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}: ${MOODS[d[k].mood - 1]} ${d[k].text.slice(0, 40)}` })), { height: 120 })}</div>
      ${days.length ? `<div class="section-title">Entradas</div><div class="card"><ul class="list">${days.slice(0, 60).map((k) => `
        <li><span class="emoji">${d[k].mood ? MOODS[d[k].mood - 1] : '📝'}</span><div class="grow"><div class="small muted">${cap(fmtLong(parseKey(k)))}</div><div>${esc(d[k].text)}</div></div></li>`).join('')}</ul></div>` : ''}`;

    let mood = entry.mood || 0;
    bindCharts(view);
    view.querySelectorAll('[data-mood]').forEach((b) => (b.onclick = () => {
      mood = +b.dataset.mood;
      view.querySelectorAll('[data-mood]').forEach((x) => (x.style.cssText = `font-size:28px;width:54px;${x === b ? 'background:var(--accent-soft);outline:2px solid var(--accent)' : ''}`));
    }));
    view.querySelector('[data-save]').onclick = () => {
      writeDiary({ text: view.querySelector('[data-text]').value.trim(), mood });
      toast('📔 Guardado');
      rerender();
    };
  },
};
