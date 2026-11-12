import { sb, rpc } from './sb.js';
import { h, $, icon, btn, menu, toast, sheet, fmtDur, fmtSize, debounce } from './ui.js';
import { S, sendMessage, previewText, nameOf, chatTitle, encryptFor, isE2E, findMsg, emit, upsertMsg } from './state.js';
import { compressImage, videoInfo, audioDuration, uploadToChat, VoiceRecorder, LIMITS } from './media.js';
import { quoteBlock } from './bubbles.js';
import { sendTyping, renderMsgs, emojiSheet } from './chat.js';
import { STICKERS, stickerUrl, EMOJI, recentEmoji } from './stickers.js';
import { gifUrl, searchGifs } from './gifs.js';
import { avatar } from './main.js';
import { QUICK_REPLIES, scheduleSheet } from './extras.js';

let reply = null, editing = null, ta = null, rec = null;
export function composer(c) {
  reply = null; editing = null;
  const wrap = h('footer', { class: 'composer', id: 'composer' });
  const isAdmin = ['owner', 'admin'].includes(c.my_role);
  const peer = c.type === 'direct' ? S.profiles.get(c.other_id) : null;
  if (peer?.i_blocked) {
    wrap.append(h('button', { class: 'blocked-bar', onclick: async () => { await sb.from('blocks').delete().eq('blocker_id', S.user.id).eq('blocked_id', peer.id); peer.i_blocked = false; toast('Contacto desbloqueado'); import('./chat.js').then(m => m.openChat(c.id)); } }, 'Bloqueaste a este contacto. Toca para desbloquear.'));
    return wrap;
  }
  if (c.only_admins_send && !isAdmin) {
    wrap.append(h('div', { class: 'readonly-bar' }, c.type === 'channel' ? h('span', null, icon('channel', 18), ' Sigues este canal · solo los administradores publican') : 'Solo los administradores pueden enviar mensajes'));
    return wrap;
  }
  const extra = h('div', { class: 'comp-extra', id: 'comp-extra' });
  ta = h('textarea', { rows: 1, placeholder: 'Mensaje', id: 'msg-input', 'aria-label': 'Escribe un mensaje', maxlength: 8000, enterkeyhint: 'send' });
  const sendB = h('button', { class: 'send-btn', id: 'send-btn', 'aria-label': 'Enviar' }, icon('mic', 22));
  const panel = h('div', { class: 'emoji-panel', id: 'emoji-panel', hidden: true });
  const mention = h('div', { class: 'mention-pop', hidden: true });
  const updateBtn = () => { const has = ta.value.trim().length > 0 || editing; sendB.innerHTML = ''; sendB.append(icon(has ? (editing ? 'check' : 'send') : 'mic', 22)); sendB.classList.toggle('mic', !has); sendB.setAttribute('aria-label', has ? 'Enviar' : 'Grabar nota de voz'); };
  ta.addEventListener('input', () => {
    ta.style.height = 'auto'; ta.style.height = Math.min(140, ta.scrollHeight) + 'px'; updateBtn(); if (ta.value) sendTyping('text');
    saveDraft(c.id, ta.value); if (!quickCheck(mention)) mentionCheck(c, mention);
  });
  ta.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && (S.prefs.enterSend !== false) && !matchMedia('(pointer:coarse)').matches) { e.preventDefault(); submit(); }
    if (e.key === 'Escape') { if (editing || reply) { clearExtra(); } }
    if (e.key === 'ArrowUp' && !ta.value) { const last = [...(S.msgs.get(c.id) || [])].reverse().find(m => m.sender_id === S.user.id && m.kind === 'text' && !m.deleted_for_all && Date.now() - new Date(m.created_at) < 15 * 60e3); if (last) { e.preventDefault(); setEdit(last); } }
  });
  ta.addEventListener('paste', e => { const files = [...(e.clipboardData?.files || [])]; if (files.length) { e.preventDefault(); attachFiles(files); } });
  const submit = async () => {
    const text = ta.value.trim();
    if (!text) return;
    if (editing) {
      const m = editing; clearExtra(); ta.value = ''; updateBtn();
      try {
        const enc = isE2E(c) ? await encryptFor(c.id, text, m.meta, m.media?.thumb) : null;
        await rpc('edit_message', { p_id: m.id, p_body: enc ? null : text, p_enc: enc, p_meta: null });
        m.body = text; m.edited_at = new Date().toISOString(); renderMsgs();
      } catch (e) { toast(e.message); }
      return;
    }
    const r = reply; clearExtra(); ta.value = ''; ta.style.height = 'auto'; updateBtn(); saveDraft(c.id, '');
    const meta = r ? { rq: { sender_id: r.sender_id, kind: r.kind, body: (r.body || '').slice(0, 200) } } : null;
    const lp = await linkPreview(text);
    try { await sendMessage(c.id, { kind: 'text', body: text, reply_to: r?.id || null, meta: lp ? { ...(meta || {}), lp } : meta }); } catch (e) { toast('No se envió: ' + e.message); }
  };
  sendB.addEventListener('click', () => { if (ta.value.trim() || editing) submit(); else startVoice(c, wrap); });
  const schedMenu = e => { e.preventDefault(); if (editing) return; menu([{ icon: 'calendar', label: 'Programar mensaje', action: () => scheduleSheet(c, ta.value.trim(), reply) }], sendB); };
  sendB.addEventListener('contextmenu', schedMenu);
  let lpT; sendB.addEventListener('touchstart', e => { if (!ta.value.trim()) return; lpT = setTimeout(() => schedMenu(e), 550); }, { passive: true });
  ['touchend', 'touchmove'].forEach(ev => sendB.addEventListener(ev, () => clearTimeout(lpT), { passive: true }));
  const emojiB = btn('smile', 'Emojis, stickers y GIF', () => { panel.hidden = !panel.hidden; if (!panel.hidden) drawPanel(panel, c); });
  const attachB = btn('clip', 'Adjuntar', e => attachMenu(c, e.currentTarget));
  const camB = btn('camera', 'Cámara', () => pickFiles('image/*,video/*', true));
  wrap.append(panel, mention, extra, h('div', { class: 'comp-row' }, h('div', { class: 'comp-box' }, emojiB, ta, attachB, camB), sendB));
  const draft = localStorage.getItem('duna-draft:' + c.id); if (draft) { ta.value = draft; setTimeout(() => ta.dispatchEvent(new Event('input')), 0); }
  updateBtn();
  return wrap;
}
const saveDraft = debounce((id, v) => v ? localStorage.setItem('duna-draft:' + id, v) : localStorage.removeItem('duna-draft:' + id), 400);
function clearExtra() { reply = null; editing = null; const x = $('#comp-extra'); if (x) x.innerHTML = ''; }
export function setReply(m) {
  editing = null; reply = m; const x = $('#comp-extra'); if (!x) return; x.innerHTML = '';
  x.append(h('div', { class: 'reply-bar' }, quoteBlock(m), btn('x', 'Cancelar respuesta', clearExtra)));
  ta?.focus();
}
export function setEdit(m) {
  reply = null; editing = m; const x = $('#comp-extra'); if (!x) return; x.innerHTML = '';
  x.append(h('div', { class: 'reply-bar edit' }, h('div', { class: 'quote' }, h('div', null, h('b', null, 'Editar mensaje'), h('span', null, previewText(m).slice(0, 120)))), btn('x', 'Cancelar edición', () => { clearExtra(); ta.value = ''; ta.dispatchEvent(new Event('input')); })));
  ta.value = m.body || ''; ta.dispatchEvent(new Event('input')); ta.focus();
}
function quickCheck(pop) {
  const v = ta.value; const m = v.match(/^\/([a-z0-9_]*)$/i);
  if (!m || !QUICK_REPLIES.length) return false;
  const arr = QUICK_REPLIES.filter(q => q.shortcut.startsWith(m[1].toLowerCase())).slice(0, 6);
  pop.innerHTML = ''; pop.hidden = !arr.length;
  for (const q of arr) pop.append(h('button', { class: 'qr-pick', dataset: { qr: q.shortcut }, onclick: () => { ta.value = q.body; pop.hidden = true; ta.focus(); ta.dispatchEvent(new Event('input')); } }, icon('bolt', 18), h('b', null, '/' + q.shortcut), h('small', null, q.body.slice(0, 60))));
  return arr.length > 0;
}
function mentionCheck(c, pop) {
  if (c.type === 'direct') return;
  const before = ta.value.slice(0, ta.selectionStart); const mm = before.match(/@([a-z0-9_.]*)$/i);
  if (!mm) { pop.hidden = true; return; }
  const q = mm[1].toLowerCase();
  const mem = [...(S.members.get(c.id)?.keys() || [])].filter(u => u !== S.user.id).map(u => S.profiles.get(u)).filter(p => p && (p.username.includes(q) || p.display_name.toLowerCase().includes(q))).slice(0, 6);
  pop.innerHTML = ''; pop.hidden = !mem.length;
  for (const p of mem) pop.append(h('button', { onclick: () => { const pos = ta.selectionStart; ta.value = before.replace(/@([a-z0-9_.]*)$/i, '@' + p.username + ' ') + ta.value.slice(pos); pop.hidden = true; ta.focus(); ta.dispatchEvent(new Event('input')); } }, avatar(p, 28), h('b', null, p.display_name), h('small', null, '@' + p.username)));
}

// ===== Panel de emojis / stickers / GIF =====
function drawPanel(panel, c) {
  panel.innerHTML = '';
  const tabs = h('div', { class: 'ep-tabs' }); const body = h('div', { class: 'ep-body' });
  const show = (t) => {
    tabs.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.t === t)); body.innerHTML = '';
    if (t === 'emoji') {
      for (const [k, v0] of Object.entries(EMOJI)) { const v = k === 'Recientes' ? recentEmoji() : v0; if (!v.length) continue;
        body.append(h('h4', null, k), h('div', { class: 'eg' }, v.map(e => h('button', { onclick: () => { insertAtCursor(e); recentEmoji(e); } }, e)))); }
    } else if (t === 'sticker') {
      body.append(h('div', { class: 'sg' }, Object.entries(STICKERS).map(([id, s]) => h('button', { title: s.label, onclick: () => { panel.hidden = true; sendMessage(c.id, { kind: 'sticker', meta: { id, label: s.label }, reply_to: reply?.id }).catch(e => toast(e.message)); clearExtra(); } }, h('img', { src: stickerUrl(id), alt: s.label })))));
    } else {
      const q = h('input', { type: 'search', class: 'gif-q', placeholder: 'Buscar GIF (hola, jaja, gracias, cumple…)', 'aria-label': 'Buscar GIF' });
      const grid = h('div', { class: 'gg', id: 'gif-grid' });
      const draw = () => { grid.innerHTML = ''; const ids = searchGifs(q.value); if (!ids.length) grid.append(h('p', { class: 'muted' }, 'Sin resultados')); for (const id of ids) grid.append(h('button', { title: id, dataset: { gif: id }, onclick: () => { panel.hidden = true; sendMessage(c.id, { kind: 'gif', meta: { cat: id }, reply_to: reply?.id }).catch(e => toast(e.message)); clearExtra(); } }, h('img', { src: gifUrl(id), alt: id, loading: 'lazy' }))); };
      q.addEventListener('input', debounce(draw, 120)); draw();
      body.append(q, grid, h('div', { class: 'gif-up' }, h('button', { class: 'btn ghost sm', onclick: () => pickFiles('image/gif') }, 'Enviar un GIF desde mi dispositivo (máx. 4 MB)')),
        h('p', { class: 'fine' }, 'Catálogo animado propio de DUNA: no usa proveedores externos ni ocupa almacenamiento.'));
    }
  };
  [['emoji', '😊 Emoji'], ['sticker', '✨ Stickers'], ['gif', 'GIF']].forEach(([t, l]) => tabs.append(h('button', { dataset: { t }, onclick: () => show(t) }, l)));
  panel.append(tabs, body); show('emoji');
}
function insertAtCursor(t) { const s = ta.selectionStart ?? ta.value.length; ta.value = ta.value.slice(0, s) + t + ta.value.slice(ta.selectionEnd ?? s); ta.selectionStart = ta.selectionEnd = s + t.length; ta.dispatchEvent(new Event('input')); }

// ===== Adjuntos =====
function attachMenu(c, anchor) {
  menu([
    { icon: 'doc', label: 'Documento', action: () => pickFiles('*/*', false, 'document') },
    { icon: 'image', label: 'Fotos y videos', action: () => pickFiles('image/*,video/*') },
    { icon: 'camera', label: 'Cámara', action: () => pickFiles('image/*,video/*', true) },
    { icon: 'headphones', label: 'Audio', action: () => pickFiles('audio/*', false, 'audio') },
    { icon: 'location', label: 'Ubicación', action: () => locationSheet(c) },
    { icon: 'user', label: 'Contacto', action: () => contactSheet(c) },
    c.type !== 'channel' || ['owner', 'admin'].includes(c.my_role) ? { icon: 'poll', label: 'Encuesta', action: () => pollSheet(c) } : null,
    { icon: 'calendar', label: 'Programar mensaje', action: () => scheduleSheet(c, ta?.value.trim() || '', reply) },
  ], anchor);
}
function pickFiles(accept, capture, as) {
  const inp = h('input', { type: 'file', accept, multiple: !capture, style: { display: 'none' } });
  if (capture) inp.setAttribute('capture', 'environment');
  inp.onchange = () => { attachFiles([...inp.files], as); inp.remove(); };
  document.body.append(inp); inp.click();
}
export async function attachFiles(files, as) {
  const c = S.chats.get(S.current); if (!c || !files.length) return;
  const items = files.slice(0, 10).map(f => ({ file: f, kind: as || (f.type === 'image/gif' ? 'gif' : f.type.startsWith('image/') ? 'image' : f.type.startsWith('video/') ? 'video' : f.type.startsWith('audio/') ? 'audio' : 'document') }));
  for (const it of items) { if (it.file.size > (LIMITS[it.kind] || LIMITS.document) && it.kind !== 'image') { toast(`“${it.file.name}” supera ${fmtSize(LIMITS[it.kind] || LIMITS.document)}`); return; } }
  const visual = items.every(i => ['image', 'video', 'gif'].includes(i.kind));
  let s; const cap = h('textarea', { rows: 2, placeholder: 'Añade un comentario…', maxlength: 2000 });
  const vo = h('input', { type: 'checkbox', id: 'vo-toggle' }); const hd = h('input', { type: 'checkbox', id: 'hd-toggle' });
  const prev = h('div', { class: 'att-prev' }, items.map(it => it.kind === 'image' || it.kind === 'gif' ? h('img', { src: URL.createObjectURL(it.file), alt: '' }) : it.kind === 'video' ? h('video', { src: URL.createObjectURL(it.file), muted: true, controls: true, playsInline: true }) : h('div', { class: 'doc' }, h('span', { class: 'doc-ic' }, (it.file.name.split('.').pop() || 'DOC').slice(0, 4).toUpperCase()), h('span', { class: 'doc-info' }, h('b', null, it.file.name), h('small', null, fmtSize(it.file.size))))));
  const go = h('button', { class: 'btn primary', id: 'att-send' }, icon('send', 18), ' Enviar');
  go.onclick = async () => {
    go.disabled = true; go.textContent = 'Preparando…'; const caption = cap.value.trim(); const r = reply; clearExtra(); s.close();
    for (let i = 0; i < items.length; i++) {
      try { await sendFile(c.id, items[i], { caption: i === 0 ? caption : '', viewOnce: vo.checked, hd: hd.checked, replyTo: i === 0 ? r?.id : null }); }
      catch (e) { toast('No se pudo enviar ' + items[i].file.name + ': ' + e.message); }
    }
  };
  s = sheet(items.length > 1 ? `Enviar ${items.length} archivos` : 'Enviar archivo', h('div', { class: 'form' }, prev,
    visual ? h('div', { class: 'att-opts' }, h('label', { class: 'switch' }, vo, h('span', null, icon('eye1', 16), ' Ver una vez')), items.some(i => i.kind === 'image') ? h('label', { class: 'switch' }, hd, h('span', null, 'Calidad HD (más peso)')) : null) : null,
    cap, go), { wide: true });
}
export async function sendFile(chatId, it, { caption = '', viewOnce = false, hd = false, replyTo = null } = {}) {
  const f = it.file; let blob = f, media = { name: f.name, mime: f.type };
  const id = 'up-' + crypto.randomUUID();
  toast('Subiendo ' + (it.kind === 'image' ? 'foto' : it.kind === 'video' ? 'video' : 'archivo') + '…', 1500);
  if (it.kind === 'image') { const r = await compressImage(f, hd ? 2560 : 1600, hd ? 0.85 : 0.72); blob = r.blob; Object.assign(media, { w: r.w, h: r.h, thumb: r.thumb, mime: blob.type }); if (blob.size > LIMITS.image) throw new Error('Imagen demasiado grande'); }
  else if (it.kind === 'video') { const v = await videoInfo(f); Object.assign(media, { w: v.w, h: v.h, dur: v.dur, thumb: v.poster ? await shrinkDataUrl(v.poster) : v.thumb }); }
  else if (it.kind === 'gif') { const r = await compressImage(f, 64, 0.5); Object.assign(media, { w: r.w * 10, h: r.h * 10, thumb: r.thumb }); const b = await createImageBitmap(f).catch(() => null); if (b) { media.w = b.width; media.h = b.height; } }
  else if (it.kind === 'audio') { media.dur = await audioDuration(f); }
  const up = await uploadToChat(chatId, blob, f.name);
  Object.assign(media, up);
  return sendMessage(chatId, { kind: it.kind, body: caption || null, media, view_once: viewOnce && ['image', 'video'].includes(it.kind), reply_to: replyTo });
}
async function shrinkDataUrl(d, max = 160, q = 0.55) { const img = new Image(); img.src = d; await img.decode(); const c = document.createElement('canvas'); const s = Math.min(1, max / Math.max(img.width, img.height)); c.width = img.width * s; c.height = img.height * s; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', q); }

// ===== Nota de voz =====
async function startVoice(c, wrap) {
  if (rec) return;
  rec = new VoiceRecorder();
  try { await rec.start(); } catch (e) { rec = null; return toast('No hay acceso al micrófono: ' + e.message); }
  const time = h('b', { class: 'rec-time' }, '0:00'); const lvl = h('div', { class: 'rec-wave' });
  const bar = h('div', { class: 'rec-bar', id: 'rec-bar' },
    btn('trash', 'Descartar', () => { rec.cancel(); rec = null; bar.remove(); clearInterval(t); }),
    h('span', { class: 'rec-dot' }), time, lvl,
    btn('pause', 'Pausar', e => { const b = e.currentTarget; if (rec.rec.state === 'recording') { rec.pause(); b.innerHTML = ''; b.append(icon('mic')); } else { rec.resume(); b.innerHTML = ''; b.append(icon('pause')); } }),
    h('button', { class: 'send-btn', id: 'rec-send', 'aria-label': 'Enviar nota de voz', onclick: async () => {
      clearInterval(t); const r = rec; rec = null; bar.remove();
      const { blob, dur, wave } = await r.stop();
      if (dur < 0.6 || blob.size < 500) return toast('Nota de voz muy corta');
      try {
        const up = await uploadToChat(c.id, blob, 'nota.' + (blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm'));
        const rp = reply; clearExtra();
        await sendMessage(c.id, { kind: 'voice', media: { ...up, dur }, meta: { wave }, reply_to: rp?.id || null });
      } catch (e) { toast('No se envió la nota: ' + e.message); }
    } }, icon('send', 22)));
  rec.onlevel = v => { lvl.append(h('i', { style: { height: (3 + v * 26) + 'px' } })); while (lvl.children.length > 48) lvl.firstChild.remove(); };
  const t = setInterval(() => { if (!rec) return clearInterval(t); time.textContent = fmtDur(rec.elapsed); sendTyping('audio'); if (rec.elapsed > 900) $('#rec-send')?.click(); }, 300);
  wrap.append(bar);
}

// ===== Ubicación =====
const liveWatch = new Map();
function locationSheet(c) {
  if (!navigator.geolocation) return toast('Tu navegador no permite ubicación');
  let s;
  const share = (live) => {
    s.close(); toast('Obteniendo ubicación…');
    navigator.geolocation.getCurrentPosition(async pos => {
      const meta = { lat: +pos.coords.latitude.toFixed(6), lon: +pos.coords.longitude.toFixed(6), acc: Math.round(pos.coords.accuracy) };
      if (live) meta.live_until = new Date(Date.now() + live * 60e3).toISOString();
      try { const m = await sendMessage(c.id, { kind: 'location', meta }); if (live) startLive(m, live); } catch (e) { toast(e.message); }
    }, err => toast('No se pudo obtener la ubicación: ' + err.message), { enableHighAccuracy: true, timeout: 15000 });
  };
  s = sheet('Compartir ubicación', h('div', { class: 'form' },
    h('button', { class: 'btn primary', onclick: () => share(0) }, icon('location', 18), ' Enviar mi ubicación actual'),
    h('p', { class: 'muted' }, 'Ubicación en tiempo real (se actualiza mientras DUNA esté abierta):'),
    h('div', { class: 'row-btns' }, [15, 60, 480].map(m => h('button', { class: 'btn ghost', onclick: () => share(m) }, m < 60 ? m + ' min' : m / 60 + ' h')))));
}
function startLive(m, minutes) {
  const until = Date.now() + minutes * 60e3;
  const id = navigator.geolocation.watchPosition(async pos => {
    if (Date.now() > until) return stopLive(m);
    const meta = { ...m.meta, lat: +pos.coords.latitude.toFixed(6), lon: +pos.coords.longitude.toFixed(6), acc: Math.round(pos.coords.accuracy) };
    const last = liveWatch.get(m.id); if (last && Date.now() - last.t < 15000) return;
    liveWatch.set(m.id, { id, t: Date.now() });
    const enc = isE2E(S.chats.get(m.chat_id)) ? await encryptFor(m.chat_id, null, meta) : null;
    await rpc('update_message_meta', { p_id: m.id, p_enc: enc, p_meta: enc ? null : meta }).catch(() => {});
  }, () => {}, { enableHighAccuracy: true, maximumAge: 10000 });
  liveWatch.set(m.id, { id, t: 0 });
}
export async function stopLive(m) {
  const w = liveWatch.get(m.id); if (w) navigator.geolocation.clearWatch(w.id); liveWatch.delete(m.id);
  const meta = { ...m.meta, live_until: new Date().toISOString() };
  const enc = isE2E(S.chats.get(m.chat_id)) ? await encryptFor(m.chat_id, null, meta) : null;
  await rpc('update_message_meta', { p_id: m.id, p_enc: enc, p_meta: enc ? null : meta }).catch(e => toast(e.message));
  m.meta = meta; emit('rerender'); toast('Dejaste de compartir tu ubicación');
}

// ===== Contacto =====
async function contactSheet(c) {
  let s; const list = h('div', { class: 'list pick' });
  const { data: cts } = await sb.from('contacts').select('contact_id');
  const ids = new Set([...(cts || []).map(x => x.contact_id), ...[...S.chats.values()].filter(x => x.type === 'direct' && x.other_id).map(x => x.other_id)]);
  const people = [...ids].map(id => S.profiles.get(id)).filter(Boolean);
  const q = h('input', { type: 'search', placeholder: 'Buscar por nombre o @usuario', oninput: debounce(async () => {
    const v = q.value.trim(); if (v.length < 2) return draw(people);
    draw(await rpc('search_users', { q: v }));
  }, 250) });
  const draw = arr => { list.innerHTML = ''; for (const p of arr) list.append(h('button', { class: 'person', onclick: async () => {
    s.close(); await sendMessage(c.id, { kind: 'contact', meta: { user_id: p.id, name: p.display_name, username: p.username, avatar_path: p.avatar_path } }).catch(e => toast(e.message));
  } }, avatar(p, 40), h('div', null, h('b', null, p.alias || p.display_name), h('small', null, '@' + p.username)))); if (!arr.length) list.append(h('p', { class: 'muted' }, 'Busca a alguien por su usuario')); };
  draw(people);
  s = sheet('Compartir contacto', h('div', { class: 'form' }, q, list, h('button', { class: 'btn ghost', onclick: () => { s.close(); sendMessage(c.id, { kind: 'contact', meta: { user_id: S.user.id, name: S.me.display_name, username: S.me.username, avatar_path: S.me.avatar_path } }); } }, 'Compartir mi contacto')));
}

// ===== Encuesta =====
function pollSheet(c) {
  let s; const q = h('input', { placeholder: 'Pregunta', maxlength: 200 });
  const opts = h('div', { class: 'poll-opts' });
  const addOpt = (v = '') => { if (opts.children.length >= 12) return; const i = h('input', { placeholder: 'Opción ' + (opts.children.length + 1), maxlength: 100, value: v, oninput: () => { if (i === opts.lastChild && i.value) addOpt(); } }); opts.append(i); };
  addOpt(); addOpt();
  const multi = h('input', { type: 'checkbox', checked: true });
  s = sheet('Crear encuesta', h('div', { class: 'form' }, q, opts, h('label', { class: 'switch' }, multi, h('span', null, 'Permitir varias respuestas')),
    h('button', { class: 'btn primary', onclick: async () => {
      const o = [...opts.querySelectorAll('input')].map(i => i.value.trim()).filter(Boolean);
      if (!q.value.trim() || o.length < 2) return toast('Escribe la pregunta y al menos 2 opciones');
      s.close(); await sendMessage(c.id, { kind: 'poll', meta: { q: q.value.trim(), o, multi: multi.checked } }).catch(e => toast(e.message));
    } }, 'Enviar encuesta')));
}

// ===== Vista previa de enlaces (función de servidor "vista-enlace") =====
export async function linkPreview(text) {
  const m = text.match(/\bhttps?:\/\/[^\s<]+[^\s<.,;:!?)"']/); if (!m || S.prefs.linkPreview === false) return null;
  try {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 7000);
    const { data, error } = await sb.functions.invoke('vista-enlace', { body: { url: m[0] }, signal: ctrl.signal }); clearTimeout(t);
    if (error || !data?.title) return null;
    let img = null;
    if (data.imageData) img = await shrinkDataUrl(data.imageData, 200, 0.5).catch(() => null);
    if (img && img.length > 8000) img = await shrinkDataUrl(data.imageData, 120, 0.45).catch(() => null);
    if (img && img.length > 8000) img = null;
    return { url: m[0], title: data.title.slice(0, 120), desc: (data.description || '').slice(0, 200) || null, img };
  } catch { return null; }
}
