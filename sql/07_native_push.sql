-- DUNA 07: notificaciones nativas (app Android/iOS) sin terceros.
-- Cada dispositivo nativo registra un "topic" aleatorio (secreto) y una clave AES-256 propia.
-- La función push cifra la notificación con esa clave, la guarda en una cola corta (para recuperar
-- lo que se pierda si el teléfono estuvo sin red) y la difunde por Supabase Realtime (broadcast) al topic.
-- Si el dispositivo tiene token FCM (cuando exista un proyecto Firebase), también se envía por FCM.
create table if not exists public.native_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  platform text not null check (platform in ('android','ios')),
  topic text not null unique check (char_length(topic) between 24 and 64 and topic ~ '^[A-Za-z0-9_-]+$'),
  key text not null check (char_length(key) between 40 and 64),
  fcm_token text check (char_length(fcm_token) < 4096),
  label text check (char_length(label) < 80),
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);
create index if not exists native_devices_user on public.native_devices(user_id);
alter table public.native_devices enable row level security;
drop policy if exists nd_all on public.native_devices;
create policy nd_all on public.native_devices for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.native_devices from anon;
grant select, insert, update, delete on public.native_devices to authenticated;

create table if not exists private.native_queue (
  id bigint generated always as identity primary key,
  device_id uuid not null references public.native_devices(id) on delete cascade,
  data jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists native_queue_dev on private.native_queue(device_id, id);

-- Destinos nativos de un mensaje o llamada (mismas reglas que push_targets: silenciados, bloqueos, canales)
create or replace function public.native_targets(p_kind text, p_id uuid)
returns table(device_id uuid, topic text, key text, fcm_token text, payload jsonb)
language plpgsql stable security definer set search_path = '' as $$
declare msg public.messages; ch public.chats; cl public.calls; sender public.profiles;
begin
  if p_kind = 'msg' then
    select * into msg from public.messages where id = p_id;
    if msg.id is null or msg.sender_id is null or msg.kind = 'system' then return; end if;
    select * into ch from public.chats where id = msg.chat_id;
    if ch.type in ('channel','community') then return; end if;
    select * into sender from public.profiles where id = msg.sender_id;
    return query
      select d.id, d.topic, d.key, d.fcm_token, jsonb_build_object(
        't', 'msg', 'chat', ch.id, 'ct', ch.type, 'uid', m.user_id,
        'title', case when ch.type = 'direct' then sender.display_name else coalesce(ch.title, 'Grupo') end,
        'from', sender.display_name, 'kind', msg.kind, 'vo', msg.view_once,
        'body', case when msg.enc is null and not msg.view_once then left(msg.body, 180) end,
        'enc', case when msg.enc is not null and pg_column_size(msg.enc) < 2500 then msg.enc end,
        'mid', msg.id, 'at', extract(epoch from msg.created_at)::bigint)
      from public.chat_members m join public.native_devices d on d.user_id = m.user_id
      left join public.chat_prefs p on p.chat_id = m.chat_id and p.user_id = m.user_id
      where m.chat_id = ch.id and m.user_id <> msg.sender_id
        and (p.muted_until is null or p.muted_until < now())
        and not private.is_blocked_between(m.user_id, msg.sender_id);
  elsif p_kind = 'call' then
    select * into cl from public.calls where id = p_id;
    if cl.id is null or cl.status <> 'ringing' then return; end if;
    select * into ch from public.chats where id = cl.chat_id;
    select * into sender from public.profiles where id = cl.caller_id;
    return query
      select d.id, d.topic, d.key, d.fcm_token, jsonb_build_object('t', 'call', 'chat', ch.id, 'ct', ch.type, 'uid', m.user_id,
        'call', cl.id, 'kind', cl.kind, 'at', extract(epoch from cl.created_at)::bigint,
        'title', case when ch.type = 'direct' then sender.display_name else coalesce(ch.title, 'Grupo') end, 'from', sender.display_name)
      from public.chat_members m join public.native_devices d on d.user_id = m.user_id
      where m.chat_id = ch.id and m.user_id <> cl.caller_id and not private.is_blocked_between(m.user_id, cl.caller_id);
  end if;
end $$;

-- Cola: la función push guarda cada notificación cifrada y recibe su id
create or replace function public.native_enqueue(p_items jsonb)
returns table(id bigint, device_id uuid)
language sql security definer set search_path = '' as $$
  insert into private.native_queue(device_id, data)
  select (x->>'device')::uuid, x->'data' from jsonb_array_elements(p_items) x
  returning native_queue.id, native_queue.device_id
$$;

-- El dispositivo (sin sesión: solo conoce su topic secreto) recupera lo que no recibió en vivo
create or replace function public.native_pending(p_topic text, p_after bigint default 0)
returns table(id bigint, data jsonb)
language plpgsql security definer set search_path = '' as $$
declare dev uuid;
begin
  select d.id into dev from public.native_devices d where d.topic = p_topic;
  if dev is null then return; end if;
  update public.native_devices set last_seen = now() where native_devices.id = dev and last_seen < now() - interval '5 minutes';
  return query select q.id, q.data from private.native_queue q
    where q.device_id = dev and q.id > coalesce(p_after, 0) and q.created_at > now() - interval '2 days'
    order by q.id limit 50;
end $$;

create or replace function public.native_fcm_gone(p_device uuid) returns void
language sql security definer set search_path = '' as $$
  update public.native_devices set fcm_token = null where id = p_device
$$;

-- El disparador ahora también avisa si hay dispositivos nativos en el chat
create or replace function private.tg_push() returns trigger
language plpgsql security definer set search_path = '' as $$
declare sec text; k text := case when tg_table_name = 'messages' then 'msg' else 'call' end;
begin
  if k = 'msg' and (new.sender_id is null or new.kind = 'system') then return null; end if;
  select v into sec from private.app_config where private.app_config.k = 'push_secret';
  if sec is null then return null; end if;
  if not exists(select 1 from public.chat_members m where m.chat_id = new.chat_id and (
       exists(select 1 from public.push_subscriptions s where s.user_id = m.user_id) or
       exists(select 1 from public.native_devices d where d.user_id = m.user_id))) then return null; end if;
  perform net.http_post(
    url := 'https://jvaepilcxwnfssbxneiu.supabase.co/functions/v1/push',
    body := jsonb_build_object('kind', k, 'id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-duna-secret', sec),
    timeout_milliseconds := 8000);
  return null;
exception when others then return null;
end $$;

create or replace function private.purge_native() returns void
language sql security definer set search_path = '' as $$
  delete from private.native_queue where created_at < now() - interval '2 days';
  delete from public.native_devices where last_seen < now() - interval '60 days';
$$;

revoke execute on function public.native_targets(text, uuid), public.native_enqueue(jsonb), public.native_pending(text, bigint),
  public.native_fcm_gone(uuid), private.purge_native() from public, anon, authenticated;
grant execute on function public.native_targets(text, uuid), public.native_enqueue(jsonb), public.native_fcm_gone(uuid) to service_role;
grant execute on function public.native_pending(text, bigint) to anon, authenticated, service_role;
revoke execute on function private.tg_push() from public, anon, authenticated;
select cron.schedule('duna-nativo', '17 * * * *', 'select private.purge_native()');

-- La función push también lee la cuenta de servicio de Firebase (si algún día se configura)
create or replace function public.push_config() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from private.app_config where k in ('vapid_jwk','vapid_public','push_secret','vapid_subject','fcm_sa')
$$;
revoke execute on function public.push_config() from public, anon, authenticated;
grant execute on function public.push_config() to service_role;
