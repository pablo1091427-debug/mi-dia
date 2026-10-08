// Service worker: guarda la app para que abra al instante y funcione sin conexión.
// Sube la versión cada vez que cambies archivos para que el móvil descargue la nueva.
const VERSION = 'mi-dia-v6';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './css/styles.css',
  './js/app.js', './js/store.js', './js/utils.js', './js/google.js',
  './js/ui.js', './js/icons.js', './fonts/jakarta.woff2', './js/ai.js', './js/lock.js', './js/backup.js', './js/sync.js',
  './js/modules/bankimport.js', './js/modules/split.js', './js/modules/voice.js', './js/modules/car.js',
  './js/modules/cares.js', './js/modules/diary.js', './js/modules/reports.js', './js/modules/today.js', './js/modules/challenges.js', './js/modules/vault.js',
  './js/modules/tasks.js', './js/modules/deadlines.js', './js/modules/gym.js', './js/modules/health.js',
  './js/modules/trips.js', './js/modules/media.js', './js/modules/plans.js', './js/modules/recipes.js',
  './js/modules/home.js', './js/modules/calendar.js', './js/modules/notes.js', './js/modules/sport.js',
  './js/modules/more.js', './js/modules/weather.js', './js/modules/bars.js', './js/modules/expenses.js',
  './js/modules/habits.js', './js/modules/shopping.js', './js/modules/birthdays.js', './js/modules/places.js',
  './js/modules/assistant.js', './js/modules/settings.js', './js/modules/reminders.js',
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

// Al tocar una notificación, abrir (o enfocar) la app en Recordatorios
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const win = list.find((c) => c.url.startsWith(self.registration.scope));
      if (win) return win.focus().then((w) => w.navigate(self.registration.scope + '#/recordatorios'));
      return self.clients.openWindow('./#/recordatorios');
    }),
  );
});
