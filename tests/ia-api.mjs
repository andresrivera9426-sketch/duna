// Prueba real de la función IA DUNA (sin navegador): sesión, modos, límite y rechazo sin sesión.
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
const SB_URL = 'https://jvaepilcxwnfssbxneiu.supabase.co', SB_KEY = 'sb_publishable_Xjb_xWzN36EL0z-5UbQShQ_cX2jkRG1';
const CREATED = '/workspace/duna-test-created.json';
const ok = (n, p, i = '') => console.log((p ? 'OK    ' : 'FALLA ') + n + (i ? ' — ' + i : ''));
const stamp = Date.now().toString(36); const U = { u: 'prueba_ia_' + stamp, n: 'Ana IA', p: 'Duna-Prueba-2026!' };
const created = fs.existsSync(CREATED) ? JSON.parse(fs.readFileSync(CREATED)) : []; created.push(U); fs.writeFileSync(CREATED, JSON.stringify(created, null, 1));
const sb = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });
let r = await sb.rpc('register_user', { p_username: U.u, p_password: U.p, p_display_name: U.n }); if (r.error) throw r.error;
r = await sb.auth.signInWithPassword({ email: U.u + '@usuarios.duna.app', password: U.p }); if (r.error) throw r.error;
const call = async (body, client = sb) => { const t = Date.now(); const { data, error } = await client.functions.invoke('ia', { body }); let e = null; if (error) { try { e = await error.context.json(); } catch { e = { error: error.message }; } } return { data, e, ms: Date.now() - t }; };
const anon = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });
let x = await call({ mode: 'chat', text: 'hola' }, anon); ok('Sin sesión se rechaza', !!x.e && !x.data, JSON.stringify(x.e));
x = await call({ mode: 'chat', me: 'Ana', text: '¿Quién eres y qué modelo de IA usas?', history: [] }); ok('Chat: identidad IA DUNA', x.data?.text && /IA DUNA/.test(x.data.text) && !/gemini|google/i.test(x.data.text), x.ms + ' ms: ' + (x.data?.text || JSON.stringify(x.e)).slice(0, 200));
x = await call({ mode: 'chat', me: 'Ana', text: '¿Y cómo me llamo?', history: [{ r: 'me', t: 'Hola, me llamo Ana y vivo en Puerto Asís' }, { r: 'ia', t: '¡Hola Ana! Encantada.' }] }); ok('Chat: usa el historial', /Ana/.test(x.data?.text || ''), x.ms + ' ms: ' + (x.data?.text || JSON.stringify(x.e)).slice(0, 160));
const ctx = [{ n: 'Beto', t: 'Entonces nos vemos el sábado a las 3 pm en el parque' }, { n: 'Ana', t: 'Listo, yo llevo la torta' }, { n: 'Carla', t: 'Yo llevo las bebidas, ¿cuántos somos?' }, { n: 'Beto', t: 'Somos 8 confirmados' }];
x = await call({ mode: 'mention', me: 'Ana', group: true, text: '@IA ¿cuántas bebidas compramos si cada uno toma 2?', context: ctx }); ok('Mención @IA con contexto', /16/.test(x.data?.text || ''), x.ms + ' ms: ' + (x.data?.text || JSON.stringify(x.e)).slice(0, 200));
x = await call({ mode: 'summary', me: 'Ana', context: ctx }); ok('Resumen', /s[áa]bado/i.test(x.data?.text || ''), x.ms + ' ms: ' + (x.data?.text || JSON.stringify(x.e)).slice(0, 200).replace(/\n/g, ' ⏎ '));
x = await call({ mode: 'suggest', me: 'Ana', context: ctx }); ok('Sugerir respuestas (3)', Array.isArray(x.data?.replies) && x.data.replies.length === 3, x.ms + ' ms: ' + JSON.stringify(x.data?.replies || x.e));
x = await call({ mode: 'translate', text: 'See you on Saturday at the park, I will bring the cake 🎂', to: 'español' }); ok('Traducir al español', /s[áa]bado/i.test(x.data?.text || ''), x.ms + ' ms: ' + (x.data?.text || JSON.stringify(x.e)));
// límite por minuto (5 por defecto): ya van 6 llamadas válidas → la siguiente debe dar 429
x = await call({ mode: 'translate', text: 'hola', to: 'inglés' }); ok('Límite por minuto activo', x.e?.limit === 'min', JSON.stringify(x.e || x.data));
console.log('usuario de prueba:', U.u);
