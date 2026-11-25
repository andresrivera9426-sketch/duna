import { h } from '../../shared/ui.js';
import { record, best, gameOver } from './games.js';
const E = ['☕', '🌺', '🦜', '🍌', '⚽', '🎸', '🌋', '🐸'];
export function mount(ctx) {
  let open = [], done = 0, moves = 0, lock = false, t0;
  const grid = h('div', { class: 'mm-grid' }), mv = h('b', null, '0');
  const reset = () => {
    grid.innerHTML = ''; open = []; done = 0; moves = 0; mv.textContent = '0'; t0 = Date.now();
    const deck = [...E, ...E].map(v => ({ v, r: Math.random() })).sort((a, b) => a.r - b.r);
    for (const c of deck) { const el = h('button', { class: 'mm', type: 'button', dataset: { v: c.v }, 'aria-label': 'Carta', onclick: () => flip(el) }, h('span', null, c.v)); grid.append(el); }
  };
  const flip = el => {
    if (lock || el.classList.contains('up')) return; el.classList.add('up'); open.push(el);
    if (open.length < 2) return; moves++; mv.textContent = moves;
    const [a, b] = open; open = [];
    if (a.dataset.v === b.dataset.v) { a.classList.add('ok'); b.classList.add('ok'); done++; if (done === E.length) { const s = Math.round((Date.now() - t0) / 1000); const rec = record('memoria', moves, true); setTimeout(() => gameOver(ctx, { title: rec ? '¡Nuevo récord!' : '¡Lo lograste!', text: `${moves} intentos en ${s} s`, shareText: `Encontré todas las parejas en ${moves} intentos`, gameName: 'Memoria', again: reset }), 350); } }
    else { lock = true; setTimeout(() => { a.classList.remove('up'); b.classList.remove('up'); lock = false; }, 750); }
  };
  ctx.body.append(h('div', { class: 'gm-wrap' }, h('div', { class: 'gm-score' }, h('span', null, 'Intentos ', mv), h('span', null, 'Mejor ', h('b', null, String(best('memoria') || '—'))), h('button', { class: 'btn ghost sm', onclick: reset }, 'Barajar')), grid));
  reset();
}
