// Web Push (RFC 8291 aes128gcm + VAPID RFC 8292) solo con WebCrypto. Sin dependencias.
const te = new TextEncoder();
const b64u = (buf) => { const u = new Uint8Array(buf); let s = ''; for (const c of u) s += String.fromCharCode(c); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64u = (s) => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Uint8Array.from(atob(s), (c) => c.charCodeAt(0)); };
const concat = (...a) => { const n = a.reduce((x, y) => x + y.length, 0); const o = new Uint8Array(n); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };
async function hkdf(salt, ikm, info, len) {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, len * 8));
}
export async function encryptPayload(p256dh, authSecret, payload, salt = crypto.getRandomValues(new Uint8Array(16)), asKeys = null) {
  const uaPub = unb64u(p256dh), auth = unb64u(authSecret);
  const as = asKeys || await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', as.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, as.privateKey, 256));
  const ikm = await hkdf(auth, ecdh, concat(te.encode('WebPush: info\0'), uaPub, asPub), 32);
  const cek = await hkdf(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const pt = concat(typeof payload === 'string' ? te.encode(payload) : payload, new Uint8Array([2]));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, pt));
  const rs = new Uint8Array([0, 0, 16, 0]);
  return concat(salt, rs, new Uint8Array([asPub.length]), asPub, ct);
}
let vapidKey = null;
async function vapidJwt(jwk, aud, sub) {
  if (!vapidKey) vapidKey = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y, d: jwk.d, ext: true }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const head = b64u(te.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64u(te.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, vapidKey, te.encode(head + '.' + body));
  return head + '.' + body + '.' + b64u(sig);
}
export async function sendPush(sub, payload, cfg, { ttl = 86400, urgency = 'high', topic } = {}) {
  const url = new URL(sub.endpoint);
  const jwt = await vapidJwt(typeof cfg.vapid_jwk === 'string' ? JSON.parse(cfg.vapid_jwk) : cfg.vapid_jwk, url.origin, cfg.vapid_subject);
  const body = await encryptPayload(sub.p256dh, sub.auth, payload);
  const headers = { 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: String(ttl), Urgency: urgency, Authorization: `vapid t=${jwt}, k=${cfg.vapid_public}` };
  if (topic) headers.Topic = topic;
  const r = await fetch(sub.endpoint, { method: 'POST', headers, body });
  return { status: r.status, text: r.status >= 400 ? (await r.text()).slice(0, 200) : '' };
}
export { b64u, unb64u };
