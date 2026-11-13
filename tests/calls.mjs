// Llamada real entre dos navegadores headless (audio/video falsos) contra Supabase real.
// Verifica: push de llamada (dispositivo nativo simulado de B recibe broadcast 'call'), timbre, contestar, WebRTC conectado, colgar.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
const SB_URL = 'https://jvaepilcxwnfssbxneiu.supabase.co', SB_KEY = 'sb_publishable_Xjb_xWzN36EL0z-5UbQShQ_cX2jkRG1';
const URL = process.argv[2] || 'http://localhost:8088/'; const KIND = process.argv[3] || 'audio';
const CREATED = '/workspace/duna-test-created.json';
const stamp = Date.now().toString(36); const PASS = 'Duna-Prueba-2026!';
const A = { u: 'prueba_ca_' + stamp, n: 'Ana C', p: PASS }, B = { u: 'prueba_cb_' + stamp, n: 'Beto C', p: PASS };
const created = fs.existsSync(CREATED) ? JSON.parse(fs.readFileSync(CREATED)) : []; created.push(A, B); fs.writeFileSync(CREATED, JSON.stringify(created, null, 1));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ok = (n, p, i = '') => console.log((p ? 'OK    ' : 'FALLA ') + n + (i ? ' — ' + i : ''));
const br = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
async function register(u) {
  const ctx = await br.createBrowserContext(); await ctx.overridePermissions(new globalThis.URL(URL).origin, ['microphone', 'camera', 'notifications']);
  const p = await ctx.newPage(); await p.setViewport({ width: 420, height: 820 });
  // FORCE_RELAY=1 fuerza iceTransportPolicy 'relay'; ONLY_HOST=turn.cloudflare.com deja solo los servidores de ese host
  if (process.env.FORCE_RELAY) await p.evaluateOnNewDocument((only) => { const O = window.RTCPeerConnection;
    window.RTCPeerConnection = function (cfg = {}, ...r) { let ice = cfg.iceServers || []; if (only) ice = ice.map(s => ({ ...s, urls: [].concat(s.urls).filter(u => u.includes(only)) })).filter(s => s.urls.length);
      return new O({ ...cfg, iceServers: ice, iceTransportPolicy: 'relay' }, ...r); }; window.RTCPeerConnection.prototype = O.prototype; }, process.env.ONLY_HOST || '');
  await p.goto(URL, { waitUntil: 'networkidle2' }); await p.waitForSelector('#f-user'); await p.click('#f-switch'); await p.waitForSelector('#f-name');
  await p.type('#f-user', u.u); await p.type('#f-name', u.n); await p.type('#f-pass', u.p); await p.type('#f-pass2', u.p); await p.click('#f-submit');
  await p.waitForSelector('#app', { timeout: 60000 }); await p.waitForSelector('#rc-ok', { timeout: 8000 }).then(b => b.click()).catch(() => {}); await sleep(600);
  await p.evaluate(() => document.querySelectorAll('.sheet-wrap').forEach(x => x.remove())); return p;
}
const pa = await register(A), pb = await register(B);
// B: "teléfono" simulado (native_devices) para verificar el push de llamada
const sbB = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } }); await sbB.auth.signInWithPassword({ email: B.u + '@usuarios.duna.app', password: PASS });
const rnd = n => crypto.getRandomValues(new Uint8Array(n)); const key = Buffer.from(rnd(32)).toString('base64'), topic = Buffer.from(rnd(24)).toString('base64url');
await sbB.from('native_devices').insert({ platform: 'android', topic, key, label: 'prueba' });
const anon = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } }); const got = [];
const ch = anon.channel('duna-push:' + topic).on('broadcast', { event: 'push' }, m => got.push(m.payload)).subscribe();
for (let i = 0; i < 40 && ch.state !== 'joined'; i++) await sleep(250);
// A abre chat con B y saluda (crea el chat)
await pa.goto(URL + '#/u/' + B.u, { waitUntil: 'networkidle2' }); await sleep(2000);
await pa.evaluate(() => [...document.querySelectorAll('.sheet button')].find(b => /Enviar mensaje|Chatear|Mensaje/i.test(b.innerText))?.click()); await sleep(1500);
await pa.focus('#msg-input'); await pa.keyboard.type('hola'); await pa.keyboard.press('Enter'); await sleep(2500); got.length = 0;
// Llamar
const t0 = Date.now();
await pa.evaluate(k => { const b = [...document.querySelectorAll('.conv-head button')].find(x => (x.getAttribute('aria-label') || '').match(k === 'video' ? /Videollamada/i : /^Llamada|Llamar/i)); b?.click(); return !!b; }, KIND);
const rang = await pb.waitForSelector('#call-accept', { timeout: 20000 }).then(() => Date.now() - t0, () => -1);
ok('B ve la llamada entrante (Realtime)', rang > 0, rang + ' ms');
for (let i = 0; i < 40 && !got.some(g => g.ct); i++) await sleep(250);
let pushOk = false;
if (got.length) { const g = got[0]; const k = await crypto.subtle.importKey('raw', Buffer.from(key, 'base64'), 'AES-GCM', false, ['decrypt']);
  const d = JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: Buffer.from(g.iv, 'base64') }, k, Buffer.from(g.ct, 'base64')))); pushOk = d.t === 'call'; }
ok('Push de llamada al teléfono de B (antes NO se enviaba)', pushOk, got.length + ' avisos');
// B "abre la app desde la notificación" (recarga sin evento Realtime): debe volver a ver la llamada sonando
await pb.reload({ waitUntil: 'domcontentloaded' }); const again = await pb.waitForSelector('#call-accept', { timeout: 15000 }).then(() => true, () => false);
ok('Al abrir la app con la llamada sonando, aparece para contestar (checkRinging)', again);
await sleep(800); const t1 = Date.now(); await pb.click('#call-accept');
const conn = await Promise.all([pa, pb].map(p => p.waitForFunction(() => Object.values(window.__duna.call?.states || {}).includes('connected'), { timeout: 30000, polling: 50 }).then(() => Date.now() - t1, () => -1)));
ok('WebRTC conectado en A y B', conn.every(x => x > 0), 'desde Contestar: A ' + conn[0] + ' ms, B ' + conn[1] + ' ms');
await sleep(2500);
const stats = await Promise.all([pa, pb].map(p => p.evaluate(async () => { const pc = [...window.__duna.call.pcs.values()][0]; const r = await pc.getStats(); let inB = 0, pair = null; r.forEach(x => { if (x.type === 'inbound-rtp' && x.kind === 'audio') inB += x.bytesReceived; if (x.type === 'candidate-pair' && x.nominated && x.state === 'succeeded') pair = x; });
  let lt = null, via = null; if (pair) r.forEach(x => { if (x.id === pair.localCandidateId) { lt = x.candidateType; if (x.url) via = x.url.replace(/^(turns?:[^:?]+:\d+).*?(\?transport=\w+)?$/, '$1$2') + ' (' + (x.relayProtocol || '?') + ')'; } }); return { inB, lt, via }; })));
ok('Audio fluye en ambos sentidos', stats.every(s => s.inB > 1000), JSON.stringify(stats));
await pa.evaluate(() => document.querySelector('#call-hang, [aria-label="Colgar"]')?.click()); await sleep(2500);
const ended = await pb.evaluate(() => !window.__duna.call); ok('Colgar termina la llamada en B', ended);
const st2 = await sbB.from('calls').select('status, answered_at').order('created_at', { ascending: false }).limit(1).single();
ok('Fila de la llamada: contestada y finalizada', st2.data?.answered_at && ['ended', 'missed'].includes(st2.data.status), JSON.stringify(st2.data));
const { data: iceS, error: iceE } = await sbB.rpc('ice_servers'); ok('RPC ice_servers responde', !iceE && Array.isArray(iceS), (iceS || []).length + ' servidores, TURN: ' + ((iceS || []).some(s => [].concat(s.urls).some(u => /^turns?:/.test(u))) ? 'sí' : 'no')); // nunca imprimir credenciales
const log = await pa.evaluate(() => window.__duna.callLog.slice(-8)); console.log('log A:', log.join(' | '));
await anon.removeAllChannels(); await br.close(); process.exit(0);
