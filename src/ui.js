// Utilidades de interfaz DUNA
export function h(tag, attrs, ...kids) {
  const el = tag === 'frag' ? document.createDocumentFragment() : document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') { for (const [sk, sv] of Object.entries(v)) { if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv; } }
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
  return el;
}
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

// Iconos SVG propios (trazo redondeado)
const P = {
  chat: 'M4 12a8 8 0 0 1 8-8h0a8 8 0 0 1 8 8v0a8 8 0 0 1-8 8H6l-2 2v-10z',
  status: 'M12 3a9 9 0 1 0 9 9M12 3a9 9 0 0 1 9 9M12 7a5 5 0 1 0 5 5',
  community: 'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20c0-3 3-5 6-5s6 2 6 5M12 20c0-3 2-5 4-5 3 0 6 2 6 5',
  call: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2',
  video: 'M3 7a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM16 10l5-3v10l-5-3',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5',
  more: 'M12 6h.01M12 12h.01M12 18h.01',
  back: 'M15 5l-7 7 7 7',
  send: 'M4 12l16-8-6 16-2-7-8-1z',
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3',
  clip: 'M21 11l-8.5 8.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 7',
  plus: 'M12 5v14M5 12h14',
  smile: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01',
  x: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12l5 5L20 7',
  check2: 'M2 12l5 5L17 7M12 16l1 1L23 7',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  reply: 'M9 14L4 9l5-5M4 9h11a5 5 0 0 1 5 5v5',
  forward: 'M15 14l5-5-5-5M20 9H9a5 5 0 0 0-5 5v5',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
  pin: 'M9 4h6l-1 6 4 3v2H6v-2l4-3zM12 15v6',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  copy: 'M9 9h10v10H9zM5 15V5h10',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 7h.01',
  lock: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9h.01',
  doc: 'M6 3h8l5 5v13H6zM14 3v5h5',
  headphones: 'M4 15v-3a8 8 0 0 1 16 0v3M4 15h3v5H4zM17 15h3v5h-3z',
  location: 'M12 21s7-6 7-12a7 7 0 0 0-14 0c0 6 7 12 7 12zM12 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 4-6 8-6s8 2 8 6',
  poll: 'M5 20V10M12 20V4M19 20v-7',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z',
  archive: 'M3 5h18v4H3zM5 9v10h14V9M10 13h4',
  bell: 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4',
  belloff: 'M6 16V11a6 6 0 0 1 9-5M18 11v5l2 2H8M10 21h4M3 3l18 18',
  block: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM6 6l12 12',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  link: 'M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  moon: 'M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10z',
  timer: 'M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 9v4M10 2h4',
  eye1: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM11 8l2-1v10',
  phoneoff: 'M3 3l18 18M5 4h4l2 5-2.5 1.5M15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6',
  micoff: 'M3 3l18 18M9 9v3a3 3 0 0 0 5 2M15 10V6a3 3 0 0 0-6 0M5 11a7 7 0 0 0 11 5M19 11a7 7 0 0 1-1 3M12 18v3',
  videooff: 'M3 3l18 18M16 10l5-3v10M14 17H5a2 2 0 0 1-2-2V7M8 5h6a2 2 0 0 1 2 2v4',
  flip: 'M4 12a8 8 0 0 1 14-5l2 2M20 12a8 8 0 0 1-14 5l-2-2M20 4v5h-5M4 20v-5h5',
  screen: 'M3 5h18v12H3zM8 21h8M12 17v4',
  play: 'M7 4l13 8-13 8z',
  pause: 'M7 4h4v16H7zM14 4h4v16h-4z',
  download: 'M12 4v12M7 11l5 5 5-5M5 20h14',
  sticker: 'M4 4h16v9l-7 7H4zM13 20v-4a3 3 0 0 1 3-3h4',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  key: 'M14 10a4 4 0 1 0-4 4l1 1h2v2h2v2h3v-3l-4-4z',
  device: 'M7 3h10v18H7zM11 18h2',
  save: 'M5 3h11l3 3v15H5zM8 3v5h8V3M8 14h8v7H8z',
  channel: 'M4 10v4h3l6 4V6L7 10zM17 9a4 4 0 0 1 0 6M19.5 6.5a8 8 0 0 1 0 11',
  unread: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 12h.01',
  wallpaper: 'M4 4h16v16H4zM4 15l4-4 5 5M14 14l2-2 4 4',
  grid: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  tag: 'M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8zM7.5 7.5h.01',
  broadcast: 'M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13',
  bolt: 'M13 2L4 14h7l-1 8 9-12h-7l1-8z',
  calendar: 'M8 2v4M16 2v4M3 9h18M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2',
  sparkle: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 15.5l.8 1.7 1.7.8-1.7.8-.8 1.7-.8-1.7-1.7-.8 1.7-.8z',
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9M12 3c-2.5 2.6-3.8 5.6-3.8 9s1.3 6.4 3.8 9',
  share: 'M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8.6 13.5l6.8 4M15.4 6.5l-6.8 4',
};
export function icon(name, size = 22, cls = '') {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', size); s.setAttribute('height', size);
  s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '1.9');
  s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.setAttribute('aria-hidden', 'true');
  if (cls) s.setAttribute('class', cls);
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', P[name] || P.info); s.append(p);
  return s;
}
export const btn = (ic, label, onclick, cls = 'icon-btn') => h('button', { class: cls, type: 'button', title: label, 'aria-label': label, onclick }, icon(ic));

export const LOGO = `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs><linearGradient id="dg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6D4BFF"/><stop offset=".55" stop-color="#C24BD6"/><stop offset="1" stop-color="#FF8A3D"/></linearGradient></defs><path d="M32 4C16.5 4 4 15.4 4 29.5c0 7.3 3.4 13.9 8.8 18.5L10 60l13.2-6.6c2.8.7 5.8 1.1 8.8 1.1 15.5 0 28-11.4 28-25.5S47.5 4 32 4z" fill="url(#dg)"/><circle cx="43" cy="20" r="5.2" fill="#FFE7A8"/><path d="M12 38c6-7 12-9 18-6s10 4 16-1c3-2.5 5.5-3 8-2.5-1.5 9-9 16-20 17.5-9 1.2-17.4-2.2-22-8z" fill="#fff" opacity=".95"/><path d="M15 33c5-5 10-6 15-3.5" stroke="#fff" stroke-width="3" stroke-linecap="round" fill="none" opacity=".6"/></svg>`;
let logoN = 0;
export const logo = (size = 36) => { const id = 'dg' + (++logoN); return h('span', { class: 'logo', style: { width: size + 'px', height: size + 'px' }, html: LOGO.replace('id="dg"', `id="${id}"`).replace('url(#dg)', `url(#${id})`) }); };

// Toasts
export function toast(msg, ms = 2600) {
  let box = $('#toasts'); if (!box) { box = h('div', { id: 'toasts', role: 'status', 'aria-live': 'polite' }); document.body.append(box); }
  const t = h('div', { class: 'toast' }, msg); box.append(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, ms);
}

// Hojas modales
export function sheet(title, content, { wide = false, onclose } = {}) {
  let closed = false;
  const close = (dismiss) => { if (closed) return; closed = true; wrap.classList.add('out'); setTimeout(() => wrap.remove(), 200); if (dismiss === true && onclose) onclose(); document.removeEventListener('keydown', esc); };
  const esc = e => { if (e.key === 'Escape' && wrap === [...document.querySelectorAll('.sheet-wrap')].pop()) close(true); };
  const wrap = h('div', { class: 'sheet-wrap', onclick: e => { if (e.target === wrap) close(true); } },
    h('div', { class: 'sheet' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('div', { class: 'sheet-head' }, h('h2', null, title), btn('x', 'Cerrar', () => close(true))),
      h('div', { class: 'sheet-body' }, content)));
  document.body.append(wrap); document.addEventListener('keydown', esc);
  setTimeout(() => { const f = wrap.querySelector('input,textarea,select'); if (f && !matchMedia('(pointer:coarse)').matches) f.focus(); }, 60);
  return { close, el: wrap };
}
export function confirmDialog(text, okLabel = 'Aceptar', danger = false, extra) {
  return new Promise(res => {
    let s; const done = v => { s.close(); res(v); };
    s = sheet('Confirmar', h('div', null, h('p', { class: 'muted' }, text),
      h('div', { class: 'row-btns' },
        extra ? h('button', { class: 'btn ghost', onclick: () => done('extra') }, extra) : null,
        h('button', { class: 'btn ghost', onclick: () => done(false) }, 'Cancelar'),
        h('button', { class: 'btn ' + (danger ? 'danger' : 'primary'), onclick: () => done(true) }, okLabel))), { onclose: () => res(false) });
  });
}
export function prompt(title, { value = '', placeholder = '', type = 'text', multiline = false, max = 200 } = {}) {
  return new Promise(res => {
    let s; const inp = multiline ? h('textarea', { rows: 4, maxlength: max, placeholder }, value) : h('input', { type, value, placeholder, maxlength: max });
    const ok = () => { const v = inp.value; s.close(); res(v); };
    inp.addEventListener('keydown', e => { if (e.key === 'Enter' && !multiline) ok(); });
    s = sheet(title, h('div', { class: 'form' }, inp, h('div', { class: 'row-btns' },
      h('button', { class: 'btn ghost', onclick: () => { s.close(); res(null); } }, 'Cancelar'),
      h('button', { class: 'btn primary', onclick: ok }, 'Guardar'))), { onclose: () => res(null) });
  });
}
// Menú contextual
export function menu(items, anchor) {
  document.querySelectorAll('.ctx').forEach(e => e.remove());
  const m = h('div', { class: 'ctx', role: 'menu' }, items.filter(Boolean).map(it => it === '-' ? h('hr') :
    h('button', { class: 'ctx-item' + (it.danger ? ' danger' : ''), role: 'menuitem', onclick: e => { e.stopPropagation(); m.remove(); it.action(); } }, it.icon ? icon(it.icon, 18) : null, h('span', null, it.label))));
  document.body.append(m);
  const r = anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { left: anchor.x, top: anchor.y, bottom: anchor.y, right: anchor.x };
  const mw = m.offsetWidth, mh = m.offsetHeight;
  let x = Math.min(r.right - mw, innerWidth - mw - 8); x = Math.max(8, r.left + mw > innerWidth ? x : r.left);
  let y = r.bottom + 4; if (y + mh > innerHeight - 8) y = Math.max(8, r.top - mh - 4);
  m.style.left = x + 'px'; m.style.top = y + 'px';
  setTimeout(() => document.addEventListener('click', function off() { m.remove(); document.removeEventListener('click', off); }), 0);
  return m;
}

// Formato
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function fmtTime(d) { return new Date(d).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' }); }
export function fmtDay(d) {
  const x = new Date(d), now = new Date(), y = new Date(now); y.setDate(now.getDate() - 1);
  if (x.toDateString() === now.toDateString()) return 'Hoy';
  if (x.toDateString() === y.toDateString()) return 'Ayer';
  if (now - x < 6 * 864e5) return x.toLocaleDateString('es-CO', { weekday: 'long' });
  return x.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: x.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}
export function fmtListTime(d) {
  const x = new Date(d), now = new Date();
  if (x.toDateString() === now.toDateString()) return fmtTime(x);
  const f = fmtDay(x); return f === 'Ayer' ? f : (now - x < 6 * 864e5 ? f : x.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: '2-digit' }));
}
export function fmtLastSeen(d) {
  if (!d) return '';
  const x = new Date(d), now = new Date();
  if (x.toDateString() === now.toDateString()) return 'últ. vez hoy a las ' + fmtTime(x);
  return 'últ. vez ' + fmtDay(x).toLowerCase() + ' a las ' + fmtTime(x);
}
export const fmtDur = s => { s = Math.max(0, Math.round(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
export const fmtSize = b => b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(0) + ' KB' : (b / 1048576).toFixed(1) + ' MB';
export function initials(name) { return (name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase(); }
export function hue(str) { let x = 0; for (const c of String(str)) x = (x * 31 + c.charCodeAt(0)) % 360; return x; }

// Texto enriquecido: *negrita* _cursiva_ ~tachado~ `código`, enlaces y menciones
export function richText(text, mentionNames = {}) {
  let s = esc(text);
  s = s.replace(/```([\s\S]+?)```/g, '<code class="blk">$1</code>')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=$|[\s).,!?])/g, '$1<b>$2</b>')
    .replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s).,!?])/g, '$1<i>$2</i>')
    .replace(/(^|[\s(])~([^~\n]+)~(?=$|[\s).,!?])/g, '$1<s>$2</s>')
    .replace(/\bhttps?:\/\/[^\s<]+[^\s<.,;:!?)"']/g, u => `<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`)
    .replace(/@([a-z0-9_.]{3,24})/g, (m, u) => `<span class="mention">@${mentionNames[u] ? esc(mentionNames[u]) : u}</span>`);
  return s;
}
export const onlyEmoji = t => !!t && t.length <= 12 && /^(\p{Extended_Pictographic}|\p{Emoji_Component}|\u200d|\ufe0f|\s)+$/u.test(t) && !/^[\d#*\s]+$/.test(t);
export function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
export const uuid = () => crypto.randomUUID();
export function copyText(t) { navigator.clipboard?.writeText(t).then(() => toast('Copiado'), () => toast('No se pudo copiar')); }
export function download(name, blob) { if (window.__dunaSave) return window.__dunaSave(name, blob); const a = h('a', { href: URL.createObjectURL(blob), download: name }); document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000); }
