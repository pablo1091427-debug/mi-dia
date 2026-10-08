const TILES = [
  ['tiempo', '🌤️', 'Tiempo'],
  ['bares', '🍺', 'Cerca de mí'],
  ['gastos', '💶', 'Gastos'],
  ['habitos', '✅', 'Hábitos'],
  ['compra', '🛒', 'Compra'],
  ['cumples', '🎂', 'Cumpleaños'],
  ['lugares', '⭐', 'Mis lugares'],
  ['asistente', '🤖', 'Asistente'],
  ['ajustes', '⚙️', 'Ajustes'],
];

export default {
  title: 'Más',
  render(view) {
    view.innerHTML = `<div class="tiles">${TILES.map(([r, e, n]) => `<a class="tile" href="#/${r}"><span>${e}</span>${n}</a>`).join('')}</div>`;
  },
};
