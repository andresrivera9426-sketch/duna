// Compartir dentro de DUNA: elige un chat y envía el contenido como mensaje (noticias, videos, radio, puntajes…)
import { h, sheet, toast, debounce } from './ui.js';
import { S, chatTitle, sendMessage } from '../services/state.js';
import { chatAvatar } from './people.js';
const IA_ID = 'ia-duna';
export function shareToChat(text, { title = 'Compartir en un chat' } = {}) {
  const all = [...S.chats.values()].filter(c => c.id !== IA_ID && !(c.only_admins_send && !['owner', 'admin'].includes(c.my_role)))
    .sort((a, b) => new Date(b.last_message_at || 0) - new Date(a.last_message_at || 0));
  const list = h('div', { class: 'list share-list', role: 'list' });
  const preview = h('div', { class: 'share-prev' }, text.length > 220 ? text.slice(0, 220) + '…' : text);
  const note = h('input', { type: 'text', placeholder: 'Añade un mensaje (opcional)', maxlength: 500 });
  let s;
  const paint = q => {
    list.innerHTML = ''; const n = (q || '').toLowerCase();
    const rows = all.filter(c => !n || chatTitle(c).toLowerCase().includes(n)).slice(0, 60);
    if (!rows.length) list.append(h('p', { class: 'muted center' }, all.length ? 'Sin resultados' : 'Aún no tienes chats'));
    for (const c of rows) list.append(h('button', { class: 'row share-row', role: 'listitem', dataset: { chat: c.id }, onclick: async () => {
      s.close();
      try { const extra = note.value.trim(); await sendMessage(c.id, { kind: 'text', body: (extra ? extra + '\n\n' : '') + text }); toast('Enviado a ' + chatTitle(c)); }
      catch (e) { toast(e.message || 'No se pudo enviar'); }
    } }, chatAvatar(c, 40), h('div', { class: 'grow' }, h('b', null, chatTitle(c)))));
  };
  s = sheet(title, h('div', { class: 'form' }, preview, note, h('input', { type: 'search', placeholder: 'Buscar chat', 'aria-label': 'Buscar chat', oninput: debounce(e => paint(e.target.value), 100) }), list));
  paint('');
  return s;
}
