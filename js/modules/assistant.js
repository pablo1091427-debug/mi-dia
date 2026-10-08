import { db, update } from '../store.js';
import { esc, uid, dkey, parseKey, addDays, fmtLong, MESES, fmtMoney, toast } from '../utils.js';
import * as G from '../google.js';
import { itemsForDay } from './calendar.js';
import { sportStats, SPORT_TYPES, sportType } from './sport.js';
import { isDone, toggleHabit } from './habits.js';
import { upcomingBirthdays } from './birthdays.js';
import { monthTotal, EXP_CATS } from './expenses.js';
import { guessAisle } from './shopping.js';
import { addReminder, pendingReminders, whenLabel } from './reminders.js';
import { cachedWeather, wInfo } from './weather.js';

const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.127.0/+esm';
export const MODELS = [
  { id: 'claude-opus-5-5', name: 'Claude Opus 5.5 (el más listo)' },
  { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5 (equilibrado)' },
  { id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5 (rápido y barato)' },
];

const DAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

// ---------- Contexto: resumen de la app para que el asistente conozca tu día ----------
function context() {
  const d = db();
  const today = new Date();
  const fmtItems = (k) => itemsForDay(k).map((e) => `- ${e.allDay ? 'Todo el día' : e.start}: ${e.title}`).join('\n') || '- (nada)';
  const st = sportStats();
  const w = cachedWeather();
  const next7 = Array.from({ length: 8 }, (_, i) => {
    const x = addDays(today, i);
    return `${DAY_NAMES[x.getDay()]} ${dkey(x)}`;
  }).join(', ');
  const lines = [
    `Ahora: ${fmtLong(today)} (${dkey(today)}), ${today.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}. Próximos días: ${next7}.`,
    `Google Calendar: ${G.isReady() ? 'conectado (los eventos se crean allí)' : 'no conectado (los eventos se guardan solo en la app)'}.`,
    `Agenda de hoy guardada en la app (para ver Google o más días usa consultar_agenda):\n${fmtItems(dkey(today))}`,
    `Deporte: racha de ${st.streak} días, ${st.week}/${st.goal} entrenamientos esta semana, ${st.month} este mes. ${st.doneToday ? 'Hoy ya ha entrenado.' : 'Hoy aún no ha entrenado.'}`,
  ];
  if (d.habits.length) lines.push(`Hábitos de hoy: ${d.habits.map((h) => `${h.name} (${isDone(h.id) ? 'hecho' : 'pendiente'})`).join(', ')}.`);
  const rem = pendingReminders().slice(0, 10);
  if (rem.length) lines.push(`Recordatorios pendientes: ${rem.map((r) => `${r.text} (${whenLabel(r)})`).join('; ')}.`);
  const shop = d.shopping.filter((i) => !i.done).map((i) => i.text);
  lines.push(`Lista de la compra pendiente: ${shop.length ? shop.join(', ') : '(vacía)'}.`);
  const bd = upcomingBirthdays().filter((b) => b.days <= 30);
  if (bd.length) lines.push(`Próximos cumpleaños: ${bd.map((b) => `${b.name} el ${b.day} de ${MESES[b.month - 1]} (en ${b.days} días)`).join('; ')}.`);
  lines.push(`Gasto apuntado este mes: ${fmtMoney(monthTotal())}.`);
  if (w) {
    const c = w.w.current;
    lines.push(`Tiempo en ${w.place || 'su zona'}: ${Math.round(c.temperature_2m)}°C, ${wInfo(c.weather_code).t}; hoy máx ${Math.round(w.w.daily.temperature_2m_max[0])}° y mín ${Math.round(w.w.daily.temperature_2m_min[0])}°, probabilidad de lluvia ${w.w.daily.precipitation_probability_max[0]}%.`);
  }
  if (d.notes.length) lines.push(`Títulos de sus notas: ${d.notes.slice(0, 20).map((n) => n.title || n.body.slice(0, 40)).join(' | ')}.`);
  return lines.join('\n');
}

const SYSTEM = `Eres el asistente personal integrado en «Mi Día», la app personal del usuario (calendario, recordatorios, notas, deporte, hábitos, gastos, compra, cumpleaños). Respondes en español, de forma cercana, breve y práctica, como un buen amigo organizado. Escribe en texto plano sin Markdown (sin asteriscos ni almohadillas); usa guiones para las listas.

Tienes herramientas para apuntar cosas en la app y consultar la agenda. Cuando el usuario pida apuntar, añadir, recordar, registrar o crear algo, hazlo directamente con la herramienta adecuada sin pedir confirmación, y después confirma en una frase lo que has hecho. Calcula tú las fechas relativas («mañana», «el viernes») a partir de la fecha actual. Si falta un dato imprescindible (por ejemplo, la hora de un recordatorio), usa un valor razonable y dilo. Para preguntas sobre días distintos de hoy o sobre eventos de Google Calendar, usa consultar_agenda.

Datos actuales de la app:
`;

// ---------- Herramientas ----------
const DATE = { type: 'string', description: 'Fecha en formato AAAA-MM-DD' };
const TIME = { type: 'string', description: 'Hora en formato HH:MM (24 h)' };
const obj = (properties, required) => ({ type: 'object', properties, required, additionalProperties: false });

const TOOLS = [
  {
    name: 'crear_evento',
    description: 'Crea un evento en el calendario (en Google Calendar si está conectado). Úsalo para citas, planes y quedadas.',
    input_schema: obj({
      titulo: { type: 'string' }, fecha: DATE,
      hora_inicio: { ...TIME, description: 'Hora de inicio HH:MM. Omitir si es todo el día' },
      hora_fin: { ...TIME, description: 'Hora de fin HH:MM (opcional)' },
      todo_el_dia: { type: 'boolean' }, notas: { type: 'string' },
      aviso_minutos: { type: 'integer', description: 'Minutos de antelación del aviso en el móvil (solo con Google conectado)' },
    }, ['titulo', 'fecha']),
  },
  {
    name: 'crear_recordatorio',
    description: 'Crea un recordatorio que avisará en el móvil a una fecha y hora. Úsalo para «recuérdame…».',
    input_schema: obj({ texto: { type: 'string' }, fecha: DATE, hora: TIME }, ['texto', 'fecha', 'hora']),
  },
  {
    name: 'crear_nota',
    description: 'Guarda una nota de texto.',
    input_schema: obj({ titulo: { type: 'string' }, contenido: { type: 'string' } }, ['titulo', 'contenido']),
  },
  {
    name: 'buscar_notas',
    description: 'Busca en las notas del usuario y devuelve su contenido.',
    input_schema: obj({ texto: { type: 'string', description: 'Palabras a buscar; vacío para las más recientes' } }, ['texto']),
  },
  {
    name: 'anadir_compra',
    description: 'Añade productos a la lista de la compra.',
    input_schema: obj({ productos: { type: 'array', items: { type: 'string' } } }, ['productos']),
  },
  {
    name: 'marcar_comprado',
    description: 'Marca productos de la lista de la compra como comprados.',
    input_schema: obj({ productos: { type: 'array', items: { type: 'string' } } }, ['productos']),
  },
  {
    name: 'registrar_deporte',
    description: 'Marca un día como entrenado.',
    input_schema: obj({
      fecha: DATE,
      actividad: { type: 'string', enum: SPORT_TYPES.map((t) => t.id), description: SPORT_TYPES.map((t) => `${t.id}=${t.name}`).join(', ') },
      minutos: { type: 'integer' },
    }, ['fecha', 'actividad']),
  },
  {
    name: 'anadir_gasto',
    description: 'Apunta un gasto.',
    input_schema: obj({
      importe: { type: 'number', description: 'Euros' }, concepto: { type: 'string' },
      categoria: { type: 'string', enum: EXP_CATS.map((c) => c.id), description: EXP_CATS.map((c) => `${c.id}=${c.name}`).join(', ') },
      fecha: DATE,
    }, ['importe', 'categoria']),
  },
  {
    name: 'anadir_cumpleanos',
    description: 'Guarda el cumpleaños de una persona.',
    input_schema: obj({ nombre: { type: 'string' }, dia: { type: 'integer' }, mes: { type: 'integer' }, anio: { type: 'integer', description: 'Año de nacimiento (opcional)' } }, ['nombre', 'dia', 'mes']),
  },
  {
    name: 'marcar_habito',
    description: 'Marca un hábito como cumplido hoy.',
    input_schema: obj({ nombre: { type: 'string' } }, ['nombre']),
  },
  {
    name: 'consultar_agenda',
    description: 'Devuelve eventos (app y Google Calendar), recordatorios, cumpleaños y deporte entre dos fechas (máximo 31 días).',
    input_schema: obj({ desde: DATE, hasta: DATE }, ['desde', 'hasta']),
  },
];

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !isNaN(parseKey(s));
const isTime = (s) => /^\d{1,2}:\d{2}$/.test(s || '');
const normTime = (s) => s.padStart(5, '0');
const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
function need(cond, msg) {
  if (!cond) throw new Error(msg);
}

// Ejecuta una herramienta. Devuelve {result: texto para Claude, label: texto para mostrar}
async function runTool(name, i) {
  switch (name) {
    case 'crear_evento': {
      need(i.titulo && isDate(i.fecha), 'Faltan título o fecha válida (AAAA-MM-DD)');
      const allDay = !!i.todo_el_dia || !isTime(i.hora_inicio);
      const ev = {
        title: i.titulo.trim(), date: i.fecha, allDay, notes: i.notas || '',
        start: allDay ? '' : normTime(i.hora_inicio), end: !allDay && isTime(i.hora_fin) ? normTime(i.hora_fin) : '',
      };
      if (G.isReady()) await G.createEvent({ ...ev, reminderMinutes: Number.isInteger(i.aviso_minutos) ? i.aviso_minutos : null });
      else update((d) => d.events.push({ id: uid(), ...ev }));
      const where = G.isReady() ? 'Google Calendar' : 'la app';
      return { result: `Evento creado en ${where}.`, label: `📅 ${ev.title} · ${ev.date}${ev.start ? ' ' + ev.start : ''}` };
    }
    case 'crear_recordatorio': {
      need(i.texto && isDate(i.fecha) && isTime(i.hora), 'Faltan texto, fecha o hora válidos');
      const r = await addReminder({ text: i.texto, date: i.fecha, time: normTime(i.hora) });
      return { result: `Recordatorio creado${r.googleId ? ' (también en Google Calendar con aviso)' : ''}.`, label: `⏰ ${r.text} · ${whenLabel(r)}` };
    }
    case 'crear_nota': {
      need(i.titulo || i.contenido, 'La nota está vacía');
      update((d) => d.notes.unshift({ id: uid(), title: (i.titulo || '').trim(), body: i.contenido || '', color: '', pinned: false, updated: Date.now() }));
      return { result: 'Nota guardada.', label: `📝 Nota: ${i.titulo || 'Sin título'}` };
    }
    case 'buscar_notas': {
      const q = norm(i.texto || '');
      const found = db().notes.filter((n) => !q || norm(n.title + ' ' + n.body).includes(q)).slice(0, 5);
      return { result: found.length ? found.map((n) => `# ${n.title || 'Sin título'}\n${n.body.slice(0, 2000)}`).join('\n\n') : 'No hay notas que coincidan.' };
    }
    case 'anadir_compra': {
      const items = (i.productos || []).map((s) => String(s).trim()).filter(Boolean);
      need(items.length, 'No hay productos');
      update((d) => items.forEach((text) => d.shopping.push({ id: uid(), text, cat: guessAisle(text), done: false })));
      return { result: `Añadidos: ${items.join(', ')}.`, label: `🛒 ${items.join(', ')}` };
    }
    case 'marcar_comprado': {
      const wanted = (i.productos || []).map(norm);
      const hits = [];
      update((d) => d.shopping.forEach((it) => {
        if (!it.done && wanted.some((w) => norm(it.text).includes(w) || w.includes(norm(it.text)))) {
          it.done = true;
          hits.push(it.text);
        }
      }));
      return { result: hits.length ? `Marcados como comprados: ${hits.join(', ')}.` : 'No encontré esos productos en la lista.', label: hits.length ? `✔️ Comprado: ${hits.join(', ')}` : undefined };
    }
    case 'registrar_deporte': {
      need(isDate(i.fecha), 'Fecha no válida');
      const type = sportType(i.actividad).id;
      update((d) => (d.sport[i.fecha] = { type, min: Number.isInteger(i.minutos) ? i.minutos : 0 }));
      return { result: 'Entrenamiento registrado.', label: `${sportType(type).e} ${sportType(type).name} · ${i.fecha}` };
    }
    case 'anadir_gasto': {
      const amount = Math.round(Number(i.importe) * 100) / 100;
      need(amount > 0, 'Importe no válido');
      const cat = EXP_CATS.some((c) => c.id === i.categoria) ? i.categoria : 'other';
      update((d) => d.expenses.push({ id: uid(), amount, concept: (i.concepto || '').trim(), cat, date: isDate(i.fecha) ? i.fecha : dkey() }));
      return { result: 'Gasto apuntado.', label: `💶 ${fmtMoney(amount)}${i.concepto ? ' · ' + i.concepto : ''}` };
    }
    case 'anadir_cumpleanos': {
      need(i.nombre && i.dia >= 1 && i.dia <= 31 && i.mes >= 1 && i.mes <= 12, 'Datos del cumpleaños no válidos');
      update((d) => d.birthdays.push({ id: uid(), name: i.nombre.trim(), day: i.dia, month: i.mes, year: Number.isInteger(i.anio) ? i.anio : null }));
      return { result: 'Cumpleaños guardado.', label: `🎂 ${i.nombre} · ${i.dia} de ${MESES[i.mes - 1]}` };
    }
    case 'marcar_habito': {
      const q = norm(i.nombre || '');
      const h = db().habits.find((x) => norm(x.name).includes(q) || q.includes(norm(x.name)));
      need(h, `No existe ese hábito. Hábitos: ${db().habits.map((x) => x.name).join(', ') || 'ninguno'}`);
      if (!isDone(h.id)) toggleHabit(h.id);
      return { result: `Hábito «${h.name}» marcado hoy.`, label: `✅ ${h.name}` };
    }
    case 'consultar_agenda': {
      need(isDate(i.desde) && isDate(i.hasta), 'Fechas no válidas');
      let from = parseKey(i.desde);
      const to = parseKey(i.hasta);
      need(to >= from && (to - from) / 86400000 <= 31, 'El rango debe ser de 0 a 31 días');
      let gEvents = [];
      if (G.isReady()) {
        const months = new Set();
        for (let x = new Date(from); x <= to; x = addDays(x, 1)) months.add(`${x.getFullYear()}-${x.getMonth()}`);
        for (const m of months) {
          const [y, mo] = m.split('-').map(Number);
          gEvents = gEvents.concat(await G.monthEvents(y, mo));
        }
      }
      const out = [];
      for (; from <= to; from = addDays(from, 1)) {
        const k = dkey(from);
        const items = itemsForDay(k, gEvents);
        if (items.length) out.push(`${DAY_NAMES[from.getDay()]} ${k}:\n${items.map((e) => `- ${e.allDay ? 'Todo el día' : e.start + (e.end ? '-' + e.end : '')}: ${e.title}`).join('\n')}`);
      }
      return { result: out.join('\n') || 'No hay nada en esas fechas.' };
    }
    default:
      throw new Error('Herramienta desconocida');
  }
}

// Tras un cambio de modelo a mitad de respuesta (fallback), lo anterior a ese punto
// que no sea texto no se debe reenviar.
function echoable(content) {
  const last = content.map((b) => b.type).lastIndexOf('fallback');
  if (last < 0) return content;
  return content.filter((b, idx) => idx >= last || !['thinking', 'redacted_thinking', 'tool_use'].includes(b.type));
}

let sending = false;
let listening = false;

async function ask(history) {
  const { anthropicKey, model } = db().settings;
  const { default: Anthropic } = await import(SDK_URL);
  const client = new Anthropic({ apiKey: anthropicKey, dangerouslyAllowBrowser: true });
  // El contexto se calcula una vez por pregunta y no cambia durante la conversación de herramientas
  const system = SYSTEM + context();
  const messages = [...history];
  const actions = [];
  let text = '';
  try {
    for (let step = 0; step < 8; step++) {
      const params = { model, max_tokens: 4000, system, tools: TOOLS, messages, output_config: { effort: 'low' } };
      // Opus y Sonnet: si la petición se rechaza por seguridad, la API reintenta con otro modelo
      const resp = model === 'claude-haiku-5-5'
        ? await client.messages.create(params)
        : await client.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' });
      if (resp.stop_reason === 'refusal') return { text: 'Lo siento, no puedo ayudar con eso.', actions };
      const content = echoable(resp.content);
      text = content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim() || text;
      const calls = content.filter((b) => b.type === 'tool_use');
      if (resp.stop_reason !== 'tool_use' || !calls.length) break;
      messages.push({ role: 'assistant', content });
      const results = [];
      for (const call of calls) {
        try {
          const r = await runTool(call.name, call.input || {});
          if (r.label) actions.push(r.label);
          results.push({ type: 'tool_result', tool_use_id: call.id, content: r.result });
        } catch (err) {
          results.push({ type: 'tool_result', tool_use_id: call.id, content: `Error: ${err.message}`, is_error: true });
        }
      }
      messages.push({ role: 'user', content: results });
    }
    return { text: text || (actions.length ? 'Hecho.' : '(Sin respuesta)'), actions };
  } catch (e) {
    if (actions.length) return { text: `Hice parte de lo que pediste, pero hubo un error: ${e.message}`, actions };
    if (e instanceof Anthropic.AuthenticationError) throw new Error('La clave de API no es válida. Revísala en Ajustes.');
    if (e instanceof Anthropic.RateLimitError) throw new Error('Demasiadas peticiones; espera un momento.');
    if (e instanceof Anthropic.APIConnectionError) throw new Error('Sin conexión con Claude. ¿Tienes internet?');
    if (e instanceof Anthropic.APIError) throw new Error(`Error de la API (${e.status}): ${e.message}`);
    throw e;
  }
}

const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;

function listen(onText) {
  if (!Speech) return toast('Tu navegador no permite dictado por voz');
  const rec = new Speech();
  rec.lang = 'es-ES';
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  listening = true;
  rec.onresult = (e) => onText(e.results[0][0].transcript);
  rec.onerror = (e) => toast(e.error === 'not-allowed' ? 'Permite el micrófono para dictar' : 'No te he entendido, prueba otra vez');
  rec.onend = () => {
    listening = false;
    document.querySelector('[data-mic]')?.classList.remove('primary');
  };
  rec.start();
  document.querySelector('[data-mic]')?.classList.add('primary');
}

export default {
  title: 'Asistente',
  quickAdd: (_, view) => view.querySelector('[data-mic]')?.click(),
  render(view, { rerender }) {
    const { settings, chat } = db();
    if (!settings.anthropicKey) {
      view.innerHTML = `<div class="empty"><span class="big">🤖</span>
        Habla con Claude sobre tu día y pídele que apunte cosas por ti: «recuérdame llamar a mamá mañana a las 7», «añade leche y huevos a la compra», «he corrido 40 minutos»…
        <br><br>Necesitas una clave de API de Anthropic (console.anthropic.com).<br><br>
        <a class="btn primary" href="#/ajustes">Añadir clave en Ajustes</a></div>`;
      return;
    }
    const examples = ['¿Qué tengo esta semana?', 'Recuérdame llamar a mamá mañana a las 19:00', 'Añade leche, huevos y pan a la compra', 'Hoy he corrido 40 minutos', 'Apunta 15 € de cena'];
    view.innerHTML = `
      <div class="chat" id="chat">
        ${chat.length ? chat.map((m) => `<div class="msg ${m.role}">${esc(m.content)}${m.actions?.length ? `<div class="actions">${m.actions.map((a) => `<span>${esc(a)}</span>`).join('')}</div>` : ''}</div>`).join('')
          : `<div class="empty small"><span class="big">🤖</span>Puedo consultar tu agenda y apuntar cosas por ti: eventos, recordatorios, notas, compra, deporte, gastos, cumpleaños y hábitos. Escribe o pulsa 🎤 y habla.</div>
             <div class="chips" style="flex-wrap:wrap;justify-content:center">${examples.map((q) => `<button class="chip" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>`}
        ${sending ? '<div class="msg assistant muted">Pensando…</div>' : ''}
        ${chat.length ? '<button class="btn small" data-clear style="align-self:center">Nueva conversación</button>' : ''}
      </div>
      <form class="chat-input">
        ${Speech ? `<button type="button" class="btn ${listening ? 'primary' : ''}" data-mic aria-label="Dictar por voz">🎤</button>` : ''}
        <textarea class="input grow" name="q" placeholder="Escribe o dicta…" rows="1"></textarea>
        <button class="btn primary" ${sending ? 'disabled' : ''} aria-label="Enviar">➤</button>
      </form>`;
    window.scrollTo(0, document.body.scrollHeight);

    const send = async (text) => {
      text = text.trim();
      if (!text || sending) return;
      update((d) => d.chat.push({ role: 'user', content: text }));
      sending = true;
      rerender();
      try {
        // Historial solo de texto: empieza siempre por un mensaje del usuario
        let history = db().chat.slice(-20);
        while (history.length && history[0].role !== 'user') history = history.slice(1);
        const { text: answer, actions } = await ask(history.map(({ role, content }) => ({ role, content })));
        update((d) => {
          d.chat.push({ role: 'assistant', content: answer, actions });
          d.chat = d.chat.slice(-60);
        });
        if (actions.length) toast(`✅ ${actions.length === 1 ? 'Hecho' : actions.length + ' cambios hechos'}`);
      } catch (e) {
        update((d) => d.chat.pop()); // quitar la pregunta sin respuesta para poder reintentar
        toast(e.message);
      } finally {
        sending = false;
        if (location.hash.startsWith('#/asistente')) rerender();
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
    view.querySelector('[data-mic]')?.addEventListener('click', () => !listening && listen(send));
    view.querySelectorAll('[data-q]').forEach((b) => (b.onclick = () => send(b.dataset.q)));
    view.querySelector('[data-clear]')?.addEventListener('click', () => {
      update((d) => (d.chat = []));
      rerender();
    });
  },
};

export { runTool, TOOLS }; // para pruebas
