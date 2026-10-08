import { db, update, exportJSON, importJSON, resetAll } from '../store.js';
import { esc, dkey, toast, download, confirmSheet } from '../utils.js';
import * as G from '../google.js';
import { applyTheme } from '../app.js';
import { MODELS } from '../ai.js';
import { lockSupported, enableLock, disableLock } from '../lock.js';
import { backupNow, restoreFromDrive } from '../backup.js';

export default {
  title: 'Ajustes',
  render(view, { rerender }) {
    const s = db().settings;
    G.preload();
    const gState = !s.googleClientId ? 'Sin configurar' : !s.googleConnected ? 'No conectado' : G.hasToken() ? '✅ Conectado' : '🔄 Sesión caducada';

    view.innerHTML = `
      <div class="card">
        <h2>📅 Google Calendar y Drive <span class="badge" style="margin-left:auto">${gState}</span></h2>
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
            <li>«APIs y servicios» → «Biblioteca» → activa <b>Google Calendar API</b> y <b>Google Drive API</b> (para las copias).</li>
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
        <h2>🔒 Bloqueo con huella</h2>
        <p class="small muted" style="margin-top:0">Pide tu huella (o el bloqueo de pantalla del móvil) al abrir la app y al volver tras más de 1 minuto.</p>
        <label class="check"><input type="checkbox" data-lock ${s.lock ? 'checked' : ''}> Activar bloqueo</label>
        <p class="small muted" data-lockmsg style="margin:0"></p>
      </div>

      <div class="card">
        <h2>💧 Objetivos</h2>
        <div class="row"><span class="grow">Vasos de agua al día</span>
          <select class="input" style="width:auto" data-watergoal>${[4, 5, 6, 7, 8, 9, 10, 12].map((n) => `<option ${n === s.waterGoal ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      </div>

      <div class="card">
        <h2>☁️ Copia en Google Drive</h2>
        <p class="small muted" style="margin-top:0">Guarda una copia automática en tu Google Drive (archivo «mi-dia-copia.json») cada vez que abres la app, como mucho cada 12 horas. ${s.lastDriveBackup ? `Última copia: ${new Date(s.lastDriveBackup).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}.` : ''}</p>
        ${G.isReady() && G.hasDrive() === false ? '<p class="small warn-text">Falta el permiso de Drive: pulsa «Reconectar» arriba y acepta el acceso a Drive.</p>' : ''}
        <label class="check"><input type="checkbox" data-drive ${s.driveBackup ? 'checked' : ''} ${s.googleConnected ? '' : 'disabled'}> Copia automática${s.googleConnected ? '' : ' (conecta Google primero)'}</label>
        <div class="row" style="margin-top:8px">
          <button class="btn grow" data-drivenow ${G.isReady() ? '' : 'disabled'}>Copiar ahora</button>
          <button class="btn grow" data-driverestore ${G.isReady() ? '' : 'disabled'}>Restaurar</button>
        </div>
      </div>

      <div class="card">
        <h2>💾 Copia en archivo</h2>
        <p class="small muted" style="margin-top:0">Descarga o carga una copia manual. La clave de Anthropic y el bloqueo no se incluyen en las copias.</p>
        <div class="row">
          <button class="btn grow" data-export>⬇️ Exportar</button>
          <label class="btn grow">⬆️ Importar<input type="file" accept="application/json,.json" data-import hidden></label>
        </div>
        <button class="btn danger block" data-reset style="margin-top:8px">Borrar todos los datos</button>
      </div>
      <p class="small muted" style="text-align:center">Mi Día · v3.0</p>`;

    view.querySelector('[data-lock]').onchange = async (e) => {
      const msg = view.querySelector('[data-lockmsg]');
      if (e.target.checked) {
        if (!(await lockSupported())) {
          e.target.checked = false;
          msg.textContent = 'Este dispositivo no tiene huella o bloqueo de pantalla compatible.';
          return;
        }
        try {
          await enableLock();
          toast('🔒 Bloqueo activado');
        } catch {
          e.target.checked = false;
          msg.textContent = 'No se pudo activar (¿cancelaste la huella?).';
        }
      } else {
        disableLock();
        toast('Bloqueo desactivado');
      }
    };
    view.querySelector('[data-watergoal]').onchange = (e) => update((d) => (d.settings.waterGoal = +e.target.value));
    view.querySelector('[data-drive]').onchange = (e) => {
      update((d) => (d.settings.driveBackup = e.target.checked));
      if (e.target.checked) backupNow().then(() => { toast('☁️ Copia guardada en Drive'); rerender(); }).catch((err) => toast(err.message));
    };
    view.querySelector('[data-drivenow]').onclick = () => backupNow().then(() => { toast('☁️ Copia guardada en Drive'); rerender(); }).catch((err) => toast(err.message));
    view.querySelector('[data-driverestore]').onclick = async () => {
      if (!(await confirmSheet('Se sustituirán los datos de este móvil por la copia de Google Drive.', 'Restaurar'))) return;
      try {
        const when = await restoreFromDrive();
        applyTheme();
        toast(`Restaurada la copia del ${new Date(when).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}`);
        rerender();
      } catch (err) {
        toast(err.message);
      }
    };

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
