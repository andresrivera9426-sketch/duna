// Juegos HTML5 propios de DUNA: livianos, sin anuncios y sin conexión. Récords en el teléfono; el puntaje se comparte en un chat.
import { h, icon } from '../../shared/ui.js';
import { ensureCss, openApp, local } from '../../shared/kit.js';
import { shareToChat } from '../../shared/share.js';
export const GAMES = [];
export function registerGame(g) { GAMES.push(g); }
registerGame({ id: '2048', name: '2048', desc: 'Une fichas hasta llegar a 2048', emoji: '🔢', color: '#E2A12F', load: () => import('./g2048.js') });
registerGame({ id: 'snake', name: 'Culebrita', desc: 'La clásica: come y crece', emoji: '🐍', color: '#1E9E6A', load: () => import('./snake.js') });
registerGame({ id: 'memoria', name: 'Memoria', desc: 'Encuentra las parejas', emoji: '🃏', color: '#5B4BDB', load: () => import('./memoria.js') });
registerGame({ id: 'triqui', name: 'Triqui', desc: 'Contra la máquina', emoji: '⭕', color: '#E2552F', load: () => import('./triqui.js') });
export const best = id => local.get('game-best', {})[id] || 0;
/** Guarda récord si lo supera; devuelve true si es nuevo récord */
export function record(id, score, lowerIsBetter = false) { const b = local.get('game-best', {}); const cur = b[id]; const better = cur == null || cur === 0 || (lowerIsBetter ? score < cur : score > cur); if (better) { b[id] = score; local.set('game-best', b); } return better; }
export function shareScore(name, text) { shareToChat(`🎮 ${text} en ${name} de DUNA. ¿Me superas? Ábrelo en Descubrir → Juegos.`); }
/** Panel de fin de partida, común a todos los juegos */
export function gameOver(ctx, { title, text, shareText, gameName, again }) {
  ctx.body.querySelector('.go')?.remove();
  const box = h('div', { class: 'go', role: 'dialog', 'aria-label': title }, h('div', { class: 'go-card' }, h('b', null, title), h('p', null, text),
    h('div', { class: 'row-btns' }, h('button', { class: 'btn ghost', onclick: () => shareScore(gameName, shareText) }, icon('share', 16), ' Compartir'), h('button', { class: 'btn primary', onclick: () => { box.remove(); again(); } }, 'Jugar otra vez'))));
  ctx.body.append(box);
}
export async function openGame(id) {
  const g = GAMES.find(x => x.id === id); await ensureCss();
  return openApp(g.name, async ctx => { ctx.layer.classList.add('game'); const m = await g.load(); m.mount(ctx); }, { sub: 'Récord: ' + (best(id) || '—') });
}
export async function renderGames(side, head) {
  await ensureCss();
  side.append(head('Juegos', []), h('div', { class: 'ma-scroll' }, h('p', { class: 'muted gm-intro' }, 'Juegos rápidos hechos para DUNA: sin anuncios y funcionan sin internet.'),
    h('div', { class: 'gm-grid' }, GAMES.map(g => h('button', { class: 'gm', type: 'button', dataset: { game: g.id }, style: { '--c': g.color }, onclick: () => openGame(g.id) },
      h('span', { class: 'gm-ic' }, g.emoji), h('b', null, g.name), h('small', null, g.desc), h('em', null, best(g.id) ? '🏆 ' + best(g.id) : 'Nuevo'))))));
}
