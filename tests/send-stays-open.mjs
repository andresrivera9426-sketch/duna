// Regresión: al enviar un texto el chat NO debe cerrarse ni perder el foco del cuadro de texto (teclado abierto).
// Uso: node tests/send-stays-open.mjs [URL]   (cuentas de prueba: env A, B, PASS)
import puppeteer, { KnownDevices } from 'puppeteer-core';
const URL = process.argv[2] || 'http://localhost:8088/';
const A = process.env.A || 'prueba_ia_a_mwehcbaf', B = process.env.B || 'prueba_ia_b_mwehcbaf', PASS = process.env.PASS || 'Duna-Prueba-2026!';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { console.log((c ? '✔ ' : '✘ ') + m); if (!c) fails++; };
const br = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
async function login(u, dev) {
  const ctx = await br.createBrowserContext(); const p = await ctx.newPage(); await p.emulate(KnownDevices[dev]);
  p.on('pageerror', e => console.log(u.slice(-6), 'PAGEERROR', e.message));
  await p.goto(URL, { waitUntil: 'networkidle2' }); await p.waitForSelector('#f-user');
  await p.type('#f-user', u); await p.type('#f-pass', PASS); await p.click('#f-submit');
  await p.waitForSelector('#app', { timeout: 60000 }); await sleep(1500);
  await p.evaluate(() => document.querySelectorAll('.sheet-wrap').forEach(x => x.remove()));
  await p.evaluate(() => { window.__log = []; const bk = history.back; history.back = function () { window.__log.push('back'); return bk.apply(this); };
    addEventListener('popstate', () => window.__log.push('popstate ' + location.hash)); });
  return p;
}
const state = p => p.evaluate(() => ({ cur: window.__duna.S.current, inchat: document.getElementById('app').classList.contains('in-chat'), conv: !!document.querySelector('#conv'),
  hash: location.hash, focus: document.activeElement?.id || document.activeElement?.tagName, log: window.__log.slice(), last: [...document.querySelectorAll('#msgs .bubble .txt')].pop()?.innerText || '' }));
for (const dev of ['Pixel 5', 'iPhone 13']) {
  const pa = await login(A, dev), pb = await login(B, dev);
  const direct = await pa.evaluate(() => [...window.__duna.S.chats.values()].find(c => c.type === 'direct' && c.other_id)?.id);
  ok(!!direct, `${dev}: hay chat directo de prueba`);
  await pa.tap(`.chat-row[data-chat="${direct}"]`); await sleep(2500);
  await pb.evaluate(id => { location.hash = '#/c/' + id; }, direct); await sleep(2500);
  await pa.tap('#msg-input');
  for (let i = 0; i < 3; i++) {
    const txt = `regresión ${dev} ${i} ${Date.now() % 1e5}`;
    await pa.keyboard.type(txt); await sleep(150);           // sin volver a tocar el cuadro: el foco debe seguir ahí
    await pa.tap('#send-btn');
    await pa.setViewport({ width: 393, height: 480, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }); await sleep(400); // teclado abierto (adjustResize)
    await pa.setViewport({ width: 393, height: 851, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }); await sleep(2600);
    const s = await state(pa);
    ok(s.inchat && s.conv && s.cur === direct && s.hash === '#/c/' + direct, `${dev}: chat sigue abierto tras enviar #${i + 1}`);
    ok(s.focus === 'msg-input', `${dev}: el cuadro de texto conserva el foco (teclado abierto) tras enviar #${i + 1} [${s.focus}]`);
    ok(s.last.includes(txt), `${dev}: el mensaje #${i + 1} aparece en la conversación`);
    ok(!s.log.includes('back'), `${dev}: no hubo history.back()`);
  }
  const rt = `respuesta B ${Date.now() % 1e5}`;
  await pb.tap('#msg-input'); await pb.keyboard.type(rt); await pb.tap('#send-btn'); await sleep(3500);
  const s = await state(pa);
  ok(s.inchat && s.cur === direct && s.last.includes(rt), `${dev}: al recibir, el chat sigue abierto y muestra el mensaje`);
  await pa.screenshot({ path: `tests/out/send-stays-open-${dev.replace(/\s/g, '')}.png` });
  await pa.browserContext().close(); await pb.browserContext().close();
}
await br.close();
console.log(fails ? `\n${fails} FALLO(S)` : '\nTODO OK'); process.exit(fails ? 1 : 0);
