// Radio: emisoras en vivo de Colombia y el mundo desde Radio Browser (API pública, gratis y sin llave; datos de la comunidad).
// Suena en un reproductor persistente (shared/player.js) que sigue activo mientras navegas por DUNA.
import { h, icon, btn, toast, debounce } from '../../shared/ui.js';
import { ensureCss, local, chips, batched, img, empty, loading } from '../../shared/kit.js';
import { play, current, isPlaying, toggle } from '../../shared/player.js';
import { shareToChat } from '../../shared/share.js';
const HOSTS = ['de1.api.radio-browser.info', 'de2.api.radio-browser.info', 'all.api.radio-browser.info'];
const CATS = [['co', 'Colombia'], ['noticias', 'Noticias'], ['salsa', 'Salsa'], ['vallenato', 'Vallenato'], ['tropical', 'Tropical'], ['reggaeton', 'Reggaetón'], ['rock', 'Rock'], ['pop', 'Pop'], ['mundo', 'Mundo'], ['fav', 'Favoritas']];
let cat = 'co', q = '', listEl = null, stopList = null; const mem = new Map();
async function api(path) {
  if (mem.has(path)) return mem.get(path);
  let last; for (const host of HOSTS) {
    try { const r = await fetch(`https://${host}/json/${path}`, { signal: AbortSignal.timeout(8000) }); if (!r.ok) throw new Error(r.status); const j = await r.json(); mem.set(path, j); return j; } catch (e) { last = e; }
  }
  throw new Error('La guía de emisoras no responde ahora. Intenta en un momento.');
}
// Solo emisoras https (las http no suenan dentro de una app segura) y sin HLS
const playable = l => { const seen = new Set(); return l.filter(s => /^https:/.test(s.url_resolved || s.url) && !s.hls && s.lastcheckok !== 0 && !seen.has(s.name.trim().toLowerCase()) && seen.add(s.name.trim().toLowerCase())); };
const base = 'hidebroken=true&order=clickcount&reverse=true&limit=150';
const pathOf = c => c === 'co' ? `stations/search?countrycode=CO&${base}` : c === 'mundo' ? `stations/search?${base}&language=spanish` : c === 'noticias' ? `stations/search?countrycode=CO&tag=news&${base}` : `stations/search?tag=${encodeURIComponent(c)}&${base}`;
const favs = () => local.get('radio-favs', []);
const isFav = id => favs().some(s => s.stationuuid === id);
function toggleFav(s) { const l = favs(); const i = l.findIndex(x => x.stationuuid === s.stationuuid); if (i >= 0) l.splice(i, 1); else l.unshift(pick(s)); local.set('radio-favs', l.slice(0, 100)); toast(i >= 0 ? 'Quitada de favoritas' : 'Añadida a favoritas'); return i < 0; }
const pick = s => ({ stationuuid: s.stationuuid, name: s.name, url: s.url, url_resolved: s.url_resolved, favicon: s.favicon, country: s.country, countrycode: s.countrycode, state: s.state, tags: s.tags, codec: s.codec, bitrate: s.bitrate });
const sub = s => [s.state, s.countrycode === 'CO' ? 'Colombia' : s.country].filter(Boolean).join(', ') || 'En vivo';
export function tune(s) {
  play({ url: s.url_resolved || s.url, title: s.name.trim(), sub: sub(s), art: /^https:/.test(s.favicon || '') ? s.favicon : null });
  // Radio Browser pide contar el clic para ordenar las emisoras populares
  fetch(`https://${HOSTS[0]}/json/url/${s.stationuuid}`).catch(() => {});
  paintPlaying();
}
function paintPlaying() { const c = current(); document.querySelectorAll('.rs').forEach(r => r.classList.toggle('on', !!c && r.dataset.name === c.title)); }
function row(s) {
  const fav = btn(isFav(s.stationuuid) ? 'star' : 'star', isFav(s.stationuuid) ? 'Quitar de favoritas' : 'Añadir a favoritas', e => { e.stopPropagation(); const on = toggleFav(s); fav.classList.toggle('on', on); if (cat === 'fav') load(); });
  fav.classList.toggle('on', isFav(s.stationuuid)); fav.classList.add('rs-fav');
  return h('div', { class: 'rs', role: 'listitem', tabindex: 0, dataset: { name: s.name.trim() }, onclick: () => { const c = current(); if (c && c.title === s.name.trim()) toggle(); else tune(s); }, onkeydown: e => e.key === 'Enter' && tune(s) },
    h('span', { class: 'rs-logo' }, /^https:/.test(s.favicon || '') ? img(s.favicon) : null, icon('headphones', 20)),
    h('div', { class: 'grow' }, h('b', null, s.name.trim()), h('small', null, [sub(s), (s.tags || '').split(',').slice(0, 2).join(' · '), s.bitrate ? s.bitrate + ' kbps' : ''].filter(Boolean).join(' · '))),
    h('span', { class: 'rs-eq', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')), fav,
    btn('share', 'Compartir en un chat', e => { e.stopPropagation(); shareToChat(`📻 Estoy oyendo ${s.name.trim()} en DUNA Radio`); }));
}
async function load() {
  stopList?.(); listEl.innerHTML = ''; listEl.append(loading());
  try {
    const items = cat === 'fav' && !q ? favs() : playable(await api(q ? `stations/search?name=${encodeURIComponent(q)}&${base}` : pathOf(cat)));
    listEl.innerHTML = '';
    if (!items.length) return listEl.append(empty(cat === 'fav' && !q ? 'Marca emisoras con ★ para tenerlas aquí.' : 'No encontramos emisoras.', 'headphones'));
    stopList = batched(listEl, items, row, 25); paintPlaying();
  } catch (e) { listEl.innerHTML = ''; listEl.append(empty(e.message), h('button', { class: 'btn ghost sm center-b', onclick: load }, 'Reintentar')); }
}
export async function renderRadio(side, head) {
  await ensureCss();
  q = ''; listEl = h('div', { class: 'rs-list', role: 'list', id: 'radio-list' });
  side.append(head('Radio', []), h('div', { class: 'searchbar' }, icon('search', 18), h('input', { type: 'search', placeholder: 'Buscar emisora', 'aria-label': 'Buscar emisora', oninput: debounce(e => { q = e.target.value.trim(); if (!q || q.length > 1) load(); }, 450) })),
    chips(CATS, cat, c => { cat = c; load(); }), listEl, h('p', { class: 'fine center dsc-foot' }, 'Guía de emisoras: Radio Browser (radio-browser.info), base de datos comunitaria y abierta.'));
  load();
  if (isPlaying()) paintPlaying();
}
