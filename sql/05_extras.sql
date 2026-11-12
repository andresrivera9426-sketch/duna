-- ===== DUNA 05: push, recuperación, vincular dispositivos, programados, difusión, respuestas rápidas, etiquetas =====
create extension if not exists pg_net with schema extensions;

-- Configuración privada (VAPID, secreto interno). Los valores se cargan aparte, nunca en el repositorio.
create table if not exists private.app_config (k text primary key, v text not null);
alter table private.app_config enable row level security;

-- ---------- Etiquetas de chat ----------
alter table public.chat_prefs add column if not exists labels text[] not null default '{}'
  check (cardinality(labels) <= 20);

drop function if exists public.chat_list();
create function public.chat_list()
returns table(chat_id uuid, type text, title text, description text, avatar_path text, community_id uuid,
  is_announcement boolean, only_admins_send boolean, only_admins_edit boolean, disappearing_seconds int, invite_code text, is_public boolean,
  my_role text, other_id uuid, member_count int, last_message jsonb, unread int,
  muted_until timestamptz, archived boolean, pinned_at timestamptz, marked_unread boolean, wallpaper text, last_message_at timestamptz, labels text[])
language sql stable security definer set search_path = '' as $$
  select c.id, c.type, c.title, c.description, c.avatar_path, c.community_id, c.is_announcement, c.only_admins_send, c.only_admins_edit,
    c.disappearing_seconds, case when m.role in ('owner','admin') or c.type in ('group') then c.invite_code end, c.is_public,
    m.role,
    (select o.user_id from public.chat_members o where o.chat_id = c.id and o.user_id <> auth.uid() and c.type = 'direct' limit 1),
    (select count(*)::int from public.chat_members o where o.chat_id = c.id),
    (select to_jsonb(x) from (select msg.id, msg.sender_id, msg.kind, msg.body, msg.enc, msg.media - 'thumb' as media, msg.meta, msg.deleted_for_all, msg.created_at, msg.view_once
        from public.messages msg where msg.chat_id = c.id and private.msg_visible(msg.id, msg.chat_id, msg.created_at, msg.expires_at)
        order by msg.created_at desc limit 1) x),
    (select count(*)::int from public.messages msg where msg.chat_id = c.id and msg.created_at > coalesce(p.my_read_at, m.joined_at)
        and coalesce(msg.sender_id,'00000000-0000-0000-0000-000000000000') <> auth.uid() and msg.kind <> 'system'
        and private.msg_visible(msg.id, msg.chat_id, msg.created_at, msg.expires_at)),
    p.muted_until, coalesce(p.archived,false), p.pinned_at, coalesce(p.marked_unread,false), p.wallpaper, c.last_message_at, coalesce(p.labels, '{}')
  from public.chat_members m join public.chats c on c.id = m.chat_id
  left join public.chat_prefs p on p.chat_id = c.id and p.user_id = m.user_id
  where m.user_id = auth.uid()
  order by p.pinned_at desc nulls last, c.last_message_at desc
$$;
revoke execute on function public.chat_list() from public, anon;
grant execute on function public.chat_list() to authenticated;

-- ---------- Respuestas rápidas ----------
create table if not exists public.quick_replies (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  shortcut text not null check (shortcut ~ '^[a-z0-9_]{1,24}$'),
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  unique (user_id, shortcut)
);
alter table public.quick_replies enable row level security;
create policy qr_all on public.quick_replies for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.quick_replies to authenticated;

-- ---------- Listas de difusión ----------
create table if not exists public.broadcast_lists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  name text not null check (char_length(name) between 1 and 60),
  members uuid[] not null check (cardinality(members) between 1 and 256),
  created_at timestamptz not null default now()
);
create index if not exists broadcast_lists_owner on public.broadcast_lists(owner_id);
alter table public.broadcast_lists enable row level security;
create policy bl_all on public.broadcast_lists for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
grant select, insert, update, delete on public.broadcast_lists to authenticated;

-- ---------- Mensajes programados ----------
create table if not exists public.scheduled_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  send_at timestamptz not null,
  kind text not null default 'text' check (kind in ('text','image','video','audio','voice','document','location','contact','poll','sticker','gif')),
  body text check (body is null or char_length(body) <= 8000),
  enc jsonb check (enc is null or pg_column_size(enc) < 20000),
  media jsonb,
  meta jsonb check (meta is null or pg_column_size(meta) < 12000),
  created_at timestamptz not null default now(),
  check (send_at < created_at + interval '366 days')
);
create index if not exists sched_due on public.scheduled_messages(send_at);
create index if not exists sched_sender on public.scheduled_messages(sender_id);
alter table public.scheduled_messages enable row level security;
create policy sched_sel on public.scheduled_messages for select to authenticated using (sender_id = (select auth.uid()));
create policy sched_ins on public.scheduled_messages for insert to authenticated
  with check (sender_id = (select auth.uid()) and private.can_send(chat_id) and (select count(*) from public.scheduled_messages s where s.sender_id = (select auth.uid())) < 100);
create policy sched_del on public.scheduled_messages for delete to authenticated using (sender_id = (select auth.uid()));
grant select, insert, delete on public.scheduled_messages to authenticated;

create or replace function private.send_scheduled() returns int
language plpgsql security definer set search_path = '' as $$
declare r record; n int := 0;
begin
  for r in select * from public.scheduled_messages where send_at <= now() order by send_at limit 500 for update skip locked loop
    if exists(
      select 1 from public.chats ch join public.chat_members m on m.chat_id = ch.id and m.user_id = r.sender_id
      where ch.id = r.chat_id and (not ch.only_admins_send or m.role in ('owner','admin')) and ch.type <> 'community'
        and (ch.type <> 'direct' or not exists(select 1 from public.chat_members o where o.chat_id = ch.id and o.user_id <> r.sender_id
          and private.is_blocked_between(o.user_id, r.sender_id)))) then
      insert into public.messages(chat_id, sender_id, kind, body, enc, media, meta, client_id)
      values (r.chat_id, r.sender_id, r.kind, r.body, r.enc, r.media, coalesce(r.meta, '{}'::jsonb) || '{"scheduled":true}'::jsonb, 'sched-' || r.id);
      n := n + 1;
    end if;
    delete from public.scheduled_messages where id = r.id;
  end loop;
  return n;
end $$;
revoke execute on function private.send_scheduled() from public, anon, authenticated;
select cron.schedule('duna-programados', '* * * * *', 'select private.send_scheduled()');

-- ---------- Recuperación de cuenta con código ----------
create table if not exists private.recovery (
  user_id uuid primary key references auth.users(id) on delete cascade,
  code_hash text not null,
  enc_priv_rec jsonb,
  created_at timestamptz not null default now()
);
alter table private.recovery enable row level security;
create table if not exists private.recovery_log (ip text, username text, ok boolean, created_at timestamptz not null default now());
alter table private.recovery_log enable row level security;

create or replace function public.set_recovery(p_code text, p_wrapped jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if char_length(coalesce(p_code,'')) < 20 then raise exception 'Código inválido'; end if;
  if p_wrapped is not null and pg_column_size(p_wrapped) > 4000 then raise exception 'Llave inválida'; end if;
  insert into private.recovery(user_id, code_hash, enc_priv_rec) values (auth.uid(), extensions.crypt(upper(p_code), extensions.gen_salt('bf', 10)), p_wrapped)
  on conflict (user_id) do update set code_hash = excluded.code_hash, enc_priv_rec = excluded.enc_priv_rec, created_at = now();
end $$;

create or replace function public.recovery_status() returns timestamptz
language sql stable security definer set search_path = '' as $$
  select created_at from private.recovery where user_id = auth.uid()
$$;

create or replace function private.recovery_check(p_username text, p_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_ip text; uid uuid; h text; uname text := lower(trim(p_username));
begin
  v_ip := coalesce(split_part(current_setting('request.headers', true)::json->>'x-forwarded-for', ',', 1), 'x');
  if (select count(*) from private.recovery_log l where (l.ip = v_ip or l.username = uname) and not l.ok and l.created_at > now() - interval '1 hour') >= 6 then
    raise exception 'Demasiados intentos. Espera una hora e inténtalo de nuevo';
  end if;
  select p.id, r.code_hash into uid, h from public.profiles p join private.recovery r on r.user_id = p.id where p.username = uname;
  if uid is null or h <> extensions.crypt(upper(coalesce(p_code,'')), h) then
    insert into private.recovery_log(ip, username, ok) values (v_ip, uname, false);
    return null;
  end if;
  insert into private.recovery_log(ip, username, ok) values (v_ip, uname, true);
  return uid;
end $$;

create or replace function public.recover_fetch(p_username text, p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid;
begin
  uid := private.recovery_check(p_username, p_code);
  if uid is null then raise exception 'Usuario o código de recuperación incorrectos'; end if;
  return jsonb_build_object('ok', true, 'enc_priv_rec', (select enc_priv_rec from private.recovery where user_id = uid));
end $$;

create or replace function public.recover_account(p_username text, p_code text, p_new_password text, p_new_wrapped jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid;
begin
  if char_length(coalesce(p_new_password,'')) < 8 then raise exception 'La contraseña debe tener al menos 8 caracteres'; end if;
  uid := private.recovery_check(p_username, p_code);
  if uid is null then raise exception 'Usuario o código de recuperación incorrectos'; end if;
  update auth.users set encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf', 10)), updated_at = now() where id = uid;
  delete from auth.sessions where user_id = uid;
  if p_new_wrapped is not null then
    if pg_column_size(p_new_wrapped) > 4000 then raise exception 'Llave inválida'; end if;
    update public.user_keys set enc_priv = p_new_wrapped, updated_at = now() where user_id = uid;
  end if;
end $$;

-- ---------- Vincular dispositivo (código / QR) ----------
create table if not exists private.device_links (
  code text primary key,
  secret_hash text not null,
  label text,
  ip text,
  user_id uuid references auth.users(id) on delete cascade,
  token_hash text,
  email text,
  created_at timestamptz not null default now()
);
alter table private.device_links enable row level security;

create or replace function public.link_create(p_code text, p_secret text, p_label text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_ip text;
begin
  if p_code !~ '^[A-Z2-9]{10}$' or char_length(coalesce(p_secret,'')) < 32 then raise exception 'Código inválido'; end if;
  v_ip := coalesce(split_part(current_setting('request.headers', true)::json->>'x-forwarded-for', ',', 1), 'x');
  if (select count(*) from private.device_links d where d.ip = v_ip and d.created_at > now() - interval '1 hour') >= 20 then raise exception 'Demasiados intentos'; end if;
  delete from private.device_links where created_at < now() - interval '10 minutes';
  insert into private.device_links(code, secret_hash, label, ip) values (p_code, encode(extensions.digest(p_secret, 'sha256'), 'hex'), left(p_label, 80), v_ip);
end $$;

create or replace function public.link_poll(p_code text, p_secret text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r private.device_links;
begin
  select * into r from private.device_links where code = p_code and secret_hash = encode(extensions.digest(p_secret, 'sha256'), 'hex') and created_at > now() - interval '5 minutes';
  if r.code is null then return jsonb_build_object('status', 'expired'); end if;
  if r.token_hash is null then return jsonb_build_object('status', 'waiting'); end if;
  delete from private.device_links where code = p_code;
  return jsonb_build_object('status', 'ok', 'token_hash', r.token_hash, 'email', r.email);
end $$;

-- Solo para la función de servidor "vincular" (service_role)
create or replace function public.link_claim(p_code text, p_user uuid, p_token_hash text, p_email text) returns text
language plpgsql security definer set search_path = '' as $$
declare lbl text;
begin
  update private.device_links set user_id = p_user, token_hash = p_token_hash, email = p_email
  where code = upper(p_code) and token_hash is null and created_at > now() - interval '5 minutes' returning label into lbl;
  if not found then raise exception 'Código vencido o inválido'; end if;
  return coalesce(lbl, 'Dispositivo');
end $$;

-- ---------- Push ----------
create or replace function public.push_config() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from private.app_config where k in ('vapid_jwk','vapid_public','push_secret','vapid_subject')
$$;

create or replace function public.push_targets(p_kind text, p_id uuid)
returns table(sub_id bigint, endpoint text, p256dh text, auth text, payload jsonb)
language plpgsql stable security definer set search_path = '' as $$
declare msg public.messages; ch public.chats; cl public.calls; sender public.profiles; ttl text;
begin
  if p_kind = 'msg' then
    select * into msg from public.messages where id = p_id;
    if msg.id is null or msg.sender_id is null or msg.kind = 'system' then return; end if;
    select * into ch from public.chats where id = msg.chat_id;
    if ch.type in ('channel','community') then return; end if;
    select * into sender from public.profiles where id = msg.sender_id;
    return query
      select s.id, s.endpoint, s.p256dh, s.auth, jsonb_build_object(
        't', 'msg', 'chat', ch.id, 'ct', ch.type, 'uid', m.user_id,
        'title', case when ch.type = 'direct' then sender.display_name else coalesce(ch.title, 'Grupo') end,
        'from', sender.display_name, 'kind', msg.kind, 'vo', msg.view_once,
        'body', case when msg.enc is null and not msg.view_once then left(msg.body, 180) end,
        'enc', case when msg.enc is not null and pg_column_size(msg.enc) < 2500 then msg.enc end,
        'pub', case when msg.enc is not null then sender.pub_key end,
        'mid', msg.id)
      from public.chat_members m join public.push_subscriptions s on s.user_id = m.user_id
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
      select s.id, s.endpoint, s.p256dh, s.auth, jsonb_build_object('t', 'call', 'chat', ch.id, 'ct', ch.type, 'uid', m.user_id, 'call', cl.id, 'kind', cl.kind,
        'title', case when ch.type = 'direct' then sender.display_name else coalesce(ch.title, 'Grupo') end, 'from', sender.display_name)
      from public.chat_members m join public.push_subscriptions s on s.user_id = m.user_id
      where m.chat_id = ch.id and m.user_id <> cl.caller_id and not private.is_blocked_between(m.user_id, cl.caller_id);
  end if;
end $$;

create or replace function public.push_gone(p_ids bigint[]) returns void
language sql security definer set search_path = '' as $$
  delete from public.push_subscriptions where id = any(p_ids)
$$;

create or replace function private.tg_push() returns trigger
language plpgsql security definer set search_path = '' as $$
declare sec text; k text := case when tg_table_name = 'messages' then 'msg' else 'call' end;
begin
  if k = 'msg' and (new.sender_id is null or new.kind = 'system') then return null; end if;
  select v into sec from private.app_config where private.app_config.k = 'push_secret';
  if sec is null then return null; end if;
  if not exists(select 1 from public.push_subscriptions s join public.chat_members m on m.user_id = s.user_id
                where m.chat_id = new.chat_id) then return null; end if;
  perform net.http_post(
    url := 'https://jvaepilcxwnfssbxneiu.supabase.co/functions/v1/push',
    body := jsonb_build_object('kind', k, 'id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-duna-secret', sec),
    timeout_milliseconds := 8000);
  return null;
exception when others then return null;
end $$;
drop trigger if exists msg_push on public.messages;
create trigger msg_push after insert on public.messages for each row execute function private.tg_push();
drop trigger if exists call_push on public.calls;
create trigger call_push after insert on public.calls for each row execute function private.tg_push();

-- Suscripción push: un usuario solo puede registrar las suyas (ya cubierto por RLS de push_subscriptions)
-- ---------- Archivos propios (para eliminar la cuenta sin dejar archivos) ----------
create or replace function public.my_storage_objects() returns table(bucket text, name text)
language sql stable security definer set search_path = '' as $$
  select o.bucket_id, o.name from storage.objects o where o.owner_id = auth.uid()::text limit 1000
$$;

-- ---------- Permisos ----------
revoke execute on function public.set_recovery(text, jsonb), public.recovery_status(), public.recover_fetch(text, text),
  public.recover_account(text, text, text, jsonb), public.link_create(text, text, text), public.link_poll(text, text),
  public.link_claim(text, uuid, text, text), public.push_config(), public.push_targets(text, uuid), public.push_gone(bigint[]),
  public.my_storage_objects() from public, anon, authenticated;
grant execute on function public.set_recovery(text, jsonb), public.recovery_status(), public.my_storage_objects() to authenticated;
grant execute on function public.recover_fetch(text, text), public.recover_account(text, text, text, jsonb),
  public.link_create(text, text, text), public.link_poll(text, text) to anon, authenticated;
grant execute on function public.link_claim(text, uuid, text, text), public.push_config(), public.push_targets(text, uuid), public.push_gone(bigint[]) to service_role;
revoke execute on function private.recovery_check(text, text), private.tg_push() from public, anon, authenticated;

-- Limpieza de registros
create or replace function private.purge_expired() returns void
language sql security definer set search_path = '' as $$
  delete from public.messages where expires_at is not null and expires_at < now();
  delete from public.stories where expires_at < now() - interval '1 hour';
  update public.calls set status = 'missed', ended_at = now() where status = 'ringing' and created_at < now() - interval '2 minutes';
  update public.calls set status = 'ended', ended_at = now() where status = 'ongoing' and created_at < now() - interval '6 hours';
  delete from private.registration_log where created_at < now() - interval '1 day';
  delete from private.recovery_log where created_at < now() - interval '1 day';
  delete from private.device_links where created_at < now() - interval '10 minutes';
$$;
