// Videos: lo último de canales públicos (feeds RSS de YouTube y Vimeo) reproducido DENTRO de DUNA
// (YouTube en modo privacidad youtube-nocookie, Vimeo con dnt=1). "Ver después" vive solo en este teléfono.
import { h, icon, btn, toast, debounce } from '../../shared/ui.js';
import { ensureCss, feed, local, ago, chips, batched, img, empty, loading } from '../../shared/kit.js';
import { openContent } from '../../shared/reader.js';
import { shareToChat } from '../../shared/share.js';
const CATS = [['tendencias', 'Lo último'], ['noticias', 'Noticias'], ['deportes', 'Deportes'], ['tecnologia', 'Tecnología'], ['ciencia', 'Ciencia'], ['entretenimiento', 'Entretenimiento'], ['cortos', 'Cortos'], ['luego', 'Ver después']];
let cat = 'tendencias', q = '', listEl = null, stopList = null;
const later = () => local.get('videos-later', []);
function toggleLater(it) { const l = later(); const i = l.findIndex(x => x.u === it.u); if (i >= 0) { l.splice(i, 1); toast('Quitado de Ver después'); } else { l.unshift(it); toast('Guardado en Ver después'); } local.set('videos-later', l.slice(0, 100)); return i < 0; }
export const watch = it => openContent({ kind: 'video', url: it.u, title: it.t, sub: it.s, actions: [{ icon: 'clock', label: 'Ver después', fn: () => toggleLater(it) }] });
function card(it) {
  return h('article', { class: 'vd', role: 'listitem', tabindex: 0, onclick: () => watch(it), onkeydown: e => e.key === 'Enter' && watch(it) },
    h('div', { class: 'vd-th' }, img(it.i), h('span', { class: 'vd-play' }, icon('play', 22))),
    h('div', { class: 'vd-txt' }, h('h3', null, it.t), h('small', null, it.s, it.d ? ' · ' + ago(it.d) : '')),
    h('div', { class: 'vd-acts' }, btn('clock', 'Ver después', e => { e.stopPropagation(); toggleLater(it); if (cat === 'luego') load(); }), btn('share', 'Compartir en un chat', e => { e.stopPropagation(); shareToChat(`🎬 ${it.t}\n${it.u}`); })));
}
async function load() {
  stopList?.(); listEl.innerHTML = ''; listEl.append(loading());
  try {
    const items = q ? await feed({ type: 'search', q, what: 'videos' }, 3 * 60e3) : cat === 'luego' ? later() : await feed({ type: 'videos', cat });
    listEl.innerHTML = '';
    if (!items.length) return listEl.append(empty(q ? 'No hay videos con esa búsqueda.' : cat === 'luego' ? 'Aún no guardas videos para ver después.' : 'No hay videos ahora.', 'video'));
    stopList = batched(listEl, items, card, 12);
  } catch (e) { listEl.innerHTML = ''; listEl.append(empty(e.message), h('button', { class: 'btn ghost sm center-b', onclick: load }, 'Reintentar')); }
}
export async function renderVideos(side, head) {
  await ensureCss();
  q = ''; listEl = h('div', { class: 'vd-list', role: 'list', id: 'videos-list' });
  side.append(head('Videos', []), h('div', { class: 'searchbar' }, icon('search', 18), h('input', { type: 'search', placeholder: 'Buscar videos', 'aria-label': 'Buscar videos', oninput: debounce(e => { q = e.target.value.trim(); if (!q || q.length > 1) load(); }, 450) })),
    chips(CATS, cat, c => { cat = c; load(); }), listEl,
    h('p', { class: 'fine center dsc-foot' }, 'Canales públicos: Noticias Caracol, Noticias RCN, RTVC, BBC Mundo, CNN en Español, El Espectador, Win Sports, Xataka TV, Platzi, Date un Vlog, NASA, QuantumFracture, Ciencia de Sofá, NatGeo Latinoamérica, TED, Caracol TV, El Rincón de Giorgio, La Kalle y Vimeo Staff Picks.'));
  load();
}
