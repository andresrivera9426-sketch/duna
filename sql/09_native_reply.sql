-- DUNA 09: responder y marcar como leído desde la notificación (con la app cerrada).
-- El teléfono guarda un secreto de respuesta propio (en el Keystore); el servidor solo guarda su SHA-256.
-- No se comparte la sesión del WebView (evita conflictos de rotación del refresh token).
-- El texto de un chat 1:1 llega ya cifrado de extremo a extremo desde el teléfono (enc); el servidor no lo ve.
alter table public.native_devices add column if not exists reply_hash text check (reply_hash is null or reply_hash ~ '^[0-9a-f]{64}$');

create or replace function private.native_device_auth(p_topic text, p_secret text) returns public.native_devices
language plpgsql security definer set search_path = '' as $$
declare d public.native_devices;
begin
  select * into d from public.native_devices where topic = p_topic
    and reply_hash = encode(sha256(convert_to(coalesce(p_secret, ''), 'UTF8')), 'hex');
  if d.id is null then raise exception 'dispositivo no autorizado' using errcode = '28000'; end if;
  -- se actúa como el dueño del dispositivo (auth.uid() dentro de esta transacción)
  perform set_config('request.jwt.claims', json_build_object('sub', d.user_id, 'role', 'authenticated')::text, true);
  update public.native_devices set last_seen = now() where id = d.id;
  return d;
end $$;

create or replace function public.native_mark_read(p_topic text, p_secret text, p_chat uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.native_devices; rr boolean; ct text;
begin
  d := private.native_device_auth(p_topic, p_secret);
  if not private.is_member(p_chat) then raise exception 'no eres miembro'; end if;
  select coalesce((privacy->>'read_receipts')::boolean, true) into rr from public.profiles where id = d.user_id;
  select type into ct from public.chats where id = p_chat;
  update public.chat_members set delivered_at = now(), read_at = case when rr or ct <> 'direct' then now() else read_at end
    where chat_id = p_chat and user_id = d.user_id;
  update public.chat_prefs set my_read_at = now(), marked_unread = false where chat_id = p_chat and user_id = d.user_id;
end $$;

create or replace function public.native_reply(p_topic text, p_secret text, p_chat uuid, p_body text default null, p_enc jsonb default null, p_client_id text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare d public.native_devices; ch public.chats; mid uuid;
begin
  d := private.native_device_auth(p_topic, p_secret);
  select * into ch from public.chats where id = p_chat;
  if ch.id is null or not private.can_send(p_chat) then raise exception 'no puedes enviar a este chat'; end if;
  if ch.type = 'direct' and (p_enc is null or p_body is not null) then raise exception 'los chats 1:1 requieren texto cifrado'; end if;
  if ch.type <> 'direct' and (p_body is null or p_enc is not null or char_length(p_body) > 8000) then raise exception 'texto inválido'; end if;
  if (select count(*) from public.messages where sender_id = d.user_id and created_at > now() - interval '1 minute') > 30 then
    raise exception 'demasiados mensajes, espera un momento'; end if;
  insert into public.messages(chat_id, sender_id, kind, body, enc, client_id)
    values (p_chat, d.user_id, 'text', p_body, p_enc, coalesce(p_client_id, gen_random_uuid()::text)) returning id into mid;
  perform public.native_mark_read(p_topic, p_secret, p_chat);
  return mid;
end $$;

revoke execute on function private.native_device_auth(text, text) from public, anon, authenticated;
revoke execute on function public.native_mark_read(text, text, uuid), public.native_reply(text, text, uuid, text, jsonb, text) from public;
grant execute on function public.native_mark_read(text, text, uuid), public.native_reply(text, text, uuid, text, jsonb, text) to anon, authenticated;
