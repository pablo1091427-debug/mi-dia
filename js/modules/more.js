import { icon } from '../icons.js';

// [título, color de la sección, [[ruta, icono, nombre], …]]
const GROUPS = [
  ['Organización', 'org', [
    ['hoy', 'today', 'Modo Hoy'],
    ['recordatorios', 'reminders', 'Recordatorios'],
    ['tareas', 'tasks', 'Tareas'],
    ['vencimientos', 'deadlines', 'Vencimientos'],
    ['compra', 'shopping', 'Compra'],
    ['cumples', 'birthdays', 'Cumpleaños'],
    ['notasvoz', 'voice', 'Notas de voz'],
    ['diario', 'diary', 'Diario'],
    ['datos', 'vault', 'Datos útiles'],
    ['asistente', 'assistant', 'Asistente'],
  ]],
  ['Dinero', 'money', [
    ['gastos', 'finance', 'Finanzas'],
    ['compartidos', 'split', 'Compartidos'],
    ['informes', 'reports', 'Informes'],
  ]],
  ['Salud', 'health', [
    ['gimnasio', 'gym', 'Gimnasio'],
    ['salud', 'health', 'Salud'],
    ['habitos', 'habits', 'Hábitos'],
    ['retos', 'challenges', 'Retos'],
  ]],
  ['Casa y coche', 'home', [
    ['cuidados', 'cares', 'Cuidados'],
    ['coche', 'car', 'Coche'],
    ['cocina', 'kitchen', 'Cocina'],
  ]],
  ['Ocio y salir', 'fun', [
    ['tiempo', 'weather', 'Tiempo'],
    ['bares', 'nearby', 'Cerca de mí'],
    ['lugares', 'places', 'Mis lugares'],
    ['planes', 'plans', 'Planes finde'],
    ['ocio', 'media', 'Pelis y libros'],
    ['viajes', 'trips', 'Viajes'],
  ]],
  ['Sistema', 'sys', [['ajustes', 'settings', 'Ajustes']]],
];

export default {
  title: 'Más',
  render(view) {
    view.innerHTML = GROUPS.map(([title, tint, tiles]) => `
      <div class="tiles-title">${title}</div>
      <div class="tiles" data-tint="${tint}">${tiles.map(([r, i, n]) => `<a class="tile" href="#/${r}"><span>${icon(i, 22)}</span>${n}</a>`).join('')}</div>`).join('');
  },
};
