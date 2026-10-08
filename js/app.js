import { db } from './store.js';
import { $, $$ } from './utils.js';
import home from './modules/home.js';
import calendar from './modules/calendar.js';
import notes from './modules/notes.js';
import sport from './modules/sport.js';
import more from './modules/more.js';
import weather from './modules/weather.js';
import bars from './modules/bars.js';
import expenses from './modules/expenses.js';
import habits from './modules/habits.js';
import shopping from './modules/shopping.js';
import birthdays from './modules/birthdays.js';
import places from './modules/places.js';
import assistant from './modules/assistant.js';
import settings from './modules/settings.js';
import reminders, { checkReminders } from './modules/reminders.js';

// Pestañas principales (barra inferior) y módulos secundarios (desde "Más")
const TABS = ['inicio', 'calendario', 'notas', 'deporte', 'mas'];
const routes = {
  inicio: home, calendario: calendar, notas: notes, deporte: sport, mas: more,
  tiempo: weather, bares: bars, gastos: expenses, habitos: habits, compra: shopping,
  cumples: birthdays, lugares: places, asistente: assistant, ajustes: settings, recordatorios: reminders,
};

let cleanup = null;
let current = null;

export function applyTheme() {
  const t = db().settings.theme;
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
}

function currentRoute() {
  const name = location.hash.replace(/^#\/?/, '').split('?')[0];
  return routes[name] ? name : 'inicio';
}

export function go(name) {
  location.hash = '#/' + name;
}

function render() {
  const name = currentRoute();
  const mod = routes[name];
  const view = $('#view');
  if (typeof cleanup === 'function') cleanup();
  cleanup = null;
  if (current !== name) window.scrollTo(0, 0);
  current = name;

  $('#page-title').textContent = mod.title;
  document.title = name === 'inicio' ? 'Mi Día' : `${mod.title} · Mi Día`;
  const isTab = TABS.includes(name);
  $('#back-btn').hidden = isTab;
  $('#settings-btn').hidden = name === 'ajustes';
  const activeTab = isTab ? name : 'mas';
  $$('#bottom-nav a').forEach((a) => a.classList.toggle('active', a.dataset.route === activeTab));

  view.innerHTML = '';
  cleanup = mod.render(view, { rerender: render, go }) || null;

  // Accesos directos del icono (#/notas?nuevo=1): abrir directamente el formulario
  if (/[?&]nuevo=1/.test(location.hash) && mod.quickAdd) {
    history.replaceState(null, '', '#/' + name);
    mod.quickAdd(render, view);
  }
}

$('#back-btn').addEventListener('click', () => {
  if (history.length > 1) history.back();
  else go('mas');
});
$('#settings-btn').addEventListener('click', () => go('ajustes'));
window.addEventListener('hashchange', render);

applyTheme();
render();

// Revisar recordatorios al abrir, cada 30 s y al volver a la app
checkReminders();
setInterval(checkReminders, 30_000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    checkReminders();
    if (current === 'inicio') render();
  }
});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW no registrado', e));
}
