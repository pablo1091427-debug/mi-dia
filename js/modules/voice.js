// Notas de voz: el dictado de Chrome transcribe y Claude resume y saca las tareas.
import { db, update } from '../store.js';
import { esc, uid, dkey, parseKey, fmtShort, toast, confirmSheet } from '../utils.js';
import { askJSON, objSchema, hasKey } from '../ai.js';
import { addTask } from './tasks.js';

const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
const SCHEMA = objSchema({
  titulo: { type: 'string', description: 'Título corto' },
  resumen: { type: 'string', description: 'Resumen en 2-5 frases' },
  tareas: { type: 'array', items: { type: 'string' }, description: 'Cosas por hacer que se mencionan (vacío si no hay)' },
});

let rec = null;
let recording = false;
let finalText = '';
let interim = '';

async function summarize(id, rerender) {
  const n = db().voiceNotes.find((x) => x.id === id);
  if (!n || !hasKey()) return;
  try {
    const r = await askJSON({
      system: 'Resumes notas de voz transcritas automáticamente (pueden tener errores de transcripción). Respondes en español.',
      content: n.transcript,
      schema: SCHEMA,
      maxTokens: 2000,
    });
    update((d) => Object.assign(d.voiceNotes.find((x) => x.id === id), { title: r.titulo, summary: r.resumen, actions: r.tareas }));
    rerender();
  } catch (e) {
    toast(e.message);
  }
}

function start(rerender) {
  finalText = '';
  interim = '';
  recording = true;
  const begin = () => {
    rec = new Speech();
    rec.lang = 'es-ES';
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript.trim() + '. ';
        else interim += e.results[i][0].transcript;
      }
      const box = document.querySelector('#live');
      if (box) box.textContent = finalText + interim;
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed') { recording = false; toast('Permite el micrófono para grabar'); rerender(); }
    };
    // Chrome corta el dictado tras unos segundos de silencio: se reanuda solo mientras grabas
    rec.onend = () => recording && begin();
    rec.start();
  };
  begin();
  rerender();
}

function stop(rerender) {
  recording = false;
  rec?.stop();
  const text = (finalText + interim).trim();
  if (!text) { toast('No se ha oído nada'); rerender(); return; }
  const id = uid();
  update((d) => d.voiceNotes.unshift({ id, date: dkey(), created: Date.now(), title: '', transcript: text, summary: '', actions: [] }));
  rerender();
  summarize(id, rerender);
}

export default {
  title: 'Notas de voz',
  quickAdd: (rerender) => Speech && !recording && start(rerender),
  render(view, { rerender }) {
    const notes = db().voiceNotes;
    view.innerHTML = `
      ${Speech ? `<div class="card" style="text-align:center">
        <button class="btn ${recording ? 'danger' : 'primary'}" data-rec style="width:96px;height:96px;border-radius:50%;font-size:40px;${recording ? 'background:var(--danger);color:#fff' : ''}" aria-label="${recording ? 'Parar' : 'Grabar'}">${recording ? '⏹' : '🎙️'}</button>
        <p class="small muted">${recording ? 'Grabando… habla con normalidad y pulsa ⏹ al terminar.' : 'Pulsa para grabar una idea, una reunión o lo que quieras recordar.'}</p>
        ${recording ? `<div id="live" class="ai-box small" style="text-align:left;min-height:40px">${esc(finalText)}</div>` : ''}
      </div>` : '<div class="card small">Tu navegador no permite dictado por voz. En Android usa Chrome.</div>'}
      ${!hasKey() ? '<p class="small muted">Con la clave de Claude (Ajustes) cada nota tendrá además título, resumen y tareas.</p>' : ''}
      ${notes.map((n) => `
        <div class="card">
          <h2>🎙️ ${esc(n.title || 'Nota de voz')}<span class="small muted" style="margin-left:auto;font-weight:400">${fmtShort(parseKey(n.date))}</span></h2>
          ${n.summary ? `<div class="ai-box">${esc(n.summary)}</div>` : hasKey() ? '<p class="muted small">Resumiendo…</p>' : ''}
          ${n.actions?.length ? `<div class="small" style="margin-top:8px"><b>Tareas:</b><ul style="padding-left:18px;margin:4px 0">${n.actions.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>
            <button class="btn small" data-tasks="${n.id}">✔️ Pasar a Tareas</button></div>` : ''}
          <details style="margin-top:8px"><summary class="small muted">Transcripción completa</summary><p class="small" style="white-space:pre-wrap">${esc(n.transcript)}</p></details>
          <div class="row" style="margin-top:6px"><button class="btn small" data-copy="${n.id}">Copiar</button>${hasKey() && !n.summary ? `<button class="btn small" data-sum="${n.id}">Resumir</button>` : ''}<button class="btn small danger right" data-del="${n.id}">Borrar</button></div>
        </div>`).join('')}`;

    view.querySelector('[data-rec]')?.addEventListener('click', () => (recording ? stop(rerender) : start(rerender)));
    view.querySelectorAll('[data-tasks]').forEach((b) => (b.onclick = () => {
      const n = db().voiceNotes.find((x) => x.id === b.dataset.tasks);
      n.actions.forEach((t) => addTask({ text: t }));
      update((d) => (d.voiceNotes.find((x) => x.id === n.id).actions = []));
      toast(`✔️ ${n.actions.length} tareas creadas`);
      rerender();
    }));
    view.querySelectorAll('[data-sum]').forEach((b) => (b.onclick = () => { b.disabled = true; summarize(b.dataset.sum, rerender); }));
    view.querySelectorAll('[data-copy]').forEach((b) => (b.onclick = () => {
      const n = db().voiceNotes.find((x) => x.id === b.dataset.copy);
      navigator.clipboard.writeText([n.title, n.summary, n.transcript].filter(Boolean).join('\n\n')).then(() => toast('Copiado'));
    }));
    view.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => {
      if (!(await confirmSheet('Se borrará esta nota de voz.'))) return;
      update((d) => (d.voiceNotes = d.voiceNotes.filter((x) => x.id !== b.dataset.del)));
      rerender();
    }));
    // Si sales de la pantalla grabando, se para y se guarda
    return () => recording && !location.hash.startsWith('#/notasvoz') && stop(() => {});
  },
};
