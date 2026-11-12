// Prueba de la app Android (APK de depuración en emulador) contra el backend real.
// A = navegador (puppeteer); B = app DUNA en el emulador (WebView conectado por DevTools).
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
const DEV = process.env.DEV || 'emulator-5560';
const APK = process.env.APK || 'android/app/build/outputs/apk/debug/app-debug.apk';
const URL = 'http://localhost:8088/';
const OUT = 'tests/out-native'; fs.mkdirSync(OUT, { recursive: true });
const CREATED = '/workspace/duna-test-created.json';
const stamp = Date.now().toString(36);
const PASS = 'Duna-Prueba-2026!';
const A = { u: 'prueba_na_' + stamp, n: 'Ana N ' + stamp, p: PASS }, B = { u: 'prueba_nb_' + stamp, n: 'Beto N ' + stamp, p: PASS };
const created = fs.existsSync(CREATED) ? JSON.parse(fs.readFileSync(CREATED)) : [];
created.push(A, B); fs.writeFileSync(CREATED, JSON.stringify(created, null, 1));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const adb = (c, o = {}) => execSync(`adb -s ${DEV} ${c}`, { encoding: 'utf8', timeout: 900000, ...o });
const results = []; const ok = (name, pass, info = '') => { results.push({ name, pass: !!pass, info: String(info).slice(0, 300) }); console.log((pass ? 'OK    ' : 'FALLA ') + name + (info ? ' — ' + String(info).slice(0, 220) : '')); };
const shot = n => { try { fs.writeFileSync(`${OUT}/${n}.png`, execSync(`adb -s ${DEV} exec-out screencap -p`, { maxBuffer: 50e6 })); } catch {} };
const notifs = () => adb('shell dumpsys notification --noredact');
async function waitNotif(txt, ms = 30000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { const d = notifs(); if (d.includes(txt)) return Date.now() - t0; await sleep(400); } return -1; }
async function register(p, u) {
  await p.waitForSelector('#f-user', { timeout: 120000 }); await p.click('#f-switch'); await p.waitForSelector('#f-name');
  await p.type('#f-user', u.u); await p.type('#f-name', u.n); await p.type('#f-pass', u.p); await p.type('#f-pass2', u.p);
  await p.click('#f-submit'); await p.waitForSelector('#app', { timeout: 120000 });
}
// Cliente CDP mínimo para el WebView de la app (puppeteer.connect se cuelga con WebView en emulador lento)
async function appPage() {
  let url = null;
  for (let i = 0; i < 240 && !url; i++) {
    try {
      const socks = adb('shell cat /proc/net/unix').split('\n').map(l => l.match(/@(webview_devtools_remote_\d+)/)?.[1]).filter(Boolean);
      if (socks.length) {
        execSync(`adb -s ${DEV} forward tcp:9333 localabstract:${socks[socks.length - 1]}`);
        const list = await (await fetch('http://127.0.0.1:9333/json')).json();
        url = list.find(t => t.type === 'page' && t.url.startsWith('https://localhost') && JSON.parse(t.description || '{}').attached !== false)?.webSocketDebuggerUrl
          || list.find(t => t.type === 'page' && t.url.startsWith('https://localhost'))?.webSocketDebuggerUrl;
      }
    } catch {}
    if (!url) await sleep(1000);
  }
  if (!url) throw new Error('sin página de la app');
  const ws = new WebSocket(url); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const pend = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') console.log('[app]', m.params.args.map(a => a.value ?? a.description).join(' ').slice(0, 200)); };
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable');
  const evaluate = async (fn, ...args) => {
    const r = await send('Runtime.evaluate', { expression: `(${fn.toString()})(...${JSON.stringify(args)})`, awaitPromise: true, returnByValue: true, timeout: 60000 });
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
    return r.result?.result?.value;
  };
  const waitForFunction = async (fn, { timeout = 30000 } = {}, ...args) => { const t0 = Date.now(); while (Date.now() - t0 < timeout) { try { if (await evaluate(fn, ...args)) return true; } catch {} await sleep(400); } throw new Error('timeout'); };
  const p = {
    evaluate, waitForFunction,
    waitForSelector: (sel, o = {}) => waitForFunction(s => !!document.querySelector(s), o, sel),
    click: sel => evaluate(s => document.querySelector(s).click(), sel),
    type: (sel, txt) => evaluate((s, t) => { const e = document.querySelector(s); e.focus(); e.value = t; e.dispatchEvent(new Event('input', { bubbles: true })); }, sel, txt),
    url: () => url,
  };
  return { br: { disconnect: () => ws.close() }, p };
}
const sendFromA = async (pa, text) => { await pa.focus('#msg-input'); await pa.keyboard.type(text); await pa.keyboard.press('Enter'); };

// ---- instalar ----
if (!process.env.KEEP) { try { adb('uninstall co.duna.app'); } catch {} }
if (!process.env.KEEP) console.log(adb(`install -r -g ${APK}`).trim()); else adb('shell pm grant co.duna.app android.permission.POST_NOTIFICATIONS');
adb('shell dumpsys deviceidle whitelist +co.duna.app'); adb('shell settings put global hide_error_dialogs 1');
adb('shell am start -n co.duna.app/.MainActivity'); await sleep(4000); adb('shell am broadcast -a android.intent.action.CLOSE_SYSTEM_DIALOGS'); shot('n01-arranque');
let { br, p: pb } = await appPage();
await pb.waitForFunction(() => document.documentElement.classList.contains('native') && document.querySelector('#f-user, #app'), { timeout: 240000 }).catch(() => {});
ok('App abre y carga DUNA en el WebView', await pb.evaluate(() => document.documentElement.classList.contains('native')), pb.url());
await register(pb, B); await sleep(2500); shot('n02-chats-app');
const dev = await pb.evaluate(() => JSON.parse(localStorage.getItem('duna-native') || 'null'));
ok('Dispositivo nativo registrado (native_devices)', dev?.id && dev?.topic, dev?.id);
const info = await pb.evaluate(() => window.Capacitor.Plugins.DunaNative.info());
ok('Plugin nativo: permisos y servicio', info.notifications && info.registered && (info.fcm || info.service), JSON.stringify(info));
for (let i = 0; i < 20 && !(await pb.evaluate(() => window.Capacitor.Plugins.DunaNative.info())).connected; i++) await sleep(500);
ok('Conexión en segundo plano unida a Realtime', (await pb.evaluate(() => window.Capacitor.Plugins.DunaNative.info())).connected);

// ---- A en navegador ----
const ba = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
const pa = await ba.newPage(); await pa.setViewport({ width: 1280, height: 800 });
await pa.goto(URL, { waitUntil: 'networkidle2' }); await register(pa, A); await sleep(1500);
await pa.goto(URL + '#/u/' + B.u, { waitUntil: 'networkidle2' }); await sleep(2500);
await pa.evaluate(() => [...document.querySelectorAll('.sheet button, button')].find(b => /Enviar mensaje|Chatear|Mensaje/i.test(b.innerText))?.click()); await sleep(2000);
ok('A abrió chat con B', await pa.$('#msg-input').then(Boolean));
await sendFromA(pa, 'hola desde la web ' + stamp); await sleep(3000);
ok('B (app abierta) recibe en vivo', await pb.evaluate(t => document.body.innerText.includes(t), 'hola desde la web ' + stamp));

// ---- app en segundo plano ----
adb('shell input keyevent KEYCODE_HOME'); await sleep(2500);
let t1 = 'segundo plano ' + stamp; await sendFromA(pa, t1);
let ms = await waitNotif(t1);
ok('Notificación con la app en segundo plano (texto E2E descifrado)', ms >= 0, ms >= 0 ? `${ms} ms` : 'no llegó'); shot('n03-notif-fondo');

// ---- proceso cerrado por el sistema ----
const pid = adb('shell pidof co.duna.app').trim();
try { br.disconnect(); } catch {}
adb(`shell run-as co.duna.app kill -9 ${pid}`); await sleep(1500);
ok('Proceso de la app eliminado', adb('shell pidof co.duna.app || true').trim() !== pid, 'pid ' + pid);
let t2 = 'app cerrada ' + stamp; await sendFromA(pa, t2);
ms = await waitNotif(t2, 60000);
ok('Notificación con la app cerrada (el servicio se reinicia y recupera de la cola)', ms >= 0, ms >= 0 ? `${ms} ms` : 'no llegó'); shot('n04-notif-cerrada');
await sleep(3000);
let t3 = 'en vivo tras reinicio ' + stamp; await sendFromA(pa, t3);
ms = await waitNotif(t3);
ok('Notificación en vivo después del reinicio', ms >= 0, ms >= 0 ? `${ms} ms` : 'no llegó');

// ---- deslizar la app fuera de recientes ----
adb('shell am start -n co.duna.app/.MainActivity'); await sleep(3000);
adb('shell input keyevent KEYCODE_APP_SWITCH'); await sleep(1500);
const [w, hgt] = adb('shell wm size').match(/(\d+)x(\d+)/).slice(1).map(Number);
adb(`shell input swipe ${w / 2} ${hgt * 0.5} ${w / 2} ${hgt * 0.08} 250`); await sleep(1500);
adb('shell input keyevent KEYCODE_HOME'); await sleep(2000);
let t4 = 'quitada de recientes ' + stamp; await sendFromA(pa, t4);
ms = await waitNotif(t4, 45000);
ok('Notificación tras quitar la app de recientes', ms >= 0, ms >= 0 ? `${ms} ms` : 'no llegó'); shot('n05-notif-recientes');

// ---- tocar la notificación abre el chat ----
adb('shell cmd statusbar expand-notifications'); await sleep(1500); shot('n06-panel');
const ui = adb('exec-out uiautomator dump /dev/tty');
const m = ui.match(new RegExp(`text="[^"]*${t4.split(' ')[0]}[^"]*"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`)) || ui.match(new RegExp(`text="${A.n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`));
if (m) { adb(`shell input tap ${(+m[1] + +m[3]) / 2} ${(+m[2] + +m[4]) / 2}`); await sleep(4000); }
({ br, p: pb } = await appPage());
const opened = await pb.waitForFunction(n => document.querySelector('#conv-head')?.innerText.includes(n), { timeout: 15000 }, A.n).then(() => true, () => false);
ok('Tocar la notificación abre el chat', opened, m ? '' : 'no encontré la notificación en el panel'); shot('n07-chat-abierto');

// ---- botón atrás ----
adb('shell input keyevent KEYCODE_BACK'); await sleep(1200);
ok('Atrás cierra el chat (vuelve a la lista)', await pb.evaluate(() => !document.getElementById('app')?.classList.contains('in-chat')));
adb('shell input keyevent KEYCODE_BACK'); await sleep(1500);
ok('Atrás en la lista minimiza (no cierra) la app', adb('shell pidof co.duna.app || true').trim().length > 0);

// ---- compartir texto desde otra app ----
adb(`shell am start -a android.intent.action.SEND -t text/plain --es android.intent.extra.TEXT "'compartido ${stamp}'" -n co.duna.app/.MainActivity`); await sleep(3500);
({ br, p: pb } = await appPage());
const shareSheet = await pb.waitForFunction(() => [...document.querySelectorAll('.sheet h2')].some(x => x.innerText.includes('Enviar a')), { timeout: 10000 }).then(() => true, () => false);
ok('Compartir con DUNA abre el selector de chat', shareSheet); shot('n08-compartir');
if (shareSheet) {
  await pb.evaluate(n => [...document.querySelectorAll('.sheet .person')].find(x => x.innerText.includes(n))?.click(), A.n); await sleep(1500);
  ok('El texto compartido queda listo en el chat', await pb.evaluate(t => document.getElementById('msg-input')?.value.includes(t), 'compartido ' + stamp));
  await pb.evaluate(() => { const t = document.getElementById('msg-input'); t.value = ''; t.dispatchEvent(new Event('input')); });
}
// ---- llamada entrante con la app en segundo plano ----
adb('shell input keyevent KEYCODE_HOME'); await sleep(1500);
await pa.evaluate(() => [...document.querySelectorAll('#conv-head button')].find(b => /llamada|Llamar|voz/i.test(b.getAttribute('aria-label') || b.title || ''))?.click());
const callMs = await (async () => { const t0 = Date.now(); while (Date.now() - t0 < 20000) { const d = notifs(); if (/Llamada entrante/.test(d)) return Date.now() - t0; await sleep(400); } return -1; })();
ok('Notificación de llamada entrante', callMs >= 0, callMs >= 0 ? `${callMs} ms` : 'no llegó'); shot('n09-llamada');
await pa.evaluate(() => document.querySelector('#call-ui .hang, #call-ui [aria-label*="Colgar"], #call-ui .danger')?.click()).catch(() => {});

fs.writeFileSync(`${OUT}/results.json`, JSON.stringify({ stamp, A: A.u, B: B.u, results }, null, 1));
console.log(`\n${results.filter(r => r.pass).length}/${results.length} OK`);
try { br.disconnect(); } catch {}
await ba.close();
process.exit(0);
