// DUNA · notificaciones para la app nativa (Android/iOS)
// 1) Cifra la notificación con la clave AES-256 propia del dispositivo.
// 2) La guarda en una cola corta (el dispositivo recupera lo perdido al reconectar).
// 3) La difunde en vivo por Supabase Realtime (broadcast público a un topic secreto) — $0, sin terceros.
// 4) Si el dispositivo tiene token FCM y hay cuenta de servicio de Firebase configurada, también por FCM HTTP v1.
const enc = new TextEncoder();
const b64 = (u: Uint8Array) => { let s = ''; for (const x of u) s += String.fromCharCode(x); return btoa(s); };
const unb64 = (s: string) => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Uint8Array.from(atob(s), c => c.charCodeAt(0)); };
const b64url = (u: Uint8Array) => b64(u).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export async function seal(keyB64: string, obj: unknown) {
  const key = await crypto.subtle.importKey('raw', unb64(keyB64), 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj))));
  return { v: 1, iv: b64(iv), ct: b64(ct) };
}

// ---- FCM HTTP v1 (solo si existe la cuenta de servicio en app_config.fcm_sa) ----
let fcmTok: { t: string; exp: number } | null = null;
async function fcmAccess(sa: any) {
  if (fcmTok && fcmTok.exp > Date.now() + 60e3) return fcmTok.t;
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(enc.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const claim = b64url(enc.encode(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })));
  const pem = String(sa.private_key).replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const key = await crypto.subtle.importKey('pkcs8', unb64(pem), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(head + '.' + claim)));
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: head + '.' + claim + '.' + b64url(sig) }) });
  const j = await r.json(); if (!j.access_token) throw new Error('fcm oauth ' + r.status);
  fcmTok = { t: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 }; return fcmTok.t;
}
const KIND: Record<string, string> = { image: '📷 Foto', video: '🎬 Video', audio: '🎵 Audio', voice: '🎤 Nota de voz', document: '📄 Documento', location: '📍 Ubicación', contact: '👤 Contacto', poll: '📊 Encuesta', sticker: '✨ Sticker', gif: 'GIF' };
/** Texto visible de la notificación: genérico (el contenido 1:1 va cifrado de extremo a extremo). */
export function visibleText(p: any) {
  const group = p.ct && p.ct !== 'direct';
  if (p.t === 'call') return { title: p.title || 'DUNA', body: (p.kind === 'video' ? '📹 Videollamada entrante' : '📞 Llamada entrante') + (group ? ' · ' + (p.from || '') : ''), channel: 'duna_calls' };
  const what = p.vo ? '① Archivo de una vista' : (KIND[p.kind] || 'Mensaje nuevo');
  return { title: p.title || 'DUNA', body: group ? `${p.from || ''}: ${what}` : what, channel: 'duna_msgs' };
}
export async function fcmSend(sa: any, token: string, data: Record<string, string>, ttl: number, p: any) {
  const v = visibleText(p);
  const tag = (p.t === 'call' ? 'call:' : '') + (p.chat || 'duna');
  // Solo "data" (prioridad alta): Android entrega el mensaje a DunaFcmService aunque la app esté cerrada,
  // y el teléfono descifra y arma la notificación con vista previa, Responder y Marcar como leído.
  // (Un bloque "notification" lo mostraría el sistema sin pasar por la app: sin vista previa ni respuesta.)
  const message = {
    token,
    data: { ...data, duna_chat: String(p.chat || ''), ...(p.call ? { duna_call: String(p.call) } : {}) },
    android: { priority: 'HIGH', ttl: ttl + 's' },
    apns: { headers: { 'apns-priority': '10' }, payload: { aps: { 'content-available': 1, 'mutable-content': 1, alert: { title: v.title, body: v.body }, sound: 'default' } } },
  };
  const r = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await fcmAccess(sa) }, body: JSON.stringify({ message }) });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, name: j?.name ? String(j.name).split('/').pop() : null, error: j?.error?.status || null, code: (j?.error?.details || []).map((d: any) => d.errorCode).filter(Boolean).join(',') || null };
}

export async function sendNative(sb: any, cfg: Record<string, string>, kind: string, id: string) {
  const { data: targets, error } = await sb.rpc('native_targets', { p_kind: kind, p_id: id });
  if (error) return { error: error.message };
  if (!targets?.length) return { native: 0 };
  // FCM admite ~4 KB de datos: si el mensaje cifrado es muy largo, se envía sin el texto (el teléfono muestra "Mensaje nuevo")
  const sealed = await Promise.all(targets.map(async (t: any) => {
    let data = await seal(t.key, t.payload);
    if (data.ct.length > 3300) { const { enc: _e, body: _b, ...rest } = t.payload; data = await seal(t.key, { ...rest, big: true }); }
    return { t, data };
  }));
  const { data: q, error: qe } = await sb.rpc('native_enqueue', { p_items: sealed.map(s => ({ device: s.t.device_id, data: s.data })) });
  const ids = new Map<string, number>(); if (!qe) for (const r of q || []) ids.set(r.device_id, r.id);
  const msgs = sealed.map(s => ({ topic: 'duna-push:' + s.t.topic, event: 'push', private: false, payload: { id: ids.get(s.t.device_id) || 0, ...s.data } }));
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const br = await fetch(Deno.env.get('SUPABASE_URL') + '/realtime/v1/api/broadcast', { method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: key, Authorization: 'Bearer ' + key }, body: JSON.stringify({ messages: msgs }) });
  const out: any = { native: msgs.length, broadcast: br.status, queued: ids.size };
  let sa: any = null; try { sa = cfg.fcm_sa ? JSON.parse(cfg.fcm_sa) : null; } catch { sa = null; }
  const withFcm = sealed.filter(s => s.t.fcm_token);
  if (sa && withFcm.length) {
    out.fcm = await Promise.all(withFcm.map(async s => {
      try {
        const r = await fcmSend(sa, s.t.fcm_token, { id: String(ids.get(s.t.device_id) || 0), v: '1', iv: s.data.iv, ct: s.data.ct }, kind === 'call' ? 45 : 86400, s.t.payload);
        if (r.status === 404 || r.code === 'UNREGISTERED') await sb.rpc('native_fcm_gone', { p_device: s.t.device_id });
        return r;
      } catch (_e) { return { status: 0 }; }
    }));
  } else if (withFcm.length) out.fcm = 'sin cuenta de servicio';
  return out;
}

/** Diagnóstico sin secretos: obtiene el token OAuth y hace un envío validate_only a un token ficticio. */
export async function fcmCheck(cfg: Record<string, string>) {
  let sa: any = null; try { sa = cfg.fcm_sa ? JSON.parse(cfg.fcm_sa) : null; } catch { return { sa: 'json inválido' }; }
  if (!sa) return { sa: 'no configurada' };
  const out: any = { project_id: sa.project_id };
  try { await fcmAccess(sa); out.oauth = 'ok'; } catch (e) { out.oauth = 'error: ' + String((e as Error).message).slice(0, 80); return out; }
  const r = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await fcmAccess(sa) },
    body: JSON.stringify({ validate_only: true, message: { token: 'duna-token-de-prueba-invalido', data: { t: 'check' } } }) });
  const j = await r.json().catch(() => ({}));
  out.send_status = r.status; out.send_error = j?.error?.status || null;
  out.fcm_error_code = (j?.error?.details || []).map((d: any) => d.errorCode).filter(Boolean).join(',') || null;
  return out;
}

/** Prueba real a un dispositivo (por id de native_devices); devuelve solo el estado y el nombre del mensaje de Google. */
export async function fcmTest(sb: any, cfg: Record<string, string>, deviceId: string) {
  let sa: any = null; try { sa = JSON.parse(cfg.fcm_sa || ''); } catch { return { sa: 'no configurada' }; }
  const { data } = await sb.from('native_devices').select('fcm_token').eq('id', deviceId).maybeSingle();
  if (!data?.fcm_token) return { device: 'sin token FCM' };
  return await fcmSend(sa, data.fcm_token, { t: 'test' }, 600, { t: 'msg', ct: 'direct', title: 'DUNA', kind: 'text', chat: '' });
}
