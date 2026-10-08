import { db, update } from '../store.js';
import { esc, dkey, addDays, fmtLong, MESES, fmtMoney, toast } from '../utils.js';
import { itemsForDay } from './calendar.js';
import { sportStats } from './sport.js';
import { isDone } from './habits.js';
import { upcomingBirthdays } from './birthdays.js';
import { monthTotal } from './expenses.js';
import { cachedWeather, wInfo } from './weather.js';

const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.127.0/+esm';
export const MODELS = [
  { id: 'claude-opus-5-5', name: 'Claude Opus 5.5 (el más listo)' },
  { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5 (equilibrado)' },
  { id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5 (rápido y barato)' },
];

// Resumen de los datos de la app para que el asistente conozca tu día
function context() {
  const d = db();
  const today = new Date();
  const fmtItems = (k) => itemsForDay(k).map((e) => `- ${e.allDay ? 'Todo el día' : e.start}: ${e.title}`).join('\n') || '- (nada)';
  const st = sportStats();
  const w = cachedWeather();
  const lines = [
    `Fecha y hora actual: ${fmtLong(today)}, ${today.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}.`,
    `Agenda de hoy (eventos guardados en la app):\n${fmtItems(dkey(today))}`,
    `Agenda de mañana:\n${fmtItems(dkey(addDays(today, 1)))}`,
    `Deporte: racha de ${st.streak} días, ${st.week}/${st.goal} entrenamientos esta semana, ${st.month} este mes. ${st.doneToday ? 'Hoy ya ha entrenado.' : 'Hoy aún no ha entrenado.'}`,
  ];
  if (d.habits.length) lines.push(`Hábitos de hoy: ${d.habits.map((h) => `${h.name} (${isDone(h.id) ? 'hecho' : 'pendiente'})`).join(', ')}.`);
  const shop = d.shopping.filter((i) => !i.done).map((i) => i.text);
  if (shop.length) lines.push(`Lista de la compra pendiente: ${shop.join(', ')}.`);
  const bd = upcomingBirthdays().filter((b) => b.days <= 30);
  if (bd.length) lines.push(`Próximos cumpleaños: ${bd.map((b) => `${b.name} el ${b.day} de ${MESES[b.month - 1]} (en ${b.days} días)`).join('; ')}.`);
  lines.push(`Gasto apuntado este mes: ${fmtMoney(monthTotal())}.`);
  if (w) {
    const c = w.w.current;
    lines.push(`Tiempo en ${w.place || 'su zona'}: ${Math.round(c.temperature_2m)}°C, ${wInfo(c.weather_code).t}; hoy máx ${Math.round(w.w.daily.temperature_2m_max[0])}° y mín ${Math.round(w.w.daily.temperature_2m_min[0])}°, probabilidad de lluvia ${w.w.daily.precipitation_probability_max[0]}%.`);
  }
  if (d.notes.length) lines.push(`Títulos de sus notas: ${d.notes.slice(0, 15).map((n) => n.title || n.body.slice(0, 40)).join(' | ')}.`);
  return lines.join('\n');
}

const SYSTEM = `Eres el asistente personal integrado en «Mi Día», la app personal del usuario (calendario, notas, deporte, hábitos, gastos, compra, cumpleaños). Respondes en español, de forma cercana, breve y práctica, como un buen amigo organizado. Escribe en texto plano sin Markdown (sin asteriscos ni almohadillas); usa guiones para las listas. No puedes modificar los datos de la app: si el usuario quiere apuntar algo, dile en qué sección hacerlo.

Datos actuales de la app:
`;

let sending = false;

async function ask(messages) {
  const { anthropicKey, model } = db().settings;
  const { default: Anthropic } = await import(SDK_URL);
  const client = new Anthropic({ apiKey: anthropicKey, dangerouslyAllowBrowser: true });
  const params = {
    model,
    max_tokens: 4000,
    system: SYSTEM + context(),
    messages,
    output_config: { effort: 'low' },
  };
  try {
    // Opus y Sonnet: si la petición se rechaza por seguridad, la API reintenta con otro modelo
    const resp = model === 'claude-haiku-5-5'
      ? await client.messages.create(params)
      : await client.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' });
    if (resp.stop_reason === 'refusal') return 'Lo siento, no puedo ayudar con eso.';
    return resp.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim() || '(Sin respuesta)';
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new Error('La clave de API no es válida. Revísala en Ajustes.');
    if (e instanceof Anthropic.RateLimitError) throw new Error('Demasiadas peticiones; espera un momento.');
    if (e instanceof Anthropic.APIConnectionError) throw new Error('Sin conexión con Claude. ¿Tienes internet?');
    if (e instanceof Anthropic.APIError) throw new Error(`Error de la API (${e.status}): ${e.message}`);
    throw e;
  }
}

export default {
  title: 'Asistente',
  render(view, { rerender }) {
    const { settings, chat } = db();
    if (!settings.anthropicKey) {
      view.innerHTML = `<div class="empty"><span class="big">🤖</span>
        Pregúntale cosas a Claude sobre tu día: «¿qué tengo mañana?», «¿qué ceno con lo que hay en la lista?», «organízame la semana»…
        <br><br>Necesitas una clave de API de Anthropic (console.anthropic.com).<br><br>
        <a class="btn primary" href="#/ajustes">Añadir clave en Ajustes</a></div>`;
      return;
    }
    view.innerHTML = `
      <div class="chat" id="chat">
        ${chat.length ? chat.map((m) => `<div class="msg ${m.role}">${esc(m.content)}</div>`).join('')
          : `<div class="empty small"><span class="big">🤖</span>Conozco tu agenda, deporte, hábitos, compra y cumpleaños. Pregúntame lo que quieras.</div>
             <div class="chips" style="flex-wrap:wrap;justify-content:center">
               ${['¿Qué tengo hoy y mañana?', '¿Cómo voy con el deporte?', 'Propón una cena con mi lista de la compra', '¿Qué me pongo hoy según el tiempo?'].map((q) => `<button class="chip" data-q="${esc(q)}">${esc(q)}</button>`).join('')}
             </div>`}
        ${sending ? '<div class="msg assistant muted">Pensando…</div>' : ''}
      </div>
      <form class="chat-input">
        <textarea class="input grow" name="q" placeholder="Escribe un mensaje…" rows="1"></textarea>
        <button class="btn primary" ${sending ? 'disabled' : ''} aria-label="Enviar">➤</button>
      </form>
      ${chat.length ? '<button class="btn small" data-clear style="display:block;margin:0 auto 8px">Nueva conversación</button>' : ''}`;
    window.scrollTo(0, document.body.scrollHeight);

    const send = async (text) => {
      text = text.trim();
      if (!text || sending) return;
      update((d) => d.chat.push({ role: 'user', content: text }));
      sending = true;
      rerender();
      try {
        let history = db().chat.slice(-20);
        while (history.length && history[0].role !== 'user') history = history.slice(1);
        const answer = await ask(history.map(({ role, content }) => ({ role, content })));
        update((d) => {
          d.chat.push({ role: 'assistant', content: answer });
          d.chat = d.chat.slice(-60);
        });
      } catch (e) {
        update((d) => d.chat.pop()); // quitar la pregunta sin respuesta para poder reintentar
        toast(e.message);
      } finally {
        sending = false;
        if (location.hash === '#/asistente') rerender();
      }
    };

    const form = view.querySelector('.chat-input');
    form.onsubmit = (e) => {
      e.preventDefault();
      send(form.q.value);
    };
    form.q.onkeydown = (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send(form.q.value);
      }
    };
    view.querySelectorAll('[data-q]').forEach((b) => (b.onclick = () => send(b.dataset.q)));
    view.querySelector('[data-clear]')?.addEventListener('click', () => {
      update((d) => (d.chat = []));
      rerender();
    });
  },
};
