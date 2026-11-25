// Noticias: Colombia y el mundo desde los RSS públicos de cada medio (vía la función `descubrir`).
// Todo se lee DENTRO de DUNA (lector limpio + resumen de IA DUNA). Las guardadas viven solo en este teléfono.
import { h, icon, btn, toast, debounce, menu } from '../../shared/ui.js';
import { ensureCss, feed, local, ago, chips, batched, img, empty, loading } from '../../shared/kit.js';
import { openContent } from '../../shared/reader.js';
import { shareToChat } from '../../shared/share.js';
export const CATS = [['portada', 'Portada'], ['colombia', 'Colombia'], ['mundo', 'Mundo'], ['deportes', 'Deportes'], ['tecnologia', 'Tecnología'], ['economia', 'Economía'], ['entretenimiento', 'Entretenimiento'], ['regional', 'Regiones · Putumayo'], ['guardadas', 'Guardadas']];
let cat = 'portada', stopList = null;
const saved = () => local.get('news-saved', []);
const isSaved = u => saved().some(x => x.u === u);
function toggleSave(it) {
  const l = saved(); const i = l.findIndex(x => x.u === it.u);
  if (i >= 0) { l.splice(i, 1); toast('Quitada de guardadas'); } else { l.unshift({ ...it, at: Date.now() }); toast('Guardada para leer después'); }
  local.set('news-saved', l.slice(0, 200)); return i < 0;
}
const share = it => shareToChat(`📰 ${it.t}\n${it.u}`);
export function readNews(it) {
  return openContent({ kind: 'page', url: it.u, title: it.t, sub: it.s, actions: [{ icon: isSaved(it.u) ? 'check' : 'save', label: 'Guardar para después', fn: ctx => { const on = toggleSave(it); const b = ctx.acts.firstChild; b.innerHTML = ''; b.append(icon(on ? 'check' : 'save')); } }] });
}
function card(it, i) {
  const more = e => { e.stopPropagation(); menu([{ icon: 'save', label: isSaved(it.u) ? 'Quitar de guardadas' : 'Guardar para después', action: () => { toggleSave(it); if (cat === 'guardadas') load(); } },
    { icon: 'share', label: 'Compartir en un chat', action: () => share(it) }, { icon: 'sparkle', label: 'Leer con resumen de IA DUNA', action: () => readNews(it) }], e.currentTarget); };
  const hero = i === 0 && it.i;
  return h('article', { class: 'nw' + (hero ? ' hero' : ''), role: 'listitem', tabindex: 0, onclick: () => readNews(it), onkeydown: e => e.key === 'Enter' && readNews(it) },
    hero ? img(it.i, 'nw-img') : null,
    h('div', { class: 'nw-txt' }, h('small', { class: 'nw-src' }, it.s, it.d ? ' · ' + ago(it.d) : ''), h('h3', null, it.t), hero && it.x ? h('p', null, it.x) : null),
    !hero && it.i ? img(it.i, 'nw-th') : null,
    h('button', { class: 'icon-btn nw-more', type: 'button', 'aria-label': 'Opciones', onclick: more }, icon('more', 18)));
}
let box = null, listEl = null, q = '';
async function load() {
  stopList?.(); listEl.innerHTML = ''; listEl.append(loading());
  try {
    const items = q ? await feed({ type: 'search', q }, 3 * 60e3) : cat === 'guardadas' ? saved() : await feed({ type: 'news', cat });
    listEl.innerHTML = '';
    if (!items.length) return listEl.append(empty(q ? 'No encontramos noticias con esa búsqueda.' : cat === 'guardadas' ? 'Aún no guardas noticias. Toca ⋯ en una noticia para guardarla.' : 'No hay noticias ahora.', q ? 'search' : 'channel'));
    stopList = batched(listEl, items, card, 18);
  } catch (e) { listEl.innerHTML = ''; listEl.append(empty(e.message, 'info'), h('button', { class: 'btn ghost sm center-b', onclick: load }, 'Reintentar')); }
}
export async function renderNews(side, head) {
  await ensureCss();
  q = ''; listEl = h('div', { class: 'nw-list', role: 'list', id: 'news-list' });
  const search = h('input', { type: 'search', placeholder: 'Buscar en las noticias', 'aria-label': 'Buscar noticias', oninput: debounce(e => { q = e.target.value.trim(); if (!q || q.length > 1) load(); }, 450) });
  side.append(head('Noticias', [btn('save', 'Guardadas', () => { cat = 'guardadas'; side.querySelector('[data-cat="guardadas"]')?.click(); })]),
    h('div', { class: 'searchbar' }, icon('search', 18), search), chips(CATS, cat, c => { cat = c; load(); }), listEl,
    h('p', { class: 'fine center dsc-foot' }, 'Fuentes: RSS públicos de El Tiempo, Semana, Infobae, Caracol Radio, El Universal, BBC Mundo, DW, France 24, El País, Marca, Portafolio, La República, Xataka, Enter.co, Hipertextual, Mi Putumayo, La Nación, Eje21.'));
  load();
}
