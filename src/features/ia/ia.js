// IA DUNA: asistente de inteligencia artificial de DUNA.
// - Chat propio fijado en la lista ("IA DUNA"); su historial vive SOLO en este dispositivo (IndexedDB), no en el servidor.
//   Con internet (búsqueda, noticias, clima, TRM, leer enlaces) y fuentes, fotos, notas de voz, imágenes generadas,
//   lectura en voz alta y modo "pensar más".
// - @IA en un chat: IA DUNA responde dentro del chat (lo ven todos); si respondes a una foto o nota de voz, la incluye.
// - Ayudas: resumir, sugerir respuestas, mejorar redacción, traducir, transcribir notas de voz y preguntar por una foto.
// Las consultas pasan por la función del servidor "ia" (requiere sesión y tiene límite por usuario).
import { sb } from '../../services/sb.js';
import { h, $, icon, btn, menu, toast, sheet, confirmDialog, richText, fmtTime, copyText, download, fmtDur } from '../../shared/ui.js';
import { S, emit, nameOf, previewText, sendMessage, savePrefs, findMsg } from '../../services/state.js';
import { kvGet, kvSet, kvDel } from '../../services/crypto.js';
import { IA_ID, IA_PREFIX, iaMention, iaBody, SPARK, iaAvatar, iaRowPreview } from './ia-lite.js';
export { IA_ID, IA_PREFIX, iaMention, iaBody, iaAvatar, iaRowPreview };


// ===== Utilidades de archivos =====
export function blobB64(blob) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = () => rej(r.error); r.readAsDataURL(blob); }); }
/** Imagen lista para IA DUNA (máx. 1024 px, JPEG): { m, d } en base64 y una miniatura para el historial local. */
export async function imgForIA(blob, max = 1024) {
  const bmp = await createImageBitmap(blob);
  const draw = (mx, q) => { const sc = Math.min(1, mx / Math.max(bmp.width, bmp.height)); const c = document.createElement('canvas'); c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', q); };
  const full = draw(max, 0.8);
  return { m: 'image/jpeg', d: full.split(',')[1], thumb: draw(360, 0.7) };
}
async function audioForIA(blob) {
  if (blob.size > 6 * 1048576) throw new Error('La nota de voz es muy larga para IA DUNA (máx. ~6 MB)');
  return { m: (blob.type || 'audio/webm').split(';')[0], d: await blobB64(blob) };
}
const srcLinks = (src) => src?.length ? h('div', { class: 'ia-src' }, h('small', null, '🌐 Fuentes'), src.map(s => h('a', { href: s.u, 'data-title': s.t, rel: 'noopener noreferrer', title: s.u }, (s.t || s.u).slice(0, 70)))) : null;

// ===== Llamada al servidor =====
export async function askIA(mode, body = {}) {
  if (navigator.onLine === false) throw new Error('Sin conexión a internet');
  const { data, error } = await sb.functions.invoke('ia', { body: { mode, me: S.me?.display_name || '', ...body } });
  if (error) {
    let msg = 'IA DUNA no pudo responder. Intenta de nuevo.';
    try { const j = await error.context.json(); if (j?.error) msg = j.error; } catch {}
    throw new Error(msg);
  }
  if (typeof data?.left === 'number') S.iaLeft = data.left;
  return data;
}
export async function iaConsent() {
  if (S.prefs.iaOk2) return true;
  const ok = await confirmDialog('IA DUNA es el asistente de inteligencia artificial de DUNA. Para responderte, lo que le envías (texto, fotos o notas de voz y, cuando la mencionas con @IA o pides un resumen o sugerencias, los mensajes recientes de ese chat) se procesa en servicios externos de IA. Si le pides algo de internet, hace búsquedas en sitios públicos, y las imágenes que pidas se crean con un servicio externo gratuito. En los chats cifrados, ese contenido sale del cifrado de extremo a extremo solo para esa consulta. DUNA no guarda esas consultas en el servidor, pero el servicio de IA (plan gratuito) puede usarlas para mejorar sus modelos: no compartas datos sensibles.', 'Entendido');
  if (ok) { S.prefs.iaOk = S.prefs.iaOk2 = true; savePrefs(); }
  return ok;
}
/** Mensajes recientes del chat como contexto ({n: nombre, t: texto}). */
export function chatContext(chatId, max = 60, uptoId) {
  let arr = (S.msgs.get(chatId) || []).filter(m => !m.deleted_for_all && !m._err && m.kind !== 'system' && !m._pending);
  if (uptoId) { const i = arr.findIndex(m => m.id === uptoId); if (i >= 0) arr = arr.slice(0, i); }
  return arr.slice(-max).map(m => ({ n: m.meta?.ai ? 'IA DUNA' : nameOf(m.sender_id, { you: false }), t: m.meta?.ai ? iaBody(m) : (S.tr?.get(m.id)?.k === 'stt' ? '🎤 ' + S.tr.get(m.id).t : previewText(m)) })).filter(x => x.t);
}
/** Foto o nota de voz de un mensaje del chat (descifrada en el dispositivo) lista para IA DUNA. */
async function mediaOf(m) {
  const { mediaBlob } = await import('../../services/media.js');
  const blob = await mediaBlob(m);
  if (['image', 'gif', 'sticker'].includes(m.kind) || blob.type.startsWith('image/')) { const x = await imgForIA(blob); return { images: [{ m: x.m, d: x.d }] }; }
  if (['voice', 'audio'].includes(m.kind)) return { audio: await audioForIA(blob) };
  return {};
}

// ===== @IA dentro de un chat =====
const busy = new Set();
function setTyping(chatId, on) {
  if (on) S.typing.set(chatId, 'IA DUNA está escribiendo…'); else if (S.typing.get(chatId)?.startsWith('IA DUNA')) S.typing.delete(chatId);
  emit('typing'); if (S.current === chatId) import('../chats/chat.js').then(c => c.renderHead());
}
export async function iaReplyInChat(c, m) {
  if (busy.has(m.id)) return; busy.add(m.id);
  setTyping(c.id, true);
  try {
    const q = m.reply_to ? findMsg(c.id, m.reply_to) : null;
    const extra = q && (q.media || q.kind === 'image') && ['image', 'voice', 'audio', 'gif'].includes(q.kind) && !q.view_once ? await mediaOf(q).catch(() => ({})) : {};
    const r = await askIA('mention', { text: m.body, group: c.type !== 'direct', context: chatContext(c.id, 50, m.id), ...extra });
    const src = (r.sources || []).slice(0, 3).map(s => `• ${s.u}`).join('\n');
    await sendMessage(c.id, { kind: 'text', body: IA_PREFIX + r.text + (src ? '\n\n🌐 Fuentes:\n' + src : ''), reply_to: m.id, meta: { ai: 1, rq: { sender_id: m.sender_id, kind: 'text', body: (m.body || '').slice(0, 200) } } });
  } catch (e) { toast(e.message, 4000); }
  finally { setTyping(c.id, false); busy.delete(m.id); }
}

// ===== Resumir / sugerir / reescribir / traducir / transcribir / preguntar por una foto =====
export async function iaSummary(c) {
  if (!(await iaConsent())) return;
  const ctx = chatContext(c.id, 150);
  if (ctx.length < 2) return toast('Aún no hay suficientes mensajes para resumir');
  const body = h('div', { class: 'ia-out' }, h('div', { class: 'spinner' }), h('p', { class: 'muted center' }, 'IA DUNA está leyendo el chat…'));
  sheet('✨ Resumen de IA DUNA', body, { wide: true });
  try {
    const r = await askIA('summary', { context: ctx });
    body.innerHTML = '';
    body.append(h('div', { class: 'txt ia-txt', html: richText(r.text) }), h('p', { class: 'fine' }, `Basado en los últimos ${ctx.length} mensajes cargados. Puede contener errores.`),
      h('div', { class: 'row-btns' }, h('button', { class: 'btn ghost', onclick: () => speak(r.text) }, '🔊 Escuchar'), h('button', { class: 'btn ghost', onclick: () => copyText(r.text) }, 'Copiar')));
  } catch (e) { body.innerHTML = ''; body.append(h('p', { class: 'muted' }, e.message)); }
}
export async function iaSuggest(c) {
  if (!(await iaConsent())) return null;
  const ctx = chatContext(c.id, 30);
  if (!ctx.length) { toast('Escribe o recibe algún mensaje primero'); return null; }
  const r = await askIA('suggest', { context: ctx });
  return r.replies || [];
}
export async function iaRewrite(text, style) {
  if (!(await iaConsent())) return null;
  return (await askIA('rewrite', { text, style })).text;
}
S.tr = S.tr || new Map(); // id del mensaje -> { k: 'tr'|'stt', t } (solo en memoria)
export async function iaTranslate(m) {
  if (!(await iaConsent())) return;
  const text = m.meta?.ai ? iaBody(m) : m.body; if (!text) return;
  S.tr.set(m.id, { k: 'tr', t: '…' }); emit('rerender');
  try { const r = await askIA('translate', { text, to: 'español' }); S.tr.set(m.id, { k: 'tr', t: r.text }); }
  catch (e) { S.tr.delete(m.id); toast(e.message); }
  emit('rerender');
}
export async function iaTranscribe(m) {
  if (!(await iaConsent())) return;
  S.tr.set(m.id, { k: 'stt', t: '…' }); emit('rerender');
  try { const x = await mediaOf(m); if (!x.audio) throw new Error('No se pudo leer el audio'); const r = await askIA('transcribe', x); S.tr.set(m.id, { k: 'stt', t: r.text }); }
  catch (e) { S.tr.delete(m.id); toast(e.message); }
  emit('rerender');
}
export async function iaAskImage(m) {
  if (!(await iaConsent())) return;
  let img = null;
  const out = h('div', { class: 'ia-out' }, h('div', { class: 'spinner' }));
  const inp = h('input', { type: 'text', placeholder: 'Pregunta algo sobre la imagen…', maxlength: 500, id: 'ia-img-q' });
  const ask = async (q) => {
    out.innerHTML = ''; out.append(h('div', { class: 'spinner' }));
    try { img ||= await mediaOf(m); if (!img.images) throw new Error('No se pudo leer la imagen'); const r = await askIA('describe', { ...img, text: q || '' }); out.innerHTML = ''; out.append(h('div', { class: 'txt ia-txt', html: richText(r.text) })); }
    catch (e) { out.innerHTML = ''; out.append(h('p', { class: 'muted' }, e.message)); }
  };
  inp.addEventListener('keydown', e => { if (e.key === 'Enter' && inp.value.trim()) { ask(inp.value.trim()); inp.value = ''; } });
  sheet('✨ IA DUNA · Foto', h('div', { class: 'form' }, out, h('div', { class: 'ia-ask' }, inp, h('button', { class: 'btn primary sm', onclick: () => { if (inp.value.trim()) { ask(inp.value.trim()); inp.value = ''; } } }, 'Preguntar'))), { wide: true });
  ask('');
}
// Lectura en voz alta (se genera en el servidor y se reproduce aquí; no se guarda)
let speaking = null;
export async function speak(text, btnEl) {
  if (speaking) { speaking.pause(); speaking = null; if (btnEl) btnEl.classList.remove('on'); return; }
  if (!(await iaConsent())) return;
  btnEl?.classList.add('busy');
  try {
    const r = await askIA('tts', { text: text.slice(0, 1500) });
    const a = new Audio('data:' + r.audio.m + ';base64,' + r.audio.d); speaking = a; btnEl?.classList.add('on');
    a.onended = a.onpause = () => { if (speaking === a) speaking = null; btnEl?.classList.remove('on'); };
    await a.play();
  } catch (e) { toast(e.message); }
  finally { btnEl?.classList.remove('busy'); }
}

// ===== Chat propio "IA DUNA" (historial local) =====
let hist = null; let sending = false;
const hkey = () => 'ia:' + S.user.id;
export async function iaHistory() { if (!hist) { hist = (await kvGet(hkey()).catch(() => null)) || []; } return hist; }
async function saveHist() {
  hist = hist.slice(-200);
  // las imágenes ocupan espacio: solo se conservan en las últimas 30 entradas
  hist.forEach((x, i) => { if (i < hist.length - 30 && x.img) { delete x.img; x.t = x.t || '🖼️ Imagen'; } });
  await kvSet(hkey(), hist).catch(() => {}); S.iaLast = hist[hist.length - 1] || null; emit('chats');
}
const preview = x => x.t || (x.img ? '🖼️ Imagen' : x.voice ? '🎤 Nota de voz' : '');
export async function iaInitPreview() { await iaHistory(); S.iaLast = hist[hist.length - 1] || null; emit('chats'); }

export async function openIA(fromRoute = false) {
  const { closeChat } = await import('../chats/chat.js');
  S.current = IA_ID;
  document.getElementById('app')?.classList.add('in-chat');
  if (!fromRoute && location.hash !== '#/c/' + IA_ID) history.pushState(null, '', '#/c/' + IA_ID);
  document.querySelectorAll('.chat-row').forEach(r => r.classList.toggle('active', r.dataset.chat === IA_ID));
  const pane = $('#pane'); pane.innerHTML = '';
  const list = h('div', { class: 'msgs', id: 'msgs', role: 'log', 'aria-live': 'polite' });
  const SUB = 'Asistente con IA · conectado a internet';
  const sub = h('small', null, SUB);
  let deep = !!S.prefs.iaDeep;
  const head = h('header', { class: 'conv-head', id: 'conv-head' },
    h('button', { class: 'icon-btn back', 'aria-label': 'Volver', onclick: () => closeChat() }, icon('back')),
    h('button', { class: 'head-id', onclick: () => iaInfo() }, iaAvatar(40), h('div', null, h('b', null, 'IA DUNA'), sub)),
    h('div', { class: 'acts' }, btn('more', 'Más opciones', e => menu([
      { icon: 'bolt', label: deep ? 'Desactivar "Pensar más"' : 'Activar "Pensar más" (más lento)', action: () => { deep = !deep; S.prefs.iaDeep = deep; savePrefs(); deepB.classList.toggle('on', deep); toast(deep ? 'Pensar más: respuestas más elaboradas (pueden tardar ~30 s)' : 'Respuestas rápidas'); } },
      { icon: 'info', label: 'Sobre IA DUNA', action: () => iaInfo() },
      { icon: 'trash', label: 'Borrar conversación', danger: true, action: async () => { if (!(await confirmDialog('¿Borrar la conversación con IA DUNA de este dispositivo?', 'Borrar', true))) return; hist = []; await kvDel(hkey()).catch(() => {}); S.iaLast = null; emit('chats'); draw(); } },
    ], e.currentTarget))));
  const ta = h('textarea', { rows: 1, placeholder: 'Pregúntale a IA DUNA', id: 'ia-input', 'aria-label': 'Escribe a IA DUNA', maxlength: 4000, enterkeyhint: 'send' });
  const sendB = h('button', { type: 'button', class: 'send-btn mic', id: 'ia-send', 'aria-label': 'Grabar pregunta de voz' }, icon('mic', 22));
  let pendingImg = null;
  const attachRow = h('div', { id: 'ia-attach' });
  const photoB = btn('image', 'Enviar una foto a IA DUNA', () => { const inp = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' } }); inp.onchange = async () => { const f = inp.files[0]; inp.remove(); if (!f) return; try { pendingImg = await imgForIA(f); drawAttach(); ta.focus(); updateBtn(); } catch { toast('No se pudo leer la imagen'); } }; document.body.append(inp); inp.click(); });
  photoB.id = 'ia-photo';
  // Documentos (PDF o texto): IA DUNA los lee y resume, o responde lo que escribas sobre ellos
  const docB = btn('doc', 'Leer un documento (PDF o texto) con IA DUNA', () => { const inp = h('input', { type: 'file', accept: 'application/pdf,text/plain,text/csv,text/markdown,.pdf,.txt,.csv,.md', style: { display: 'none' } });
    inp.onchange = () => { const f = inp.files[0]; inp.remove(); if (f) sendDoc(f); }; document.body.append(inp); inp.click(); });
  docB.id = 'ia-doc';
  const deepB = btn('bolt', 'Pensar más (más lento)', () => { deep = !deep; S.prefs.iaDeep = deep; savePrefs(); deepB.classList.toggle('on', deep); toast(deep ? 'Pensar más activado: respuestas más elaboradas (pueden tardar ~30 s)' : 'Respuestas rápidas'); });
  deepB.classList.add('ia-deep'); deepB.classList.toggle('on', deep);
  const comp = h('footer', { class: 'composer' }, attachRow, h('div', { class: 'comp-row' }, h('div', { class: 'comp-box' }, deepB, ta, docB, photoB), sendB));
  const view = h('div', { class: 'conv wp-' + (S.prefs.wallpaper || 'arena') + ' ia-conv', id: 'conv', dataset: { chat: IA_ID } }, head, list, comp);
  pane.append(view);
  function drawAttach() {
    attachRow.innerHTML = '';
    if (pendingImg) attachRow.append(h('div', { class: 'reply-bar ia-pend' }, h('img', { src: pendingImg.thumb, alt: '' }), h('span', { class: 'grow' }, 'Foto lista para enviar'), btn('x', 'Quitar foto', () => { pendingImg = null; drawAttach(); updateBtn(); })));
  }
  const updateBtn = () => { const has = ta.value.trim() || pendingImg; sendB.innerHTML = ''; sendB.append(icon(has ? 'send' : 'mic', 22)); sendB.classList.toggle('mic', !has); sendB.setAttribute('aria-label', has ? 'Enviar' : 'Grabar pregunta de voz'); };
  const bubbleOf = (x, i) => {
    const me = x.r === 'me';
    const speakB = !me && !x.err && x.t ? h('button', { class: 'ia-act', title: 'Escuchar', 'aria-label': 'Escuchar', onclick: e => { e.stopPropagation(); speak(x.t, e.currentTarget); } }, '🔊') : null;
    const b = h('div', { class: 'bubble first' + (me ? '' : ' ai') + (x.err ? ' ia-err' : '') + (x.img ? ' has-img' : '') },
      !me ? h('b', { class: 'sender ia-label' }, '✨ IA DUNA') : null,
      x.img ? h('img', { class: 'ia-img', src: x.img, alt: me ? 'Foto enviada' : 'Imagen generada por IA DUNA', onclick: () => window.open(x.img, '_blank') }) : null,
      x.voice ? h('div', { class: 'ia-voice' }, '🎤 Nota de voz', x.dur ? ' · ' + fmtDur(x.dur) : '') : null,
      x.t ? h('div', { class: 'txt', html: richText(x.t) }) : null,
      srcLinks(x.src),
      h('span', { class: 'meta' }, x.deep ? h('em', null, 'pensado ') : null, fmtTime(x.at), speakB));
    const act = e => { e.preventDefault?.(); menu([
      x.t ? { icon: 'copy', label: 'Copiar', action: () => copyText(x.t) } : null,
      !me && x.t && !x.err ? { icon: 'headphones', label: 'Escuchar', action: () => speak(x.t) } : null,
      x.img ? { icon: 'download', label: 'Descargar imagen', action: async () => download('IA-DUNA-' + Date.now() + '.jpg', await (await fetch(x.img)).blob()) } : null,
      { icon: 'trash', label: 'Eliminar', danger: true, action: async () => { hist.splice(i, 1); await saveHist(); draw(); } }], e.clientX != null ? { x: e.clientX, y: e.clientY } : b); };
    b.addEventListener('contextmenu', act);
    let lp; b.addEventListener('touchstart', () => { lp = setTimeout(() => act({}), 480); }, { passive: true });
    ['touchend', 'touchmove'].forEach(ev => b.addEventListener(ev, () => clearTimeout(lp), { passive: true }));
    return h('div', { class: 'mrow first' + (me ? ' me' : ''), dataset: { i } }, h('div', { class: 'bcol' }, b));
  };
  const starters = ['¿Qué noticias hay hoy en Colombia?', '¿A cuánto está el dólar hoy?', '¿Cómo está el clima en Puerto Asís?', 'Dibuja un atardecer en el río Putumayo', 'Ayúdame a escribir un mensaje de cumpleaños', '¿Qué puedes hacer?'];
  function draw() {
    list.innerHTML = '';
    list.append(h('div', { class: 'sys e2e' }, h('span', null, '✨ IA DUNA responde con inteligencia artificial, busca en internet cuando hace falta y puede equivocarse. Esta conversación se guarda solo en este dispositivo.')));
    if (!hist.length) list.append(h('div', { class: 'ia-empty' }, iaAvatar(72), h('h3', null, 'Hola, soy IA DUNA'), h('p', { class: 'muted' }, 'Pregúntame lo que quieras: noticias, clima, el dólar, ideas o ayuda para escribir. Envíame fotos o notas de voz y pídeme que dibuje algo. En tus chats, escribe @IA para que responda ahí.'),
      h('div', { class: 'ia-starters' }, starters.map(s => h('button', { class: 'chip', onclick: () => { ta.value = s; submit(); } }, s)))));
    hist.forEach((x, i) => list.append(bubbleOf(x, i)));
    if (sending) list.append(h('div', { class: 'mrow first', id: 'ia-typing' }, h('div', { class: 'bcol' }, h('div', { class: 'bubble first ai' }, h('span', { class: 'ia-dots' }, h('i'), h('i'), h('i')), h('small', { class: 'ia-status' }, sending)))));
    list.scrollTop = list.scrollHeight;
  }
  function statusFor(text, hasImg, hasVoice) {
    if (hasVoice) return 'Escuchando tu nota de voz…';
    if (hasImg) return 'Mirando la foto…';
    if (/dibuj|imagen|genera|ilustra|pinta|crea una foto/i.test(text)) return 'Creando la imagen…';
    if (/hoy|noticia|clima|dólar|dolar|trm|precio|busca|actual|últim|ultim|partido|resultado|quién es|quien es|http/i.test(text)) return 'Buscando en internet…';
    return deep ? 'Pensando a fondo…' : 'Escribiendo…';
  }
  async function submit(voice) {
    const text = ta.value.trim(); const img = pendingImg;
    if ((!text && !img && !voice) || sending) return;
    if (!(await iaConsent())) return;
    ta.value = ''; ta.style.height = 'auto'; pendingImg = null; drawAttach(); updateBtn();
    const prev = hist.filter(x => !x.err).slice(-40).map(x => ({ r: x.r, t: x.t || (x.img ? (x.r === 'me' ? '[Envié una foto]' : '[Generaste una imagen]') : x.voice ? '[Nota de voz]' : '') }));
    hist.push({ r: 'me', t: text, at: new Date().toISOString(), ...(img ? { img: img.thumb } : {}), ...(voice ? { voice: true, dur: voice.dur } : {}) });
    sending = statusFor(text, !!img, !!voice); sub.textContent = sending.replace('…', '').toLowerCase() + '…'; draw(); saveHist();
    try {
      const r = await askIA('chat', { text, history: prev, deep, ...(img ? { images: [{ m: img.m, d: img.d }] } : {}), ...(voice ? { audio: voice.audio } : {}) });
      let gimg = null; if (r.image?.d) { try { gimg = (await imgForIA(await (await fetch('data:' + r.image.m + ';base64,' + r.image.d)).blob(), 768)).thumb.replace(/^/, ''); gimg = 'data:' + r.image.m + ';base64,' + r.image.d; } catch {} }
      hist.push({ r: 'ia', t: r.text, at: new Date().toISOString(), ...(r.sources?.length ? { src: r.sources } : {}), ...(gimg ? { img: gimg } : {}), ...(deep ? { deep: true } : {}) });
    } catch (e) { hist.push({ r: 'ia', t: '⚠️ ' + e.message, at: new Date().toISOString(), err: true }); }
    sending = false; sub.textContent = SUB;
    if (S.current === IA_ID) draw(); await saveHist();
  }
  async function sendDoc(f) {
    if (sending) return; if (f.size > 6 * 1024 * 1024) return toast('El documento supera 6 MB');
    const m = f.type || (/\.pdf$/i.test(f.name) ? 'application/pdf' : /\.csv$/i.test(f.name) ? 'text/csv' : /\.md$/i.test(f.name) ? 'text/markdown' : 'text/plain');
    if (!/^(application\/pdf|text\/(plain|csv|markdown|html))$/.test(m)) return toast('Formato no compatible: usa PDF o texto');
    if (!(await iaConsent())) return;
    const text = ta.value.trim(); ta.value = ''; updateBtn();
    hist.push({ r: 'me', t: '📄 ' + f.name + (text ? '\n' + text : ''), at: new Date().toISOString() });
    sending = 'Leyendo el documento…'; sub.textContent = 'leyendo el documento…'; draw(); saveHist();
    try { const r = await askIA('doc', { text, doc: { m, d: await blobB64(f) } }); hist.push({ r: 'ia', t: r.text, at: new Date().toISOString() }); }
    catch (e) { hist.push({ r: 'ia', t: '⚠️ ' + e.message, at: new Date().toISOString(), err: true }); }
    sending = false; sub.textContent = SUB; if (S.current === IA_ID) draw(); await saveHist();
  }
  // Nota de voz: toca el micrófono para grabar y otra vez para enviar
  let rec = null;
  async function voiceToggle() {
    if (rec) { const r = rec; rec = null; sendB.classList.remove('rec'); ta.placeholder = 'Pregúntale a IA DUNA'; ta.disabled = false;
      try { const { blob, dur } = await r.stop(); if (dur < 0.6) return toast('Mantén la grabación un poco más'); submit({ audio: await audioForIA(blob), dur }); } catch (e) { toast(e.message); } return; }
    try { const { VoiceRecorder } = await import('../../services/media.js'); rec = new VoiceRecorder(); await rec.start(); sendB.classList.add('rec'); ta.placeholder = '🎤 Grabando… toca ➤ para enviar'; ta.disabled = true; sendB.innerHTML = ''; sendB.append(icon('send', 22)); }
    catch { rec = null; toast('No se pudo usar el micrófono'); }
  }
  ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(140, ta.scrollHeight) + 'px'; updateBtn(); });
  ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !matchMedia('(pointer:coarse)').matches) { e.preventDefault(); submit(); } });
  ta.addEventListener('paste', async e => { const f = [...(e.clipboardData?.files || [])].find(x => x.type.startsWith('image/')); if (f) { e.preventDefault(); pendingImg = await imgForIA(f); drawAttach(); updateBtn(); } });
  sendB.addEventListener('pointerdown', e => { if (document.activeElement === ta) e.preventDefault(); });
  sendB.addEventListener('mousedown', e => { if (document.activeElement === ta) e.preventDefault(); });
  sendB.addEventListener('click', e => { e.preventDefault(); if (rec) return voiceToggle(); const keep = document.activeElement === ta; if (ta.value.trim() || pendingImg) { submit(); if (keep) ta.focus({ preventScroll: true }); } else voiceToggle(); });
  await iaHistory(); draw(); updateBtn();
  if (!matchMedia('(pointer:coarse)').matches) ta.focus();
}
export function iaInfo() {
  sheet('IA DUNA', h('div', { class: 'form' }, h('div', { class: 'center' }, iaAvatar(64)),
    h('p', null, 'IA DUNA es el asistente con inteligencia artificial de DUNA.'),
    h('ul', { class: 'ia-list' },
      h('li', null, h('b', null, 'Chat IA DUNA: '), 'pregúntale lo que quieras. Busca en internet (noticias, clima, TRM, páginas) y muestra las fuentes. La conversación se guarda solo en este dispositivo.'),
      h('li', null, h('b', null, 'Fotos y voz: '), 'envíale una foto 🖼️ o una nota de voz 🎤; toca 🔊 para escuchar sus respuestas.'),
      h('li', null, h('b', null, 'Imágenes: '), 'pídele "dibuja…" o "genera una imagen de…".'),
      h('li', null, h('b', null, 'Pensar más ⚡: '), 'respuestas más elaboradas para preguntas difíciles (más lento).'),
      h('li', null, h('b', null, '@IA en un chat: '), 'escribe @IA y tu pregunta; responde dentro del chat y la ven todos. Si respondes a una foto o nota de voz con @IA, la tiene en cuenta.'),
      h('li', null, h('b', null, 'En los chats: '), 'resumir y sugerir respuestas (menú ⋮ o botón ✨), mejorar tu mensaje (✨ con texto escrito), y en cada mensaje: traducir, transcribir notas de voz o preguntar por una foto.')),
    typeof S.iaLeft === 'number' ? h('p', null, h('b', null, `Te quedan ${S.iaLeft} consultas hoy.`)) : null,
    h('p', { class: 'fine' }, 'Para cuidar el plan gratuito hay un límite de consultas por minuto y por día. Puede equivocarse: verifica la información importante. No compartas datos sensibles.')));
}
