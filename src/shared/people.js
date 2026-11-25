// Piezas visuales de personas y mensajes compartidas por todas las secciones
import { avatarUrl } from '../services/sb.js';
import { h, icon, initials, hue } from './ui.js';
import { S, chatTitle, chatPeer, tickState } from '../services/state.js';

export function avatar(p, size = 46, extra = {}) {
  const name = p?.display_name || p?.title || '?';
  const url = avatarUrl(p?.avatar_path);
  const el = h('span', { class: 'avatar' + (extra.ring ? ' ring' : '') + (extra.group ? ' grp' : ''), style: { width: size + 'px', height: size + 'px', '--h': hue(p?.id || name), fontSize: Math.round(size * 0.38) + 'px' } },
    url ? h('img', { src: url, alt: '', loading: 'lazy', onerror: e => e.target.remove() }) : (extra.group ? icon(extra.channel ? 'channel' : 'community', Math.round(size * 0.5)) : initials(name)));
  if (extra.online) el.append(h('i', { class: 'dot-online' }));
  return el;
}
export function chatAvatar(c, size = 48) {
  if (c.type === 'direct') { const p = chatPeer(c); return avatar(p || { display_name: chatTitle(c) }, size, { online: p?.online && p.id !== S.user.id }); }
  return avatar({ id: c.id, title: c.title, avatar_path: c.avatar_path }, size, { group: true, channel: c.type === 'channel' });
}
export function ticks(m, size = 16) {
  const t = tickState(m);
  if (t === -1) return h('span', { class: 'tick fail', title: 'No enviado' }, '!');
  if (t === 0) return h('span', { class: 'tick', title: 'Enviando' }, icon('clock', size - 2));
  return h('span', { class: 'tick' + (t === 3 ? ' read' : ''), title: ['', 'Enviado', 'Entregado', 'Leído'][t] }, icon(t === 1 ? 'check' : 'check2', size));
}

let audioCtx;
export function beep(freq = 880, dur = 0.12, vol = 0.05) {
  try { audioCtx = audioCtx || new AudioContext(); const o = audioCtx.createOscillator(), g = audioCtx.createGain(); o.frequency.value = freq; g.gain.value = vol; o.connect(g); g.connect(audioCtx.destination); o.start(); g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur); o.stop(audioCtx.currentTime + dur); } catch {}
}
