import { h, btn } from '../../shared/ui.js';
import { record, best, gameOver } from './games.js';
export function mount(ctx) {
  const W = 18, H = 22; let snake, dir, next, food, score, timer, alive;
  const cv = h('canvas', { class: 'sn-cv', width: W * 20, height: H * 20, 'aria-label': 'Culebrita' }), cx = cv.getContext('2d'), sc = h('b', null, '0');
  const css = getComputedStyle(document.documentElement);
  const place = () => { do food = [Math.floor(Math.random() * W), Math.floor(Math.random() * H)]; while (snake.some(s => s[0] === food[0] && s[1] === food[1])); };
  const draw = () => {
    cx.fillStyle = css.getPropertyValue('--panel2') || '#eee'; cx.fillRect(0, 0, cv.width, cv.height);
    cx.fillStyle = '#E2552F'; cx.beginPath(); cx.arc(food[0] * 20 + 10, food[1] * 20 + 10, 8, 0, 7); cx.fill();
    snake.forEach((s, i) => { cx.fillStyle = i ? '#3B2FD6' : '#15132B'; cx.beginPath(); cx.roundRect ? cx.roundRect(s[0] * 20 + 1, s[1] * 20 + 1, 18, 18, 6) : cx.rect(s[0] * 20 + 1, s[1] * 20 + 1, 18, 18); cx.fill(); });
  };
  const step = () => {
    dir = next; const hd = [snake[0][0] + dir[0], snake[0][1] + dir[1]];
    if (hd[0] < 0 || hd[1] < 0 || hd[0] >= W || hd[1] >= H || snake.some(s => s[0] === hd[0] && s[1] === hd[1])) return end();
    snake.unshift(hd); if (hd[0] === food[0] && hd[1] === food[1]) { score++; sc.textContent = score; place(); clearInterval(timer); timer = setInterval(step, Math.max(70, 150 - score * 3)); } else snake.pop();
    draw();
  };
  const end = () => { alive = false; clearInterval(timer); const rec = record('snake', score); gameOver(ctx, { title: rec && score ? '¡Nuevo récord!' : 'Fin del juego', text: `Comiste ${score} · Récord ${best('snake')}`, shareText: `Hice ${score} puntos`, gameName: 'Culebrita', again: reset }); };
  const reset = () => { clearInterval(timer); snake = [[8, 11], [7, 11], [6, 11]]; dir = next = [1, 0]; score = 0; sc.textContent = '0'; alive = true; place(); draw(); timer = setInterval(step, 150); };
  const turn = d => { if ((d[0] && d[0] === -dir[0]) || (d[1] && d[1] === -dir[1])) return; next = d; };
  const key = e => { if (!ctx.layer.isConnected) { clearInterval(timer); return removeEventListener('keydown', key); } const m = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]; if (m) { e.preventDefault(); turn(m); } };
  addEventListener('keydown', key);
  let sx, sy; cv.addEventListener('touchstart', e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  cv.addEventListener('touchmove', e => { const dx = e.touches[0].clientX - sx, dy = e.touches[0].clientY - sy; if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return; turn(Math.abs(dx) > Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)]); sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  new MutationObserver((_, o) => { if (!ctx.layer.isConnected) { clearInterval(timer); o.disconnect(); } }).observe(document.body, { childList: true });
  const pad = h('div', { class: 'sn-pad' }, btn('back', 'Izquierda', () => turn([-1, 0]), 'icon-btn l'), h('div', null, btn('back', 'Arriba', () => turn([0, -1]), 'icon-btn u'), btn('back', 'Abajo', () => turn([0, 1]), 'icon-btn d')), btn('back', 'Derecha', () => turn([1, 0]), 'icon-btn r'));
  ctx.body.append(h('div', { class: 'gm-wrap' }, h('div', { class: 'gm-score' }, h('span', null, 'Puntos ', sc), h('span', null, 'Récord ', h('b', null, String(best('snake')))), h('button', { class: 'btn ghost sm', onclick: reset }, 'Reiniciar')), cv, pad));
  reset();
}
