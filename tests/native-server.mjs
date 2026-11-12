// Verifica la vía de servidor de las notificaciones nativas sin emulador:
// B registra un "dispositivo" (topic + clave), escucha el broadcast como lo hace el servicio Android,
// A envía un mensaje desde la web y se comprueba: llega cifrado, se descifra con la clave del dispositivo, y queda en la cola.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
const SB_URL = 'https://jvaepilcxwnfssbxneiu.supabase.co', SB_KEY = 'sb_publishable_Xjb_xWzN36EL0z-5UbQShQ_cX2jkRG1';
const URL = 'http://localhost:8088/'; const CREATED = '/workspace/duna-test-created.json';
const stamp = Date.now().toString(36); const PASS = 'Duna-Prueba-2026!';
const A = { u: 'prueba_sa_' + stamp, n: 'Ana S ' + stamp, p: PASS }, B = { u: 'prueba_sb_' + stamp, n: 'Beto S ' + stamp, p: PASS };
const created = fs.existsSync(CREATED) ? JSON.parse(fs.readFileSync(CREATED)) : []; created.push(A, B); fs.writeFileSync(CREATED, JSON.stringify(created, null, 1));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ok = (n, p, i = '') => console.log((p ? 'OK    ' : 'FALLA ') + n + (i ? ' — ' + i : ''));
async function register(p, u) { await p.waitForSelector('#f-user'); await p.click('#f-switch'); await p.waitForSelector('#f-name'); await p.type('#f-user', u.u); await p.type('#f-name', u.n); await p.type('#f-pass', u.p); await p.type('#f-pass2', u.p); await p.click('#f-submit'); await p.waitForSelector('#app', { timeout: 60000 }); }
const br = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
const pb = await (await br.createBrowserContext()).newPage(); await pb.goto(URL, { waitUntil: 'networkidle2' }); await register(pb, B);
const pa = await (await br.createBrowserContext()).newPage(); await pa.setViewport({ width: 1280, height: 800 }); await pa.goto(URL, { waitUntil: 'networkidle2' }); await register(pa, A);
await pb.close();
// B: dispositivo nativo
const sbB = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });
const { error: le } = await sbB.auth.signInWithPassword({ email: B.u + '@usuarios.duna.app', password: PASS }); ok('B inicia sesión (node)', !le, le?.message);
const rnd = n => crypto.getRandomValues(new Uint8Array(n)); const b64 = u => Buffer.from(u).toString('base64');
const topic = Buffer.from(rnd(24)).toString('base64url'), key = b64(rnd(32));
const { data: dev, error: de } = await sbB.from('native_devices').insert({ platform: 'android', topic, key, label: 'prueba' }).select('id').single();
ok('Registro en native_devices con RLS', !de, de?.message);
// RLS: A no puede ver el dispositivo de B
const sbA = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });
await sbA.auth.signInWithPassword({ email: A.u + '@usuarios.duna.app', password: PASS });
const { data: seen } = await sbA.from('native_devices').select('id'); ok('RLS: A no ve dispositivos de B', (seen || []).length === 0, JSON.stringify(seen));
const anon = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });
const { data: anonSee } = await anon.from('native_devices').select('id'); ok('RLS: anónimo no ve dispositivos', !(anonSee || []).length);
// Escucha como el servicio Android (anónimo, canal público con topic secreto)
const got = [];
const ch = anon.channel('duna-push:' + topic, { config: { broadcast: { self: false } } }).on('broadcast', { event: 'push' }, m => got.push({ at: Date.now(), p: m.payload })).subscribe();
for (let i = 0; i < 40 && ch.state !== 'joined'; i++) await sleep(250); ok('Suscrito al topic', ch.state === 'joined');
await pa.goto(URL + '#/u/' + B.u, { waitUntil: 'networkidle2' }); await sleep(2500);
await pa.evaluate(() => [...document.querySelectorAll('.sheet button')].find(b => /Enviar mensaje|Chatear|Mensaje/i.test(b.innerText))?.click()); await sleep(2000);
const txt = 'nativo servidor ' + stamp; const t0 = Date.now();
await pa.focus('#msg-input'); await pa.keyboard.type(txt); await pa.keyboard.press('Enter');
for (let i = 0; i < 60 && !got.length; i++) await sleep(250);
ok('Broadcast recibido', got.length > 0, got.length ? (got[0].at - t0) + ' ms desde Enter' : 'nada');
if (got.length) {
  const p = got[0].p; const k = await crypto.subtle.importKey('raw', Buffer.from(key, 'base64'), 'AES-GCM', false, ['decrypt']);
  const d = JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: Buffer.from(p.iv, 'base64') }, k, Buffer.from(p.ct, 'base64'))));
  ok('Descifrado con la clave del dispositivo', d.t === 'msg' && d.title === A.n, JSON.stringify({ ...d, enc: d.enc ? '(cifrado E2E)' : null }).slice(0, 220));
  ok('Texto E2E no viaja en claro', !JSON.stringify(p).includes(txt) && !d.body);
  const { data: pend } = await anon.rpc('native_pending', { p_topic: topic, p_after: 0 });
  ok('Cola recuperable con el topic (native_pending)', (pend || []).some(r => r.id === p.id), `ids ${JSON.stringify((pend || []).map(r => r.id))}, broadcast id ${p.id}`);
  const { data: bad } = await anon.rpc('native_pending', { p_topic: 'x'.repeat(32), p_after: 0 }); ok('Topic incorrecto no devuelve nada', !(bad || []).length);
}
await anon.removeAllChannels(); await br.close(); process.exit(0);
