// Service worker: guarda la app para que abra al instante y funcione sin conexión.
// Sube la versión cada vez que cambies archivos para que el móvil descargue la nueva.
const VERSION = 'mi-dia-v1';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './css/styles.css',
  './js/app.js', './js/store.js', './js/utils.js', './js/google.js',
  './js/modules/home.js', './js/modules/calendar.js', './js/modules/notes.js', './js/modules/sport.js',
  './js/modules/more.js', './js/modules/weather.js', './js/modules/bars.js', './js/modules/expenses.js',
  './js/modules/habits.js', './js/modules/shopping.js', './js/modules/birthdays.js', './js/modules/places.js',
  './js/modules/assistant.js', './js/modules/settings.js',
  './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Archivos propios: red primero (para recibir cambios) y caché si no hay conexión.
// Peticiones a otros dominios (tiempo, mapas, Google, Claude): siempre a la red.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('./index.html'))),
  );
});
