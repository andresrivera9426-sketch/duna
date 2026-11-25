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
// Fuentes para los íconos y splash de Android/iOS (npx capacitor-assets generate): misma identidad v3 "Horizonte"
if (process.argv.includes('--native')) {
  await shot(1024, 'assets/icon-only.png', '#F5F1EA', 0.2);
  await shot(1024, 'assets/icon-foreground.png', 'transparent', 0.3);
  await p.setViewport({ width: 1024, height: 1024 }); await p.setContent('<body style="margin:0;background:#F5F1EA;width:1024px;height:1024px"></body>'); await p.screenshot({ path: 'assets/icon-background.png' });
  await shot(2732, 'assets/splash.png', '#F5F1EA', 0.82);
  await shot(2732, 'assets/splash-dark.png', '#15132B', 0.82);
}
await b.close(); console.log('icons ok');
