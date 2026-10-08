// Vencimientos importantes (ITV, seguros, DNI, revisiones…) con aviso con antelación.
import { db, update } from '../store.js';
import { esc, uid, dkey, parseKey, addDays, toast, sheet, confirmSheet } from '../utils.js';
import * as G from '../google.js';

export const DL_CATS = [
  { id: 'car', name: 'Coche', e: '🚗', examples: 'ITV, seguro, revisión, impuesto de circulación' },
  { id: 'docs', name: 'Documentos', e: '🪪', examples: 'DNI, pasaporte, carnet de conducir' },
  { id: 'insurance', name: 'Seguros', e: '🛡️', examples: 'hogar, vida, salud' },
  { id: 'health', name: 'Salud', e: '🩺', examples: 'dentista, revisión médica, vacunas' },
  { id: 'home', name: 'Hogar', e: '🏠', examples: 'caldera, contratos, alquiler' },
  { id: 'money', name: 'Dinero', e: '🧾', examples: 'renta, IBI, domiciliaciones' },
  { id: 'other', name: 'Otros', e: '📌', examples: '' },
];
const catOf = (id) => DL_CATS.find((c) => c.id === id) || DL_CATS.at(-1);

export const daysLeft = (dl) => Math.round((parseKey(dl.date) - parseKey(dkey())) / 86400000);
export const upcomingDeadlines = () => [...db().deadlines].sort((a, b) => a.date.localeCompare(b.date));
// Vencimientos dentro de su periodo de aviso (o ya vencidos)
export const dueSoon = () => upcomingDeadlines().filter((dl) => daysLeft(dl) <= (dl.noticeDays || 30));

export function leftLabel(n) {
  if (n < 0) return `Venció hace ${-n} días`;
  if (n === 0) return '¡Vence hoy!';
  if (n === 1) return 'Vence mañana';
  if (n < 60) return `En ${n} días`;
  return `En ${Math.round(n / 30)} meses`;
}

// Con Google conectado se crea un evento de día completo con aviso N días antes (máximo 4 semanas en Google)
export async function addDeadline({ name, date, cat = 'other', noticeDays = 30, yearly = false, notes = '' }) {
  name = String(name || '').trim();
  if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new Error('Faltan el nombre o la fecha');
  let googleId = null;
  if (G.isReady()) {
    try {
      googleId = await G.createEvent({ title: `📌 Vence: ${name}`, date, allDay: true, notes, reminderMinutes: Math.min(40320, noticeDays * 1440) });
    } catch {}
  }
  const dl = { id: uid(), name, date, cat, noticeDays: +noticeDays || 30, yearly: !!yearly, notes, googleId };
  update((d) => d.deadlines.push(dl));
  return dl;
}

function openDeadlineSheet(onSaved) {
  const s = sheet({
    title: 'Nuevo vencimiento',
    body: `
      <form>
        <label class="field"><span>¿Qué vence?</span><input class="input" name="name" required placeholder="ITV del coche"></label>
        <div class="row">
          <label class="field grow"><span>Fecha</span><input class="input" type="date" name="date" required></label>
          <label class="field grow"><span>Tipo</span><select class="input" name="cat">${DL_CATS.map((c) => `<option value="${c.id}">${c.e} ${c.name}</option>`).join('')}</select></label>
        </div>
        <label class="field"><span>Avisarme antes</span><select class="input" name="notice">
          <option value="7">1 semana antes</option><option value="15">15 días antes</option><option value="30" selected>1 mes antes</option><option value="60">2 meses antes</option><option value="90">3 meses antes</option></select></label>
        <label class="check"><input type="checkbox" name="yearly"> Se repite cada año (al renovarlo pasa al año siguiente)</label>
        <label class="field"><span>Notas</span><input class="input" name="notes" placeholder="Nº de póliza, taller…"></label>
        <p class="small muted">${G.isReady() ? '📅 También se creará en Google Calendar con aviso.' : 'Aparecerá en Inicio cuando entre en el periodo de aviso.'}</p>
        <button class="btn primary block">Guardar</button>
      </form>`,
  });
  const f = s.el.querySelector('form');
  f.onsubmit = async (e) => {
    e.preventDefault();
    try {
      await addDeadline({ name: f.name.value, date: f.date.value, cat: f.cat.value, noticeDays: +f.notice.value, yearly: f.yearly.checked, notes: f.notes.value.trim() });
      s.close();
      toast('Vencimiento guardado');
      onSaved?.();
    } catch (err) {
      toast(err.message);
    }
  };
}

async function renew(dl) {
  const next = parseKey(dl.date);
  next.setFullYear(next.getFullYear() + 1);
  update((d) => (d.deadlines = d.deadlines.filter((x) => x.id !== dl.id)));
  await addDeadline({ ...dl, date: dkey(next) });
}

export default {
  title: 'Vencimientos',
  quickAdd: (rerender) => openDeadlineSheet(rerender),
  render(view, { rerender }) {
    const list = upcomingDeadlines();
    view.innerHTML = `
      ${list.length ? `<div class="card"><ul class="list">${list.map((dl) => {
        const n = daysLeft(dl);
        const soon = n <= (dl.noticeDays || 30);
        return `<li><span class="emoji">${catOf(dl.cat).e}</span>
          <div class="grow"><div style="font-weight:600">${esc(dl.name)}</div>
            <div class="small ${n < 0 || (soon && n <= 7) ? 'warn-text' : soon ? '' : 'muted'}">${parseKey(dl.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })} · ${leftLabel(n)}${dl.yearly ? ' · 🔁 anual' : ''}</div>
            ${dl.notes ? `<div class="small muted ellipsis">${esc(dl.notes)}</div>` : ''}</div>
          <button class="btn small" data-done="${dl.id}">${dl.yearly ? 'Renovado' : 'Hecho'}</button></li>`;
      }).join('')}</ul></div>`
      : `<div class="empty"><span class="big">📌</span>Apunta lo que caduca para que no se te pase: ${DL_CATS.slice(0, 4).map((c) => c.examples.split(',')[0]).join(', ')}…</div>`}
      <button class="fab" aria-label="Nuevo vencimiento">+</button>`;
    view.querySelector('.fab').onclick = () => openDeadlineSheet(rerender);
    view.querySelectorAll('[data-done]').forEach((b) => {
      b.onclick = async () => {
        const dl = db().deadlines.find((x) => x.id === b.dataset.done);
        if (dl.yearly) {
          await renew(dl);
          toast('🔁 Renovado: te avisaré el año que viene');
        } else {
          if (!(await confirmSheet(`¿Quitar «${dl.name}» de la lista?`, 'Quitar'))) return;
          update((d) => (d.deadlines = d.deadlines.filter((x) => x.id !== dl.id)));
        }
        rerender();
      };
    });
  },
};
