import { sb, rpc, avatarUrl } from '../../services/sb.js';
import { h, icon, btn, toast, sheet, confirmDialog, prompt, copyText, fmtLastSeen, menu, fmtSize } from '../../shared/ui.js';
import { S, chatTitle, chatPeer, nameOf, refreshChat, loadProfiles, loadChats, setPref, previewText, emit } from '../../services/state.js';
import { avatar, chatAvatar } from '../../shared/people.js';
import { muteMenu } from '../../app/main.js';
import { openChat, closeChat, disappearingSheet, wallpaperSheet, exportChat, scrollToMsg } from './chat.js';
const _m5365 = () => import('../calls/calls.js');
const startCall = (...a) => _m5365().then(m => m.startCall(...a));
import { safetyCode } from '../../services/crypto.js';
import { compressImage, mediaUrl } from '../../services/media.js';
import { pickPeople, startDirect, APP_URL } from './newchat.js';
import { viewer } from './bubbles.js';

export async function openInfo(chatId, focus) {
  const c = S.chats.get(chatId); if (!c) return;
  if (c.type !== 'direct') await refreshChat(chatId);
  const isAdmin = ['owner', 'admin'].includes(c.my_role);
  const peer = chatPeer(c);
  const body = h('div', { class: 'info' });
  let s;
  const section = (...k) => h('div', { class: 'info-sec' }, ...k);
  const row = (ic, label, action, opts = {}) => h('button', { class: 'info-row' + (opts.danger ? ' danger' : ''), onclick: action }, icon(ic, 20), h('span', { class: 'grow' }, label, opts.sub ? h('small', null, opts.sub) : null), opts.right || null);
  const canEdit = c.type !== 'direct' && (isAdmin || (c.type === 'group' && !c.only_admins_edit));

  // Cabecera
  const av = chatAvatar(c, 110);
  if (canEdit) { av.classList.add('editable'); av.title = 'Cambiar foto'; av.onclick = () => changeGroupPhoto(c, () => { s.close(); openInfo(chatId); }); }
  else if ((peer?.avatar_path) || c.avatar_path) av.onclick = () => import('../../shared/reader.js').then(r => r.openContent({ kind: 'image', url: avatarUrl(peer?.avatar_path || c.avatar_path), title: 'Foto' }));
  body.append(h('div', { class: 'info-head' }, av,
    h('h2', null, chatTitle(c), canEdit ? h('button', { class: 'icon-btn sm', title: 'Editar nombre', onclick: async () => { const v = await prompt('Nombre', { value: c.title, max: 60 }); if (v && v.trim()) { await rpc('update_chat', { p_chat: c.id, p: { title: v } }).catch(e => toast(e.message)); s.close(); openInfo(chatId); } } }, icon('edit', 16)) : null),
    h('p', { class: 'muted' }, c.type === 'direct' ? (peer ? '@' + peer.username + (c.other_id ? ' · ' + (peer.online ? 'en línea' : fmtLastSeen(peer.last_seen) || '') : '') : '') :
      `${c.type === 'channel' ? 'Canal' : 'Grupo'} · ${c.member_count} ${c.type === 'channel' ? 'seguidores' : 'participantes'}`),
    h('div', { class: 'info-acts' },
      c.type !== 'channel' ? h('button', { onclick: () => { s.close(); startCall(c.id, 'audio'); } }, icon('call'), 'Llamar') : null,
      c.type !== 'channel' ? h('button', { onclick: () => { s.close(); startCall(c.id, 'video'); } }, icon('video'), 'Video') : null,
      c.type !== 'direct' && isAdmin ? h('button', { onclick: () => addPeople(c, () => { s.close(); openInfo(chatId); }) }, icon('plus'), 'Añadir') : null,
      h('button', { onclick: () => { s.close(); document.querySelector('.conv-head [title="Buscar en el chat"]')?.click(); } }, icon('search'), 'Buscar'))));

  // Info / descripción
  if (c.type === 'direct' && peer) {
    body.append(section(h('small', { class: 'muted' }, 'Info.'), h('p', null, peer.about || '—'),
      c.other_id ? row(peer.is_contact ? 'user' : 'plus', peer.is_contact ? 'Editar nombre del contacto' : 'Añadir a contactos', async () => {
        const alias = peer.is_contact ? await prompt('Nombre para este contacto', { value: peer.alias || peer.display_name, max: 40 }) : null;
        if (peer.is_contact && alias === null) return;
        await sb.from('contacts').upsert({ owner_id: S.user.id, contact_id: peer.id, alias: alias || null });
        await loadProfiles([peer.id], true); toast(peer.is_contact ? 'Nombre guardado' : 'Añadido a contactos'); s.close(); openInfo(chatId);
      }) : null));
  } else if (c.type !== 'direct') {
    body.append(section(h('small', { class: 'muted' }, 'Descripción'), h('p', { class: 'desc' }, c.description || (canEdit ? 'Añade una descripción' : '—')),
      canEdit ? row('edit', 'Editar descripción', async () => { const v = await prompt('Descripción', { value: c.description || '', multiline: true, max: 500 }); if (v !== null) { await rpc('update_chat', { p_chat: c.id, p: { description: v } }).catch(e => toast(e.message)); s.close(); openInfo(chatId); } }) : null));
  }

  // Archivos, enlaces y documentos
  const msgs = S.msgs.get(chatId) || [];
  const mediaMsgs = msgs.filter(m => ['image', 'video', 'gif'].includes(m.kind) && !m.view_once && !m.deleted_for_all && m.media?.path).slice(-12).reverse();
  const docs = msgs.filter(m => m.kind === 'document' && !m.deleted_for_all);
  const links = msgs.filter(m => m.body && /https?:\/\//.test(m.body) && !m.deleted_for_all);
  body.append(section(h('div', { class: 'sec-title' }, h('b', null, 'Archivos, enlaces y documentos'), h('small', null, `${mediaMsgs.length + docs.length + links.length}`)),
    mediaMsgs.length ? h('div', { class: 'media-strip' }, mediaMsgs.map(m => { const t = h('button', { class: 'ms-item', style: { backgroundImage: m.media.thumb ? `url(${m.media.thumb})` : '' }, onclick: () => viewer(m) }); mediaUrl(m).then(u => { if (m.kind !== 'video') t.style.backgroundImage = `url(${u})`; }).catch(() => {}); return t; })) : null,
    docs.length ? h('div', null, docs.slice(-5).reverse().map(m => row('doc', m.media?.name || 'Documento', () => { s.close(); scrollToMsg(m.id); }, { sub: fmtSize(m.media?.size || 0) }))) : null,
    links.length ? h('div', null, links.slice(-5).reverse().map(m => row('link', (m.body.match(/https?:\/\/\S+/) || [''])[0].slice(0, 60), () => { s.close(); scrollToMsg(m.id); }))) : null,
    !mediaMsgs.length && !docs.length && !links.length ? h('small', { class: 'muted' }, 'Aún no hay archivos compartidos (de los mensajes cargados).') : null));

  // Opciones
  const muted = c.muted_until && new Date(c.muted_until) > new Date();
  body.append(section(
    row('star', 'Mensajes destacados', () => { s.close(); import('../settings/settings.js').then(m => m.starredSheet(chatId)); }),
    row(muted ? 'belloff' : 'bell', 'Silenciar notificaciones', e => muteMenu(c, e.currentTarget), { right: h('small', null, muted ? 'Activado' : 'No') }),
    row('timer', 'Mensajes temporales', () => disappearingSheet(c), { right: h('small', null, ({ 0: 'No', 86400: '24 h', 604800: '7 días', 7776000: '90 días' })[c.disappearing_seconds || 0]) }),
    row('wallpaper', 'Fondo de pantalla', () => wallpaperSheet(c)),
    c.type === 'direct' ? row('lock', 'Cifrado', () => encryptionSheet(c), { sub: 'Los mensajes y llamadas viajan cifrados. Toca para verificar el código de seguridad.' }) :
      row('lock', 'Cifrado', () => toast('Los grupos y canales usan cifrado en tránsito (TLS) y permisos del servidor; el cifrado de extremo a extremo aplica a chats 1:1.'), { sub: 'Cifrado en tránsito · E2E solo en chats 1:1' })));

  // Grupo: ajustes, enlace, miembros
  if (c.type !== 'direct') {
    if (isAdmin) body.append(section(h('b', null, 'Ajustes del ' + (c.type === 'channel' ? 'canal' : 'grupo')),
      c.type !== 'channel' ? toggleRow('Solo admins envían mensajes', c.only_admins_send, v => rpc('update_chat', { p_chat: c.id, p: { only_admins_send: v } })) : null,
      toggleRow('Solo admins editan la info', c.only_admins_edit, v => rpc('update_chat', { p_chat: c.id, p: { only_admins_edit: v } })),
      c.type === 'channel' ? toggleRow('Canal público (aparece en el directorio)', c.is_public, v => rpc('update_chat', { p_chat: c.id, p: { is_public: v } })) : null));
    if (c.invite_code) {
      const link = APP_URL + '#/invitar/' + encodeURIComponent(c.invite_code);
      body.append(section(h('b', null, 'Enlace de invitación'), h('code', { class: 'invite-link', id: 'invite-link' }, link),
        h('div', { class: 'row-btns' },
          h('button', { class: 'btn ghost', onclick: () => copyText(link) }, icon('copy', 16), ' Copiar'),
          navigator.share ? h('button', { class: 'btn ghost', onclick: () => navigator.share({ title: chatTitle(c), text: 'Únete a ' + chatTitle(c) + ' en DUNA', url: link }).catch(() => {}) }, icon('share', 16), ' Compartir') : null,
          isAdmin ? h('button', { class: 'btn ghost', onclick: async () => { if (await confirmDialog('El enlace actual dejará de funcionar.', 'Restablecer', true)) { await rpc('reset_invite', { p_chat: c.id }); s.close(); openInfo(chatId); } } }, 'Restablecer') : null)));
    }
    if (c.type !== 'channel' || isAdmin) {
      const mem = [...(S.members.get(c.id)?.values() || [])].sort((a, b) => (a.user_id === S.user.id ? -1 : b.user_id === S.user.id ? 1 : 0) || ((b.role !== 'member') - (a.role !== 'member')));
      await loadProfiles(mem.map(m => m.user_id));
      body.append(section(h('div', { class: 'sec-title' }, h('b', null, `${mem.length} ${c.type === 'channel' ? 'seguidores' : 'participantes'}`)),
        isAdmin && c.type !== 'channel' ? row('plus', 'Añadir participantes', () => addPeople(c, () => { s.close(); openInfo(chatId); })) : null,
        mem.map(m => { const p = m.user_id === S.user.id ? S.me : S.profiles.get(m.user_id);
          return h('button', { class: 'person', onclick: e => memberMenu(c, m, e.currentTarget, () => { s.close(); openInfo(chatId); }) }, avatar(p, 40),
            h('div', { class: 'grow' }, h('b', null, m.user_id === S.user.id ? 'Tú' : nameOf(m.user_id)), h('small', null, p?.about || '')), m.role !== 'member' ? h('span', { class: 'role' }, m.role === 'owner' ? 'Creador' : 'Admin') : null); })));
    }
  }

  // Acciones finales
  body.append(section(
    row('download', 'Exportar chat', () => exportChat(c)),
    c.type === 'direct' && c.other_id ? row('block', peer?.i_blocked ? 'Desbloquear a ' + nameOf(peer.id) : 'Bloquear a ' + nameOf(peer.id), async () => {
      if (peer.i_blocked) { await sb.from('blocks').delete().eq('blocker_id', S.user.id).eq('blocked_id', peer.id); toast('Desbloqueado'); }
      else { if (!(await confirmDialog('Los contactos bloqueados no podrán llamarte ni enviarte mensajes.', 'Bloquear', true))) return; await sb.from('blocks').insert({ blocker_id: S.user.id, blocked_id: peer.id }); toast('Bloqueado'); }
      await loadProfiles([peer.id], true); s.close(); openChat(c.id);
    }, { danger: true }) : null,
    c.type === 'direct' && c.other_id ? row('flag', 'Reportar a ' + nameOf(peer.id), () => reportSheet(peer.id), { danger: true }) : null,
    c.type === 'channel' && c.my_role !== 'owner' ? row('logout', 'Dejar de seguir', async () => { await rpc('follow_channel', { p_chat: c.id, p_follow: false }); s.close(); closeChat(); await loadChats(); }, { danger: true }) : null,
    c.type === 'group' || c.type === 'community' ? row('logout', 'Salir del ' + (c.type === 'community' ? 'comunidad' : 'grupo'), async () => {
      if (!(await confirmDialog('¿Salir de ' + chatTitle(c) + '?', 'Salir', true))) return;
      try { await rpc('leave_chat', { p_chat: c.id }); s.close(); closeChat(); await loadChats(); toast('Saliste'); } catch (e) { toast(e.message); }
    }, { danger: true }) : null,
    c.type !== 'direct' ? row('flag', 'Reportar ' + (c.type === 'channel' ? 'canal' : 'grupo'), () => reportSheet(null, null, c.id), { danger: true }) : null));
  s = sheet(c.type === 'direct' ? 'Info. del contacto' : c.type === 'channel' ? 'Info. del canal' : 'Info. del grupo', body, { wide: true });
  if (focus === 'enc' && c.type === 'direct') encryptionSheet(c);
}
function toggleRow(label, val, fn) {
  const inp = h('input', { type: 'checkbox', checked: !!val, onchange: async () => { try { await fn(inp.checked); toast('Guardado'); } catch (e) { inp.checked = !inp.checked; toast(e.message); } } });
  return h('label', { class: 'switch row' }, h('span', { class: 'grow' }, label), inp);
}
async function addPeople(c, done) {
  const ex = new Set(S.members.get(c.id)?.keys() || []);
  const ids = await pickPeople('Añadir participantes', { exclude: ex, okLabel: 'Añadir' }); if (!ids?.length) return;
  try { const n = await rpc('add_members', { p_chat: c.id, p_members: ids }); toast(n ? `${n} añadido${n > 1 ? 's' : ''}` : 'No se pudo añadir (privacidad o bloqueo)'); await refreshChat(c.id); done(); } catch (e) { toast(e.message); }
}
function memberMenu(c, m, anchor, done) {
  if (m.user_id === S.user.id) return;
  const isAdmin = ['owner', 'admin'].includes(c.my_role);
  menu([
    { icon: 'chat', label: 'Enviar mensaje a ' + nameOf(m.user_id), action: () => startDirect(m.user_id) },
    { icon: 'call', label: 'Llamar', action: async () => { const id = await rpc('open_direct', { other: m.user_id }); await refreshChat(id); startCall(id, 'audio'); } },
    isAdmin && m.role !== 'owner' ? { icon: 'key', label: m.role === 'admin' ? 'Descartar como admin' : 'Designar como admin', action: async () => { await rpc('set_member_role', { p_chat: c.id, p_user: m.user_id, p_role: m.role === 'admin' ? 'member' : 'admin' }).catch(e => toast(e.message)); await refreshChat(c.id); done(); } } : null,
    isAdmin && m.role !== 'owner' ? { icon: 'trash', label: 'Eliminar del grupo', danger: true, action: async () => { if (await confirmDialog('¿Eliminar a ' + nameOf(m.user_id) + '?', 'Eliminar', true)) { await rpc('remove_member', { p_chat: c.id, p_user: m.user_id }).catch(e => toast(e.message)); await refreshChat(c.id); done(); } } } : null,
  ], anchor);
}
async function changeGroupPhoto(c, done) {
  const inp = h('input', { type: 'file', accept: 'image/*' });
  inp.onchange = async () => {
    try {
      const { blob } = await compressImage(inp.files[0], 512, 0.8);
      const path = `g/${c.id}/${Date.now()}.webp`;
      const { error } = await sb.storage.from('avatars').upload(path, blob, { contentType: blob.type, upsert: true }); if (error) throw error;
      await rpc('update_chat', { p_chat: c.id, p: { avatar_path: path } }); await refreshChat(c.id); toast('Foto actualizada'); done();
    } catch (e) { toast('No se pudo cambiar: ' + e.message); }
  };
  inp.click();
}
async function encryptionSheet(c) {
  const peer = chatPeer(c);
  if (!peer?.pub_key || !S.me.pub_key) return toast('La otra persona aún no tiene llave de cifrado');
  const code = await safetyCode(S.me.pub_key, peer.pub_key);
  sheet('Verificar código de seguridad', h('div', { class: 'enc' },
    h('div', { class: 'enc-art' }, icon('lock', 46)),
    h('p', null, `Para verificar que tus mensajes con ${nameOf(peer.id, { you: false })} están cifrados de extremo a extremo, comparen este código en sus dispositivos:`),
    h('pre', { class: 'safety', id: 'safety-code' }, code),
    h('p', { class: 'fine' }, 'Qué se cifra de extremo a extremo en este chat: textos, respuestas, ubicación, contactos, encuestas (preguntas y opciones), miniaturas y todos los archivos (fotos, videos, audios, notas de voz, documentos). Las llamadas usan cifrado DTLS-SRTP de WebRTC entre los dispositivos. El servidor sí ve metadatos: quién escribe a quién, cuándo, tipo y tamaño de archivo, reacciones y votos.'),
    h('p', { class: 'fine' }, 'Limitación honesta: la llave es estable por cuenta (no rota en cada mensaje), así que no hay “secreto hacia adelante” como en el protocolo Signal.')));
}
export function reportSheet(userId, msg, chatId) {
  let s; const reason = h('textarea', { rows: 3, maxlength: 500, placeholder: 'Cuéntanos qué pasó (opcional)' });
  const block = h('input', { type: 'checkbox', checked: !!userId });
  s = sheet('Reportar', h('div', { class: 'form' },
    h('p', { class: 'muted' }, msg ? 'Se enviará este mensaje al equipo de DUNA para revisión.' : 'El reporte queda registrado para revisión.'),
    msg ? h('div', { class: 'info-preview' }, previewText(msg)) : null, reason,
    userId ? h('label', { class: 'switch' }, block, h('span', null, 'Bloquear también')) : null,
    h('button', { class: 'btn danger', onclick: async () => {
      const { error } = await sb.from('reports').insert({ reporter_id: S.user.id, target_user: userId, message_id: msg?.id || null, chat_id: chatId || msg?.chat_id || null, reason: (reason.value.trim() || 'Contenido inapropiado').padEnd(3, '.') });
      if (error) return toast(error.message);
      if (userId && block.checked) { await sb.from('blocks').upsert({ blocker_id: S.user.id, blocked_id: userId }); await loadProfiles([userId], true); }
      s.close(); toast('Reporte enviado. Gracias.');
    } }, 'Reportar')));
}
