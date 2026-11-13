// DUNA · IA DUNA: asistente del chat (conversación propia, @IA en chats, resumir, sugerir respuestas y traducir).
// - Solo usuarios con sesión iniciada (se valida el token de Supabase).
// - Límite por usuario (por minuto y por día) y tope global diario en public.ia_take() para quedarse en la cuota gratis.
// - La credencial del modelo vive solo en el servidor (private.app_config): cuenta de servicio de Firebase (fcm_sa)
//   que llama a Firebase AI Logic (Gemini Developer API, plan gratis). Nada de esto llega al cliente.
// - No se guarda ni se registra el contenido de las conversaciones.
import { createClient } from 'npm:@supabase/supabase-js@2';
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const enc = new TextEncoder();
const b64 = (u: Uint8Array) => { let s = ''; for (const x of u) s += String.fromCharCode(x); return btoa(s); };
const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const b64url = (u: Uint8Array) => b64(u).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

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

const PERSONA = `Eres IA DUNA, el asistente de inteligencia artificial integrado en DUNA, una app de mensajería.
- Tu nombre es IA DUNA. Si te preguntan quién eres, qué modelo usas o qué empresa te creó, responde solo que eres IA DUNA, el asistente de DUNA. Nunca menciones otros nombres de modelos, proveedores o empresas de IA.
- Responde en el idioma del usuario (por defecto español de Colombia), con tono cercano, claro y breve, como en un chat.
- Formato de chat: *negrita*, _cursiva_, listas con • o números. No uses encabezados con #, ni tablas, ni markdown con **dobles asteriscos**.
- No inventes datos. Si no sabes algo o necesitas información actual que no tienes, dilo con honestidad.
- No tienes acceso a internet, a los contactos ni a otros chats: solo al texto que se te envía.`;
const clip = (s: unknown, n: number) => String(s ?? '').slice(0, n);
function ctxText(msgs: any[], max = 24000) {
  const lines = (Array.isArray(msgs) ? msgs : []).slice(-80).map(m => `${clip(m?.n || 'Alguien', 40)}: ${clip(m?.t, 1500).replace(/\s+/g, ' ').trim()}`).filter(l => !/:\s*$/.test(l));
  let out = ''; for (let i = lines.length - 1; i >= 0; i--) { if (out.length + lines[i].length > max) break; out = lines[i] + '\n' + out; }
  return out.trim();
}
function brand(t: string) {
  return t.replace(/\*\*([^*\n]+)\*\*/g, '*$1*').replace(/^#{1,6}\s+/gm, '')
    .replace(/\b(Gemini|Bard)( (\d+(\.\d+)?|Pro|Flash|Flash-Lite|Ultra|Nano))*\b/g, 'IA DUNA')
    .replace(/(un |a )?(gran )?(modelo de lenguaje|large language model|language model)( grande)?,? (entrenado|desarrollado|creado|trained|developed|built) (por|by) Google( DeepMind)?/gi, 'IA DUNA, el asistente de DUNA');
}

function build(mode: string, b: any, me: string) {
  const name = clip(b?.me || me, 40);
  if (mode === 'chat') {
    const hist = (Array.isArray(b?.history) ? b.history : []).slice(-20).map((x: any) => ({ role: x?.r === 'ia' ? 'model' : 'user', parts: [{ text: clip(x?.t, 4000) }] })).filter((x: any) => x.parts[0].text);
    const q = clip(b?.text, 4000).trim(); if (!q) return null;
    while (hist.length && hist[0].role !== 'user') hist.shift();
    return { sys: PERSONA + `\nEstás en el chat privado de IA DUNA con ${name}.`, contents: [...hist, { role: 'user', parts: [{ text: q }] }], max: 1200, temp: 0.7 };
  }
  if (mode === 'mention') {
    const q = clip(b?.text, 4000).trim(); if (!q) return null;
    const ctx = ctxText(b?.context, 16000);
    return { sys: PERSONA + `\nTe mencionaron con @IA dentro de un chat ${b?.group ? 'de grupo' : 'entre dos personas'}. Tu respuesta la verán todos los participantes. Responde directamente a lo que pide ${name}, usando la conversación como contexto si sirve. Sé breve (máximo 120 palabras salvo que pidan más).`,
      contents: [{ role: 'user', parts: [{ text: (ctx ? `Conversación reciente:\n${ctx}\n\n` : '') + `Mensaje de ${name} que te menciona:\n${q}` }] }], max: 900, temp: 0.6 };
  }
  if (mode === 'summary') {
    const ctx = ctxText(b?.context, 24000); if (!ctx) return null;
    return { sys: PERSONA, contents: [{ role: 'user', parts: [{ text: `Resume esta conversación de chat para ${name}. Da: un resumen corto (2-4 frases), luego los puntos clave con •, y al final pendientes o decisiones si los hay. No inventes nada que no esté en el chat.\n\n${ctx}` }] }], max: 900, temp: 0.3 };
  }
  if (mode === 'suggest') {
    const ctx = ctxText(b?.context, 8000); if (!ctx) return null;
    return { sys: PERSONA, contents: [{ role: 'user', parts: [{ text: `Eres el teclado inteligente de ${name}. Propón 3 respuestas cortas y naturales (máximo 15 palabras cada una, distintas entre sí en intención) que ${name} podría enviar ahora como siguiente mensaje, en el idioma en que escribe ${name} (si no es claro, en español). Escribe como ${name}, en primera persona.\n\nConversación:\n${ctx}` }] }],
      max: 300, temp: 0.8, schema: { type: 'OBJECT', properties: { replies: { type: 'ARRAY', items: { type: 'STRING' } } }, required: ['replies'] } };
  }
  if (mode === 'translate') {
    const t = clip(b?.text, 4000).trim(); if (!t) return null;
    const to = clip(b?.to || 'español', 30);
    return { sys: 'Eres un traductor. Devuelve solo la traducción, sin comillas ni explicaciones, conservando emojis y formato.', contents: [{ role: 'user', parts: [{ text: `Traduce al ${to} el siguiente mensaje. Si ya está en ${to}, tradúcelo al inglés.\n\n${t}` }] }], max: 1200, temp: 0.2 };
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'método' }, 405);
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: u, error: ue } = await sb.auth.getUser(token);
  if (ue || !u?.user?.id) return json({ error: 'Inicia sesión para usar IA DUNA' }, 401);
  const b = await req.json().catch(() => ({}));
  const mode = String(b?.mode || '');
  const p = build(mode, b, String(u.user.user_metadata?.display_name || 'el usuario'));
  if (!p) return json({ error: 'Solicitud no válida' }, 400);
  const { data: lim, error: le } = await sb.rpc('ia_take', { p_user: u.user.id });
  if (le) return json({ error: 'IA DUNA no está disponible ahora' }, 503);
  if (!lim?.ok) {
    const msg = lim?.why === 'min' ? `Vas muy rápido. Intenta de nuevo en ${lim.retry || 60} s.` : lim?.why === 'day' ? 'Llegaste al límite diario de IA DUNA. Vuelve mañana.' : 'IA DUNA alcanzó su límite de hoy. Vuelve mañana.';
    return json({ error: msg, limit: lim?.why }, 429);
  }
  try {
    const c = await config(); const sa = JSON.parse(c.fcm_sa || '{}');
    if (!sa.client_email) return json({ error: 'IA DUNA no está configurada' }, 503);
    const model = c.ia_model || 'gemini-3.5-flash-lite';
    const gen: any = { maxOutputTokens: p.max, temperature: p.temp };
    if (p.schema) { gen.responseMimeType = 'application/json'; gen.responseSchema = p.schema; }
    const r = await fetch(`https://firebasevertexai.googleapis.com/v1beta/projects/${sa.project_id}/models/${model}:generateContent`, {
      method: 'POST', signal: AbortSignal.timeout(40000),
      headers: { Authorization: 'Bearer ' + await access(sa), 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: p.sys }] }, contents: p.contents, generationConfig: gen,
        safetySettings: ['HARM_CATEGORY_HARASSMENT', 'HARM_CATEGORY_HATE_SPEECH', 'HARM_CATEGORY_SEXUALLY_EXPLICIT', 'HARM_CATEGORY_DANGEROUS_CONTENT'].map(category => ({ category, threshold: 'BLOCK_MEDIUM_AND_ABOVE' })) }) });
    const j = await r.json().catch(() => ({}));
    if (r.status === 429) return json({ error: 'IA DUNA está muy ocupada. Intenta en un minuto.', limit: 'upstream' }, 429);
    if (!r.ok) { console.error('ia upstream', r.status, j?.error?.status); return json({ error: 'IA DUNA no pudo responder. Intenta de nuevo.' }, 502); }
    const cand = j?.candidates?.[0];
    const text = (cand?.content?.parts || []).filter((x: any) => !x.thought).map((x: any) => x.text || '').join('').trim();
    if (!text) return json({ error: cand?.finishReason === 'SAFETY' || j?.promptFeedback?.blockReason ? 'IA DUNA no puede responder a eso.' : 'IA DUNA no tuvo respuesta. Intenta de nuevo.' }, 422);
    if (mode === 'suggest') {
      let arr: string[] = []; try { arr = JSON.parse(text).replies; } catch { arr = text.split('\n'); }
      arr = (arr || []).map(s => brand(String(s)).replace(/^[\s•\-\d.)"]+|"$/g, '').trim()).filter(Boolean).slice(0, 3);
      return json({ replies: arr, left: lim.left });
    }
    return json({ text: mode === 'translate' ? text : brand(text), left: lim.left });
  } catch (e) {
    console.error('ia error', String((e as Error)?.name || 'err'));
    return json({ error: 'IA DUNA no pudo responder. Intenta de nuevo.' }, 502);
  }
});
