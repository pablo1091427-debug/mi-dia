// Bloqueo con huella (o el bloqueo de pantalla del móvil) mediante WebAuthn.
// Es una barrera para que nadie cotillee con tu móvil desbloqueado; los datos siguen en este dispositivo.
import { db, update } from './store.js';

const rand = (n) => crypto.getRandomValues(new Uint8Array(n));
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

export async function lockSupported() {
  try {
    return !!window.PublicKeyCredential && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
  } catch {
    return false;
  }
}

export async function enableLock() {
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: rand(32),
      rp: { name: 'Mi Día', id: location.hostname },
      user: { id: rand(16), name: 'mi-dia', displayName: 'Mi Día' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      timeout: 60000,
    },
  });
  update((d) => {
    d.settings.lock = true;
    d.settings.lockCredId = b64u(cred.rawId);
  });
}

export function disableLock() {
  update((d) => {
    d.settings.lock = false;
    d.settings.lockCredId = '';
  });
}

export const lockEnabled = () => !!(db().settings.lock && db().settings.lockCredId);

export async function verify() {
  await navigator.credentials.get({
    publicKey: {
      challenge: rand(32),
      allowCredentials: [{ type: 'public-key', id: unb64u(db().settings.lockCredId) }],
      userVerification: 'required',
      timeout: 60000,
    },
  });
}

let shown = false;
export function showLock() {
  if (shown || !db().settings.lock || !db().settings.lockCredId) return;
  shown = true;
  const el = document.createElement('div');
  el.className = 'lock-screen';
  el.innerHTML = `<span class="big">🔒</span><h2 style="margin:0">Mi Día está bloqueada</h2>
    <button class="btn primary" data-unlock style="min-width:220px">👆 Desbloquear con huella</button><p class="small muted" data-msg></p>`;
  document.body.appendChild(el);
  const tryUnlock = async () => {
    try {
      await verify();
      el.remove();
      shown = false;
    } catch {
      el.querySelector('[data-msg]').textContent = 'No se pudo verificar. Vuelve a intentarlo.';
    }
  };
  el.querySelector('[data-unlock]').onclick = tryUnlock;
  setTimeout(tryUnlock, 300);
}

// Bloquear al abrir y al volver a la app tras más de 1 minuto fuera
export function initLock() {
  showLock();
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') hiddenAt = Date.now();
    else if (hiddenAt && Date.now() - hiddenAt > 60_000) showLock();
  });
}
