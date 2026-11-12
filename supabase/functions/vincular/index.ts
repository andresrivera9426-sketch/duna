// DUNA · vincular un dispositivo nuevo con un código/QR mostrado en ese dispositivo.
// El dispositivo ya conectado envía el código; se genera un enlace de acceso de un solo uso (sin enviar correo)
// que solo el dispositivo nuevo puede recoger con su secreto.
import { createClient } from 'npm:@supabase/supabase-js@2';
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'método' }, 405);
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: u, error: ue } = await sb.auth.getUser(token);
  if (ue || !u?.user?.email) return json({ error: 'Inicia sesión primero' }, 401);
  const { code } = await req.json().catch(() => ({}));
  const c = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!/^[A-Z2-9]{10}$/.test(c)) return json({ error: 'Código inválido' }, 400);
  const { data: link, error: le } = await sb.auth.admin.generateLink({ type: 'magiclink', email: u.user.email });
  if (le || !link?.properties?.hashed_token) return json({ error: 'No se pudo generar el acceso' }, 500);
  const { data: label, error: ce } = await sb.rpc('link_claim', { p_code: c, p_user: u.user.id, p_token_hash: link.properties.hashed_token, p_email: u.user.email });
  if (ce) return json({ error: ce.message }, 400);
  return json({ ok: true, label });
});
