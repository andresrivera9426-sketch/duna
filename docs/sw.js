const V = 'duna-202611251816';
const CORE = ['./', 'index.html', 'app.js?v=202611251816', 'styles.css?v=202611251816', 'discover.css?v=202611251816', 'manifest.webmanifest', 'icons/logo.svg', 'icons/icon-192.png', 'fonts/jakarta-latin.woff2', ...["c/triqui-NVKCJ4ES.js","c/games-AYWUGR2E.js","c/moments-GFI3NGON.js","c/festivos-KY4HDVOW.js","c/saber-B6UNFB7L.js","c/sismos-GTUV6TA3.js","c/unidades-4PHVTEER.js","c/registry-5YXP6GEN.js","c/g2048-YREWCFNM.js","c/snake-JLL4GZHL.js","c/memoria-T3DTKRWO.js","c/chunk-XYEIIUSJ.js","c/videos-FPT2K7L3.js","c/radio-UMQVQUQP.js","c/clima-7F6IDD7E.js","c/divisas-IK4SICT4.js","c/calc-ZSZCE2HZ.js","c/jsQR-ZNO4UMHF.js","c/qr-TFWZ3VRG.js","c/notas-CP426SRU.js","c/composer-EQDPPYNO.js","c/settings-YSSKUBEG.js","c/info-ZCO2UXGN.js","c/chat-7RQ7NJ3R.js","c/ia-HTKZGPZ6.js","c/reader-DXMDWAD6.js","c/stories-ILREJGXW.js","c/chunk-NVIQJVME.js","c/news-P3AYPYEU.js","c/chunk-6KOUNADY.js","c/web-6ISHHY5X.js","c/calls-IC6CFNX6.js","c/native-HN7W2LP6.js","c/share-CYAD2JZK.js","c/chunk-6AZGBONB.js","c/media-2ZKYXSJU.js","c/communities-3WBHSJGX.js","c/newchat-4JT5SNM7.js","c/extras-RSVJEFWP.js","c/chunk-VNNB7C7H.js","c/chunk-3MIZ4RCB.js","c/chunk-EWA5YSQL.js","c/chunk-J4S62DR6.js","c/chunk-LWYFCV5Q.js","c/chunk-IVKMV5HO.js","c/ui-SHWK5DWZ.js","c/crypto-IVELQE5P.js","c/state-PVMZ3FMN.js","c/account-NBKXPXT7.js","c/chunk-YRJND23X.js","c/chunk-E63QHFFS.js","c/chunk-QB6NEYZ5.js","c/chunk-NEG7H6YK.js","c/chunk-EZ3R2NCP.js","c/chunk-77V2J4KH.js","c/web-EA3SD2OF.js","c/web-LQTS5GOO.js","c/web-4JUQYZWC.js","c/chunk-7DQ4MLZW.js","c/chunk-OBDVASP3.js","c/chunk-MEWMVPQC.js"]];
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
  const chat = e.notification.data?.chat, reply = e.action === 'reply';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    const c = cs[0];
    if (c) { c.focus(); if (chat) c.postMessage({ chat, reply }); return; }
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
    // Safari (iPhone/iPad/Mac) revoca el permiso si un push no muestra notificación: allí se muestra siempre (silenciosa y breve si DUNA está en pantalla)
    const apple = /iPhone|iPad|iPod|Macintosh/.test(self.navigator.userAgent) && !/Chrome|Chromium|CriOS|Edg|Firefox|FxiOS/.test(self.navigator.userAgent);
    if (d.t === 'msg' && wins.some(w => w.focused && w.visibilityState === 'visible')) {
      if (!apple) return;
      await self.registration.showNotification(d.title || 'DUNA', { body: 'Mensaje nuevo', tag: 'duna-fg', silent: true, icon: 'icons/icon-192.png' });
      await new Promise(r => setTimeout(r, 1500));
      (await self.registration.getNotifications({ tag: 'duna-fg' })).forEach(n => n.close());
      return;
    }
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
    // Botón "Responder" donde el navegador admite acciones (Chrome Android/escritorio, Edge, Firefox). iOS no muestra acciones.
    const actions = !apple && 'actions' in Notification.prototype && d.chat ? [{ action: 'reply', title: 'Responder' }] : undefined;
    return self.registration.showNotification(d.title || 'DUNA', { ...opts, body: body.slice(0, 240), actions, timestamp: d.at ? d.at * 1000 : Date.now(), vibrate: [200, 100, 200] });
  })());
});
self.addEventListener('pushsubscriptionchange', () => {});
