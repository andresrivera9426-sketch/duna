import { h } from '../../shared/ui.js';
import { local } from '../../shared/kit.js';
import { gameOver } from './games.js';
const L = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
const win = b => { for (const [a, c, d] of L) if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a]; return b.every(Boolean) ? 'draw' : null; };
// Minimax: la máquina juega perfecto en "Difícil" y a veces se equivoca en "Normal"
function best(b, me) { let bs = -2, mv = -1; for (let i = 0; i < 9; i++) if (!b[i]) { b[i] = me; const s = -score(b, me === 'O' ? 'X' : 'O'); b[i] = null; if (s > bs) { bs = s; mv = i; } } return mv; }
function score(b, turn) { const w = win(b); if (w === 'draw') return 0; if (w) return w === turn ? 1 : -1; let bs = -2; for (let i = 0; i < 9; i++) if (!b[i]) { b[i] = turn; bs = Math.max(bs, -score(b, turn === 'O' ? 'X' : 'O')); b[i] = null; } return bs; }
export function mount(ctx) {
  let b, busy, hard = local.get('triqui-hard', false); const st = local.get('triqui', { w: 0, l: 0, d: 0 });
  const grid = h('div', { class: 'tq-grid' }), msg = h('p', { class: 'center muted' }), tally = h('b');
  const paintT = () => { tally.textContent = `Tú ${st.w} · Máquina ${st.l} · Empates ${st.d}`; };
  const paint = () => { grid.innerHTML = ''; b.forEach((v, i) => grid.append(h('button', { class: 'tq' + (v ? ' ' + v : ''), type: 'button', 'aria-label': 'Casilla ' + (i + 1), dataset: { i }, onclick: () => play(i) }, v || ''))); };
  const finish = w => { if (w === 'X') st.w++; else if (w === 'O') st.l++; else st.d++; local.set('triqui', st); paintT();
    gameOver(ctx, { title: w === 'X' ? '¡Ganaste!' : w === 'O' ? 'Ganó la máquina' : 'Empate', text: `Tú ${st.w} · Máquina ${st.l} · Empates ${st.d}`, shareText: `Voy ${st.w} a ${st.l} contra la máquina`, gameName: 'Triqui', again: reset }); };
  const play = i => {
    if (busy || b[i] || win(b)) return; b[i] = 'X'; paint(); let w = win(b); if (w) return finish(w);
    busy = true; msg.textContent = 'La máquina piensa…';
    setTimeout(() => { const free = b.map((v, k) => v ? -1 : k).filter(k => k >= 0); const m = !hard && Math.random() < .3 ? free[Math.floor(Math.random() * free.length)] : best(b, 'O'); b[m] = 'O'; busy = false; msg.textContent = 'Tu turno (X)'; paint(); const w2 = win(b); if (w2) finish(w2); }, 350);
  };
  const reset = () => { b = Array(9).fill(null); busy = false; msg.textContent = 'Tu turno (X)'; paint(); };
  const lvl = h('button', { class: 'btn ghost sm', onclick: () => { hard = !hard; local.set('triqui-hard', hard); lvl.textContent = hard ? 'Difícil' : 'Normal'; reset(); } }, hard ? 'Difícil' : 'Normal');
  ctx.body.append(h('div', { class: 'gm-wrap' }, h('div', { class: 'gm-score' }, tally, lvl), grid, msg)); paintT(); reset();
}
