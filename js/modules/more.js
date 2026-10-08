const GROUPS = [
  ['Organización', [
    ['hoy', '🎯', 'Modo Hoy'],
    ['recordatorios', '⏰', 'Recordatorios'],
    ['tareas', '✔️', 'Tareas'],
    ['vencimientos', '📌', 'Vencimientos'],
    ['compra', '🛒', 'Compra'],
    ['cumples', '🎂', 'Cumpleaños'],
    ['notasvoz', '🎙️', 'Notas de voz'],
    ['diario', '📔', 'Diario'],
    ['datos', '🔐', 'Datos útiles'],
    ['asistente', '🤖', 'Asistente'],
  ]],
  ['Dinero', [
    ['gastos', '💶', 'Finanzas'],
    ['compartidos', '👥', 'Compartidos'],
    ['informes', '📊', 'Informes'],
  ]],
  ['Salud', [
    ['gimnasio', '🏋️', 'Gimnasio'],
    ['salud', '❤️', 'Salud'],
    ['habitos', '✅', 'Hábitos'],
    ['retos', '🏆', 'Retos'],
  ]],
  ['Casa y coche', [
    ['cuidados', '🌱', 'Cuidados'],
    ['coche', '🚗', 'Coche'],
    ['cocina', '🍳', 'Cocina'],
  ]],
  ['Ocio y salir', [
    ['tiempo', '🌤️', 'Tiempo'],
    ['bares', '🍺', 'Cerca de mí'],
    ['lugares', '⭐', 'Mis lugares'],
    ['planes', '🎉', 'Planes finde'],
    ['ocio', '🎬', 'Pelis y libros'],
    ['viajes', '✈️', 'Viajes'],
  ]],
  ['', [['ajustes', '⚙️', 'Ajustes']]],
];

export default {
  title: 'Más',
  render(view) {
    view.innerHTML = GROUPS.map(([title, tiles]) => `
      ${title ? `<div class="tiles-title">${title}</div>` : '<div style="height:16px"></div>'}
      <div class="tiles">${tiles.map(([r, e, n]) => `<a class="tile" href="#/${r}"><span>${e}</span>${n}</a>`).join('')}</div>`).join('');
  },
};
