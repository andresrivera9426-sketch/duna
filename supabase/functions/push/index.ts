// DUNA · envío de notificaciones push (disparado por la base de datos vía pg_net)
import { createClient } from 'npm:@supabase/supabase-js@2';
import { sendPush } from './webpush.js';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
let cfg: Record<string, string> | null = null;
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'método' }, 405);
  if (!cfg) { const { data, error } = await sb.rpc('push_config'); if (error) return json({ error: error.message }, 500); cfg = data; }
  if (!cfg?.push_secret || req.headers.get('x-duna-secret') !== cfg.push_secret) return json({ error: 'no autorizado' }, 401);
  const { kind, id } = await req.json().catch(() => ({}));
  if (!['msg', 'call'].includes(kind) || typeof id !== 'string') return json({ error: 'datos' }, 400);
  const { data: targets, error } = await sb.rpc('push_targets', { p_kind: kind, p_id: id });
  if (error) return json({ error: error.message }, 500);
  const gone: number[] = []; const res: number[] = [];
  await Promise.all((targets || []).map(async (t: any) => {
    try {
      const r = await sendPush(t, JSON.stringify(t.payload), cfg, { ttl: kind === 'call' ? 45 : 86400, urgency: 'high', topic: kind === 'call' ? undefined : String(t.payload.chat).replace(/-/g, '').slice(0, 32) });
      res.push(r.status); if (r.status === 404 || r.status === 410) gone.push(t.sub_id);
    } catch (_e) { res.push(0); }
  }));
  if (gone.length) await sb.rpc('push_gone', { p_ids: gone });
  return json({ sent: res.length, status: res, gone: gone.length });
});
