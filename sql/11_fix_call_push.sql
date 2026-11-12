-- DUNA 11: las llamadas NO enviaban push. En tg_push la condición "k = 'msg' and (new.sender_id ...)"
-- se evalúa también para la tabla calls (que no tiene sender_id) -> error "record new has no field sender_id",
-- que el "exception when others" ocultaba: nunca se llamaba a la función push para llamadas.
create or replace function private.tg_push() returns trigger
language plpgsql security definer set search_path = '' as $$
declare sec text; k text := case when tg_table_name = 'messages' then 'msg' else 'call' end; r jsonb := to_jsonb(new);
begin
  if k = 'msg' then
    if (r->>'sender_id') is null or (r->>'kind') = 'system' then return null; end if;
  end if;
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
exception when others then
  raise warning 'tg_push %: %', k, sqlerrm; -- ya no se pierde en silencio
  return null;
end $$;
revoke execute on function private.tg_push() from public, anon, authenticated;
