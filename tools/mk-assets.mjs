import puppeteer from 'puppeteer-core';
import fs from 'fs';
const svg = fs.readFileSync('web/icons/logo.svg', 'utf8').replace(/width="64" height="64"/, 'width="100%" height="100%"');
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const p = await b.newPage();
async function shot(file, size, { bg = 'transparent', scale = 0.6, text = false } = {}) {
  await p.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
  const s = Math.round(size * scale);
  await p.setContent(`<html><body style="margin:0;width:${size}px;height:${size}px;background:${bg};display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:system-ui,sans-serif">
    <div style="width:${s}px;height:${s}px">${svg}</div>${text ? `<div style="margin-top:${size * 0.03}px;font-size:${size * 0.06}px;font-weight:800;letter-spacing:${size * 0.012}px;color:${bg === '#16131F' ? '#F3EEFF' : '#1D1A2E'}">DUNA</div>` : ''}</body></html>`);
  await p.screenshot({ path: file, omitBackground: bg === 'transparent' });
}
await shot('assets/icon-only.png', 1024, { bg: '#FBF6EF', scale: 0.66 });
await shot('assets/icon-foreground.png', 1024, { scale: 0.5 });
await shot('assets/icon-background.png', 1024, { bg: '#FBF6EF', scale: 0 });
await shot('assets/splash.png', 2732, { bg: '#FBF6EF', scale: 0.2, text: true });
await shot('assets/splash-dark.png', 2732, { bg: '#16131F', scale: 0.2, text: true });
await b.close();
