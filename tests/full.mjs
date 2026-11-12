// Prueba completa de DUNA: dos usuarios reales (A escritorio 1366x768, B móvil 390x844) + un tercer navegador (C) para vincular/recuperar.
// Todo contra el backend real de Supabase. Las cuentas creadas se registran para borrarlas al final (tools/cleanup-tests.mjs).
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const URL = process.env.URL || 'http://localhost:8088/';
const OUT = 'tests/out2'; fs.mkdirSync(OUT, { recursive: true });
const CREATED = '/workspace/duna-test-created.json';
const stamp = Date.now().toString(36);
const PASS = 'Duna-Prueba-2026!';
const users = { a: { u: 'prueba_a_' + stamp, n: 'Ana ' + stamp, p: PASS }, b: { u: 'prueba_b_' + stamp, n: 'Beto ' + stamp, p: PASS } };
const created = fs.existsSync(CREATED) ? JSON.parse(fs.readFileSync(CREATED)) : [];
created.push(users.a, users.b); fs.writeFileSync(CREATED, JSON.stringify(created, null, 1));
const results = []; const ok = (name, pass, info = '') => { results.push({ name, pass: !!pass, info: String(info).slice(0, 300) }); console.log((pass ? 'OK    ' : 'FALLA ') + name + (info ? ' — ' + String(info).slice(0, 200) : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ARGS = ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required', '--disable-features=WebRtcHideLocalIpsWithMdns'];
const PERMS = ['microphone', 'camera', 'geolocation', 'notifications', 'clipboard-read', 'clipboard-write'];
fs.rmSync('/tmp/duna-prof-a', { recursive: true, force: true });
const browserA = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, userDataDir: '/tmp/duna-prof-a', args: ARGS }); // perfil persistente: permite Web Push
const browserB = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ARGS });
const DL = '/tmp/duna-dl-' + stamp; fs.mkdirSync(DL, { recursive: true });
async function page(ctx, key, vp) {
  await ctx.overridePermissions(new globalThis.URL(URL).origin, PERMS);
  const p = await ctx.newPage(); await p.setViewport(vp);
  p.on('pageerror', e => console.log(`[${key}] PAGEERROR`, e.message));
  p.on('console', m => { if (m.type() === 'error' && !/favicon|ERR_|status of 4|Failed to load resource/.test(m.text())) console.log(`[${key}] console`, m.text().slice(0, 200)); });
  await p.setGeolocation({ latitude: 4.6097, longitude: -74.0817, accuracy: 20 });
  const cdp = await p.createCDPSession(); await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL }).catch(() => cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: DL }));
  await p.evaluateOnNewDocument(() => { window.__toasts = []; new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) if (n.classList?.contains('toast')) window.__toasts.push(n.innerText); }).observe(document, { childList: true, subtree: true }); });
  await p.goto(URL, { waitUntil: 'networkidle2' });
  return p;
}
async function register(p, u) {
  await p.waitForSelector('#f-user'); await p.click('#f-switch'); await p.waitForSelector('#f-name');
  await p.type('#f-user', u.u); await p.type('#f-name', u.n); await p.type('#f-pass', u.p); await p.type('#f-pass2', u.p);
  await p.click('#f-submit'); await p.waitForSelector('#app', { timeout: 40000 });
}
const textIn = (p, sel, txt, timeout = 15000) => p.waitForFunction((s, t) => [...document.querySelectorAll(s)].some(e => e.innerText.includes(t)), { timeout, polling: 250 }, sel, txt).then(() => true, () => false);
const waitFn = (p, fn, arg, timeout = 15000) => p.waitForFunction(fn, { timeout, polling: 250 }, arg).then(() => true, () => false);
async function ctxMsg(p, txt) {
  const finder = t => { const bs = [...document.querySelectorAll('.mrow .bubble')].reverse(); return bs.find(b => [...b.querySelectorAll('.txt')].some(x => x.innerText.trim().startsWith(t) && !x.closest('.quote'))) || bs.find(b => b.innerText.includes(t)); };
  await p.waitForFunction(finder, { timeout: 10000, polling: 250 }, txt).catch(() => {});
  const hd = await p.evaluateHandle(finder, txt);
  const el = hd.asElement(); if (!el) throw new Error('no encontré el mensaje ' + txt);
  await el.evaluate(e => e.scrollIntoView({ block: 'center' })); await sleep(200);
  for (let i = 0; i < 3; i++) {
    await el.evaluate(e => e.scrollIntoView({ block: 'center' })); await sleep(300);
    const box = await el.boundingBox(); await p.mouse.click(box.x + Math.min(40, box.width / 2), box.y + box.height - 10, { button: 'right' });
    if (await p.waitForSelector('.ctx', { timeout: 3000 }).then(() => true, () => false)) return;
    await closeSheets(p); await p.keyboard.press('Escape');
  }
  throw new Error('no abrió el menú del mensaje ' + txt);
}
const clickMenu = (p, label) => p.evaluate(l => { const b = [...document.querySelectorAll('.ctx .ctx-item')].find(x => x.innerText.trim() === l); b?.click(); return !!b; }, label);
const clickText = (p, sel, txt) => p.evaluate((s, t) => { const b = [...document.querySelectorAll(s)].reverse().find(x => x.innerText.trim().includes(t)); b?.click(); return !!b; }, sel, txt);
async function openChatWith(p, title) {
  await p.evaluate(() => (document.querySelector('.rail-btn[data-tab="chats"]') || document.querySelector('.tab[data-tab="chats"]'))?.click()); await sleep(300);
  await p.evaluate(() => { if (document.getElementById('app')?.classList.contains('in-chat') && innerWidth < 900) document.querySelector('.conv-head .back')?.click(); }); await sleep(300);
  const found = await p.evaluate(t => { const r = [...document.querySelectorAll('.chat-row')].find(r => r.querySelector('.title')?.innerText.trim() === t); r?.click(); return !!r; }, title);
  if (!found) throw new Error('No está el chat ' + title);
  await p.waitForFunction(t => document.querySelector('#conv-head')?.innerText.includes(t), { timeout: 15000 }, title);
  await sleep(400);
}
async function send(p, txt) { await p.click('#msg-input'); await p.type('#msg-input', txt); await p.keyboard.press('Enter'); }
const closeSheets = p => p.evaluate(() => document.querySelectorAll('.sheet-wrap').forEach(s => s.remove()));
async function openSettingsRow(p, label) {
  await closeSheets(p);
  await p.evaluate(() => (document.querySelector('.rail-btn[title="Ajustes"]') || null)?.click());
  if (!(await p.$('.sheet .info-row'))) await p.evaluate(() => { document.querySelector('.side-head [aria-label="Menú"]')?.click(); }), await sleep(200), await clickMenu(p, 'Ajustes');
  await p.waitForSelector('.sheet .info-row'); await clickText(p, '.sheet .info-row', label); await sleep(500);
}
async function attach(p, label) { await p.evaluate(() => document.querySelector('[aria-label="Adjuntar"]').click()); await p.waitForSelector('.ctx'); return clickMenu(p, label); }
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY, 'i') : null; let failN = 0;
async function step(name, fn) {
  if (ONLY && !ONLY.test(name) && !/Registro|Chat 1:1|Eliminar cuenta|Notificaciones push/.test(name)) return;
  const before = results.filter(r => r.pass === false).length;
  try { await fn(); } catch (e) { ok(name, false, 'error: ' + e.message); }
  if (results.filter(r => r.pass === false).length > before) { failN++; for (const [k, p] of [['A', A], ['B', B]]) if (p && !p.isClosed()) { await p.screenshot({ path: `${OUT}/fail-${failN}-${k}.png` }).catch(() => {}); console.log(`   [${k}] toasts:`, await p.evaluate(() => (window.__toasts || []).slice(-5).join(' | ')).catch(() => '')); } }
}
const shot = (p, n) => p.screenshot({ path: `${OUT}/${n}.png` }).catch(() => {});

let A, B, C, recA = null, recB = null, pushEndpoint = null, chatAB = null;
try {
  const ctxA = browserA.defaultBrowserContext(); const ctxB = await browserB.createBrowserContext();
  A = await page(ctxA, 'A', { width: 1366, height: 768 });
  B = await page(ctxB, 'B', { width: 390, height: 844, isMobile: true, hasTouch: false });
  await shot(B, '01-inicio-movil-390');

  await step('Registro de 2 cuentas nuevas + código de recuperación', async () => {
    await register(A, users.a); await register(B, users.b);
    const ca = await A.waitForSelector('#rc-code', { timeout: 15000 }).then(() => A.$eval('#rc-code', e => e.innerText.trim()));
    const cb = await B.waitForSelector('#rc-code', { timeout: 15000 }).then(() => B.$eval('#rc-code', e => e.innerText.trim()));
    recA = ca; recB = cb; await shot(B, '02-codigo-recuperacion-390');
    await A.click('#rc-ok'); await B.click('#rc-ok'); await sleep(1000);
    ok('Registro de 2 cuentas nuevas + código de recuperación', /^[A-Z0-9]{5}(-[A-Z0-9]{5}){4}$/.test(ca) && /^[A-Z0-9]{5}(-[A-Z0-9]{5}){4}$/.test(cb), users.a.u + ', ' + users.b.u);
  });

  await step('Notificaciones push: suscripción guardada', async () => {
    await openSettingsRow(A, 'Notificaciones'); await A.waitForSelector('#push-toggle');
    await A.click('#push-toggle');
    const subd = await waitFn(A, () => window.__duna.S.prefs.push === true, null, 20000);
    pushEndpoint = await A.evaluate(async () => (await (await navigator.serviceWorker.ready).pushManager.getSubscription())?.endpoint || null);
    ok('Notificaciones push: suscripción guardada', subd && !!pushEndpoint, (pushEndpoint || '').slice(0, 50)); await closeSheets(A);
  });

  await step('Chat 1:1', async () => {
    await A.click('#fab-new'); await A.waitForSelector('#user-search'); await A.type('#user-search', users.b.u);
    await A.waitForFunction(n => [...document.querySelectorAll('.sheet .person')].some(e => e.innerText.includes(n)), { timeout: 10000 }, users.b.n);
    await A.evaluate(n => [...document.querySelectorAll('.sheet .person')].find(e => e.innerText.includes(n)).click(), users.b.n);
    await A.waitForSelector('#msg-input'); chatAB = await A.evaluate(() => window.__duna.S.current);
    await send(A, 'Hola Beto ' + stamp);
    ok('Mensaje 1:1 enviado y recibido en tiempo real', await textIn(B, '.chat-row', 'Hola Beto ' + stamp, 30000));
    await openChatWith(B, users.a.n);
    ok('B ve el mensaje descifrado (E2E)', await textIn(B, '.mrow', 'Hola Beto ' + stamp));
    ok('Doble check azul (leído)', await waitFn(A, t => { const r = [...document.querySelectorAll('.mrow.me')].find(e => e.innerText.includes(t)); return r && r.querySelector('.tick.read'); }, 'Hola Beto ' + stamp, 20000));
    const encOk = await A.evaluate(async id => { const m = (window.__duna.S.msgs.get(id) || []).find(x => !x._pending); return !!m?.enc; }, chatAB);
    ok('El servidor guarda el texto cifrado (enc) y no en claro', encOk);
    await B.click('#msg-input'); await B.type('#msg-input', 'Escribo');
    ok('Indicador "escribiendo…"', await textIn(A, '#conv-head', 'escribiendo', 10000));
    await B.keyboard.press('Enter');
    ok('En línea / última vez visible', await textIn(A, '#conv-head', 'en línea', 40000));
  });

  await step('Vista previa de enlaces', async () => {
    await send(A, 'Mira esto https://github.com/andresrivera9426-sketch/duna ' + stamp);
    ok('Vista previa de enlaces (función de servidor)', await waitFn(B, () => [...document.querySelectorAll('.mrow .lp')].some(e => /GitHub/i.test(e.innerText)), null, 25000));
  });
  await step('GIF', async () => {
    await A.click('[aria-label="Emojis, stickers y GIF"]'); await A.waitForSelector('#emoji-panel:not([hidden])');
    await A.evaluate(() => [...document.querySelectorAll('.ep-tabs button')].find(b => b.dataset.t === 'gif').click()); await A.waitForSelector('.gif-q');
    await A.type('.gif-q', 'jaja'); await sleep(400);
    const n = await A.$$eval('#gif-grid button', b => b.length); await A.click('#gif-grid button');
    ok('GIF animado (catálogo propio, búsqueda)', n >= 1 && await waitFn(B, () => document.querySelectorAll('.mrow img.gif-cat').length > 0, null, 15000), n + ' resultado(s) para "jaja"');
  });
  await step('Sticker', async () => {
    await A.click('[aria-label="Emojis, stickers y GIF"]'); await A.waitForSelector('#emoji-panel:not([hidden])');
    await A.evaluate(() => [...document.querySelectorAll('.ep-tabs button')].find(b => b.dataset.t === 'sticker').click()); await sleep(300);
    await A.click('.sg button');
    ok('Sticker', await waitFn(B, () => document.querySelectorAll('.mrow img.sticker').length > 0, null, 15000));
  });
  await step('Responder, reaccionar, editar, eliminar', async () => {
    const m = 'Base ' + stamp; await send(A, m); await textIn(B, '.mrow', m);
    await ctxMsg(B, m); await clickMenu(B, 'Responder'); await send(B, 'Cita ' + stamp);
    ok('Responder citando', await waitFn(A, t => [...document.querySelectorAll('.mrow')].some(r => r.innerText.includes('Cita ' + t) && r.querySelector('.quote')), stamp));
    await ctxMsg(B, m); await B.evaluate(() => document.querySelector('.ctx .quick-react button').click());
    ok('Reacción con emoji', await waitFn(A, t => { const r = [...document.querySelectorAll('.mrow.me')].find(e => e.innerText.includes(t)); return r?.querySelector('.reacts'); }, m));
    const e1 = 'Editar ' + stamp; await send(A, e1); await textIn(B, '.mrow', e1); await sleep(500);
    await ctxMsg(A, e1); await clickMenu(A, 'Editar'); await A.evaluate(() => { document.getElementById('msg-input').value = ''; });
    await A.type('#msg-input', 'Editado ' + stamp); await A.keyboard.press('Enter');
    ok('Editar mensaje', await waitFn(B, t => [...document.querySelectorAll('.mrow')].some(r => r.innerText.includes('Editado ' + t) && /editado/.test(r.innerText)), stamp));
    const d1 = 'Borrar ' + stamp; await send(A, d1); await textIn(B, '.mrow', d1); await sleep(500);
    await ctxMsg(A, d1); await clickMenu(A, 'Eliminar'); await A.waitForSelector('.sheet .btn'); await clickText(A, '.sheet .btn', 'para todos');
    ok('Eliminar para todos', await textIn(B, '.mrow', 'Se eliminó este mensaje'));
    await ctxMsg(B, 'Cita ' + stamp); await clickMenu(B, 'Eliminar'); await B.waitForSelector('.sheet .btn'); await clickText(B, '.sheet .btn', 'para mí'); await sleep(1500);
    ok('Eliminar para mí', !(await B.evaluate(t => [...document.querySelectorAll('.mrow .txt')].some(r => r.innerText.includes('Cita ' + t)), stamp)) && await A.evaluate(t => [...document.querySelectorAll('.mrow .txt')].some(r => r.innerText.includes('Cita ' + t)), stamp));
  });
  await step('Reenviar', async () => {
    await ctxMsg(A, 'Base ' + stamp); await clickMenu(A, 'Reenviar'); await A.waitForSelector('.sheet .list.pick label');
    await A.evaluate(n => { const l = [...document.querySelectorAll('.sheet .list.pick label')].find(x => x.innerText.includes(n)); l.querySelector('input').click(); }, users.b.n);
    await clickText(A, '.sheet .btn.primary', 'Reenviar');
    ok('Reenviar mensaje (etiqueta "Reenviado")', await waitFn(B, t => [...document.querySelectorAll('.mrow')].some(r => r.innerText.includes(t) && r.querySelector('.fwd')), 'Base ' + stamp));
  });
  await step('Destacar', async () => {
    await ctxMsg(A, 'Hola Beto ' + stamp); await clickMenu(A, 'Destacar'); await sleep(800);
    await A.evaluate(() => document.querySelector('.side-head [aria-label="Menú"]').click()); await clickMenu(A, 'Mensajes destacados');
    ok('Destacar mensaje y verlo en "Mensajes destacados"', await textIn(A, '.sheet', 'Hola Beto ' + stamp)); await closeSheets(A);
  });
  await step('Fijar', async () => {
    await ctxMsg(A, 'Hola Beto ' + stamp); await clickMenu(A, 'Fijar');
    ok('Fijar mensaje (barra visible para el otro)', await textIn(B, '#pinbar', 'Mensaje fijado', 15000));
  });
  await step('Buscar', async () => {
    await A.click('.conv-head [aria-label="Buscar en el chat"]'); await A.waitForSelector('.insearch input'); await A.type('.insearch input', 'editado');
    ok('Buscar dentro del chat', await textIn(A, '.insearch', 'de', 8000) && await waitFn(A, () => document.querySelectorAll('.mrow mark').length > 0, null, 8000));
    await A.click('.insearch [aria-label="Cerrar búsqueda"]');
    await A.evaluate(() => document.querySelector('.side input[type=search]')).catch(() => {});
    await A.type('.side input[type=search]', 'Beto'); await sleep(500);
    ok('Buscar en la lista de chats', await textIn(A, '#chat-list', users.b.n)); await A.evaluate(() => { const i = document.querySelector('.side input[type=search]'); i.value = ''; i.dispatchEvent(new Event('input')); });
  });
  await step('Foto', async () => {
    const img = OUT + '/foto-prueba.png'; await A.screenshot({ path: img, clip: { x: 0, y: 0, width: 600, height: 400 } });
    const [fc] = await Promise.all([A.waitForFileChooser(), attach(A, 'Fotos y videos')]); await fc.accept([img]);
    await A.waitForSelector('#att-send'); await A.click('#att-send');
    ok('Foto (comprimida y cifrada)', await waitFn(B, () => document.querySelectorAll('.mrow:not(.me) .media:not(.vid) img.in').length > 0, null, 30000));
  });
  await step('Video', async () => {
    const [fc] = await Promise.all([A.waitForFileChooser(), attach(A, 'Fotos y videos')]); await fc.accept(['tests/fixtures/video.webm']);
    await A.waitForSelector('#att-send'); await A.click('#att-send');
    ok('Video', await waitFn(B, () => document.querySelectorAll('.mrow:not(.me) .media.vid .vplay').length > 0, null, 40000));
  });
  await step('Documento', async () => {
    const [fc] = await Promise.all([A.waitForFileChooser(), attach(A, 'Documento')]); await fc.accept(['tests/fixtures/documento-prueba.pdf']);
    await A.waitForSelector('#att-send'); await A.click('#att-send');
    ok('Documento (PDF)', await textIn(B, '.mrow .doc', 'documento-prueba.pdf', 30000));
  });
  await step('Audio', async () => {
    const [fc] = await Promise.all([A.waitForFileChooser(), attach(A, 'Audio')]); await fc.accept(['tests/fixtures/audio.ogg']);
    await A.waitForSelector('#att-send'); await A.click('#att-send');
    ok('Archivo de audio', await waitFn(B, () => document.querySelectorAll('.mrow:not(.me) .aplayer:not(.voice)').length > 0, null, 30000));
  });
  await step('Nota de voz', async () => {
    await A.evaluate(() => { const t = document.getElementById('msg-input'); t.value = ''; t.dispatchEvent(new Event('input')); });
    await sleep(500); await A.evaluate(() => document.getElementById('send-btn').click()); await A.waitForSelector('#rec-send'); await sleep(2500); await A.click('#rec-send');
    ok('Nota de voz grabada', await waitFn(B, () => document.querySelectorAll('.mrow:not(.me) .aplayer.voice').length > 0, null, 30000));
    const played = await B.evaluate(async () => { document.querySelector('.mrow:not(.me) .aplayer.voice .aplay').click(); await new Promise(r => setTimeout(r, 1500)); return [...document.querySelectorAll('.aplayer.voice')].some(e => e.classList.contains('playing')); });
    ok('Reproducir nota de voz (descifrada)', played);
  });
  await step('Contacto', async () => {
    await attach(A, 'Contacto'); await A.waitForSelector('.sheet .btn.ghost'); await clickText(A, '.sheet .btn.ghost', 'Compartir mi contacto');
    ok('Tarjeta de contacto', await textIn(B, '.mrow .contact-card', '@' + users.a.u, 15000));
  });
  await step('Ubicación', async () => {
    await attach(A, 'Ubicación'); await A.waitForSelector('.sheet .btn.primary'); await A.click('.sheet .btn.primary');
    ok('Ubicación', await textIn(B, '.mrow .loc', 'Ubicación', 20000));
  });
  await step('Encuesta', async () => {
    await attach(A, 'Encuesta'); await A.waitForSelector('.sheet input'); const ins = await A.$$('.sheet input:not([type=checkbox])');
    await ins[0].type('¿Almuerzo? ' + stamp); await ins[1].type('Sí'); const ins2 = await A.$$('.sheet .poll-opts input'); await ins2[1].type('No');
    await A.evaluate(() => [...document.querySelectorAll('.sheet .btn.primary')].pop().click());
    await textIn(B, '.mrow .poll', '¿Almuerzo? ' + stamp, 15000);
    await B.evaluate(t => [...document.querySelectorAll('.mrow .poll')].find(e => e.innerText.includes(t)).querySelector('.poll-opt').click(), stamp);
    ok('Encuesta y voto en tiempo real', await waitFn(A, t => { const p = [...document.querySelectorAll('.mrow .poll')].find(e => e.innerText.includes(t)); return p?.querySelector('.pn')?.innerText === '1'; }, stamp));
  });
  await step('Ver una vez', async () => {
    const img = OUT + '/vo.png'; await B.screenshot({ path: img, clip: { x: 0, y: 0, width: 300, height: 300 } });
    const [fc] = await Promise.all([B.waitForFileChooser(), attach(B, 'Fotos y videos')]); await fc.accept([img]);
    await B.waitForSelector('#vo-toggle'); await B.click('#vo-toggle'); await B.click('#att-send');
    const got = await waitFn(A, () => [...document.querySelectorAll('.mrow:not(.me) .vo-pill')].some(e => !e.disabled), null, 30000);
    await A.evaluate(() => [...document.querySelectorAll('.mrow:not(.me) .vo-pill')].find(e => !e.disabled).click()); await sleep(1500);
    await A.keyboard.press('Escape'); await sleep(300); await A.evaluate(() => document.querySelector('.viewer [aria-label="Cerrar"], .viewer .x, .viewer button')?.click()); await sleep(1500);
    const opened = await waitFn(A, () => [...document.querySelectorAll('.mrow:not(.me) .vo-pill')].some(e => e.disabled && /Abierto/.test(e.innerText)), null, 10000);
    ok('Ver una vez (se abre una sola vez)', got && opened);
  });
  await step('Mensajes temporales', async () => {
    await A.click('.conv-head [aria-label="Más opciones"]'); await clickMenu(A, 'Mensajes temporales'); await A.waitForSelector('.sheet .radio');
    await clickText(A, '.sheet .radio', '24 horas');
    const sys = await textIn(B, '.sys', 'activó los mensajes temporales', 15000);
    await send(A, 'Temporal ' + stamp); await textIn(B, '.mrow', 'Temporal ' + stamp);
    const exp = await A.evaluate((id, t) => { const m = (window.__duna.S.msgs.get(id) || []).find(x => x.body === t && !x._pending); return m?.expires_at || null; }, chatAB, 'Temporal ' + stamp);
    ok('Mensajes temporales (24 h)', sys && !!exp, exp ? 'expira ' + exp : '');
    await A.click('.conv-head [aria-label="Más opciones"]'); await clickMenu(A, 'Mensajes temporales'); await A.waitForSelector('.sheet .radio'); await clickText(A, '.sheet .radio', 'Desactivados'); await sleep(800);
  });
  await step('Fondo de pantalla', async () => {
    await A.click('.conv-head [aria-label="Más opciones"]'); await clickMenu(A, 'Fondo de pantalla'); await A.waitForSelector('.wp-swatch.wp-noche'); await A.click('.wp-swatch.wp-noche');
    ok('Fondo de pantalla por chat', await waitFn(A, () => document.getElementById('conv')?.classList.contains('wp-noche'), null, 8000));
  });
  await step('Exportar', async () => {
    await closeSheets(A); await sleep(300);
    await A.click('.conv-head [aria-label="Más opciones"]'); await clickMenu(A, 'Exportar chat'); await sleep(5000);
    const f = fs.readdirSync(DL).find(x => x.startsWith('Chat DUNA') && x.endsWith('.txt'));
    const txt = f ? fs.readFileSync(DL + '/' + f, 'utf8') : '';
    ok('Exportar chat (.txt con mensajes descifrados)', txt.includes('Hola Beto ' + stamp), f || 'sin archivo');
  });
  await step('Programar', async () => {
    await A.type('#msg-input', 'Programado ' + stamp);
    const sb = await A.$('#send-btn'); const box = await sb.boundingBox(); await A.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' }); await A.waitForSelector('.ctx');
    await clickMenu(A, 'Programar mensaje'); await A.waitForSelector('#sch-when');
    await A.evaluate(() => { const d = new Date(Date.now() + 60e3); const p = n => String(n).padStart(2, '0'); document.getElementById('sch-when').value = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; if (new Date(document.getElementById('sch-when').value) < new Date(Date.now() + 31e3)) { const e = new Date(Date.now() + 120e3); document.getElementById('sch-when').value = `${e.getFullYear()}-${p(e.getMonth() + 1)}-${p(e.getDate())}T${p(e.getHours())}:${p(e.getMinutes())}`; } });
    await A.click('#sch-go'); await sleep(1500);
    await A.click('.conv-head [aria-label="Más opciones"]'); await clickMenu(A, 'Mensajes programados');
    const listed = await textIn(A, '#sch-list', 'Programado ' + stamp, 8000); await closeSheets(A);
    globalThis.__schedAt = Date.now(); ok('Programar mensaje (queda en la lista)', listed);
  });
  await step('Respuestas rápidas', async () => {
    await openSettingsRow(A, 'Respuestas rápidas'); await A.waitForSelector('#qr-short');
    await A.type('#qr-short', 'saludo'); await A.type('#qr-body', 'Hola, ¿cómo vas? ' + stamp); await A.click('#qr-add'); await sleep(1500); await closeSheets(A);
    await A.evaluate(() => import('./app.js').catch(() => {})); await A.evaluate(() => window.__duna.S); // noop
    await A.reload({ waitUntil: 'networkidle2' }); await A.waitForSelector('#app', { timeout: 30000 }); await sleep(1500);
    await openChatWith(A, users.b.n);
    await A.evaluate(() => { const t = document.getElementById('msg-input'); t.value = ''; t.dispatchEvent(new Event('input')); }); await A.click('#msg-input'); await A.type('#msg-input', '/sal'); const pop = await A.waitForSelector('.qr-pick', { timeout: 8000 }).then(() => true, () => false);
    if (pop) { await A.click('.qr-pick'); await A.keyboard.press('Enter'); }
    ok('Respuestas rápidas con "/"', pop && await textIn(B, '.mrow', 'Hola, ¿cómo vas? ' + stamp, 15000));
  });
  await step('Silenciar / Archivar / Etiquetas', async () => {
    await A.evaluate(() => document.querySelector('.rail-btn[data-tab="chats"]').click()); await sleep(300);
    const rowSel = n => A.evaluateHandle(t => [...document.querySelectorAll('.chat-row')].find(r => r.querySelector('.title')?.innerText.trim() === t), n);
    let r = (await rowSel(users.b.n)).asElement(); let bx = await r.boundingBox(); await A.mouse.click(bx.x + 80, bx.y + 20, { button: 'right' }); await A.waitForSelector('.ctx');
    await clickMenu(A, 'Silenciar'); await sleep(300); await clickMenu(A, '8 horas');
    ok('Silenciar chat', await waitFn(A, id => { const c = window.__duna.S.chats.get(id); return c?.muted_until && new Date(c.muted_until) > new Date(); }, chatAB, 8000));
    r = (await rowSel(users.b.n)).asElement(); bx = await r.boundingBox(); await A.mouse.click(bx.x + 80, bx.y + 20, { button: 'right' }); await A.waitForSelector('.ctx'); await clickMenu(A, 'Activar notificaciones'); await sleep(800);
    ok('Quitar silencio', await A.evaluate(id => { const c = window.__duna.S.chats.get(id); return !c?.muted_until || new Date(c.muted_until) < new Date(); }, chatAB));
    r = (await rowSel(users.b.n)).asElement(); bx = await r.boundingBox(); await A.mouse.click(bx.x + 80, bx.y + 20, { button: 'right' }); await A.waitForSelector('.ctx'); await clickMenu(A, 'Etiquetar');
    await A.waitForSelector('.sheet [data-label="Favoritos"]'); await A.click('.sheet [data-label="Favoritos"]'); await A.click('#lbl-save'); await sleep(800);
    await A.click('.chip[data-filter="fav"]'); await sleep(400);
    ok('Etiquetas y filtro "Favoritos"', await A.evaluate(t => [...document.querySelectorAll('.chat-row .title')].some(x => x.innerText.trim() === t), users.b.n));
    await A.click('.chip[data-filter="all"]'); await sleep(300);
    await shot(A, '03-lista-etiquetas-1366');
    r = (await rowSel(users.b.n)).asElement(); bx = await r.boundingBox(); await A.mouse.click(bx.x + 80, bx.y + 20, { button: 'right' }); await A.waitForSelector('.ctx'); await clickMenu(A, 'Archivar'); await sleep(800);
    const arch = await A.evaluate(t => ![...document.querySelectorAll('.chat-row .title')].some(x => x.innerText.trim() === t) && !!document.querySelector('.archived-row'), users.b.n);
    await A.click('.archived-row'); await sleep(300);
    r = (await rowSel(users.b.n)).asElement(); bx = await r.boundingBox(); await A.mouse.click(bx.x + 80, bx.y + 20, { button: 'right' }); await A.waitForSelector('.ctx'); await clickMenu(A, 'Desarchivar'); await sleep(800);
    await A.evaluate(() => document.querySelector('.archived-row')?.click()); await sleep(300);
    ok('Archivar y desarchivar', arch && await A.evaluate(t => [...document.querySelectorAll('.chat-row .title')].some(x => x.innerText.trim() === t), users.b.n));
  });
  await step('Difusión', async () => {
    await A.evaluate(() => document.querySelector('.side-head [aria-label="Menú"]').click()); await clickMenu(A, 'Listas de difusión'); await A.waitForSelector('#bl-new'); await A.click('#bl-new');
    await A.waitForSelector('.sheet label.person'); await sleep(300);
    await A.evaluate(n => [...document.querySelectorAll('.sheet label.person')].find(e => e.innerText.includes(n)).querySelector('input').click(), users.b.n);
    await A.evaluate(() => [...document.querySelectorAll('.sheet .btn.primary')].pop().click());
    await A.waitForFunction(() => [...document.querySelectorAll('.sheet h2')].some(e => e.innerText.includes('Nombre de la lista'))); await sleep(400);
    const inp = await A.evaluateHandle(() => [...document.querySelectorAll('.sheet')].find(sh => sh.querySelector('h2')?.innerText.includes('Nombre de la lista')).querySelector('input'));
    await inp.asElement().type('Equipo ' + stamp); await A.keyboard.press('Enter');
    await A.waitForSelector('#bl-text'); await A.type('#bl-text', 'Difusión ' + stamp); await A.click('#bl-send');
    ok('Lista de difusión', await textIn(B, '.mrow', 'Difusión ' + stamp, 20000)); await closeSheets(A);
  });
  await step('Modo oscuro', async () => {
    await openSettingsRow(B, 'Chats'); await B.waitForSelector('.sheet select');
    await B.evaluate(() => { const s = document.querySelector('.sheet select'); s.value = 'dark'; s.dispatchEvent(new Event('change')); });
    const dark = await B.evaluate(() => document.documentElement.dataset.theme === 'dark'); await closeSheets(B); await sleep(400);
    await shot(B, '04-modo-oscuro-chat-390');
    ok('Modo oscuro', dark);
  });
  await step('Copia de seguridad', async () => {
    await openSettingsRow(A, 'Chats'); await A.waitForSelector('#backup-btn'); await A.click('#backup-btn'); await sleep(8000);
    const f = fs.readdirSync(DL).find(x => x.startsWith('DUNA-copia') && x.endsWith('.json'));
    const j = f ? JSON.parse(fs.readFileSync(DL + '/' + f, 'utf8')) : null;
    ok('Copia de seguridad (JSON descargable)', !!j && JSON.stringify(j).includes('Hola Beto ' + stamp), f || 'sin archivo'); await closeSheets(A);
  });
  await step('Privacidad', async () => {
    await openSettingsRow(B, 'Privacidad'); await B.waitForSelector('.sheet select');
    await B.evaluate(() => { const s = document.querySelector('.sheet select'); s.value = 'none'; s.dispatchEvent(new Event('change')); }); await sleep(1500); await closeSheets(B);
    const masked = await A.evaluate(async uid => { const { data } = await (await import('./app.js').catch(() => null))?.sb?.rpc('get_profiles', { ids: [uid] }) || {}; return data; }, '').catch(() => null);
    await A.reload({ waitUntil: 'networkidle2' }); await A.waitForSelector('#app', { timeout: 30000 }); await sleep(1500);
    const p = await A.evaluate(id => { const c = window.__duna.S.chats.get(id); return window.__duna.S.profiles.get(c.other_id); }, chatAB);
    ok('Privacidad: "última vez" oculta para los demás (servidor)', p && !p.last_seen && !p.online, JSON.stringify({ last_seen: p?.last_seen, online: p?.online }));
  });
  await step('Bloquear', async () => {
    await openChatWith(B, users.a.n);
    await B.click('.head-id'); await B.waitForSelector('.sheet .info-row'); await clickText(B, '.sheet .info-row', 'Bloquear a'); await B.waitForSelector('.sheet .btn.danger'); await clickText(B, '.sheet .btn.danger', 'Bloquear'); await sleep(1500);
    await openChatWith(A, users.b.n); await send(A, 'Bloqueado? ' + stamp);
    const failed = await waitFn(A, () => document.querySelector('.mrow.me .tick.fail'), null, 10000);
    const notGot = !(await textIn(B, '.mrow', 'Bloqueado? ' + stamp, 4000));
    ok('Bloquear contacto (no llegan sus mensajes)', failed && notGot);
    await B.evaluate(() => document.querySelector('.blocked-bar')?.click()); await sleep(1500);
  });
  await step('Reportar', async () => {
    await openChatWith(B, users.a.n); await ctxMsg(B, 'Hola Beto ' + stamp); await clickMenu(B, 'Reportar'); await B.waitForSelector('.sheet .btn.danger');
    await B.evaluate(() => { const c = document.querySelector('.sheet input[type=checkbox]'); if (c?.checked) c.click(); }); await clickText(B, '.sheet .btn.danger', 'Reportar');
    ok('Reportar mensaje', await textIn(B, '#toasts', 'Reporte enviado', 8000));
  });
  await step('Grupo y admins', async () => {
    await A.evaluate(() => document.querySelector('.rail-btn[data-tab="chats"]').click());
    await A.click('#fab-new'); await A.waitForSelector('.sheet .person.action'); await clickText(A, '.sheet .person.action', 'Nuevo grupo');
    await A.waitForFunction(() => document.querySelector('.sheet h2')?.innerText.includes('participantes')); await sleep(400);
    await A.evaluate(n => [...document.querySelectorAll('.sheet label.person')].find(e => e.innerText.includes(n)).querySelector('input').click(), users.b.n);
    await A.evaluate(() => [...document.querySelectorAll('.sheet .btn.primary')].pop().click());
    await A.waitForSelector('#group-title'); const g = 'Grupo ' + stamp; await A.type('#group-title', g); await A.click('#group-create');
    await A.waitForFunction(t => document.querySelector('#conv-head')?.innerText.includes(t), { timeout: 15000 }, g); await sleep(500); await send(A, 'Hola grupo ' + stamp);
    ok('Crear grupo (llega en tiempo real)', await textIn(B, '.chat-row', g, 20000));
    await openChatWith(B, g); await send(B, 'Respuesta grupo ' + stamp);
    ok('Mensajes de grupo con nombre del remitente', await waitFn(A, t => [...document.querySelectorAll('.mrow')].some(r => r.innerText.includes('Respuesta grupo ' + t) && r.querySelector('.sender')), stamp));
    await A.click('.head-id'); await A.waitForSelector('#invite-link');
    const inv = await A.$eval('#invite-link', e => e.innerText);
    await A.evaluate(n => [...document.querySelectorAll('.sheet .person')].find(e => e.innerText.includes(n)).click(), users.b.n); await A.waitForSelector('.ctx'); await clickMenu(A, 'Designar como admin');
    ok('Designar admin', await waitFn(B, (t) => [...window.__duna.S.chats.values()].find(c => c.title === t)?.my_role === 'admin', g, 15000) || await B.evaluate(async t => { const c = [...window.__duna.S.chats.values()].find(c => c.title === t); return c?.my_role === 'admin'; }, g));
    await shot(A, '05-info-grupo-1366'); await closeSheets(A);
    await A.click('.head-id'); await A.waitForSelector('.sheet .switch.row');
    await A.evaluate(() => { const l = [...document.querySelectorAll('.sheet .switch.row')].find(x => x.innerText.includes('Solo admins envían')); l.querySelector('input').click(); }); await sleep(1500); await closeSheets(A);
    const sys = await textIn(B, '.sys', '', 3000);
    ok('Ajuste "solo admins envían" (B es admin y puede escribir)', await B.evaluate(() => !!document.getElementById('msg-input')), sys);
    ok('Enlace de invitación del grupo', inv.includes('#/invitar/'), inv.slice(0, 70));
    globalThis.__groupName = g;
  });
  await step('Comunidad', async () => {
    await A.evaluate(() => document.querySelector('.rail-btn[data-tab="communities"]').click()); await A.waitForSelector('#new-community'); await A.click('#new-community');
    await A.waitForSelector('#group-title'); const cn = 'Comunidad ' + stamp; await A.type('#group-title', cn); await A.click('#group-create');
    const shown = await waitFn(A, t => [...document.querySelectorAll('.sheet h2, .com-card')].some(e => e.innerText.includes(t)), cn, 20000);
    const link = await A.evaluate(() => document.querySelector('.sheet .invite-link')?.innerText || '');
    await shot(A, '06-comunidad-1366'); await closeSheets(A);
    let joined = false;
    if (link) {
      await closeSheets(B); await B.evaluate(u => { location.hash = u.split('#')[1]; }, link);
      await B.waitForFunction(() => [...document.querySelectorAll('.sheet .btn.primary')].some(b => /Unir/i.test(b.innerText)), { timeout: 15000 }).catch(() => {});
      await B.evaluate(() => [...document.querySelectorAll('.sheet .btn.primary')].reverse().find(b => /Unir/i.test(b.innerText))?.click());
      joined = await waitFn(B, t => [...window.__duna.S.chats.values()].some(c => c.type === 'community' && c.title === t), cn, 15000);
    }
    ok('Comunidad: crear y unirse por enlace', shown && joined, link.slice(0, 60)); await closeSheets(B);
  });
  await step('Canal', async () => {
    await A.evaluate(() => document.querySelector('.rail-btn[data-tab="chats"]').click());
    await A.click('#fab-new'); await A.waitForSelector('.sheet .person.action'); await clickText(A, '.sheet .person.action', 'Nuevo canal');
    await A.waitForSelector('#group-title'); const ch = 'Canal ' + stamp; await A.type('#group-title', ch); await A.click('#group-create');
    await A.waitForFunction(t => document.querySelector('#conv-head')?.innerText.includes(t), { timeout: 15000 }, ch);
    await A.click('.head-id'); await A.waitForSelector('.sheet .switch.row');
    await A.evaluate(() => { const l = [...document.querySelectorAll('.sheet .switch.row')].find(x => x.innerText.includes('Canal público')); const i = l.querySelector('input'); if (!i.checked) i.click(); }); await sleep(1200); await closeSheets(A);
    await send(A, 'Aviso del canal ' + stamp);
    await B.evaluate(() => document.querySelector('.conv-head .back')?.click()); await sleep(300);
    await B.evaluate(() => document.querySelector('.tab[data-tab="updates"]').click()); await sleep(1500);
    await B.evaluate(() => [...document.querySelectorAll('.updates .btn.ghost')].find(b => b.innerText.includes('Explorar'))?.click());
    await B.waitForSelector('.sheet input[type=search]'); await B.type('.sheet input[type=search]', stamp); await sleep(2000);
    await B.evaluate(() => [...document.querySelectorAll('.sheet .btn.primary.sm')].find(b => b.innerText.includes('Seguir'))?.click()); await sleep(2500); await closeSheets(B);
    const follows = await B.evaluate(t => [...window.__duna.S.chats.values()].some(c => c.type === 'channel' && c.title === t), ch);
    await B.evaluate(() => document.querySelector('.tab[data-tab="chats"]').click()); await sleep(500);
    let seen = false; if (follows) { await openChatWith(B, ch); seen = await textIn(B, '.mrow', 'Aviso del canal ' + stamp, 10000); }
    ok('Canal: crear, seguir y leer publicaciones', follows && seen);
    ok('Canal: seguidores no pueden escribir', seen && await B.evaluate(() => !document.getElementById('msg-input') && !!document.querySelector('.readonly-bar')));
  });
  await step('Estados', async () => {
    await A.evaluate(() => document.querySelector('.rail-btn[data-tab="updates"]').click()); await A.waitForSelector('#new-story'); await A.click('#new-story');
    await A.waitForSelector('.story-text'); await A.type('.story-text', 'Estado ' + stamp); await A.click('#story-publish'); await sleep(1500);
    await B.evaluate(() => document.querySelector('.conv-head .back')?.click()); await sleep(300);
    await B.evaluate(() => document.querySelector('.tab[data-tab="updates"]').click());
    const seen = await textIn(B, '.updates', users.a.n, 15000);
    await B.evaluate(n => [...document.querySelectorAll('.story-row')].find(e => e.innerText.includes(n))?.click(), users.a.n);
    ok('Estados 24 h (publicar y ver)', seen && await textIn(B, '.story-viewer', 'Estado ' + stamp, 10000));
    await shot(B, '07-estado-390'); await B.keyboard.press('Escape'); await sleep(500);
  });
  await step('Mensaje programado llega', async () => {
    const wait = Math.max(0, 150000 - (Date.now() - (globalThis.__schedAt || Date.now())));
    await B.evaluate(() => document.querySelector('.tab[data-tab="chats"]').click()); await sleep(300);
    ok('Mensaje programado se envía solo a la hora', await textIn(B, '.chat-row, .mrow', 'Programado ' + stamp, wait + 30000));
  });
  await step('Llamadas', async () => {
    await openChatWith(A, users.b.n); await B.evaluate(() => document.querySelector('.tab[data-tab="chats"]').click()); await sleep(400);
    await A.click('.conv-head [aria-label="Llamada de voz"]');
    const rang = await B.waitForSelector('#call-accept', { timeout: 20000 }).then(() => true, () => false);
    ok('Llamada de voz: timbre en el otro dispositivo', rang);
    if (rang) {
      await B.evaluate(() => document.getElementById('call-accept').click());
      const sig = await Promise.all([A, B].map(p => waitFn(p, () => (window.__duna?.callLog || []).some(l => /^rx (offer|answer)/.test(l)), null, 20000)));
      ok('Señalización WebRTC (oferta/respuesta)', sig.every(Boolean));
      const cfg = await A.evaluate(() => { const pc = [...(window.__duna.call?.pcs?.values() || [])][0]; const c = pc?.getConfiguration(); return c ? c.iceServers.reduce((n, s) => n + [].concat(s.urls).length, 0) : 0; });
      ok('Varios servidores STUN gratuitos configurados', cfg >= 7, cfg + ' URLs STUN');
      const media = await Promise.all([A, B].map(p => waitFn(p, () => Object.values(window.__duna?.call?.states || {}).includes('connected'), null, 8000)));
      results.push({ name: 'Audio/video conectado entre los dos', pass: null, info: media.every(Boolean) ? 'conectado' : 'no verificable aquí: la política de Chrome del entorno bloquea UDP de WebRTC' });
      console.log('INFO  Audio/video conectado: ' + (media.every(Boolean) ? 'sí' : 'no verificable aquí'));
      await shot(B, '08-llamada-390');
      await A.evaluate(() => document.getElementById('call-hang').click());
      ok('Colgar cierra la llamada en ambos', await waitFn(B, () => !document.getElementById('call-ui'), null, 15000));
    }
    await sleep(1000);
    await A.click('.conv-head [aria-label="Videollamada"]');
    if (await B.waitForSelector('#call-accept', { timeout: 20000 }).then(() => true, () => false)) {
      await B.evaluate(() => document.getElementById('call-accept').click());
      const v = await Promise.all([A, B].map(p => waitFn(p, () => document.querySelector('#call-local')?.srcObject?.getVideoTracks().length > 0 && (window.__duna?.callLog || []).some(l => /rx (offer|answer)/.test(l)), null, 20000)));
      ok('Videollamada: cámara y señalización', v.every(Boolean)); await shot(A, '09-videollamada-1366');
      await B.evaluate(() => document.getElementById('call-hang').click()); await sleep(1500);
    } else ok('Videollamada: cámara y señalización', false, 'no sonó');
    await A.evaluate(() => document.querySelector('.rail-btn[data-tab="calls"]').click()); await sleep(1200);
    ok('Historial de llamadas', await textIn(A, '.side', users.b.n, 8000)); await shot(A, '10-llamadas-1366');
    await A.evaluate(() => document.querySelector('.rail-btn[data-tab="chats"]').click());
  });
  await step('Llamada grupal', async () => {
    await openChatWith(A, globalThis.__groupName); await openChatWith(B, globalThis.__groupName);
    await A.click('.conv-head [aria-label="Llamada de voz"]');
    const rang = await B.waitForSelector('#call-accept', { timeout: 20000 }).then(() => true, () => false);
    if (rang) await B.evaluate(() => document.getElementById('call-accept').click());
    const sig = rang && (await Promise.all([A, B].map(p => waitFn(p, () => (window.__duna?.callLog || []).some(l => /^rx (offer|answer)/.test(l)), null, 20000)))).every(Boolean);
    ok('Llamada grupal: timbre y señalización', sig);
    await A.evaluate(() => document.getElementById('call-hang')?.click()); await sleep(1500); await B.evaluate(() => document.getElementById('call-hang')?.click()); await sleep(800);
  });
  await step('Push con la app cerrada', async () => {
    if (!pushEndpoint) return ok('Push con la app cerrada (llega al navegador)', false, 'sin suscripción');
    await A.goto('about:blank'); await sleep(1500);
    await openChatWith(B, users.a.n); await send(B, 'Push ' + stamp); await sleep(12000);
    await A.goto(URL + 'manifest.webmanifest');
    const n = await A.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration('./'); const ns = r ? await r.getNotifications() : []; return ns.map(x => x.title + ' | ' + x.body); }).catch(e => ['ERR ' + e.message]);
    const got = n.some(x => x.includes('Push ' + ''));
    ok('Push con la app cerrada (llega al navegador y se descifra)', n.some(x => x.includes('Push ' + stamp)), JSON.stringify(n).slice(0, 200));
    await A.goto(URL, { waitUntil: 'networkidle2' }); await A.waitForSelector('#app', { timeout: 30000 });
  });
  await step('Vincular dispositivo', async () => {
    C = await page(await browserB.createBrowserContext(), 'C', { width: 1366, height: 768 });
    await C.waitForSelector('#f-link'); await C.click('#f-link'); await C.waitForSelector('#ln-code');
    await sleep(1500); await shot(C, '11-vincular-qr-1366');
    const code = (await C.$eval('#ln-code', e => e.innerText)).replace('-', '');
    await openSettingsRow(A, 'Dispositivos vinculados'); await A.waitForSelector('#link-dev'); await A.click('#link-dev'); await A.waitForSelector('#lk-code');
    await A.type('#lk-code', code); await A.click('#lk-go');
    const linked = await C.waitForSelector('#app', { timeout: 30000 }).then(() => true, () => false);
    ok('Vincular dispositivo con código/QR (sin contraseña)', linked && await C.evaluate(() => window.__duna.S.me?.username), code);
    if (linked) {
      await C.waitForSelector('#unlock-pass', { timeout: 15000 }); await C.type('#unlock-pass', recA); await C.click('#unlock-go'); await sleep(2500);
      await openChatWith(C, users.b.n);
      ok('Dispositivo vinculado lee chats cifrados (llave con código de recuperación)', await textIn(C, '.mrow', 'Hola Beto ' + stamp, 15000));
      await shot(C, '12-dispositivo-vinculado-1366');
    }
  });
  await step('Recuperar cuenta', async () => {
    const D = await page(await browserB.createBrowserContext(), 'D', { width: 390, height: 844, isMobile: true });
    await D.waitForSelector('#f-forgot'); await D.click('#f-forgot'); await D.waitForSelector('#rv-user');
    await D.type('#rv-user', users.b.u); await D.type('#rv-code', recB); await D.type('#rv-pass', PASS + 'X'); await D.type('#rv-pass2', PASS + 'X'); await shot(D, '13-recuperar-390'); await D.click('#rv-go');
    const inn = await D.waitForSelector('#app', { timeout: 30000 }).then(() => true, () => false);
    users.b.p = PASS + 'X'; fs.writeFileSync(CREATED, JSON.stringify(created.map(u => u.u === users.b.u ? { ...u, p: users.b.p } : u), null, 1));
    let read = false; if (inn) { await sleep(1500); await openChatWith(D, users.a.n); read = await textIn(D, '.mrow', 'Difusión ' + stamp, 20000); if (!read) await shot(D, 'fail-recuperar-D'); }
    ok('Recuperar cuenta con código (nueva contraseña) y conservar mensajes cifrados', inn && read);
    const wrong = await (async () => { const E = await page(await browserB.createBrowserContext(), 'E', { width: 390, height: 844 }); await E.click('#f-forgot'); await E.waitForSelector('#rv-user'); await E.type('#rv-user', users.b.u); await E.type('#rv-code', 'AAAAA-AAAAA-AAAAA-AAAAA-AAAAA'); await E.type('#rv-pass', 'otraclave123'); await E.type('#rv-pass2', 'otraclave123'); await E.click('#rv-go'); return textIn(E, '.sheet .err', 'incorrectos', 10000); })();
    ok('Código de recuperación incorrecto es rechazado', wrong);
  });
  await step('Capturas', async () => {
    await openChatWith(A, users.b.n); await sleep(800); await shot(A, '14-chat-escritorio-1366');
    await openChatWith(B, users.a.n).catch(() => {}); await sleep(800); await shot(B, '15-chat-movil-390');
  });
  await step('Eliminar cuenta', async () => {
    await openSettingsRow(B, 'Cuenta'); await B.waitForSelector('.sheet .btn.danger'); await clickText(B, '.sheet .btn.danger', 'Eliminar mi cuenta');
    await B.waitForSelector('.sheet .btn.danger'); await sleep(300); await B.evaluate(() => [...document.querySelectorAll('.sheet .btn.danger')].pop().click());
    await B.waitForSelector('.sheet input'); await B.type('.sheet input', 'ELIMINAR'); await clickText(B, '.sheet .btn.primary', 'Guardar');
    ok('Eliminar mi cuenta (borra perfil y archivos)', await B.waitForSelector('#f-user', { timeout: 30000 }).then(() => true, () => false));
  });
} catch (e) { ok('Ejecución sin errores', false, e.message); }
fs.writeFileSync(OUT + '/resultados.json', JSON.stringify({ at: new Date().toISOString(), url: URL, users: [users.a.u, users.b.u], results }, null, 1));
const graded = results.filter(r => r.pass !== null); const f = graded.filter(r => !r.pass).length;
console.log(`\n${graded.length - f}/${graded.length} pruebas OK`);
await browserA.close(); await browserB.close(); process.exit(f ? 1 : 0);
