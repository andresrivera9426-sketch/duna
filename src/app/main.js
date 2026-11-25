import { sb, rpc, avatarUrl } from '../services/sb.js';
import { h, $, icon, btn, logo, toast, menu, confirmDialog, fmtListTime, initials, hue, debounce, sheet } from '../shared/ui.js';
import { loadMessages, loadChatExtras } from '../services/state.js';
import { S, on, emit, loadChats, applyBoot, refreshChat, chatTitle, chatPeer, previewText, tickState, nameOf, decryptMsg, upsertMsg, markDelivered, markRead, setPref, setReaction, loadProfiles, savePrefs } from '../services/state.js';
import { authScreen, restoreKey, unlockSheet } from '../features/auth/auth.js';
import { applyTheme } from '../shared/theme.js';
import { interceptLinks } from '../shared/reader.js';
// El módulo de conversación (chat, redactor, burbujas, stickers) se carga al abrir un chat o en reposo tras arrancar
let chatM = null; const chatMod = () => import('../features/chats/chat.js').then(m => (chatM = m));
const openChat = (...a) => chatMod().then(m => m.openChat(...a));
const closeChat = (...a) => chatM ? chatM.closeChat(...a) : chatMod().then(m => m.closeChat(...a));
const rerenderChat = (...a) => chatM?.rerenderChat(...a);
const cleanupMine = (...a) => chatMod().then(m => m.cleanupMine(...a));
import { NAV, MODULES, registerNav, registerModule, moduleOf, navOf } from './sections.js';
import { IA_ID, iaAvatar, iaRowPreview, iaInitPreview } from '../features/ia/ia-lite.js';
import { avatar, chatAvatar, ticks, beep } from '../shared/people.js';
export { avatar, chatAvatar, ticks, beep };
// Carga diferida: cada sección/mini-app se descarga solo cuando se usa (code splitting)
const lazy = (load, name) => (...a) => load().then(m => m[name](...a));
const L = { newchat: () => import('../features/chats/newchat.js'), stories: () => import('../features/discover/stories.js'), communities: () => import('../features/discover/communities.js'),
  calls: () => import('../features/calls/calls.js'), settings: () => import('../features/settings/settings.js'), ia: () => import('../features/ia/ia.js'), native: () => import('../services/native.js') };
const newChatSheet = lazy(L.newchat, 'newChatSheet'), newGroupSheet = lazy(L.newchat, 'newGroupSheet'), openInvite = lazy(L.newchat, 'openInvite'), openUserLink = lazy(L.newchat, 'openUserLink');
const renderUpdates = lazy(L.stories, 'renderUpdates'), onStoryInsert = lazy(L.stories, 'onStoryInsert'), renderCommunities = lazy(L.communities, 'renderCommunities');
const renderCalls = lazy(L.calls, 'renderCalls'), onCallEvent = lazy(L.calls, 'onCallEvent'), initCalls = lazy(L.calls, 'initCalls');
export const openSettings = lazy(L.settings, 'openSettings'); const cleanupOrphans = lazy(L.settings, 'cleanupOrphans');
export const openIA = lazy(L.ia, 'openIA');
// En la app nativa el puente de Capacitor existe antes de cargar el JS; en la web no se descarga nada nativo
const isNative = () => !!window.Capacitor?.isNativePlatform?.();
const nativeEarly = () => { if (!isNative()) return; document.documentElement.classList.add('native', 'native-' + window.Capacitor.getPlatform()); L.native().then(m => m.nativeEarly()); }, nativeStart = lazy(L.native, 'nativeStart'), syncChatKeys = lazy(L.native, 'syncChatKeys'),
  unregisterDevice = lazy(L.native, 'unregisterDevice'), nativeInfo = lazy(L.native, 'nativeInfo'), enableNativeNotifications = lazy(L.native, 'enableNativeNotifications');

let filter = 'all', showArchived = false, query = '';
// Navegación principal: Chats · Descubrir · Llamadas · IA · Perfil (ver sections.js)
registerNav({ id: 'chats', icon: 'chat', label: 'Chats', order: 10 });
registerNav({ id: 'discover', icon: 'compass', label: 'Descubrir', order: 20, go: () => setTab(S.lastDiscover || MODULES.find(m => !m.soon)?.id) });
registerNav({ id: 'calls', icon: 'call', label: 'Llamadas', order: 30 });
registerNav({ id: 'ia', icon: 'sparkle', label: 'IA', order: 40, go: () => { if (S.tab !== 'chats') setTab('chats'); openIA(); } });
registerNav({ id: 'me', icon: 'user', label: 'Perfil', order: 50, go: () => openSettings('profile') });
// Descubrir (super-app): cada módulo se descarga solo al abrirlo (code splitting); aquí solo queda su ficha
const M = { news: () => import('../features/news/news.js'), videos: () => import('../features/videos/videos.js'), radio: () => import('../features/radio/radio.js'),
  apps: () => import('../features/miniapps/registry.js'), games: () => import('../features/games/games.js'), moments: () => import('../features/moments/moments.js') };
registerModule({ id: 'moments', label: 'Momentos', icon: 'image', order: 5, render: lazy(M.moments, 'renderMoments') });
registerModule({ id: 'updates', label: 'Estados', icon: 'status', order: 10, render: renderUpdates });
registerModule({ id: 'news', label: 'Noticias', icon: 'news', order: 20, render: lazy(M.news, 'renderNews') });
registerModule({ id: 'videos', label: 'Videos', icon: 'video', order: 30, render: lazy(M.videos, 'renderVideos') });
registerModule({ id: 'radio', label: 'Radio', icon: 'headphones', order: 40, render: lazy(M.radio, 'renderRadio') });
registerModule({ id: 'apps', label: 'Mini apps', icon: 'grid', order: 50, render: lazy(M.apps, 'renderApps') });
registerModule({ id: 'games', label: 'Juegos', icon: 'game', order: 60, render: lazy(M.games, 'renderGames') });
registerModule({ id: 'communities', label: 'Comunidades', icon: 'community', order: 70, render: renderCommunities });
registerModule({ id: 'pay', label: 'DUNA Pay', icon: 'wallet', order: 90, soon: true });

function renderShell() {
  document.body.innerHTML = '';
  const app = h('div', { id: 'app', class: 'app' },
    h('nav', { class: 'rail', 'aria-label': 'Secciones' },
      h('div', { class: 'rail-logo' }, logo(38)),
      NAV.filter(n => n.id !== 'me').map(n => tabBtn(n)),
      h('div', { class: 'grow' }),
      h('button', { class: 'rail-btn', title: 'Ajustes', 'aria-label': 'Ajustes', onclick: () => openSettings() }, icon('settings')),
      h('button', { class: 'rail-me', title: 'Mi perfil', onclick: () => openSettings('profile') }, avatar(S.me, 36))),
    h('section', { class: 'side', id: 'side' }),
    h('main', { class: 'pane', id: 'pane' }, emptyPane()),
    h('nav', { class: 'tabs', 'aria-label': 'Secciones' }, NAV.map(n => tabBtn(n, true))));
  document.body.append(app);
  renderSide();
}
function tabBtn(n, mobile) {
  const on = navOf(S.tab) === n.id;
  return h('button', { class: (mobile ? 'tab' : 'rail-btn') + (on ? ' on' : ''), dataset: { tab: n.id, nav: n.id }, 'aria-label': n.label, title: n.label, 'aria-current': on ? 'page' : null, onclick: () => n.go ? n.go() : setTab(n.id) },
    n.id === 'me' && mobile ? avatar(S.me, 26) : icon(n.icon, mobile ? 22 : 24), mobile ? h('span', null, n.label) : null, h('b', { class: 'badge', dataset: { badge: n.id } }));
}
export function setTab(t) {
  S.tab = t; if (moduleOf(t)) S.lastDiscover = t;
  const nv = navOf(t); document.querySelectorAll('[data-nav]').forEach(b => { b.classList.toggle('on', b.dataset.nav === nv); b.toggleAttribute('aria-current', b.dataset.nav === nv); });
  renderSide();
}
function emptyPane() {
  return h('div', { class: 'empty-pane' }, h('div', { class: 'empty-art' }, logo(96)), h('h2', null, 'DUNA para web'),
    h('p', null, 'Envía y recibe mensajes, notas de voz, fotos y llamadas desde cualquier dispositivo. Abre un chat para empezar.'),
    h('p', { class: 'fine' }, icon('lock', 14), ' Los chats individuales están cifrados de extremo a extremo.'));
}
export function showEmptyPane() { const p = $('#pane'); if (p) { p.innerHTML = ''; p.append(emptyPane()); } }

function sideHeader(title, actions) {
  return h('header', { class: 'side-head' }, h('div', { class: 'brand' }, S.tab === 'chats' ? logo(30) : null, h('h1', null, title)), h('div', { class: 'acts' }, actions));
}
export function renderSide() {
  const side = $('#side'); if (!side) return;
  side.innerHTML = '';
  if (S.tab === 'chats') renderChatsSide(side);
  else if (S.tab === 'calls') renderCalls(side, sideHeader);
  else if (moduleOf(S.tab)) renderDiscover(side, moduleOf(S.tab));
  updateBadges();
}
// Descubrir: contenedor de módulos (estados, comunidades y, más adelante, noticias, videos, radio, juegos, mini-apps)
function renderDiscover(side, mod) {
  side.append(sideHeader('Descubrir', []),
    h('div', { class: 'modules', role: 'tablist', 'aria-label': 'Secciones de Descubrir' }, MODULES.map(m => h('button', {
      class: 'mod' + (m.id === mod.id ? ' on' : '') + (m.soon ? ' soon' : ''), role: 'tab', 'aria-selected': String(m.id === mod.id), dataset: m.soon ? {} : { tab: m.id },
      disabled: m.soon ? true : null, title: m.soon ? m.label + ' · próximamente' : m.label, onclick: () => !m.soon && setTab(m.id) },
      h('span', { class: 'mod-ic' }, icon(m.icon, 20)), h('small', null, m.label), m.soon ? h('em', null, 'Pronto') : null))));
  const box = h('div', { class: 'mod-body' }); side.append(box);
  mod.render(box, (title, actions) => h('header', { class: 'mod-head' }, h('h2', null, title), h('div', { class: 'acts' }, actions)));
}
function renderChatsSide(side) {
  const listEl = h('div', { class: 'list', id: 'chat-list', role: 'list' });
  // Al tocar una fila (antes del clic) ya se piden el módulo de chat y sus mensajes: se gana el tiempo del gesto
  listEl.addEventListener('pointerdown', warmChat, { passive: true });
  const search = h('input', { type: 'search', placeholder: 'Buscar chats o mensajes', value: query, 'aria-label': 'Buscar', oninput: debounce(e => { query = e.target.value; renderList(listEl); }, 120) });
  side.append(
    sideHeader('DUNA', [
      btn('camera', 'Nuevo estado', () => { setTab('updates'); setTimeout(() => $('#new-story')?.click(), 50); }),
      btn('more', 'Menú', e => menu([
        { icon: 'community', label: 'Nuevo grupo', action: () => newGroupSheet() },
        { icon: 'channel', label: 'Nuevo canal', action: () => newGroupSheet('channel') },
        { icon: 'broadcast', label: 'Listas de difusión', action: () => import('../features/chats/extras.js').then(m => m.broadcastSheet()) },
        { icon: 'star', label: 'Mensajes destacados', action: () => import('../features/settings/settings.js').then(m => m.starredSheet()) },
        { icon: 'check2', label: 'Marcar todo como leído', action: () => { for (const c of S.chats.values()) if (c.unread || c.marked_unread) markRead(c.id); } },
        { icon: 'settings', label: 'Ajustes', action: () => openSettings() },
      ], e.currentTarget)),
    ]),
    h('p', { class: 'hello' }, greet(), S.me?.display_name ? ', ' + S.me.display_name.split(' ')[0] : ''),
    h('div', { class: 'searchbar' }, icon('search', 18), search),
    quickActions(),
    h('div', { class: 'chips', role: 'tablist' }, ['all:Todos', 'unread:No leídos', 'fav:Favoritos', 'groups:Grupos', 'direct:Personas', ...usedLabels().filter(l => l !== 'Favoritos').map(l => 'lbl=' + l + ':' + l)].map(x => {
      const i = x.lastIndexOf(':'); const k = x.slice(0, i), l = x.slice(i + 1); const n = filterCount(k);
      return h('button', { class: 'chip' + (filter === k ? ' on' : ''), role: 'tab', 'aria-selected': String(filter === k), dataset: { filter: k }, onclick: () => { filter = k; renderSide(); } }, k.startsWith('lbl=') ? icon('tag', 13) : null, l, n ? h('em', { class: 'chip-n' }, n > 99 ? '99+' : n) : null);
    })),
    listEl,
    h('button', { class: 'fab', id: 'fab-new', title: 'Nuevo chat', 'aria-label': 'Nuevo chat', onclick: () => newChatSheet() }, icon('plus', 26)));
  renderList(listEl);
}
function warmChat(e) {
  const id = e.target.closest?.('.chat-row')?.dataset.chat; if (!id || id === IA_ID) return;
  chatMod().catch(() => {});
  if (S.msgs.has(id) && S.extrasAt?.get(id)) return;
  (S.warmP ||= new Map()); if (S.warmP.has(id)) return;
  S.warmP.set(id, Promise.all([loadMessages(id), loadChatExtras(id).then(() => (S.extrasAt ||= new Map()).set(id, Date.now()))]).finally(() => setTimeout(() => S.warmP.delete(id), 3000)));
}
function greet() { const hr = new Date().getHours(); return hr < 12 ? 'Buenos días' : hr < 19 ? 'Buenas tardes' : 'Buenas noches'; }
function filterCount(k) {
  const all = [...S.chats.values()].filter(c => c.type !== 'community' && !c.archived);
  if (k === 'unread') return all.filter(c => c.unread > 0 || c.marked_unread).length;
  return 0;
}
// Accesos rápidos (reemplazan al menú escondido): nuevo chat, grupo, IA DUNA, estado y llamadas
function quickActions() {
  const qa = (ic, label, fn, cls = '') => h('button', { class: 'qa ' + cls, onclick: fn }, h('span', { class: 'qa-ic' }, icon(ic, 20)), h('small', null, label));
  return h('div', { class: 'quick', role: 'toolbar', 'aria-label': 'Accesos rápidos' },
    qa('plus', 'Nuevo chat', () => newChatSheet(), 'qa-main'),
    qa('sparkle', 'IA DUNA', () => openIA(), 'qa-ia'),
    qa('community', 'Grupo', () => newGroupSheet()),
    qa('camera', 'Estado', () => { setTab('updates'); setTimeout(() => $('#new-story')?.click(), 50); }),
    qa('call', 'Llamadas', () => setTab('calls')));
}
function renderList(listEl) {
  listEl = listEl || $('#chat-list'); if (!listEl) return;
  listEl.innerHTML = '';
  let chats = [...S.chats.values()].filter(c => c.type !== 'community');
  const archived = chats.filter(c => c.archived);
  const q = query.trim().toLowerCase();
  if (q) chats = chats.filter(c => chatTitle(c).toLowerCase().includes(q) || previewText(c.last_message).toLowerCase().includes(q));
  else chats = chats.filter(c => showArchived ? c.archived : !c.archived);
  if (filter === 'unread') chats = chats.filter(c => c.unread > 0 || c.marked_unread);
  if (filter === 'groups') chats = chats.filter(c => c.type === 'group' || c.type === 'channel');
  if (filter === 'fav') chats = chats.filter(c => (c.labels || []).includes('Favoritos'));
  if (filter.startsWith('lbl=')) chats = chats.filter(c => (c.labels || []).includes(filter.slice(4)));
  if (filter === 'direct') chats = chats.filter(c => c.type === 'direct');
  chats.sort((a, b) => (!!b.pinned_at - !!a.pinned_at) || (b.pinned_at && a.pinned_at ? new Date(b.pinned_at) - new Date(a.pinned_at) : 0) || new Date(b.last_message_at) - new Date(a.last_message_at));
  if (showArchived) listEl.append(h('button', { class: 'archived-row', onclick: () => { showArchived = false; renderList(); } }, icon('back', 18), ' Archivados'));
  else if (archived.length && !q) listEl.append(h('button', { class: 'archived-row', onclick: () => { showArchived = true; renderList(); } }, icon('archive', 18), h('span', null, 'Archivados'), h('b', null, archived.length)));
  if (!chats.length) listEl.append(h('div', { class: 'list-empty' }, q ? 'Sin resultados' : filter === 'all' ? h('div', null, h('p', null, 'Aún no tienes chats.'), h('button', { class: 'btn primary', onclick: () => newChatSheet() }, 'Empezar un chat')) : 'Nada por aquí'));
  const pb = pushBanner(); if (pb && !q) listEl.prepend(pb);
  if (!showArchived && (filter === 'all' || filter === 'fav') && (!q || 'ia duna asistente'.includes(q) || iaRowPreview().toLowerCase().includes(q))) {
    const e = listEl.querySelector('.list-empty'); if (e && !q) e.remove();
    listEl.insertBefore(iaRow(), pb && !q ? pb.nextSibling : listEl.querySelector('.chat-row'));
  }
  // Secciones: "Fijados" (IA DUNA y los fijados) y "Recientes"
  const ia = listEl.querySelector('.ia-row'), pinned = chats.filter(c => c.pinned_at), rest = chats.filter(c => !c.pinned_at);
  const label = t => h('div', { class: 'sec-label', role: 'presentation' }, t);
  if (ia || pinned.length) { (ia ? listEl.insertBefore(label('Fijados'), ia) : listEl.append(label('Fijados'))); }
  for (const c of pinned) listEl.append(chatRow(c));
  if (rest.length && (ia || pinned.length)) listEl.append(label('Recientes'));
  // Listas largas: se pintan por tandas a medida que se hace scroll (no cientos de filas de golpe)
  const BATCH = 40; let i = 0;
  const more = () => { const end = Math.min(rest.length, i + BATCH); for (; i < end; i++) listEl.append(chatRow(rest[i]));
    if (i < rest.length) { const s = h('div', { class: 'list-more', 'aria-hidden': 'true' }); listEl.append(s);
      const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); s.remove(); more(); } }, { root: listEl, rootMargin: '600px' }); io.observe(s); } };
  more();
}
function pushBanner() {
  if (isNative()) {
    if (S.prefs.pushBannerOff || S._nativeNotifOk) return null;
    if (S._nativeNotifOk === undefined) { S._nativeNotifOk = true; nativeInfo().then(i => { S._nativeNotifOk = !!(i?.notifications && (i.fcm || i.battery)); if (!S._nativeNotifOk) renderList(); }); return null; }
    return h('div', { class: 'push-banner', id: 'push-banner' }, icon('bell', 20),
      h('div', { class: 'grow' }, h('b', null, 'Activa las notificaciones'), h('small', null, 'Permite notificaciones y que DUNA funcione en segundo plano para recibir mensajes y llamadas con la app cerrada.')),
      h('button', { class: 'btn primary sm', id: 'push-banner-on', onclick: async () => { await enableNativeNotifications().catch(e => toast(e.message)); savePrefs(); S._nativeNotifOk = undefined; setTimeout(renderList, 1500); } }, 'Activar'),
      h('button', { class: 'icon-btn', 'aria-label': 'Ocultar', onclick: () => { S.prefs.pushBannerOff = true; savePrefs(); renderList(); } }, icon('x', 18)));
  }
  const sup = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (!sup || S.prefs.push || S.prefs.pushBannerOff || Notification.permission === 'denied') return null;
  return h('div', { class: 'push-banner', id: 'push-banner' }, icon('bell', 20),
    h('div', { class: 'grow' }, h('b', null, 'Activa las notificaciones'), h('small', null, 'Para recibir avisos de mensajes con DUNA cerrada o el equipo en reposo.')),
    h('button', { class: 'btn primary sm', id: 'push-banner-on', onclick: async () => { try { const a = await import('../features/auth/account.js'); await a.enablePush(); toast('Notificaciones activadas'); } catch (e) { toast(e.message); } renderList(); } }, 'Activar'),
    h('button', { class: 'icon-btn', 'aria-label': 'Ocultar', onclick: () => { S.prefs.pushBannerOff = true; savePrefs(); renderList(); } }, icon('x', 18)));
}
function usedLabels() { const set = new Set(); for (const c of S.chats.values()) (c.labels || []).forEach(l => set.add(l)); return [...set].sort(); }
// Fila fija de IA DUNA (asistente con IA), siempre arriba de la lista
function iaRow() {
  const l = S.iaLast; const typing = S.typing.get(IA_ID);
  return h('div', { class: 'chat-row ia-row' + (S.current === IA_ID ? ' active' : ''), role: 'listitem', tabindex: 0, dataset: { chat: IA_ID },
    onclick: () => openIA(), onkeydown: e => e.key === 'Enter' && openIA() },
    iaAvatar(50),
    h('div', { class: 'row-main' },
      h('div', { class: 'row-top' }, h('span', { class: 'title' }, 'IA DUNA', h('span', { class: 'ia-tag' }, 'IA')), h('span', { class: 'time' }, l ? fmtListTime(l.at) : '')),
      h('div', { class: 'row-bot' }, typing ? h('span', { class: 'typing-txt' }, typing) : h('span', { class: 'prev' }, iaRowPreview()), h('span', { class: 'flags' }, icon('pin', 15)))));
}
function chatRow(c) {
  const m = c.last_message;
  const typing = S.typing.get(c.id);
  const muted = c.muted_until && new Date(c.muted_until) > new Date();
  const prev = typing ? h('span', { class: 'typing-txt' }, typing) : h('span', { class: 'prev' },
    m && m.sender_id === S.user.id && m.kind !== 'system' && !m.deleted_for_all ? ticks({ ...m, chat_id: c.id }, 15) : null,
    m && c.type !== 'direct' && m.sender_id && m.sender_id !== S.user.id && m.kind !== 'system' ? nameOf(m.sender_id) + ': ' : '',
    c.disappearing_seconds ? icon('timer', 13, 'mini') : null,
    previewText(m) || (c.type === 'direct' ? 'Cifrado de extremo a extremo' : c.description || ''));
  const row = h('div', { class: 'chat-row' + (S.current === c.id ? ' active' : ''), role: 'listitem', tabindex: 0, dataset: { chat: c.id },
    onclick: () => openChat(c.id), onkeydown: e => e.key === 'Enter' && openChat(c.id),
    oncontextmenu: e => { e.preventDefault(); rowMenu(c, { x: e.clientX, y: e.clientY }); } },
    chatAvatar(c, 50),
    h('div', { class: 'row-main' },
      h('div', { class: 'row-top' }, h('span', { class: 'title' }, chatTitle(c), c.type === 'channel' ? icon('channel', 14, 'mini') : null), h('span', { class: 'time' + (c.unread ? ' hot' : '') }, m ? fmtListTime(m.created_at) : '')),
      h('div', { class: 'row-bot' }, prev, h('span', { class: 'flags' },
        (c.labels || []).length ? h('span', { class: 'lbl-dot', title: c.labels.join(', ') }, icon('tag', 13)) : null,
        muted ? icon('belloff', 15) : null, c.pinned_at ? icon('pin', 15) : null,
        c.unread ? h('b', { class: 'count' + (muted ? ' muted' : '') }, c.unread > 99 ? '99+' : c.unread) : c.marked_unread ? h('b', { class: 'count dot' }) : null))));
  let lp; row.addEventListener('touchstart', e => { lp = setTimeout(() => { navigator.vibrate?.(15); rowMenu(c, row); }, 520); }, { passive: true });
  ['touchend', 'touchmove'].forEach(ev => row.addEventListener(ev, () => clearTimeout(lp), { passive: true }));
  return row;
}
export function rowMenu(c, anchor) {
  const muted = c.muted_until && new Date(c.muted_until) > new Date();
  menu([
    { icon: 'archive', label: c.archived ? 'Desarchivar' : 'Archivar', action: () => setPref(c.id, { archived: !c.archived }).then(() => toast(c.archived ? 'Chat archivado' : 'Chat desarchivado')) },
    { icon: 'pin', label: c.pinned_at ? 'Desfijar' : 'Fijar chat', action: () => {
      if (!c.pinned_at && [...S.chats.values()].filter(x => x.pinned_at).length >= 3) return toast('Puedes fijar hasta 3 chats');
      setPref(c.id, { pinned_at: c.pinned_at ? null : new Date().toISOString() }); } },
    { icon: muted ? 'bell' : 'belloff', label: muted ? 'Activar notificaciones' : 'Silenciar', action: () => muteMenu(c, anchor) },
    { icon: 'tag', label: 'Etiquetar', action: () => import('../features/chats/extras.js').then(x => x.labelSheet(c)) },
    { icon: 'unread', label: c.unread || c.marked_unread ? 'Marcar como leído' : 'Marcar como no leído', action: () => c.unread || c.marked_unread ? markRead(c.id) : setPref(c.id, { marked_unread: true }) },
    '-',
    { icon: 'trash', label: c.type === 'direct' ? 'Eliminar chat' : 'Vaciar chat', danger: true, action: async () => {
      if (await confirmDialog('Se borrarán los mensajes de este chat solo en tus dispositivos.', 'Eliminar', true)) { await setPref(c.id, { cleared_at: new Date().toISOString(), archived: c.type === 'direct' && !c.last_message ? true : c.archived }); S.msgs.delete(c.id); c.last_message = null; c.unread = 0; emit('chats'); if (S.current === c.id) openChat(c.id); }
    } },
  ], anchor);
}
export function muteMenu(c, anchor) {
  const muted = c.muted_until && new Date(c.muted_until) > new Date();
  if (muted) return setPref(c.id, { muted_until: null }).then(() => toast('Notificaciones activadas'));
  const set = ms => setPref(c.id, { muted_until: new Date(Date.now() + ms).toISOString() }).then(() => toast('Chat silenciado'));
  setTimeout(() => menu([{ label: '8 horas', action: () => set(8 * 36e5) }, { label: '1 semana', action: () => set(7 * 864e5) }, { label: 'Siempre', action: () => set(100 * 365 * 864e5) }], anchor), 10);
}
export function updateBadges() {
  const unread = [...S.chats.values()].filter(c => !c.archived && (c.unread || c.marked_unread) && c.type !== 'community').length;
  document.querySelectorAll('[data-badge="chats"]').forEach(b => { b.textContent = unread || ''; b.hidden = !unread; });
  document.querySelectorAll('[data-badge]:not([data-badge="chats"])').forEach(b => { if (!b.textContent) b.hidden = true; });
  document.title = unread ? `(${unread}) DUNA` : 'DUNA';
  navigator.setAppBadge?.(unread || 0).catch?.(() => {});
}

// ===== Tiempo real =====
let rtChannel;
function startRealtime() {
  rtChannel = sb.channel('db:' + S.user.id)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, p => onMessage(p.new))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, p => onMessageUpdate(p.new))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_members' }, p => onMember(p))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, p => {
      const r = p.eventType === 'DELETE' ? p.old : p.new; if (!r?.message_id) return;
      setReaction(r.message_id, r.user_id, p.eventType === 'DELETE' ? null : r.emoji); rerenderChat(r.chat_id || S.current, r.message_id);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'poll_votes' }, p => {
      const r = p.eventType === 'DELETE' ? p.old : p.new; if (!r?.message_id) return;
      const arr = (S.votes.get(r.message_id) || []).filter(v => !(v.user_id === r.user_id && v.option_idx === r.option_idx));
      if (p.eventType !== 'DELETE') arr.push(r); S.votes.set(r.message_id, arr); rerenderChat(r.chat_id || S.current, r.message_id);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_pins' }, p => {
      const r = p.eventType === 'DELETE' ? p.old : p.new; const cid = r.chat_id || S.current; if (!cid) return;
      const arr = (S.pins.get(cid) || []).filter(x => x !== r.message_id); if (p.eventType !== 'DELETE') arr.push(r.message_id); S.pins.set(cid, arr); rerenderChat(cid);
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chats' }, p => { if (S.chats.has(p.new.id)) refreshChat(p.new.id).then(() => S.current === p.new.id && rerenderChat(p.new.id, null, true)); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'calls' }, p => onCallEvent(p))
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'stories' }, p => onStoryInsert(p.new))
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'view_once_opens' }, p => { S.vo.add(p.new.message_id); rerenderChat(S.current, p.new.message_id); })
    .subscribe(st => {
      if (st === 'SUBSCRIBED') { document.body.classList.remove('offline'); if (rtWasUp) resync('reconexión'); rtWasUp = true; }
      if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT' || st === 'CLOSED') document.body.classList.add('offline');
    });
}
// Resincroniza con el servidor: Realtime no reenvía lo que pasó mientras la conexión estaba caída
// (cambio de Wi-Fi a datos, pestaña dormida, PC suspendido). Sin esto, esos mensajes no aparecían.
let rtWasUp = false, syncing = null, lastSync = 0;
export function resync(reason) {
  if (syncing) return syncing;
  syncing = (async () => {
    try {
      await loadChats();
      for (const c of S.chats.values()) if (c.unread > 0) markDelivered(c.id);
      const id = S.current;
      if (id && S.chats.has(id)) {
        await Promise.all([loadMessages(id), loadChatExtras(id).catch(() => {})]);
        if (S.current === id) { rerenderChat(id, null, true); if (document.visibilityState === 'visible') markRead(id); }
      }
      emit('chats'); lastSync = Date.now(); window.__duna.lastSync = { at: lastSync, reason };
    } catch (e) { console.warn('resync', reason, e.message); }
    finally { syncing = null; }
  })();
  return syncing;
}
async function onMessage(m) {
  if (!S.chats.has(m.chat_id)) { await refreshChat(m.chat_id); }
  const c = S.chats.get(m.chat_id); if (!c) return;
  await decryptMsg(m, m.chat_id);
  const had = upsertMsg(m);
  if (m.sender_id) await loadProfiles([m.sender_id]);
  c.last_message = m; c.last_message_at = m.created_at;
  const mine = m.sender_id === S.user.id;
  if (!mine) {
    S.typing.delete(m.chat_id);
    const open = S.current === m.chat_id && document.visibilityState === 'visible';
    if (open) markRead(m.chat_id); else { if (m.kind !== 'system') c.unread = (c.unread || 0) + 1; markDelivered(m.chat_id); }
    if (m.kind !== 'system') notify(c, m, open);
  }
  if (S.current === m.chat_id) rerenderChat(m.chat_id, had ? m.id : null, !had);
  emit('chats');
}
async function onMessageUpdate(m) {
  await decryptMsg(m, m.chat_id);
  upsertMsg(m);
  const c = S.chats.get(m.chat_id); if (c?.last_message?.id === m.id) { c.last_message = m; emit('chats'); }
  if (S.current === m.chat_id) rerenderChat(m.chat_id, m.id);
}
async function onMember(p) {
  const r = p.eventType === 'DELETE' ? p.old : p.new;
  if (p.eventType === 'DELETE') {
    if (r.user_id === S.user.id && r.chat_id) { S.chats.delete(r.chat_id); if (S.current === r.chat_id) closeChat(); emit('chats'); }
    else if (r.chat_id) { S.members.get(r.chat_id)?.delete(r.user_id); }
    return;
  }
  if (!S.members.has(r.chat_id)) S.members.set(r.chat_id, new Map());
  S.members.get(r.chat_id).set(r.user_id, r);
  if (p.eventType === 'INSERT' && r.user_id === S.user.id) { await refreshChat(r.chat_id); toast('Te añadieron a ' + chatTitle(S.chats.get(r.chat_id))); }
  if (S.current === r.chat_id) rerenderChat(r.chat_id, null, false, true);
  emit('chats');
}
function notify(c, m, open) {
  const muted = c.muted_until && new Date(c.muted_until) > new Date();
  if (muted) return;
  if (!open && S.prefs.sound !== false) beep(740, 0.15);
  if (S.prefs.push && document.hidden) return; // el servidor envía la notificación push
  if (S.prefs.notif && 'Notification' in window && Notification.permission === 'granted' && (document.hidden || !open)) {
    const title = c.type === 'direct' ? chatTitle(c) : `${chatTitle(c)} · ${nameOf(m.sender_id)}`;
    const body = S.prefs.preview === false ? 'Nuevo mensaje' : previewText(m);
    navigator.serviceWorker?.ready.then(r => r.showNotification(title, { body, tag: c.id, icon: 'icons/icon-192.png', badge: 'icons/badge.png', data: { chat: c.id }, renotify: true })).catch(() => {});
  }
}

// ===== Arranque =====
async function boot() {
  nativeEarly();
  applyTheme();
  interceptLinks();
  if ('serviceWorker' in navigator && !isNative()) {
    const hadCtl = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js').then(reg => { document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); }); setInterval(() => reg.update().catch(() => {}), 30 * 60e3); }).catch(() => {});
    // Si se publica una versión nueva con la app abierta, se recarga sola (si está oculta) o avisa
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (!hadCtl) return; if (document.hidden) location.reload(); else toast(h('span', null, 'Hay una versión nueva de DUNA. ', h('button', { class: 'txt-btn', onclick: () => location.reload() }, 'Actualizar')), 15000); });
    navigator.serviceWorker.addEventListener('message', async e => { if (e.data?.chat) { await openChat(e.data.chat); if (e.data.reply) setTimeout(() => document.getElementById('msg-input')?.focus(), 300); } });
  }
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return showAuth();
  S.user = session.user;
  await start();
}
function showAuth() {
  document.body.innerHTML = '';
  document.body.append(authScreen(() => start()));
}
async function start() {
  document.body.innerHTML = '<div class="splash">' + '<div class="splash-logo"></div><p>Cargando tus chats…</p></div>';
  $('.splash-logo').append(logo(84));
  // Pinta al instante con la copia local (como WhatsApp) y actualiza en segundo plano; si no hay copia, espera una sola llamada.
  let cached = null, fresh = null;
  try {
    const { kvGet } = await import('../services/crypto.js');
    const [cache] = await Promise.all([S._boot ? null : kvGet('boot:' + S.user.id).catch(() => null), S.priv ? null : restoreKey()]);
    if (S._boot) { fresh = S._boot; delete S._boot; await loadChats(fresh); }
    else if (cache?.me && cache.me.id === S.user.id) { cached = cache; await applyBoot(cache); }
    else { await loadChats(); }
  } catch (e) {
    console.error(e);
    if (String(e.message).match(/JWT|token|session/i)) { await sb.auth.signOut(); return showAuth(); }
    document.body.innerHTML = ''; document.body.append(h('div', { class: 'splash' }, h('p', null, 'No pudimos conectar: ' + e.message), h('button', { class: 'btn primary', onclick: () => location.reload() }, 'Reintentar')));
    return;
  }
  if (cached) loadChats().catch(e => { console.warn('actualizar chats', e); if (String(e.message).match(/JWT|token/i)) { sb.auth.signOut().then(showAuth); } });
  renderShell();
  startRealtime(); initCalls().catch(e => console.warn('llamadas', e));
  on('chats', () => { if (S.tab === 'chats') renderList(); updateBadges(); });
  on('profiles', debounce(() => { if (S.tab === 'chats') renderList(); }, 80));
  on('typing', () => S.tab === 'chats' && renderList());
  markDeliveredAll();
  iaInitPreview().catch(() => {});
  heartbeat(); setInterval(heartbeat, 30000);
  setInterval(() => { if (document.visibilityState === 'visible') refreshPresence(); }, 25000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { heartbeat(); resync('visible'); import('../features/calls/calls.js').then(m => m.checkRinging()).catch(() => {}); } });
  window.addEventListener('online', () => resync('online'));
  window.addEventListener('focus', () => { if (Date.now() - lastSync > 15000) resync('focus'); });
  window.addEventListener('pageshow', e => { if (e.persisted) resync('pageshow'); });
  document.addEventListener('resume', () => resync('resume')); // pestaña descongelada (pestañas dormidas de Edge/Chrome, Android)
  // Red de seguridad: si el canal no está unido, o cada 2 min con la app visible, resincroniza
  setInterval(() => { if (document.visibilityState !== 'visible') return; const down = rtChannel && rtChannel.state !== 'joined'; if (down || Date.now() - lastSync > 120000) resync(down ? 'canal caído' : 'periódica'); }, 20000);
  lastSync = Date.now();
  if (!S.priv) setTimeout(() => unlockSheet(sheet, () => loadChats().then(() => S.current && openChat(S.current))), 400);
  setTimeout(() => { cleanupMine().catch(() => {}); cleanupOrphans(true).catch(() => {}); }, 8000);
  route();
  setTimeout(prefetchChats, 1200);
  setTimeout(() => chatMod().catch(() => {}), 400); // el módulo de conversación queda listo apenas se pinta la lista
  window.addEventListener('hashchange', route);
  window.addEventListener('popstate', () => { if (!location.hash.startsWith('#/c/') && S.current && innerWidth < 900) closeChat(true); });
  if (S._newRecoveryP) { const pr = S._newRecoveryP; delete S._newRecoveryP; pr.then(code => code && import('../features/auth/account.js').then(a => a.showRecoveryCode(code, true))); }
  import('../features/auth/account.js').then(a => a.syncPush()).catch(() => {});
  import('../features/chats/extras.js').then(x => x.loadQuickReplies()).catch(() => {});
  if (isNative()) {
    nativeStart({ openChat, closeChat: () => closeChat(), resync, attachFiles: f => import('../features/chats/composer.js').then(m => m.attachFiles(f)) }).catch(e => console.warn(e));
    on('chats', debounce(() => syncChatKeys(), 3000));
  }
}
// Precarga los chats más recientes para que abrirlos sea instantáneo (Realtime los mantiene al día en memoria)
async function prefetchChats() {
  const top = [...S.chats.values()].filter(c => c.type !== 'community' && c.last_message && !S.msgs.has(c.id))
    .sort((a, b) => new Date(b.last_message_at || 0) - new Date(a.last_message_at || 0)).slice(0, 6);
  for (const c of top) {
    if (S.msgs.has(c.id)) continue;
    try { await Promise.all([loadMessages(c.id), loadChatExtras(c.id).then(() => (S.extrasAt ||= new Map()).set(c.id, Date.now()))]); } catch {}
  }
}
function markDeliveredAll() { for (const c of S.chats.values()) if (c.unread) markDelivered(c.id); }
async function heartbeat() { if (document.visibilityState !== 'visible') return; await sb.from('profiles').update({ last_seen: new Date().toISOString() }).eq('id', S.user.id); }
async function refreshPresence() {
  const ids = [...S.chats.values()].filter(c => c.type === 'direct' && c.other_id).map(c => c.other_id);
  if (ids.length) { await loadProfiles(ids, true).catch(() => {}); if (S.current) rerenderChat(S.current, null, false, true); }
}
function route() {
  const hsh = location.hash;
  let m;
  if ((m = hsh.match(/^#\/invitar\/(.+)$/))) { history.replaceState(null, '', location.pathname); openInvite(decodeURIComponent(m[1])); }
  else if ((m = hsh.match(/^#\/vincular\/([A-Z2-9]{10})$/))) { history.replaceState(null, '', location.pathname); import('../features/auth/account.js').then(a => a.linkDeviceSheet(m[1])); }
  else if ((m = hsh.match(/^#\/u\/([a-z0-9_.]+)$/))) { history.replaceState(null, '', location.pathname); openUserLink(m[1]); }
  else if (hsh === '#/c/' + IA_ID && S.current !== IA_ID) openIA(true);
  else if ((m = hsh.match(/^#\/c\/([0-9a-f-]{36})$/)) && S.current !== m[1] && S.chats.has(m[1])) openChat(m[1], true);
}
export async function logout() {
  if (!(await confirmDialog('¿Cerrar sesión en este dispositivo? Tus chats seguirán en tu cuenta.', 'Cerrar sesión', true))) return;
  const { kvDel } = await import('../services/crypto.js'); await kvDel('priv:' + S.user.id); await kvDel('boot:' + S.user.id);
  await (await import('../features/auth/account.js')).disablePush().catch(() => {}); await kvDel('swcfg'); await unregisterDevice().catch(() => {});
  await sb.removeAllChannels(); await sb.auth.signOut(); localStorage.removeItem('duna-prefs'); location.hash = ''; location.reload();
}
window.addEventListener('online', () => document.body.classList.remove('offline'));
window.addEventListener('offline', () => document.body.classList.add('offline'));
window.__duna = window.__duna || {}; window.__duna.S = S;
boot();
