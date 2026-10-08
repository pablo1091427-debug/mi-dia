import { esc, getPosition, fmtShort, cap } from '../utils.js';

// Códigos WMO de Open-Meteo
const CODES = {
  0: ['☀️', 'Despejado'], 1: ['🌤️', 'Casi despejado'], 2: ['⛅', 'Parcialmente nuboso'], 3: ['☁️', 'Nublado'],
  45: ['🌫️', 'Niebla'], 48: ['🌫️', 'Niebla con escarcha'],
  51: ['🌦️', 'Llovizna débil'], 53: ['🌦️', 'Llovizna'], 55: ['🌧️', 'Llovizna intensa'],
  56: ['🌧️', 'Llovizna helada'], 57: ['🌧️', 'Llovizna helada'],
  61: ['🌦️', 'Lluvia débil'], 63: ['🌧️', 'Lluvia'], 65: ['🌧️', 'Lluvia fuerte'],
  66: ['🌧️', 'Lluvia helada'], 67: ['🌧️', 'Lluvia helada'],
  71: ['🌨️', 'Nieve débil'], 73: ['🌨️', 'Nieve'], 75: ['❄️', 'Nieve fuerte'], 77: ['🌨️', 'Granizo fino'],
  80: ['🌦️', 'Chubascos'], 81: ['🌧️', 'Chubascos'], 82: ['⛈️', 'Chubascos fuertes'],
  85: ['🌨️', 'Chubascos de nieve'], 86: ['🌨️', 'Chubascos de nieve'],
  95: ['⛈️', 'Tormenta'], 96: ['⛈️', 'Tormenta con granizo'], 99: ['⛈️', 'Tormenta con granizo'],
};
export const wInfo = (code, isDay = 1) => {
  const [e, t] = CODES[code] || ['🌡️', '—'];
  return { e: !isDay && code <= 1 ? '🌙' : e, t };
};

const CACHE_KEY = 'midia-weather';

export async function fetchWeather({ force = false } = {}) {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (!force && c && Date.now() - c.t < 30 * 60 * 1000) return c;
  } catch {}
  const pos = await getPosition({ force });
  const params = new URLSearchParams({
    latitude: pos.lat.toFixed(4), longitude: pos.lon.toFixed(4), timezone: 'auto', forecast_days: '7',
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day,precipitation',
    hourly: 'temperature_2m,precipitation_probability,weather_code,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset,uv_index_max',
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!res.ok) throw new Error('No se pudo obtener el tiempo');
  const w = await res.json();
  let place = '';
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=12&accept-language=es&lat=${pos.lat}&lon=${pos.lon}`);
    const j = await r.json();
    const a = j.address || {};
    place = a.city || a.town || a.village || a.suburb || a.municipality || '';
  } catch {}
  const data = { t: Date.now(), w, place, pos };
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch {}
  return data;
}

export function cachedWeather() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch { return null; }
}

const hhmm = (iso) => iso.slice(11, 16);

export default {
  title: 'Tiempo',
  render(view) {
    view.innerHTML = '<div class="empty"><span class="big">⏳</span>Buscando tu ubicación…</div>';
    const load = async (force) => {
      try {
        const { w, place, t } = await fetchWeather({ force });
        const c = w.current;
        const now = wInfo(c.weather_code, c.is_day);
        const nowIdx = Math.max(0, w.hourly.time.findIndex((x) => x >= c.time.slice(0, 13)));
        const hours = w.hourly.time.slice(nowIdx, nowIdx + 24).map((time, i) => {
          const j = nowIdx + i;
          const hi = wInfo(w.hourly.weather_code[j], w.hourly.is_day[j]);
          const p = w.hourly.precipitation_probability[j];
          return `<div class="hour">${hhmm(time)}<span class="e">${hi.e}</span><b>${Math.round(w.hourly.temperature_2m[j])}°</b>${p ? `<div class="small" style="color:#3b82f6">${p}%</div>` : ''}</div>`;
        });
        const days = w.daily.time.map((day, i) => {
          const di = wInfo(w.daily.weather_code[i]);
          const label = i === 0 ? 'Hoy' : cap(fmtShort(new Date(day + 'T12:00')).split(',')[0]);
          return `<div class="day-row"><b>${label}</b><span style="font-size:22px">${di.e}</span>
            <span class="small muted">${di.t}${w.daily.precipitation_probability_max[i] ? ` · 💧${w.daily.precipitation_probability_max[i]}%` : ''}</span>
            <span class="right"><b>${Math.round(w.daily.temperature_2m_max[i])}°</b> <span class="muted">${Math.round(w.daily.temperature_2m_min[i])}°</span></span></div>`;
        });
        view.innerHTML = `
          <div class="card">
            <div class="row"><span class="muted">📍 ${esc(place || 'Tu ubicación')}</span><button class="btn small right" data-refresh>↻ Actualizar</button></div>
            <div class="weather-now" style="margin-top:10px">
              <span class="big">${now.e}</span>
              <div><div class="temp">${Math.round(c.temperature_2m)}°</div><div>${now.t}</div></div>
            </div>
            <div class="row wrap small muted" style="margin-top:10px;gap:14px">
              <span>Sensación ${Math.round(c.apparent_temperature)}°</span>
              <span>💧 ${c.relative_humidity_2m}%</span>
              <span>💨 ${Math.round(c.wind_speed_10m)} km/h</span>
              <span>🌅 ${hhmm(w.daily.sunrise[0])}</span><span>🌇 ${hhmm(w.daily.sunset[0])}</span>
              <span>UV ${Math.round(w.daily.uv_index_max[0] ?? 0)}</span>
            </div>
          </div>
          <div class="card"><h2>Próximas 24 horas</h2><div class="hours">${hours.join('')}</div></div>
          <div class="card"><h2>7 días</h2>${days.join('')}</div>
          <p class="small muted" style="text-align:center">Actualizado a las ${new Date(t).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} · Datos: Open-Meteo</p>`;
        view.querySelector('[data-refresh]').onclick = () => {
          view.querySelector('[data-refresh]').textContent = '…';
          load(true);
        };
      } catch (e) {
        view.innerHTML = `<div class="empty"><span class="big">📍</span>${esc(e.message)}<br><br>
          <button class="btn primary" data-retry>Reintentar</button>
          <p class="small">Si lo denegaste, activa el permiso de ubicación para esta app en los ajustes del navegador.</p></div>`;
        view.querySelector('[data-retry]').onclick = () => load(true);
      }
    };
    load(false);
  },
};
