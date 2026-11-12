const V = 'duna-__V__';
const CORE = ['./', 'index.html', 'app.js?v=__V__', 'styles.css?v=__V__', 'manifest.webmanifest', 'icons/logo.svg', 'icons/icon-192.png'];
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
