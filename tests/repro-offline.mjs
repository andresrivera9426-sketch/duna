// Reproduce: el receptor pierde la conexión un momento (cambio de red / pestaña dormida) mientras le escriben.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const URL = process.env.URL || 'https://andresrivera9426-sketch.github.io/duna/';
const stamp = Date.now().toString(36), PASS = 'Duna-Prueba-2026!';
const U = { a: { u: 'prueba_ra_' + stamp, n: 'RA ' + stamp }, b: { u: 'prueba_rb_' + stamp, n: 'RB ' + stamp } };
fs.writeFileSync('/workspace/duna-test-created.json', JSON.stringify([{ ...U.a, p: PASS }, { ...U.b, p: PASS }]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const res = []; const ok = (n, p, i = '') => { res.push({ n, p }); console.log((p ? 'OK    ' : 'FALLA ') + n + (i ? ' — ' + i : '')); };
const br = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
async function mk(vp) { const ctx = await br.createBrowserContext(); const p = await ctx.newPage(); await p.setViewport(vp);
  await p.evaluateOnNewDocument(() => { const W = window.WebSocket; window.__ws = []; window.__wsBlock = false;
    window.WebSocket = function (u, pr) { const ws = new W(window.__wsBlock ? 'wss://127.0.0.1:9/bloqueado' : u, pr); window.__ws.push(ws); return ws; };
    window.WebSocket.prototype = W.prototype; Object.assign(window.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); }); p.on('pageerror', e => console.log('PAGEERROR', e.message)); await p.goto(URL, { waitUntil: 'networkidle2' }); return p; }
async function reg(p, u) { await p.waitForSelector('#f-user'); await p.click('#f-switch'); await p.waitForSelector('#f-name'); await p.type('#f-user', u.u); await p.type('#f-name', u.n); await p.type('#f-pass', PASS); await p.type('#f-pass2', PASS); await p.click('#f-submit'); await p.waitForSelector('#rc-ok', { timeout: 40000 }); await p.click('#rc-ok'); await sleep(800); }
const has = (p, t, ms) => p.waitForFunction(t => [...document.querySelectorAll('.mrow')].some(r => r.innerText.includes(t)), { timeout: ms, polling: 300 }, t).then(() => true, () => false);
const send = async (p, t) => { await p.click('#msg-input'); await p.type('#msg-input', t); await p.keyboard.press('Enter'); };
const A = await mk({ width: 1366, height: 768 }), B = await mk({ width: 390, height: 844, isMobile: true });
await reg(A, U.a); await reg(B, U.b);
await A.click('#fab-new'); await A.waitForSelector('#user-search'); await A.type('#user-search', U.b.u);
await A.waitForFunction(n => [...document.querySelectorAll('.sheet .person')].some(e => e.innerText.includes(n)), { timeout: 10000 }, U.b.n);
await A.evaluate(n => [...document.querySelectorAll('.sheet .person')].find(e => e.innerText.includes(n)).click(), U.b.n);
await A.waitForSelector('#msg-input'); await send(A, 'uno ' + stamp);
await B.waitForFunction(t => [...document.querySelectorAll('.chat-row')].some(r => r.innerText.includes(t)), { timeout: 20000 }, U.a.n);
await B.evaluate(t => [...document.querySelectorAll('.chat-row')].find(r => r.innerText.includes(t)).click(), U.a.n);
ok('B recibe con conexión normal', await has(B, 'uno ' + stamp, 15000));
await send(B, 'respuesta ' + stamp); ok('A recibe la respuesta de B', await has(A, 'respuesta ' + stamp, 15000));
// Corte de red de 20 s en B (como cambio de Wi-Fi a datos o pestaña dormida)
await B.evaluate(() => { window.__wsBlock = true; window.__ws.forEach(w => w.close(4001, 'corte')); }); await sleep(3000);
await send(A, 'durante corte ' + stamp); await sleep(17000);
await B.evaluate(() => { window.__wsBlock = false; });
ok('Tras volver la red, B ve el mensaje enviado durante el corte (chat abierto)', await has(B, 'durante corte ' + stamp, 40000));
await send(A, 'después ' + stamp);
ok('B recibe mensajes nuevos después del corte', await has(B, 'después ' + stamp, 30000));
// Corte con B en la lista de chats (chat cerrado) → al volver debe verse no leído y A debe ver doble check gris (entregado)
await B.evaluate(() => document.querySelector('.conv-head .back')?.click()); await sleep(800);
await B.evaluate(() => { window.__wsBlock = true; window.__ws.forEach(w => w.close(4001, 'corte')); }); await sleep(2000);
await send(A, 'en lista ' + stamp); await sleep(12000); await B.evaluate(() => { window.__wsBlock = false; });
ok('B (en la lista) ve el chat con el mensaje perdido tras reconectar', await B.waitForFunction(t => [...document.querySelectorAll('.chat-row')].some(r => r.innerText.includes(t)), { timeout: 40000, polling: 300 }, 'en lista ' + stamp).then(() => true, () => false));
ok('A ve el mensaje como entregado (doble check)', await A.waitForFunction(t => { const r = [...document.querySelectorAll('.mrow.me')].find(e => e.innerText.includes(t)); return ['Entregado', 'Leído'].includes(r?.querySelector('.tick')?.title); }, { timeout: 30000, polling: 500 }, 'en lista ' + stamp).then(() => true, () => false));
// Sentido contrario: corte en A (escritorio), B envía
await B.evaluate(t => [...document.querySelectorAll('.chat-row')].find(r => r.innerText.includes(t)).click(), U.a.n); await sleep(800);
await A.evaluate(() => { window.__wsBlock = true; window.__ws.forEach(w => w.close(4001, 'corte')); }); await sleep(2000);
await send(B, 'de B en corte ' + stamp); await sleep(12000); await A.evaluate(() => { window.__wsBlock = false; });
ok('A recibe lo que B envió durante el corte de A', await has(A, 'de B en corte ' + stamp, 40000));
// Pestaña congelada (como suspensión/pestaña dormida) en B durante 40 s
const cdp = await B.createCDPSession(); await cdp.send('Page.setWebLifecycleState', { state: 'frozen' });
await send(A, 'congelada ' + stamp); await sleep(40000); await cdp.send('Page.setWebLifecycleState', { state: 'active' });
const inState = await B.waitForFunction(t => (window.__duna.S.msgs.get(window.__duna.S.current) || []).some(m => m.body === t), { timeout: 40000, polling: 500 }, 'congelada ' + stamp).then(() => true, () => false);
await B.bringToFront(); const fr = inState && await has(B, 'congelada ' + stamp, 20000); console.log('   estado B:', await B.evaluate(() => { const S = window.__duna.S; const m = S.msgs.get(S.current) || []; return JSON.stringify({ sync: window.__duna.lastSync, cur: S.current, n: m.length, last: m.slice(-2).map(x => [x.body, x._pending, x._failed]), rows: document.querySelectorAll('.mrow').length, vis: document.visibilityState }); }));
  console.log('   A:', await A.evaluate(t => { const S = window.__duna.S; const m = S.msgs.get(S.current) || []; return JSON.stringify(m.slice(-2).map(x => [x.body, x._pending, x._failed, x.id])); }));
ok('B recibe lo enviado mientras su pestaña estaba congelada', fr);
const dl = await A.evaluate(() => [...document.querySelectorAll('.mrow.me')].slice(-2).map(r => r.querySelector('.tick')?.className));
console.log('ticks en A', dl);
// Cuenta B borra; A borra
for (const p of [A, B]) { await p.evaluate(async () => { const { sb } = window.__duna; }); }
fs.writeFileSync('tests/out2/repro.json', JSON.stringify(res));
await br.close(); process.exit(res.every(r => r.p) ? 0 : 1);
