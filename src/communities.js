import { sb, rpc } from './sb.js';
import { h, icon, btn, toast, sheet, copyText, confirmDialog } from './ui.js';
import { S, loadChats, refreshChat } from './state.js';
import { avatar, renderSide, setTab } from './main.js';
import { openChat } from './chat.js';
import { newGroupSheet, APP_URL, pickPeople } from './newchat.js';

export function renderCommunities(side, sideHeader) {
  const list = h('div', { class: 'list' });
  side.append(sideHeader('Comunidades', [btn('plus', 'Nueva comunidad', () => newGroupSheet('community'))]), list);
  list.append(h('button', { class: 'person action big', id: 'new-community', onclick: () => newGroupSheet('community') }, h('span', { class: 'act-ic sq' }, icon('community')), h('div', null, h('b', null, 'Nueva comunidad'), h('small', null, 'Reúne grupos relacionados con un grupo de avisos'))));
  const coms = [...S.chats.values()].filter(c => c.type === 'community');
  if (!coms.length) list.append(h('p', { class: 'fine pad' }, 'Aún no perteneces a ninguna comunidad. Crea una o únete con un enlace de invitación.'));
  for (const c of coms) {
    const groups = [...S.chats.values()].filter(g => g.community_id === c.id);
    list.append(h('div', { class: 'com-card' },
      h('button', { class: 'com-head', onclick: () => openCommunity(c.id) }, avatar({ id: c.id, title: c.title, avatar_path: c.avatar_path }, 48, { group: true }), h('div', { class: 'grow' }, h('b', null, c.title), h('small', null, `${c.member_count} miembros`))),
      groups.map(g => h('button', { class: 'com-group', onclick: () => { setTab('chats'); openChat(g.id); } }, h('span', { class: 'gicon' }, icon(g.is_announcement ? 'channel' : 'chat', 18)), h('span', { class: 'grow' }, g.title), g.unread ? h('b', { class: 'count' }, g.unread) : null)),
      h('button', { class: 'com-more', onclick: () => openCommunity(c.id) }, 'Ver todo')));
  }
}
export async function openCommunity(id) {
  const c = S.chats.get(id) || await refreshChat(id); if (!c) return;
  const isAdmin = ['owner', 'admin'].includes(c.my_role);
  const groups = await rpc('community_groups', { p_community: id });
  let s; const link = c.invite_code ? APP_URL + '#/invitar/' + encodeURIComponent(c.invite_code) : null;
  s = sheet(c.title, h('div', { class: 'info' },
    h('div', { class: 'info-head' }, avatar({ id: c.id, title: c.title, avatar_path: c.avatar_path }, 90, { group: true }), h('h2', null, c.title), h('p', { class: 'muted' }, `Comunidad · ${c.member_count} miembros`), c.description ? h('p', null, c.description) : null),
    h('div', { class: 'info-sec' }, h('b', null, 'Grupos'),
      groups.map(g => h('div', { class: 'person' }, h('span', { class: 'act-ic sq' }, icon(g.is_announcement ? 'channel' : 'chat')), h('div', { class: 'grow' }, h('b', null, g.title), h('small', null, `${g.is_announcement ? 'Avisos · ' : ''}${g.members} miembros`)),
        g.is_member ? h('button', { class: 'btn ghost sm', onclick: async () => { s.close(); await refreshChat(g.id); setTab('chats'); openChat(g.id); } }, 'Abrir') :
          h('button', { class: 'btn primary sm', onclick: async () => { try { await rpc('join_community_group', { p_group: g.id }); await loadChats(); s.close(); setTab('chats'); openChat(g.id); } catch (e) { toast(e.message); } } }, 'Unirme'))),
      isAdmin ? h('button', { class: 'btn ghost', onclick: () => { s.close(); newGroupSheet('group', id); } }, icon('plus', 16), ' Crear grupo en la comunidad') : null),
    link ? h('div', { class: 'info-sec' }, h('b', null, 'Invitar a la comunidad'), h('code', { class: 'invite-link' }, link), h('div', { class: 'row-btns' }, h('button', { class: 'btn ghost', onclick: () => copyText(link) }, 'Copiar enlace'),
      isAdmin ? h('button', { class: 'btn ghost', onclick: async () => { const ids = await pickPeople('Añadir miembros', { exclude: new Set(S.members.get(id)?.keys() || []), okLabel: 'Añadir' }); if (ids?.length) { const n = await rpc('add_members', { p_chat: id, p_members: ids }); toast(n + ' añadidos'); } } }, 'Añadir miembros') : null)) : null,
    h('div', { class: 'info-sec' }, h('button', { class: 'info-row danger', onclick: async () => { if (await confirmDialog('¿Salir de la comunidad? Seguirás en sus grupos hasta que salgas de ellos.', 'Salir', true)) { await rpc('leave_chat', { p_chat: id }); s.close(); await loadChats(); renderSide(); } } }, icon('logout', 20), 'Salir de la comunidad'))), { wide: true });
}
