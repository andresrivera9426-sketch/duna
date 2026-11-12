import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('https://andresrivera9426-sketch.github.io/duna/', { waitUntil: 'networkidle2' });
const ok = await p.waitForSelector('#f-user', { timeout: 20000 }).then(() => true, () => false);
console.log('auth visible', ok, 'native class', await p.evaluate(() => document.documentElement.classList.contains('native')), 'errors', errs);
await b.close();
