import { db, update, exportJSON, importJSON, resetAll } from '../store.js';
import { esc, dkey, toast, download, confirmSheet, sheet } from '../utils.js';
import * as S from '../sync.js';
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
        <label class="check"><input type="checkbox" data-vaultsync ${s.vaultSync ? 'checked' : ''}> Incluir «Datos útiles» en copias y sincronización</label>
        <p class="small muted" style="margin:0">Desactivado: tus contraseñas Wi-Fi y demás datos útiles no salen de este móvil.</p>
      </div>

      <div class="card" id="sync">
        <h2>🔄 Sincronización ${S.configured() ? `<span class="badge" style="margin-left:auto">${S.syncError() ? '⚠️ Error' : s.syncCode || s.shareCode ? '✅ Activa' : 'Lista'}</span>` : ''}</h2>
        <p class="small muted" style="margin-top:0">Usa tus datos en varios dispositivos (móvil, PC…) y comparte la lista de la compra en directo con tu pareja. Necesita una cuenta gratuita de Supabase.</p>
        ${S.syncError() ? `<p class="small warn-text">${esc(S.syncError())}</p>` : ''}
        <label class="field"><span>URL del proyecto de Supabase</span><input class="input" name="surl" value="${esc(s.syncUrl)}" placeholder="https://xxxx.supabase.co" autocomplete="off"></label>
        <label class="field"><span>Clave pública (anon / publishable)</span><input class="input" name="skey" value="${esc(s.syncKey)}" placeholder="eyJhbGciOi… o sb_publishable_…" autocomplete="off"></label>
        <details class="small" style="margin-bottom:10px"><summary>Cómo configurarlo (5 minutos)</summary>
          <ol style="padding-left:18px">
            <li>Crea una cuenta gratis en <a href="https://supabase.com" target="_blank" rel="noopener">supabase.com</a> y un proyecto nuevo.</li>
            <li>Abre «SQL Editor», pega este código y pulsa «Run»: <button class="btn small" type="button" data-copysql>Copiar SQL</button></li>
            <li>En «Project Settings» → «API» copia la URL del proyecto y la clave pública «anon» (o «publishable») y pégalas arriba.</li>
            <li>Pulsa «Crear mi espacio» aquí, y en tu otro dispositivo usa el enlace de «Añadir otro dispositivo».</li>
          </ol></details>
        ${S.configured() ? `
          <div class="hr"></div>
          <b>📱 Mis dispositivos</b>
          ${s.syncCode ? `<p class="small muted">Sincronizado${s.syncPulledAt ? ` · última vez ${new Date(s.syncPulledAt).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}` : ''}.</p>
            <div class="row wrap" style="gap:8px"><button class="btn grow" data-syncnow>Sincronizar ahora</button><button class="btn grow" data-adddevice>Añadir otro dispositivo</button></div>
            <button class="btn danger block small" data-syncoff style="margin-top:6px">Dejar de sincronizar este dispositivo</button>`
          : `<div class="row wrap" style="gap:8px;margin-top:6px"><button class="btn primary grow" data-synccreate>Crear mi espacio</button><button class="btn grow" data-syncjoin>Tengo un código</button></div>`}
          <div class="hr"></div>
          <b>👫 Lista de la compra compartida</b>
          ${s.shareCode ? `<p class="small muted">Compartida en directo.</p><div class="row wrap" style="gap:8px"><button class="btn grow" data-shareinvite>Invitar de nuevo</button><button class="btn danger grow" data-shareoff>Dejar de compartir</button></div>`
          : '<p class="small muted">Tu pareja verá y editará la misma lista desde su Mi Día.</p><button class="btn block" data-sharecreate>Compartir con alguien</button>'}` : ''}
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
      <p class="small muted" style="text-align:center">Mi Día · v6.0</p>`;

    // ---------- Sincronización ----------
    const fromSync = { fromSync: true };
    const setSync = (fn) => update(fn, fromSync); // los ajustes de sincronización no cuentan como cambio de datos
    const joinLink = (key, code) => `${location.origin}${location.pathname}#/ajustes?${key}=${code}&u=${encodeURIComponent(s.syncUrl)}&k=${encodeURIComponent(s.syncKey)}`;
    const shareText = async (title, text) => {
      try {
        if (navigator.share) await navigator.share({ title, text });
        else { await navigator.clipboard.writeText(text); toast('Copiado al portapapeles'); }
      } catch {}
    };
    const runSync = () => S.syncNow().then(() => { toast('🔄 Sincronizado'); rerender(); }).catch((e) => { toast(e.message); rerender(); });
    view.querySelector('[name=surl]').onchange = (e) => { setSync((d) => (d.settings.syncUrl = e.target.value.trim())); rerender(); };
    view.querySelector('[name=skey]').onchange = (e) => { setSync((d) => (d.settings.syncKey = e.target.value.trim())); rerender(); };
    view.querySelector('[data-copysql]').onclick = () => navigator.clipboard.writeText(S.SETUP_SQL).then(() => toast('SQL copiado: pégalo en Supabase')).catch(() => toast('No se pudo copiar'));
    view.querySelector('[data-synccreate]')?.addEventListener('click', () => {
      setSync((d) => { d.settings.syncCode = S.newCode(); d.settings.syncPulledAt = 0; });
      runSync();
    });
    const join = (code) => {
      // Al unirse, los datos del espacio mandan sobre los de este dispositivo
      setSync((d) => { d.settings.syncCode = code; d.settings.syncPulledAt = 0; d.modifiedAt = 0; });
      runSync();
    };
    view.querySelector('[data-syncjoin]')?.addEventListener('click', () => {
      const sh = sheet({ title: 'Unirme a mi espacio', body: '<form><label class="field"><span>Código</span><input class="input" name="code" required autocomplete="off"></label><p class="small warn-text">Los datos de este dispositivo se sustituirán por los del espacio.</p><button class="btn primary block">Unirme</button></form>' });
      sh.el.querySelector('form').onsubmit = (e) => { e.preventDefault(); const c = e.target.code.value.trim(); if (c.length < 24) return toast('Código no válido'); sh.close(); join(c); };
    });
    view.querySelector('[data-syncnow]')?.addEventListener('click', runSync);
    view.querySelector('[data-adddevice]')?.addEventListener('click', () =>
      shareText('Mi Día', `Abre este enlace en tu otro dispositivo (¡no lo compartas con nadie, da acceso a todos tus datos!):\n${joinLink('espacio', s.syncCode)}`));
    view.querySelector('[data-syncoff]')?.addEventListener('click', async () => {
      if (!(await confirmSheet('Este dispositivo dejará de sincronizar. Los datos se quedan aquí y en el espacio.', 'Dejar de sincronizar'))) return;
      setSync((d) => { d.settings.syncCode = ''; d.settings.syncPulledAt = 0; });
      rerender();
    });
    const invite = (code) => shareText('Lista de la compra compartida', `🛒 Compartamos la lista de la compra en Mi Día. Abre este enlace (instala la app si no la tienes):\n${joinLink('lista', code)}`);
    view.querySelector('[data-sharecreate]')?.addEventListener('click', () => {
      const code = S.newCode();
      setSync((d) => (d.settings.shareCode = code));
      S.syncNow().catch(() => {});
      invite(code);
      rerender();
    });
    view.querySelector('[data-shareinvite]')?.addEventListener('click', () => invite(s.shareCode));
    view.querySelector('[data-shareoff]')?.addEventListener('click', async () => {
      if (!(await confirmSheet('Dejarás de ver los cambios de la otra persona. Tu lista se queda como está.', 'Dejar de compartir'))) return;
      setSync((d) => (d.settings.shareCode = ''));
      rerender();
    });
    // Enlaces de invitación: #/ajustes?espacio=CODIGO&u=URL&k=CLAVE  o  ?lista=CODIGO…
    const params = new URLSearchParams(location.hash.split('?')[1] || '');
    if (params.get('espacio') || params.get('lista')) {
      history.replaceState(null, '', '#/ajustes');
      const isList = !!params.get('lista');
      const code = params.get('lista') || params.get('espacio');
      const sh = sheet({
        title: isList ? '👫 Lista de la compra compartida' : '📱 Sincronizar este dispositivo',
        body: `<p>${isList ? 'Te han invitado a compartir la lista de la compra. Tus productos se juntarán con los de la otra persona.' : 'Este dispositivo se unirá a tu espacio. <b>Los datos de aquí se sustituirán</b> por los del espacio.'}</p>
          <button class="btn primary block" data-ok>${isList ? 'Compartir lista' : 'Unirme'}</button>`,
      });
      sh.el.querySelector('[data-ok]').onclick = () => {
        setSync((d) => {
          if (params.get('u')) d.settings.syncUrl = params.get('u');
          if (params.get('k')) d.settings.syncKey = params.get('k');
          if (isList) d.settings.shareCode = code;
        });
        sh.close();
        if (isList) runSync();
        else join(code);
      };
    }

    view.querySelector('[data-vaultsync]').onchange = (e) => { update((d) => (d.settings.vaultSync = e.target.checked)); toast(e.target.checked ? 'Datos útiles incluidos en copias' : 'Datos útiles solo en este móvil'); };
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
