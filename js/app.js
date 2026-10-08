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
import tasks from './modules/tasks.js';
import deadlines from './modules/deadlines.js';
import gym from './modules/gym.js';
import health from './modules/health.js';
import trips from './modules/trips.js';
import media from './modules/media.js';
import plans from './modules/plans.js';
import recipes from './modules/recipes.js';
import split from './modules/split.js';
import voice from './modules/voice.js';
import car from './modules/car.js';
import cares from './modules/cares.js';
import diary from './modules/diary.js';
import reports, { maybeMonthlyReport } from './modules/reports.js';
import today from './modules/today.js';
import challenges from './modules/challenges.js';
import vault from './modules/vault.js';
import profile from './modules/profile.js';
import news from './modules/news.js';
import { initLock } from './lock.js';
import { autoBackup } from './backup.js';
import { initSync } from './sync.js';
import { icon } from './icons.js';

// Pestañas principales (barra inferior) y módulos secundarios (desde "Más")
const TABS = ['inicio', 'calendario', 'notas', 'deporte', 'mas'];
const routes = {
  inicio: home, calendario: calendar, notas: notes, deporte: sport, mas: more,
  tiempo: weather, bares: bars, gastos: expenses, habitos: habits, compra: shopping,
  cumples: birthdays, lugares: places, asistente: assistant, ajustes: settings, recordatorios: reminders,
  finanzas: expenses, tareas: tasks, vencimientos: deadlines, gimnasio: gym, salud: health, viajes: trips,
  ocio: media, planes: plans, cocina: recipes,
  compartidos: split, notasvoz: voice, coche: car, cuidados: cares, diario: diary, informes: reports, hoy: today, retos: challenges, datos: vault,
  perfil: profile, noticias: news,
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
  document.body.classList.toggle('focus-mode', !!mod.focus);

  view.innerHTML = '';
  cleanup = mod.render(view, { rerender: render, go }) || null;

  // Accesos directos del icono (#/notas?nuevo=1): abrir directamente el formulario
  if (/[?&]nuevo=1/.test(location.hash) && mod.quickAdd) {
    history.replaceState(null, '', '#/' + name);
    mod.quickAdd(render, view);
  }
}

// Iconos de la navegación
$$('[data-i]').forEach((el) => (el.innerHTML = icon(el.dataset.i)));

// Detalle visual: el emoji del principio de cada título va dentro de una pastilla
const EMOJI = /^\s*((?:\p{Extended_Pictographic}|\p{Regional_Indicator})(?:️|‍(?:\p{Extended_Pictographic})|[\u{1F3FB}-\u{1F3FF}])*)\s*/u;
function decorate(root) {
  root.querySelectorAll?.('.card > h2, .sheet-head h3, .section-title').forEach((h) => {
    if (h.dataset.deco) return;
    h.dataset.deco = '1';
    const first = h.firstChild;
    if (first?.nodeType !== 3) return;
    const m = first.textContent.match(EMOJI);
    if (!m) return;
    first.textContent = first.textContent.slice(m[0].length);
    const span = document.createElement('span');
    span.className = 'h-ico';
    span.textContent = m[1];
    h.insertBefore(span, first);
  });
}
new MutationObserver((list) => list.forEach((r) => r.addedNodes.forEach((n) => n.nodeType === 1 && decorate(n.parentNode || n)))).observe(document.body, { childList: true, subtree: true });

$('#back-btn').addEventListener('click', () => {
  if (history.length > 1) history.back();
  else go('mas');
});
$('#settings-btn').addEventListener('click', () => go('ajustes'));
window.addEventListener('hashchange', render);

applyTheme();
initLock();
render();
autoBackup();
initSync();
maybeMonthlyReport().catch(() => {});

// Llegan cambios de otro dispositivo: refrescar la pantalla si no estás rellenando un formulario
window.addEventListener('midia:synced', () => {
  const typing = document.activeElement?.matches?.('input, textarea, select');
  if (!document.querySelector('.sheet-backdrop') && !typing) render();
});

// Revisar recordatorios al abrir, cada 30 s y al volver a la app
checkReminders();
setInterval(checkReminders, 30_000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    checkReminders();
    autoBackup();
    if (current === 'inicio') render();
  }
});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW no registrado', e));
}
