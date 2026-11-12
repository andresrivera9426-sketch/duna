-- DUNA 10: arranque en una sola llamada (antes: perfil -> chat_list -> chat_members -> get_profiles, 4 viajes en serie).
-- security invoker: se aplican las mismas políticas RLS que en las consultas sueltas.
create or replace function public.app_boot(p_keys boolean default false) returns jsonb
language sql stable security invoker set search_path = '' as $$
  with cl as (select * from public.chat_list()),
  mem as (select m.* from public.chat_members m),
  ids as (
    select m.user_id as x from mem m
    union select c.other_id from cl c
    union select (c.last_message->>'sender_id')::uuid from cl c where c.last_message ? 'sender_id'
  )
  select jsonb_build_object(
    'me', (select to_jsonb(p) from public.profiles p where p.id = (select auth.uid())),
    'keys', case when p_keys then (select k.enc_priv from public.user_keys k where k.user_id = (select auth.uid())) end,
    'chats', coalesce((select jsonb_agg(to_jsonb(c)) from cl c), '[]'::jsonb),
    'members', coalesce((select jsonb_agg(to_jsonb(m)) from mem m), '[]'::jsonb),
    'profiles', coalesce((select jsonb_agg(to_jsonb(g)) from public.get_profiles(array(select x from ids where x is not null)) g), '[]'::jsonb),
    'at', now())
$$;
revoke execute on function public.app_boot(boolean) from public, anon;
grant execute on function public.app_boot(boolean) to authenticated;
