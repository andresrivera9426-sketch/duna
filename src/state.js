import { sb, rpc } from './sb.js';
import { chatKey, encJSON, decJSON } from './crypto.js';

export const S = {
  user: null, me: null, priv: null,
  chats: new Map(), members: new Map(), profiles: new Map(), msgs: new Map(), more: new Map(),
  reactions: new Map(), votes: new Map(), pins: new Map(), stars: new Set(), vo: new Set(), voOpened: new Map(),
  current: null, tab: 'chats', typing: new Map(),
  prefs: JSON.parse(localStorage.getItem('duna-prefs') || '{}'),
};
export function savePrefs() { localStorage.setItem('duna-prefs', JSON.stringify(S.prefs)); }
export const bus = new EventTarget();
export const emit = (n, d) => bus.dispatchEvent(new CustomEvent(n, { detail: d }));
export const on = (n, f) => bus.addEventListener(n, e => f(e.detail));

// ===== Perfiles =====
const pendingProfiles = new Set(); let profTimer = null; let profWaiters = [];
export async function loadProfiles(ids, force = false) {
  const need = [...new Set(ids.filter(Boolean))].filter(id => force || !S.profiles.has(id));
  if (!need.length) return;
  const data = await rpc('get_profiles', { ids: need });
  for (const p of data) S.profiles.set(p.id, p);
  emit('profiles');
}
export function queueProfile(id) {
  if (!id || S.profiles.has(id) || pendingProfiles.has(id)) return;
  pendingProfiles.add(id); clearTimeout(profTimer);
  profTimer = setTimeout(async () => { const ids = [...pendingProfiles]; pendingProfiles.clear(); try { await loadProfiles(ids); } catch {} }, 60);
}
export function nameOf(uid, { you = true } = {}) {
  if (!uid) return 'DUNA';
  if (S.user && uid === S.user.id) return you ? 'Tú' : (S.me?.display_name || 'Tú');
  const p = S.profiles.get(uid); if (!p) { queueProfile(uid); return '…'; }
  return p.alias || p.display_name;
}

// ===== Chats =====
export async function loadChats() {
  const list = await rpc('chat_list');
  const seen = new Set();
  for (const c of list) { c.id = c.chat_id; seen.add(c.id); S.chats.set(c.id, { ...(S.chats.get(c.id) || {}), ...c }); }
  for (const id of [...S.chats.keys()]) if (!seen.has(id)) S.chats.delete(id);
  const { data: mem } = await sb.from('chat_members').select('*');
  S.members.clear();
  for (const m of mem || []) { if (!S.members.has(m.chat_id)) S.members.set(m.chat_id, new Map()); S.members.get(m.chat_id).set(m.user_id, m); }
  await loadProfiles([...list.map(c => c.other_id), ...(mem || []).map(m => m.user_id), ...list.map(c => c.last_message?.sender_id)]);
  await Promise.all(list.filter(c => c.last_message?.enc).map(async c => { c.last_message = await decryptMsg(c.last_message, c.id); S.chats.get(c.id).last_message = c.last_message; }));
  emit('chats');
  return list;
}
export async function refreshChat(id) {
  const list = await rpc('chat_list');
  const c = list.find(x => x.chat_id === id);
  if (!c) { S.chats.delete(id); emit('chats'); return null; }
  c.id = c.chat_id; if (c.last_message?.enc) c.last_message = await decryptMsg(c.last_message, id);
  S.chats.set(id, { ...(S.chats.get(id) || {}), ...c });
  const { data: mem } = await sb.from('chat_members').select('*').eq('chat_id', id);
  const map = new Map(); for (const m of mem || []) map.set(m.user_id, m); S.members.set(id, map);
  await loadProfiles([...map.keys(), c.other_id]);
  emit('chats'); return S.chats.get(id);
}
export function chatTitle(c) {
  if (!c) return '';
  if (c.type === 'direct') return c.other_id ? nameOf(c.other_id, { you: false }) : (S.me?.display_name || 'Tú') + ' (Tú)';
  return c.title || 'Grupo';
}
export function chatPeer(c) { return c?.type === 'direct' ? (c.other_id ? S.profiles.get(c.other_id) : S.me) : null; }
export const isE2E = c => c?.type === 'direct';

export async function keyFor(chatId) {
  const c = S.chats.get(chatId); if (!c || c.type !== 'direct' || !S.priv) return null;
  const peer = c.other_id ? S.profiles.get(c.other_id) : S.me;
  if (!peer?.pub_key) return null;
  return chatKey(S.priv, peer.pub_key, chatId);
}
export async function decryptMsg(m, chatId = m.chat_id) {
  if (!m || !m.enc || m._dec) return m;
  try {
    const key = await keyFor(chatId);
    if (!key) throw new Error('sin clave');
    const p = await decJSON(key, m.enc);
    m.body = p.b ?? null; m.meta = p.m ?? m.meta; if (p.t && m.media) m.media = { ...m.media, thumb: p.t };
    m._dec = true;
  } catch (e) { m._err = true; m.body = null; }
  return m;
}
export async function encryptFor(chatId, body, meta, thumb) {
  const key = await keyFor(chatId);
  if (!key) return null;
  return encJSON(key, { b: body ?? null, m: meta ?? null, t: thumb ?? null });
}

// ===== Mensajes =====
export const PAGE = 50;
export async function loadMessages(chatId, before) {
  let q = sb.from('messages').select('*').eq('chat_id', chatId).order('created_at', { ascending: false }).limit(PAGE);
  if (before) q = q.lt('created_at', before);
  const { data, error } = await q; if (error) throw error;
  const rows = await Promise.all(data.map(m => decryptMsg(m, chatId)));
  rows.reverse();
  const cur = S.msgs.get(chatId) || [];
  const ids = new Set(cur.map(m => m.id));
  const merged = before ? [...rows.filter(m => !ids.has(m.id)), ...cur] : mergeMsgs(cur, rows);
  S.msgs.set(chatId, merged); S.more.set(chatId, data.length === PAGE);
  rows.forEach(m => queueProfile(m.sender_id));
  return merged;
}
function mergeMsgs(cur, rows) {
  const map = new Map(cur.filter(m => !m._pending || m._failed).map(m => [m.id, m]));
  for (const r of rows) map.set(r.id, r);
  for (const m of cur) if (m._pending && !m._failed && ![...map.values()].some(x => x.client_id && x.client_id === m.client_id)) map.set(m.id, m);
  return [...map.values()].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
}
export async function loadChatExtras(chatId) {
  const [r, v, p] = await Promise.all([
    sb.from('message_reactions').select('message_id,user_id,emoji').eq('chat_id', chatId),
    sb.from('poll_votes').select('message_id,user_id,option_idx').eq('chat_id', chatId),
    sb.from('chat_pins').select('message_id,created_at').eq('chat_id', chatId).order('created_at'),
  ]);
  for (const x of r.data || []) setReaction(x.message_id, x.user_id, x.emoji);
  const vm = new Map(); for (const x of v.data || []) { if (!vm.has(x.message_id)) vm.set(x.message_id, []); vm.get(x.message_id).push(x); }
  for (const [k, arr] of vm) S.votes.set(k, arr);
  S.pins.set(chatId, (p.data || []).map(x => x.message_id));
}
export function setReaction(mid, uid, emoji) {
  if (!S.reactions.has(mid)) S.reactions.set(mid, new Map());
  if (emoji) S.reactions.get(mid).set(uid, emoji); else S.reactions.get(mid).delete(uid);
}
export function upsertMsg(m) {
  const arr = S.msgs.get(m.chat_id); if (!arr) return false;
  const i = arr.findIndex(x => x.id === m.id || (m.client_id && x.client_id === m.client_id));
  if (i >= 0) arr[i] = { ...arr[i], ...m, _pending: false, _failed: false };
  else { arr.push(m); arr.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)); }
  return true;
}
export function findMsg(chatId, id) { return (S.msgs.get(chatId) || []).find(m => m.id === id); }

export async function sendMessage(chatId, { kind = 'text', body = null, meta = null, media = null, reply_to = null, view_once = false, forwarded = false }) {
  const chat = S.chats.get(chatId);
  const client_id = crypto.randomUUID();
  const local = { id: 'tmp-' + client_id, client_id, chat_id: chatId, sender_id: S.user.id, kind, body, meta, media, reply_to, view_once, forwarded,
    created_at: new Date().toISOString(), _pending: true, _dec: true };
  if (!S.msgs.has(chatId)) S.msgs.set(chatId, []);
  S.msgs.get(chatId).push(local); emit('msgs', chatId);
  const row = { chat_id: chatId, sender_id: S.user.id, kind, reply_to, view_once, forwarded, client_id, media: media ? { ...media } : null, body, meta };
  try {
    if (isE2E(chat)) {
      const thumb = media?.thumb; if (row.media) delete row.media.thumb;
      const enc = await encryptFor(chatId, body, meta, thumb);
      if (!enc) throw new Error('No hay clave de cifrado para este chat. Desbloquea el cifrado en Ajustes.');
      row.enc = enc; row.body = null; row.meta = null; if (row.media) row.media.e2e = true;
    }
    const { data, error } = await sb.from('messages').insert(row).select().single();
    if (error) throw error;
    const m = await decryptMsg(data, chatId); if (!m.enc) { m.body = data.body; m.meta = data.meta; }
    if (media?.thumb && m.media) m.media.thumb = media.thumb;
    if (m.media && local._localUrl) m._localUrl = local._localUrl;
    upsertMsg(m);
    const c = S.chats.get(chatId); if (c) { c.last_message = m; c.last_message_at = m.created_at; c.archived = c.archived && !!c.muted_until; }
    emit('msgs', chatId); emit('chats');
    return m;
  } catch (e) {
    local._failed = true; local._error = e.message; emit('msgs', chatId); throw e;
  }
}
export function previewText(m) {
  if (!m) return '';
  if (m.deleted_for_all) return '🚫 Se eliminó este mensaje';
  if (m._err) return '🔒 Mensaje cifrado';
  const k = { image: '📷 Foto', video: '🎬 Video', audio: '🎵 Audio', voice: '🎤 Nota de voz', document: '📄 ' + (m.media?.name || 'Documento'), location: '📍 Ubicación', contact: '👤 Contacto', poll: '📊 ' + (m.meta?.q || 'Encuesta'), sticker: '✨ Sticker', gif: 'GIF', call: '📞 Llamada' }[m.kind];
  if (m.view_once && ['image', 'video'].includes(m.kind)) return '① ' + (m.kind === 'image' ? 'Foto' : 'Video') + ' de una vista';
  if (m.kind === 'system') return systemText(m);
  if (k) return m.body ? k.split(' ')[0] + ' ' + m.body : k;
  return m.body || '';
}
export function systemText(m) {
  const a = m.meta?.actor ? nameOf(m.meta.actor) : '';
  const t = m.meta?.target ? nameOf(m.meta.target) : '';
  const b = m.body || '';
  if (b === 'cambió los mensajes temporales') {
    const s = m.meta?.seconds || 0;
    return s ? `${a} activó los mensajes temporales: ${s === 86400 ? '24 horas' : s === 604800 ? '7 días' : '90 días'}` : `${a} desactivó los mensajes temporales`;
  }
  if (b === 'cambió el nombre a') return `${a} cambió el nombre a “${m.meta?.value || ''}”`;
  if (['Grupo creado', 'Canal creado', 'Comunidad creada'].includes(b)) return `${a} creó ${b === 'Grupo creado' ? 'el grupo' : b === 'Canal creado' ? 'el canal' : 'la comunidad'}` + (m.meta?.skipped ? ` · ${m.meta.skipped} no se pudieron añadir por su privacidad` : '');
  return [a, b, t].filter(Boolean).join(' ');
}
export async function markRead(chatId) {
  const c = S.chats.get(chatId); if (!c) return;
  const now = new Date().toISOString();
  const mine = S.members.get(chatId)?.get(S.user.id);
  const receipts = S.me?.privacy?.read_receipts !== false;
  const upd = { delivered_at: now }; if (receipts || c.type !== 'direct') upd.read_at = now;
  if (mine) Object.assign(mine, upd);
  c.unread = 0; c.marked_unread = false; emit('chats');
  await Promise.all([
    sb.from('chat_members').update(upd).eq('chat_id', chatId).eq('user_id', S.user.id),
    sb.from('chat_prefs').update({ my_read_at: now, marked_unread: false }).eq('chat_id', chatId).eq('user_id', S.user.id),
  ]);
}
let delivTimer = null; const delivQueue = new Set();
export function markDelivered(chatId) {
  delivQueue.add(chatId); clearTimeout(delivTimer);
  delivTimer = setTimeout(async () => {
    const ids = [...delivQueue]; delivQueue.clear();
    await sb.from('chat_members').update({ delivered_at: new Date().toISOString() }).in('chat_id', ids).eq('user_id', S.user.id);
  }, 400);
}
// Estado de entrega para mis mensajes: 0 enviando, 1 enviado, 2 entregado, 3 leído
export function tickState(m) {
  if (m._failed) return -1;
  if (m._pending) return 0;
  const mem = S.members.get(m.chat_id); if (!mem) return 1;
  const others = [...mem.values()].filter(x => x.user_id !== S.user.id);
  if (!others.length) return 3;
  const t = new Date(m.created_at).getTime();
  if (others.every(x => x.read_at && new Date(x.read_at).getTime() >= t)) return S.me?.privacy?.read_receipts === false && S.chats.get(m.chat_id)?.type === 'direct' ? 2 : 3;
  if (others.every(x => x.delivered_at && new Date(x.delivered_at).getTime() >= t)) return 2;
  return 1;
}
export async function setPref(chatId, patch) {
  const c = S.chats.get(chatId); if (c) Object.assign(c, patch); emit('chats');
  const { error } = await sb.from('chat_prefs').upsert({ chat_id: chatId, user_id: S.user.id, ...patch });
  if (error) throw error;
}
