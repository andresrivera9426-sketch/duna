// Mide tiempos reales de DUNA (registro, inicio de sesión, arranque con sesión, abrir chat, enviar/recibir).
// Uso: node tests/perf.mjs [url] [cpuThrottle]
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const URL = process.argv[2] || 'http://localhost:8088/'; const CPU = +(process.argv[3] || 1);
const CREATED = '/workspace/duna-test-created.json';
const stamp = Date.now().toString(36); const PASS = 'Duna-Prueba-2026!';
const A = { u: 'prueba_pa_' + stamp, n: 'Ana P', p: PASS }, B = { u: 'prueba_pb_' + stamp, n: 'Beto P', p: PASS };
const created = fs.existsSync(CREATED) ? JSON.parse(fs.readFileSync(CREATED)) : []; created.push(A, B); fs.writeFileSync(CREATED, JSON.stringify(created, null, 1));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const R = {};
const br = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
async function page() { const ctx = await br.createBrowserContext(); const p = await ctx.newPage(); await p.setViewport({ width: 390, height: 800 });
  if (CPU > 1) { const c = await p.createCDPSession(); await c.send('Emulation.setCPUThrottlingRate', { rate: CPU }); }
  p._reqs = 0; p.on('request', r => { if (/supabase\.co/.test(r.url())) p._reqs++; }); return p; }
const ready = p => p.waitForFunction(() => document.querySelector('#app') && window.__duna?.S?.chats && !document.querySelector('.splash'), { timeout: 90000 });
async function register(p, u) {
  await p.goto(URL, { waitUntil: 'networkidle2' }); await p.waitForSelector('#f-user'); await p.click('#f-switch'); await p.waitForSelector('#f-name');
  await p.type('#f-user', u.u); await p.type('#f-name', u.n); await p.type('#f-pass', u.p); await p.type('#f-pass2', u.p);
  const t = Date.now(); p._reqs = 0; await p.click('#f-submit'); await ready(p); return Date.now() - t;
}
async function closeRecovery(p) { await p.waitForSelector('#rc-ok', { timeout: 8000 }).then(b => b.click()).catch(() => {}); await sleep(500); await p.evaluate(() => { document.querySelectorAll('.sheet-wrap').forEach(x => x.remove()); }); }
const pa = await page(), pb = await page();
R.registro_A_ms = await register(pa, A); await closeRecovery(pa);
R.registro_B_ms = await register(pb, B); await closeRecovery(pb);
// A abre chat con B y envía un primer mensaje (crea el chat 1:1)
await pa.goto(URL + '#/u/' + B.u, { waitUntil: 'networkidle2' }); await sleep(2000);
await pa.evaluate(() => [...document.querySelectorAll('.sheet button')].find(b => /Enviar mensaje|Chatear|Mensaje/i.test(b.innerText))?.click()); await sleep(1500);
await pa.focus('#msg-input'); await pa.keyboard.type('hola inicial'); await pa.keyboard.press('Enter'); await sleep(3000);
// Login en contexto nuevo (B)
const pl = await page(); await pl.goto(URL, { waitUntil: 'networkidle2' }); await pl.waitForSelector('#f-user');
await pl.type('#f-user', B.u); await pl.type('#f-pass', B.p);
let t = Date.now(); pl._reqs = 0; await pl.click('#f-submit'); await ready(pl); R.login_ms = Date.now() - t; R.login_reqs = pl._reqs;
await pl.waitForSelector('.chat-row', { timeout: 30000 }); R.login_hasta_lista_ms = Date.now() - t;
// Arranque con sesión guardada (recarga), 3 veces
const st = [];
for (let i = 0; i < 3; i++) { t = Date.now(); pl._reqs = 0; await pl.reload({ waitUntil: 'domcontentloaded' }); await pl.waitForSelector('.chat-row', { timeout: 60000 }); st.push(Date.now() - t); R.arranque_reqs = pl._reqs; await sleep(1500); }
R.arranque_con_sesion_ms = st;
// Abrir chat
t = Date.now(); await pl.click('.chat-row'); await pl.waitForFunction(() => [...document.querySelectorAll('.bubble')].some(b => b.innerText.includes('hola inicial')), { timeout: 30000 }); R.abrir_chat_ms = Date.now() - t;
// Envío A -> B (pl tiene el chat abierto): 5 mensajes
const opt = [], conf = [], recv = [];
await pa.bringToFront();
for (let i = 0; i < 5; i++) {
  const txt = 'perf ' + i + ' ' + stamp;
  await pa.focus('#msg-input'); await pa.keyboard.type(txt);
  const t0 = Date.now();
  const recvP = pl.waitForFunction(x => [...document.querySelectorAll('.bubble')].some(b => b.innerText.includes(x)), { timeout: 30000, polling: 20 }, txt).then(() => Date.now() - t0);
  await pa.keyboard.press('Enter');
  await pa.waitForFunction(x => [...document.querySelectorAll('.bubble')].some(b => b.innerText.includes(x)), { polling: 5 }, txt); opt.push(Date.now() - t0);
  await pa.waitForFunction((x) => { const S = window.__duna.S; for (const l of S.msgs.values()) for (const m of l) if (m.body === x && !String(m.id).startsWith('tmp-')) return true; return false; }, { polling: 10, timeout: 30000 }, txt); conf.push(Date.now() - t0);
  recv.push(await recvP.catch(() => -1)); await sleep(700);
}
const med = a => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
R.envio_optimista_ms = opt; R.envio_confirmado_ms = conf; R.recepcion_otro_ms = recv;
R.mediana = { optimista: med(opt), confirmado: med(conf), recepcion: med(recv) };
R.cpu = CPU; R.url = URL;
console.log(JSON.stringify(R, null, 1));
await br.close(); process.exit(0);
