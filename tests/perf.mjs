// Mide rendimiento real (perfil móvil: Pixel 5, CPU 4x más lenta, red 4G lenta).
// Uso: node tests/perf.mjs <URL> [etiqueta]   → imprime JSON con medianas de 3 corridas.
import puppeteer, { KnownDevices } from 'puppeteer-core';
const BASE = process.argv[2] || 'http://localhost:8088/', TAG = process.argv[3] || '';
const U = process.env.A || 'prueba_ia_a_mwehcbaf', PASS = process.env.PASS || 'Duna-Prueba-2026!';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const med = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const br = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--enable-precise-memory-info'] });
const runs = [];
for (let i = 0; i < 3; i++) {
  const ctx = await br.createBrowserContext(); const p = await ctx.newPage(); await p.emulate(KnownDevices['Pixel 5']);
  const cdp = await p.createCDPSession(); await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const bytes = { js: 0, css: 0, font: 0, other: 0 }; let count = 0;
  const own = new URL(BASE).host;
  cdp.on('Network.loadingFinished', e => { const r = reqs.get(e.requestId); if (!r) return; count++; const k = /\.js(\?|$)/.test(r) ? 'js' : /\.css(\?|$)/.test(r) ? 'css' : /\.woff2?(\?|$)/.test(r) ? 'font' : 'other'; bytes[k] += e.encodedDataLength; });
  const reqs = new Map(); cdp.on('Network.requestWillBeSent', e => { if (new URL(e.request.url).host === own) reqs.set(e.requestId, e.request.url); });
  const t0 = Date.now(); await p.goto(BASE, { waitUntil: 'domcontentloaded' }); await p.waitForSelector('#f-user', { visible: true });
  const tLogin = Date.now() - t0; await sleep(1500);
  const cold = { ...bytes };
  await p.type('#f-user', U); await p.type('#f-pass', PASS);
  const t1 = Date.now(); await p.click('#f-submit'); await p.waitForSelector('.chat-row[data-chat]:not(.ia-row)', { timeout: 90000 }); const tBoot = Date.now() - t1;
  await sleep(4000);
  // Arranque con sesión guardada (como abrir la app de nuevo)
  const t2 = Date.now(); await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForSelector('.chat-row[data-chat]:not(.ia-row)', { timeout: 90000 }); const tWarm = Date.now() - t2;
  await sleep(3000);
  const id = await p.evaluate(() => [...window.__duna.S.chats.values()].find(c => c.type === 'group')?.id);
  const t3 = Date.now(); await p.tap(`.chat-row[data-chat="${id}"]`); await p.waitForSelector('#msgs .bubble', { visible: true, timeout: 60000 }); const tOpen = Date.now() - t3;
  await sleep(1500);
  const m = await p.metrics();
  runs.push({ tLogin, tBoot, tWarm, tOpen, heapMB: +(m.JSHeapUsedSize / 1048576).toFixed(1), nodes: m.Nodes, coldKB: Object.fromEntries(Object.entries(cold).map(([k, v]) => [k, +(v / 1024).toFixed(1)])), requests: count });
  await ctx.close();
}
await br.close();
const out = { tag: TAG, url: BASE, perfil: 'Pixel 5 · CPU 4x · 150 ms RTT · 1,6 Mbps', medianas: Object.fromEntries(['tLogin', 'tBoot', 'tWarm', 'tOpen', 'heapMB', 'nodes'].map(k => [k, med(runs.map(r => r[k]))])), coldKB: runs[0].coldKB, runs };
console.log(JSON.stringify(out, null, 1));
