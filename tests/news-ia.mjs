// Noticia real → lector integrado (modo read, con su propio límite) → resumen de IA DUNA (modo article)
import { createClient } from '@supabase/supabase-js';
const c = createClient('https://jvaepilcxwnfssbxneiu.supabase.co', 'sb_publishable_Xjb_xWzN36EL0z-5UbQShQ_cX2jkRG1', { auth: { persistSession: false } });
await c.auth.signInWithPassword({ email: 'prueba_ia_b_mwehcbaf@usuarios.duna.app', password: 'Duna-Prueba-2026!' });
const err = async e => e ? ((await e.context?.json?.().catch(() => null))?.error || e.message) : null;
const { data: f } = await c.functions.invoke('descubrir', { body: { type: 'news', cat: 'colombia' } });
let read = null, it;
for (it of f.items.slice(0, 6)) { const { data, error } = await c.functions.invoke('ia', { body: { mode: 'read', url: it.u } }); if (!error && data.text?.length > 600) { read = data; break; } console.log('read fallo', it.s, await err(error)); }
console.log(read ? 'OK   lector' : 'FAIL lector', it.s, '|', read?.title, '|', read?.text.length, 'caracteres');
const t = Date.now(); const { data: s, error: se } = await c.functions.invoke('ia', { body: { mode: 'article', text: read.text.slice(0, 20000), title: read.title } });
console.log(s?.text ? 'OK   resumen IA DUNA' : 'FAIL resumen', Date.now() - t + 'ms', await err(se) || '\n' + s.text.slice(0, 500));
// Límite propio del lector (20/min por persona): 22 lecturas seguidas deben recibir algún 429
let n429 = 0; const ps = []; for (let i = 0; i < 22; i++) ps.push(c.functions.invoke('ia', { body: { mode: 'read', url: 'https://example.com/?' + i } }).then(r => { if (r.error && r.error.context?.status === 429) n429++; }));
await Promise.all(ps); console.log(n429 > 0 ? 'OK   límite del lector activo' : 'FAIL sin límite', '429s:', n429);
