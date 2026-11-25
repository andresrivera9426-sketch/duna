import { h } from '../../shared/ui.js';
import { record, best, gameOver } from './games.js';
export function mount(ctx) {
  const N = 4; let g, score, over, won;
  const sc = h('b', null, '0'), bs = h('b', null, String(best('2048'))), grid = h('div', { class: 'g2-grid', 'aria-label': 'Tablero 2048', tabindex: 0 });
  const empty = () => { const e = []; g.forEach((r, i) => r.forEach((v, j) => !v && e.push([i, j]))); return e; };
  const spawn = () => { const e = empty(); if (!e.length) return; const [i, j] = e[Math.floor(Math.random() * e.length)]; g[i][j] = Math.random() < .9 ? 2 : 4; };
  const reset = () => { g = Array.from({ length: N }, () => Array(N).fill(0)); score = 0; over = false; won = false; spawn(); spawn(); paint(); };
  const paint = () => { grid.innerHTML = ''; g.flat().forEach(v => grid.append(h('div', { class: 'g2-c v' + Math.min(v, 4096) }, v || ''))); sc.textContent = score; bs.textContent = Math.max(score, best('2048')); };
  const slide = row => { const a = row.filter(Boolean); for (let i = 0; i < a.length - 1; i++) if (a[i] === a[i + 1]) { a[i] *= 2; score += a[i]; if (a[i] === 2048 && !won) { won = true; setTimeout(() => gameOver(ctx, { title: '¡Llegaste a 2048!', text: `Puntaje: ${score}`, shareText: `Llegué a 2048 con ${score} puntos`, gameName: '2048', again: reset }), 200); } a.splice(i + 1, 1); } while (a.length < N) a.push(0); return a; };
  const move = d => {
    if (over) return; const before = JSON.stringify(g);
    for (let k = 0; k < N; k++) {
      let line = d === 'L' || d === 'R' ? g[k].slice() : g.map(r => r[k]); if (d === 'R' || d === 'D') line.reverse();
      line = slide(line); if (d === 'R' || d === 'D') line.reverse();
      if (d === 'L' || d === 'R') g[k] = line; else line.forEach((v, i) => { g[i][k] = v; });
    }
    if (JSON.stringify(g) === before) return; spawn(); paint();
    const can = empty().length || g.some((r, i) => r.some((v, j) => (j < N - 1 && v === r[j + 1]) || (i < N - 1 && v === g[i + 1][j])));
    if (!can) { over = true; const rec = record('2048', score); gameOver(ctx, { title: rec ? '¡Nuevo récord!' : 'Fin del juego', text: `Puntaje: ${score}`, shareText: `Hice ${score} puntos`, gameName: '2048', again: reset }); }
  };
  const key = e => { if (!ctx.layer.isConnected) return removeEventListener('keydown', key); const m = { ArrowLeft: 'L', ArrowRight: 'R', ArrowUp: 'U', ArrowDown: 'D' }[e.key]; if (m) { e.preventDefault(); move(m); } };
  addEventListener('keydown', key);
  let sx, sy; grid.addEventListener('touchstart', e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  grid.addEventListener('touchend', e => { const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy; if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return; move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'R' : 'L') : (dy > 0 ? 'D' : 'U')); });
  ctx.body.append(h('div', { class: 'gm-wrap' }, h('div', { class: 'gm-score' }, h('span', null, 'Puntos ', sc), h('span', null, 'Récord ', bs), h('button', { class: 'btn ghost sm', onclick: reset }, 'Nuevo')), grid, h('p', { class: 'muted center' }, 'Desliza (o usa las flechas) para mover las fichas.')));
  reset(); grid.focus();
  ctx._move = move; // para pruebas
}
