import { db, update, exportJSON, importJSON, resetAll } from '../store.js';
import { esc, dkey, toast, download, confirmSheet } from '../utils.js';
import * as G from '../google.js';
import { applyTheme } from '../app.js';
import { MODELS } from './assistant.js';

export default {
  title: 'Ajustes',
  render(view, { rerender }) {
    const s = db().settings;
    G.preload();
    const gState = !s.googleClientId ? 'Sin configurar' : !s.googleConnected ? 'No conectado' : G.hasToken() ? '✅ Conectado' : '🔄 Sesión caducada';

    view.innerHTML = `
      <div class="card">
        <h2>📅 Google Calendar <span class="badge" style="margin-left:auto">${gState}</span></h2>
        <p class="small muted" style="margin-top:0">Con Google conectado, los eventos que crees aquí se guardan en tu Google Calendar y verás los de allí en la app.</p>
        <label class="field"><span>ID de cliente OAuth de Google</span>
          <input class="input" name="gcid" value="${esc(s.googleClientId)}" placeholder="xxxxxxxx.apps.googleusercontent.com" autocomplete="off"></label>
        <div class="row">
          ${s.googleConnected
            ? `<button class="btn primary grow" data-gconnect>${G.hasToken() ? 'Reconectar' : 'Reconectar Google'}</button><button class="btn danger" data-gdisconnect>Desconectar</button>`
            : '<button class="btn primary block" data-gconnect>Conectar con Google</button>'}
        </div>
        <details class="small" style="margin-top:10px"><summary>¿Cómo consigo el ID de cliente?</summary>
          <ol style="padding-left:18px">
            <li>Entra en <a href="https://console.cloud.google.com/" target="_blank" rel="noopener">console.cloud.google.com</a> y crea un proyecto.</li>
            <li>«APIs y servicios» → «Biblioteca» → activa <b>Google Calendar API</b>.</li>
            <li>«Pantalla de consentimiento de OAuth» → tipo Externo, y añade tu correo como usuario de prueba.</li>
            <li>«Credenciales» → «Crear credenciales» → «ID de cliente de OAuth» → tipo <b>Aplicación web</b>.</li>
            <li>En «Orígenes de JavaScript autorizados» añade: <code>${esc(location.origin)}</code></li>
            <li>Copia el ID de cliente y pégalo arriba.</li>
          </ol>
          <p>Por seguridad, Google da acceso durante 1 hora; después la app te pedirá «Reconectar» con un toque.</p>
        </details>
      </div>

      <div class="card">
        <h2>🤖 Asistente (Claude)</h2>
        <label class="field"><span>Clave de API de Anthropic</span>
          <input class="input" type="password" name="akey" value="${esc(s.anthropicKey)}" placeholder="sk-ant-…" autocomplete="off"></label>
        <label class="field"><span>Modelo</span><select class="input" name="model">
          ${MODELS.map((m) => `<option value="${m.id}" ${m.id === s.model ? 'selected' : ''}>${m.name}</option>`).join('')}</select></label>
        <p class="small muted" style="margin:0">Consíguela en <a href="https://console.anthropic.com/" target="_blank" rel="noopener">console.anthropic.com</a>. Se guarda solo en este móvil. El uso se paga por consumo en tu cuenta de Anthropic.</p>
      </div>

      <div class="card">
        <h2>🎨 Apariencia</h2>
        <div class="chips">${[['auto', 'Automático'], ['light', 'Claro'], ['dark', 'Oscuro']].map(([v, l]) => `<button class="chip ${s.theme === v ? 'active' : ''}" data-theme-opt="${v}">${l}</button>`).join('')}</div>
      </div>

      <div class="card">
        <h2>💾 Copia de seguridad</h2>
        <p class="small muted" style="margin-top:0">Tus datos se guardan en este móvil. Haz una copia de vez en cuando (por ejemplo, guárdala en Google Drive) para no perderlos si cambias de teléfono.</p>
        <div class="row">
          <button class="btn grow" data-export>⬇️ Exportar</button>
          <label class="btn grow">⬆️ Importar<input type="file" accept="application/json,.json" data-import hidden></label>
        </div>
        <button class="btn danger block" data-reset style="margin-top:8px">Borrar todos los datos</button>
      </div>
      <p class="small muted" style="text-align:center">Mi Día · v2.0</p>`;

    const saveField = (name, key) => {
      view.querySelector(`[name=${name}]`).onchange = (e) => {
        update((d) => (d.settings[key] = e.target.value.trim()));
        toast('Guardado');
        if (key === 'googleClientId') {
          G.preload();
          rerender();
        }
      };
    };
    saveField('gcid', 'googleClientId');
    saveField('akey', 'anthropicKey');
    saveField('model', 'model');

    view.querySelector('[data-gconnect]').onclick = () => {
      const v = view.querySelector('[name=gcid]').value.trim();
      if (v !== s.googleClientId) update((d) => (d.settings.googleClientId = v));
      G.connect()
        .then(() => {
          toast('Google Calendar conectado');
          rerender();
        })
        .catch((e) => toast(e.message));
    };
    view.querySelector('[data-gdisconnect]')?.addEventListener('click', () => {
      G.disconnect();
      toast('Google desconectado');
      rerender();
    });
    view.querySelectorAll('[data-theme-opt]').forEach((b) => {
      b.onclick = () => {
        update((d) => (d.settings.theme = b.dataset.themeOpt));
        applyTheme();
        rerender();
      };
    });
    view.querySelector('[data-export]').onclick = () => {
      download(`mi-dia-copia-${dkey()}.json`, exportJSON());
      toast('Copia descargada');
    };
    view.querySelector('[data-import]').onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (!(await confirmSheet('Se sustituirán los datos actuales por los de la copia.', 'Importar'))) return;
      try {
        importJSON(await file.text());
        applyTheme();
        toast('Copia restaurada');
        rerender();
      } catch (err) {
        toast(err.message || 'Archivo no válido');
      }
    };
    view.querySelector('[data-reset]').onclick = async () => {
      if (!(await confirmSheet('Se borrarán TODAS tus notas, eventos, entrenamientos y demás datos de este móvil. No se puede deshacer.', 'Borrar todo'))) return;
      resetAll();
      applyTheme();
      toast('Datos borrados');
      rerender();
    };
  },
};
