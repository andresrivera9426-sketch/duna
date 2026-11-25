// Calculadora sin eval(): analizador propio (+ − × ÷ %, paréntesis, decimales) e historial en el teléfono.
import { h, copyText } from '../../../shared/ui.js';
import { local } from '../../../shared/kit.js';
export function evaluate(src) {
  const s = src.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/,/g, '.').replace(/\s+/g, ''); let i = 0;
  const num = () => { const m = s.slice(i).match(/^\d*\.?\d+(e[+-]?\d+)?/i); if (!m) throw new Error('Expresión no válida'); i += m[0].length; return parseFloat(m[0]); };
  const atom = () => { if (s[i] === '(') { i++; const v = add(); if (s[i] !== ')') throw new Error('Falta )'); i++; return post(v); } if (s[i] === '-') { i++; return -atom(); } if (s[i] === '+') { i++; return atom(); } return post(num()); };
  const post = v => { while (s[i] === '%') { i++; v = v / 100; } return v; };
  const mul = () => { let v = atom(); while (s[i] === '*' || s[i] === '/') { const o = s[i++]; const r = atom(); v = o === '*' ? v * r : v / r; } return v; };
  const add = () => { let v = mul(); while (s[i] === '+' || s[i] === '-') { const o = s[i++]; const r = mul(); v = o === '+' ? v + r : v - r; } return v; };
  const v = add(); if (i < s.length) throw new Error('Expresión no válida'); if (!isFinite(v)) throw new Error('No se puede dividir por cero'); return +v.toPrecision(12);
}
export function mount(ctx) {
  let expr = ''; const disp = h('div', { class: 'calc-d', 'aria-live': 'polite' }), prev = h('div', { class: 'calc-p' }), hist = h('div', { class: 'calc-h' });
  const fmt = n => n.toLocaleString('es-CO', { maximumFractionDigits: 10 });
  const paint = () => { disp.textContent = expr || '0'; try { prev.textContent = expr && /[+\-×÷%]/.test(expr) ? '= ' + fmt(evaluate(expr)) : ''; } catch { prev.textContent = ''; } };
  const paintH = () => { hist.innerHTML = ''; for (const x of local.get('calc-hist', []).slice(0, 8)) hist.append(h('button', { class: 'calc-hi', onclick: () => { expr = String(x.r); paint(); } }, `${x.e} = ${fmt(x.r)}`)); };
  const press = k => {
    if (k === 'C') expr = ''; else if (k === '⌫') expr = expr.slice(0, -1);
    else if (k === '=') { try { const r = evaluate(expr); local.set('calc-hist', [{ e: expr, r }, ...local.get('calc-hist', [])].slice(0, 20)); expr = String(r); paintH(); } catch (e) { prev.textContent = e.message; return; } }
    else expr += k; paint();
  };
  const keys = ['C', '(', ')', '÷', '7', '8', '9', '×', '4', '5', '6', '−', '1', '2', '3', '+', '%', '0', '.', '='];
  ctx.body.append(h('div', { class: 'ap calc' }, hist, h('div', { class: 'calc-screen', onclick: () => copyText(disp.textContent) }, prev, disp), h('div', { class: 'calc-k' }, keys.map(k => h('button', { class: 'ck' + (/[÷×−+=]/.test(k) ? ' op' : '') + (k === '=' ? ' eq' : ''), type: 'button', dataset: { k }, onclick: () => press(k) }, k)), h('button', { class: 'ck', type: 'button', onclick: () => press('⌫') }, '⌫'))));
  const kb = e => { if (!ctx.layer.isConnected) return removeEventListener('keydown', kb); const m = { '*': '×', '/': '÷', '-': '−', Enter: '=', Backspace: '⌫', Escape: null }; const k = e.key in m ? m[e.key] : e.key; if (k && /^[\d.+()%×÷−=⌫]$/.test(k)) { e.preventDefault(); press(k); } };
  addEventListener('keydown', kb); paint(); paintH();
}
