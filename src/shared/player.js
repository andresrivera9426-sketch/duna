// Reproductor persistente (radio y audio): una barra mínima que sigue sonando mientras navegas por DUNA.
// En Android arranca un servicio en primer plano (DunaNative.mediaStart) para que el audio siga con la pantalla apagada.
import { h, icon, btn, toast } from './ui.js';
let audio = null, bar = null, cur = null, onEnd = null;
const native = () => window.Capacitor?.isNativePlatform?.() ? window.Capacitor.Plugins?.DunaNative : null;
function mount() {
  if (bar) return;
  audio = new Audio(); audio.preload = 'none'; audio.crossOrigin = null;
  const art = h('span', { class: 'mp-art' }), t = h('b', { class: 'mp-t' }), sub = h('small', { class: 'mp-s' });
  const play = h('button', { class: 'icon-btn mp-play', type: 'button', 'aria-label': 'Pausar', onclick: () => toggle() }, icon('pause'));
  bar = h('div', { class: 'miniplayer', id: 'miniplayer', role: 'region', 'aria-label': 'Reproductor' }, art, h('div', { class: 'mp-id', onclick: () => cur?.open?.() }, t, sub), play, btn('x', 'Cerrar reproductor', () => stop()));
  bar._els = { art, t, sub, play }; document.body.append(bar);
  const st = s => { bar._els.sub.textContent = s; };
  audio.addEventListener('playing', () => { st(cur?.sub || 'En vivo'); setIcon(true); bar.classList.remove('wait'); });
  audio.addEventListener('waiting', () => { st('Conectando…'); bar.classList.add('wait'); });
  audio.addEventListener('pause', () => setIcon(false));
  audio.addEventListener('error', () => { if (!cur) return; st('No disponible ahora'); setIcon(false); bar.classList.remove('wait'); toast('Esta emisora no responde ahora. Prueba otra.'); });
  audio.addEventListener('ended', () => onEnd?.());
  // Un video que empieza a sonar dentro de DUNA pausa la radio
  addEventListener('duna:media', () => { if (audio && !audio.paused) audio.pause(); });
  native()?.addListener?.('mediaStop', () => stop());
}
function setIcon(on) { if (!bar) return; const b = bar._els.play; b.innerHTML = ''; b.append(icon(on ? 'pause' : 'play')); b.setAttribute('aria-label', on ? 'Pausar' : 'Reproducir'); document.documentElement.classList.toggle('mp-on', !!cur); }
/** Reproduce un stream: { url, title, sub, art, open } */
export function play(item) {
  mount(); cur = item;
  const { art, t, sub } = bar._els; t.textContent = item.title; sub.textContent = 'Conectando…'; art.innerHTML = '';
  if (item.art) art.append(h('img', { src: item.art, alt: '', referrerpolicy: 'no-referrer', onerror: e => e.target.remove() })); else art.append(icon('headphones', 20));
  bar.hidden = false; document.documentElement.classList.add('mp-on'); bar.classList.add('wait');
  audio.src = item.url; audio.play().catch(() => { setIcon(false); });
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({ title: item.title, artist: item.sub || 'DUNA Radio', album: 'DUNA', artwork: item.art ? [{ src: item.art, sizes: '256x256' }] : [] });
    navigator.mediaSession.setActionHandler('play', () => audio.play()); navigator.mediaSession.setActionHandler('pause', () => audio.pause()); navigator.mediaSession.setActionHandler('stop', () => stop());
  }
  native()?.mediaStart?.({ title: item.title, sub: item.sub || 'DUNA Radio' }).catch?.(() => {});
}
export function toggle() { if (!audio || !cur) return; if (audio.paused) { audio.play().catch(() => {}); native()?.mediaStart?.({ title: cur.title, sub: cur.sub || 'DUNA Radio' }).catch?.(() => {}); } else { audio.pause(); native()?.mediaStop?.().catch?.(() => {}); } }
export function stop() { if (!audio) return; audio.pause(); audio.removeAttribute('src'); audio.load(); cur = null; if (bar) bar.hidden = true; document.documentElement.classList.remove('mp-on'); native()?.mediaStop?.().catch?.(() => {}); }
export const current = () => cur;
export const isPlaying = () => !!(audio && cur && !audio.paused);
