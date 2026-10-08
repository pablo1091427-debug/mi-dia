// Gimnasio: rutinas, registro de series (repeticiones y kilos) y progreso por ejercicio.
import { db, update } from '../store.js';
import { esc, uid, dkey, parseKey, fmtShort, toast, sheet, confirmSheet } from '../utils.js';
import { lineChart, bindCharts, tabsHtml, bindTabs } from '../ui.js';

const TEMPLATES = {
  'Torso': ['Press banca', 'Remo con barra', 'Press militar', 'Jalón al pecho', 'Curl de bíceps', 'Extensión de tríceps'],
  'Pierna': ['Sentadilla', 'Peso muerto rumano', 'Prensa', 'Zancadas', 'Curl femoral', 'Gemelos'],
  'Cuerpo completo': ['Sentadilla', 'Press banca', 'Remo con mancuerna', 'Press militar', 'Plancha'],
};

// Últimas series registradas de un ejercicio
function lastSetsOf(ex) {
  const s = [...db().gymSessions].sort((a, b) => b.date.localeCompare(a.date)).find((x) => x.sets.some((st) => st.ex === ex));
  return s ? s.sets.filter((st) => st.ex === ex) : [];
}
export const allExercises = () => [...new Set([...db().gymRoutines.flatMap((r) => r.exercises), ...db().gymSessions.flatMap((s) => s.sets.map((x) => x.ex))])].sort();

function openRoutineSheet(onSaved, routine) {
  const s = sheet({
    title: routine ? 'Editar rutina' : 'Nueva rutina',
    body: `
      <form>
        <label class="field"><span>Nombre</span><input class="input" name="name" required value="${esc(routine?.name || '')}" placeholder="Lunes – Torso"></label>
        ${routine ? '' : `<div class="chips" style="margin-bottom:10px">${Object.keys(TEMPLATES).map((t) => `<button type="button" class="chip" data-tpl="${t}">Plantilla: ${t}</button>`).join('')}</div>`}
        <label class="field"><span>Ejercicios (uno por línea)</span><textarea class="input" name="ex" rows="7" required>${esc((routine?.exercises || []).join('\n'))}</textarea></label>
        <button class="btn primary block">Guardar</button>
        ${routine ? '<button type="button" class="btn danger block" data-del style="margin-top:6px">Borrar rutina</button>' : ''}
      </form>`,
  });
  const f = s.el.querySelector('form');
  s.el.querySelectorAll('[data-tpl]').forEach((b) => (b.onclick = () => { f.name.value ||= b.dataset.tpl; f.ex.value = TEMPLATES[b.dataset.tpl].join('\n'); }));
  f.onsubmit = (e) => {
    e.preventDefault();
    const exercises = f.ex.value.split('\n').map((x) => x.trim()).filter(Boolean);
    if (!exercises.length) return toast('Añade al menos un ejercicio');
    update((d) => {
      if (routine) Object.assign(d.gymRoutines.find((r) => r.id === routine.id), { name: f.name.value.trim(), exercises });
      else d.gymRoutines.push({ id: uid(), name: f.name.value.trim(), exercises });
    });
    s.close();
    onSaved?.();
  };
  s.el.querySelector('[data-del]')?.addEventListener('click', async () => {
    if (!(await confirmSheet('Se borrará la rutina (tus entrenamientos guardados se mantienen).'))) return;
    update((d) => (d.gymRoutines = d.gymRoutines.filter((r) => r.id !== routine.id)));
    s.close();
    onSaved?.();
  });
}

// Registro de un entrenamiento: series por ejercicio, precargadas con la última vez
function openSessionSheet(routine, onSaved) {
  const rows = routine.exercises.map((ex) => {
    const last = lastSetsOf(ex);
    return { ex, sets: (last.length ? last : [{ reps: 10, kg: 0 }, { reps: 10, kg: 0 }, { reps: 10, kg: 0 }]).map((x) => ({ reps: x.reps, kg: x.kg })), last };
  });
  const s = sheet({
    title: `💪 ${routine.name}`,
    full: true,
    body: `<div id="exs" style="flex:1;overflow-y:auto"></div>
      <label class="field" style="margin-top:10px"><span>Fecha</span><input class="input" type="date" name="date" value="${dkey()}"></label>
      <button class="btn primary block" data-save>Guardar entrenamiento</button>`,
  });
  s.el.querySelector('.sheet-body').style.cssText = 'display:flex;flex-direction:column;flex:1;min-height:0';
  const box = s.el.querySelector('#exs');
  const draw = () => {
    box.innerHTML = rows.map((r, i) => `
      <div class="card" style="box-shadow:none;background:var(--surface-2)">
        <h2>${esc(r.ex)}</h2>
        ${r.last.length ? `<div class="small muted" style="margin:-4px 0 8px">Última vez: ${r.last.map((x) => `${x.reps}×${x.kg} kg`).join(', ')}</div>` : ''}
        ${r.sets.map((st, j) => `
          <div class="row" style="margin-bottom:6px">
            <span class="small muted" style="width:46px">Serie ${j + 1}</span>
            <input class="input" style="width:70px" inputmode="numeric" data-reps="${i}:${j}" value="${st.reps}" aria-label="Repeticiones"><span class="small">reps</span>
            <input class="input" style="width:80px" inputmode="decimal" data-kg="${i}:${j}" value="${st.kg}" aria-label="Kilos"><span class="small">kg</span>
            <button type="button" class="x-btn" data-rm="${i}:${j}" aria-label="Quitar serie">✕</button>
          </div>`).join('')}
        <button type="button" class="btn small" data-add="${i}">+ Serie</button>
      </div>`).join('');
    box.querySelectorAll('[data-reps]').forEach((inp) => (inp.oninput = () => { const [i, j] = inp.dataset.reps.split(':'); rows[i].sets[j].reps = parseInt(inp.value, 10) || 0; }));
    box.querySelectorAll('[data-kg]').forEach((inp) => (inp.oninput = () => { const [i, j] = inp.dataset.kg.split(':'); rows[i].sets[j].kg = parseFloat(inp.value.replace(',', '.')) || 0; }));
    box.querySelectorAll('[data-add]').forEach((b) => (b.onclick = () => { const r = rows[b.dataset.add]; r.sets.push({ ...(r.sets.at(-1) || { reps: 10, kg: 0 }) }); draw(); }));
    box.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = () => { const [i, j] = b.dataset.rm.split(':'); rows[i].sets.splice(j, 1); draw(); }));
  };
  draw();
  s.el.querySelector('[data-save]').onclick = () => {
    const sets = rows.flatMap((r) => r.sets.filter((x) => x.reps > 0).map((x) => ({ ex: r.ex, reps: x.reps, kg: x.kg })));
    if (!sets.length) return toast('No hay series');
    const date = s.el.querySelector('[name=date]').value || dkey();
    update((d) => {
      d.gymSessions.push({ id: uid(), date, routineId: routine.id, routine: routine.name, sets });
      d.sport[date] ??= { type: 'gym', min: 0 }; // cuenta también como día de deporte
    });
    s.close();
    toast('💪 ¡Entrenamiento guardado!');
    onSaved?.();
  };
}

let tab = 'entrenar';
let exSel = '';

export default {
  title: 'Gimnasio',
  render(view, { rerender }) {
    const d = db();
    let body = '';
    if (tab === 'entrenar') {
      const recent = [...d.gymSessions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
      body = d.gymRoutines.length
        ? `<div class="section-title" style="margin-top:0">¿Qué toca hoy?</div>
          ${d.gymRoutines.map((r) => `<button class="card row" data-start="${r.id}" style="width:100%;border:0;text-align:left;cursor:pointer;color:inherit">
            <span style="font-size:26px">🏋️</span><div class="grow"><b>${esc(r.name)}</b><div class="small muted ellipsis">${esc(r.exercises.join(', '))}</div></div><span class="btn small primary">Empezar</span></button>`).join('')}
          ${recent.length ? `<div class="section-title">Últimos entrenamientos</div><div class="card"><ul class="list">${recent.map((s) => `
            <li><div class="grow"><b>${esc(s.routine || 'Entrenamiento')}</b><div class="small muted">${fmtShort(parseKey(s.date))} · ${s.sets.length} series · ${Math.round(s.sets.reduce((a, x) => a + x.reps * x.kg, 0)).toLocaleString('es-ES')} kg movidos</div></div>
            <button class="x-btn" data-delsession="${s.id}" aria-label="Borrar">✕</button></li>`).join('')}</ul></div>` : ''}`
        : '<div class="empty"><span class="big">🏋️</span>Crea tu primera rutina (hay plantillas) y registra series, repeticiones y pesos.<br><br><button class="btn primary" data-newroutine>Crear rutina</button></div>';
    } else if (tab === 'rutinas') {
      body = `${d.gymRoutines.map((r) => `<div class="card" data-edit="${r.id}" style="cursor:pointer"><h2>${esc(r.name)}</h2><div class="small muted">${esc(r.exercises.join(' · '))}</div></div>`).join('')}
        <button class="btn block" data-newroutine>+ Nueva rutina</button>`;
    } else {
      const exs = allExercises().filter((ex) => d.gymSessions.some((s) => s.sets.some((x) => x.ex === ex)));
      if (!exSel || !exs.includes(exSel)) exSel = exs[0] || '';
      const points = [...d.gymSessions].filter((s) => s.sets.some((x) => x.ex === exSel)).sort((a, b) => a.date.localeCompare(b.date))
        .map((s) => {
          const best = Math.max(...s.sets.filter((x) => x.ex === exSel).map((x) => x.kg));
          return { label: parseKey(s.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }), y: best };
        });
      body = exs.length
        ? `<label class="field"><span>Ejercicio</span><select class="input" data-ex>${exs.map((ex) => `<option ${ex === exSel ? 'selected' : ''}>${esc(ex)}</option>`).join('')}</select></label>
          <div class="card"><h2>Peso máximo por sesión (kg)</h2>${lineChart(points, { unit: ' kg' })}
          ${points.length >= 2 ? `<p class="small muted" style="margin:6px 0 0">${points.at(-1).y >= points[0].y ? '📈' : '📉'} De ${points[0].y} kg a ${points.at(-1).y} kg en ${points.length} sesiones.</p>` : ''}</div>`
        : '<div class="empty"><span class="big">📈</span>Registra entrenamientos para ver tu progreso.</div>';
    }
    view.innerHTML = tabsHtml([['entrenar', 'Entrenar'], ['rutinas', 'Rutinas'], ['progreso', 'Progreso']], tab) + body;
    bindTabs(view, (t) => { tab = t; rerender(); });
    bindCharts(view);
    view.querySelectorAll('[data-start]').forEach((b) => (b.onclick = () => openSessionSheet(d.gymRoutines.find((r) => r.id === b.dataset.start), rerender)));
    view.querySelectorAll('[data-newroutine]').forEach((b) => (b.onclick = () => openRoutineSheet(rerender)));
    view.querySelectorAll('[data-edit]').forEach((c) => (c.onclick = () => openRoutineSheet(rerender, d.gymRoutines.find((r) => r.id === c.dataset.edit))));
    view.querySelector('[data-ex]')?.addEventListener('change', (e) => { exSel = e.target.value; rerender(); });
    view.querySelectorAll('[data-delsession]').forEach((b) => {
      b.onclick = async () => {
        if (!(await confirmSheet('Se borrará este entrenamiento.'))) return;
        update((x) => (x.gymSessions = x.gymSessions.filter((s) => s.id !== b.dataset.delsession)));
        rerender();
      };
    });
  },
};
