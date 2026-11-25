// Clima con Open-Meteo (gratis, sin llave). Ubicación del teléfono o ciudades guardadas en este dispositivo.
import { h, icon, btn, toast, debounce } from '../../../shared/ui.js';
import { local } from '../../../shared/kit.js';
const WMO = { 0: ['☀️', 'Despejado'], 1: ['🌤️', 'Mayormente despejado'], 2: ['⛅', 'Parcialmente nublado'], 3: ['☁️', 'Nublado'], 45: ['🌫️', 'Niebla'], 48: ['🌫️', 'Niebla'], 51: ['🌦️', 'Llovizna'], 53: ['🌦️', 'Llovizna'], 55: ['🌧️', 'Llovizna fuerte'],
  61: ['🌧️', 'Lluvia ligera'], 63: ['🌧️', 'Lluvia'], 65: ['🌧️', 'Lluvia fuerte'], 66: ['🌧️', 'Lluvia helada'], 67: ['🌧️', 'Lluvia helada'], 71: ['🌨️', 'Nieve'], 73: ['🌨️', 'Nieve'], 75: ['🌨️', 'Nieve'], 80: ['🌦️', 'Chubascos'], 81: ['🌧️', 'Chubascos'], 82: ['⛈️', 'Chubascos fuertes'], 95: ['⛈️', 'Tormenta'], 96: ['⛈️', 'Tormenta con granizo'], 99: ['⛈️', 'Tormenta con granizo'] };
const w = c => WMO[c] || ['🌡️', ''];
const DEF = { name: 'Bogotá', lat: 4.711, lon: -74.0721 };
export async function mount(ctx) {
  const out = h('div', { class: 'ap-out' });
  const cities = () => local.get('clima-cities', [DEF]);
  const results = h('div', { class: 'ap-res' });
  const input = h('input', { type: 'search', placeholder: 'Buscar ciudad o municipio', 'aria-label': 'Buscar ciudad', oninput: debounce(async e => {
    const q = e.target.value.trim(); results.innerHTML = ''; if (q.length < 2) return;
    try { const j = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=es`)).json();
      for (const r of j.results || []) results.append(h('button', { class: 'ap-pick', onclick: () => { const c = { name: r.name + (r.admin1 ? ', ' + r.admin1 : ''), lat: r.latitude, lon: r.longitude }; local.set('clima-cities', [c, ...cities().filter(x => x.name !== c.name)].slice(0, 6)); input.value = ''; results.innerHTML = ''; tabs(); show(c); } }, `${r.name}${r.admin1 ? ', ' + r.admin1 : ''} · ${r.country || ''}`)); } catch { results.append(h('p', { class: 'muted' }, 'Sin conexión')); }
  }, 350) });
  const bar = h('div', { class: 'chips' });
  const tabs = () => { bar.innerHTML = ''; bar.append(h('button', { class: 'chip', onclick: here }, '📍 Mi ubicación'), ...cities().map(c => h('button', { class: 'chip', onclick: () => show(c) }, c.name.split(',')[0]))); };
  async function here() {
    if (!navigator.geolocation) return toast('Este dispositivo no comparte ubicación');
    out.innerHTML = ''; out.append(h('div', { class: 'spinner' }));
    navigator.geolocation.getCurrentPosition(p => show({ name: 'Mi ubicación', lat: p.coords.latitude, lon: p.coords.longitude }), () => { toast('Sin permiso de ubicación'); show(cities()[0]); }, { timeout: 10000, maximumAge: 600000 });
  }
  async function show(c) {
    out.innerHTML = ''; out.append(h('div', { class: 'spinner' }));
    try {
      const j = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lon}&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,precipitation&hourly=temperature_2m,weather_code,precipitation_probability&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max&timezone=auto&forecast_days=7`)).json();
      const cur = j.current, [em, txt] = w(cur.weather_code); out.innerHTML = '';
      const now = j.hourly.time.findIndex(t => t >= cur.time.slice(0, 13));
      out.append(h('div', { class: 'wx-now' }, h('div', { class: 'wx-big' }, em), h('div', null, h('small', null, c.name), h('b', { class: 'wx-t' }, Math.round(cur.temperature_2m) + '°'), h('div', null, txt), h('small', null, `Sensación ${Math.round(cur.apparent_temperature)}° · Humedad ${cur.relative_humidity_2m}% · Viento ${Math.round(cur.wind_speed_10m)} km/h`))),
        h('h4', { class: 'sec-t' }, 'Próximas horas'), h('div', { class: 'wx-hours' }, j.hourly.time.slice(Math.max(0, now), Math.max(0, now) + 12).map((t, k) => { const i = Math.max(0, now) + k; return h('div', { class: 'wx-h' }, h('small', null, t.slice(11, 16)), h('span', null, w(j.hourly.weather_code[i])[0]), h('b', null, Math.round(j.hourly.temperature_2m[i]) + '°'), h('small', null, (j.hourly.precipitation_probability[i] ?? 0) + '%')); })),
        h('h4', { class: 'sec-t' }, '7 días'), h('div', { class: 'wx-days' }, j.daily.time.map((d, i) => h('div', { class: 'wx-d' }, h('span', null, i === 0 ? 'Hoy' : new Date(d + 'T12:00').toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric' })), h('span', null, w(j.daily.weather_code[i])[0]), h('small', null, '💧' + (j.daily.precipitation_probability_max[i] ?? 0) + '%'), h('b', null, Math.round(j.daily.temperature_2m_min[i]) + '° / ' + Math.round(j.daily.temperature_2m_max[i]) + '°')))),
        h('p', { class: 'fine center' }, 'Datos: Open-Meteo.com (CC BY 4.0)'));
    } catch { out.innerHTML = ''; out.append(h('p', { class: 'muted center' }, 'No se pudo cargar el clima. Revisa tu conexión.')); }
  }
  ctx.body.append(h('div', { class: 'ap' }, h('div', { class: 'searchbar' }, icon('search', 18), input), results, bar, out));
  tabs(); show(cities()[0]);
}
