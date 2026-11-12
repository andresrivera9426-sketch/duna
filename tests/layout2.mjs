import puppeteer from 'puppeteer-core';
const URL = process.env.URL || 'https://andresrivera9426-sketch.github.io/duna/';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
for (const vp of [{ width: 1366, height: 768 }, { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]) {
  const ctx = await b.createBrowserContext(); const p = await ctx.newPage(); await p.setViewport(vp);
  await p.goto(URL, { waitUntil: 'networkidle2' });
  await p.type('#f-user', 'prueba_ana230'); await p.type('#f-pass', 'Duna-Prueba-2026!'); await p.click('#f-submit');
  await p.waitForSelector('#app', { timeout: 30000 }); await new Promise(r => setTimeout(r, 3000));
  await p.screenshot({ path: `tests/out/lista-${vp.width}.png` });
  await p.evaluate(() => [...document.querySelectorAll('.chat-row')].find(r => r.querySelector('.title')?.innerText.trim() === 'Beto Prueba')?.click());
  await new Promise(r => setTimeout(r, 3000));
  await p.screenshot({ path: `tests/out/chat1a1-${vp.width}.png` });
  console.log(vp.width, await p.evaluate(() => [...document.querySelectorAll('*')].filter(e => e.scrollTop > 0 && e.id !== 'msgs').map(e => (e.id || e.className) + ':' + e.scrollTop)));
  await ctx.close();
}
await b.close();
