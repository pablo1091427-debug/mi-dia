import { db, update } from '../store.js';
import { esc, uid, dkey, parseKey, addDays, fmtLong, MESES, fmtMoney, toast } from '../utils.js';
import * as G from '../google.js';
import { itemsForDay } from './calendar.js';
import { sportStats, SPORT_TYPES, sportType } from './sport.js';
import { isDone, toggleHabit } from './habits.js';
import { upcomingBirthdays } from './birthdays.js';
import { EXP_CATS, INC_CATS, monthSummary, addExpense, addIncome } from './expenses.js';
import { addTask, openTasks } from './tasks.js';
import { addDeadline, dueSoon, DL_CATS } from './deadlines.js';
import { nextTrip } from './trips.js';
import { logWeight, logSleep } from './health.js';
import { addMedia, MEDIA_TYPES } from './media.js';
import { writeDiary, MOODS } from './diary.js';
import { addFuel } from './car.js';
import { markCare, dueCares } from './cares.js';
import { forecast } from './expenses.js';
import { activeChallenges, checkIn, progress } from './challenges.js';
import { shopAdd, shopSetDone, pendingItems } from './shopping.js';
import { addReminder, pendingReminders, whenLabel } from './reminders.js';
import { cachedWeather, wInfo } from './weather.js';

import { createMessage } from '../ai.js';
export { MODELS } from '../ai.js';

const DAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

// ---------- Contexto: resumen de la app para que el asistente conozca tu día ----------
export function appContext() {
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
  const fin = monthSummary();
  lines.push(`Finanzas del mes: ingresos ${fmtMoney(fin.income)}, gastos ${fmtMoney(fin.spent)} (fijos ${fmtMoney(fin.fixed)}), balance ${fmtMoney(fin.balance)}.${fin.over.length ? ` Presupuesto superado en: ${fin.over.map((c) => (EXP_CATS.find((x) => x.id === c) || {}).name).join(', ')}.` : ''}`);
  if (d.goals.length) lines.push(`Metas de ahorro: ${d.goals.map((g) => `${g.name} ${fmtMoney(g.saved)}/${fmtMoney(g.target)}`).join('; ')}.`);
  const tasks = openTasks().slice(0, 12);
  if (tasks.length) lines.push(`Tareas pendientes: ${tasks.map((t) => `${t.text}${t.due ? ` (límite ${t.due})` : ''}${t.project ? ` [${t.project}]` : ''}`).join('; ')}.`);
  const dls = dueSoon();
  if (dls.length) lines.push(`Vencimientos próximos: ${dls.map((x) => `${x.name} el ${x.date}`).join('; ')}.`);
  const fc = forecast();
  if (fc) lines.push(`Previsión a fin de mes: gastará ${fmtMoney(fc.spent)}${fin.income ? ` y le quedarán ${fmtMoney(fc.balance)}` : ''}.`);
  const cares = dueCares();
  if (cares.length) lines.push(`Cuidados que tocan hoy: ${cares.map((c) => `${c.what} (${c.subject})`).join('; ')}.`);
  if (d.splitGroups.length) lines.push(`Grupos de gastos compartidos: ${d.splitGroups.map((g) => `${g.name} (${g.members.join(', ')})`).join('; ')}.`);
  if (d.diary[dkey()]) lines.push(`Diario de hoy: ${d.diary[dkey()].text}`);
  const retos = activeChallenges();
  if (retos.length) lines.push(`Retos en marcha: ${retos.map((c) => `${c.name} (${c.type === 'daily' ? `${progress(c).value}/${c.target} días${c.log[dkey()] ? ', hoy cumplido' : ', hoy pendiente'}` : `${progress(c).value}/${c.target} ${c.unit}`})`).join('; ')}.`);
  const trip = nextTrip();
  if (trip) lines.push(`Próximo viaje: ${trip.dest} del ${trip.from} al ${trip.to}.`);
  const health = [d.sleep[dkey()] !== undefined ? `durmió ${d.sleep[dkey()]} h` : '', d.weights.length ? `último peso ${d.weights.at(-1).kg} kg (${d.weights.at(-1).date})` : ''].filter(Boolean);
  if (health.length) lines.push(`Salud: ${health.join(', ')}.`);
  if (w) {
    const c = w.w.current;
    lines.push(`Tiempo en ${w.place || 'su zona'}: ${Math.round(c.temperature_2m)}°C, ${wInfo(c.weather_code).t}; hoy máx ${Math.round(w.w.daily.temperature_2m_max[0])}° y mín ${Math.round(w.w.daily.temperature_2m_min[0])}°, probabilidad de lluvia ${w.w.daily.precipitation_probability_max[0]}%.`);
  }
  if (d.notes.length) lines.push(`Títulos de sus notas: ${d.notes.slice(0, 20).map((n) => n.title || n.body.slice(0, 40)).join(' | ')}.`);
  return lines.join('\n');
}

const SYSTEM = `Eres el asistente personal integrado en «Mi Día», la app personal del usuario (calendario, recordatorios, retos, tareas, vencimientos, notas, deporte, gimnasio, salud, hábitos, finanzas, compra, cumpleaños, viajes, ocio). Respondes en español, de forma cercana, breve y práctica, como un buen amigo organizado. Escribe en texto plano sin Markdown (sin asteriscos ni almohadillas); usa guiones para las listas.

También eres su asistente financiero personal: ayudas a controlar ingresos y gastos, presupuestos y ahorro con consejos concretos basados en sus números (usa consultar_finanzas). No recomiendes productos financieros ni inversiones concretas; para eso sugiere un profesional.

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
  {
    name: 'anadir_ingreso',
    description: 'Apunta un ingreso puntual (nómina, extra, venta, regalo, devolución…).',
    input_schema: obj({
      importe: { type: 'number', description: 'Euros' }, concepto: { type: 'string' },
      tipo: { type: 'string', enum: INC_CATS.map((c) => c.id), description: INC_CATS.map((c) => `${c.id}=${c.name}`).join(', ') },
      fecha: DATE,
    }, ['importe', 'tipo']),
  },
  {
    name: 'consultar_finanzas',
    description: 'Devuelve el resumen financiero de un mes: ingresos, gastos por categoría, fijos, presupuestos, balance, metas y los movimientos.',
    input_schema: obj({ mes: { type: 'string', description: 'AAAA-MM' } }, ['mes']),
  },
  {
    name: 'crear_tarea',
    description: 'Crea una tarea pendiente (cosas por hacer sin hora concreta).',
    input_schema: obj({ texto: { type: 'string' }, proyecto: { type: 'string' }, prioridad: { type: 'integer', enum: [1, 2, 3], description: '1 alta, 2 media, 3 baja' }, fecha_limite: DATE }, ['texto']),
  },
  {
    name: 'completar_tarea',
    description: 'Marca como hecha una tarea pendiente buscándola por su texto.',
    input_schema: obj({ texto: { type: 'string' } }, ['texto']),
  },
  {
    name: 'anadir_vencimiento',
    description: 'Apunta algo que caduca o vence (ITV, seguro, DNI, revisión…) para avisar con antelación.',
    input_schema: obj({
      nombre: { type: 'string' }, fecha: DATE,
      tipo: { type: 'string', enum: DL_CATS.map((c) => c.id), description: DL_CATS.map((c) => `${c.id}=${c.name}`).join(', ') },
      dias_aviso: { type: 'integer' }, anual: { type: 'boolean' },
    }, ['nombre', 'fecha']),
  },
  {
    name: 'registrar_salud',
    description: 'Registra peso (kg) u horas de sueño.',
    input_schema: obj({ peso_kg: { type: 'number' }, horas_sueno: { type: 'number' }, fecha: DATE }, []),
  },
  {
    name: 'escribir_diario',
    description: 'Guarda la entrada del diario de un día (una línea) y/o su estado de ánimo.',
    input_schema: obj({ texto: { type: 'string' }, animo: { type: 'integer', enum: [1, 2, 3, 4, 5], description: '1 muy mal … 5 genial' }, fecha: DATE }, []),
  },
  {
    name: 'registrar_repostaje',
    description: 'Apunta un repostaje del coche (también lo añade como gasto de transporte).',
    input_schema: obj({ litros: { type: 'number' }, importe: { type: 'number' }, km: { type: 'integer', description: 'Km del cuentakilómetros, si los dice' }, lleno: { type: 'boolean' }, fecha: DATE }, ['litros', 'importe']),
  },
  {
    name: 'marcar_cuidado',
    description: 'Marca como hecho un cuidado recurrente (regar plantas, cambiar sábanas…).',
    input_schema: obj({ texto: { type: 'string', description: 'Qué se ha hecho o de quién, p. ej. «regar» o «plantas»' } }, ['texto']),
  },
  {
    name: 'anadir_gasto_compartido',
    description: 'Apunta un gasto en un grupo de gastos compartidos (piso, viaje…), repartido entre los indicados o entre todos.',
    input_schema: obj({ grupo: { type: 'string' }, concepto: { type: 'string' }, importe: { type: 'number' }, pago: { type: 'string', description: 'Quién pagó' }, entre: { type: 'array', items: { type: 'string' }, description: 'Vacío = todos' } }, ['grupo', 'concepto', 'importe', 'pago']),
  },
  {
    name: 'marcar_reto',
    description: 'Marca hoy como cumplido un reto diario, o suma una cantidad a un reto de cantidad (€, km…).',
    input_schema: obj({ reto: { type: 'string', description: 'Nombre o parte del nombre del reto' }, cantidad: { type: 'number', description: 'Solo para retos de cantidad' } }, ['reto']),
  },
  {
    name: 'anadir_ocio',
    description: 'Añade una película, serie o libro a su lista.',
    input_schema: obj({
      tipo: { type: 'string', enum: ['peli', 'serie', 'libro'] }, titulo: { type: 'string' },
      estado: { type: 'string', enum: ['pendiente', 'en curso', 'terminado'] }, valoracion: { type: 'integer', description: '1 a 5, solo si la ha terminado' },
    }, ['tipo', 'titulo']),
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
      const fresh = shopAdd(items);
      return { result: fresh.length ? `Añadidos: ${fresh.join(', ')}.${fresh.length < items.length ? ' El resto ya estaba en la lista.' : ''}` : 'Ya estaba todo en la lista.', label: fresh.length ? `🛒 ${fresh.join(', ')}` : undefined };
    }
    case 'marcar_comprado': {
      const wanted = (i.productos || []).map(norm);
      const found = pendingItems().filter((it) => wanted.some((w) => norm(it.text).includes(w) || w.includes(norm(it.text))));
      const hits = found.map((it) => it.text);
      if (found.length) shopSetDone(found.map((it) => it.id));
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
      const date = isDate(i.fecha) ? i.fecha : dkey();
      addExpense({ amount, concept: i.concepto || '', cat, date });
      const lim = db().budgets[cat];
      const spent = monthSummary(date.slice(0, 7)).byCat[cat] || 0;
      return { result: `Gasto apuntado.${lim ? ` En esta categoría lleva ${fmtMoney(spent)} de un presupuesto de ${fmtMoney(lim)}.` : ''}`, label: `💶 ${fmtMoney(amount)}${i.concepto ? ' · ' + i.concepto : ''}` };
    }
    case 'anadir_ingreso': {
      const amount = Math.round(Number(i.importe) * 100) / 100;
      need(amount > 0, 'Importe no válido');
      const cat = INC_CATS.some((c) => c.id === i.tipo) ? i.tipo : 'other';
      addIncome({ amount, concept: i.concepto || '', cat, date: isDate(i.fecha) ? i.fecha : dkey() });
      return { result: 'Ingreso apuntado.', label: `💰 +${fmtMoney(amount)}${i.concepto ? ' · ' + i.concepto : ''}` };
    }
    case 'consultar_finanzas': {
      const ym = /^\d{4}-\d{2}$/.test(i.mes || '') ? i.mes : dkey().slice(0, 7);
      const s = monthSummary(ym);
      const d = db();
      const catName = (id) => (EXP_CATS.find((c) => c.id === id) || { name: id }).name;
      const moves = [...d.expenses.filter((e) => e.date.startsWith(ym)).map((e) => `${e.date} −${fmtMoney(e.amount)} ${catName(e.cat)} ${e.concept}`),
        ...d.incomes.filter((e) => e.date.startsWith(ym)).map((e) => `${e.date} +${fmtMoney(e.amount)} ${e.concept}`)].sort().slice(-60);
      return {
        result: [
          `Mes ${ym}: ingresos ${fmtMoney(s.income)}, gastos ${fmtMoney(s.spent)} (variables ${fmtMoney(s.variable)}, fijos ${fmtMoney(s.fixed)}), balance ${fmtMoney(s.balance)}${s.rate !== null ? `, tasa de ahorro ${Math.round(s.rate * 100)} %` : ''}.`,
          `Por categoría: ${Object.entries(s.byCat).map(([c, v]) => `${catName(c)} ${fmtMoney(v)}${d.budgets[c] ? ` (presupuesto ${fmtMoney(d.budgets[c])})` : ''}`).join(', ') || 'sin gastos variables'}.`,
          `Fijos: ${d.subs.map((x) => `${x.name} ${fmtMoney(x.amount)}`).join(', ') || 'ninguno'}. Ingresos fijos: ${d.fixedIncomes.map((x) => `${x.name} ${fmtMoney(x.amount)}`).join(', ') || 'ninguno'}.`,
          `Metas: ${d.goals.map((g) => `${g.name} ${fmtMoney(g.saved)}/${fmtMoney(g.target)}${g.deadline ? ' para ' + g.deadline : ''}`).join('; ') || 'ninguna'}.`,
          `Movimientos:\n${moves.join('\n') || '(ninguno)'}`,
        ].join('\n'),
      };
    }
    case 'crear_tarea': {
      const t = addTask({ text: i.texto, project: i.proyecto || '', priority: i.prioridad || 2, due: isDate(i.fecha_limite) ? i.fecha_limite : '' });
      return { result: 'Tarea creada.', label: `✔️ ${t.text}${t.due ? ' · ' + t.due : ''}` };
    }
    case 'completar_tarea': {
      const q = norm(i.texto || '');
      const t = openTasks().find((x) => norm(x.text).includes(q) || q.includes(norm(x.text)));
      need(t, `No encontré esa tarea. Pendientes: ${openTasks().map((x) => x.text).join('; ') || 'ninguna'}`);
      update((d) => Object.assign(d.tasks.find((x) => x.id === t.id), { done: true, doneAt: Date.now() }));
      return { result: `Tarea «${t.text}» completada.`, label: `✅ ${t.text}` };
    }
    case 'anadir_vencimiento': {
      const dl = await addDeadline({ name: i.nombre, date: i.fecha, cat: i.tipo || 'other', noticeDays: i.dias_aviso || 30, yearly: !!i.anual });
      return { result: `Vencimiento guardado; avisará ${dl.noticeDays} días antes.`, label: `📌 ${dl.name} · ${dl.date}` };
    }
    case 'registrar_salud': {
      const date = isDate(i.fecha) ? i.fecha : dkey();
      const done = [];
      if (i.peso_kg) { logWeight({ kg: Number(i.peso_kg), date }); done.push(`⚖️ ${i.peso_kg} kg`); }
      if (i.horas_sueno !== undefined && i.horas_sueno !== null) { logSleep(Number(i.horas_sueno), date); done.push(`😴 ${i.horas_sueno} h`); }
      need(done.length, 'No hay nada que registrar');
      return { result: 'Registrado.', label: done.join(' · ') };
    }
    case 'escribir_diario': {
      need(i.texto || i.animo, 'Nada que guardar');
      writeDiary({ text: (i.texto || '').trim(), mood: i.animo || 0, date: isDate(i.fecha) ? i.fecha : dkey() });
      return { result: 'Diario guardado.', label: `📔 ${i.animo ? MOODS[i.animo - 1] + ' ' : ''}${(i.texto || '').slice(0, 40)}` };
    }
    case 'registrar_repostaje': {
      addFuel({ date: isDate(i.fecha) ? i.fecha : dkey(), km: i.km || 0, liters: Number(i.litros), price: Number(i.importe), full: i.lleno !== false });
      return { result: 'Repostaje apuntado (y añadido a gastos).', label: `⛽ ${i.litros} L · ${fmtMoney(i.importe)}` };
    }
    case 'marcar_cuidado': {
      const q = norm(i.texto || '');
      const c = db().cares.find((x) => norm(`${x.what} ${x.subject}`).includes(q) || q.includes(norm(x.what)));
      need(c, `No encontré ese cuidado. Cuidados: ${db().cares.map((x) => `${x.what} (${x.subject})`).join('; ') || 'ninguno'}`);
      markCare(c.id);
      return { result: `Marcado «${c.what}» de ${c.subject}. Próxima vez en ${c.everyDays} días.`, label: `${c.emoji} ${c.what}` };
    }
    case 'anadir_gasto_compartido': {
      const g = db().splitGroups.find((x) => norm(x.name).includes(norm(i.grupo || '')) || norm(i.grupo || '').includes(norm(x.name)));
      need(g, `No existe ese grupo. Grupos: ${db().splitGroups.map((x) => x.name).join(', ') || 'ninguno'}`);
      const match = (name) => g.members.find((m) => norm(m) === norm(name)) || g.members.find((m) => norm(m).includes(norm(name)));
      const payer = match(i.pago || '');
      need(payer, `«${i.pago}» no está en el grupo. Miembros: ${g.members.join(', ')}`);
      const among = (i.entre || []).length ? i.entre.map(match).filter(Boolean) : g.members;
      const amount = Math.round(Number(i.importe) * 100) / 100;
      need(amount > 0 && among.length, 'Importe o reparto no válido');
      update((d) => d.splitGroups.find((x) => x.id === g.id).expenses.push({ id: uid(), desc: i.concepto, amount, payer, among, date: dkey() }));
      return { result: `Añadido a «${g.name}».`, label: `👥 ${g.name}: ${i.concepto} ${fmtMoney(amount)}` };
    }
    case 'marcar_reto': {
      const q = norm(i.reto || '');
      const c = activeChallenges().find((x) => norm(x.name).includes(q) || q.includes(norm(x.name)));
      need(c, `No encontré ese reto. Retos en marcha: ${activeChallenges().map((x) => x.name).join('; ') || 'ninguno'}`);
      if (c.type === 'daily') {
        need(!c.log[dkey()], 'Ese reto ya estaba marcado hoy');
        checkIn(c.id);
      } else checkIn(c.id, Number(i.cantidad));
      const p = progress(db().challenges.find((x) => x.id === c.id));
      return { result: `Reto actualizado: ${Math.round(p.pct * 100)} % completado.`, label: `${c.emoji} ${c.name} · ${Math.round(p.pct * 100)} %` };
    }
    case 'anadir_ocio': {
      const m = addMedia({ type: i.tipo, title: i.titulo, status: i.estado || 'pendiente', rating: i.valoracion || 0 });
      return { result: 'Añadido a su lista.', label: `${MEDIA_TYPES[m.type].e} ${m.title}` };
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
  // El contexto se calcula una vez por pregunta y no cambia durante la conversación de herramientas
  const system = SYSTEM + appContext();
  const messages = [...history];
  const actions = [];
  let text = '';
  try {
    for (let step = 0; step < 8; step++) {
      const resp = await createMessage({ system, messages, tools: TOOLS });
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
