// IA DUNA de punta a punta en dos navegadores (web real contra Supabase real y la función "ia" real).
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
const SB_URL = 'https://jvaepilcxwnfssbxneiu.supabase.co', SB_KEY = 'sb_publishable_Xjb_xWzN36EL0z-5UbQShQ_cX2jkRG1';
const URL = process.argv[2] || 'http://localhost:8088/';
const CREATED = '/workspace/duna-test-created.json';
const stamp = Date.now().toString(36); const PASS = 'Duna-Prueba-2026!';
// REUSE=usuarioA,usuarioB reutiliza cuentas de prueba ya creadas (el registro tiene límite por red y hora)
const R = (process.env.REUSE || '').split(',').filter(Boolean);
const A = { u: R[0] || 'prueba_ia_a_' + stamp, n: 'Ana IA', p: PASS, old: !!R[0] }, B = { u: R[1] || 'prueba_ia_b_' + stamp, n: 'Beto IA', p: PASS, old: !!R[1] };
const created = fs.existsSync(CREATED) ? JSON.parse(fs.readFileSync(CREATED)) : []; for (const x of [A, B]) if (!x.old) created.push(x); fs.writeFileSync(CREATED, JSON.stringify(created, null, 1));
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const ok = (n, p, i = '') => { if (!p) fails++; console.log((p ? 'OK    ' : 'FALLA ') + n + (i ? ' — ' + String(i).replace(/\s+/g, ' ').slice(0, 220) : '')); };
const br = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
const errs = [];
async function register(u) {
  const ctx = await br.createBrowserContext();
  const p = await ctx.newPage(); await p.setViewport({ width: 420, height: 860 });
  p.on('pageerror', e => errs.push(u.u + ': ' + e.message));
  await p.goto(URL, { waitUntil: 'networkidle2' }); await p.waitForSelector('#f-user');
  if (u.old) { await p.type('#f-user', u.u); await p.type('#f-pass', u.p); await p.click('#f-submit'); }
  else { await p.click('#f-switch'); await p.waitForSelector('#f-name'); await p.type('#f-user', u.u); await p.type('#f-name', u.n); await p.type('#f-pass', u.p); await p.type('#f-pass2', u.p); await p.click('#f-submit'); }
  await p.waitForSelector('#app', { timeout: 60000 }); await p.waitForSelector('#rc-ok', { timeout: 8000 }).then(b => b.click()).catch(() => {}); await sleep(600);
  await p.evaluate(() => document.querySelectorAll('.sheet-wrap').forEach(x => x.remove())); return p;
}
const acceptConsent = async p => { await sleep(400); await p.evaluate(() => [...document.querySelectorAll('.sheet button')].find(b => b.innerText.trim() === 'Entendido')?.click()); };
const pa = await register(A), pb = await register(B);
if (process.env.SKIP1) {} 
// 1) Fila fija IA DUNA arriba de la lista
const first = await pa.evaluate(() => { const r = document.querySelector('#chat-list .chat-row'); return r && r.dataset.chat + '|' + r.innerText; });
ok('IA DUNA fijada primera en la lista de chats', /^ia-duna\|IA DUNA/.test(first || ''), first);
// 2) Chat propio
await pa.click('.chat-row[data-chat="ia-duna"]'); await pa.waitForSelector('#ia-input');
await pa.type('#ia-input', '¿Quién eres? Responde en una frase.'); await pa.screenshot({ path: 'tests/out/ia-pre.png' }); await pa.evaluate(() => document.querySelector('#ia-send').click()); await acceptConsent(pa);
await pa.waitForFunction(() => document.querySelectorAll('.ia-conv .bubble.ai').length >= 1 && !document.querySelector('#ia-typing'), { timeout: 40000 }).catch(() => {});
let t = await pa.evaluate(() => [...document.querySelectorAll('.ia-conv .bubble.ai .txt')].map(x => x.innerText).join(' | '));
ok('Chat IA DUNA responde y se presenta como IA DUNA', /IA DUNA/.test(t) && !/gemini|google/i.test(t), t);
await pa.type('#ia-input', 'Me llamo Ana. ¿Cuánto es 12 por 12?'); await pa.evaluate(() => document.querySelector('#ia-send').click());
await pa.waitForFunction(() => document.querySelectorAll('.ia-conv .bubble.ai').length >= 2 && !document.querySelector('#ia-typing'), { timeout: 40000 }).catch(() => {});
await pa.type('#ia-input', '¿Cómo me llamo?'); await pa.evaluate(() => document.querySelector('#ia-send').click());
await pa.waitForFunction(() => document.querySelectorAll('.ia-conv .bubble.ai').length >= 3 && !document.querySelector('#ia-typing'), { timeout: 40000 }).catch(() => {});
t = await pa.evaluate(() => [...document.querySelectorAll('.ia-conv .bubble.ai .txt')].map(x => x.innerText));
ok('Recuerda la conversación (historial)', /144/.test(t[1] || '') && /Ana/.test(t[2] || ''), t.slice(1).join(' | '));
await pa.reload({ waitUntil: 'networkidle2' }); await pa.waitForSelector('#ia-input', { timeout: 20000 }).catch(() => {});
const n = await pa.evaluate(() => document.querySelectorAll('.ia-conv .bubble').length);
ok('El historial sigue tras recargar (guardado solo en el dispositivo)', n >= 6, n + ' burbujas');
await pa.screenshot({ path: 'tests/out/ia-chat.png' });
// 3) Chat 1:1 cifrado con @IA
await pa.goto(URL + '#/u/' + B.u, { waitUntil: 'networkidle2' }); await sleep(2000);
await pa.evaluate(() => [...document.querySelectorAll('.sheet button')].find(b => /Enviar mensaje|Chatear|Mensaje/i.test(b.innerText))?.click()); await sleep(1500);
const send = async (p, txt) => { await p.focus('#msg-input'); await p.keyboard.type(txt); await p.keyboard.press('Enter'); await sleep(1500); };
await send(pa, 'Beto, ¿vamos a cine el sábado a las 4 pm?');
const chatId = await pa.evaluate(() => document.querySelector('#conv')?.dataset.chat);
await pb.goto(URL + '#/c/' + chatId, { waitUntil: 'networkidle2' }); await sleep(2500);
await send(pb, 'Sure! See you on Saturday at the cinema, I will buy the popcorn');
await sleep(2000);
await send(pa, '@IA ¿qué película de comedia familiar nos recomiendas? Solo una, breve.');
await pa.waitForFunction(() => document.querySelector('#conv .bubble.ai'), { timeout: 40000 }).catch(() => {});
t = await pa.evaluate(() => document.querySelector('#conv .bubble.ai')?.innerText || '');
ok('@IA en chat 1:1 cifrado: responde dentro del chat', /IA DUNA/.test(t) && t.length > 30, t);
await pb.waitForFunction(() => document.querySelector('#conv .bubble.ai'), { timeout: 20000 }).catch(() => {});
t = await pb.evaluate(() => document.querySelector('#conv .bubble.ai')?.innerText || '');
ok('El otro miembro ve la respuesta de IA DUNA (descifrada)', /IA DUNA/.test(t) && /para Ana/.test(t), t);
const enc = await createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });
await enc.auth.signInWithPassword({ email: A.u + '@usuarios.duna.app', password: PASS });
const { data: rows } = await enc.from('messages').select('body,enc').eq('chat_id', chatId);
ok('En el servidor los mensajes 1:1 (incluida la de IA) siguen cifrados', rows?.length >= 4 && rows.every(r => r.body === null && r.enc), (rows || []).length + ' filas');
// 4) Traducir (B traduce el mensaje en inglés... se prueba en A)
await pa.evaluate(() => { const b = [...document.querySelectorAll('#conv .mrow:not(.me) .bubble')].find(x => /popcorn/.test(x.innerText)); b.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 100, clientY: 300 })); });
await sleep(300); await pa.evaluate(() => [...document.querySelectorAll('.ctx-item')].find(b => /Traducir con IA DUNA/.test(b.innerText))?.click());
await pa.waitForFunction(() => { const x = document.querySelector('.tr-block .txt'); return x && x.innerText.length > 5; }, { timeout: 30000 }).catch(() => {});
t = await pa.evaluate(() => document.querySelector('.tr-block')?.innerText || '');
ok('Traducir un mensaje (inline)', /s[áa]bado/i.test(t), t);
// 5) Sugerir respuestas
await pa.click('.comp-box .ia-btn');
await pa.waitForSelector('.ia-sug', { timeout: 30000 }).catch(() => {});
t = await pa.evaluate(() => [...document.querySelectorAll('.ia-sug')].map(x => x.innerText));
ok('Sugerir respuestas (chips)', t.length >= 2, JSON.stringify(t));
if (t.length) { await pa.click('.ia-sug'); const v = await pa.evaluate(() => document.querySelector('#msg-input').value); ok('Tocar una sugerencia la pone en el cuadro de texto', v === t[0], v); await pa.evaluate(() => { const x = document.querySelector('#msg-input'); x.value = ''; x.dispatchEvent(new Event('input')); }); }
// 6) Resumir
await pa.evaluate(() => document.querySelector('.conv-head [aria-label="Más opciones"]').click()); await sleep(300);
await pa.evaluate(() => [...document.querySelectorAll('.ctx-item')].find(b => /Resumir con IA DUNA/.test(b.innerText))?.click());
await pa.waitForSelector('.ia-out .ia-txt', { timeout: 30000 }).catch(() => {});
t = await pa.evaluate(() => document.querySelector('.ia-out')?.innerText || '');
ok('Resumir el chat', /s[áa]bado|cine/i.test(t), t);
await pa.screenshot({ path: 'tests/out/ia-resumen.png' });
await pa.evaluate(() => document.querySelectorAll('.sheet-wrap').forEach(x => x.remove()));
// 7) Grupo con @IA
const sA = enc; const pB = { id: await pa.evaluate(id => window.__duna.S.chats.get(id)?.other_id, chatId) };
const { data: gid, error: ge } = await sA.rpc('create_group', { p_title: 'Prueba IA', p_description: '', p_members: [pB.id] });
ok('Grupo de prueba creado', !ge, ge?.message);
await sleep(2500); await pa.goto(URL + '#/c/' + gid, { waitUntil: 'networkidle2' }); await sleep(2500);
await pb.goto(URL + '#/c/' + gid, { waitUntil: 'networkidle2' }); await sleep(2500);
await send(pb, 'Somos 6 para el asado del domingo');
await sleep(1500);
await pa.focus('#msg-input'); await pa.keyboard.type('@i'); await sleep(300);
const pop = await pa.evaluate(() => !!document.querySelector('.mention-pop:not([hidden]) .ia-mention'));
ok('Al escribir @i aparece IA DUNA para mencionar', pop);
await pa.evaluate(() => document.querySelector('.mention-pop .ia-mention')?.click());
await pa.keyboard.type('si cada uno come 300 g de carne, ¿cuántos kilos compramos?'); await pa.keyboard.press('Enter');
await pb.waitForFunction(() => document.querySelector('#conv .bubble.ai'), { timeout: 40000 }).catch(() => {});
t = await pb.evaluate(() => document.querySelector('#conv .bubble.ai')?.innerText || '');
ok('@IA en grupo: la respuesta la ve todo el grupo', /1[,.]8/.test(t), t);
await pb.screenshot({ path: 'tests/out/ia-grupo.png' });
const list = await pb.evaluate(() => { document.querySelector('.conv-head .back')?.click(); return true; }); await sleep(800);
ok('Sin errores de JavaScript', !errs.length, errs.join(' / '));
console.log(fails ? `${fails} FALLAS` : 'TODO OK', '· usuarios:', A.u, B.u, '· grupo', gid);
await br.close();
