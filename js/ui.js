// Piezas de interfaz reutilizables: gráficas SVG, estrellas e imágenes.
import { esc } from './utils.js';

// ---------- Imágenes: reducir una foto antes de enviarla a Claude ----------
export function imageToBase64(file, maxDim = 1568, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', quality).split(',')[1]);
    };
    img.onerror = () => reject(new Error('No se pudo leer la imagen'));
    img.src = url;
  });
}

// ---------- Gráficas (una serie = sin leyenda; dos series = leyenda) ----------
const W = 340;
const fmtNum = (n) => (Math.abs(n) >= 1000 ? Math.round(n).toLocaleString('es-ES') : Number(n.toFixed(1)).toLocaleString('es-ES'));

function niceScale(min, max) {
  if (min === max) { min -= 1; max += 1; }
  const pad = (max - min) * 0.1;
  return [min - pad, max + pad];
}

// points: [{label, y, tip}]. Toca un punto para ver su valor.
export function lineChart(points, { height = 150, unit = '' } = {}) {
  if (points.length < 2) return '<div class="muted small" style="padding:12px 0">Añade al menos dos registros para ver la gráfica.</div>';
  const ys = points.map((p) => p.y);
  const [lo, hi] = niceScale(Math.min(...ys), Math.max(...ys));
  const L = 40, R = 10, T = 10, B = 22;
  const x = (i) => L + (i * (W - L - R)) / (points.length - 1);
  const y = (v) => T + ((hi - v) * (height - T - B)) / (hi - lo);
  const grid = [lo + (hi - lo) * 0.1, (lo + hi) / 2, hi - (hi - lo) * 0.1]
    .map((v) => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="viz-grid"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" class="viz-axis">${fmtNum(v)}</text>`)
    .join('');
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.y).toFixed(1)}`).join('');
  const dots = points
    .map((p, i) => `<circle cx="${x(i)}" cy="${y(p.y)}" r="${points.length > 30 ? 0 : 4}" class="viz-dot"/>
      <circle cx="${x(i)}" cy="${y(p.y)}" r="14" fill="transparent" data-tip="${esc(p.tip || `${p.label}: ${fmtNum(p.y)}${unit}`)}"/>`)
    .join('');
  return `<div class="viz"><svg viewBox="0 0 ${W} ${height}" width="100%" role="img" aria-label="Gráfica de evolución">
    ${grid}<path d="${path}" class="viz-line"/>${dots}
    <text x="${L}" y="${height - 6}" class="viz-axis">${esc(points[0].label)}</text>
    <text x="${W - R}" y="${height - 6}" text-anchor="end" class="viz-axis">${esc(points.at(-1).label)}</text>
  </svg><div class="viz-tip" hidden></div></div>`;
}

// Barras agrupadas de dos series (p. ej. ingresos y gastos por mes)
export function pairBarChart(groups, { aName, bName, height = 170, unit = ' €' }) {
  const max = Math.max(1, ...groups.flatMap((g) => [g.a, g.b]));
  const L = 8, R = 8, T = 10, B = 22;
  const gw = (W - L - R) / groups.length;
  const bw = Math.min(18, (gw - 10) / 2);
  const h = (v) => (v / max) * (height - T - B);
  const bar = (bx, v, cls, tip) => {
    const bh = h(v);
    const by = height - B - bh;
    const r = Math.min(4, bh);
    const d = bh <= 0 ? '' : `M${bx},${height - B} V${by + r} Q${bx},${by} ${bx + r},${by} H${bx + bw - r} Q${bx + bw},${by} ${bx + bw},${by + r} V${height - B} Z`;
    return `<path d="${d}" class="${cls}"/><rect x="${bx - 2}" y="${T}" width="${bw + 4}" height="${height - T - B}" fill="transparent" data-tip="${esc(tip)}"/>`;
  };
  const bars = groups
    .map((g, i) => {
      const cx = L + gw * i + gw / 2;
      return bar(cx - bw - 1, g.a, 'viz-s1', `${g.label} · ${aName}: ${fmtNum(g.a)}${unit}`) +
        bar(cx + 1, g.b, 'viz-s2', `${g.label} · ${bName}: ${fmtNum(g.b)}${unit}`) +
        `<text x="${cx}" y="${height - 6}" text-anchor="middle" class="viz-axis">${esc(g.label)}</text>`;
    })
    .join('');
  return `<div class="viz">
    <div class="viz-legend"><span><i class="viz-s1"></i>${esc(aName)}</span><span><i class="viz-s2"></i>${esc(bName)}</span></div>
    <svg viewBox="0 0 ${W} ${height}" width="100%" role="img" aria-label="${esc(aName)} y ${esc(bName)} por mes">
      <line x1="${L}" x2="${W - R}" y1="${height - B}" y2="${height - B}" class="viz-grid"/>${bars}
    </svg><div class="viz-tip" hidden></div></div>`;
}

// Activa los tooltips (al tocar o pasar el ratón) de las gráficas dentro de root
export function bindCharts(root) {
  root.querySelectorAll('.viz').forEach((viz) => {
    const tip = viz.querySelector('.viz-tip');
    const show = (el) => {
      tip.textContent = el.dataset.tip;
      tip.hidden = false;
      const vr = viz.getBoundingClientRect();
      const er = el.getBoundingClientRect();
      tip.style.left = `${Math.max(0, Math.min(vr.width - tip.offsetWidth, er.left - vr.left + er.width / 2 - tip.offsetWidth / 2))}px`;
      tip.style.top = `${Math.max(0, er.top - vr.top - 34)}px`;
    };
    viz.querySelectorAll('[data-tip]').forEach((el) => {
      el.addEventListener('pointerenter', () => show(el));
      el.addEventListener('click', () => show(el));
    });
    viz.addEventListener('pointerleave', () => (tip.hidden = true));
  });
}

// ---------- Valoración con estrellas ----------
export const starsHtml = (n = 0) =>
  `<div class="stars" data-stars data-value="${n}">${[1, 2, 3, 4, 5].map((i) => `<button type="button" data-s="${i}" class="${i <= n ? 'on' : ''}" aria-label="${i} estrellas">★</button>`).join('')}</div>`;
export function bindStars(root) {
  root.querySelectorAll('[data-stars]').forEach((box) => {
    box.querySelectorAll('[data-s]').forEach((b) => {
      b.onclick = () => {
        const v = +b.dataset.s === +box.dataset.value ? 0 : +b.dataset.s;
        box.dataset.value = v;
        box.querySelectorAll('[data-s]').forEach((x) => x.classList.toggle('on', +x.dataset.s <= v));
      };
    });
  });
}
export const starsText = (n) => (n ? '★'.repeat(n) + '☆'.repeat(5 - n) : '');

// Pestañas sencillas: tabsHtml(lista, activa) + bindTabs(root, onChange)
export const tabsHtml = (tabs, active) =>
  `<div class="tabs">${tabs.map(([id, label]) => `<button data-tab="${id}" class="${id === active ? 'active' : ''}">${label}</button>`).join('')}</div>`;
export function bindTabs(root, onChange) {
  root.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => onChange(b.dataset.tab)));
}
