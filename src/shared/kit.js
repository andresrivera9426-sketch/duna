// Utilidades compartidas por los módulos de Descubrir (se descarga solo cuando se abre uno de ellos)
import { sb } from '../services/sb.js';
import { h, icon } from './ui.js';
/* global __DUNA_V__ */
let cssP = null;
/** Hoja de estilos de Descubrir: se pide solo al abrir un módulo (no pesa en el arranque) */
export function ensureCss() {
  if (cssP) return cssP;
  cssP = new Promise(res => { const l = h('link', { rel: 'stylesheet', href: 'discover.css?v=' + __DUNA_V__ }); l.onload = l.onerror = res; document.head.append(l); });
  return cssP;
}
/** Llama a la función `descubrir` (noticias y videos) con caché de sesión */
export async function feed(body, ttl = 8 * 60e3) {
  const key = 'duna-dsc:' + JSON.stringify(body);
  try { const c = JSON.parse(sessionStorage.getItem(key)); if (c && Date.now() - c.at < ttl) return c.items; } catch {}
  const { data, error } = await sb.functions.invoke('descubrir', { body });
  if (error) { let m = 'No se pudo cargar ahora. Revisa tu conexión.'; try { m = (await error.context.json()).error || m; } catch {} throw new Error(m); }
  try { sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), items: data.items })); } catch {}
  return data.items || [];
}
/** Datos guardados en el teléfono (nada va a Supabase) */
export const local = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem('duna-' + k)) ?? d; } catch { return d; } },
  set: (k, v) => localStorage.setItem('duna-' + k, JSON.stringify(v)),
};
export function ago(iso) {
  if (!iso) return ''; const s = (Date.now() - new Date(iso)) / 1000;
  if (s < 60) return 'ahora'; if (s < 3600) return `hace ${Math.floor(s / 60)} min`; if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  if (s < 7 * 86400) return `hace ${Math.floor(s / 86400)} d`; return new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
}
/** Fila de categorías desplazable */
export function chips(list, cur, pick) {
  const row = h('div', { class: 'chips dsc-chips', role: 'tablist' }, list.map(([id, label]) => h('button', { class: 'chip' + (id === cur ? ' on' : ''), role: 'tab', 'aria-selected': String(id === cur), dataset: { cat: id },
    onclick: e => { row.querySelectorAll('.chip').forEach(c => { c.classList.toggle('on', c === e.currentTarget); c.setAttribute('aria-selected', String(c === e.currentTarget)); }); e.currentTarget.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }); pick(id); } }, label)));
  return row;
}
/** Lista larga: pinta por tandas al acercarse al final (no crea cientos de nodos de golpe) */
export function batched(box, items, row, n = 20) {
  let i = 0; const more = () => { const frag = document.createDocumentFragment(); for (const it of items.slice(i, i + n)) frag.append(row(it, i++)); box.append(frag); if (i < items.length) { box.append(sent); } else sent.remove(); };
  const sent = h('div', { class: 'dsc-sent', 'aria-hidden': 'true' });
  const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { sent.remove(); more(); } }, { rootMargin: '600px' });
  io.observe(sent); more(); return () => io.disconnect();
}
export const img = (src, cls = '') => src ? h('img', { class: cls, src, alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer', onerror: e => e.target.remove() }) : null;
export function empty(text, ic = 'info') { return h('div', { class: 'dsc-empty' }, icon(ic, 34), h('p', null, text)); }
export function loading() { return h('div', { class: 'dsc-skel' }, [0, 1, 2, 3, 4].map(() => h('div', { class: 'sk' }, h('i'), h('div', null, h('b'), h('b'), h('em'))))); }
/** Capa a pantalla completa dentro de la app (mini apps y juegos) */
export async function openApp(title, mount, { sub = '' } = {}) {
  const { openContent } = await import('./reader.js');
  return openContent({ kind: 'app', title, sub, mount });
}
