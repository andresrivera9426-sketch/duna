import { sb, rpc } from './sb.js';
import { h, $, icon, btn, menu, toast, confirmDialog, sheet, fmtDay, fmtTime, fmtLastSeen, copyText, debounce, esc } from './ui.js';
import { S, on, emit, chatTitle, chatPeer, loadMessages, loadChatExtras, markRead, nameOf, findMsg, tickState, previewText, setReaction, sendMessage, refreshChat, loadProfiles, setPref, decryptMsg, isE2E } from './state.js';
import { bubble, msgSig, quoteBlock, player } from './bubbles.js';
import { chatAvatar, avatar, renderSide, showEmptyPane, muteMenu, ticks } from './main.js';
import { composer, setReply, setEdit } from './composer.js';
import { openInfo } from './info.js';
import { startCall } from './calls.js';
import { QUICK, EMOJI, recentEmoji } from './stickers.js';
import { mediaBlob, uploadToChat, forgetUrl } from './media.js';

let typingCh = null, nodeCache = new Map(), loadingOlder = false, searchState = null, pinIdx = 0;
export const WALLPAPERS = { arena: 'Arena', noche: 'Noche', oasis: 'Oasis', aurora: 'Aurora', lineas: 'Líneas', liso: 'Liso' };

export async function openChat(id, fromRoute = false) {
  const c = S.chats.get(id); if (!c) return;
  if (c.type === 'community') return import('./communities.js').then(m => m.openCommunity(id));
  S.current = id; searchState = null; pinIdx = 0; nodeCache = new Map();
  if (document.documentElement.classList.contains('native')) import('./native.js').then(n => n.clearChatNotifications(id));
  document.getElementById('app')?.classList.add('in-chat');
  if (!fromRoute && location.hash !== '#/c/' + id) history.pushState(null, '', '#/c/' + id);
  document.querySelectorAll('.chat-row').forEach(r => r.classList.toggle('active', r.dataset.chat === id));
  const pane = $('#pane'); pane.innerHTML = '';
  const wp = c.wallpaper || S.prefs.wallpaper || 'arena';
  const list = h('div', { class: 'msgs', id: 'msgs', role: 'log', 'aria-live': 'polite' }, h('div', { class: 'spinner' }));
  const view = h('div', { class: 'conv wp-' + wp, id: 'conv', dataset: { chat: id } },
    h('header', { class: 'conv-head', id: 'conv-head' }), h('div', { id: 'pinbar' }), h('div', { id: 'searchbar' }),
    list, h('button', { class: 'to-bottom', id: 'to-bottom', hidden: true, 'aria-label': 'Ir al final', onclick: () => scrollBottom(true) }, icon('back', 20), h('b', { id: 'tb-count' })),
    composer(c));
  pane.append(view);
  renderHead();
  list.addEventListener('scroll', onScroll, { passive: true });
  view.addEventListener('dragover', e => { e.preventDefault(); view.classList.add('drop'); });
  view.addEventListener('dragleave', e => { if (e.target === view) view.classList.remove('drop'); });
  view.addEventListener('drop', e => { e.preventDefault(); view.classList.remove('drop'); if (e.dataTransfer.files.length) import('./composer.js').then(m => m.attachFiles([...e.dataTransfer.files])); });
  joinTyping(id);
  try {
    if (!S.msgs.has(id) || S.msgs.get(id).length < 5) await loadMessages(id); else loadMessages(id).then(() => S.current === id && renderMsgs());
    await loadChatExtras(id);
    if (S.stars.size === 0) loadStars();
    const vo = (S.msgs.get(id) || []).filter(m => m.view_once).map(m => m.id);
    if (vo.length) { const { data } = await sb.from('view_once_opens').select('message_id').in('message_id', vo); (data || []).forEach(x => S.vo.add(x.message_id)); }
  } catch (e) { toast('No se pudieron cargar los mensajes: ' + e.message); }
  if (S.current !== id) return;
  renderMsgs(true);
  renderPinbar();
  markRead(id);
  if (c.type === 'direct' && c.other_id) loadProfiles([c.other_id], true).then(renderHead);
}
async function loadStars() { const { data } = await sb.from('message_stars').select('message_id'); (data || []).forEach(x => S.stars.add(x.message_id)); }
export function closeChat(fromPop) {
  if (typingCh) { sb.removeChannel(typingCh); typingCh = null; }
  S.current = null; document.getElementById('app')?.classList.remove('in-chat');
  if (!fromPop && location.hash.startsWith('#/c/')) history.back();
  showEmptyPane(); renderSide();
}
function joinTyping(id) {
  if (typingCh) sb.removeChannel(typingCh);
  typingCh = sb.channel('c:' + id, { config: { private: true, broadcast: { self: false } } })
    .on('broadcast', { event: 'typing' }, ({ payload }) => onTyping(id, payload))
    .subscribe();
}
let lastTyping = 0;
export function sendTyping(kind = 'text') {
  if (!typingCh || Date.now() - lastTyping < 2500) return; lastTyping = Date.now();
  typingCh.send({ type: 'broadcast', event: 'typing', payload: { uid: S.user.id, kind } });
}
const typingTimers = new Map();
export function onTyping(chatId, p) {
  if (!p?.uid || p.uid === S.user.id) return;
  const c = S.chats.get(chatId);
  const label = p.kind === 'audio' ? 'grabando audio…' : 'escribiendo…';
  S.typing.set(chatId, c?.type === 'direct' ? label : nameOf(p.uid) + ' está ' + label);
  clearTimeout(typingTimers.get(chatId));
  typingTimers.set(chatId, setTimeout(() => { S.typing.delete(chatId); emit('typing'); if (S.current === chatId) renderHead(); }, 4000));
  emit('typing'); if (S.current === chatId) renderHead();
}

export function renderHead() {
  const el = $('#conv-head'); const c = S.chats.get(S.current); if (!el || !c) return;
  const peer = chatPeer(c);
  let sub = '';
  if (S.typing.get(c.id)) sub = h('span', { class: 'typing-txt' }, S.typing.get(c.id));
  else if (c.type === 'direct') sub = !c.other_id ? 'Mensajes para ti' : peer?.online ? 'en línea' : peer?.last_seen ? fmtLastSeen(peer.last_seen) : 'toca para ver la info';
  else if (c.type === 'channel') sub = `${c.member_count} seguidor${c.member_count === 1 ? '' : 'es'}`;
  else { const mem = S.members.get(c.id); sub = mem ? [...mem.keys()].map(u => nameOf(u)).sort((a, b) => (a === 'Tú') - (b === 'Tú')).join(', ') : ''; }
  el.innerHTML = '';
  el.append(
    h('button', { class: 'icon-btn back', 'aria-label': 'Volver', onclick: () => closeChat() }, icon('back')),
    h('button', { class: 'head-id', onclick: () => openInfo(c.id) }, chatAvatar(c, 40),
      h('div', null, h('b', null, chatTitle(c), c.disappearing_seconds ? icon('timer', 14, 'mini') : null), h('small', { class: peer?.online ? 'on' : '' }, sub))),
    h('div', { class: 'acts' },
      c.type !== 'channel' && c.other_id !== undefined && (c.type !== 'direct' || c.other_id) ? btn('video', 'Videollamada', () => startCall(c.id, 'video')) : null,
      c.type !== 'channel' && (c.type !== 'direct' || c.other_id) ? btn('call', 'Llamada de voz', () => startCall(c.id, 'audio')) : null,
      btn('search', 'Buscar en el chat', () => openSearch()),
      btn('more', 'Más opciones', e => chatMenu(c, e.currentTarget))));
}
function chatMenu(c, anchor) {
  const muted = c.muted_until && new Date(c.muted_until) > new Date();
  menu([
    { icon: 'info', label: c.type === 'direct' ? 'Info. del contacto' : c.type === 'channel' ? 'Info. del canal' : 'Info. del grupo', action: () => openInfo(c.id) },
    { icon: 'search', label: 'Buscar', action: () => openSearch() },
    { icon: muted ? 'bell' : 'belloff', label: muted ? 'Activar notificaciones' : 'Silenciar notificaciones', action: () => muteMenu(c, anchor) },
    { icon: 'timer', label: 'Mensajes temporales', action: () => disappearingSheet(c) },
    { icon: 'wallpaper', label: 'Fondo de pantalla', action: () => wallpaperSheet(c) },
    { icon: 'calendar', label: 'Mensajes programados', action: () => import('./extras.js').then(x => x.scheduledList(c)) },
    { icon: 'tag', label: 'Etiquetas', action: () => import('./extras.js').then(x => x.labelSheet(c)) },
    { icon: 'download', label: 'Exportar chat', action: () => exportChat(c) },
    { icon: 'trash', label: 'Vaciar chat', danger: true, action: async () => {
      if (!(await confirmDialog('¿Vaciar este chat? Los mensajes se borrarán solo para ti.', 'Vaciar', true))) return;
      await setPref(c.id, { cleared_at: new Date().toISOString() }); S.msgs.set(c.id, []); c.last_message = null; renderMsgs(true); emit('chats');
    } },
  ], anchor);
}
export function disappearingSheet(c) {
  const opts = [[0, 'Desactivados'], [86400, '24 horas'], [604800, '7 días'], [7776000, '90 días']];
  let s; s = sheet('Mensajes temporales', h('div', { class: 'form' },
    h('p', { class: 'muted' }, 'Los mensajes nuevos desaparecerán del chat después del tiempo elegido. Los participantes aún pueden guardar capturas o reenviar.'),
    opts.map(([v, l]) => h('label', { class: 'radio' }, h('input', { type: 'radio', name: 'dis', checked: (c.disappearing_seconds || 0) === v, onchange: async () => {
      try { await rpc('update_chat', { p_chat: c.id, p: { disappearing_seconds: v } }); c.disappearing_seconds = v; s.close(); toast(v ? 'Mensajes temporales activados' : 'Mensajes temporales desactivados'); renderHead(); } catch (e) { toast(e.message); }
    } }), l))));
}
export function wallpaperSheet(c) {
  let s; const pick = async (k) => { if (c) { await setPref(c.id, { wallpaper: k }); const v = $('#conv'); if (v && S.current === c.id) v.className = 'conv wp-' + k; } else { S.prefs.wallpaper = k; (await import('./state.js')).savePrefs(); } s.close(); toast('Fondo actualizado'); };
  s = sheet('Fondo de pantalla', h('div', { class: 'wp-grid' }, Object.entries(WALLPAPERS).map(([k, l]) => h('button', { class: 'wp-swatch wp-' + k, onclick: () => pick(k) }, h('span', null, l))),
    c ? h('button', { class: 'btn ghost', onclick: async () => { await setPref(c.id, { wallpaper: null }); s.close(); openChat(c.id); } }, 'Usar el predeterminado') : null));
}

// ===== Lista de mensajes =====
let renderQueued = false, forceBottom = false;
export function rerenderChat(chatId, msgId, isNew, headerOnly) {
  if (chatId !== S.current) return;
  if (headerOnly && !msgId && !isNew) { renderHead(); }
  if (isNew) { const l = $('#msgs'); if (l && l.scrollHeight - l.scrollTop - l.clientHeight < 160) forceBottom = true; }
  if (renderQueued) return; renderQueued = true;
  const run = () => { if (!renderQueued) return; renderQueued = false; renderMsgs(forceBottom); forceBottom = false; renderPinbar(); };
  requestAnimationFrame(run); setTimeout(run, 250); // en pestañas ocultas requestAnimationFrame no corre
}
on('msgs', id => { if (id === S.current) { forceBottom = true; rerenderChat(id); } });
on('rerender', () => S.current && rerenderChat(S.current));
export function renderMsgs(toBottom) {
  const list = $('#msgs'); const c = S.chats.get(S.current); if (!list || !c) return;
  const arr = (S.msgs.get(S.current) || []).filter(m => !m.expires_at || new Date(m.expires_at) > new Date());
  const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 120;
  const prevH = list.scrollHeight, prevTop = list.scrollTop;
  const nodes = [];
  if (S.more.get(S.current)) nodes.push(cached('more', () => h('div', { class: 'load-more' }, h('div', { class: 'spinner sm' }))));
  if (isE2E(c)) nodes.push(cached('e2e', () => h('div', { class: 'sys e2e' }, h('button', { onclick: () => openInfo(c.id, 'enc') }, icon('lock', 14), ' Los mensajes de este chat están cifrados de extremo a extremo. Solo tú y la otra persona pueden leerlos. Toca para verificar.'))));
  else if (c.type !== 'direct') nodes.push(cached('e2e', () => h('div', { class: 'sys e2e' }, h('span', null, icon('lock', 14), c.type === 'channel' ? ' Canal público: lo pueden ver sus seguidores.' : ' Grupo protegido por permisos del servidor (cifrado en tránsito, no de extremo a extremo).'))));
  let lastDay = '', lastSender = null, lastTime = 0;
  const unreadFrom = c._unreadFrom;
  for (const m of arr) {
    const d = new Date(m.created_at); const day = d.toDateString();
    if (day !== lastDay) { nodes.push(cached('day' + day, () => h('div', { class: 'day' }, h('span', null, fmtDay(d))))); lastDay = day; lastSender = null; }
    if (unreadFrom && m.id === unreadFrom) nodes.push(cached('unread-sep', () => h('div', { class: 'unread-sep' }, h('span', null, 'Mensajes no leídos'))));
    const first = m.kind === 'system' || lastSender !== m.sender_id || d - lastTime > 6 * 60e3;
    lastSender = m.kind === 'system' ? null : m.sender_id; lastTime = +d;
    m._tick = m.sender_id === S.user.id ? tickState(m) : '';
    const sig = msgSig(m) + '|' + first + '|' + (searchState?.q || '');
    const key = m.id;
    let node = nodeCache.get(key);
    if (!node || node._sig !== sig) {
      node = bubble(m, { group: c.type !== 'direct' && c.type !== 'channel', first, onAction: msgAction, scrollTo: scrollToMsg });
      node._sig = sig; nodeCache.set(key, node);
      if (searchState?.q && m.body && m.body.toLowerCase().includes(searchState.q)) highlight(node, searchState.q);
    }
    nodes.push(node);
  }
  if (!arr.length) nodes.push(cached('empty', () => h('div', { class: 'sys' }, h('span', null, c.type === 'direct' ? 'Saluda 👋 Envía el primer mensaje' : 'Aún no hay mensajes'))));
  // reconciliación mínima: no se mueven los nodos que ya están en su lugar
  const spinner = list.querySelector(':scope > .spinner'); if (spinner) spinner.remove();
  let cur = list.firstChild;
  for (const n of nodes) { if (cur === n) { cur = cur.nextSibling; continue; } list.insertBefore(n, cur); }
  while (cur) { const nx = cur.nextSibling; cur.remove(); cur = nx; }
  if (toBottom || nearBottom) scrollBottom(); else if (list.scrollHeight !== prevH && prevTop < 50) list.scrollTop = prevTop + (list.scrollHeight - prevH);
  updateToBottom();
}
function cached(k, make) { let n = nodeCache.get(k); if (!n) { n = make(); nodeCache.set(k, n); } return n; }
function scrollBottom(smooth) { const l = $('#msgs'); if (l) l.scrollTo({ top: l.scrollHeight, behavior: smooth ? 'smooth' : 'auto' }); }
function updateToBottom() {
  const l = $('#msgs'), b = $('#to-bottom'); if (!l || !b) return;
  b.hidden = l.scrollHeight - l.scrollTop - l.clientHeight < 300;
}
async function onScroll(e) {
  const l = e.target; updateToBottom();
  if (l.scrollTop < 80 && !loadingOlder && S.more.get(S.current)) {
    loadingOlder = true; const id = S.current; const arr = S.msgs.get(id) || [];
    try { const h0 = l.scrollHeight, t0 = l.scrollTop; await loadMessages(id, arr[0]?.created_at); await loadChatExtras(id); if (S.current === id) { renderMsgs(); l.scrollTop = t0 + (l.scrollHeight - h0); } }
    finally { loadingOlder = false; }
  }
  if (document.visibilityState === 'visible' && l.scrollHeight - l.scrollTop - l.clientHeight < 40) { const c = S.chats.get(S.current); if (c?.unread) markRead(S.current); }
}
export async function scrollToMsg(id) {
  let el = document.querySelector(`.mrow[data-id="${id}"], .sys[data-id="${id}"]`);
  let tries = 0;
  while (!el && S.more.get(S.current) && tries++ < 20) { const arr = S.msgs.get(S.current); await loadMessages(S.current, arr[0]?.created_at); renderMsgs(); el = document.querySelector(`.mrow[data-id="${id}"]`); }
  if (!el) return toast('El mensaje ya no está disponible');
  el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1600);
}
function highlight(node, q) {
  const t = node.querySelector('.txt'); if (!t) return;
  const walk = document.createTreeWalker(t, NodeFilter.SHOW_TEXT); const hits = [];
  while (walk.nextNode()) { const n = walk.currentNode; const i = n.data.toLowerCase().indexOf(q); if (i >= 0) hits.push([n, i]); }
  for (const [n, i] of hits) { const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + q.length); const mk = document.createElement('mark'); r.surroundContents(mk); }
}

// ===== Barra de fijados =====
function renderPinbar() {
  const bar = $('#pinbar'); if (!bar) return; bar.innerHTML = '';
  const pins = (S.pins.get(S.current) || []).map(id => findMsg(S.current, id)).filter(Boolean);
  if (!pins.length) return;
  const m = pins[pinIdx % pins.length];
  bar.append(h('button', { class: 'pinbar', onclick: () => { scrollToMsg(m.id); pinIdx++; renderPinbar(); } },
    h('span', { class: 'pin-dots' }, pins.map((_, i) => h('i', { class: i === pinIdx % pins.length ? 'on' : '' }))), icon('pin', 16),
    h('span', null, h('b', null, pins.length > 1 ? `Mensaje fijado ${(pinIdx % pins.length) + 1} de ${pins.length}` : 'Mensaje fijado'), h('small', null, previewText(m).slice(0, 90)))));
}

// ===== Búsqueda dentro del chat =====
async function openSearch() {
  const bar = $('#searchbar'); if (!bar) return;
  if (searchState) { closeSearch(); return; }
  searchState = { q: '', hits: [], i: 0 };
  const count = h('small', { class: 'muted' }, '');
  const inp = h('input', { type: 'search', placeholder: 'Buscar en este chat…', 'aria-label': 'Buscar en este chat' });
  const go = async () => {
    const q = inp.value.trim().toLowerCase(); searchState.q = q; nodeCache.clear();
    if (q.length < 2) { searchState.hits = []; count.textContent = ''; renderMsgs(); return; }
    count.textContent = 'Buscando…';
    let n = 0; while (S.more.get(S.current) && n++ < 15) { await loadMessages(S.current, S.msgs.get(S.current)[0]?.created_at); }
    searchState.hits = (S.msgs.get(S.current) || []).filter(m => !m.deleted_for_all && (m.body || '').toLowerCase().includes(q) || (m.media?.name || '').toLowerCase().includes(q)).map(m => m.id);
    searchState.i = searchState.hits.length - 1; renderMsgs();
    count.textContent = searchState.hits.length ? `${searchState.i + 1} de ${searchState.hits.length}` : 'Sin resultados';
    if (searchState.hits.length) scrollToMsg(searchState.hits[searchState.i]);
  };
  const step = d => { if (!searchState.hits.length) return; searchState.i = (searchState.i + d + searchState.hits.length) % searchState.hits.length; count.textContent = `${searchState.i + 1} de ${searchState.hits.length}`; scrollToMsg(searchState.hits[searchState.i]); };
  inp.addEventListener('input', debounce(go, 300));
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') step(e.shiftKey ? 1 : -1); if (e.key === 'Escape') closeSearch(); });
  bar.append(h('div', { class: 'insearch' }, icon('search', 18), inp, count, btn('back', 'Anterior', () => step(-1), 'icon-btn up'), btn('back', 'Siguiente', () => step(1), 'icon-btn down'), btn('x', 'Cerrar búsqueda', closeSearch)));
  inp.focus();
}
function closeSearch() { searchState = null; const bar = $('#searchbar'); if (bar) bar.innerHTML = ''; nodeCache.clear(); renderMsgs(); }

// ===== Acciones sobre mensajes =====
export function msgAction(m, anchor, direct) {
  const c = S.chats.get(m.chat_id); const mine = m.sender_id === S.user.id;
  if (direct === 'reply') return m.deleted_for_all || m._pending ? null : setReply(m);
  if (direct === 'react') return reactPicker(m, anchor);
  if (direct === 'reactions') return reactionsSheet(m);
  if (direct === 'retry') { const arr = S.msgs.get(m.chat_id); S.msgs.set(m.chat_id, arr.filter(x => x !== m)); return sendMessage(m.chat_id, m).catch(e => toast(e.message)); }
  if (m._pending) return;
  const canPin = c.type === 'direct' || !c.only_admins_edit || ['owner', 'admin'].includes(c.my_role);
  const pinned = (S.pins.get(m.chat_id) || []).includes(m.id);
  const canEdit = mine && !m.deleted_for_all && ['text', 'image', 'video', 'document', 'gif'].includes(m.kind) && Date.now() - new Date(m.created_at) < 15 * 60e3 && !m.view_once;
  const canDelAll = !m.deleted_for_all && ((mine && Date.now() - new Date(m.created_at) < 48 * 36e5) || (c.type !== 'direct' && ['owner', 'admin'].includes(c.my_role)));
  const m2 = menu([
    !m.deleted_for_all ? { icon: 'smile', label: 'Reaccionar', action: () => reactPicker(m, anchor) } : null,
    !m.deleted_for_all && (!c.only_admins_send || ['owner', 'admin'].includes(c.my_role)) ? { icon: 'reply', label: 'Responder', action: () => setReply(m) } : null,
    m.body && !m.deleted_for_all ? { icon: 'copy', label: 'Copiar', action: () => copyText(m.body) } : null,
    !m.deleted_for_all && !m.view_once && m.kind !== 'system' ? { icon: 'forward', label: 'Reenviar', action: () => forwardSheet([m]) } : null,
    !m.deleted_for_all ? { icon: 'star', label: S.stars.has(m.id) ? 'Quitar destacado' : 'Destacar', action: () => toggleStar(m) } : null,
    !m.deleted_for_all && canPin ? { icon: 'pin', label: pinned ? 'Desfijar' : 'Fijar', action: () => togglePin(m, pinned) } : null,
    canEdit ? { icon: 'edit', label: 'Editar', action: () => setEdit(m) } : null,
    mine && c.type !== 'channel' ? { icon: 'info', label: 'Info.', action: () => msgInfo(m) } : null,
    !mine && c.type !== 'direct' && m.sender_id ? { icon: 'chat', label: 'Responder en privado', action: () => import('./newchat.js').then(n => n.startDirect(m.sender_id)) } : null,
    !mine && m.sender_id ? { icon: 'flag', label: 'Reportar', action: () => import('./info.js').then(i => i.reportSheet(m.sender_id, m)) } : null,
    '-',
    { icon: 'trash', label: 'Eliminar', danger: true, action: () => deleteMsg(m, canDelAll) },
  ], anchor);
  if (!m.deleted_for_all) m2.prepend(h('div', { class: 'quick-react' }, QUICK.map(e => h('button', { onclick: ev => { ev.stopPropagation(); m2.remove(); react(m, e); } }, e)),
    h('button', { class: 'qr-more', 'aria-label': 'Más emojis', onclick: ev => { ev.stopPropagation(); m2.remove(); emojiSheet(e => react(m, e)); } }, icon('plus', 18))));
}
export async function react(m, emoji) {
  const cur = S.reactions.get(m.id)?.get(S.user.id);
  try {
    if (cur === emoji) { setReaction(m.id, S.user.id, null); rerenderChat(m.chat_id, m.id); const { error } = await sb.from('message_reactions').delete().eq('message_id', m.id).eq('user_id', S.user.id); if (error) throw error; }
    else { setReaction(m.id, S.user.id, emoji); rerenderChat(m.chat_id, m.id); recentEmoji(emoji); const { error } = await sb.from('message_reactions').upsert({ message_id: m.id, chat_id: m.chat_id, user_id: S.user.id, emoji }); if (error) throw error; }
  } catch (e) { toast('No se pudo reaccionar: ' + e.message); }
}
function reactPicker(m, anchor) {
  const mm = menu([], anchor); mm.classList.add('react-only');
  mm.append(h('div', { class: 'quick-react' }, QUICK.map(e => h('button', { onclick: ev => { ev.stopPropagation(); mm.remove(); react(m, e); } }, e)),
    h('button', { class: 'qr-more', onclick: ev => { ev.stopPropagation(); mm.remove(); emojiSheet(e => react(m, e)); } }, icon('plus', 18))));
}
export function emojiSheet(pick) {
  let s; const grid = h('div', { class: 'emoji-grid' });
  const all = Object.entries(EMOJI).map(([k, v]) => [k, k === 'Recientes' ? recentEmoji() : v]).filter(([, v]) => v.length);
  for (const [k, v] of all) grid.append(h('h4', null, k), h('div', { class: 'eg' }, v.map(e => h('button', { onclick: () => { s.close(); pick(e); } }, e))));
  s = sheet('Elige un emoji', grid);
}
function reactionsSheet(m) {
  const r = S.reactions.get(m.id); if (!r) return;
  sheet('Reacciones', h('div', { class: 'list' }, [...r.entries()].map(([u, e]) => h('div', { class: 'person' }, avatar(u === S.user.id ? S.me : S.profiles.get(u), 40), h('div', { class: 'grow' }, h('b', null, nameOf(u)), u === S.user.id ? h('small', null, 'Toca para quitar') : null),
    h('span', { class: 'big-emoji', onclick: () => u === S.user.id && react(m, e) }, e)))));
}
async function toggleStar(m) {
  try {
    if (S.stars.has(m.id)) { S.stars.delete(m.id); await sb.from('message_stars').delete().eq('message_id', m.id).eq('user_id', S.user.id); }
    else { S.stars.add(m.id); await sb.from('message_stars').insert({ message_id: m.id, user_id: S.user.id }); toast('Mensaje destacado'); }
    rerenderChat(m.chat_id, m.id);
  } catch (e) { toast(e.message); }
}
async function togglePin(m, pinned) {
  try {
    if (pinned) { const { error } = await sb.from('chat_pins').delete().eq('chat_id', m.chat_id).eq('message_id', m.id); if (error) throw error; S.pins.set(m.chat_id, (S.pins.get(m.chat_id) || []).filter(x => x !== m.id)); }
    else {
      const pins = S.pins.get(m.chat_id) || [];
      if (pins.length >= 3) { await sb.from('chat_pins').delete().eq('chat_id', m.chat_id).eq('message_id', pins[0]); pins.shift(); }
      const { error } = await sb.from('chat_pins').insert({ chat_id: m.chat_id, message_id: m.id, pinned_by: S.user.id }); if (error) throw error;
      S.pins.set(m.chat_id, [...pins, m.id]); toast('Mensaje fijado');
    }
    rerenderChat(m.chat_id, m.id);
  } catch (e) { toast('No se pudo fijar: ' + e.message); }
}
async function deleteMsg(m, canAll) {
  const r = await confirmDialog('¿Eliminar mensaje?', 'Eliminar para mí', true, canAll ? 'Eliminar para todos' : null);
  if (!r) return;
  try {
    if (r === 'extra') {
      const media = await rpc('delete_for_all', { p_id: m.id });
      if (media?.path && m.sender_id === S.user.id) { await sb.storage.from('media').remove([media.path]); forgetUrl(media.path); }
      Object.assign(m, { deleted_for_all: true, body: null, media: null, meta: {}, enc: null });
    } else {
      const { error } = await sb.from('message_hidden').insert({ message_id: m.id, user_id: S.user.id }); if (error) throw error;
      S.msgs.set(m.chat_id, (S.msgs.get(m.chat_id) || []).filter(x => x.id !== m.id));
    }
    rerenderChat(m.chat_id, m.id); refreshChat(m.chat_id);
  } catch (e) { toast('No se pudo eliminar: ' + e.message); }
}
function msgInfo(m) {
  const mem = S.members.get(m.chat_id); const t = new Date(m.created_at);
  const rows = [...(mem?.values() || [])].filter(x => x.user_id !== S.user.id);
  const read = rows.filter(x => x.read_at && new Date(x.read_at) >= t), deliv = rows.filter(x => !read.includes(x) && x.delivered_at && new Date(x.delivered_at) >= t), pend = rows.filter(x => !read.includes(x) && !deliv.includes(x));
  const sec = (title, ic, arr, f) => h('div', { class: 'info-sec' }, h('h4', null, icon(ic, 16), ' ', title), arr.length ? arr.map(x => h('div', { class: 'person' }, avatar(S.profiles.get(x.user_id), 34), h('div', { class: 'grow' }, h('b', null, nameOf(x.user_id))), h('small', null, f(x)))) : h('small', { class: 'muted' }, '—'));
  sheet('Info. del mensaje', h('div', null,
    h('div', { class: 'info-preview' }, previewText(m)), h('p', { class: 'muted' }, 'Enviado: ' + t.toLocaleString('es-CO')),
    sec('Leído por', 'check2', read, x => fmtTime(x.read_at)), sec('Entregado a', 'check2', deliv, x => fmtTime(x.delivered_at)), sec('Pendiente', 'check', pend, () => ''),
    h('p', { class: 'fine' }, 'Si alguien desactivó las confirmaciones de lectura, puede aparecer como entregado.')));
}
export function pollVotesSheet(m) {
  const votes = S.votes.get(m.id) || [];
  sheet('Votos · ' + (m.meta?.q || ''), h('div', null, (m.meta?.o || []).map((o, i) => {
    const vs = votes.filter(v => v.option_idx === i);
    return h('div', { class: 'info-sec' }, h('h4', null, o, ' · ', vs.length), vs.map(v => h('div', { class: 'person' }, avatar(v.user_id === S.user.id ? S.me : S.profiles.get(v.user_id), 32), h('b', null, nameOf(v.user_id)))));
  })));
}

// ===== Reenviar =====
export function forwardSheet(msgs) {
  const picked = new Set(); let s;
  const chats = [...S.chats.values()].filter(c => c.type !== 'community').sort((a, b) => new Date(b.last_message_at) - new Date(a.last_message_at));
  const sendBtn = h('button', { class: 'btn primary', disabled: true, onclick: async () => {
    sendBtn.disabled = true; sendBtn.textContent = 'Enviando…';
    let ok = 0;
    for (const cid of picked) for (const m of msgs) { try { await forwardOne(m, cid); ok++; } catch (e) { toast('Error al reenviar: ' + e.message); } }
    s.close(); toast(ok ? `Reenviado a ${picked.size} chat${picked.size > 1 ? 's' : ''}` : 'No se reenvió');
  } }, 'Reenviar');
  const q = h('input', { type: 'search', placeholder: 'Buscar chat…', oninput: () => draw() });
  const list = h('div', { class: 'list pick' });
  const draw = () => { list.innerHTML = ''; for (const c of chats.filter(c => chatTitle(c).toLowerCase().includes(q.value.toLowerCase()))) {
    const canSend = !c.only_admins_send || ['owner', 'admin'].includes(c.my_role);
    if (!canSend) continue;
    list.append(h('label', { class: 'person' }, h('input', { type: 'checkbox', checked: picked.has(c.id), onchange: e => { e.target.checked ? picked.add(c.id) : picked.delete(c.id); if (picked.size > 5) { picked.delete(c.id); e.target.checked = false; toast('Puedes reenviar a 5 chats a la vez'); } sendBtn.disabled = !picked.size; sendBtn.textContent = picked.size ? `Reenviar (${picked.size})` : 'Reenviar'; } }), chatAvatar(c, 38), h('b', null, chatTitle(c))));
  } };
  draw();
  s = sheet('Reenviar a…', h('div', { class: 'form' }, q, list, sendBtn));
}
async function forwardOne(m, cid) {
  let media = null;
  if (m.media?.path) {
    const blob = await mediaBlob(m);
    const up = await uploadToChat(cid, blob, m.media.name);
    media = { ...m.media, ...up }; delete media.e2e;
  }
  const meta = m.meta ? { ...m.meta } : null; if (meta) { delete meta.rq; delete meta.live_until; }
  return sendMessage(cid, { kind: m.kind, body: m.body, meta: m.kind === 'poll' ? { ...meta } : meta, media, forwarded: true });
}

// ===== Exportar =====
export async function exportChat(c) {
  toast('Preparando exportación…');
  const id = c.id; let n = 0;
  if (S.current !== id || !S.msgs.has(id)) await loadMessages(id);
  while (S.more.get(id) && n++ < 40) await loadMessages(id, S.msgs.get(id)[0]?.created_at);
  const lines = (S.msgs.get(id) || []).map(m => `[${new Date(m.created_at).toLocaleString('es-CO')}] ${m.kind === 'system' ? '' : nameOf(m.sender_id, { you: false }) + ': '}${m.kind === 'system' ? previewText(m) : m.deleted_for_all ? '(mensaje eliminado)' : previewText(m)}`);
  const { download } = await import('./ui.js');
  download(`Chat DUNA - ${chatTitle(c).replace(/[^\p{L}\p{N} _-]/gu, '')}.txt`, new Blob(['Exportado desde DUNA\n\n' + lines.join('\n')], { type: 'text/plain;charset=utf-8' }));
}

// Limpieza de mis archivos de mensajes eliminados/expirados (ahorra almacenamiento)
export async function cleanupMine() {
  const { data } = await sb.rpc('my_orphan_media');
  if (!data?.length) return 0;
  const byB = {}; for (const r of data) (byB[r.bucket] = byB[r.bucket] || []).push(r.name);
  for (const [b, names] of Object.entries(byB)) await sb.storage.from(b).remove(names);
  return data.length;
}
