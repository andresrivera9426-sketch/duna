// Borra los archivos de Storage de las cuentas de prueba (inicia sesión con cada una y borra solo lo suyo).
// Las filas de auth.users de las cuentas prueba_* se borran después con SQL (ON DELETE CASCADE limpia perfiles, mensajes, etc.).
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
const URL = 'https://jvaepilcxwnfssbxneiu.supabase.co', KEY = 'sb_publishable_Xjb_xWzN36EL0z-5UbQShQ_cX2jkRG1';
const list = [];
for (const f of ['/workspace/duna-test-created.json', '/workspace/duna-test-users.json']) if (fs.existsSync(f)) { const d = JSON.parse(fs.readFileSync(f)); for (const u of (Array.isArray(d) ? d : Object.values(d))) list.push({ u: u.u || u.username, p: u.p || u.password }); }
let total = 0;
for (const { u, p } of list) {
  if (!/^prueba_/.test(u)) { console.log('omitido (no es de prueba):', u); continue; }
  const sb = createClient(URL, KEY, { auth: { persistSession: false } });
  const { error } = await sb.auth.signInWithPassword({ email: `${u}@usuarios.duna.app`, password: p });
  if (error) { console.log(u, '→ no inicia sesión (', error.message, ')'); continue; }
  const { data: files } = await sb.rpc('my_storage_objects'); const byB = {};
  for (const f of files || []) (byB[f.bucket] = byB[f.bucket] || []).push(f.name);
  let n = 0; for (const [b, names] of Object.entries(byB)) for (let i = 0; i < names.length; i += 100) { const { data, error: e } = await sb.storage.from(b).remove(names.slice(i, i + 100)); if (e) console.log(u, 'error', e.message); n += data?.length || 0; }
  await sb.from('push_subscriptions').delete().neq('endpoint', ''); await sb.auth.signOut();
  console.log(u, '→ archivos borrados:', n); total += n;
}
console.log('TOTAL archivos borrados:', total);
