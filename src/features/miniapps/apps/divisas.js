// TRM oficial (Superintendencia Financiera, publicada en datos.gov.co) y conversor de monedas (open.er-api.com, gratis).
import { h } from '../../../shared/ui.js';
const CUR = [['COP', 'Peso colombiano'], ['USD', 'Dólar'], ['EUR', 'Euro'], ['MXN', 'Peso mexicano'], ['BRL', 'Real'], ['PEN', 'Sol'], ['CLP', 'Peso chileno'], ['ARS', 'Peso argentino'], ['GBP', 'Libra'], ['CAD', 'Dólar canadiense'], ['JPY', 'Yen'], ['CNY', 'Yuan'], ['VES', 'Bolívar']];
const fmt = (n, c) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: c, maximumFractionDigits: c === 'COP' || c === 'CLP' || c === 'JPY' ? 0 : 2 }).format(n);
export async function mount(ctx) {
  const trmBox = h('div', { class: 'fx-trm' }, h('div', { class: 'spinner' }));
  const amt = h('input', { type: 'number', inputmode: 'decimal', value: '100', min: 0, 'aria-label': 'Cantidad' });
  const sel = v => h('select', { 'aria-label': 'Moneda' }, CUR.map(([c, n]) => h('option', { value: c, selected: c === v ? true : null }, `${c} · ${n}`)));
  const from = sel('USD'), to = sel('COP'); const res = h('div', { class: 'fx-res' });
  let rates = null, at = '';
  const calc = () => { if (!rates) return; const a = +amt.value || 0, r = a / rates[from.value] * rates[to.value]; res.innerHTML = ''; res.append(h('b', null, fmt(r, to.value)), h('small', null, `${fmt(a, from.value)} · tasa de mercado ${at}`)); };
  [amt, from, to].forEach(e => e.addEventListener('input', calc));
  ctx.body.append(h('div', { class: 'ap' }, trmBox, h('h4', { class: 'sec-t' }, 'Conversor'), h('div', { class: 'fx-form' }, amt, from, h('button', { class: 'btn ghost sm', onclick: () => { const v = from.value; from.value = to.value; to.value = v; calc(); } }, '⇅'), to), res,
    h('p', { class: 'fine' }, 'TRM: Superintendencia Financiera de Colombia vía datos.gov.co. Otras tasas: ExchangeRate-API (open.er-api.com), referencia de mercado, no de casas de cambio.')));
  try {
    const t = await (await fetch('https://www.datos.gov.co/resource/32sa-8pi3.json?$order=vigenciadesde%20DESC&$limit=8')).json();
    const now = +t[0].valor, prev = +t[1].valor, d = now - prev;
    trmBox.innerHTML = ''; trmBox.append(h('small', null, 'TRM oficial · vigente ' + new Date(t[0].vigenciadesde).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })),
      h('b', null, fmt(now, 'COP')), h('span', { class: d >= 0 ? 'up' : 'down' }, `${d >= 0 ? '▲' : '▼'} ${fmt(Math.abs(d), 'COP')} vs. día anterior`),
      h('div', { class: 'fx-spark' }, t.slice().reverse().map(x => h('i', { style: { height: Math.max(8, 60 * (x.valor - Math.min(...t.map(y => y.valor))) / (Math.max(...t.map(y => y.valor)) - Math.min(...t.map(y => y.valor)) || 1)) + 'px' }, title: x.valor }))));
  } catch { trmBox.innerHTML = ''; trmBox.append(h('p', { class: 'muted' }, 'No se pudo traer la TRM ahora.')); }
  try { const j = await (await fetch('https://open.er-api.com/v6/latest/USD')).json(); rates = j.rates; at = new Date(j.time_last_update_unix * 1000).toLocaleDateString('es-CO'); calc(); }
  catch { res.append(h('p', { class: 'muted' }, 'No se pudieron traer las tasas.')); }
}
