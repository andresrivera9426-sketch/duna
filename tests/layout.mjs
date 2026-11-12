import puppeteer from 'puppeteer';
const URL = process.env.URL || 'https://andresrivera9426-sketch.github.io/duna/';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
for (const vp of [{ width: 1366, height: 768 }, { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]) {
  const ctx = await b.createBrowserContext(); const p = await ctx.newPage(); await p.setViewport(vp);
  await p.goto(URL, { waitUntil: 'networkidle2' });
  await p.screenshot({ path: `tests/out/inicio-${vp.width}.png` });
  console.log(vp.width, await p.evaluate(() => ({ t: document.title, sh: document.documentElement.scrollHeight, ih: innerHeight, sw: document.documentElement.scrollWidth, iw: innerWidth, txt: document.body.innerText.slice(0, 120) })));
  await ctx.close();
}
await b.close();
