// E2E de la super-app (móvil Pixel 5): Momentos, Noticias, Videos, Radio (mini reproductor persistente), Mini apps, Juegos y DUNA Pay.
// Todo debe abrirse DENTRO de DUNA (sin pestañas nuevas ni navegador). Capturas en duna-entrega/capturas/v108.
import puppeteer, { KnownDevices } from 'puppeteer-core';
const BASE = process.argv[2] || 'http://localhost:8088/';
const U = process.env.A || 'prueba_ia_a_mwehcbaf', PASS = 'Duna-Prueba-2026!', THEME = process.env.THEME || 'light';
const SHOTS = '/workspace/duna-entrega/capturas/v108/' + THEME + '-';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { console.log((c ? '✔ ' : '✘ ') + m); if (!c) fails++; };
const br = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
let popups = 0; br.on('targetcreated', t => { if (t.type() === 'page') popups++; });
const p = await br.newPage(); await p.emulate(KnownDevices['Pixel 5']); popups = 0;
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.evaluateOnNewDocument(t => { try { const pr = JSON.parse(localStorage.getItem('duna-prefs') || '{}'); pr.theme = t; localStorage.setItem('duna-prefs', JSON.stringify(pr)); } catch {} }, THEME);
await p.goto(BASE, { waitUntil: 'networkidle2' }); await p.type('#f-user', U); await p.type('#f-pass', PASS); await p.click('#f-submit');
await p.waitForSelector('.chat-row[data-chat]:not(.ia-row)', { timeout: 60000 }); await sleep(1000);
await p.evaluate(() => document.querySelectorAll('.sheet-wrap').forEach(x => x.remove()));
const shot = n => p.screenshot({ path: SHOTS + n + '.png' });
const mod = async id => { await p.evaluate(i => document.querySelector(`.modules [data-tab="${i}"]`)?.scrollIntoView({ inline: 'center' }), id); await p.tap(`.modules [data-tab="${id}"]`); };
const closeLayer = async () => { await p.keyboard.press('Escape'); await sleep(350); };
await p.tap('.tabs [data-nav="discover"]'); await sleep(1200);
const mods = await p.evaluate(() => [...document.querySelectorAll('.modules .mod')].map(m => m.querySelector('small').textContent + (m.disabled ? '(pronto)' : '')));
ok(['Momentos', 'Estados', 'Noticias', 'Videos', 'Radio', 'Mini apps', 'Juegos', 'Comunidades', 'DUNA Pay(pronto)'].every(x => mods.includes(x)), 'Descubrir: ' + mods.join(' · '));
// ---------- Momentos ----------
await mod('moments'); await p.waitForSelector('#moments-feed .mo, #moments-feed .dsc-empty', { timeout: 30000 });
await p.tap('.mo-new'); await p.waitForSelector('.story-text'); const txt = 'Momento de prueba ' + Date.now().toString(36);
await p.type('.story-text', txt); await p.tap('#story-publish');
await p.waitForFunction(t => [...document.querySelectorAll('#moments-feed .mo-text')].some(x => x.textContent === t), { timeout: 30000 }, txt).catch(() => {});
ok(await p.evaluate(t => [...document.querySelectorAll('#moments-feed .mo-text')].some(x => x.textContent === t), txt), 'Momentos: publicar un momento de texto y verlo en el feed');
await sleep(400); await shot('momentos');
// ---------- Noticias ----------
await mod('news'); await p.waitForSelector('#news-list .nw', { timeout: 45000 }).catch(() => {});
const nNews = await p.evaluate(() => document.querySelectorAll('#news-list .nw').length);
ok(nNews >= 10, `Noticias · Portada: ${nNews} noticias`); await sleep(800); await shot('noticias');
for (const c of ['colombia', 'regional']) { await p.tap(`.dsc-chips [data-cat="${c}"]`); await sleep(300); await p.waitForSelector('#news-list .nw', { timeout: 45000 }).catch(() => {});
  ok(await p.evaluate(() => document.querySelectorAll('#news-list .nw').length >= 5), `Noticias · ${c}: ${await p.evaluate(() => [...new Set([...document.querySelectorAll('#news-list .nw-src')].map(s => s.firstChild.textContent))].slice(0, 5).join(', '))}`); }
await p.tap('#news-list .nw'); await p.waitForSelector('.reader .rd-art', { timeout: 40000 }).catch(() => {});
ok(await p.evaluate(() => (document.querySelector('.reader .rd-art')?.innerText || '').length > 200), 'Noticia abierta en el lector integrado');
ok(await p.evaluate(() => [...document.querySelectorAll('.reader .rd-tools button')].some(b => /Resumir con IA DUNA/.test(b.textContent))), 'Lector: botón «Resumir con IA DUNA»');
await shot('noticias-lector');
await p.tap('.reader .rd-head [aria-label="Guardar para después"]'); await sleep(300); await closeLayer();
await p.tap('.dsc-chips [data-cat="guardadas"]'); await sleep(500);
ok(await p.evaluate(() => document.querySelectorAll('#news-list .nw').length >= 1), 'Guardar para después → aparece en Guardadas');
await p.tap('.dsc-chips [data-cat="portada"]'); await sleep(300);
await p.type('.searchbar input', 'Colombia'); await sleep(1500); await p.waitForSelector('#news-list .nw', { timeout: 40000 }).catch(() => {});
ok(await p.evaluate(() => document.querySelectorAll('#news-list .nw').length >= 3), 'Búsqueda de noticias «Colombia»');
// Compartir en un chat
await p.tap('#news-list .nw .nw-more'); await sleep(250); await p.evaluate(() => [...document.querySelectorAll('.ctx-item')].find(b => /Compartir/.test(b.textContent))?.click());
await p.waitForSelector('.share-row', { timeout: 8000 }).catch(() => {});
ok(await p.evaluate(() => document.querySelectorAll('.share-row').length >= 1), 'Compartir en un chat: selector de chats');
await shot('compartir');
await p.tap('.share-row'); await sleep(2500);
ok(await p.evaluate(() => [...document.querySelectorAll('.toast')].some(t => /Enviado a/.test(t.textContent))), 'Noticia enviada a un chat de DUNA');
// ---------- Videos ----------
await mod('videos'); await p.waitForSelector('#videos-list .vd', { timeout: 45000 }).catch(() => {});
ok(await p.evaluate(() => document.querySelectorAll('#videos-list .vd').length >= 10), `Videos · Lo último: ${await p.evaluate(() => document.querySelectorAll('#videos-list .vd').length)}`);
await sleep(1000); await shot('videos');
await p.tap('#videos-list .vd .vd-th'); await sleep(1200);
ok(await p.evaluate(() => /youtube-nocookie\.com\/embed\//.test(document.querySelector('.reader iframe')?.src || '')), 'Video en reproductor integrado (youtube-nocookie)');
await shot('videos-player'); await closeLayer();
await p.tap('.dsc-chips [data-cat="cortos"]'); await p.waitForSelector('#videos-list .vd', { timeout: 30000 }).catch(() => {}); await sleep(500);
await p.tap('#videos-list .vd .vd-th'); await sleep(1000);
ok(await p.evaluate(() => /player\.vimeo\.com\/video\/\d+/.test(document.querySelector('.reader iframe')?.src || '')), 'Vimeo en reproductor integrado');
await closeLayer();
// ---------- Radio ----------
await mod('radio'); await p.waitForSelector('#radio-list .rs', { timeout: 45000 }).catch(() => {});
const nR = await p.evaluate(() => document.querySelectorAll('#radio-list .rs').length);
ok(nR >= 10, `Radio · Colombia: ${nR} emisoras`);
let playing = false, tried = [];
for (let i = 0; i < 5 && !playing; i++) {
  const name = await p.evaluate(k => { const r = document.querySelectorAll('#radio-list .rs')[k]; r.click(); return r.dataset.name; }, i); tried.push(name);
  for (let t = 0; t < 12 && !playing; t++) { await sleep(1000); playing = await p.evaluate(() => { const a = [...document.querySelectorAll('audio')].concat(window.__dunaAudio || []); return !!document.querySelector('#miniplayer:not([hidden])') && /En vivo|Colombia|,/.test(document.querySelector('.mp-s')?.textContent || '') && !document.querySelector('#miniplayer.wait'); }); }
}
ok(playing, 'Radio sonando en el mini reproductor: ' + tried.at(-1));
await shot('radio');
await p.tap('.tabs [data-nav="chats"]'); await sleep(1500);
ok(await p.evaluate(() => !!document.querySelector('#miniplayer:not([hidden])') && !document.querySelector('#miniplayer.wait')), 'El mini reproductor sigue activo al ir a Chats');
await shot('radio-en-chats');
await p.tap('.tabs [data-nav="discover"]'); await sleep(800); await mod('radio'); await p.waitForSelector('#radio-list .rs', { timeout: 30000 });
await p.tap('#radio-list .rs .rs-fav'); await sleep(200); await p.tap('.dsc-chips [data-cat="fav"]'); await sleep(500);
ok(await p.evaluate(() => document.querySelectorAll('#radio-list .rs').length >= 1), 'Radio · Favoritas');
await p.tap('#miniplayer [aria-label="Cerrar reproductor"]'); await sleep(300);
// ---------- Mini apps ----------
await mod('apps'); await p.waitForSelector('.ma-grid .ma', { timeout: 20000 });
ok(await p.evaluate(() => /Próximamente/.test(document.querySelector('.pay-card')?.textContent || '')), 'DUNA Pay: solo aviso «Próximamente» (sin dinero real)');
await shot('miniapps');
const app = async (id, sel, check, label, act) => {
  await p.evaluate(i => document.querySelector(`.ma[data-app="${i}"]`).click(), id);
  await p.waitForSelector('.reader.rd-app ' + sel, { timeout: 30000 }).catch(() => {}); if (act) await act(); await sleep(700);
  ok(await p.evaluate(check), label); await shot('app-' + id); await closeLayer(); await sleep(200);
};
await app('clima', '.wx-now', () => /°/.test(document.querySelector('.wx-t')?.textContent || '') && document.querySelectorAll('.wx-d').length === 7, 'Clima (Open-Meteo): ahora, por horas y 7 días');
await app('divisas', '.fx-res b', () => /\$/.test(document.querySelector('.fx-trm b')?.textContent || '') && /\$/.test(document.querySelector('.fx-res b')?.textContent || ''), 'TRM oficial y conversor');
await app('calc', '.calc-k', () => document.querySelector('.calc-d').textContent === '42', 'Calculadora: 12+30×1 = 42', async () => { for (const k of ['1', '2', '+', '3', '0', '×', '1', '=']) await p.evaluate(x => document.querySelector(`.ck[data-k="${x}"]`).click(), k); });
await app('qr', '.seg', () => !!document.querySelector('.qr-out svg'), 'QR: crear código', async () => { await p.evaluate(() => [...document.querySelectorAll('.seg-b')].find(b => b.textContent === 'Crear').click()); await sleep(200); await p.type('.qr-b textarea', 'https://andresrivera9426-sketch.github.io/duna/'); });
await app('notas', '.nt-new', () => [...document.querySelectorAll('.nt p')].some(x => x.textContent === 'Comprar panela'), 'Notas y recordatorios: guardar nota con aviso', async () => { await p.type('.nt-new textarea', 'Comprar panela'); await p.evaluate(() => { const i = document.querySelector('.nt-row input'); const d = new Date(Date.now() + 36e5 - new Date().getTimezoneOffset() * 6e4); i.value = d.toISOString().slice(0, 16); }); await p.evaluate(() => [...document.querySelectorAll('.nt-new .btn')].find(b => b.textContent === 'Guardar').click()); await sleep(400); });
await app('festivos', '.fe-next', () => !!document.querySelector('.fe-next b')?.textContent, 'Festivos de Colombia');
await app('saber', '.sb-card', () => /Putumayo/.test(document.querySelector('.sb-card h3')?.textContent || ''), 'Saber (Wikipedia)');
await app('sismos', '.eq, .ap p', () => document.querySelectorAll('.eq').length > 0 || /No hay sismos/.test(document.body.innerText), 'Sismos (USGS)');
await app('unidades', '.fx-res b', () => /km|m/.test(document.querySelector('.fx-res b')?.textContent || ''), 'Conversor de unidades');
// QR: escanear (cámara falsa de Chrome: no hay QR, debe quedarse buscando sin errores)
// ---------- Juegos ----------
await mod('games'); await p.waitForSelector('.gm-grid .gm', { timeout: 20000 }); await shot('juegos');
const game = async (id, sel, act, check, label) => { await p.evaluate(i => document.querySelector(`.gm[data-game="${i}"]`).click(), id); await p.waitForSelector('.reader ' + sel, { timeout: 20000 }).catch(() => {}); await act(); await sleep(500); ok(await p.evaluate(check), label); await shot('juego-' + id); await closeLayer(); };
await game('2048', '.g2-grid', async () => { for (const k of ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft']) { await p.keyboard.press(k); await sleep(60); } }, () => [...document.querySelectorAll('.g2-c')].filter(c => c.textContent).length >= 3, '2048 jugable');
await game('snake', '.sn-cv', async () => { await sleep(600); }, () => !!document.querySelector('.sn-cv'), 'Culebrita en marcha');
await game('memoria', '.mm-grid', async () => { await p.evaluate(() => document.querySelectorAll('.mm')[0].click()); }, () => document.querySelectorAll('.mm.up').length === 1, 'Memoria: voltear carta');
await game('triqui', '.tq-grid', async () => { await p.evaluate(() => document.querySelectorAll('.tq')[4].click()); await sleep(700); }, () => document.querySelectorAll('.tq.X').length === 1 && document.querySelectorAll('.tq.O').length === 1, 'Triqui: la máquina responde');
ok(popups === 0, 'Nada se abrió fuera de DUNA (pestañas nuevas: ' + popups + ')');
ok(!errs.length, 'Sin errores de JavaScript' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
await br.close(); console.log(fails ? `FALLAS: ${fails}` : 'TODO OK'); process.exit(fails ? 1 : 0);
