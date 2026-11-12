// Listas de difusión, mensajes programados, etiquetas y respuestas rápidas
import { sb, rpc } from './sb.js';
import { h, icon, toast, sheet, confirmDialog, prompt, fmtListTime } from './ui.js';
import { S, emit, sendMessage, refreshChat, nameOf, chatTitle, encryptFor, isE2E, decryptMsg, setPref, loadProfiles } from './state.js';
import { avatar } from './main.js';
import { pickPeople } from './newchat.js';

// ===== Listas de difusión =====
export async function broadcastSheet() {
  const { data: lists, error } = await sb.from('broadcast_lists').select('*').order('created_at', { ascending: false });
  if (error) return toast(error.message);
  await loadProfiles((lists || []).flatMap(l => l.members));
  let s;
  const body = h('div', { class: 'list' },
    (lists || []).map(l => h('div', { class: 'person bl-row', dataset: { list: l.id } },
      h('span', { class: 'avatar grp', style: { width: '42px', height: '42px', '--h': 28 } }, icon('broadcast', 20)),
      h('button', { class: 'grow txt-btn', onclick: () => { s.close(); broadcastCompose(l); } }, h('b', null, l.name), h('small', null, l.members.map(u => nameOf(u)).join(', '))),
      h('button', { class: 'icon-btn', title: 'Eliminar lista', 'aria-label': 'Eliminar lista', onclick: async () => { if (await confirmDialog(`¿Eliminar la lista “${l.name}”? No se borran los mensajes enviados.`, 'Eliminar', true)) { await sb.from('broadcast_lists').delete().eq('id', l.id); s.close(); broadcastSheet(); } } }, icon('trash', 18)))),
    !(lists || []).length ? h('p', { class: 'muted' }, 'Envía un mismo mensaje a varias personas a la vez. Cada una lo recibe en su chat individual (cifrado de extremo a extremo) y no ve a los demás destinatarios.') : null);
  s = sheet('Listas de difusión', h('div', { class: 'form' }, body, h('button', { class: 'btn primary', id: 'bl-new', onclick: async () => { s.close(); await newBroadcast(); } }, icon('plus', 16), ' Nueva lista')));
}
async function newBroadcast() {
  const members = await pickPeople('Destinatarios de la lista', { okLabel: 'Siguiente' });
  if (!members?.length) return members === null ? null : toast('Elige al menos una persona');
  const name = await prompt('Nombre de la lista', { placeholder: 'Ej.: Clientes, Familia', max: 60 });
  if (!name?.trim()) return;
  const { data, error } = await sb.from('broadcast_lists').insert({ name: name.trim(), members }).select().single();
  if (error) return toast(error.message);
  toast('Lista creada'); broadcastCompose(data);
}
export function broadcastCompose(l) {
  const ta = h('textarea', { rows: 4, maxlength: 4000, placeholder: 'Mensaje para la lista…', id: 'bl-text' });
  const st = h('p', { class: 'muted', id: 'bl-status' }, `${l.members.length} destinatario${l.members.length > 1 ? 's' : ''}: ${l.members.map(u => nameOf(u)).join(', ')}`);
  let s; const go = h('button', { class: 'btn primary', id: 'bl-send', onclick: async () => {
    const text = ta.value.trim(); if (!text) return;
    go.disabled = true; let ok = 0, fail = 0;
    for (const uid of l.members) {
      try { const cid = await rpc('open_direct', { other: uid }); if (!S.chats.has(cid)) await refreshChat(cid); await sendMessage(cid, { kind: 'text', body: text, meta: { bc: true } }); ok++; }
      catch { fail++; }
      st.textContent = `Enviando… ${ok + fail}/${l.members.length}`;
    }
    st.textContent = `Enviado a ${ok}${fail ? ` · ${fail} no se pudieron enviar (bloqueo o privacidad)` : ''}`;
    toast(`Difusión enviada a ${ok} persona${ok === 1 ? '' : 's'}`); ta.value = ''; go.disabled = false;
  } }, icon('send', 16), ' Enviar a todos');
  s = sheet('Difusión · ' + l.name, h('div', { class: 'form' }, st, ta, go));
}

// ===== Mensajes programados =====
export function scheduleSheet(c, text, reply) {
  const d = new Date(Date.now() + 60 * 60e3); d.setSeconds(0, 0);
  const pad = n => String(n).padStart(2, '0');
  const local = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const when = h('input', { type: 'datetime-local', value: local, id: 'sch-when' });
  const ta = h('textarea', { rows: 3, maxlength: 4000, id: 'sch-text' }, text || '');
  let s; const go = h('button', { class: 'btn primary', id: 'sch-go', onclick: async () => {
    const at = new Date(when.value); if (isNaN(at) || at < new Date(Date.now() + 30e3)) return toast('Elige una fecha y hora futura');
    const body = ta.value.trim(); if (!body) return toast('Escribe el mensaje');
    go.disabled = true;
    try {
      const row = { chat_id: c.id, send_at: at.toISOString(), kind: 'text', body, meta: null };
      if (isE2E(c)) { const enc = await encryptFor(c.id, body, null); if (!enc) throw new Error('Desbloquea el cifrado primero'); row.enc = enc; row.body = null; }
      const { error } = await sb.from('scheduled_messages').insert(row); if (error) throw error;
      s.close(); toast('Mensaje programado para ' + at.toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })); emit('scheduled', c.id);
      const inp = document.getElementById('msg-input'); if (inp && text) { inp.value = ''; inp.dispatchEvent(new Event('input')); }
    } catch (e) { toast(e.message); go.disabled = false; }
  } }, icon('calendar', 16), ' Programar');
  s = sheet('Programar mensaje', h('div', { class: 'form' }, h('label', null, 'Enviar el', when), ta, go,
    h('p', { class: 'fine' }, 'El servidor lo envía a la hora elegida (precisión de ~1 minuto), aunque tengas DUNA cerrada. En chats 1:1 se guarda ya cifrado.')));
}
export async function scheduledList(c) {
  const { data } = await sb.from('scheduled_messages').select('*').eq('chat_id', c.id).order('send_at');
  const rows = await Promise.all((data || []).map(m => m.enc ? decryptMsg({ ...m }, c.id) : m));
  let s; s = sheet('Mensajes programados', h('div', { class: 'list', id: 'sch-list' }, rows.length ? rows.map(m => h('div', { class: 'person' }, icon('calendar', 20),
    h('div', { class: 'grow' }, h('b', null, new Date(m.send_at).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })), h('small', null, (m.body || '🔒').slice(0, 120))),
    h('button', { class: 'btn ghost sm', onclick: async () => { await sb.from('scheduled_messages').delete().eq('id', m.id); s.close(); toast('Programación cancelada'); scheduledList(c); } }, 'Cancelar'))) : h('p', { class: 'muted' }, 'No hay mensajes programados en este chat. Mantén presionado (o clic derecho) el botón de enviar para programar uno.')));
}

// ===== Etiquetas =====
export const DEFAULT_LABELS = ['Favoritos', 'Trabajo', 'Familia', 'Amigos', 'Pendiente', 'Clientes'];
export function allLabels() { const set = new Set([...DEFAULT_LABELS, ...(S.prefs.labels || [])]); for (const c of S.chats.values()) (c.labels || []).forEach(l => set.add(l)); return [...set]; }
export function labelSheet(c) {
  const cur = new Set(c.labels || []);
  const list = h('div', { class: 'list' });
  const draw = () => { list.innerHTML = ''; for (const l of allLabels()) list.append(h('label', { class: 'person' }, h('input', { type: 'checkbox', checked: cur.has(l), dataset: { label: l }, onchange: e => { e.target.checked ? cur.add(l) : cur.delete(l); } }), icon('tag', 18), h('b', null, l))); };
  draw();
  let s; s = sheet('Etiquetas · ' + chatTitle(c), h('div', { class: 'form' }, list,
    h('button', { class: 'btn ghost', onclick: async () => { const v = (await prompt('Nueva etiqueta', { max: 24 }))?.trim(); if (!v) return; S.prefs.labels = [...new Set([...(S.prefs.labels || []), v])]; (await import('./state.js')).savePrefs(); cur.add(v); draw(); } }, icon('plus', 16), ' Nueva etiqueta'),
    h('button', { class: 'btn primary', id: 'lbl-save', onclick: async () => { try { await setPref(c.id, { labels: [...cur] }); s.close(); toast('Etiquetas guardadas'); } catch (e) { toast(e.message); } } }, 'Guardar')));
}

// ===== Respuestas rápidas =====
export let QUICK_REPLIES = [];
export async function loadQuickReplies() { const { data } = await sb.from('quick_replies').select('*').order('shortcut'); QUICK_REPLIES = data || []; return QUICK_REPLIES; }
export async function quickRepliesSheet() {
  await loadQuickReplies();
  let s;
  const list = h('div', { class: 'list', id: 'qr-list' }, QUICK_REPLIES.length ? QUICK_REPLIES.map(q => h('div', { class: 'person' }, icon('bolt', 18), h('div', { class: 'grow' }, h('b', null, '/' + q.shortcut), h('small', null, q.body.slice(0, 120))),
    h('button', { class: 'icon-btn', 'aria-label': 'Eliminar', onclick: async () => { await sb.from('quick_replies').delete().eq('id', q.id); s.close(); quickRepliesSheet(); } }, icon('trash', 18)))) : h('p', { class: 'muted' }, 'Guarda mensajes que envías seguido. En cualquier chat escribe “/” y el atajo para insertarlos.'));
  const sc = h('input', { placeholder: 'atajo (ej.: saludo)', maxlength: 24, id: 'qr-short' }); const tx = h('textarea', { rows: 3, placeholder: 'Mensaje', maxlength: 2000, id: 'qr-body' });
  s = sheet('Respuestas rápidas', h('div', { class: 'form' }, list, h('h4', null, 'Nueva respuesta rápida'), sc, tx,
    h('button', { class: 'btn primary', id: 'qr-add', onclick: async () => {
      const k = sc.value.trim().toLowerCase().replace(/^\//, ''); if (!/^[a-z0-9_]{1,24}$/.test(k)) return toast('Atajo: letras, números o guion bajo'); if (!tx.value.trim()) return toast('Escribe el mensaje');
      const { error } = await sb.from('quick_replies').insert({ shortcut: k, body: tx.value.trim() }); if (error) return toast(error.message.includes('duplicate') ? 'Ese atajo ya existe' : error.message);
      s.close(); toast('Respuesta rápida guardada'); quickRepliesSheet();
    } }, 'Guardar')));
}
