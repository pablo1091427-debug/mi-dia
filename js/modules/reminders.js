import { db, update } from '../store.js';
import { esc, uid, dkey, parseKey, addDays, fmtShort, toast, sheet, confirmSheet } from '../utils.js';
import * as G from '../google.js';

const when = (r) => new Date(`${r.date}T${r.time || '09:00'}`);
export const pendingReminders = () => db().reminders.filter((r) => !r.done).sort((a, b) => when(a) - when(b));
export const isOverdue = (r) => !r.done && when(r) <= new Date();

// Crea el recordatorio. Con Google conectado también crea un evento con aviso,
// así el móvil avisa aunque la app esté cerrada.
export async function addReminder({ text, date, time }) {
  text = String(text || '').trim();
  if (!text) throw new Error('Falta el texto del recordatorio');
  date = date || dkey();
  time = time || '09:00';
  let googleId = null;
  if (G.isReady()) {
    googleId = await G.createEvent({ title: `⏰ ${text}`, date, start: time, reminderMinutes: 0, durationMin: 15 });
  }
  const r = { id: uid(), text, date, time, done: false, notified: false, googleId };
  update((d) => d.reminders.push(r));
  return r;
}

export function setDone(id, done = true) {
  update((d) => {
    const r = d.reminders.find((x) => x.id === id);
    if (r) r.done = done;
  });
}

async function removeReminder(r) {
  if (r.googleId && G.isReady()) {
    try { await G.deleteEvent(r.googleId); } catch {}
  }
  update((d) => (d.reminders = d.reminders.filter((x) => x.id !== r.id)));
}

// Aviso dentro de la app para los recordatorios que no están en Google
export async function checkReminders() {
  const due = db().reminders.filter((r) => isOverdue(r) && !r.notified);
  if (!due.length) return;
  update((d) => d.reminders.forEach((r) => due.some((x) => x.id === r.id) && (r.notified = true)));
  for (const r of due.filter((x) => !x.googleId)) {
    toast(`⏰ ${r.text}`);
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        const reg = await navigator.serviceWorker?.ready;
        reg?.showNotification('⏰ Recordatorio', { body: r.text, icon: 'icons/icon-192.png', tag: r.id });
      } catch {}
    }
  }
}

export const whenLabel = (r) => {
  const today = dkey();
  const tomorrow = dkey(addDays(new Date(), 1));
  const day = r.date === today ? 'Hoy' : r.date === tomorrow ? 'Mañana' : fmtShort(parseKey(r.date));
  return `${day} · ${r.time}`;
};

export function openReminderSheet(onSaved) {
  const toGoogle = G.isReady();
  const s = sheet({
    title: 'Nuevo recordatorio',
    body: `
      <form>
        <label class="field"><span>¿Qué te recuerdo?</span><input class="input" name="text" required placeholder="Llamar al dentista"></label>
        <div class="chips" style="margin-bottom:12px">
          <button type="button" class="chip" data-in="60">En 1 hora</button>
          <button type="button" class="chip" data-in="180">En 3 horas</button>
          <button type="button" class="chip" data-tomorrow>Mañana 9:00</button>
        </div>
        <div class="row">
          <label class="field grow"><span>Día</span><input class="input" type="date" name="date" value="${dkey()}" required></label>
          <label class="field grow"><span>Hora</span><input class="input" type="time" name="time" value="${String(Math.min(23, new Date().getHours() + 1)).padStart(2, '0')}:00" required></label>
        </div>
        <p class="small muted">${toGoogle ? '🔔 Te avisará Google Calendar en el móvil aunque la app esté cerrada.' : '🔔 Te avisará la app si está abierta. Conecta Google Calendar en Ajustes para recibir el aviso siempre.'}</p>
        <button class="btn primary block">Guardar</button>
      </form>`,
  });
  const f = s.el.querySelector('form');
  const setFrom = (dt) => {
    f.date.value = dkey(dt);
    f.time.value = `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
  };
  s.el.querySelectorAll('[data-in]').forEach((b) => (b.onclick = () => setFrom(new Date(Date.now() + +b.dataset.in * 60000))));
  s.el.querySelector('[data-tomorrow]').onclick = () => {
    const t = addDays(new Date(), 1);
    t.setHours(9, 0, 0, 0);
    setFrom(t);
  };
  f.onsubmit = async (e) => {
    e.preventDefault();
    const btn = f.querySelector('button.primary');
    btn.disabled = true;
    try {
      await addReminder({ text: f.text.value, date: f.date.value, time: f.time.value });
      s.close();
      toast('Recordatorio guardado');
      onSaved?.();
    } catch (err) {
      btn.disabled = false;
      toast(err.message);
    }
  };
}

export default {
  title: 'Recordatorios',
  quickAdd: (rerender) => openReminderSheet(rerender),
  render(view, { rerender }) {
    const pending = pendingReminders();
    const done = db().reminders.filter((r) => r.done);
    const canAsk = 'Notification' in window && Notification.permission === 'default';

    view.innerHTML = `
      ${canAsk ? '<div class="card row small"><span class="grow">Permite las notificaciones para que la app pueda avisarte.</span><button class="btn small primary" data-perm>Permitir</button></div>' : ''}
      ${pending.length ? `<div class="card"><ul class="list">${pending.map((r) => `
        <li><input type="checkbox" data-done="${r.id}" style="width:22px;height:22px;accent-color:var(--accent)" aria-label="Hecho">
          <div class="grow"><div style="font-weight:600">${esc(r.text)}</div>
            <div class="small" style="color:${isOverdue(r) ? 'var(--danger)' : 'var(--muted)'}">${isOverdue(r) ? '⚠️ ' : ''}${whenLabel(r)}${r.googleId ? ' · 📅 Google' : ''}</div></div>
          <button class="x-btn" data-del="${r.id}" aria-label="Borrar">✕</button></li>`).join('')}</ul></div>`
      : '<div class="empty"><span class="big">⏰</span>No tienes recordatorios pendientes.</div>'}
      ${done.length ? `
        <details class="card"><summary class="muted">Hechos (${done.length})</summary>
          <ul class="list">${done.map((r) => `<li><span class="grow muted" style="text-decoration:line-through">${esc(r.text)}</span><button class="x-btn" data-undo="${r.id}" aria-label="Deshacer">↩</button></li>`).join('')}</ul>
          <button class="btn small block" data-clear>Borrar hechos</button>
        </details>` : ''}
      <button class="fab" aria-label="Nuevo recordatorio">+</button>`;

    view.querySelector('.fab').onclick = () => openReminderSheet(rerender);
    view.querySelector('[data-perm]')?.addEventListener('click', async () => {
      await Notification.requestPermission();
      rerender();
    });
    view.querySelectorAll('[data-done]').forEach((c) => {
      c.onchange = () => {
        setDone(c.dataset.done);
        toast('✅ Hecho');
        rerender();
      };
    });
    view.querySelectorAll('[data-undo]').forEach((b) => {
      b.onclick = () => {
        setDone(b.dataset.undo, false);
        rerender();
      };
    });
    view.querySelectorAll('[data-del]').forEach((b) => {
      b.onclick = async () => {
        if (!(await confirmSheet('Se borrará este recordatorio.'))) return;
        await removeReminder(db().reminders.find((r) => r.id === b.dataset.del));
        rerender();
      };
    });
    view.querySelector('[data-clear]')?.addEventListener('click', () => {
      update((d) => (d.reminders = d.reminders.filter((r) => !r.done)));
      rerender();
    });
  },
};
