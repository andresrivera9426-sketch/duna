// Cuenta: notificaciones push, código de recuperación y vincular dispositivos
import qrcode from 'qrcode-generator';
import { sb, rpc, EMAIL_DOMAIN } from '../../services/sb.js';
import { h, icon, toast, sheet, copyText, download, confirmDialog } from '../../shared/ui.js';
import { S, savePrefs } from '../../services/state.js';
import { kvSet, kvGet, unwrapPrivate, wrapPrivate, createIdentity } from '../../services/crypto.js';

// ===== Push (Web Push con VAPID) =====
export const VAPID_PUBLIC = 'BKXW9re8ZzpvirUWDNZUfDX-uhVP_JUJD7VIPJJymjMxrG7qClMgHP5Wbi1EEb_TCOYbkP9HoKyxzK7e7XuxrmM';
const u8 = s => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Uint8Array.from(atob(s), c => c.charCodeAt(0)); };
export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export async function swConfig() { if (S.user) await kvSet('swcfg', { uid: S.user.id, preview: S.prefs.preview !== false, muted: false }).catch(() => {}); }
export async function enablePush() {
  if (!pushSupported()) throw new Error('Este navegador no admite notificaciones push');
  if (Notification.permission !== 'granted') { const r = await Notification.requestPermission(); if (r !== 'granted') throw new Error('El navegador no dio permiso'); }
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  const key = u8(VAPID_PUBLIC);
  if (sub) { const cur = sub.options?.applicationServerKey ? new Uint8Array(sub.options.applicationServerKey) : null; if (cur && cur.join() !== key.join()) { await sub.unsubscribe(); sub = null; } }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  const j = sub.toJSON();
  await sb.from('push_subscriptions').delete().eq('endpoint', j.endpoint);
  const { error } = await sb.from('push_subscriptions').insert({ user_id: S.user.id, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth });
  if (error) throw error;
  S.prefs.push = true; S.prefs.notif = true; savePrefs(); await swConfig();
  return j.endpoint;
}
export async function disablePush() {
  S.prefs.push = false; savePrefs();
  try { const reg = await navigator.serviceWorker.ready; const sub = await reg.pushManager.getSubscription(); if (sub) { await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint); await sub.unsubscribe(); } } catch {}
}
export async function syncPush() { await swConfig(); if (S.prefs.push && pushSupported() && Notification.permission === 'granted') enablePush().catch(() => {}); }

// ===== Código de recuperación =====
const ALPH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const normCode = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export function genCode() { const r = crypto.getRandomValues(new Uint8Array(25)); return [...r].map(x => ALPH[x % 32]).join(''); }
export const fmtCode = c => normCode(c).match(/.{1,5}/g).join('-');
export async function createRecovery(jwk) {
  const code = genCode();
  const wrapped = await wrapPrivate(jwk, code);
  await rpc('set_recovery', { p_code: code, p_wrapped: wrapped });
  return code;
}
export function showRecoveryCode(code, first) {
  let s; const ok = h('button', { class: 'btn primary', id: 'rc-ok', onclick: () => s.close() }, 'Ya lo guardé');
  s = sheet('Tu código de recuperación', h('div', { class: 'form' },
    h('p', null, first ? 'Tu cuenta está lista. ' : '', 'Guarda este código en un lugar seguro. Sirve para recuperar tu cuenta y tus mensajes cifrados si olvidas la contraseña. DUNA no puede mostrártelo otra vez.'),
    h('div', { class: 'rcode', id: 'rc-code' }, fmtCode(code)),
    h('div', { class: 'row-btns' }, h('button', { class: 'btn ghost', onclick: () => copyText(fmtCode(code)) }, icon('copy', 16), ' Copiar'),
      h('button', { class: 'btn ghost', onclick: () => download('DUNA-codigo-recuperacion.txt', new Blob([`DUNA · código de recuperación de @${S.me?.username || ''}\n\n${fmtCode(code)}\n\nGuárdalo en un lugar seguro.`], { type: 'text/plain' })) }, icon('download', 16), ' Descargar')),
    ok), { onclose: () => {} });
}
export async function regenerateRecovery() {
  const pass = h('input', { type: 'password', placeholder: 'Tu contraseña', autocomplete: 'current-password', id: 'rc-pass' });
  const err = h('p', { class: 'err' }); let s;
  const go = async () => {
    try {
      const { data: k } = await sb.from('user_keys').select('enc_priv').eq('user_id', S.user.id).single();
      const { jwk } = await unwrapPrivate(k.enc_priv, pass.value, true).catch(() => { throw new Error('Contraseña incorrecta'); });
      const code = await createRecovery(jwk); s.close(); showRecoveryCode(code);
    } catch (e) { err.textContent = e.message; }
  };
  pass.addEventListener('keydown', e => e.key === 'Enter' && go());
  s = sheet('Nuevo código de recuperación', h('div', { class: 'form' }, h('p', { class: 'muted' }, 'El código anterior dejará de funcionar.'), pass, err, h('button', { class: 'btn primary', id: 'rc-gen', onclick: go }, 'Generar código')));
}
// Recuperar acceso desde la pantalla de inicio
export function recoverSheet(onDone) {
  const user = h('input', { placeholder: 'Usuario', autocapitalize: 'none', id: 'rv-user' });
  const code = h('input', { placeholder: 'Código de recuperación (XXXXX-XXXXX-…)', autocapitalize: 'characters', id: 'rv-code' });
  const p1 = h('input', { type: 'password', placeholder: 'Nueva contraseña (mín. 8)', autocomplete: 'new-password', id: 'rv-pass' });
  const p2 = h('input', { type: 'password', placeholder: 'Repite la nueva contraseña', autocomplete: 'new-password', id: 'rv-pass2' });
  const err = h('p', { class: 'err' }); let s;
  const go = h('button', { class: 'btn primary', id: 'rv-go', onclick: async () => {
    err.textContent = '';
    const u = user.value.trim().toLowerCase().replace(/^@/, ''); const c = normCode(code.value);
    if (p1.value.length < 8) return err.textContent = 'La contraseña debe tener al menos 8 caracteres.';
    if (p1.value !== p2.value) return err.textContent = 'Las contraseñas no coinciden.';
    go.disabled = true; go.textContent = 'Verificando…';
    try {
      const r = await rpc('recover_fetch', { p_username: u, p_code: c });
      let wrapped = null, jwk = null;
      if (r.enc_priv_rec) { ({ jwk } = await unwrapPrivate(r.enc_priv_rec, c, true)); wrapped = await wrapPrivate(jwk, p1.value); }
      await rpc('recover_account', { p_username: u, p_code: c, p_new_password: p1.value, p_new_wrapped: wrapped });
      const { data, error } = await sb.auth.signInWithPassword({ email: u + EMAIL_DOMAIN, password: p1.value }); if (error) throw error;
      S.user = data.user;
      if (jwk) { S.priv = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']); await kvSet('priv:' + S.user.id, S.priv); }
      else {
        const id = await createIdentity(p1.value); await sb.from('user_keys').upsert({ user_id: S.user.id, enc_priv: id.wrapped }); await sb.from('profiles').update({ pub_key: id.pub }).eq('id', S.user.id);
        S.priv = id.priv; await kvSet('priv:' + S.user.id, S.priv); toast('Se creó una llave de cifrado nueva: los mensajes cifrados anteriores no se pueden leer');
      }
      s.close(); toast('Contraseña restablecida. Se cerró la sesión en tus otros dispositivos.'); onDone && onDone();
    } catch (e) { err.textContent = e.message; go.disabled = false; go.textContent = 'Restablecer contraseña'; }
  } }, 'Restablecer contraseña');
  s = sheet('Recuperar cuenta', h('div', { class: 'form' }, h('p', { class: 'muted' }, 'Usa el código de recuperación que guardaste al crear tu cuenta (o en Ajustes › Cuenta). Si lo usas, también recuperas tus mensajes cifrados.'), user, code, p1, p2, err, go,
    h('p', { class: 'fine' }, 'Por seguridad, tras 6 intentos fallidos se bloquea por una hora.')));
}
// Desbloquear la llave en un dispositivo nuevo con el código de recuperación
export async function unlockWithCode(c) {
  const r = await rpc('recover_fetch', { p_username: S.me?.username || (await sb.from('profiles').select('username').eq('id', S.user.id).single()).data.username, p_code: normCode(c) });
  if (!r.enc_priv_rec) throw new Error('Tu código no incluye la llave de cifrado');
  const { key } = await unwrapPrivate(r.enc_priv_rec, normCode(c));
  S.priv = key; await kvSet('priv:' + S.user.id, key);
}

// ===== Vincular dispositivo =====
const LALPH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function linkCode() { const r = crypto.getRandomValues(new Uint8Array(10)); return [...r].map(x => LALPH[x % 32]).join(''); }
export const APP_ORIGIN_URL = () => location.origin + location.pathname;
export function qrSvg(text, cell = 5) { const q = qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: cell, margin: 2, scalable: true }); }
// En el dispositivo nuevo (sin sesión)
export function linkNewDevice(onDone) {
  const code = linkCode(); const secret = [...crypto.getRandomValues(new Uint8Array(24))].map(b => b.toString(16).padStart(2, '0')).join('');
  const label = (navigator.userAgentData?.platform || navigator.platform || 'Navegador') + ' · ' + (/(Edg|Chrome|Firefox|Safari)\//.exec(navigator.userAgent)?.[1] || 'web');
  const url = APP_ORIGIN_URL() + '#/vincular/' + code;
  const status = h('p', { class: 'muted', id: 'ln-status' }, 'Esperando confirmación…');
  let s, timer, stopped = false;
  const stop = () => { stopped = true; clearTimeout(timer); };
  s = sheet('Vincular con otro dispositivo', h('div', { class: 'form center' },
    h('p', null, 'En tu teléfono o computador donde ya usas DUNA abre ', h('b', null, 'Ajustes › Dispositivos vinculados › Vincular un dispositivo'), ' y escanea este código o escribe el código de 10 letras.'),
    h('div', { class: 'qr', html: qrSvg(url) }),
    h('div', { class: 'rcode', id: 'ln-code' }, code.slice(0, 5) + '-' + code.slice(5)), status,
    h('p', { class: 'fine' }, 'El código vence en 5 minutos. Después escribe tu contraseña o código de recuperación una sola vez para leer los chats cifrados.')), { onclose: stop });
  rpc('link_create', { p_code: code, p_secret: secret, p_label: label }).then(poll).catch(e => { status.textContent = e.message; });
  async function poll() {
    if (stopped) return;
    try {
      const r = await rpc('link_poll', { p_code: code, p_secret: secret });
      if (r.status === 'ok') {
        status.textContent = 'Vinculado. Entrando…';
        let res = await sb.auth.verifyOtp({ token_hash: r.token_hash, type: 'magiclink' });
        if (res.error) res = await sb.auth.verifyOtp({ token_hash: r.token_hash, type: 'email' });
        if (res.error) throw res.error;
        S.user = res.data.user; stop(); s.close(); onDone && onDone(); return;
      }
      if (r.status === 'expired') { status.textContent = 'El código venció. Cierra y vuelve a intentarlo.'; return; }
    } catch (e) { status.textContent = 'Error: ' + e.message; return; }
    timer = setTimeout(poll, 2000);
  }
}
// En el dispositivo que ya tiene sesión
export async function approveLink(code) {
  const c = normCode(code);
  if (!/^[A-Z2-9]{10}$/.test(c)) throw new Error('El código debe tener 10 caracteres');
  const { data, error } = await sb.functions.invoke('vincular', { body: { code: c } });
  if (error) { let m = error.message; try { m = (await error.context.json()).error || m; } catch {} throw new Error(m); }
  if (data?.error) throw new Error(data.error);
  return data.label;
}
export function linkDeviceSheet(prefill) {
  const inp = h('input', { placeholder: 'Código de 10 letras', autocapitalize: 'characters', maxlength: 11, id: 'lk-code', value: prefill || '' });
  const err = h('p', { class: 'err' }); let s, stream;
  const video = h('video', { class: 'qr-cam', playsInline: true, muted: true, hidden: true });
  const go = h('button', { class: 'btn primary', id: 'lk-go', onclick: async () => {
    err.textContent = ''; go.disabled = true;
    try { const label = await approveLink(inp.value); s.close(); toast('Dispositivo vinculado: ' + label); } catch (e) { err.textContent = e.message; go.disabled = false; }
  } }, 'Vincular');
  const scan = 'BarcodeDetector' in window ? h('button', { class: 'btn ghost', onclick: async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); video.srcObject = stream; video.hidden = false; await video.play();
      const det = new BarcodeDetector({ formats: ['qr_code'] });
      const tick = async () => { if (!stream) return; const r = await det.detect(video).catch(() => []); const v = r[0]?.rawValue; const m = v && v.match(/vincular\/([A-Z2-9]{10})/); if (m) { inp.value = m[1]; stopCam(); go.click(); } else requestAnimationFrame(tick); };
      tick();
    } catch (e) { err.textContent = 'Cámara no disponible: ' + e.message; }
  } }, icon('qr', 16), ' Escanear código QR') : h('p', { class: 'fine' }, 'Tu navegador no lee QR: escribe el código.');
  const stopCam = () => { stream?.getTracks().forEach(t => t.stop()); stream = null; video.hidden = true; };
  s = sheet('Vincular un dispositivo', h('div', { class: 'form' }, h('p', { class: 'muted' }, 'En el dispositivo nuevo abre DUNA y toca “Vincular con otro dispositivo”.'), scan, video, inp, err, go), { onclose: stopCam });
}
