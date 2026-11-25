// DUNA · IA DUNA: asistente del chat.
// Modos: chat (conversación propia, con internet, fotos, notas de voz e imágenes generadas), mention (@IA en un chat),
// summary, suggest, translate, rewrite (mejorar un mensaje), describe (preguntar por una foto), transcribe (nota de voz) y tts (leer en voz alta).
// - Solo usuarios con sesión iniciada; límite por usuario (minuto/día) y tope global diario en public.ia_take().
// - El modelo se llama con la cuenta de servicio de Firebase guardada en el servidor (private.app_config.fcm_sa) vía Firebase AI Logic
//   (Gemini Developer API, plan gratis). Ninguna credencial llega al cliente.
// - Internet sin llaves de pago: búsqueda web (Bing), Google Noticias (RSS), Wikipedia, clima (Open-Meteo), TRM oficial (datos.gov.co),
//   tasas de cambio (open.er-api.com) y lectura de páginas (r.jina.ai). Imágenes generadas con Pollinations (gratis, sin llave).
// - No se guarda ni se registra el contenido de las conversaciones.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { encodeBase64 } from 'jsr:@std/encoding@1/base64';
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const enc = new TextEncoder();
const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const b64url = (u: Uint8Array) => encodeBase64(u).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const clip = (s: unknown, n: number) => String(s ?? '').slice(0, n);
const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Mobile Safari/537.36';
const BOT_UA = 'DUNA-IA/1.0 (+https://andresrivera9426-sketch.github.io/duna/)';

let cfg: Record<string, string> | null = null, cfgAt = 0;
async function config() {
  if (cfg && Date.now() - cfgAt < 300e3) return cfg;
  const { data, error } = await sb.rpc('ia_config'); if (error) throw new Error('config');
  cfg = data; cfgAt = Date.now(); return cfg!;
}
let tok: { t: string; exp: number } | null = null;
async function access(sa: any) {
  if (tok && tok.exp > Date.now() + 60e3) return tok.t;
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(enc.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const claim = b64url(enc.encode(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/cloud-platform', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })));
  const pem = String(sa.private_key).replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const key = await crypto.subtle.importKey('pkcs8', unb64(pem), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(head + '.' + claim)));
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: head + '.' + claim + '.' + b64url(sig) }) });
  const j = await r.json(); if (!j.access_token) throw new Error('oauth ' + r.status);
  tok = { t: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 }; return tok.t;
}
class Upstream extends Error { constructor(public status: number, msg: string) { super(msg); } }
const SAFETY = ['HARM_CATEGORY_HARASSMENT', 'HARM_CATEGORY_HATE_SPEECH', 'HARM_CATEGORY_SEXUALLY_EXPLICIT', 'HARM_CATEGORY_DANGEROUS_CONTENT'].map(category => ({ category, threshold: 'BLOCK_MEDIUM_AND_ABOVE' }));
// Resumir noticias y documentos: las noticias hablan de crímenes, accidentes o conflictos; solo se bloquea lo de riesgo alto
const SAFETY_NEWS = SAFETY.map(x => ({ ...x, threshold: 'BLOCK_ONLY_HIGH' }));
async function gen(model: string, body: any, ms: number) {
  const c = await config(); const sa = JSON.parse(c.fcm_sa || '{}');
  if (!sa.client_email) throw new Upstream(503, 'sin configuración');
  const r = await fetch(`https://firebasevertexai.googleapis.com/v1beta/projects/${sa.project_id}/models/${model}:generateContent`, {
    method: 'POST', signal: AbortSignal.timeout(ms), headers: { Authorization: 'Bearer ' + await access(sa), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Upstream(r.status, String(j?.error?.status || r.status));
  return j;
}
/** Intenta con cada modelo en orden (el más capaz primero); si uno tarda demasiado o falla, sigue con el siguiente. */
async function genFallback(models: [string, number][], body: any) {
  let last: unknown = null;
  for (const [i, [m, ms]] of models.entries()) {
    try { return { j: await gen(m, body, ms), model: m }; }
    catch (e) {
      last = e; console.warn('ia modelo', m, e instanceof Upstream ? e.status : (e as Error)?.name);
      // Límite por minuto del nivel gratuito: un reintento corto con el mismo modelo suele bastar
      if (i === 0 && e instanceof Upstream && e.status === 429) { await new Promise(r => setTimeout(r, 2500)); try { return { j: await gen(m, body, ms), model: m }; } catch (e2) { last = e2; console.warn('ia modelo reintento', m, e2 instanceof Upstream ? e2.status : (e2 as Error)?.name); } }
    }
  }
  // Si el respaldo falló con error interno, devolver el error del modelo principal (más informativo: p. ej. 429)
  throw last;
}

// ===== Fecha y hora (Colombia) =====
function nowCO() {
  const d = new Date();
  return d.toLocaleString('es-CO', { timeZone: 'America/Bogota', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' (hora de Colombia, UTC−5)';
}
const PERSONA = () => `Eres IA DUNA, el asistente de inteligencia artificial de DUNA, una app de mensajería hecha en Colombia.
Fecha y hora actual: ${nowCO()}. Úsala para todo lo relacionado con "hoy", "mañana", edades, plazos, etc.
Identidad: te llamas IA DUNA. Si te preguntan quién eres, qué modelo usas, qué empresa te creó o si eres otro asistente, responde solo que eres IA DUNA, el asistente de DUNA, sin nombrar ni negar a otros asistentes, modelos o empresas de IA.
Límites: no puedes crear alarmas, recordatorios ni tareas, ni enviar mensajes por la persona; si lo pide, dile que lo haga en la mini app «Notas y recordatorios» de DUNA (Descubrir → Mini apps) y ofrece redactar el texto. No prometas acciones que no puedes hacer.
Estilo: español de Colombia, cálido, claro y al grano, como en un chat (tutea, salvo que la persona use "usted"). Respuestas cortas por defecto; más largas solo si te lo piden o el tema lo necesita.
Formato de chat: *negrita*, _cursiva_, listas con • o números. No uses encabezados con #, tablas ni **dobles asteriscos**.
Honestidad: no inventes datos. Para noticias, precios, clima, resultados deportivos, horarios o cualquier cosa que pueda haber cambiado, usa las herramientas de internet antes de responder y menciona brevemente de dónde sale el dato. Si no encuentras algo, dilo.
Puedes ver fotos y escuchar notas de voz que te envíen. Si te piden crear/dibujar/generar una imagen y tienes la herramienta generar_imagen, úsala.
Seguridad: en salud, leyes o dinero da orientación general y recomienda consultar a un profesional cuando sea serio.`;

// ===== Herramientas de internet (gratis, sin llaves) =====
type Src = { t: string; u: string };
const strip = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/\s+/g, ' ').trim();
async function getText(url: string, ms = 12000, headers: Record<string, string> = {}) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'es-CO,es;q=0.9,en;q=0.6', ...headers }, signal: AbortSignal.timeout(ms), redirect: 'follow' });
  if (!r.ok) throw new Error('http ' + r.status);
  return await r.text();
}
function bingUrl(u: string) {
  try { const x = new URL(u.replace(/&amp;/g, '&')); if (x.hostname.endsWith('bing.com') && x.pathname.startsWith('/ck/')) { const p = x.searchParams.get('u') || ''; if (p.startsWith('a1')) return atob(p.slice(2).replace(/-/g, '+').replace(/_/g, '/')); } return x.toString(); } catch { return u; }
}
async function buscarWeb(q: string, srcs: Src[]) {
  const html = await getText(`https://www.bing.com/search?q=${encodeURIComponent(q)}&setlang=es&cc=CO&count=8`);
  const out: any[] = [];
  for (const blk of html.split('<li class="b_algo"').slice(1)) {
    const a = blk.match(/<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/); if (!a) continue;
    const p = blk.match(/<p[^>]*>([\s\S]*?)<\/p>/) || blk.match(/class="b_lineclamp\d?[^"]*"[^>]*>([\s\S]*?)<\/(?:p|div)>/);
    const url = bingUrl(a[1]); if (!/^https?:/.test(url)) continue;
    out.push({ titulo: strip(a[2]).slice(0, 140), url, fragmento: strip(p?.[1] || '').slice(0, 320) });
    if (out.length >= 6) break;
  }
  out.slice(0, 4).forEach(r => srcs.push({ t: r.titulo, u: r.url }));
  if (!out.length) { const n = await noticias(q, srcs).catch(() => ({ resultados: [] })); return { resultados: [], noticias: n.resultados, nota: 'La búsqueda web no devolvió resultados; se muestran noticias.' }; }
  return { resultados: out };
}
async function noticias(q: string, srcs: Src[]) {
  const xml = await getText(`https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=es-419&gl=CO&ceid=CO:es-419`);
  const items = xml.split('<item>').slice(1, 8).map(it => {
    const g = (t: string) => strip((it.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)) || [])[1]?.replace(/<!\[CDATA\[|\]\]>/g, '') || '');
    return { titulo: g('title'), url: g('link'), fecha: g('pubDate'), medio: g('source') };
  }).filter(x => x.titulo);
  items.slice(0, 4).forEach(r => srcs.push({ t: r.titulo, u: r.url }));
  return { resultados: items };
}
async function wikipedia(q: string, srcs: Src[], lang = 'es') {
  const s = JSON.parse(await getText(`https://${lang}.wikipedia.org/w/rest.php/v1/search/page?q=${encodeURIComponent(q)}&limit=3`, 10000, { 'User-Agent': BOT_UA }));
  const pages = (s.pages || []).slice(0, 2);
  const res = await Promise.all(pages.map(async (p: any) => {
    const j = JSON.parse(await getText(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(p.key)}`, 10000, { 'User-Agent': BOT_UA }).catch(() => '{}'));
    const url = j?.content_urls?.desktop?.page || `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(p.key)}`;
    srcs.push({ t: 'Wikipedia: ' + p.title, u: url });
    return { titulo: p.title, resumen: clip(j.extract || strip(p.excerpt || ''), 1500), url };
  }));
  return { resultados: res };
}
const WMO: Record<number, string> = { 0: 'despejado', 1: 'mayormente despejado', 2: 'parcialmente nublado', 3: 'nublado', 45: 'niebla', 48: 'niebla con escarcha', 51: 'llovizna débil', 53: 'llovizna', 55: 'llovizna fuerte', 61: 'lluvia débil', 63: 'lluvia', 65: 'lluvia fuerte', 80: 'chubascos débiles', 81: 'chubascos', 82: 'chubascos fuertes', 95: 'tormenta', 96: 'tormenta con granizo', 99: 'tormenta fuerte con granizo' };
async function clima(lugar: string, srcs: Src[]) {
  const g = JSON.parse(await getText(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(lugar)}&count=1&language=es`, 10000));
  const p = g?.results?.[0]; if (!p) return { error: 'No encontré ese lugar' };
  const f = JSON.parse(await getText(`https://api.open-meteo.com/v1/forecast?latitude=${p.latitude}&longitude=${p.longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=3`, 10000));
  srcs.push({ t: 'Open-Meteo: ' + p.name, u: `https://open-meteo.com/en/docs#latitude=${p.latitude}&longitude=${p.longitude}` });
  const cur = f.current || {}; const d = f.daily || {};
  return { lugar: [p.name, p.admin1, p.country].filter(Boolean).join(', '), ahora: { ...cur, estado: WMO[cur.weather_code] || cur.weather_code }, unidades: f.current_units,
    proximos_dias: (d.time || []).map((t: string, i: number) => ({ fecha: t, estado: WMO[d.weather_code[i]] || d.weather_code[i], max: d.temperature_2m_max[i], min: d.temperature_2m_min[i], prob_lluvia: d.precipitation_probability_max?.[i] })) };
}
async function tasaCambio(de: string, a: string, srcs: Src[]) {
  de = clip(de || 'USD', 3).toUpperCase(); a = clip(a || 'COP', 3).toUpperCase();
  const out: any = {};
  if ([de, a].includes('COP') && [de, a].includes('USD')) {
    const t = JSON.parse(await getText('https://www.datos.gov.co/resource/32sa-8pi3.json?$order=vigenciadesde%20DESC&$limit=1', 10000).catch(() => '[]'))[0];
    if (t) { out.trm_oficial = { valor_cop_por_usd: +t.valor, vigencia: t.vigenciadesde?.slice(0, 10), fuente: 'Superintendencia Financiera (datos.gov.co)' }; srcs.push({ t: 'TRM oficial · datos.gov.co', u: 'https://www.datos.gov.co/Econom-a-y-Finanzas/Tasa-de-Cambio-Representativa-del-Mercado-TRM/32sa-8pi3' }); }
  }
  const j = JSON.parse(await getText(`https://open.er-api.com/v6/latest/${de}`, 10000).catch(() => '{}'));
  if (j?.rates?.[a]) { out.tasa_mercado = { [`1 ${de}`]: `${j.rates[a]} ${a}`, actualizado: j.time_last_update_utc }; srcs.push({ t: 'ExchangeRate-API', u: 'https://www.exchangerate-api.com' }); }
  return Object.keys(out).length ? out : { error: 'No pude obtener la tasa' };
}
// Texto de página compacto para el modelo: sin URLs ni imágenes (ahorra tokens y tiempo)
const compact = (t: string, n: number) => clip(String(t || '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/https?:\/\/\S+/g, '').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n'), n);
// Extractor de lectura propio (respaldo si el lector externo no responde): toma el contenido principal y lo pasa a markdown simple
function readable(html: string) {
  let h = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style|noscript|svg|nav|footer|header|aside|form|iframe|template|figure)[\s\S]*?<\/\1>/gi, ' ');
  h = h.replace(/<([a-z0-9]+)((?:\s+[\w:-]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*\/?>/gi, (m, tag, attrs) => { const id = /\bid\s*=\s*["']([^"']+)/i.exec(attrs)?.[1]; const cls = /\bclass\s*=\s*["']([^"']+)/i.exec(attrs)?.[1]; const href = /\bhref\s*=\s*["'](https?:[^"']+)/i.exec(attrs)?.[1];
    return '<' + tag + (id ? ` id="${id}"` : '') + (cls ? ` class="${cls}"` : '') + (href ? ` href="${href}"` : '') + '>'; });
  const pick = (re: RegExp) => { const m = re.exec(h); return m ? h.slice(m.index) : null; };
  let main = pick(/<article\b/i) || pick(/<main\b/i) || pick(/id="(mw-content-text|content|main-content|article-body)"/i) || h;
  main = main.replace(/<(table|sup)[\s\S]*?<\/\1>/gi, ' ').replace(/<div class="[^"]*(reflist|navbox|infobox|toc|mw-references)[^"]*">/gi, '<div>');
  const md = main.replace(/<h([1-4])[^>]*>/gi, (_, n) => '\u0001\u0001' + '#'.repeat(+n) + ' ').replace(/<\/h[1-4]>/gi, '\u0001\u0001').replace(/<li[^>]*>/gi, '\u0001- ').replace(/<(p|br|div|tr|section)[^>]*>/gi, '\u0001\u0001');
  return strip(md).replace(/\s*\u0001\s*/g, '\n').replace(/\[ editar \]/g, '').replace(/[ \t]+/g, ' ').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
function safeUrl(u: string) {
  try { const x = new URL(u); if (!/^https?:$/.test(x.protocol)) return null; const h = x.hostname;
    if (/^(localhost|.*\.local|.*\.internal|.*supabase\.(co|in|net))$/i.test(h) || /^(10|127|169\.254|192\.168|0)\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || h.includes(':')) return null; return x.toString(); } catch { return null; }
}
async function leerPagina(u: string, srcs: Src[]) {
  const url = safeUrl(u); if (!url) return { error: 'URL no permitida' };
  let txt = '';
  try { txt = await getText('https://r.jina.ai/' + url, 15000, { 'User-Agent': BOT_UA, 'X-Return-Format': 'text' }); }
  catch { txt = readable(await getText(url, 12000)); }
  srcs.push({ t: new URL(url).hostname, u: url });
  return { url, contenido: compact(txt, 7000) };
}
async function generarImagen(prompt: string, out: { image?: any }) {
  const seed = Math.floor(Math.random() * 1e9);
  const r = await fetch(`https://image.pollinations.ai/prompt/${encodeURIComponent(clip(prompt, 600))}?width=768&height=768&nologo=true&seed=${seed}`, { signal: AbortSignal.timeout(60000), headers: { 'User-Agent': BOT_UA } });
  const ct = r.headers.get('content-type') || '';
  if (!r.ok || !ct.startsWith('image/')) return { error: 'No se pudo generar la imagen ahora' };
  const bytes = new Uint8Array(await r.arrayBuffer()); if (bytes.length > 2_500_000) return { error: 'Imagen demasiado grande' };
  out.image = { m: ct.split(';')[0], d: encodeBase64(bytes) };
  return { ok: true, nota: 'La imagen ya se generó y se mostrará al usuario debajo de tu mensaje. Descríbela en una frase; no pongas enlaces.' };
}
const P = (props: Record<string, string>, req: string[]) => ({ type: 'OBJECT', properties: Object.fromEntries(Object.entries(props).map(([k, d]) => [k, { type: 'STRING', description: d }])), required: req });
const DECL_WEB = [
  { name: 'buscar_web', description: 'Busca en internet (resultados de un buscador). Úsala para datos actuales, precios, horarios, resultados, personas, lugares o cualquier cosa que no sepas con certeza.', parameters: P({ consulta: 'Texto de búsqueda, conciso' }, ['consulta']) },
  { name: 'noticias', description: 'Últimas noticias (Google Noticias, Colombia/Latinoamérica) sobre un tema.', parameters: P({ tema: 'Tema de las noticias' }, ['tema']) },
  { name: 'wikipedia', description: 'Resumen enciclopédico de Wikipedia sobre un tema, persona, lugar o concepto.', parameters: P({ tema: 'Tema', idioma: 'Código de idioma de Wikipedia (es por defecto, en para inglés)' }, ['tema']) },
  { name: 'clima', description: 'Clima actual y pronóstico de 3 días para una ciudad o lugar.', parameters: P({ lugar: 'Ciudad o lugar, p. ej. "Puerto Asís"' }, ['lugar']) },
  { name: 'tasa_cambio', description: 'Tasa de cambio entre monedas (incluye la TRM oficial de Colombia si es USD/COP).', parameters: P({ de: 'Código ISO de la moneda origen, p. ej. USD', a: 'Código ISO de la moneda destino, p. ej. COP' }, ['de', 'a']) },
  { name: 'leer_pagina', description: 'Lee el texto de una página web (por ejemplo un enlace que compartió el usuario o un resultado de búsqueda).', parameters: P({ url: 'URL completa http(s)' }, ['url']) },
];
const DECL_IMG = { name: 'generar_imagen', description: 'Genera una imagen nueva a partir de una descripción (solo cuando el usuario pide crear, dibujar o generar una imagen).', parameters: P({ descripcion_en_ingles: 'Descripción detallada de la imagen, en inglés (estilo, colores, composición)' }, ['descripcion_en_ingles']) };
async function runTool(name: string, a: any, srcs: Src[], out: { image?: any }) {
  try {
    if (name === 'buscar_web') return await buscarWeb(clip(a?.consulta, 200), srcs);
    if (name === 'noticias') return await noticias(clip(a?.tema, 200), srcs);
    if (name === 'wikipedia') return await wikipedia(clip(a?.tema, 200), srcs, /^[a-z]{2}$/.test(a?.idioma || '') ? a.idioma : 'es');
    if (name === 'clima') return await clima(clip(a?.lugar, 100), srcs);
    if (name === 'tasa_cambio') return await tasaCambio(a?.de, a?.a, srcs);
    if (name === 'leer_pagina') return await leerPagina(clip(a?.url, 2000), srcs);
    if (name === 'generar_imagen') return await generarImagen(a?.descripcion_en_ingles || '', out);
    return { error: 'herramienta desconocida' };
  } catch (e) { return { error: 'No se pudo consultar: ' + clip((e as Error)?.message, 80) }; }
}

function brand(t: string) {
  // Quita frases donde el modelo hable de su propia identidad con nombres de otros asistentes o proveedores (las noticias sobre esas marcas no se tocan)
  const self = /(\b(soy|eres|me llamo|me crearon|me cre[oó]|me desarroll|me entren|fui (creado|desarrollado|entrenado)|modelo de lenguaje|I am|I'm|trained by|developed by|built by)\b)/i;
  const brands = /\b(Gemini|Bard|Google|DeepMind|OpenAI|ChatGPT|GPT-?\d|Anthropic|Claude|Meta AI|Llama)\b/i;
  t = t.split('\n').map(l => l.split(/(?<=[.!?])[ \t]+/).filter(x => !(self.test(x) && brands.test(x))).join(' ')).join('\n').replace(/\n{3,}/g, '\n\n').trim() || 'Soy IA DUNA, el asistente de DUNA.';
  return clean(t).replace(/\*\*([^*\n]+)\*\*/g, '*$1*').replace(/^#{1,6}\s+/gm, '');
}
// Quita restos técnicos que a veces se cuelan en la salida del modelo (p. ej. {"word_timestamps":true} en medio de una hora)
function clean(t: string) {
  return t.replace(/\{\s*["'„“”«]?[a-z_]{3,40}["'„“”»]?\s*:\s*(true|false|null|-?\d+(\.\d+)?|["'„“”][^{}"\n]{0,60}["'„“”])\s*\}/gi, '').replace(/<\/?(ctrl\d+|eos|bos|start_of_turn|end_of_turn)>/gi, '').replace(/[ \t]{2,}/g, ' ');
}
const textOf = (j: any) => (j?.candidates?.[0]?.content?.parts || []).filter((x: any) => !x.thought && x.text).map((x: any) => x.text).join('').trim();

/** Conversación con herramientas (hasta 4 rondas de llamadas). */
async function withTools(models: [string, number][], sys: string, contents: any[], { img = false, max = 1500, temp = 0.7, think = 'medium' } = {}) {
  const srcs: Src[] = []; const out: { image?: any } = {};
  const tools = [{ functionDeclarations: img ? [...DECL_WEB, DECL_IMG] : DECL_WEB }];
  let used = models;
  for (let step = 0; step < 5; step++) {
    const last = step === 4;
    const body: any = { systemInstruction: { parts: [{ text: sys }] }, contents, generationConfig: { maxOutputTokens: max, temperature: temp, thinkingConfig: { thinkingLevel: think } }, safetySettings: SAFETY };
    if (!last) body.tools = tools;
    const { j, model } = await genFallback(used, body);
    used = used.slice(used.findIndex(x => x[0] === model)); // si el modelo grande falló, no se reintenta en las rondas siguientes
    const cand = j?.candidates?.[0]; const parts = cand?.content?.parts || [];
    const calls = parts.filter((p: any) => p.functionCall);
    if (!calls.length) {
      const text = textOf(j);
      if (!text) throw new Upstream(422, cand?.finishReason === 'SAFETY' || j?.promptFeedback?.blockReason ? 'safety' : 'empty');
      const seen = new Set<string>(); const sources = srcs.filter(s => s.u && !seen.has(s.u) && seen.add(s.u)).slice(0, 5);
      return { text: brand(text), sources, image: out.image, model };
    }
    contents.push(cand.content);
    const res = await Promise.all(calls.slice(0, 4).map(async (p: any) => ({ functionResponse: { name: p.functionCall.name, ...(p.functionCall.id ? { id: p.functionCall.id } : {}), response: { result: await runTool(p.functionCall.name, p.functionCall.args, srcs, out) } } })));
    contents.push({ role: 'user', parts: res });
  }
  throw new Upstream(422, 'empty');
}

function ctxText(msgs: any[], max = 24000) {
  const lines = (Array.isArray(msgs) ? msgs : []).slice(-150).map(m => `${clip(m?.n || 'Alguien', 40)}: ${clip(m?.t, 1500).replace(/\s+/g, ' ').trim()}`).filter(l => !/:\s*$/.test(l));
  let out = ''; for (let i = lines.length - 1; i >= 0; i--) { if (out.length + lines[i].length > max) break; out = lines[i] + '\n' + out; }
  return out.trim();
}
const MIME_DOC = /^(application\/pdf|text\/(plain|csv|markdown|html))$/;
const MIME_IMG = /^image\/(jpeg|png|webp|heic|heif)$/, MIME_AUD = /^audio\/(webm|ogg|mp4|m4a|mpeg|mp3|wav|aac|flac|x-m4a|3gpp)$/;
function mediaParts(b: any) {
  const parts: any[] = [];
  for (const im of (Array.isArray(b?.images) ? b.images : []).slice(0, 3)) if (MIME_IMG.test(im?.m) && typeof im?.d === 'string' && im.d.length < 2_000_000) parts.push({ inlineData: { mimeType: im.m, data: im.d } });
  const a = b?.audio; if (a && MIME_AUD.test(a.m) && typeof a.d === 'string' && a.d.length < 9_000_000) parts.push({ inlineData: { mimeType: a.m === 'audio/x-m4a' || a.m === 'audio/m4a' ? 'audio/mp4' : a.m, data: a.d } });
  const d = b?.doc; if (d && MIME_DOC.test(d.m) && typeof d.d === 'string' && d.d.length < 9_000_000) parts.push({ inlineData: { mimeType: d.m, data: d.d } });
  return parts;
}
function wav(pcm: Uint8Array, rate = 24000) {
  const h = new DataView(new ArrayBuffer(44)); const w = (o: number, s: string) => [...s].forEach((c, i) => h.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); h.setUint32(4, 36 + pcm.length, true); w(8, 'WAVE'); w(12, 'fmt '); h.setUint32(16, 16, true); h.setUint16(20, 1, true); h.setUint16(22, 1, true);
  h.setUint32(24, rate, true); h.setUint32(28, rate * 2, true); h.setUint16(32, 2, true); h.setUint16(34, 16, true); w(36, 'data'); h.setUint32(40, pcm.length, true);
  const o = new Uint8Array(44 + pcm.length); o.set(new Uint8Array(h.buffer)); o.set(pcm, 44); return o;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'método' }, 405);
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: u, error: ue } = await sb.auth.getUser(token);
  if (ue || !u?.user?.id) return json({ error: 'Inicia sesión para usar IA DUNA' }, 401);
  const b = await req.json().catch(() => ({}));
  const mode = String(b?.mode || '');
  const name = clip(b?.me || 'la persona', 40);
  const media = mediaParts(b);
  const c = await config().catch(() => null); if (!c) return json({ error: 'IA DUNA no está disponible ahora' }, 503);
  const FAST = c.ia_model || 'gemini-3.5-flash-lite', BACKUP = c.ia_model_backup || 'gemini-3.1-flash-lite', DEEP = c.ia_model_deep || 'gemini-3.6-flash', TTS = c.ia_model_tts || 'gemini-3.8-flash-lite-tts';
  const QUICK: [string, number][] = [[FAST, 30000], [BACKUP, 25000]];
  // validación previa (antes de gastar cupo)
  const q = (mode === 'article' ? compact(b?.text, 7000) : clip(b?.text, 6000)).trim();
  const need: Record<string, boolean> = { chat: !!(q || media.length), mention: !!q, summary: Array.isArray(b?.context) && b.context.length > 0, suggest: Array.isArray(b?.context) && b.context.length > 0,
    translate: !!q, rewrite: !!q, read: true, article: !!q, doc: media.some(p => MIME_DOC.test(p.inlineData.mimeType)), describe: media.some(p => p.inlineData.mimeType.startsWith('image/')), transcribe: media.some(p => p.inlineData.mimeType.startsWith('audio/')), tts: !!q };
  if (!need[mode]) return json({ error: 'Solicitud no válida' }, 400);
  // Lector dentro de la app: trae el texto limpio de una página (sin modelo de IA, no gasta cupo de IA)
  if (mode === 'read') {
    const url = safeUrl(clip(b?.url, 2000)); if (!url) return json({ error: 'Enlace no permitido' }, 400);
    // límite propio del lector (no gasta cupo de IA): 20 páginas/minuto y 300/día por persona
    const { data: rl, error: re } = await sb.rpc('rl_take', { p_user: u.user.id, p_key: 'read', p_min: 20, p_day: 300 });
    if (re) return json({ error: 'El lector no está disponible ahora' }, 503);
    if (!rl?.ok) return json({ error: rl?.why === 'min' ? `Vas muy rápido. Intenta de nuevo en ${rl.retry || 60} s.` : 'Llegaste al límite diario del lector. Vuelve mañana.', limit: rl?.why }, 429);
    try {
      let raw = '';
      try { raw = await getText('https://r.jina.ai/' + url, 9000, { 'User-Agent': BOT_UA, 'X-Return-Format': 'markdown', 'X-Retain-Images': 'none', 'X-Remove-Selector': 'header, nav, footer, aside, form, [role=navigation], [role=banner], [role=contentinfo], .navbox, .mw-jump-link, #mw-navigation, #mw-panel, .vector-header-container, .vector-column-start, .mw-editsection, .reference, .noprint, .cookie, .advert, .ads' }); }
      catch { const html = await getText(url, 12000); const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || ''; raw = 'Title: ' + strip(t) + '\n\nMarkdown Content:\n' + readable(html); }
      const title = (raw.match(/^Title:\s*(.+)$/m)?.[1] || new URL(url).hostname).trim();
      const body = raw.includes('Markdown Content:') ? raw.split('Markdown Content:').slice(1).join('Markdown Content:') : raw;
      return json({ url, title: clip(title, 200), site: new URL(url).hostname.replace(/^www\./, ''), text: clip(body.replace(/\n{3,}/g, '\n\n').trim(), 40000) });
    } catch { return json({ error: 'No se pudo abrir esa página ahora' }, 502); }
  }
  const { data: lim, error: le } = await sb.rpc('ia_take', { p_user: u.user.id });
  if (le) return json({ error: 'IA DUNA no está disponible ahora' }, 503);
  if (!lim?.ok) {
    const msg = lim?.why === 'min' ? `Vas muy rápido. Intenta de nuevo en ${lim.retry || 60} s.` : lim?.why === 'day' ? 'Llegaste al límite diario de IA DUNA. Vuelve mañana.' : 'IA DUNA alcanzó su límite de hoy. Vuelve mañana.';
    return json({ error: msg, limit: lim?.why }, 429);
  }
  try {
    let r: any;
    if (mode === 'chat') {
      const hist = (Array.isArray(b?.history) ? b.history : []).slice(-40).map((x: any) => ({ role: x?.r === 'ia' ? 'model' : 'user', parts: [{ text: clip(x?.t, 4000) || '…' }] }));
      while (hist.length && hist[0].role !== 'user') hist.shift();
      const parts = [...media, { text: q || (media.some(p => p.inlineData.mimeType.startsWith('audio/')) ? '(Nota de voz: escúchala y responde a lo que dice)' : '¿Qué ves en esta imagen?') }];
      const models: [string, number][] = b?.deep ? [[DEEP, 40000], [FAST, 30000], [BACKUP, 25000]] : QUICK;
      r = await withTools(models, PERSONA() + `\nEstás en el chat privado de IA DUNA con ${name}.`, [...hist, { role: 'user', parts }], { img: true, max: 2500, think: b?.deep ? 'low' : 'medium' });
    } else if (mode === 'mention') {
      const ctx = ctxText(b?.context, 20000);
      r = await withTools(QUICK, PERSONA() + `\nTe mencionaron con @IA dentro de un chat ${b?.group ? 'de grupo' : 'entre dos personas'}. Tu respuesta la verán todos los participantes. Responde directamente a lo que pide ${name}, usando la conversación como contexto si sirve. Sé breve (máximo 150 palabras salvo que pidan más).`,
        [{ role: 'user', parts: [...media, { text: (ctx ? `Conversación reciente:\n${ctx}\n\n` : '') + (media.length ? '(Se adjunta el archivo al que responde el mensaje.)\n' : '') + `Mensaje de ${name} que te menciona:\n${q}` }] }], { max: 1500, temp: 0.6 });
    } else if (mode === 'tts') {
      const { j } = await genFallback([[TTS, 30000]], { contents: [{ role: 'user', parts: [{ text: clip(q.replace(/[*_~`#•]/g, '').replace(/https?:\/\/\S+/g, ''), 1500) }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: c.ia_voice || 'Kore' } } } } });
      const p = (j?.candidates?.[0]?.content?.parts || []).find((x: any) => x.inlineData);
      if (!p) throw new Upstream(422, 'empty');
      let mt = String(p.inlineData.mimeType || ''); let data = p.inlineData.data;
      if (/L16|pcm/i.test(mt)) { const rate = +(mt.match(/rate=(\d+)/)?.[1] || 24000); data = encodeBase64(wav(unb64(data), rate)); mt = 'audio/wav'; }
      return json({ audio: { m: mt.split(';')[0], d: data }, left: lim.left });
    } else {
      let sys = PERSONA(), prompt = '', max = 1200, temp = 0.4, schema: any = null;
      if (mode === 'summary') { prompt = `Resume esta conversación de chat para ${name}. Da: un resumen corto (2-4 frases), luego los puntos clave con •, y al final pendientes, fechas o decisiones si los hay. No inventes nada que no esté en el chat.\n\n${ctxText(b?.context, 40000)}`; max = 1500; temp = 0.3; }
      if (mode === 'suggest') { prompt = `Eres el teclado inteligente de ${name}. Propón 3 respuestas cortas y naturales (máximo 15 palabras cada una, distintas entre sí en intención) que ${name} podría enviar ahora como siguiente mensaje, en el idioma en que escribe ${name} (si no es claro, en español). Escribe como ${name}, en primera persona.\n\nConversación:\n${ctxText(b?.context, 10000)}`; max = 400; temp = 0.8; schema = { type: 'OBJECT', properties: { replies: { type: 'ARRAY', items: { type: 'STRING' } } }, required: ['replies'] }; }
      if (mode === 'translate') { const to = clip(b?.to || 'español', 30); sys = 'Eres un traductor. Devuelve solo la traducción, sin comillas ni explicaciones, conservando emojis y formato.'; prompt = `Traduce al ${to} el siguiente mensaje. Si ya está en ${to}, tradúcelo al inglés.\n\n${q}`; temp = 0.2; }
      if (mode === 'rewrite') {
        const st: Record<string, string> = { corregir: 'Corrige ortografía, tildes y gramática sin cambiar el tono ni el sentido.', formal: 'Hazlo más formal y respetuoso (usted).', amable: 'Hazlo más cálido y amable.', corto: 'Hazlo más corto y directo.', divertido: 'Hazlo más divertido, con algún emoji.', ingles: 'Tradúcelo al inglés natural.' };
        sys = 'Eres un asistente de redacción para mensajes de chat en español de Colombia. Devuelve solo el mensaje reescrito, sin comillas ni explicaciones.'; prompt = `${st[b?.style] || st.corregir}\n\nMensaje:\n${q}`; temp = 0.5; max = 800;
      }
      if (mode === 'article') { prompt = `Resume este artículo para ${name}: primero la idea principal en 2-3 frases y luego los puntos clave con •. No inventes nada que no esté en el texto.${b?.title ? `\nTítulo: ${clip(b.title, 200)}` : ''}\n\n${q}`; max = 1200; temp = 0.3; }
      if (mode === 'doc') { prompt = q ? `Sobre el documento adjunto: ${q}` : 'Lee el documento adjunto y resume: de qué se trata (2-3 frases), los puntos o datos clave con •, y fechas, montos o pendientes si los hay.'; max = 1800; temp = 0.3; }
      if (mode === 'describe') { prompt = q ? `Sobre la imagen adjunta: ${q}` : 'Describe la imagen adjunta en 2-4 frases. Si tiene texto, transcríbelo. Si es un documento o recibo, resume los datos clave.'; max = 1000; }
      if (mode === 'transcribe') { sys = 'Eres un transcriptor. Devuelve solo la transcripción literal del audio, con puntuación. Si no se entiende nada, responde exactamente: (no se entiende)'; prompt = 'Transcribe esta nota de voz.'; temp = 0; max = 2000; }
      const gc: any = { maxOutputTokens: max, temperature: temp }; if (schema) { gc.responseMimeType = 'application/json'; gc.responseSchema = schema; }
      const { j } = await genFallback(QUICK, { systemInstruction: { parts: [{ text: sys }] }, contents: [{ role: 'user', parts: [...(['describe', 'transcribe', 'doc'].includes(mode) ? media : []), { text: prompt }] }], generationConfig: gc, safetySettings: ['article', 'doc'].includes(mode) ? SAFETY_NEWS : SAFETY });
      const text = textOf(j); if (!text) console.error('ia vacío', mode, j?.promptFeedback?.blockReason || '', j?.candidates?.[0]?.finishReason || ''); if (!text) throw new Upstream(422, j?.promptFeedback?.blockReason || j?.candidates?.[0]?.finishReason === 'SAFETY' ? 'safety' : 'empty');
      if (mode === 'suggest') {
        let arr: string[] = []; try { arr = JSON.parse(text).replies; } catch { arr = text.split('\n'); }
        arr = (arr || []).map(s => brand(String(s)).replace(/^[\s•\-\d.)"]+|"$/g, '').trim()).filter(Boolean).slice(0, 3);
        return json({ replies: arr, left: lim.left });
      }
      r = { text: ['translate', 'rewrite', 'transcribe'].includes(mode) ? clean(text) : brand(text) };
    }
    return json({ text: r.text, sources: r.sources || [], image: r.image || null, left: lim.left });
  } catch (e) {
    const st = e instanceof Upstream ? e.status : 0;
    console.error('ia error', mode, st || (e as Error)?.name);
    if (st === 429) return json({ error: 'IA DUNA está muy ocupada. Intenta en un minuto.', limit: 'upstream' }, 429);
    if (st === 422) return json({ error: (e as Error).message === 'safety' ? 'IA DUNA no puede responder a eso.' : 'IA DUNA no tuvo respuesta. Intenta de nuevo.' }, 422);
    if (st === 400) return json({ error: 'IA DUNA no pudo procesar ese archivo o mensaje.' }, 400);
    return json({ error: 'IA DUNA no pudo responder. Intenta de nuevo.' }, 502);
  }
});
