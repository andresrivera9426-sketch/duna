// Conversor de unidades (sin internet)
import { h } from '../../../shared/ui.js';
const U = {
  Longitud: { m: 1, km: 1000, cm: .01, mm: .001, mi: 1609.344, yd: .9144, ft: .3048, in: .0254 },
  Peso: { kg: 1, g: .001, lb: .45359237, oz: .028349523, arroba: 12.5, t: 1000 },
  Volumen: { L: 1, mL: .001, galón: 3.785411784, 'm³': 1000, taza: .24 },
  Área: { 'm²': 1, 'km²': 1e6, hectárea: 1e4, fanegada: 6400, 'ft²': .09290304, acre: 4046.8564 },
  Velocidad: { 'km/h': 1, 'm/s': 3.6, mph: 1.609344, nudo: 1.852 },
  Temperatura: { '°C': 'c', '°F': 'f', K: 'k' },
  Datos: { MB: 1, GB: 1024, KB: 1 / 1024, TB: 1048576 },
};
const temp = (v, a, b) => { const c = a === 'c' ? v : a === 'f' ? (v - 32) * 5 / 9 : v - 273.15; return b === 'c' ? c : b === 'f' ? c * 9 / 5 + 32 : c + 273.15; };
export function mount(ctx) {
  const kind = h('select', { 'aria-label': 'Tipo' }, Object.keys(U).map(k => h('option', { value: k }, k)));
  const val = h('input', { type: 'number', inputmode: 'decimal', value: '1', 'aria-label': 'Valor' }), a = h('select', { 'aria-label': 'De' }), b = h('select', { 'aria-label': 'A' }), out = h('div', { class: 'fx-res' });
  const calc = () => { const t = U[kind.value], v = +val.value || 0; const r = kind.value === 'Temperatura' ? temp(v, t[a.value], t[b.value]) : v * t[a.value] / t[b.value]; out.innerHTML = ''; out.append(h('b', null, `${r.toLocaleString('es-CO', { maximumFractionDigits: 6 })} ${b.value}`), h('small', null, `${v.toLocaleString('es-CO')} ${a.value}`)); };
  const fill = () => { const ks = Object.keys(U[kind.value]); [a, b].forEach((s, i) => { s.innerHTML = ''; ks.forEach(k => s.append(h('option', { value: k }, k))); s.value = ks[Math.min(i, ks.length - 1)]; }); calc(); };
  kind.onchange = fill; [val, a, b].forEach(e => e.addEventListener('input', calc));
  ctx.body.append(h('div', { class: 'ap' }, h('div', { class: 'fx-form' }, kind), h('div', { class: 'fx-form' }, val, a, h('button', { class: 'btn ghost sm', onclick: () => { const x = a.value; a.value = b.value; b.value = x; calc(); } }, '⇅'), b), out));
  fill();
}
