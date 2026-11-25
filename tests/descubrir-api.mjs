// Prueba real de la función `descubrir` (noticias y videos) y del límite del lector
import { createClient } from '@supabase/supabase-js';
const SB_URL = 'https://jvaepilcxwnfssbxneiu.supabase.co', SB_KEY = 'sb_publishable_Xjb_xWzN36EL0z-5UbQShQ_cX2jkRG1';
const c = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });
const { error: le } = await c.auth.signInWithPassword({ email: 'prueba_ia_mweh76fc@usuarios.duna.app', password: 'Duna-Prueba-2026!' }); if (le) throw le;
const call = async body => { const t = Date.now(); const { data, error } = await c.functions.invoke('descubrir', { body }); return { data, error: error ? (await error.context?.json?.().catch(() => null))?.error || error.message : null, ms: Date.now() - t }; };
let fail = 0;
const src = await call({ type: 'sources' }); console.log('sources', JSON.stringify(src.data));
for (const cat of ['portada', 'colombia', 'mundo', 'deportes', 'tecnologia', 'economia', 'entretenimiento', 'regional']) {
  const r = await call({ type: 'news', cat }); const it = r.data?.items || [];
  const srcs = [...new Set(it.map(x => x.s))]; const img = it.filter(x => x.i).length;
  const ok = it.length >= 5; if (!ok) fail++;
  console.log(ok ? 'OK  ' : 'FAIL', 'news', cat, it.length, 'items', img, 'img', r.ms + 'ms', srcs.join(', '), '|', it[0]?.t, it[0]?.d);
}
for (const cat of ['tendencias', 'noticias', 'deportes', 'tecnologia', 'ciencia', 'entretenimiento', 'cortos']) {
  const r = await call({ type: 'videos', cat }); const it = r.data?.items || [];
  const ok = it.length >= 5; if (!ok) fail++;
  console.log(ok ? 'OK  ' : 'FAIL', 'videos', cat, it.length, r.ms + 'ms', [...new Set(it.map(x => x.s))].join(', '), '|', it[0]?.t, it[0]?.u);
}
for (const q of ['Petro', 'Colombia', 'fútbol']) { const r = await call({ type: 'search', q }); console.log((r.data?.items?.length ? 'OK  ' : 'FAIL'), 'search', q, r.data?.items?.length, r.ms + 'ms', r.data?.items?.[0]?.t); if (!r.data?.items?.length) fail++; }
const v = await call({ type: 'search', q: 'NASA', what: 'videos' }); console.log(v.data?.items?.length ? 'OK  ' : 'FAIL', 'search videos NASA', v.data?.items?.length);
const bad = await call({ type: 'news', cat: 'x' }); console.log(bad.error ? 'OK  ' : 'FAIL', 'invalid category ->', bad.error);
const anon = await fetch(SB_URL + '/functions/v1/descubrir', { method: 'POST', headers: { apikey: SB_KEY, 'Content-Type': 'application/json' }, body: '{"type":"news","cat":"mundo"}' }); console.log(anon.status === 401 ? 'OK  ' : 'FAIL', 'anon ->', anon.status);
console.log('fails', fail);
