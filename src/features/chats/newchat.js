import { sb, rpc, avatarUrl } from '../../services/sb.js';
import { h, icon, toast, sheet, debounce, copyText } from '../../shared/ui.js';
import { S, refreshChat, loadProfiles } from '../../services/state.js';
import { openChat } from './chat.js';
import { avatar } from '../../shared/people.js';
import { setTab } from '../../app/main.js';

export const APP_URL = location.origin + location.pathname;
export async function startDirect(uid) {
  try { const id = await rpc('open_direct', { other: uid }); await refreshChat(id); setTab('chats'); openChat(id); } catch (e) { toast(e.message); }
}
async function contactsList() {
  const { data } = await sb.from('contacts').select('contact_id, alias');
  const ids = (data || []).map(x => x.contact_id); await loadProfiles(ids, true);
  return ids.map(id => S.profiles.get(id)).filter(Boolean).sort((a, b) => (a.alias || a.display_name).localeCompare(b.alias || b.display_name));
}
function personRow(p, onclick, right) {
  return h('button', { class: 'person', onclick }, avatar(p, 44), h('div', { class: 'grow' }, h('b', null, p.alias || p.display_name), h('small', null, '@' + p.username + (p.about ? ' · ' + p.about : ''))), right || null);
}
export async function newChatSheet() {
  let s; const results = h('div', { class: 'list' });
  const q = h('input', { type: 'search', placeholder: 'Buscar por nombre, @usuario o teléfono', id: 'user-search', autocomplete: 'off' });
  const contacts = await contactsList();
  const drawContacts = () => {
    results.innerHTML = '';
    results.append(
      h('button', { class: 'person action', onclick: () => { s.close(); newGroupSheet(); } }, h('span', { class: 'act-ic' }, icon('community')), h('b', null, 'Nuevo grupo')),
      h('button', { class: 'person action', onclick: () => { s.close(); newGroupSheet('community'); } }, h('span', { class: 'act-ic' }, icon('grid')), h('b', null, 'Nueva comunidad')),
      h('button', { class: 'person action', onclick: () => { s.close(); newGroupSheet('channel'); } }, h('span', { class: 'act-ic' }, icon('channel')), h('b', null, 'Nuevo canal')),
      h('button', { class: 'person action', onclick: () => { copyText(APP_URL + '#/u/' + S.me.username); } }, h('span', { class: 'act-ic' }, icon('share')), h('div', null, h('b', null, 'Compartir mi enlace'), h('small', null, 'Para que te escriban: @' + S.me.username))),
      h('button', { class: 'person action', onclick: () => { s.close(); startDirect(S.user.id); } }, avatar(S.me, 44), h('div', null, h('b', null, S.me.display_name + ' (Tú)'), h('small', null, 'Envíate mensajes a ti mismo'))),
      h('h4', { class: 'sec-t' }, contacts.length ? 'Contactos en DUNA' : 'Busca a alguien por su usuario para empezar'));
    for (const p of contacts) results.append(personRow(p, () => { s.close(); startDirect(p.id); }));
  };
  q.addEventListener('input', debounce(async () => {
    const v = q.value.trim().replace(/^@/, '');
    if (v.length < 2) return drawContacts();
    try {
      const r = await rpc('search_users', { q: v }); results.innerHTML = '';
      if (!r.length) results.append(h('p', { class: 'muted' }, 'No encontramos a nadie con “' + v + '”.'));
      for (const p of r) results.append(personRow(p, () => { s.close(); startDirect(p.id); },
        h('span', { class: 'add-ct', title: 'Añadir a contactos', onclick: async e => { e.stopPropagation(); await sb.from('contacts').upsert({ owner_id: S.user.id, contact_id: p.id }); toast('Añadido a contactos'); } }, icon('plus', 18))));
    } catch (e) { toast(e.message); }
  }, 250));
  drawContacts();
  s = sheet('Nuevo chat', h('div', { class: 'form' }, q, results));
}
export async function pickPeople(title, { exclude = new Set(), okLabel = 'Siguiente' } = {}) {
  return new Promise(async res => {
    const picked = new Map(); let s;
    const chips = h('div', { class: 'picked' }); const list = h('div', { class: 'list pick' });
    const known = [...new Set([...(await contactsList()).map(p => p.id), ...[...S.chats.values()].filter(c => c.type === 'direct' && c.other_id).map(c => c.other_id)])].map(id => S.profiles.get(id)).filter(p => p && !exclude.has(p.id));
    const draw = arr => { list.innerHTML = ''; for (const p of arr) { if (exclude.has(p.id)) continue; list.append(h('label', { class: 'person' }, h('input', { type: 'checkbox', checked: picked.has(p.id), onchange: e => { e.target.checked ? picked.set(p.id, p) : picked.delete(p.id); drawChips(); } }), avatar(p, 40), h('div', null, h('b', null, p.alias || p.display_name), h('small', null, '@' + p.username)))); } if (!list.children.length) list.append(h('p', { class: 'muted' }, 'Busca personas por su usuario.')); };
    const drawChips = () => { chips.innerHTML = ''; for (const p of picked.values()) chips.append(h('button', { class: 'chip on', onclick: () => { picked.delete(p.id); drawChips(); draw(known); } }, p.display_name, ' ×')); };
    const q = h('input', { type: 'search', placeholder: 'Buscar personas…', oninput: debounce(async () => { const v = q.value.trim().replace(/^@/, ''); draw(v.length >= 2 ? await rpc('search_users', { q: v }) : known); }, 250) });
    draw(known);
    s = sheet(title, h('div', { class: 'form' }, q, chips, list, h('button', { class: 'btn primary', onclick: () => { s.close(); res([...picked.keys()]); } }, okLabel)), { onclose: () => res(null) });
  });
}
export async function newGroupSheet(type = 'group', community = null) {
  let members = [];
  if (type === 'group') { members = await pickPeople('Añadir participantes', { okLabel: 'Siguiente' }); if (members === null) return; }
  let s; const title = h('input', { placeholder: type === 'channel' ? 'Nombre del canal' : type === 'community' ? 'Nombre de la comunidad' : 'Nombre del grupo', maxlength: 60, id: 'group-title' });
  const desc = h('textarea', { rows: 3, placeholder: 'Descripción (opcional)', maxlength: 500 });
  const go = h('button', { class: 'btn primary', id: 'group-create' }, 'Crear');
  go.onclick = async () => {
    if (!title.value.trim()) return toast('Escribe un nombre');
    go.disabled = true;
    try {
      const id = await rpc('create_group', { p_title: title.value.trim(), p_description: desc.value.trim(), p_members: members, p_type: type, p_community: community });
      s.close(); await refreshChat(id);
      if (type === 'community') { const { loadChats } = await import('../../services/state.js'); await loadChats(); setTab('communities'); import('../discover/communities.js').then(m => m.openCommunity(id)); }
      else { setTab('chats'); openChat(id); }
      toast(type === 'channel' ? 'Canal creado' : type === 'community' ? 'Comunidad creada' : 'Grupo creado');
    } catch (e) { toast(e.message); go.disabled = false; }
  };
  s = sheet(type === 'channel' ? 'Nuevo canal' : type === 'community' ? 'Nueva comunidad' : 'Nuevo grupo', h('div', { class: 'form' },
    type === 'channel' ? h('p', { class: 'muted' }, 'Los canales son públicos: cualquiera puede encontrarlos y seguirlos. Solo los administradores publican.') : null,
    type === 'community' ? h('p', { class: 'muted' }, 'Una comunidad reúne varios grupos y un grupo de avisos para todos sus miembros.') : null,
    title, desc, members.length ? h('p', { class: 'muted' }, `${members.length} participante${members.length > 1 ? 's' : ''} seleccionado${members.length > 1 ? 's' : ''}`) : null, go));
}
export async function openInvite(code) {
  try {
    const p = await rpc('invite_preview', { p_code: code });
    if (!p) return toast('Este enlace de invitación no es válido o fue restablecido');
    if (p.is_member) { await refreshChat(p.id); return p.type === 'community' ? import('../discover/communities.js').then(m => m.openCommunity(p.id)) : openChat(p.id); }
    let s; s = sheet('Invitación', h('div', { class: 'invite' },
      avatar({ id: p.id, title: p.title, avatar_path: p.avatar_path }, 84, { group: true }), h('h3', null, p.title), h('p', { class: 'muted' }, `${p.type === 'community' ? 'Comunidad' : p.type === 'channel' ? 'Canal' : 'Grupo'} · ${p.members} miembro${p.members === 1 ? '' : 's'}`),
      p.description ? h('p', null, p.description) : null,
      h('button', { class: 'btn primary', id: 'join-btn', onclick: async () => {
        try { const id = await rpc('join_by_invite', { p_code: code }); s.close(); const { loadChats } = await import('../../services/state.js'); await loadChats();
          if (p.type === 'community') { setTab('communities'); import('../discover/communities.js').then(m => m.openCommunity(id)); } else { setTab('chats'); openChat(id); } toast('Te uniste'); }
        catch (e) { toast(e.message); }
      } }, p.type === 'community' ? 'Unirme a la comunidad' : 'Unirme al grupo')));
  } catch (e) { toast(e.message); }
}
export async function openUserLink(username) {
  const r = await rpc('search_users', { q: username }).catch(() => []);
  const p = r.find(x => x.username === username);
  if (!p) return username === S.me.username ? toast('Ese es tu propio enlace') : toast('No existe el usuario @' + username);
  startDirect(p.id);
}
