// Visor integrado: todo enlace se abre DENTRO de DUNA (nunca se saca al usuario al navegador).
// - Páginas y noticias → lector limpio (texto traído por la función `ia` en modo "read", sin gastar cupo de IA)
// - Videos (YouTube/Vimeo) → reproductor embebido · Audio/radio (mp3, aac, ogg, streams) → reproductor
// - Imágenes → visor de imagen · Mapas → mapa embebido de OpenStreetMap
// Base para los futuros módulos de noticias, videos, radio y mini-apps: usan openContent({ kind, ... }).
import { sb } from '../services/sb.js';
import { S } from '../services/state.js';
import { h, icon, btn, toast, copyText, esc } from './ui.js';

const VIEWERS = {}; // registro extensible: registerViewer('kind', fn(layer, item))
export function registerViewer(kind, fn) { VIEWERS[kind] = fn; }

export function kindOf(url) {
  let u; try { u = new URL(url); } catch { return null; }
  const host = u.hostname.replace(/^www\.|^m\./, '');
  if (/^(youtube\.com|youtu\.be|youtube-nocookie\.com)$/.test(host)) return 'video';
  if (host === 'vimeo.com') return 'video';
  if (/\.(mp3|aac|m4a|ogg|opus|wav|flac)(\?|$)/i.test(u.pathname) || /\/(stream|live|radio)(\/|$|\.)/i.test(u.pathname) && /(icecast|shoutcast|radio|stream)/i.test(host + u.pathname)) return 'audio';
  if (/\.(mp4|webm|mov)(\?|$)/i.test(u.pathname)) return 'file-video';
  if (/\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(u.pathname)) return 'image';
  if (/openstreetmap\.org$/.test(host) || (host.startsWith('google.') || host === 'maps.google.com') && (u.pathname.startsWith('/maps') || u.searchParams.get('q'))) return 'map';
  return 'page';
}
function ytId(u) { const x = new URL(u); if (x.hostname.endsWith('youtu.be')) return x.pathname.slice(1); if (x.pathname.startsWith('/shorts/') || x.pathname.startsWith('/embed/') || x.pathname.startsWith('/live/')) return x.pathname.split('/')[2]; return x.searchParams.get('v'); }
function latLon(u) {
  const x = new URL(u); let la = x.searchParams.get('mlat'), lo = x.searchParams.get('mlon');
  if (!la) { const q = (x.searchParams.get('q') || '').split(','); if (q.length === 2 && !isNaN(+q[0])) [la, lo] = q; }
  if (!la) { const m = x.hash.match(/map=\d+\/(-?[\d.]+)\/(-?[\d.]+)/); if (m) [, la, lo] = m; }
  return la ? [+la, +lo] : null;
}

/** Abre cualquier URL dentro de la app */
export function openLink(url, extra = {}) {
  if (!/^https?:\/\//i.test(url || '')) return;
  try { const u = new URL(url); if (u.origin === location.origin && u.pathname === location.pathname && u.hash) { location.hash = u.hash; return; } } catch {}
  return openContent({ kind: kindOf(url) || 'page', url, ...extra });
}

let stack = [];
export function openContent(item) {
  const layer = h('div', { class: 'reader', role: 'dialog', 'aria-modal': 'true', 'aria-label': item.title || 'Visor' });
  const close = () => { layer.classList.add('out'); setTimeout(() => layer.remove(), 220); stack = stack.filter(x => x !== layer); document.removeEventListener('keydown', key); };
  const key = e => { if (e.key === 'Escape' && stack[stack.length - 1] === layer) { e.stopPropagation(); close(); } };
  document.addEventListener('keydown', key);
  const title = h('b', { class: 'rd-title' }, item.title || hostOf(item.url) || '');
  const site = h('small', { class: 'rd-site' }, hostOf(item.url) || '');
  const acts = h('div', { class: 'acts' }, item.url ? btn('copy', 'Copiar enlace', () => copyText(item.url)) : null);
  const body = h('div', { class: 'rd-body' });
  layer.append(h('header', { class: 'rd-head' }, btn('back', 'Volver', close), h('div', { class: 'rd-id' }, title, site), acts), body);
  document.body.append(layer); stack.push(layer);
  const ctx = { layer, body, acts, close, setTitle: t => { title.textContent = t; } };
  (VIEWERS[item.kind] || VIEWERS.page)(ctx, item);
  return ctx;
}
const hostOf = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };

// ---------- Lector de páginas ----------
registerViewer('page', async (ctx, item) => {
  ctx.body.append(h('div', { class: 'spinner' }), h('p', { class: 'muted center' }, 'Abriendo dentro de DUNA…'));
  try {
    const { data, error } = await sb.functions.invoke('ia', { body: { mode: 'read', url: item.url } });
    if (error) { let m = 'No se pudo abrir esa página ahora'; try { m = (await error.context.json()).error || m; } catch {} throw new Error(m); }
    ctx.setTitle(data.title || hostOf(item.url));
    ctx.body.innerHTML = '';
    const art = h('article', { class: 'rd-art', html: md(data.text || '') });
    const sumBox = h('div', { class: 'rd-sum' });
    const sumB = h('button', { class: 'btn primary sm', onclick: async () => {
      sumB.disabled = true; sumBox.innerHTML = ''; sumBox.append(h('div', { class: 'spinner sm' }));
      try { const ia = await import('../features/ia/ia.js'); if (!(await ia.iaConsent())) { sumBox.innerHTML = ''; sumB.disabled = false; return; }
        const r = await ia.askIA('article', { text: (data.text || '').slice(0, 20000), title: data.title });
        sumBox.innerHTML = ''; sumBox.append(h('b', null, '✨ Resumen de IA DUNA'), h('div', { class: 'txt', html: md(r.text) }));
      } catch (e) { sumBox.innerHTML = ''; sumBox.append(h('p', { class: 'muted' }, e.message)); }
      sumB.disabled = false; } }, icon('sparkle', 16), ' Resumir con IA DUNA');
    ctx.body.append(h('div', { class: 'rd-wrap' }, h('h1', null, data.title || ''), h('p', { class: 'rd-meta' }, data.site || hostOf(item.url)), h('div', { class: 'rd-tools' }, sumB), sumBox, art));
  } catch (e) { ctx.body.innerHTML = ''; ctx.body.append(h('div', { class: 'rd-wrap' }, h('p', { class: 'muted' }, e.message), h('button', { class: 'btn ghost sm', onclick: () => { ctx.close(); openContent(item); } }, 'Reintentar'))); }
});
// ---------- Video embebido ----------
registerViewer('video', (ctx, item) => {
  const u = new URL(item.url); let src = null;
  if (/vimeo\.com$/.test(u.hostname)) src = 'https://player.vimeo.com/video/' + u.pathname.split('/').filter(Boolean)[0];
  else { const id = ytId(item.url); if (id) src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&playsinline=1&rel=0`; }
  if (!src) return VIEWERS.page(ctx, { ...item, kind: 'page' });
  ctx.layer.classList.add('rd-media');
  ctx.body.append(h('div', { class: 'rd-player' }, h('iframe', { src, allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen', allowfullscreen: true, referrerpolicy: 'strict-origin-when-cross-origin', title: item.title || 'Video' })));
});
registerViewer('file-video', (ctx, item) => { ctx.layer.classList.add('rd-media'); ctx.body.append(h('div', { class: 'rd-player' }, h('video', { src: item.url, controls: true, autoplay: true, playsinline: true }))); });
// ---------- Audio / radio ----------
registerViewer('audio', (ctx, item) => {
  ctx.body.append(h('div', { class: 'rd-wrap rd-audio' }, h('div', { class: 'rd-disc' }, icon('headphones', 48)), h('h2', null, item.title || hostOf(item.url)),
    h('audio', { src: item.url, controls: true, autoplay: true, preload: 'none' })));
});
// ---------- Imagen ----------
registerViewer('image', (ctx, item) => { ctx.layer.classList.add('rd-media'); ctx.body.append(h('div', { class: 'rd-img' }, h('img', { src: item.url, alt: item.title || '' }))); });
// ---------- Mapa ----------
registerViewer('map', (ctx, item) => {
  const ll = item.lat != null ? [item.lat, item.lon] : latLon(item.url);
  if (!ll) return VIEWERS.page(ctx, { ...item, kind: 'page' });
  const [la, lo] = ll, d = 0.006;
  ctx.setTitle(item.title || 'Ubicación'); ctx.layer.classList.add('rd-media');
  ctx.body.append(h('div', { class: 'rd-player rd-map' }, h('iframe', { title: 'Mapa', src: `https://www.openstreetmap.org/export/embed.html?bbox=${lo - d},${la - d},${lo + d},${la + d}&layer=mapnik&marker=${la},${lo}` })),
    h('p', { class: 'fine center' }, `${la.toFixed(5)}, ${lo.toFixed(5)} · © OpenStreetMap`));
});

// Markdown mínimo y seguro (escapa todo y luego da formato); los enlaces siguen abriéndose dentro de la app
export function md(t) {
  const lines = esc(String(t || '')).replace(/!\[[^\]]*\]\([^)]*\)/g, '').split('\n'); let out = '', list = false;
  const inl = s => s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>');
  for (let l of lines) {
    l = l.trimEnd(); const li = l.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)/);
    if (li && !li[1].trim()) continue;
    if (li) { if (!list) { out += '<ul>'; list = true; } out += '<li>' + inl(li[1]) + '</li>'; continue; }
    if (list) { out += '</ul>'; list = false; }
    const hd = l.match(/^(#{1,4})\s+(.*)/);
    if (hd) out += `<h${Math.min(4, hd[1].length + 1)}>${inl(hd[2])}</h${Math.min(4, hd[1].length + 1)}>`;
    else if (/^(-{3,}|={3,})$/.test(l)) out += '<hr>';
    else if (l.trim()) out += '<p>' + inl(l) + '</p>';
  }
  return out + (list ? '</ul>' : '');
}

// Intercepta TODOS los enlaces externos de la app (mensajes, fuentes de IA, vistas previas, mapas…)
export function interceptLinks() {
  document.addEventListener('click', e => {
    if (e.defaultPrevented || e.button > 0 || e.metaKey || e.ctrlKey) return;
    const a = e.target.closest?.('a[href]'); if (!a || a.hasAttribute('download') || a.dataset.external != null) return;
    const href = a.getAttribute('href'); if (!/^https?:\/\//i.test(href)) return;
    e.preventDefault(); openLink(href, { title: a.dataset.title || undefined });
  }, true);
  // window.open(...) también se queda dentro de la app
  const wo = window.open; window.open = (u, t, f) => (/^https?:|^data:image|^blob:/i.test(String(u || '')) && !f) ? (/^(data|blob):/.test(u) ? openContent({ kind: 'image', url: u }) : openLink(String(u)), null) : wo.call(window, u, t, f);
}
