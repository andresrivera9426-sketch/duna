import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const src = fs.readFileSync('src/shared/ui.js', 'utf8').match(/export const LOGO = `([\s\S]*?)`;/)[1];
fs.writeFileSync('web/icons/logo.svg', src.replace('<svg ', '<svg width="64" height="64" '));
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const p = await b.newPage();
async function shot(size, file, bg, pad) {
  await p.setViewport({ width: size, height: size });
  await p.setContent(`<html><body style="margin:0;width:${size}px;height:${size}px;display:grid;place-items:center;background:${bg}">${src.replace('<svg ', `<svg style="width:${size * (1 - pad)}px;height:${size * (1 - pad)}px" `)}</body></html>`);
  await p.screenshot({ path: file, omitBackground: bg === 'transparent' });
}
await shot(192, 'web/icons/icon-192.png', '#F5F1EA', 0.12);
await shot(512, 'web/icons/icon-512.png', '#F5F1EA', 0.12);
await shot(512, 'web/icons/maskable-512.png', '#1D1A2E', 0.36);
await shot(96, 'web/icons/badge.png', 'transparent', 0.05);
await b.close(); console.log('icons ok');
