// Prueba real de extremo a extremo: dos usuarios en Chrome headless contra el backend Supabase real.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const URL = process.env.URL || 'http://localhost:8088/';
const CRED = '/workspace/duna-test-users.json';
const OUT = 'tests/out'; fs.mkdirSync(OUT, { recursive: true });
const users = fs.existsSync(CRED) ? JSON.parse(fs.readFileSync(CRED)) : {
  a: { u: 'prueba_ana' + Math.floor(Math.random() * 900 + 100), n: 'Ana Prueba', p: 'Duna-Prueba-2026!' },
  b: { u: 'prueba_beto' + Math.floor(Math.random() * 900 + 100), n: 'Beto Prueba', p: 'Duna-Prueba-2026!' },
};
const results = []; const ok = (name, pass, info = '') => { results.push({ name, pass, info }); console.log((pass ? 'OK  ' : 'FALLA ') + name + (info ? ' — ' + info : '')); };
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true,
  args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
async function client(key, vp) {
  const ctx = await browser.createBrowserContext();
  await ctx.overridePermissions(new globalThis.URL(URL).origin, ['microphone', 'camera', 'geolocation', 'notifications', 'clipboard-read', 'clipboard-write']);
  const p = await ctx.newPage(); await p.setViewport(vp);
  p.on('pageerror', e => console.log(`[${key}] PAGEERROR`, e.message));
  p.on('console', m => { if (m.type() === 'error' && !/favicon|ERR_|status of 4/.test(m.text())) console.log(`[${key}] console`, m.text().slice(0, 200)); });
  await p.setGeolocation({ latitude: 4.6097, longitude: -74.0817, accuracy: 20 });
  await p.goto(URL, { waitUntil: 'networkidle2' });
  return p;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function login(p, u, register) {
  await p.waitForSelector('#f-user');
  if (register) { await p.click('#f-switch'); await p.waitForSelector('#f-name'); }
  await p.type('#f-user', u.u); if (register) await p.type('#f-name', u.n);
  await p.type('#f-pass', u.p); if (register) await p.type('#f-pass2', u.p);
  await p.click('#f-submit');
  await p.waitForSelector('#app', { timeout: 30000 });
}
const textIn = (p, sel, txt, timeout = 15000) => p.waitForFunction((s, t) => [...document.querySelectorAll(s)].some(e => e.innerText.includes(t)), { timeout, polling: 200 }, sel, txt).then(() => true, () => false);
async function rightClickMsg(p, txt) {
  const h = await p.evaluateHandle(t => [...document.querySelectorAll('.mrow .bubble')].reverse().find(b => b.innerText.includes(t)), txt);
  const el = h.asElement(); const box = await el.boundingBox();
  await p.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
  await p.waitForSelector('.ctx');
}
const clickMenu = (p, label) => p.evaluate(l => { const b = [...document.querySelectorAll('.ctx .ctx-item')].find(x => x.innerText.trim() === l); b?.click(); return !!b; }, label);
async function openChatWith(p, title) {
  await p.evaluate(t => [...document.querySelectorAll('.chat-row')].find(r => r.innerText.includes(t))?.click(), title);
  await p.waitForSelector('#msg-input', { timeout: 15000 });
}
async function send(p, txt) { await p.click('#msg-input'); await p.type('#msg-input', txt); await p.keyboard.press('Enter'); }

try {
  const first = !fs.existsSync(CRED);
  const A = await client('A', { width: 1366, height: 768 });
  const B = await client('B', { width: 390, height: 844, isMobile: true, hasTouch: false });
  await login(A, users.a, first); await login(B, users.b, first);
  if (first) fs.writeFileSync(CRED, JSON.stringify(users));
  ok('Registro/inicio de sesión de 2 usuarios', true, users.a.u + ', ' + users.b.u);
  const keysOk = await A.evaluate(() => indexedDB.databases().then(d => d.some(x => x.name === 'duna')));
  ok('Llave E2E guardada en el dispositivo', keysOk);

  // A abre chat con B
  await A.click('#fab-new'); await A.waitForSelector('#user-search'); await A.type('#user-search', users.b.u);
  await A.waitForFunction(n => [...document.querySelectorAll('.sheet .person')].some(e => e.innerText.includes(n)), { timeout: 10000 }, users.b.n);
  await A.evaluate(n => [...document.querySelectorAll('.sheet .person')].find(e => e.innerText.includes(n)).click(), users.b.n);
  await A.waitForSelector('#msg-input');
  const stamp = Date.now().toString(36);
  const m1 = 'Hola Beto, prueba DUNA ' + stamp;
  await send(A, m1);
  ok('A envía mensaje 1:1', await textIn(A, '.mrow.me', m1));
  ok('B recibe en la lista en tiempo real', await textIn(B, '.chat-row', m1, 20000));
  const enc = await A.evaluate(async () => { const { createClient } = {}; return true; });
  await openChatWith(B, users.a.n);
  ok('B ve el mensaje descifrado en el chat', await textIn(B, '.mrow', m1));
  ok('A ve doble check de leído', await A.waitForFunction(t => { const r = [...document.querySelectorAll('.mrow.me')].find(e => e.innerText.includes(t)); return r && r.querySelector('.tick.read'); }, { timeout: 20000 }, m1).then(() => true, () => false));
  // escribiendo…
  await B.click('#msg-input'); await B.type('#msg-input', 'Esto');
  ok('A ve "escribiendo…"', await textIn(A, '#conv-head', 'escribiendo', 10000));
  await B.type('#msg-input', ' es una respuesta'); await B.keyboard.press('Enter');
  ok('A recibe respuesta de B', await textIn(A, '.mrow', 'Esto es una respuesta'));
  // responder citando (B cita el mensaje de A)
  await rightClickMsg(B, m1); await clickMenu(B, 'Responder'); await send(B, 'Te cito ' + stamp);
  ok('Responder citando llega con la cita', await A.waitForFunction(t => [...document.querySelectorAll('.mrow')].some(r => r.innerText.includes('Te cito ' + t) && r.querySelector('.quote')), { timeout: 15000 }, stamp).then(() => true, () => false));
  // reacción
  await rightClickMsg(B, m1); await B.evaluate(() => document.querySelector('.ctx .quick-react button').click());
  ok('Reacción 👍 llega a A', await A.waitForFunction(t => { const r = [...document.querySelectorAll('.mrow.me')].find(e => e.innerText.includes(t)); return r && r.querySelector('.reacts')?.innerText.includes('👍'); }, { timeout: 15000 }, m1).then(() => true, () => false));
  // editar
  const m2 = 'Mensaje para editar ' + stamp;
  await send(A, m2); await textIn(B, '.mrow', m2);
  await sleep(800);
  await rightClickMsg(A, m2); await clickMenu(A, 'Editar');
  await A.evaluate(() => { const t = document.getElementById('msg-input'); t.value = ''; });
  await A.type('#msg-input', 'Mensaje editado ' + stamp); await A.keyboard.press('Enter');
  ok('Edición visible para B con etiqueta "editado"', await B.waitForFunction(t => [...document.querySelectorAll('.mrow')].some(r => r.innerText.includes('Mensaje editado ' + t) && r.innerText.includes('editado')), { timeout: 15000 }, stamp).then(() => true, () => false));
  // eliminar para todos
  const m3 = 'Mensaje a eliminar ' + stamp;
  await send(A, m3); await textIn(B, '.mrow', m3); await sleep(600);
  await rightClickMsg(A, m3); await clickMenu(A, 'Eliminar');
  await A.waitForSelector('.sheet .btn'); await A.evaluate(() => [...document.querySelectorAll('.sheet .btn')].find(b => b.innerText.includes('para todos')).click());
  ok('Eliminar para todos llega a B', await textIn(B, '.mrow', 'Se eliminó este mensaje'));
  // eliminar para mí (B oculta la respuesta propia)
  await rightClickMsg(B, 'Esto es una respuesta'); await clickMenu(B, 'Eliminar'); await B.waitForSelector('.sheet .btn');
  await B.evaluate(() => [...document.querySelectorAll('.sheet .btn')].find(b => b.innerText.includes('para mí')).click()); await sleep(1500);
  const goneB = await B.evaluate(() => ![...document.querySelectorAll('.mrow')].some(r => r.innerText.includes('Esto es una respuesta')));
  const stillA = await A.evaluate(() => [...document.querySelectorAll('.mrow')].some(r => r.innerText.includes('Esto es una respuesta')));
  ok('Eliminar para mí (solo desaparece para B)', goneB && stillA);
  // foto
  const img = OUT + '/foto.png'; await A.screenshot({ path: img });
  await A.evaluate(() => document.querySelector('[aria-label="Adjuntar"]').click()); await A.waitForSelector('.ctx');
  const [fc] = await Promise.all([A.waitForFileChooser(), clickMenu(A, 'Fotos y videos')]); await fc.accept([img]);
  await A.waitForSelector('#att-send'); await A.click('#att-send');
  ok('Foto comprimida y cifrada llega y B la descifra', await B.waitForFunction(() => [...document.querySelectorAll('.mrow:not(.me) .media img.in')].length > 0, { timeout: 30000 }).then(() => true, () => false));
  // nota de voz (micrófono simulado)
  await A.evaluate(() => { const t = document.getElementById('msg-input'); t.value = ''; t.dispatchEvent(new Event('input')); });
  await A.click('#send-btn'); await A.waitForSelector('#rec-send'); await sleep(2500); await A.click('#rec-send');
  ok('Nota de voz grabada en el navegador llega a B', await B.waitForFunction(() => document.querySelectorAll('.mrow:not(.me) .aplayer.voice').length > 0, { timeout: 30000 }).then(() => true, () => false));
  const played = await B.evaluate(async () => { document.querySelector('.mrow:not(.me) .aplayer.voice .aplay').click(); await new Promise(r => setTimeout(r, 1500)); const a = [...document.querySelectorAll('.aplayer.voice')].some(e => e.classList.contains('playing')); return a; });
  ok('B reproduce la nota de voz (descifrada)', played);
  // ubicación
  await A.evaluate(() => document.querySelector('[aria-label="Adjuntar"]').click()); await A.waitForSelector('.ctx'); await clickMenu(A, 'Ubicación');
  await A.waitForSelector('.sheet .btn.primary'); await A.click('.sheet .btn.primary');
  ok('Ubicación compartida llega a B', await textIn(B, '.mrow .loc', 'Ubicación', 20000));
  // encuesta
  await A.evaluate(() => document.querySelector('[aria-label="Adjuntar"]').click()); await A.waitForSelector('.ctx'); await clickMenu(A, 'Encuesta');
  await A.waitForSelector('.sheet input'); const ins = await A.$$('.sheet input:not([type=checkbox])');
  await ins[0].type('¿Almorzamos? ' + stamp); await ins[1].type('Sí'); const ins2 = await A.$$('.sheet .poll-opts input'); await ins2[1].type('No');
  await A.evaluate(() => [...document.querySelectorAll('.sheet .btn.primary')].pop().click());
  await textIn(B, '.mrow .poll', '¿Almorzamos? ' + stamp, 15000);
  await B.evaluate(t => { const p = [...document.querySelectorAll('.mrow .poll')].find(e => e.innerText.includes(t)); p.querySelector('.poll-opt').click(); }, stamp);
  ok('Encuesta: voto de B visible para A', await A.waitForFunction(t => { const p = [...document.querySelectorAll('.mrow .poll')].find(e => e.innerText.includes(t)); return p && p.querySelector('.pn')?.innerText === '1'; }, { timeout: 15000 }, stamp).then(() => true, () => false));
  await A.screenshot({ path: OUT + '/chat-escritorio-1366.png' }); await B.screenshot({ path: OUT + '/chat-movil-390.png' });

  // grupo
  await A.evaluate(() => document.querySelector('.conv-head [aria-label="Más opciones"]')); 
  await A.evaluate(() => document.querySelector('.rail-btn[data-tab="chats"]').click());
  await A.click('#fab-new'); await A.waitForSelector('.sheet .person.action'); await A.evaluate(() => [...document.querySelectorAll('.sheet .person.action')].find(e => e.innerText.includes('Nuevo grupo')).click());
  await A.waitForFunction(() => document.querySelectorAll('.sheet').length && document.querySelector('.sheet h2')?.innerText.includes('participantes'));
  await sleep(400);
  await A.evaluate(n => { const l = [...document.querySelectorAll('.sheet label.person')].find(e => e.innerText.includes(n)); l.querySelector('input').click(); }, users.b.n);
  await A.evaluate(() => [...document.querySelectorAll('.sheet .btn.primary')].pop().click());
  await A.waitForSelector('#group-title'); const gname = 'Grupo prueba ' + stamp; await A.type('#group-title', gname); await A.click('#group-create');
  await A.waitForSelector('#msg-input'); await send(A, 'Hola grupo ' + stamp);
  ok('Grupo creado y B lo recibe en tiempo real', await textIn(B, '.chat-row', gname, 20000));
  await B.evaluate(() => document.querySelector('.conv-head .back')?.click()); await sleep(500);
  await openChatWith(B, gname);
  ok('B ve mensaje del grupo', await textIn(B, '.mrow', 'Hola grupo ' + stamp));
  await send(B, 'Respuesta en grupo ' + stamp);
  ok('A ve mensaje de B en el grupo con nombre del remitente', await A.waitForFunction(t => [...document.querySelectorAll('.mrow')].some(r => r.innerText.includes('Respuesta en grupo ' + t) && r.querySelector('.sender')), { timeout: 15000 }, stamp).then(() => true, () => false));
  const invite = await A.evaluate(async () => { document.querySelector('.head-id').click(); await new Promise(r => setTimeout(r, 1500)); return document.getElementById('invite-link')?.innerText || ''; });
  ok('Enlace de invitación del grupo', invite.includes('#/invitar/'), invite.slice(0, 80));
  await A.screenshot({ path: OUT + '/info-grupo-1366.png' });
  await A.keyboard.press('Escape'); await sleep(300);

  // estado
  await A.evaluate(() => document.querySelector('.rail-btn[data-tab="updates"]').click()); await A.waitForSelector('#new-story'); await A.click('#new-story');
  await A.waitForSelector('.story-text'); await A.type('.story-text', 'Estado de prueba ' + stamp); await A.click('#story-publish');
  await sleep(1500);
  await B.evaluate(() => document.querySelector('.conv-head .back')?.click()); await sleep(400);
  await B.evaluate(() => document.querySelector('.tab[data-tab="updates"]').click());
  ok('B ve el estado de A', await textIn(B, '.updates', users.a.n, 15000));
  await B.screenshot({ path: OUT + '/novedades-movil-390.png' });
  await B.evaluate(n => [...document.querySelectorAll('.story-row')].find(e => e.innerText.includes(n))?.click(), users.a.n);
  ok('B abre el estado (24 h)', await textIn(B, '.story-viewer', 'Estado de prueba ' + stamp, 10000));
  await B.keyboard.press('Escape');

  // llamada 1:1
  await A.evaluate(() => document.querySelector('.rail-btn[data-tab="chats"]').click()); await sleep(400);
  await openChatWith(A, users.b.n);
  await B.evaluate(() => document.querySelector('.tab[data-tab="chats"]').click()); await sleep(400);
  await A.click('.conv-head [aria-label="Llamada de voz"]');
  const rang = await B.waitForSelector('#call-accept', { timeout: 20000 }).then(() => true, () => false);
  ok('B recibe la llamada entrante (timbre)', rang);
  if (rang) {
    await B.click('#call-accept');
    const conn = await Promise.all([A, B].map(p => p.waitForFunction(() => window.__duna?.call && Object.values(window.__duna.call.states).includes('connected'), { timeout: 30000 }).then(() => true, () => false)));
    ok('Llamada de voz WebRTC conectada (red local, STUN)', conn.every(Boolean));
    await sleep(1500); await B.screenshot({ path: OUT + '/llamada-movil-390.png' });
    await A.click('#call-hang');
    ok('Colgar cierra la llamada en ambos', await B.waitForFunction(() => !document.getElementById('call-ui'), { timeout: 15000 }).then(() => true, () => false));
  }
  await sleep(1000);
  await A.click('.conv-head [aria-label="Videollamada"]');
  if (await B.waitForSelector('#call-accept', { timeout: 20000 }).then(() => true, () => false)) {
    await B.click('#call-accept');
    const v = await Promise.all([A, B].map(p => p.waitForFunction(() => { const c = window.__duna?.call; return c && Object.values(c.states).includes('connected') && [...c.streams.values()].some(s => s.getVideoTracks().length); }, { timeout: 30000 }).then(() => true, () => false)));
    ok('Videollamada conectada con video remoto', v.every(Boolean));
    await sleep(1500); await A.screenshot({ path: OUT + '/videollamada-1366.png' });
    await B.click('#call-hang'); await sleep(1500);
  } else ok('Videollamada conectada con video remoto', false, 'no sonó');
} catch (e) { ok('Ejecución sin errores', false, e.message); }
fs.writeFileSync(OUT + '/resultados.json', JSON.stringify({ at: new Date().toISOString(), url: URL, results }, null, 1));
const f = results.filter(r => !r.pass).length; console.log(`\n${results.length - f}/${results.length} pruebas OK`);
await browser.close(); process.exit(f ? 1 : 0);
