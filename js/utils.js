export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const pad = (n) => String(n).padStart(2, '0');

// Fechas como clave 'AAAA-MM-DD' en hora local
export const dkey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseKey = (k) => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
// Lunes como primer día de la semana
export const weekStart = (d = new Date()) => {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return addDays(x, -((x.getDay() + 6) % 7));
};

export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const DIAS_CORTOS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

export const fmtLong = (d) => d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
export const fmtShort = (d) => d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
export const fmtMoney = (n) => Number(n || 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
export const fmtTime = (d) => d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
export const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

let toastTimer;
export function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

// Hoja inferior reutilizable. Devuelve {el, close}.
export function sheet({ title, body, full = false, onClose }) {
  const back = document.createElement('div');
  back.className = 'sheet-backdrop';
  back.innerHTML = `
    <div class="sheet ${full ? 'full' : ''}" role="dialog" aria-modal="true">
      <div class="sheet-handle"></div>
      <div class="sheet-head"><h3>${esc(title)}</h3><button class="x-btn" data-close aria-label="Cerrar">✕</button></div>
      <div class="sheet-body">${body}</div>
    </div>`;
  const close = () => {
    back.remove();
    onClose?.();
  };
  back.addEventListener('click', (e) => {
    if (e.target === back || e.target.closest('[data-close]')) close();
  });
  document.body.appendChild(back);
  const first = back.querySelector('input:not([type=checkbox]):not([type=hidden]), textarea');
  if (first && !full) setTimeout(() => first.focus(), 50);
  return { el: back.querySelector('.sheet'), close };
}

export function confirmSheet(message, okLabel = 'Borrar') {
  return new Promise((resolve) => {
    let answered = false;
    const s = sheet({
      title: '¿Seguro?',
      body: `<p>${esc(message)}</p>
        <div class="row"><button class="btn grow" data-no>Cancelar</button><button class="btn primary grow" data-yes>${esc(okLabel)}</button></div>`,
      onClose: () => !answered && resolve(false),
    });
    s.el.querySelector('[data-no]').onclick = () => s.close();
    s.el.querySelector('[data-yes]').onclick = () => {
      answered = true;
      s.close();
      resolve(true);
    };
  });
}

// Ubicación con caché de 10 minutos
export function getPosition({ force = false } = {}) {
  try {
    const cached = JSON.parse(sessionStorage.getItem('midia-pos') || 'null');
    if (!force && cached && Date.now() - cached.t < 10 * 60 * 1000) return Promise.resolve(cached);
  } catch {}
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Este navegador no permite ubicación'));
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const pos = { lat: p.coords.latitude, lon: p.coords.longitude, t: Date.now() };
        try { sessionStorage.setItem('midia-pos', JSON.stringify(pos)); } catch {}
        resolve(pos);
      },
      (err) => reject(new Error(err.code === 1 ? 'Permiso de ubicación denegado' : 'No se pudo obtener la ubicación')),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 5 * 60 * 1000 },
    );
  });
}

export function distance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
export const fmtDist = (m) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);

const loaded = {};
export function loadScript(src) {
  return (loaded[src] ??= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = res;
    s.onerror = () => {
      delete loaded[src];
      rej(new Error('No se pudo cargar ' + src));
    };
    document.head.appendChild(s);
  }));
}
export function loadCss(href) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = href;
  document.head.appendChild(l);
}

export const mapsLink = (lat, lon) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;

export function download(filename, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
