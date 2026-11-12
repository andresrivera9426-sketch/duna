import { sb, rpc, avatarUrl, EMAIL_DOMAIN } from './sb.js';
import { h, icon, toast, sheet, confirmDialog, prompt, fmtSize, copyText, download, fmtListTime } from './ui.js';
import { S, savePrefs, loadProfiles, chatTitle, previewText, nameOf, loadMessages, decryptMsg } from './state.js';
import { avatar, logout } from './main.js';
import { compressImage } from './media.js';
import { unwrapPrivate, wrapPrivate } from './crypto.js';
import { wallpaperSheet, openChat, scrollToMsg, cleanupMine } from './chat.js';
import { APP_URL } from './newchat.js';
import { enablePush, disablePush, pushSupported, swConfig, regenerateRecovery, linkDeviceSheet } from './account.js';
import { quickRepliesSheet } from './extras.js';

export function applyTheme() {
  const t = S.prefs.theme || 'system';
  const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.style.fontSize = ({ s: '15px', m: '16px', l: '17.5px' })[S.prefs.font || 'm'];
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#121022' : '#FBF6EF');
  if (document.documentElement.classList.contains('native')) import('./native.js').then(n => n.nativeTheme(dark));
}
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);

export function openSettings(section) {
  if (section === 'profile') return profileSheet();
  let s;
  const row = (ic, label, sub, fn) => h('button', { class: 'info-row', onclick: () => { fn(); } }, icon(ic, 20), h('span', { class: 'grow' }, label, sub ? h('small', null, sub) : null));
  s = sheet('Ajustes', h('div', { class: 'info' },
    h('button', { class: 'me-card', onclick: () => profileSheet() }, avatar(S.me, 64), h('div', { class: 'grow' }, h('b', null, S.me.display_name), h('small', null, S.me.about), h('small', { class: 'muted' }, '@' + S.me.username))),
    h('div', { class: 'info-sec' },
      row('key', 'Cuenta', 'Contraseña, código de recuperación, eliminar cuenta', accountSheet),
      row('lock', 'Privacidad', 'Últ. vez, foto, confirmaciones, bloqueados', privacySheet),
      row('chat', 'Chats', 'Tema, fondo, tamaño de letra, copia', chatsSheet),
      row('bell', 'Notificaciones', 'Mensajes, sonidos, llamadas', notifSheet),
      row('save', 'Almacenamiento', 'Uso y limpieza', storageSheet),
      row('star', 'Mensajes destacados', null, () => starredSheet()),
      row('bolt', 'Respuestas rápidas', 'Atajos con “/” en el chat', () => quickRepliesSheet()),
      row('broadcast', 'Listas de difusión', 'Un mensaje para varias personas', () => import('./extras.js').then(x => x.broadcastSheet())),
      row('device', 'Dispositivos vinculados', 'Usa DUNA en varios dispositivos', devicesSheet),
      row('info', 'Ayuda y acerca de', null, aboutSheet)),
    h('div', { class: 'info-sec' }, h('button', { class: 'info-row danger', id: 'logout-btn', onclick: () => logout() }, icon('logout', 20), 'Cerrar sesión'))), { wide: true });
}
function profileSheet() {
  let s;
  const name = h('input', { value: S.me.display_name, maxlength: 40 });
  const about = h('input', { value: S.me.about, maxlength: 140 });
  const phone = h('input', { value: S.me.phone || '', placeholder: '+57 300 000 0000 (opcional, para que te encuentren)', maxlength: 18, inputmode: 'tel' });
  const av = avatar(S.me, 120);
  const photo = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' }, onchange: async () => {
    try {
      const { blob } = await compressImage(photo.files[0], 480, 0.8);
      const path = `${S.user.id}/${Date.now()}.webp`;
      const { error } = await sb.storage.from('avatars').upload(path, blob, { contentType: blob.type }); if (error) throw error;
      const old = S.me.avatar_path;
      await sb.from('profiles').update({ avatar_path: path }).eq('id', S.user.id); S.me.avatar_path = path;
      if (old) sb.storage.from('avatars').remove([old]);
      toast('Foto actualizada'); s.close(); profileSheet();
    } catch (e) { toast('No se pudo subir: ' + e.message); }
  } });
  s = sheet('Perfil', h('div', { class: 'form center' },
    h('button', { class: 'av-edit', onclick: () => photo.click(), title: 'Cambiar foto' }, av, h('span', null, icon('camera', 18))), photo,
    S.me.avatar_path ? h('button', { class: 'btn link', onclick: async () => { await sb.storage.from('avatars').remove([S.me.avatar_path]); await sb.from('profiles').update({ avatar_path: null }).eq('id', S.user.id); S.me.avatar_path = null; s.close(); profileSheet(); } }, 'Quitar foto') : null,
    h('label', null, 'Nombre', name), h('label', null, 'Info.', about), h('label', null, 'Teléfono', phone),
    h('p', { class: 'muted' }, 'Usuario: @' + S.me.username, ' · ', h('button', { class: 'btn link', onclick: () => copyText(APP_URL + '#/u/' + S.me.username) }, 'Copiar mi enlace')),
    h('button', { class: 'btn primary', onclick: async () => {
      const patch = { display_name: name.value.trim() || S.me.display_name, about: about.value.trim(), phone: phone.value.trim() || null };
      const { error } = await sb.from('profiles').update(patch).eq('id', S.user.id); if (error) return toast(error.message.includes('phone') ? 'Teléfono inválido' : error.message);
      Object.assign(S.me, patch); toast('Perfil guardado'); s.close();
    } }, 'Guardar')));
}
function privacySheet() {
  const p = { ...S.me.privacy };
  const sel = (key, label, opts) => h('label', null, label, h('select', { onchange: async e => { p[key] = e.target.value; await save(); } }, opts.map(([v, l]) => h('option', { value: v, selected: (p[key] || 'all') === v }, l))));
  const save = async () => { const { error } = await sb.from('profiles').update({ privacy: p }).eq('id', S.user.id); if (error) return toast(error.message); S.me.privacy = { ...p }; toast('Privacidad guardada'); };
  const vis = [['all', 'Todos'], ['contacts', 'Mis contactos'], ['none', 'Nadie']];
  const rr = h('input', { type: 'checkbox', checked: p.read_receipts !== false, onchange: async e => { p.read_receipts = e.target.checked; await save(); } });
  const blocked = h('div', { class: 'list' });
  sb.from('blocks').select('blocked_id').then(async ({ data }) => {
    const ids = (data || []).map(x => x.blocked_id); await loadProfiles(ids, true);
    blocked.innerHTML = ''; if (!ids.length) blocked.append(h('small', { class: 'muted' }, 'Nadie bloqueado'));
    for (const id of ids) blocked.append(h('div', { class: 'person' }, avatar(S.profiles.get(id), 36), h('b', { class: 'grow' }, nameOf(id)), h('button', { class: 'btn ghost sm', onclick: async e => { await sb.from('blocks').delete().eq('blocker_id', S.user.id).eq('blocked_id', id); e.target.closest('.person').remove(); toast('Desbloqueado'); } }, 'Desbloquear')));
  });
  sheet('Privacidad', h('div', { class: 'form' },
    sel('last_seen', 'Últ. vez y en línea', vis), sel('photo', 'Foto del perfil', vis), sel('about', 'Info.', vis),
    sel('groups', 'Quién puede añadirme a grupos', vis), sel('stories', 'Quién ve mis estados', [['chats', 'Personas con las que chateo'], ['contacts', 'Mis contactos'], ['none', 'Nadie']]),
    h('label', { class: 'switch' }, rr, h('span', null, 'Confirmaciones de lectura (si las desactivas, tampoco verás las de otros en chats 1:1)')),
    h('h4', null, 'Bloqueados'), blocked,
    h('p', { class: 'fine' }, 'Estas reglas se aplican en el servidor (la base de datos solo entrega lo que tu privacidad permite).')));
}
function chatsSheet() {
  const theme = h('select', { onchange: e => { S.prefs.theme = e.target.value; savePrefs(); applyTheme(); } }, [['system', 'Predeterminado del sistema'], ['light', 'Claro'], ['dark', 'Oscuro']].map(([v, l]) => h('option', { value: v, selected: (S.prefs.theme || 'system') === v }, l)));
  const font = h('select', { onchange: e => { S.prefs.font = e.target.value; savePrefs(); applyTheme(); } }, [['s', 'Pequeña'], ['m', 'Mediana'], ['l', 'Grande']].map(([v, l]) => h('option', { value: v, selected: (S.prefs.font || 'm') === v }, l)));
  const ent = h('input', { type: 'checkbox', checked: S.prefs.enterSend !== false, onchange: e => { S.prefs.enterSend = e.target.checked; savePrefs(); } });
  const lp = h('input', { type: 'checkbox', checked: S.prefs.linkPreview !== false, onchange: e => { S.prefs.linkPreview = e.target.checked; savePrefs(); } });
  sheet('Chats', h('div', { class: 'form' }, h('label', null, 'Tema', theme), h('label', null, 'Tamaño de letra', font),
    h('button', { class: 'btn ghost', onclick: () => wallpaperSheet(null) }, icon('wallpaper', 16), ' Fondo de pantalla predeterminado'),
    h('label', { class: 'switch' }, ent, h('span', null, 'Enter para enviar (en computador)')),
    h('label', { class: 'switch' }, lp, h('span', null, 'Vista previa de enlaces (el servidor consulta la página del enlace)')),
    h('h4', null, 'Copia de seguridad'),
    h('p', { class: 'fine' }, 'Tus chats viven en tu cuenta y aparecen en cualquier dispositivo. Además puedes descargar una copia legible (los mensajes cifrados se descifran en este dispositivo).'),
    h('button', { class: 'btn ghost', id: 'backup-btn', onclick: backup }, icon('download', 16), ' Descargar copia (JSON)')));
}
async function backup() {
  toast('Preparando copia…');
  const out = { app: 'DUNA', exported_at: new Date().toISOString(), user: { username: S.me.username, display_name: S.me.display_name }, chats: [] };
  for (const c of S.chats.values()) {
    if (c.type === 'community') continue;
    await loadMessages(c.id); let n = 0; while (S.more.get(c.id) && n++ < 40) await loadMessages(c.id, S.msgs.get(c.id)[0]?.created_at);
    out.chats.push({ title: chatTitle(c), type: c.type, messages: (S.msgs.get(c.id) || []).map(m => ({ at: m.created_at, from: m.sender_id ? nameOf(m.sender_id, { you: false }) : 'DUNA', kind: m.kind, text: m.deleted_for_all ? null : m.body, deleted: m.deleted_for_all, summary: previewText(m), file: m.media?.name || null, meta: m.kind === 'poll' || m.kind === 'location' || m.kind === 'contact' ? m.meta : undefined })) });
  }
  download(`DUNA-copia-${new Date().toISOString().slice(0, 10)}.json`, new Blob([JSON.stringify(out, null, 1)], { type: 'application/json' }));
}
function brandTip(b = '') {
  if (/xiaomi|redmi|poco/.test(b)) return 'Xiaomi/Redmi/POCO: activa “Inicio automático” para DUNA, en Batería elige “Sin restricciones” y en apps recientes mantén pulsada DUNA y toca el candado.';
  if (/huawei|honor/.test(b)) return 'Huawei/Honor: en Batería → Inicio de apps, desactiva “Gestionar automáticamente” para DUNA y activa las tres opciones (inicio automático, inicio secundario, ejecución en segundo plano).';
  if (/samsung/.test(b)) return 'Samsung: Ajustes → Batería → Límites de uso en segundo plano: quita DUNA de “Apps en suspensión” y “Apps en suspensión profunda”, y en la app DUNA → Batería elige “Sin restricciones”.';
  if (/oppo|realme|oneplus|vivo|iqoo/.test(b)) return 'Oppo/Realme/OnePlus/Vivo: permite “Inicio automático” y “Actividad en segundo plano” para DUNA y en Batería elige “Sin restricciones”.';
  return 'Si con la pantalla apagada los avisos llegan tarde: en Ajustes → Apps → DUNA → Batería elige “Sin restricciones” y no fuerces la detención de la app.';
}
async function nativeNotifSheet() {
  const N = await import('./native.js');
  const i = await N.nativeInfo();
  const yes = (ok, a, b) => h('span', { style: { color: ok ? 'var(--ok)' : 'var(--danger)', fontWeight: 600 } }, ok ? a : b);
  const via = i.fcm ? 'Firebase Cloud Messaging (FCM), como WhatsApp' : 'conexión propia de DUNA en segundo plano';
  const pv = h('input', { type: 'checkbox', checked: S.prefs.preview !== false, onchange: e => { S.prefs.preview = e.target.checked; savePrefs(); N.syncChatKeys(); } });
  const s = sheet('Notificaciones', h('div', { class: 'form' },
    h('p', null, 'Permiso de notificaciones: ', yes(i.notifications, 'concedido', 'falta')),
    h('p', null, 'Batería sin restricción (pantalla apagada): ', yes(i.battery, 'sí', 'no (pueden llegar tarde con la pantalla apagada)')),
    h('p', { class: 'muted' }, 'Vía de entrega: ' + via + (i.fcm ? '' : i.connected ? ' · conectada' : ' · conectando…') + (i.reply ? ' · Responder desde la notificación: activo' : '')),
    !i.notifications || !i.battery ? h('button', { class: 'btn primary', onclick: async () => { await N.enableNativeNotifications(); savePrefs(); s.close(); setTimeout(() => nativeNotifSheet(), 1200); } }, 'Activar notificaciones') : null,
    h('label', { class: 'switch' }, pv, h('span', null, 'Mostrar vista previa')),
    h('p', { class: 'fine' }, 'Con la vista previa activa verás quién escribe y el texto (también en la pantalla de bloqueo), y podrás tocar “Responder” o “Marcar como leído” sin abrir DUNA.'),
    h('button', { class: 'btn ghost', onclick: () => N.Duna.testNotification() }, 'Probar notificación'),
    h('button', { class: 'btn ghost', onclick: () => N.Duna.openSettings() }, 'Ajustes de notificaciones de Android (sonido, vibración)'),
    h('button', { class: 'btn ghost', onclick: () => N.Duna.openAutostart() }, 'Inicio automático / apps protegidas del fabricante'),
    h('p', { class: 'fine' }, brandTip(i.brand)),
    h('p', { class: 'fine' }, 'Cada teléfono tiene su propia clave: el servidor cifra cada aviso antes de enviarlo. En los chats 1:1 el texto viaja cifrado de extremo a extremo y solo tu teléfono lo descifra para la vista previa. Los chats silenciados no notifican.')));
}
function notifSheet() {
  if (document.documentElement.classList.contains('native')) return nativeNotifSheet();
  const st = h('p', { class: 'muted', id: 'notif-perm' }, 'Permiso del navegador: ' + (!('Notification' in window) ? 'no compatible' : ({ granted: 'concedido', denied: 'bloqueado', default: 'sin decidir' })[Notification.permission]));
  const en = h('input', { type: 'checkbox', checked: !!S.prefs.notif, onchange: async e => {
    if (e.target.checked && 'Notification' in window && Notification.permission !== 'granted') { const r = await Notification.requestPermission(); if (r !== 'granted') { e.target.checked = false; return toast('El navegador no dio permiso'); } }
    S.prefs.notif = e.target.checked; savePrefs(); toast('Guardado');
  } });
  const pu = h('input', { type: 'checkbox', id: 'push-toggle', checked: !!S.prefs.push, disabled: !pushSupported(), onchange: async e => {
    try { if (e.target.checked) { await enablePush(); toast('Notificaciones push activadas en este dispositivo'); } else { await disablePush(); toast('Push desactivado'); } }
    catch (err) { e.target.checked = false; S.prefs.push = false; savePrefs(); toast('No se pudo activar push: ' + err.message); }
  } });
  const snd = h('input', { type: 'checkbox', checked: S.prefs.sound !== false, onchange: e => { S.prefs.sound = e.target.checked; savePrefs(); } });
  const pv = h('input', { type: 'checkbox', checked: S.prefs.preview !== false, onchange: e => { S.prefs.preview = e.target.checked; savePrefs(); swConfig(); } });
  sheet('Notificaciones', h('div', { class: 'form' }, st,
    h('label', { class: 'switch' }, en, h('span', null, 'Notificaciones con DUNA abierta o en segundo plano')),
    h('label', { class: 'switch' }, pu, h('span', null, 'Notificaciones push con la app cerrada (mensajes y llamadas)')),
    h('label', { class: 'switch' }, snd, h('span', null, 'Sonidos en la app')), h('label', { class: 'switch' }, pv, h('span', null, 'Mostrar vista previa')),
    h('button', { class: 'btn ghost', onclick: () => navigator.serviceWorker?.ready.then(r => r.showNotification('DUNA', { body: 'Así se verán tus notificaciones', icon: 'icons/icon-192.png' })).catch(() => toast('No disponible')) }, 'Probar notificación'),
    h('p', { class: 'fine' }, 'Push usa el servicio de notificaciones de tu navegador (Web Push con VAPID). En los chats cifrados 1:1 el servidor solo envía el texto cifrado y tu dispositivo lo descifra para mostrar la vista previa. En iPhone/iPad funciona solo si instalas DUNA en la pantalla de inicio (iOS 16.4 o superior). Los chats silenciados no envían push.')));
}
async function storageSheet() {
  const info = h('div', null, h('div', { class: 'spinner sm' }));
  const s = sheet('Almacenamiento', h('div', { class: 'form' }, info,
    h('p', { class: 'fine' }, 'Para ahorrar espacio: las fotos se comprimen (WebP, máx. 1600 px), las notas de voz usan Opus a 24 kbps (~180 KB por minuto) y cada archivo tiene un máximo de 16 MB (estados 10 MB, fotos de perfil 300 KB). El plan gratuito del servidor ofrece 1 GB de archivos en total para todos los usuarios y 500 MB de base de datos.'),
    h('button', { class: 'btn ghost', onclick: async () => { const n = await cleanupOrphans(); toast(n ? `Se liberaron ${n} archivos` : 'No había archivos por limpiar'); storageSheet(); s.close(); } }, 'Liberar archivos de mensajes eliminados')));
  try { const u = await rpc('storage_usage'); info.innerHTML = ''; info.append(h('p', null, h('b', null, fmtSize(u.mine)), ' usados por tus archivos'), h('div', { class: 'meter' }, h('i', { style: { width: Math.min(100, u.total / 1073741824 * 100) + '%' } })), h('small', { class: 'muted' }, `Total de DUNA: ${fmtSize(u.total)} de 1 GB`)); } catch (e) { info.textContent = e.message; }
}
export async function cleanupOrphans(silent) { try { return await cleanupMine(); } catch (e) { if (!silent) toast(e.message); return 0; } }
function accountSheet() {
  const recStatus = h('p', { class: 'muted', id: 'rc-status' }, 'Consultando…');
  rpc('recovery_status').then(d => { recStatus.textContent = d ? 'Activo desde ' + new Date(d).toLocaleDateString('es-CO', { dateStyle: 'medium' }) : 'No tienes código de recuperación. Genera uno ahora.'; }).catch(e => { recStatus.textContent = e.message; });
  sheet('Cuenta', h('div', { class: 'form' },
    h('p', { class: 'muted' }, 'Usuario: @' + S.me.username),
    h('button', { class: 'btn ghost', onclick: changePassword }, icon('key', 16), ' Cambiar contraseña'),
    h('h4', null, 'Código de recuperación'), recStatus,
    h('button', { class: 'btn ghost', id: 'rc-new', onclick: () => regenerateRecovery() }, icon('lock', 16), ' Generar un código de recuperación nuevo'),
    h('p', { class: 'fine' }, 'Con el código puedes restablecer tu contraseña desde la pantalla de inicio (“¿Olvidaste tu contraseña?”) y conservar tus mensajes cifrados. Sin contraseña ni código no hay forma de recuperar la cuenta: DUNA no usa correo ni SMS.'),
    h('button', { class: 'btn danger', onclick: async () => {
      if (!(await confirmDialog('Se eliminará tu cuenta, tu perfil y tu participación en todos los chats. Esta acción no se puede deshacer.', 'Eliminar mi cuenta', true))) return;
      const v = await prompt('Escribe ELIMINAR para confirmar'); if (v !== 'ELIMINAR') return toast('Cancelado');
      try {
        await disablePush();
        const files = await rpc('my_storage_objects'); const byB = {}; for (const f of files || []) (byB[f.bucket] = byB[f.bucket] || []).push(f.name);
        for (const [b, names] of Object.entries(byB)) for (let i = 0; i < names.length; i += 100) await sb.storage.from(b).remove(names.slice(i, i + 100));
        await rpc('delete_my_account'); await sb.auth.signOut(); localStorage.clear(); indexedDB.deleteDatabase('duna'); location.reload();
      } catch (e) { toast('No se pudo eliminar: ' + e.message); }
    } }, 'Eliminar mi cuenta')));
}
async function changePassword() {
  const cur = h('input', { type: 'password', placeholder: 'Contraseña actual', autocomplete: 'current-password' });
  const nw = h('input', { type: 'password', placeholder: 'Nueva contraseña (mín. 8)', autocomplete: 'new-password' });
  let s; s = sheet('Cambiar contraseña', h('div', { class: 'form' }, cur, nw, h('button', { class: 'btn primary', onclick: async () => {
    if (nw.value.length < 8) return toast('Mínimo 8 caracteres');
    try {
      const { error: e1 } = await sb.auth.signInWithPassword({ email: S.me.username + EMAIL_DOMAIN, password: cur.value }); if (e1) throw new Error('La contraseña actual no es correcta');
      const { data: k } = await sb.from('user_keys').select('enc_priv').eq('user_id', S.user.id).single();
      const { jwk } = await unwrapPrivate(k.enc_priv, cur.value, true);
      const wrapped = await wrapPrivate(jwk, nw.value);
      const { error } = await sb.auth.updateUser({ password: nw.value }); if (error) throw error;
      await sb.from('user_keys').update({ enc_priv: wrapped, updated_at: new Date().toISOString() }).eq('user_id', S.user.id);
      s.close(); toast('Contraseña cambiada');
    } catch (e) { toast(e.message); }
  } }, 'Cambiar')));
}
function devicesSheet() {
  sheet('Dispositivos vinculados', h('div', { class: 'form' },
    h('p', null, 'DUNA es multidispositivo: abre ', h('code', null, APP_URL), ' en otro teléfono, tablet o computador e inicia sesión con tu usuario y contraseña. Tus chats aparecen en todos a la vez.'),
    h('button', { class: 'btn primary', id: 'link-dev', onclick: () => linkDeviceSheet() }, icon('qr', 16), ' Vincular un dispositivo (código QR)'),
    h('p', { class: 'fine' }, 'Vincular con QR inicia sesión en el dispositivo nuevo sin escribir la contraseña. Para leer los chats cifrados allí se pide una vez tu contraseña o tu código de recuperación (la llave viaja protegida y nunca en claro).'),
    h('button', { class: 'btn danger', onclick: async () => { if (await confirmDialog('Se cerrará la sesión en todos tus dispositivos, incluido este.', 'Cerrar en todos', true)) { await sb.auth.signOut({ scope: 'global' }); location.reload(); } } }, 'Cerrar sesión en todos los dispositivos')));
}
function aboutSheet() {
  sheet('Acerca de DUNA', h('div', { class: 'form' },
    h('p', null, h('b', null, 'DUNA'), ' · mensajería instantánea web (PWA). Instálala desde el menú del navegador: “Añadir a pantalla de inicio” / “Instalar app”.'),
    h('p', { class: 'fine' }, 'Formato: *negrita*, _cursiva_, ~tachado~, `código`. Doble toque en un mensaje para reaccionar; desliza a la derecha para responder; mantén presionado para más opciones.'),
    h('p', { class: 'fine' }, 'Mapas © colaboradores de OpenStreetMap.')));
}
export async function starredSheet(chatId) {
  const { data } = await sb.from('message_stars').select('message_id, messages(*)').order('created_at', { ascending: false }).limit(100);
  const rows = (data || []).map(x => x.messages).filter(Boolean).filter(m => !chatId || m.chat_id === chatId);
  await Promise.all(rows.map(m => decryptMsg(m, m.chat_id)));
  let s; s = sheet('Mensajes destacados', h('div', { class: 'list' }, rows.length ? rows.map(m => h('button', { class: 'person', onclick: async () => { s.close(); await openChat(m.chat_id); setTimeout(() => scrollToMsg(m.id), 400); } },
    avatar(m.sender_id === S.user.id ? S.me : S.profiles.get(m.sender_id), 36), h('div', { class: 'grow' }, h('b', null, nameOf(m.sender_id) + ' · ' + chatTitle(S.chats.get(m.chat_id))), h('small', null, previewText(m).slice(0, 120))), h('small', null, fmtListTime(m.created_at)))) : h('p', { class: 'muted' }, 'Mantén presionado un mensaje y elige “Destacar” para encontrarlo aquí.')));
}
