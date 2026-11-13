// IA DUNA: asistente de inteligencia artificial de DUNA.
// - Chat propio fijado en la lista ("IA DUNA"); su historial vive SOLO en este dispositivo (IndexedDB), no en el servidor.
// - @IA en un chat: IA DUNA responde dentro del chat (lo ven todos los miembros).
// - Ayudas: resumir el chat, sugerir respuestas y traducir mensajes.
// Las consultas pasan por la función del servidor "ia" (requiere sesión y tiene límite por usuario).
import { sb } from './sb.js';
import { h, $, icon, btn, menu, toast, sheet, confirmDialog, richText, fmtTime, copyText } from './ui.js';
import { S, emit, nameOf, previewText, sendMessage, savePrefs } from './state.js';
import { kvGet, kvSet, kvDel } from './crypto.js';

export const IA_ID = 'ia-duna';
export const IA_PREFIX = '✨ IA DUNA:\n';
export const iaMention = t => /(^|\s)@ia(?![a-z0-9_.])/i.test(t || '');
export const iaBody = m => (m?.body || '').replace(/^✨ IA DUNA:\s*\n?/, '');
const SPARK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.1 5.6 5.6 2.1-5.6 2.1L12 17.9l-2.1-5.6-5.6-2.1 5.6-2.1z" fill="#fff"/><path d="M19 15l.9 2.1 2.1.9-2.1.9L19 21l-.9-2.1-2.1-.9 2.1-.9z" fill="#FFE7A8"/></svg>';
export function iaAvatar(size = 48) {
  return h('span', { class: 'avatar ia-av', style: { width: size + 'px', height: size + 'px' }, html: SPARK });
}

// ===== Llamada al servidor =====
export async function askIA(mode, body = {}) {
  if (navigator.onLine === false) throw new Error('Sin conexión a internet');
  const { data, error } = await sb.functions.invoke('ia', { body: { mode, me: S.me?.display_name || '', ...body } });
  if (error) {
    let msg = 'IA DUNA no pudo responder. Intenta de nuevo.';
    try { const j = await error.context.json(); if (j?.error) msg = j.error; } catch {}
    throw new Error(msg);
  }
  return data;
}
export async function iaConsent() {
  if (S.prefs.iaOk) return true;
  const ok = await confirmDialog('IA DUNA es el asistente de inteligencia artificial de DUNA. Para responderte, el texto que le escribes —y, cuando la mencionas con @IA o le pides un resumen o sugerencias, los mensajes recientes de ese chat— se envían a un servicio de IA externo. En los chats cifrados, ese texto sale del cifrado de extremo a extremo solo para esa consulta. DUNA no guarda esas consultas en el servidor, pero el servicio de IA (plan gratuito) puede usarlas para mejorar sus modelos: no compartas datos sensibles.', 'Entendido');
  if (ok) { S.prefs.iaOk = true; savePrefs(); }
  return ok;
}
/** Mensajes recientes del chat como contexto ({n: nombre, t: texto}). */
export function chatContext(chatId, max = 60, uptoId) {
  let arr = (S.msgs.get(chatId) || []).filter(m => !m.deleted_for_all && !m._err && m.kind !== 'system' && !m._pending);
  if (uptoId) { const i = arr.findIndex(m => m.id === uptoId); if (i >= 0) arr = arr.slice(0, i); }
  return arr.slice(-max).map(m => ({ n: m.meta?.ai ? 'IA DUNA' : nameOf(m.sender_id, { you: false }), t: m.meta?.ai ? iaBody(m) : previewText(m) })).filter(x => x.t);
}

// ===== @IA dentro de un chat =====
const busy = new Set();
function setTyping(chatId, on) {
  if (on) S.typing.set(chatId, 'IA DUNA está escribiendo…'); else if (S.typing.get(chatId)?.startsWith('IA DUNA')) S.typing.delete(chatId);
  emit('typing'); if (S.current === chatId) import('./chat.js').then(c => c.renderHead());
}
export async function iaReplyInChat(c, m) {
  if (busy.has(m.id)) return; busy.add(m.id);
  setTyping(c.id, true);
  try {
    const r = await askIA('mention', { text: m.body, group: c.type !== 'direct', context: chatContext(c.id, 40, m.id) });
    await sendMessage(c.id, { kind: 'text', body: IA_PREFIX + r.text, reply_to: m.id, meta: { ai: 1, rq: { sender_id: m.sender_id, kind: 'text', body: (m.body || '').slice(0, 200) } } });
  } catch (e) { toast(e.message, 4000); }
  finally { setTyping(c.id, false); busy.delete(m.id); }
}

// ===== Resumir / sugerir / traducir =====
export async function iaSummary(c) {
  if (!(await iaConsent())) return;
  const ctx = chatContext(c.id, 80);
  if (ctx.length < 2) return toast('Aún no hay suficientes mensajes para resumir');
  const body = h('div', { class: 'ia-out' }, h('div', { class: 'spinner' }), h('p', { class: 'muted center' }, 'IA DUNA está leyendo el chat…'));
  sheet('✨ Resumen de IA DUNA', body, { wide: true });
  try {
    const r = await askIA('summary', { context: ctx });
    body.innerHTML = '';
    body.append(h('div', { class: 'txt ia-txt', html: richText(r.text) }), h('p', { class: 'fine' }, `Basado en los últimos ${ctx.length} mensajes cargados. Puede contener errores.`),
      h('div', { class: 'row-btns' }, h('button', { class: 'btn ghost', onclick: () => copyText(r.text) }, 'Copiar')));
  } catch (e) { body.innerHTML = ''; body.append(h('p', { class: 'muted' }, e.message)); }
}
export async function iaSuggest(c) {
  if (!(await iaConsent())) return null;
  const ctx = chatContext(c.id, 20);
  if (!ctx.length) { toast('Escribe o recibe algún mensaje primero'); return null; }
  const r = await askIA('suggest', { context: ctx });
  return r.replies || [];
}
S.tr = S.tr || new Map();
export async function iaTranslate(m) {
  if (!(await iaConsent())) return;
  const text = m.meta?.ai ? iaBody(m) : m.body; if (!text) return;
  S.tr.set(m.id, '…'); emit('rerender');
  try { const r = await askIA('translate', { text, to: 'español' }); S.tr.set(m.id, r.text); }
  catch (e) { S.tr.delete(m.id); toast(e.message); }
  emit('rerender');
}

// ===== Chat propio "IA DUNA" (historial local) =====
let hist = null; let sending = false;
const hkey = () => 'ia:' + S.user.id;
export async function iaHistory() { if (!hist) { hist = (await kvGet(hkey()).catch(() => null)) || []; } return hist; }
async function saveHist() { hist = hist.slice(-200); await kvSet(hkey(), hist).catch(() => {}); S.iaLast = hist[hist.length - 1] || null; emit('chats'); }
export function iaRowPreview() { const l = S.iaLast; return l ? (l.r === 'me' ? 'Tú: ' : '') + l.t.replace(/\s+/g, ' ').slice(0, 90) : 'Tu asistente con IA · pregúntale lo que quieras'; }
export async function iaInitPreview() { await iaHistory(); S.iaLast = hist[hist.length - 1] || null; emit('chats'); }

export async function openIA(fromRoute = false) {
  const { closeChat } = await import('./chat.js');
  S.current = IA_ID;
  document.getElementById('app')?.classList.add('in-chat');
  if (!fromRoute && location.hash !== '#/c/' + IA_ID) history.pushState(null, '', '#/c/' + IA_ID);
  document.querySelectorAll('.chat-row').forEach(r => r.classList.toggle('active', r.dataset.chat === IA_ID));
  const pane = $('#pane'); pane.innerHTML = '';
  const list = h('div', { class: 'msgs', id: 'msgs', role: 'log', 'aria-live': 'polite' });
  const sub = h('small', null, 'Asistente con IA de DUNA');
  const head = h('header', { class: 'conv-head', id: 'conv-head' },
    h('button', { class: 'icon-btn back', 'aria-label': 'Volver', onclick: () => closeChat() }, icon('back')),
    h('button', { class: 'head-id', onclick: () => iaInfo() }, iaAvatar(40), h('div', null, h('b', null, 'IA DUNA'), sub)),
    h('div', { class: 'acts' }, btn('more', 'Más opciones', e => menu([
      { icon: 'info', label: 'Sobre IA DUNA', action: () => iaInfo() },
      { icon: 'trash', label: 'Borrar conversación', danger: true, action: async () => { if (!(await confirmDialog('¿Borrar la conversación con IA DUNA de este dispositivo?', 'Borrar', true))) return; hist = []; await kvDel(hkey()).catch(() => {}); S.iaLast = null; emit('chats'); draw(); } },
    ], e.currentTarget))));
  const ta = h('textarea', { rows: 1, placeholder: 'Pregúntale a IA DUNA', id: 'ia-input', 'aria-label': 'Escribe a IA DUNA', maxlength: 4000, enterkeyhint: 'send' });
  const sendB = h('button', { class: 'send-btn', id: 'ia-send', 'aria-label': 'Enviar' }, icon('send', 22));
  const comp = h('footer', { class: 'composer' }, h('div', { class: 'comp-row' }, h('div', { class: 'comp-box' }, ta), sendB));
  const view = h('div', { class: 'conv wp-' + (S.prefs.wallpaper || 'arena') + ' ia-conv', id: 'conv', dataset: { chat: IA_ID } }, head, list, comp);
  pane.append(view);
  const bubbleOf = (x, i) => {
    const me = x.r === 'me';
    const b = h('div', { class: 'bubble first' + (me ? '' : ' ai') + (x.err ? ' ia-err' : '') },
      !me ? h('b', { class: 'sender ia-label' }, '✨ IA DUNA') : null,
      h('div', { class: 'txt', html: richText(x.t) }), h('span', { class: 'meta' }, fmtTime(x.at)));
    const act = e => { e.preventDefault?.(); menu([{ icon: 'copy', label: 'Copiar', action: () => copyText(x.t) }, { icon: 'trash', label: 'Eliminar', danger: true, action: async () => { hist.splice(i, 1); await saveHist(); draw(); } }], e.clientX != null ? { x: e.clientX, y: e.clientY } : b); };
    b.addEventListener('contextmenu', act);
    let lp; b.addEventListener('touchstart', () => { lp = setTimeout(() => act({}), 480); }, { passive: true });
    ['touchend', 'touchmove'].forEach(ev => b.addEventListener(ev, () => clearTimeout(lp), { passive: true }));
    return h('div', { class: 'mrow first' + (me ? ' me' : ''), dataset: { i } }, h('div', { class: 'bcol' }, b));
  };
  const starters = ['¿Qué puedes hacer?', 'Ayúdame a escribir un mensaje de cumpleaños', 'Dame ideas para un plan este fin de semana', 'Explícame algo de forma sencilla'];
  function draw() {
    list.innerHTML = '';
    list.append(h('div', { class: 'sys e2e' }, h('span', null, '✨ IA DUNA responde con inteligencia artificial y puede equivocarse. Esta conversación se guarda solo en este dispositivo.')));
    if (!hist.length) list.append(h('div', { class: 'ia-empty' }, iaAvatar(72), h('h3', null, 'Hola, soy IA DUNA'), h('p', { class: 'muted' }, 'Pregúntame lo que quieras, pídeme ideas o ayuda para escribir. En tus chats, escribe @IA para que responda ahí.'),
      h('div', { class: 'ia-starters' }, starters.map(s => h('button', { class: 'chip', onclick: () => { ta.value = s; submit(); } }, s)))));
    hist.forEach((x, i) => list.append(bubbleOf(x, i)));
    if (sending) list.append(h('div', { class: 'mrow first', id: 'ia-typing' }, h('div', { class: 'bcol' }, h('div', { class: 'bubble first ai' }, h('span', { class: 'ia-dots' }, h('i'), h('i'), h('i'))))));
    list.scrollTop = list.scrollHeight;
  }
  async function submit() {
    const text = ta.value.trim(); if (!text || sending) return;
    if (!(await iaConsent())) return;
    ta.value = ''; ta.style.height = 'auto';
    const prev = hist.filter(x => !x.err).slice(-20).map(x => ({ r: x.r, t: x.t }));
    hist.push({ r: 'me', t: text, at: new Date().toISOString() }); sending = true; sub.textContent = 'escribiendo…'; draw(); saveHist();
    try { const r = await askIA('chat', { text, history: prev }); hist.push({ r: 'ia', t: r.text, at: new Date().toISOString() }); }
    catch (e) { hist.push({ r: 'ia', t: '⚠️ ' + e.message, at: new Date().toISOString(), err: true }); }
    sending = false; sub.textContent = 'Asistente con IA de DUNA';
    if (S.current === IA_ID) draw(); await saveHist();
  }
  ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(140, ta.scrollHeight) + 'px'; });
  ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !matchMedia('(pointer:coarse)').matches) { e.preventDefault(); submit(); } });
  sendB.addEventListener('click', submit);
  await iaHistory(); draw();
  if (!matchMedia('(pointer:coarse)').matches) ta.focus();
}
export function iaInfo() {
  sheet('IA DUNA', h('div', { class: 'form' }, h('div', { class: 'center' }, iaAvatar(64)),
    h('p', null, 'IA DUNA es el asistente con inteligencia artificial de DUNA.'),
    h('ul', { class: 'ia-list' },
      h('li', null, h('b', null, 'Chat IA DUNA: '), 'pregúntale lo que quieras. La conversación se guarda solo en este dispositivo.'),
      h('li', null, h('b', null, '@IA en un chat: '), 'escribe @IA y tu pregunta; IA DUNA responde dentro del chat y la respuesta la ven todos.'),
      h('li', null, h('b', null, 'Resumir y sugerir: '), 'en el menú ⋮ de un chat o con el botón ✨ junto al mensaje.'),
      h('li', null, h('b', null, 'Traducir: '), 'mantén presionado un mensaje y elige "Traducir con IA DUNA".')),
    h('p', { class: 'fine' }, 'Para cuidar el plan gratuito hay un límite de consultas por minuto y por día. Puede equivocarse: verifica la información importante. No compartas datos sensibles.')));
}
