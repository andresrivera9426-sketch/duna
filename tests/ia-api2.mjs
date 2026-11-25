// Prueba real de las capacidades nuevas de IA DUNA (internet, fuentes, fecha, fotos, voz, imágenes, voz alta, reescritura, modo razonar).
// Reparte las llamadas entre cuentas de prueba existentes para no chocar con el límite por minuto.
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs'; import { execSync } from 'node:child_process';
const SB_URL = 'https://jvaepilcxwnfssbxneiu.supabase.co', SB_KEY = 'sb_publishable_Xjb_xWzN36EL0z-5UbQShQ_cX2jkRG1';
const USERS = (process.env.REUSE || 'prueba_ia_mweh76fc,prueba_ia_a_mwehcbaf,prueba_ia_b_mwehcbaf,prueba_ia_a_mwehcmpq').split(',');
const clients = [];
for (const u of USERS) { const c = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } }); const { error } = await c.auth.signInWithPassword({ email: u + '@usuarios.duna.app', password: 'Duna-Prueba-2026!' }); if (!error) clients.push(c); }
let k = 0; let fails = 0;
const ok = (n, p, i = '') => { if (!p) fails++; console.log((p ? 'OK    ' : 'FALLA ') + n + (i ? ' — ' + String(i).replace(/\s+/g, ' ').slice(0, 260) : '')); };
const call = async body => { const c = clients[k++ % clients.length]; const t = Date.now(); const { data, error } = await c.functions.invoke('ia', { body: { me: 'Ana', ...body } }); let e = null; if (error) { try { e = await error.context.json(); } catch { e = { error: error.message }; } } return { d: data, e, ms: Date.now() - t }; };
const only = process.env.ONLY ? process.env.ONLY.split(',') : null; const want = n => !only || only.includes(n);
let x;
if (want('fecha')) { x = await call({ mode: 'chat', text: '¿Qué fecha y hora es hoy? Responde corto.' }); const dia = new Date().toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: 'numeric' }); ok('Sabe la fecha y hora de Colombia', (x.d?.text || '').includes(dia) && /noviembre/i.test(x.d?.text || ''), x.ms + ' ms: ' + (x.d?.text || JSON.stringify(x.e))); }
if (want('trm')) { x = await call({ mode: 'chat', text: '¿A cuánto está el dólar hoy en Colombia (TRM)?' }); ok('Internet: TRM con fuente', /\d[.,]?\d{3}/.test(x.d?.text || '') && x.d?.sources?.length > 0, x.ms + ' ms: ' + (x.d?.text || JSON.stringify(x.e)) + ' | fuentes: ' + JSON.stringify(x.d?.sources)); }
if (want('clima')) { x = await call({ mode: 'chat', text: '¿Cómo está el clima ahora en Puerto Asís?' }); ok('Internet: clima', /°|grados/i.test(x.d?.text || '') && x.d?.sources?.length > 0, x.ms + ' ms: ' + (x.d?.text || JSON.stringify(x.e)) + ' | ' + JSON.stringify(x.d?.sources)); }
if (want('noticias')) { x = await call({ mode: 'chat', text: 'Dame 3 noticias de hoy de Colombia, muy breve.' }); ok('Internet: noticias con enlaces', x.d?.sources?.length >= 2, x.ms + ' ms: ' + (x.d?.text || JSON.stringify(x.e)).slice(0, 160) + ' | ' + JSON.stringify(x.d?.sources?.slice(0, 2))); }
if (want('web')) { x = await call({ mode: 'chat', text: 'Busca en internet quién es el actual presidente de Colombia y desde cuándo.' }); ok('Internet: búsqueda web', x.d?.sources?.length > 0, x.ms + ' ms: ' + (x.d?.text || JSON.stringify(x.e)) + ' | ' + JSON.stringify(x.d?.sources?.slice(0, 2))); }
let img = null;
if (want('imagen')) { x = await call({ mode: 'chat', text: 'Genera una imagen de un perro golden retriever con sombrero vueltiao en la playa' }); img = x.d?.image; ok('Genera imágenes', img?.d?.length > 5000 && /^image\//.test(img.m), x.ms + ' ms: ' + (x.d?.text || JSON.stringify(x.e)) + ' | ' + (img ? img.m + ' ' + Math.round(img.d.length * 0.75 / 1024) + ' KB' : 'sin imagen')); if (img) fs.writeFileSync('tests/out/ia-gen.jpg', Buffer.from(img.d, 'base64')); }
if (want('foto')) { const d = img?.d || fs.readFileSync('tests/out/ia-gen.jpg').toString('base64'); x = await call({ mode: 'describe', images: [{ m: 'image/jpeg', d }], text: '¿Qué animal hay y qué lleva puesto?' }); ok('Entiende fotos', /perro|golden/i.test(x.d?.text || ''), x.ms + ' ms: ' + (x.d?.text || JSON.stringify(x.e)));
  x = await call({ mode: 'chat', text: '¿Dónde está este perro?', images: [{ m: 'image/jpeg', d }] }); ok('Foto en el chat IA DUNA', /playa|arena|mar/i.test(x.d?.text || ''), x.ms + ' ms: ' + (x.d?.text || JSON.stringify(x.e))); }
if (want('voz')) {
  x = await call({ mode: 'tts', text: 'Hola, soy Ana. Recuérdame comprar arroz y panela mañana a las ocho.' });
  ok('Leer en voz alta (audio)', x.d?.audio?.d?.length > 10000, x.ms + ' ms: ' + (x.d?.audio ? x.d.audio.m + ' ' + Math.round(x.d.audio.d.length * 0.75 / 1024) + ' KB' : JSON.stringify(x.e)));
  if (x.d?.audio) {
    fs.writeFileSync('/tmp/ia-tts.wav', Buffer.from(x.d.audio.d, 'base64'));
    execSync('ffmpeg -y -loglevel error -i /tmp/ia-tts.wav -c:a libopus -b:a 24k /tmp/ia-voz.webm');
    const d = fs.readFileSync('/tmp/ia-voz.webm').toString('base64');
    x = await call({ mode: 'transcribe', audio: { m: 'audio/webm', d } }); ok('Transcribe nota de voz (webm/opus como la app)', /arroz/i.test(x.d?.text || '') && /panela/i.test(x.d?.text || ''), x.ms + ' ms: ' + (x.d?.text || JSON.stringify(x.e)));
    x = await call({ mode: 'chat', audio: { m: 'audio/webm', d } }); ok('Nota de voz al chat IA DUNA', /arroz|panela|record/i.test(x.d?.text || ''), x.ms + ' ms: ' + (x.d?.text || JSON.stringify(x.e)));
  }
}
if (want('rewrite')) { x = await call({ mode: 'rewrite', style: 'corregir', text: 'ola como estas, mañana nos bemos aya en el parke' }); ok('Mejorar/corregir mensaje', /hola/i.test(x.d?.text || '') && /parque/i.test(x.d?.text || ''), x.ms + ' ms: ' + (x.d?.text || JSON.stringify(x.e))); }
if (want('deep')) { x = await call({ mode: 'chat', deep: true, text: 'Si un bus sale de Puerto Asís a las 7:40 a. m. y tarda 5 h 35 min, ¿a qué hora llega? Responde corto.' }); ok('Modo "pensar más" (con respaldo si tarda)', /1:15|13:15/.test(x.d?.text || ''), x.ms + ' ms: ' + (x.d?.text || JSON.stringify(x.e))); }
if (want('mention')) { x = await call({ mode: 'mention', group: true, text: '@IA ¿va a llover el sábado en Mocoa?', context: [{ n: 'Beto', t: 'El sábado paseo a Mocoa' }] }); ok('@IA con internet en un grupo', x.d?.sources?.length > 0, x.ms + ' ms: ' + (x.d?.text || JSON.stringify(x.e))); }
if (want('marca')) { x = await call({ mode: 'chat', text: '¿Eres Gemini o ChatGPT? ¿Qué empresa te hizo?' }); ok('Marca IA DUNA', /IA DUNA/.test(x.d?.text || '') && !/gemini|google|openai/i.test(x.d?.text || ''), x.d?.text); }
if (want('leer')) { x = await call({ mode: 'read', url: 'https://es.wikipedia.org/wiki/Puerto_As%C3%ADs' }); ok('Lector integrado (página → texto limpio)', (x.d?.text || '').length > 1500 && /Puerto As/i.test(x.d?.title || ''), x.ms + ' ms: ' + (x.d?.title || JSON.stringify(x.e)) + ' · ' + (x.d?.text || '').length + ' caracteres');
  if (x.d?.text) { const y = await call({ mode: 'article', title: x.d.title, text: x.d.text.slice(0, 20000) }); ok('Resumir artículo/enlace', /Putumayo/i.test(y.d?.text || ''), y.ms + ' ms: ' + (y.d?.text || JSON.stringify(y.e))); }
  const z = await call({ mode: 'read', url: 'http://169.254.169.254/latest/meta-data/' }); ok('Lector bloquea direcciones internas (SSRF)', !!z.e, JSON.stringify(z.e)); }
if (want('url')) { x = await call({ mode: 'chat', text: 'Resume en 3 puntos esta página: https://es.wikipedia.org/wiki/R%C3%ADo_Putumayo' }); ok('Chat: resumir un enlace', x.d?.sources?.some(s => /wikipedia/.test(s.u)), x.ms + ' ms: ' + (x.d?.text || JSON.stringify(x.e))); }
if (want('pdf')) { execSync('python3 tests/mkpdf.py /tmp/ia-doc.pdf'); const d = fs.readFileSync('/tmp/ia-doc.pdf').toString('base64');
  x = await call({ mode: 'doc', doc: { m: 'application/pdf', d } }); ok('Leer documento PDF', /1\.?250\.?000|arriendo/i.test(x.d?.text || ''), x.ms + ' ms: ' + (x.d?.text || JSON.stringify(x.e)));
  x = await call({ mode: 'doc', text: '¿Cuál es la fecha límite de pago?', doc: { m: 'text/plain', d: Buffer.from('Recibo de agua EMPOAGUAS. Valor: $48.300. Fecha límite de pago: 5 de diciembre de 2026.').toString('base64') } }); ok('Leer documento de texto con pregunta', /5 de diciembre|05\/12|diciembre 5/i.test(x.d?.text || ''), x.ms + ' ms: ' + (x.d?.text || JSON.stringify(x.e))); }
console.log(fails ? fails + ' FALLAS' : 'TODO OK');
