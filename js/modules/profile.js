// Sobre mí: tu ficha personal y lo que el asistente recuerda de ti.
import { db, update } from '../store.js';
import { esc, uid, dkey, parseKey, toast, confirmSheet } from '../utils.js';

export const me = () => db().profile;
export const myName = () => me().name.trim();

export function myAge(on = new Date()) {
  const b = me().birth && parseKey(me().birth);
  if (!b || isNaN(b)) return null;
  let a = on.getFullYear() - b.getFullYear();
  if (on.getMonth() < b.getMonth() || (on.getMonth() === b.getMonth() && on.getDate() < b.getDate())) a--;
  return a;
}

export function isMyBirthday(on = new Date()) {
  const b = me().birth;
  return !!b && b.slice(5) === dkey(on).slice(5);
}

export function addMemory(text) {
  const t = String(text).trim();
  if (!t) return;
  update((d) => d.memories.push({ id: uid(), text: t, date: dkey() }));
}

// Ficha para Claude: quién eres y lo que recuerda de ti
export function profileContext() {
  const p = me();
  const age = myAge();
  const lines = [
    `Nombre: ${p.fullName || p.name || '(sin indicar)'}${p.name ? ` (llámale ${p.name})` : ''}.`,
    p.city ? `Vive en ${p.city}.` : '',
    age !== null ? `Tiene ${age} años (nació el ${p.birth}).${isMyBirthday() ? ' ¡HOY ES SU CUMPLEAÑOS!' : ''}` : '',
    p.sports ? `Deporte: ${p.sports}` : '',
    p.teams ? `Equipos: ${p.teams}.` : '',
    p.news ? `Noticias que le interesan: ${p.news}.` : '',
    p.goals ? `Objetivos: ${p.goals}` : '',
    p.people ? `Personas importantes: ${p.people}` : '',
    p.about ? `Más datos:${p.about}` : '',
  ].filter(Boolean);
  const mem = db().memories;
  if (mem.length) lines.push(`Cosas que te ha contado y debes recordar:\n${mem.map((m) => `- ${m.text}`).join('\n')}`);
  return lines.join('\n');
}

const FIELDS = [
  ['name', 'Cómo quieres que te llame', 'input', 'Tu nombre o mote'],
  ['fullName', 'Nombre completo', 'input', ''],
  ['city', 'Ciudad', 'input', 'Dónde vives'],
  ['birth', 'Fecha de nacimiento', 'date', ''],
  ['sports', 'Deporte que practicas', 'area', 'Qué deporte haces y cuántos días por semana'],
  ['teams', 'Tus equipos', 'input', 'Equipos que sigues'],
  ['news', 'Noticias que te interesan', 'area', 'Deportes, actualidad, tecnología…'],
  ['goals', 'Tus objetivos', 'area', 'Ganar músculo, ahorrar para…, leer más…'],
  ['people', 'Personas importantes', 'area', 'Pareja, familia, amigos… (nombre y quién es)'],
  ['about', 'Más sobre ti', 'area', 'Trabajo, horario, gustos, comidas que no te gustan…'],
];

export default {
  title: 'Sobre mí',
  render(view, { rerender }) {
    const p = me();
    const age = myAge();
    const mem = [...db().memories].reverse();
    view.innerHTML = `
      <div class="card row">
        <span style="font-size:40px">🙋‍♂️</span>
        <div class="grow"><div style="font-size:22px;font-weight:800">${esc(p.fullName || p.name || 'Tu perfil')}</div>
        <div class="muted small">${[p.city && `📍 ${esc(p.city)}`, age !== null && `${age} años`].filter(Boolean).join(' · ')}</div></div>
      </div>

      <form class="card" data-form>
        <h2>✍️ Tu ficha</h2>
        <p class="small muted" style="margin-top:0">El asistente, el resumen de la mañana y las noticias usan estos datos para hablarte a ti.</p>
        ${FIELDS.map(([k, label, type, ph]) => `<label class="field"><span>${label}</span>${type === 'area'
          ? `<textarea class="input" name="${k}" rows="2" placeholder="${esc(ph)}">${esc(p[k])}</textarea>`
          : `<input class="input" name="${k}" type="${type === 'date' ? 'date' : 'text'}" value="${esc(p[k])}" placeholder="${esc(ph)}">`}</label>`).join('')}
        <button class="btn primary block">Guardar</button>
      </form>

      <div class="card">
        <h2>🧠 Lo que Claude recuerda de ti</h2>
        <p class="small muted" style="margin-top:0">Cuando le cuentes algo importante en el asistente, lo apuntará aquí. También puedes añadirlo tú.</p>
        ${mem.length ? `<ul class="list">${mem.map((m) => `<li><span class="grow">${esc(m.text)}</span><button class="btn small" data-del="${m.id}" aria-label="Olvidar">✕</button></li>`).join('')}</ul>`
          : '<div class="muted small">Todavía nada.</div>'}
        <form class="row" data-memform style="margin-top:10px"><input class="input grow" name="m" placeholder="Ej.: no me gusta el pescado" autocomplete="off"><button class="btn">Añadir</button></form>
      </div>`;

    view.querySelector('[data-form]').onsubmit = (e) => {
      e.preventDefault();
      const f = e.target;
      update((d) => FIELDS.forEach(([k]) => (d.profile[k] = f[k].value.trim())));
      toast('✅ Guardado');
      rerender();
    };
    view.querySelector('[data-memform]').onsubmit = (e) => {
      e.preventDefault();
      addMemory(e.target.m.value);
      rerender();
    };
    view.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => {
      if (!(await confirmSheet('Claude dejará de recordar esto.', 'Olvidar'))) return;
      update((d) => (d.memories = d.memories.filter((m) => m.id !== b.dataset.del)));
      rerender();
    }));
  },
};
