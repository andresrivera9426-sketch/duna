// DUNA como app nativa (Capacitor, Android/iOS). En la web todo esto queda inactivo.
import { Capacitor, registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { sb, SB_URL, SB_KEY } from './sb.js';
import { S, chatTitle } from './state.js';
import { h, toast, sheet } from './ui.js';

export const isNative = () => Capacitor.isNativePlatform();
export const platform = () => Capacitor.getPlatform();
export const Duna = registerPlugin('DunaNative');
const LS = 'duna-native';
const te = new TextEncoder();
const rnd = n => crypto.getRandomValues(new Uint8Array(n));
const b64 = u => btoa(String.fromCharCode(...u));
const b64url = u => b64(u).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
let hooks = {};

export function nativeEarly() {
  if (!isNative()) return;
  document.documentElement.classList.add('native', 'native-' + platform());
  window.__dunaSave = saveFile;
  SplashScreen.hide().catch(() => {});
}

/** Colores de la barra de estado según el tema. */
export function nativeTheme(dark) {
  if (!isNative()) return;
  StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => {});
  if (platform() === 'android') StatusBar.setBackgroundColor({ color: dark ? '#121022' : '#FBF6EF' }).catch(() => {});
}

/** Se llama al terminar de cargar los chats. hooks: { openChat, closeChat, resync, attachFiles } */
export async function nativeStart(h0) {
  if (!isNative()) return;
  hooks = h0;
  App.addListener('backButton', onBack);
  App.addListener('appStateChange', ({ isActive }) => { if (isActive) { hooks.resync?.('app activa'); takeShare(); if (S.current) Duna.clearChat({ chat: S.current }).catch(() => {}); } });
  Duna.addListener('open', e => openFromNotification(e));
  Duna.addListener('share', () => takeShare());
  Duna.addListener('fcmToken', e => saveFcm(e.token));
  await registerDevice().catch(e => console.warn('registro nativo', e));
  const o = await Duna.takeOpen().catch(() => ({})); if (o?.chat) openFromNotification(o);
  takeShare();
  syncChatKeys();
}

function onBack() {
  const dlg = [...document.querySelectorAll('.sheet-wrap, .viewer, .story-viewer, [role=dialog]')].filter(x => x.id !== 'call-ui' && x.isConnected && !x.closest('.call-ui'));
  if (dlg.length) { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return; }
  const app = document.getElementById('app');
  if (S.current && app?.classList.contains('in-chat') && innerWidth < 900) { hooks.closeChat?.(); return; }
  App.minimizeApp().catch(() => {});
}

async function openFromNotification({ chat, call }) {
  if (!chat) return;
  if (S.chats.has(chat)) hooks.openChat?.(chat);
  if (call) {
    const { data } = await sb.from('calls').select('*').eq('id', call).maybeSingle();
    if (data?.status === 'ringing') (await import('./calls.js')).onCallEvent({ eventType: 'INSERT', new: data });
  }
}

/** Registra este teléfono: topic secreto + clave AES propia (la función push cifra con ella). */
export async function registerDevice() {
  if (!isNative() || !S.user) return;
  let cur = null; try { cur = JSON.parse(localStorage.getItem(LS) || 'null'); } catch { cur = null; }
  if (cur && cur.uid !== S.user.id) { await sb.from('native_devices').delete().eq('id', cur.id).then(() => {}, () => {}); cur = null; }
  if (cur) {
    const { data } = await sb.from('native_devices').update({ last_seen: new Date().toISOString() }).eq('id', cur.id).select('id');
    if (!data?.length) cur = null;
  }
  if (!cur) {
    const dev = { topic: b64url(rnd(24)), key: b64(rnd(32)) };
    const { data, error } = await sb.from('native_devices').insert({ platform: platform(), topic: dev.topic, key: dev.key, label: platform() === 'ios' ? 'iPhone' : 'Android' }).select('id').single();
    if (error) throw error;
    cur = { id: data.id, uid: S.user.id, ...dev };
    localStorage.setItem(LS, JSON.stringify(cur));
  }
  const fcmReady = await sb.rpc('native_fcm_ready').then(r => r.data === true, () => false);
  await Duna.register({ url: SB_URL, apikey: SB_KEY, topic: cur.topic, key: cur.key, uid: S.user.id, fcmReady });
  const info = await Duna.info().catch(() => ({}));
  if (info.hasFcm) { const r = await Duna.fcmToken().catch(() => ({})); if (r?.token) await saveFcm(r.token); }
  return cur;
}
async function saveFcm(token) {
  let cur = null; try { cur = JSON.parse(localStorage.getItem(LS) || 'null'); } catch {}
  if (!cur || !token || cur.fcm === token) return;
  const { error } = await sb.from('native_devices').update({ fcm_token: token }).eq('id', cur.id);
  if (!error) { cur.fcm = token; localStorage.setItem(LS, JSON.stringify(cur)); }
}

export async function unregisterDevice() {
  if (!isNative()) return;
  let cur = null; try { cur = JSON.parse(localStorage.getItem(LS) || 'null'); } catch {}
  if (cur) await sb.from('native_devices').delete().eq('id', cur.id).then(() => {}, () => {});
  localStorage.removeItem(LS);
  await Duna.unregister().catch(() => {});
}

/** Claves por chat 1:1 para que la notificación muestre el texto (se guardan cifradas con el Keystore). */
export async function syncChatKeys() {
  if (!isNative() || !S.priv) return;
  const preview = S.prefs.preview !== false;
  const keys = {};
  if (preview) for (const c of S.chats.values()) {
    if (c.type !== 'direct') continue;
    const peer = c.other_id ? S.profiles.get(c.other_id) : S.me;
    if (!peer?.pub_key) continue;
    try {
      const pub = await crypto.subtle.importKey('jwk', { ...peer.pub_key, ext: true }, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
      const bits = await crypto.subtle.deriveBits({ name: 'ECDH', public: pub }, S.priv, 256);
      const hk = await crypto.subtle.importKey('raw', bits, 'HKDF', false, ['deriveBits']);
      const raw = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: te.encode(c.id), info: te.encode('duna-e2e-v1') }, hk, 256);
      keys[c.id] = b64(new Uint8Array(raw));
    } catch {}
  }
  await Duna.setChatKeys({ keys, preview }).catch(() => {});
}

export function clearChatNotifications(chat) { if (isNative() && chat) Duna.clearChat({ chat }).catch(() => {}); }

export async function nativeInfo() { return isNative() ? Duna.info().catch(() => ({})) : null; }

/** Activa notificaciones: permiso de Android 13+ y, sin FCM, excepción de batería. */
export async function enableNativeNotifications() {
  const r = await Duna.requestNotifications().catch(() => ({}));
  const info = await Duna.info();
  if (!info.fcm && !info.battery) await Duna.requestBattery().catch(() => {});
  S.prefs.push = true; S.prefs.notif = true;
  return r.granted ?? info.notifications;
}

// ===== Compartir con DUNA desde otras apps =====
async function takeShare() {
  const s = await Duna.takeShare().catch(() => null);
  if (!s || (!s.text && !(s.files || []).length)) return;
  if (s.error) toast(s.error);
  const files = (s.files || []).map(f => new File([Uint8Array.from(atob(f.data), c => c.charCodeAt(0))], f.name || 'archivo', { type: f.mime || 'application/octet-stream' }));
  pickChat(files.length ? `Enviar ${files.length} archivo${files.length > 1 ? 's' : ''} a…` : 'Enviar a…', async cid => {
    await hooks.openChat?.(cid);
    if (files.length) setTimeout(() => { hooks.attachFiles?.(files); if (s.text) setTimeout(() => { const t = [...document.querySelectorAll('.sheet-wrap textarea')].pop(); if (t) t.value = s.text; }, 300); }, 250);
    if (s.text) setTimeout(() => {
      const ta = document.getElementById('msg-input');
      if (!ta) return;
      if (files.length) return; // el texto va como comentario manual
      ta.value = s.text; ta.dispatchEvent(new Event('input')); ta.focus();
    }, 300);
  });
}
function pickChat(title, done) {
  let sh;
  const chats = [...S.chats.values()].filter(c => c.type !== 'community' && (!c.only_admins_send || ['owner', 'admin'].includes(c.my_role)))
    .sort((a, b) => new Date(b.last_message_at) - new Date(a.last_message_at));
  const q = h('input', { type: 'search', placeholder: 'Buscar chat…', oninput: () => draw() });
  const list = h('div', { class: 'list pick' });
  const draw = () => { list.innerHTML = ''; for (const c of chats.filter(c => chatTitle(c).toLowerCase().includes(q.value.toLowerCase())))
    list.append(h('button', { class: 'person', style: { width: '100%', textAlign: 'left' }, onclick: () => { sh.close(); done(c.id); } }, h('b', null, chatTitle(c)))); };
  draw();
  sh = sheet(title, h('div', { class: 'form' }, q, list));
}

// ===== Guardar/exportar archivos: en la app se abre el menú Compartir (Guardar en Archivos, Drive, WhatsApp…) =====
async function saveFile(name, blob) {
  try {
    const data = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
    const safe = String(name || 'archivo').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 120);
    const w = await Filesystem.writeFile({ path: 'compartir/' + safe, data, directory: Directory.Cache, recursive: true });
    await Share.share({ title: safe, files: [w.uri] });
  } catch (e) { if (!/cancel/i.test(e?.message || '')) toast('No se pudo guardar: ' + (e?.message || e)); }
}
