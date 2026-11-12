import { sb } from './sb.js';
import { h, icon, richText, onlyEmoji, fmtTime, fmtDur, fmtSize, toast, esc } from './ui.js';
import { S, nameOf, findMsg, previewText, systemText, emit, loadProfiles } from './state.js';
import { mediaUrl } from './media.js';
import { stickerUrl } from './stickers.js';
import { avatar, ticks } from './main.js';

// ===== Reproductor de audio único (no se interrumpe al redibujar) =====
export const player = { audio: new Audio(), id: null, rate: 1 };
player.audio.addEventListener('timeupdate', () => updatePlayers());
player.audio.addEventListener('ended', () => { const id = player.id; player.id = null; updatePlayers(); autoNext(id); });
player.audio.addEventListener('pause', () => updatePlayers());
player.audio.addEventListener('play', () => updatePlayers());
function updatePlayers() {
  document.querySelectorAll('.aplayer').forEach(el => {
    const on = el.dataset.mid === player.id;
    const dur = +el.dataset.dur || player.audio.duration || 0;
    el.classList.toggle('playing', on && !player.audio.paused);
    const pr = on ? (player.audio.currentTime / (player.audio.duration || dur || 1)) : 0;
    const bars = el.querySelectorAll('.awave i'); bars.forEach((b, k) => b.style.opacity = (k + 0.5) / bars.length <= pr ? 1 : 0.35);
    const t = el.querySelector('.adur'); if (t) t.textContent = on && player.audio.currentTime > 0 ? fmtDur(player.audio.currentTime) : fmtDur(dur);
    const b = el.querySelector('.aplay'); if (b) { b.innerHTML = ''; b.append(icon(on && !player.audio.paused ? 'pause' : 'play', 20)); }
  });
}
function autoNext(prevId) {
  if (!prevId || !S.current) return;
  const arr = S.msgs.get(S.current) || []; const i = arr.findIndex(m => m.id === prevId);
  const next = arr.slice(i + 1).find(m => m.kind === 'voice'); if (next && next.sender_id === arr[i].sender_id) playMsg(next);
}
export async function playMsg(m) {
  if (player.id === m.id) { player.audio.paused ? player.audio.play() : player.audio.pause(); return; }
  try {
    const url = await mediaUrl(m); player.id = m.id; player.audio.src = url; player.audio.playbackRate = player.rate; await player.audio.play();
  } catch (e) { toast('No se pudo reproducir el audio'); }
}
function audioPlayer(m) {
  const wave = m.meta?.wave || Array(40).fill(6);
  const el = h('div', { class: 'aplayer' + (m.kind === 'voice' ? ' voice' : ''), dataset: { mid: m.id, dur: m.media?.dur || 0 } },
    m.kind === 'voice' ? avatar(m.sender_id === S.user.id ? S.me : S.profiles.get(m.sender_id), 38) : h('span', { class: 'aicon' }, icon('headphones', 20)),
    h('button', { class: 'aplay', 'aria-label': 'Reproducir', onclick: e => { e.stopPropagation(); playMsg(m); } }, icon('play', 20)),
    h('div', { class: 'awave', onclick: e => {
      e.stopPropagation(); if (player.id !== m.id) return playMsg(m);
      const r = e.currentTarget.getBoundingClientRect(); player.audio.currentTime = (e.clientX - r.left) / r.width * (player.audio.duration || 0);
    } }, wave.map(v => h('i', { style: { height: v + 'px' } }))),
    h('div', { class: 'ameta' }, h('span', { class: 'adur' }, fmtDur(m.media?.dur)),
      h('button', { class: 'arate', onclick: e => { e.stopPropagation(); player.rate = player.rate === 1 ? 1.5 : player.rate === 1.5 ? 2 : 1; player.audio.playbackRate = player.rate; document.querySelectorAll('.arate').forEach(b => b.textContent = player.rate + '×'); } }, player.rate + '×')));
  setTimeout(updatePlayers, 0);
  return el;
}

// ===== Visor de medios =====
export async function viewer(m, { onclose } = {}) {
  const wrap = h('div', { class: 'viewer', role: 'dialog', 'aria-label': 'Visor' });
  const close = () => { wrap.remove(); document.removeEventListener('keydown', k); onclose && onclose(); };
  const k = e => e.key === 'Escape' && close();
  document.addEventListener('keydown', k);
  const body = h('div', { class: 'viewer-body', onclick: e => e.target === body && close() }, h('div', { class: 'spinner' }));
  wrap.append(h('div', { class: 'viewer-head' }, h('div', null, h('b', null, nameOf(m.sender_id)), h('small', null, ' · ' + fmtTime(m.created_at))),
    h('div', null, !m.view_once ? h('button', { class: 'icon-btn light', title: 'Descargar', onclick: async () => { const u = await mediaUrl(m); const a = h('a', { href: u, download: m.media?.name || ('duna-' + m.id + '.' + (m.media?.mime?.split('/')[1] || 'bin')) }); a.click(); } }, icon('download')) : null,
      h('button', { class: 'icon-btn light', title: 'Cerrar', onclick: close }, icon('x')))), body,
    m.body ? h('div', { class: 'viewer-cap', html: richText(m.body) }) : null);
  document.body.append(wrap);
  try {
    const url = await mediaUrl(m);
    body.innerHTML = '';
    body.append(m.kind === 'video' ? h('video', { src: url, controls: true, autoplay: true, playsInline: true }) : h('img', { src: url, alt: m.body || 'Foto' }));
  } catch { body.innerHTML = ''; body.append(h('p', null, m.view_once ? 'Este archivo ya no está disponible.' : 'No se pudo cargar el archivo.')); }
  return close;
}

// ===== Mapa liviano (una sola tesela de OpenStreetMap) =====
function tile(lat, lon, z = 15) {
  const n = 2 ** z, x = (lon + 180) / 360 * n, r = lat * Math.PI / 180, y = (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n;
  return { url: `https://tile.openstreetmap.org/${z}/${Math.floor(x)}/${Math.floor(y)}.png`, px: (x % 1) * 100, py: (y % 1) * 100 };
}
function locationCard(m) {
  const { lat, lon, acc, live_until, name } = m.meta || {};
  if (lat == null) return h('div', { class: 'muted' }, 'Ubicación no disponible');
  const t = tile(lat, lon); const live = live_until && new Date(live_until) > new Date();
  const link = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`;
  return h('div', { class: 'loc' },
    h('a', { class: 'loc-map', href: link, target: '_blank', rel: 'noopener', style: { backgroundImage: `url(${t.url})` } }, h('span', { class: 'pin' + (live ? ' live' : ''), style: { left: t.px + '%', top: t.py + '%' } })),
    h('div', { class: 'loc-info' }, h('b', null, live ? '📡 Ubicación en tiempo real' : (name || 'Ubicación')),
      h('small', null, live ? 'Hasta las ' + fmtTime(live_until) : `${(+lat).toFixed(5)}, ${(+lon).toFixed(5)}` + (acc ? ` · ±${Math.round(acc)} m` : '')),
      h('div', { class: 'loc-links' }, h('a', { href: link, target: '_blank', rel: 'noopener' }, 'OpenStreetMap'), h('a', { href: `https://maps.google.com/?q=${lat},${lon}`, target: '_blank', rel: 'noopener' }, 'Google Maps'),
        live && m.sender_id === S.user.id ? h('button', { class: 'linkish', onclick: e => { e.stopPropagation(); import('./composer.js').then(c => c.stopLive(m)); } }, 'Dejar de compartir') : null)),
    h('small', { class: 'osm' }, '© OpenStreetMap'));
}
function contactCard(m) {
  const c = m.meta || {};
  return h('div', { class: 'contact-card' },
    h('div', { class: 'cc-top' }, avatar({ id: c.user_id, display_name: c.name, avatar_path: c.avatar_path }, 42), h('div', null, h('b', null, c.name || 'Contacto'), h('small', null, c.username ? '@' + c.username : c.phone || ''))),
    c.user_id && c.user_id !== S.user.id ? h('div', { class: 'cc-acts' },
      h('button', { onclick: e => { e.stopPropagation(); import('./newchat.js').then(n => n.startDirect(c.user_id)); } }, 'Enviar mensaje'),
      h('button', { onclick: async e => { e.stopPropagation(); await sb.from('contacts').upsert({ owner_id: S.user.id, contact_id: c.user_id }); await loadProfiles([c.user_id], true); toast('Añadido a tus contactos'); } }, 'Añadir')) : null);
}
function pollCard(m) {
  const p = m.meta || {}; const votes = S.votes.get(m.id) || [];
  const voters = new Set(votes.map(v => v.user_id)); const mine = new Set(votes.filter(v => v.user_id === S.user.id).map(v => v.option_idx));
  const total = voters.size || 0;
  const vote = async (i) => {
    try {
      if (mine.has(i)) await sb.from('poll_votes').delete().eq('message_id', m.id).eq('user_id', S.user.id).eq('option_idx', i);
      else {
        if (!p.multi && mine.size) await sb.from('poll_votes').delete().eq('message_id', m.id).eq('user_id', S.user.id);
        const { error } = await sb.from('poll_votes').insert({ message_id: m.id, chat_id: m.chat_id, user_id: S.user.id, option_idx: i }); if (error) throw error;
      }
      const { data } = await sb.from('poll_votes').select('message_id,user_id,option_idx').eq('message_id', m.id);
      S.votes.set(m.id, data || []); emit('rerender', m.id);
    } catch (e) { toast('No se pudo votar: ' + e.message); }
  };
  return h('div', { class: 'poll' }, h('b', { class: 'poll-q' }, p.q || 'Encuesta'), h('small', { class: 'muted' }, p.multi ? 'Selecciona una o más opciones' : 'Selecciona una opción'),
    (p.o || []).map((o, i) => {
      const n = votes.filter(v => v.option_idx === i).length; const pct = total ? Math.round(n / total * 100) : 0;
      return h('button', { class: 'poll-opt' + (mine.has(i) ? ' on' : ''), style: { '--w': pct + '%' }, onclick: e => { e.stopPropagation(); vote(i); } },
        h('span', { class: 'pbox' }, mine.has(i) ? icon('check', 14) : null), h('span', { class: 'ptxt' }, o), h('span', { class: 'pn' }, n));
    }),
    h('button', { class: 'linkish', onclick: e => { e.stopPropagation(); import('./chat.js').then(c => c.pollVotesSheet(m)); } }, `Ver votos (${total})`));
}

function mediaBlock(m) {
  const md = m.media || {}; const w = md.w || 320, hh = md.h || 240; const ratio = Math.max(0.5, Math.min(1.8, hh / w));
  if (m.view_once && m.sender_id !== S.user.id) {
    const opened = S.vo.has(m.id);
    return h('button', { class: 'vo-pill' + (opened ? ' done' : ''), disabled: opened, onclick: async e => {
      e.stopPropagation();
      viewer(m, { onclose: async () => { S.vo.add(m.id); await sb.from('view_once_opens').insert({ message_id: m.id, user_id: S.user.id }); emit('rerender', m.id); } });
    } }, icon('eye1', 20), opened ? 'Abierto' : (m.kind === 'image' ? 'Foto' : 'Video') + ' · ver una vez');
  }
  if (m.view_once) return h('div', { class: 'vo-pill done' }, icon('eye1', 20), (m.kind === 'image' ? 'Foto' : 'Video') + ' de una vista' + (S.vo.has(m.id) ? ' · abierta' : ''));
  const box = h('div', { class: 'media' + (m.kind === 'video' ? ' vid' : ''), style: { aspectRatio: `${w} / ${hh}`, maxHeight: '340px', width: Math.min(300, 300 / Math.max(1, ratio)) + 'px', backgroundImage: md.thumb ? `url(${md.thumb})` : 'none' } });
  if (m.kind === 'gif') box.classList.add('gif');
  const load = async () => {
    try {
      const url = await mediaUrl(m);
      if (m.kind === 'video') {
        box.append(h('span', { class: 'vplay' }, icon('play', 28)), h('span', { class: 'vdur' }, fmtDur(md.dur)));
        box.onclick = e => { e.stopPropagation(); viewer(m); };
      } else {
        const img = h('img', { src: url, alt: m.body || 'Foto', loading: 'lazy', onload: () => img.classList.add('in') }); box.append(img);
        box.onclick = e => { e.stopPropagation(); viewer(m); };
      }
    } catch { box.append(h('span', { class: 'merr' }, 'No disponible')); }
  };
  load();
  return box;
}
function docCard(m) {
  const md = m.media || {}; const ext = (md.name || '').split('.').pop().toUpperCase().slice(0, 4) || 'DOC';
  return h('button', { class: 'doc', onclick: async e => {
    e.stopPropagation();
    try { const u = await mediaUrl(m); const a = h('a', { href: u, download: md.name || 'documento' }); document.body.append(a); a.click(); a.remove(); } catch { toast('No se pudo descargar'); }
  } }, h('span', { class: 'doc-ic' }, ext), h('span', { class: 'doc-info' }, h('b', null, md.name || 'Documento'), h('small', null, fmtSize(md.size || 0) + ' · ' + (md.mime || ''))), icon('download', 20));
}

export function quoteBlock(q, onClick) {
  if (!q) return h('div', { class: 'quote' }, h('small', null, 'Mensaje no disponible'));
  const thumb = q.media?.thumb && ['image', 'video', 'gif'].includes(q.kind) && !q.view_once ? h('img', { src: q.media.thumb, alt: '' }) : q.kind === 'sticker' ? h('img', { src: stickerUrl(q.meta?.id), alt: '' }) : null;
  return h('div', { class: 'quote', style: { '--h': (q.sender_id ? hueOf(q.sender_id) : 260) }, onclick: e => { e.stopPropagation(); onClick && onClick(q.id); } },
    h('div', null, h('b', null, nameOf(q.sender_id)), h('span', null, previewText(q).slice(0, 160))), thumb);
}
const hueOf = id => { let x = 0; for (const c of id) x = (x * 31 + c.charCodeAt(0)) % 360; return x; };

export function msgSig(m) {
  const r = S.reactions.get(m.id); const v = S.votes.get(m.id);
  return [m.id, m.body, m.edited_at, m.deleted_for_all, m._pending, m._failed, m._err, JSON.stringify(m.meta)?.length, m.media?.path, m.media?.thumb?.length,
    r ? [...r.values()].join('') : '', v ? v.map(x => x.user_id + x.option_idx).join() : '', m.sender_id === S.user.id ? String(m._tick) : '',
    S.stars.has(m.id), (S.pins.get(m.chat_id) || []).includes(m.id), S.vo.has(m.id), m.reply_to ? (findMsg(m.chat_id, m.reply_to)?.body || '') : '', S.profiles.get(m.sender_id)?.display_name].join('|');
}

// ===== Burbuja =====
export function bubble(m, { group, first, onAction, scrollTo }) {
  if (m.kind === 'system') return h('div', { class: 'sys', dataset: { id: m.id } }, h('span', null, systemText(m)));
  const mine = m.sender_id === S.user.id;
  const reacts = S.reactions.get(m.id);
  const content = [];
  if (m.forwarded) content.push(h('div', { class: 'fwd' }, icon('forward', 14), m.meta?.fwd_many ? 'Reenviado muchas veces' : 'Reenviado'));
  if (m.meta?.story) content.push(h('div', { class: 'quote story' }, h('div', null, h('b', null, 'Estado'), h('span', null, m.meta.story.text || 'Foto/Video')), m.meta.story.thumb ? h('img', { src: m.meta.story.thumb, alt: '' }) : null));
  if (m.reply_to && !m.deleted_for_all) content.push(quoteBlock(findMsg(m.chat_id, m.reply_to) || { id: m.reply_to, ...(m.meta?.rq || {}) }, scrollTo));
  let cls = '';
  if (m.deleted_for_all) { content.push(h('i', { class: 'deleted' }, icon('block', 15), mine ? ' Eliminaste este mensaje' : ' Se eliminó este mensaje')); }
  else if (m._err) content.push(h('i', { class: 'deleted' }, icon('lock', 15), ' No se pudo descifrar este mensaje en este dispositivo'));
  else switch (m.kind) {
    case 'image': case 'video': case 'gif': content.push(mediaBlock(m)); cls = m.view_once ? '' : ' has-media'; break;
    case 'voice': case 'audio': content.push(audioPlayer(m)); cls = ' has-audio'; break;
    case 'document': content.push(docCard(m)); break;
    case 'location': content.push(locationCard(m)); cls = ' has-media'; break;
    case 'contact': content.push(contactCard(m)); break;
    case 'poll': content.push(pollCard(m)); break;
    case 'sticker': content.push(h('img', { class: 'sticker', src: stickerUrl(m.meta?.id), alt: m.meta?.label || 'Sticker', width: 140, height: 140 })); cls = ' sticker-b'; break;
  }
  if (m.meta?.lp && !m.deleted_for_all) content.push(linkPreview(m.meta.lp));
  const emojiOnly = m.kind === 'text' && onlyEmoji(m.body);
  if (m.body && !m.deleted_for_all && m.kind !== 'poll') content.push(h('div', { class: 'txt' + (emojiOnly ? ' big' : ''), html: richText(m.body, mentionMap(m.chat_id)) }));
  if (emojiOnly) cls += ' emoji-b';
  const meta = h('span', { class: 'meta' },
    S.stars.has(m.id) ? icon('star', 12, 'mini') : null, (S.pins.get(m.chat_id) || []).includes(m.id) ? icon('pin', 12, 'mini') : null,
    m.expires_at ? icon('timer', 12, 'mini') : null, m.edited_at ? h('em', null, 'editado') : null, fmtTime(m.created_at), mine && !m.deleted_for_all ? ticks(m, 15) : null);
  content.push(meta);
  const b = h('div', { class: 'bubble' + cls + (first ? ' first' : '') },
    group && !mine && first ? h('b', { class: 'sender', style: { color: `hsl(${hueOf(m.sender_id || 'x')} 65% var(--name-l))` } }, nameOf(m.sender_id)) : null,
    content,
    h('button', { class: 'b-more', 'aria-label': 'Opciones del mensaje', onclick: e => { e.stopPropagation(); onAction(m, e.currentTarget); } }, icon('back', 16)));
  if (m._failed) b.append(h('button', { class: 'retry', onclick: e => { e.stopPropagation(); onAction(m, e.currentTarget, 'retry'); } }, 'No se envió · ', m._error || '', ' Toca para reintentar'));
  const row = h('div', { class: 'mrow' + (mine ? ' me' : '') + (first ? ' first' : ''), dataset: { id: m.id } },
    group && !mine ? (first ? avatar(S.profiles.get(m.sender_id) || { id: m.sender_id }, 30) : h('span', { class: 'av-sp' })) : null,
    h('div', { class: 'bcol' }, b, reacts && reacts.size ? reactionPills(m, reacts, onAction) : null));
  // gestos: doble clic / doble toque = reaccionar, deslizar = responder, mantener = menú
  b.addEventListener('dblclick', e => { e.preventDefault(); onAction(m, b, 'react'); });
  b.addEventListener('contextmenu', e => { e.preventDefault(); onAction(m, { x: e.clientX, y: e.clientY }); });
  let sx = 0, sy = 0, lp, dx = 0;
  b.addEventListener('touchstart', e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; dx = 0; lp = setTimeout(() => { navigator.vibrate?.(12); onAction(m, b); }, 480); }, { passive: true });
  b.addEventListener('touchmove', e => { dx = e.touches[0].clientX - sx; if (Math.abs(dx) > 8 || Math.abs(e.touches[0].clientY - sy) > 8) clearTimeout(lp); if (dx > 0 && dx < 90) b.style.transform = `translateX(${dx}px)`; }, { passive: true });
  b.addEventListener('touchend', () => { clearTimeout(lp); b.style.transform = ''; if (dx > 60) onAction(m, b, 'reply'); });
  return row;
}
function reactionPills(m, reacts, onAction) {
  const counts = {}; for (const e of reacts.values()) counts[e] = (counts[e] || 0) + 1;
  const mineR = reacts.get(S.user.id);
  return h('button', { class: 'reacts' + (mineR ? ' mine' : ''), onclick: e => { e.stopPropagation(); onAction(m, e.currentTarget, 'reactions'); } },
    Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([e]) => h('span', null, e)), reacts.size > 1 ? h('small', null, reacts.size) : null);
}
function linkPreview(lp) {
  return h('a', { class: 'lp', href: lp.url, target: '_blank', rel: 'noopener noreferrer' }, lp.img ? h('img', { src: lp.img, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer', onerror: e => e.target.remove() }) : null,
    h('div', null, h('b', null, lp.title || lp.url), lp.desc ? h('small', null, lp.desc.slice(0, 140)) : null, h('small', { class: 'lp-host' }, (() => { try { return new URL(lp.url).hostname; } catch { return ''; } })())));
}
function mentionMap(chatId) {
  const out = {}; const mem = S.members.get(chatId); if (!mem) return out;
  for (const id of mem.keys()) { const p = id === S.user.id ? S.me : S.profiles.get(id); if (p?.username) out[p.username] = p.alias || p.display_name; }
  return out;
}
