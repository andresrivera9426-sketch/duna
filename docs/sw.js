const V = 'duna-202611121413';
const CORE = ['./', 'index.html', 'app.js?v=202611121413', 'styles.css?v=202611121413', 'manifest.webmanifest', 'icons/logo.svg', 'icons/icon-192.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  if (e.request.mode === 'navigate') { e.respondWith(fetch(e.request).catch(() => caches.match('index.html'))); return; }
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => { if (res.ok) { const cl = res.clone(); caches.open(V).then(c => c.put(e.request, cl)); } return res; })));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const chat = e.notification.data?.chat;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    const c = cs[0];
    if (c) { c.focus(); if (chat) c.postMessage({ chat }); return; }
    return self.clients.openWindow('./' + (chat ? '#/c/' + chat : ''));
  }));
});

// ===== Notificaciones push (app cerrada) =====
function kv(k) { return new Promise((res, rej) => { const r = indexedDB.open('duna', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onerror = () => rej(r.error); r.onsuccess = () => { try { const g = r.result.transaction('kv').objectStore('kv').get(k); g.onsuccess = () => res(g.result); g.onerror = () => rej(g.error); } catch (e) { rej(e); } }; }); }
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function decryptPush(d) {
  const priv = await kv('priv:' + d.uid); if (!priv) return null;
  const pub = await crypto.subtle.importKey('jwk', { ...d.pub, ext: true }, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const bits = await crypto.subtle.deriveBits({ name: 'ECDH', public: pub }, priv, 256);
  const hk = await crypto.subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey']);
  const te = new TextEncoder();
  const key = await crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: te.encode(d.chat), info: te.encode('duna-e2e-v1') }, hk, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(d.enc.iv) }, key, unb64(d.enc.ct));
  return JSON.parse(new TextDecoder().decode(pt));
}
const KIND = { image: '📷 Foto', video: '🎬 Video', audio: '🎵 Audio', voice: '🎤 Nota de voz', document: '📄 Documento', location: '📍 Ubicación', contact: '👤 Contacto', poll: '📊 Encuesta', sticker: '✨ Sticker', gif: 'GIF' };
self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch { d = { title: 'DUNA', body: e.data?.text() }; }
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (d.t === 'msg' && wins.some(w => w.focused && w.visibilityState === 'visible')) return;
    const cfg = (await kv('swcfg').catch(() => null)) || {};
    if (cfg.uid && d.uid && cfg.uid !== d.uid) return;
    const opts = { icon: 'icons/icon-192.png', badge: 'icons/badge.png', data: { chat: d.chat }, tag: d.chat || 'duna', renotify: true };
    if (d.t === 'call') {
      return self.registration.showNotification(d.title || 'DUNA', { ...opts, tag: 'call-' + d.chat, body: (d.kind === 'video' ? '📹 Videollamada entrante' : '📞 Llamada entrante') + (d.ct !== 'direct' ? ' · ' + d.from : ''), requireInteraction: true, vibrate: [400, 200, 400, 200, 400] });
    }
    let text = d.body || null, kind = d.kind;
    if (!text && d.enc && d.pub && cfg.preview !== false) { try { const p = await decryptPush(d); text = p?.b || null; } catch { text = null; } }
    let body = d.vo ? '① ' + (kind === 'image' ? 'Foto' : 'Video') + ' de una vista' : KIND[kind] ? KIND[kind] + (text ? ' ' + text : '') : (text || (d.enc ? '🔒 Nuevo mensaje cifrado' : 'Nuevo mensaje'));
    if (cfg.preview === false) body = 'Nuevo mensaje';
    if (d.ct && d.ct !== 'direct') body = (d.from || '') + ': ' + body;
    return self.registration.showNotification(d.title || 'DUNA', { ...opts, body: body.slice(0, 240) });
  })());
});
self.addEventListener('pushsubscriptionchange', () => {});
