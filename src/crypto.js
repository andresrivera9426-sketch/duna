// Cifrado de extremo a extremo para chats 1:1 (WebCrypto)
// ECDH P-256 por usuario -> HKDF(SHA-256, sal = id del chat) -> AES-GCM 256.
// La clave privada se guarda en el servidor solo envuelta con una clave derivada de la contraseña (PBKDF2 310k).
const te = new TextEncoder(), td = new TextDecoder();
export function b64(buf) { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }
export const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const subtle = crypto.subtle;

// Almacén local (IndexedDB) para la clave privada no extraíble
function idb() { return new Promise((res, rej) => { const r = indexedDB.open('duna', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
export async function kvSet(k, v) { const db = await idb(); return new Promise((res, rej) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = res; t.onerror = () => rej(t.error); }); }
export async function kvGet(k) { const db = await idb(); return new Promise((res, rej) => { const r = db.transaction('kv').objectStore('kv').get(k); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
export async function kvDel(k) { const db = await idb(); return new Promise(res => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').delete(k); t.oncomplete = res; }); }

async function kek(password, salt, it) {
  const base = await subtle.importKey('raw', te.encode(password), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey({ name: 'PBKDF2', salt, iterations: it, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function createIdentity(password) {
  const kp = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const pub = await subtle.exportKey('jwk', kp.publicKey);
  const wrapped = await wrapPrivate(kp.privateKey, password);
  const priv = await subtle.importKey('jwk', await subtle.exportKey('jwk', kp.privateKey), { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  return { pub: { kty: pub.kty, crv: pub.crv, x: pub.x, y: pub.y }, wrapped, priv };
}
export async function wrapPrivate(privKey, password) {
  const jwk = privKey.extractable ? await subtle.exportKey('jwk', privKey) : privKey;
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12)), it = 310000;
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, await kek(password, salt, it), te.encode(JSON.stringify(jwk)));
  return { v: 1, it, salt: b64(salt), iv: b64(iv), ct: b64(ct) };
}
export async function unwrapPrivate(w, password, extractable = false) {
  const pt = await subtle.decrypt({ name: 'AES-GCM', iv: unb64(w.iv) }, await kek(password, unb64(w.salt), w.it), unb64(w.ct));
  const jwk = JSON.parse(td.decode(pt));
  return { key: await subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, extractable, ['deriveBits']), jwk };
}
const chatKeys = new Map();
export async function chatKey(myPriv, theirPubJwk, chatId) {
  const id = chatId + JSON.stringify(theirPubJwk);
  if (chatKeys.has(id)) return chatKeys.get(id);
  const pub = await subtle.importKey('jwk', { ...theirPubJwk, ext: true }, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const bits = await subtle.deriveBits({ name: 'ECDH', public: pub }, myPriv, 256);
  const hk = await subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey']);
  const key = await subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: te.encode(chatId), info: te.encode('duna-e2e-v1') }, hk, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  chatKeys.set(id, key); return key;
}
export async function encJSON(key, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, key, te.encode(JSON.stringify(obj)));
  return { v: 1, iv: b64(iv), ct: b64(ct) };
}
export async function decJSON(key, e) {
  const pt = await subtle.decrypt({ name: 'AES-GCM', iv: unb64(e.iv) }, key, unb64(e.ct));
  return JSON.parse(td.decode(pt));
}
export async function encBytes(key, buf) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, key, buf));
  const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12); return out;
}
export async function decBytes(key, buf) {
  const u = new Uint8Array(buf);
  return subtle.decrypt({ name: 'AES-GCM', iv: u.subarray(0, 12) }, key, u.subarray(12));
}
// Código de seguridad para verificar (60 dígitos, igual en ambos teléfonos)
export async function safetyCode(pubA, pubB) {
  const parts = [pubA, pubB].map(p => p.x + p.y).sort();
  const d = new Uint8Array(await subtle.digest('SHA-256', te.encode(parts.join('|'))));
  let out = '';
  for (let i = 0; i < 12; i++) { const n = ((d[i * 2] << 8) | d[i * 2 + 1]) % 100000; out += String(n).padStart(5, '0') + (i % 4 === 3 ? '\n' : ' '); }
  return out.trim();
}
