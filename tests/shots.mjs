// Capturas de pantalla (móvil y escritorio, claro y oscuro). Uso: node tests/shots.mjs <carpeta> [URL]
import puppeteer from 'puppeteer-core';
import fs from 'fs';
const OUT = process.argv[2] || 'tests/out/shots', URL = process.argv[3] || 'http://localhost:8088/';
const U = process.env.A || 'prueba_ia_a_mwehcbaf', PASS = process.env.PASS || 'Duna-Prueba-2026!';
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const br = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
const sizes = { movil: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, escritorio: { width: 1440, height: 900, deviceScaleFactor: 1 } };
for (const [name, vp] of Object.entries(sizes)) for (const theme of ['light', 'dark']) {
  const ctx = await br.createBrowserContext(); const p = await ctx.newPage(); await p.setViewport(vp);
  await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: theme }]);
  await p.goto(URL, { waitUntil: 'networkidle2' }); await p.waitForSelector('#f-user');
  if (theme === 'light') await p.screenshot({ path: `${OUT}/${name}-0-ingreso.png` });
  await p.type('#f-user', U); await p.type('#f-pass', PASS); await p.click('#f-submit');
  await p.waitForSelector('#app', { timeout: 60000 }); await sleep(2500);
  await p.evaluate(() => document.querySelectorAll('.sheet-wrap').forEach(x => x.remove()));
  await p.evaluate(t => { const S = window.__duna.S; S.prefs.theme = 'system'; document.documentElement.dataset.theme = t; }, theme); await sleep(300);
  await p.screenshot({ path: `${OUT}/${name}-${theme}-1-chats.png` });
  const direct = await p.evaluate(() => [...window.__duna.S.chats.values()].sort((a, b) => (b.last_message_at || '').localeCompare(a.last_message_at || '')).find(c => c.type === 'direct')?.id);
  await p.click(`.chat-row[data-chat="${direct}"]`); await sleep(2500);
  await p.screenshot({ path: `${OUT}/${name}-${theme}-2-chat.png` });
  const grp = await p.evaluate(() => [...window.__duna.S.chats.values()].find(c => c.type === 'group')?.id);
  if (grp) { await p.evaluate(id => { location.hash = '#/c/' + id; }, grp); await sleep(2500); await p.screenshot({ path: `${OUT}/${name}-${theme}-3-grupo.png` }); }
  await p.evaluate(() => { location.hash = '#/c/ia-duna'; }); await sleep(2000);
  await p.screenshot({ path: `${OUT}/${name}-${theme}-4-ia.png` });
  const disc = await p.$('.tabs [data-nav="discover"], .rail [data-nav="discover"]');
  if (disc) { await p.evaluate(() => { history.replaceState(null, '', location.pathname); window.dispatchEvent(new PopStateEvent('popstate')); }); await sleep(900); await p.evaluate(() => [...document.querySelectorAll('[data-nav="discover"]')].find(b => b.offsetParent)?.click()); await sleep(1500); await p.screenshot({ path: `${OUT}/${name}-${theme}-5-descubrir.png` }); }
  await ctx.close();
}
await br.close(); console.log('capturas en', OUT, fs.readdirSync(OUT).length);
