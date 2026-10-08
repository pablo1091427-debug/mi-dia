// Viajes: plan día a día, reservas, maleta y el tiempo del destino.
import { db, update } from '../store.js';
import { esc, uid, dkey, parseKey, addDays, fmtShort, cap, toast, sheet, confirmSheet } from '../utils.js';
import { tabsHtml, bindTabs } from '../ui.js';
import { askJSON, objSchema, hasKey } from '../ai.js';
import { wInfo } from './weather.js';

const PACKING = ['DNI / pasaporte', 'Cargador del móvil', 'Auriculares', 'Cepillo y pasta de dientes', 'Desodorante', 'Ropa interior', 'Calcetines', 'Camisetas', 'Pantalones', 'Pijama', 'Calzado cómodo', 'Medicinas', 'Gafas de sol', 'Tarjeta sanitaria', 'Batería externa'];

const daysOf = (t) => {
  const out = [];
  for (let x = parseKey(t.from); x <= parseKey(t.to); x = addDays(x, 1)) out.push(dkey(x));
  return out;
};
export const nextTrip = () => db().trips.filter((t) => t.to >= dkey()).sort((a, b) => a.from.localeCompare(b.from))[0];
export const daysUntil = (t) => Math.round((parseKey(t.from) - parseKey(dkey())) / 86400000);

async function geocode(name) {
  const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=es`);
  const j = await r.json();
  const g = j.results?.[0];
  return g ? { lat: g.latitude, lon: g.longitude, place: [g.name, g.country].filter(Boolean).join(', ') } : null;
}

export async function addTrip({ dest, from, to }) {
  dest = String(dest || '').trim();
  if (!dest || !from || !to || to < from) throw new Error('Revisa el destino y las fechas');
  const geo = await geocode(dest).catch(() => null);
  const t = { id: uid(), dest: geo?.place || dest, lat: geo?.lat ?? null, lon: geo?.lon ?? null, from, to, plan: {}, bookings: [], packing: [], notes: '' };
  update((d) => d.trips.push(t));
  return t;
}

function openTripSheet(onSaved) {
  const s = sheet({
    title: 'Nuevo viaje',
    body: `<form>
      <label class="field"><span>Destino</span><input class="input" name="dest" required placeholder="Roma"></label>
      <div class="row">
        <label class="field grow"><span>Ida</span><input class="input" type="date" name="from" required></label>
        <label class="field grow"><span>Vuelta</span><input class="input" type="date" name="to" required></label>
      </div>
      <button class="btn primary block">Crear viaje</button></form>`,
  });
  const f = s.el.querySelector('form');
  f.from.onchange = () => (f.to.value ||= f.from.value);
  f.onsubmit = async (e) => {
    e.preventDefault();
    try {
      const t = await addTrip({ dest: f.dest.value, from: f.from.value, to: f.to.value });
      s.close();
      current = t.id;
      onSaved?.();
    } catch (err) {
      toast(err.message);
    }
  };
}

const PLAN_SCHEMA = objSchema({
  dias: { type: 'array', items: objSchema({ fecha: { type: 'string', description: 'AAAA-MM-DD' }, plan: { type: 'string', description: 'Mañana, tarde y noche en 3-5 líneas' } }) },
});

async function suggestPlan(t, box, rerender) {
  if (!hasKey()) return toast('Añade tu clave de Anthropic en Ajustes');
  box.innerHTML = '<p class="muted">🤖 Preparando un plan…</p>';
  try {
    const r = await askJSON({
      system: 'Eres un guía de viajes práctico. Escribes en español, texto plano, sin Markdown. Propones planes realistas por día (mañana, tarde, noche), agrupando visitas cercanas y con alguna recomendación de comida típica.',
      content: `Viaje a ${t.dest} del ${t.from} al ${t.to}. Días: ${daysOf(t).join(', ')}. ${t.notes ? 'Notas del viajero: ' + t.notes : ''} Ten en cuenta que el primer y último día pueden ser de viaje. Devuelve un plan para cada día.`,
      schema: PLAN_SCHEMA,
      effort: 'medium',
    });
    update((d) => {
      const trip = d.trips.find((x) => x.id === t.id);
      r.dias.forEach((x) => { if (daysOf(trip).includes(x.fecha) && !trip.plan[x.fecha]?.trim()) trip.plan[x.fecha] = x.plan; });
    });
    toast('Plan añadido (los días que ya tenías escritos no se tocan)');
    rerender();
  } catch (e) {
    box.innerHTML = `<p class="warn-text">${esc(e.message)}</p>`;
  }
}

let current = null;
let tab = 'plan';

function renderTrip(view, t, rerender) {
  const n = daysUntil(t);
  const days = daysOf(t);
  let body = '';
  if (tab === 'plan') {
    body = `<div id="ai"></div>${days.map((k, i) => `
      <div class="card"><h2>Día ${i + 1} · ${cap(fmtShort(parseKey(k)))}</h2>
        <textarea class="input" data-plan="${k}" rows="3" placeholder="Qué hacer este día…">${esc(t.plan[k] || '')}</textarea></div>`).join('')}
      <label class="field"><span>Notas generales</span><textarea class="input" data-notes rows="3" placeholder="Gustos, presupuesto, con quién vas…">${esc(t.notes)}</textarea></label>
      <button class="btn block" data-suggest>🤖 Proponer plan para los días vacíos</button>`;
  } else if (tab === 'reservas') {
    body = `<div class="card">${t.bookings.length ? `<ul class="list">${t.bookings.map((b) => `<li><span class="emoji">🎫</span><span class="grow" style="white-space:pre-wrap">${esc(b.text)}</span><button class="x-btn" data-delb="${b.id}" aria-label="Borrar">✕</button></li>`).join('')}</ul>` : '<p class="muted small" style="margin:0">Apunta vuelos, hotel, coche… con localizadores y horas.</p>'}</div>
      <form class="row" data-addb><input class="input grow" name="text" placeholder="Vuelo IB3250 · 08:15 · localizador X7K2…"><button class="btn primary">Añadir</button></form>`;
  } else if (tab === 'maleta') {
    const done = t.packing.filter((p) => p.done).length;
    body = `${t.packing.length ? `<div class="card"><h2>Maleta <span class="badge" style="margin-left:auto">${done}/${t.packing.length}</span></h2><ul class="list">${t.packing.map((p) => `
        <li><label class="check grow"><input type="checkbox" data-pack="${p.id}" ${p.done ? 'checked' : ''}><span class="grow" style="${p.done ? 'text-decoration:line-through;color:var(--muted)' : ''}">${esc(p.text)}</span></label><button class="x-btn" data-delp="${p.id}" aria-label="Quitar">✕</button></li>`).join('')}</ul></div>` : ''}
      <form class="row" data-addp style="margin-bottom:10px"><input class="input grow" name="text" placeholder="Añadir a la maleta…"><button class="btn primary">Añadir</button></form>
      ${t.packing.length ? '' : '<button class="btn block" data-template>Cargar lista básica de viaje</button>'}`;
  } else {
    body = '<div id="wx" class="card"><span class="muted">Cargando el tiempo…</span></div>';
  }
  view.innerHTML = `
    <button class="btn small" data-back style="margin-bottom:10px">‹ Todos los viajes</button>
    <div class="card"><h2 style="font-size:20px">✈️ ${esc(t.dest)}</h2>
      <div class="muted">${cap(fmtShort(parseKey(t.from)))} → ${fmtShort(parseKey(t.to))} · ${days.length} días</div>
      <div style="margin-top:6px;font-weight:700">${n > 0 ? `Faltan ${n} días` : t.to >= dkey() ? '🌍 ¡Estás de viaje!' : 'Viaje terminado'}</div></div>
    ${tabsHtml([['plan', 'Plan'], ['reservas', 'Reservas'], ['maleta', 'Maleta'], ['tiempo', 'Tiempo']], tab)}${body}
    <button class="btn danger block" data-deltrip style="margin-top:16px">Borrar viaje</button>`;

  const save = (fn) => update((d) => fn(d.trips.find((x) => x.id === t.id)));
  bindTabs(view, (x) => { tab = x; rerender(); });
  view.querySelector('[data-back]').onclick = () => { current = null; rerender(); };
  view.querySelectorAll('[data-plan]').forEach((ta) => (ta.onchange = () => save((tr) => (tr.plan[ta.dataset.plan] = ta.value))));
  view.querySelector('[data-notes]')?.addEventListener('change', (e) => save((tr) => (tr.notes = e.target.value)));
  view.querySelector('[data-suggest]')?.addEventListener('click', () => suggestPlan(t, view.querySelector('#ai'), rerender));
  view.querySelector('[data-addb]')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = e.target.text.value.trim();
    if (v) { save((tr) => tr.bookings.push({ id: uid(), text: v })); rerender(); }
  });
  view.querySelectorAll('[data-delb]').forEach((b) => (b.onclick = () => { save((tr) => (tr.bookings = tr.bookings.filter((x) => x.id !== b.dataset.delb))); rerender(); }));
  view.querySelector('[data-addp]')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = e.target.text.value.trim();
    if (v) { save((tr) => tr.packing.push({ id: uid(), text: v, done: false })); rerender(); }
  });
  view.querySelector('[data-template]')?.addEventListener('click', () => { save((tr) => PACKING.forEach((text) => tr.packing.push({ id: uid(), text, done: false }))); rerender(); });
  view.querySelectorAll('[data-pack]').forEach((c) => (c.onchange = () => { save((tr) => (tr.packing.find((p) => p.id === c.dataset.pack).done = c.checked)); rerender(); }));
  view.querySelectorAll('[data-delp]').forEach((b) => (b.onclick = () => { save((tr) => (tr.packing = tr.packing.filter((p) => p.id !== b.dataset.delp))); rerender(); }));
  view.querySelector('[data-deltrip]').onclick = async () => {
    if (!(await confirmSheet('Se borrará el viaje con su plan, reservas y maleta.'))) return;
    update((d) => (d.trips = d.trips.filter((x) => x.id !== t.id)));
    current = null;
    rerender();
  };

  if (tab === 'tiempo') {
    const box = view.querySelector('#wx');
    if (t.lat === null) { box.innerHTML = '<span class="muted">No encontré el destino en el mapa para mirar el tiempo.</span>'; return; }
    if (n > 15) { box.innerHTML = `<span class="muted">La previsión estará disponible unos 16 días antes del viaje (faltan ${n}).</span>`; return; }
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${t.lat}&longitude=${t.lon}&timezone=auto&forecast_days=16&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max`)
      .then((r) => r.json())
      .then((w) => {
        const rows = w.daily.time.map((k, i) => ({ k, i })).filter(({ k }) => k >= t.from && k <= t.to);
        box.innerHTML = rows.length ? `<h2>Previsión en ${esc(t.dest)}</h2>${rows.map(({ k, i }) => {
          const wi = wInfo(w.daily.weather_code[i]);
          return `<div class="day-row"><b>${cap(fmtShort(parseKey(k)).split(',')[0])} ${parseKey(k).getDate()}</b><span style="font-size:22px">${wi.e}</span><span class="small muted">${wi.t}${w.daily.precipitation_probability_max[i] ? ` · 💧${w.daily.precipitation_probability_max[i]}%` : ''}</span><span class="right"><b>${Math.round(w.daily.temperature_2m_max[i])}°</b> <span class="muted">${Math.round(w.daily.temperature_2m_min[i])}°</span></span></div>`;
        }).join('')}` : '<span class="muted">Sin previsión para esas fechas.</span>';
      })
      .catch(() => (box.innerHTML = '<span class="warn-text">No se pudo cargar el tiempo.</span>'));
  }
}

export default {
  title: 'Viajes',
  quickAdd: (rerender) => openTripSheet(rerender),
  render(view, { rerender }) {
    const t = db().trips.find((x) => x.id === current);
    if (t) return renderTrip(view, t, rerender);
    const trips = [...db().trips].sort((a, b) => a.from.localeCompare(b.from));
    const upcoming = trips.filter((x) => x.to >= dkey());
    const past = trips.filter((x) => x.to < dkey()).reverse();
    const card = (x) => `<button class="card row" data-open="${x.id}" style="width:100%;border:0;text-align:left;cursor:pointer;color:inherit">
      <span style="font-size:28px">✈️</span><div class="grow"><b>${esc(x.dest)}</b><div class="small muted">${fmtShort(parseKey(x.from))} → ${fmtShort(parseKey(x.to))}</div></div>
      ${x.to >= dkey() ? `<span class="badge">${daysUntil(x) > 0 ? `en ${daysUntil(x)} días` : '¡ahora!'}</span>` : ''}</button>`;
    view.innerHTML = `
      ${upcoming.length ? upcoming.map(card).join('') : '<div class="empty"><span class="big">🧳</span>Organiza tus viajes: plan por días, reservas, maleta y el tiempo del destino.</div>'}
      ${past.length ? `<div class="section-title">Viajes pasados</div>${past.map(card).join('')}` : ''}
      <button class="fab" aria-label="Nuevo viaje">+</button>`;
    view.querySelector('.fab').onclick = () => openTripSheet(rerender);
    view.querySelectorAll('[data-open]').forEach((b) => (b.onclick = () => { current = b.dataset.open; tab = 'plan'; rerender(); }));
  },
};
