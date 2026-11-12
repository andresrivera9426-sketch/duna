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
async function fcmSend(sa: any, token: string, data: Record<string, string>, ttl: number) {
  const r = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await fcmAccess(sa) },
    body: JSON.stringify({ message: { token, data, android: { priority: 'HIGH', ttl: ttl + 's' }, apns: { headers: { 'apns-priority': '10' }, payload: { aps: { 'content-available': 1, 'mutable-content': 1, alert: { title: 'DUNA', body: 'Nuevo mensaje' } } } } } }) });
  return r.status;
}

export async function sendNative(sb: any, cfg: Record<string, string>, kind: string, id: string) {
  const { data: targets, error } = await sb.rpc('native_targets', { p_kind: kind, p_id: id });
  if (error) return { error: error.message };
  if (!targets?.length) return { native: 0 };
  const sealed = await Promise.all(targets.map(async (t: any) => ({ t, data: await seal(t.key, t.payload) })));
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
        const st = await fcmSend(sa, s.t.fcm_token, { id: String(ids.get(s.t.device_id) || 0), v: '1', iv: s.data.iv, ct: s.data.ct }, kind === 'call' ? 45 : 86400);
        if (st === 404 || st === 400) await sb.rpc('native_fcm_gone', { p_device: s.t.device_id });
        return st;
      } catch (_e) { return 0; }
    }));
  } else if (withFcm.length) out.fcm = 'sin cuenta de servicio';
  return out;
}
