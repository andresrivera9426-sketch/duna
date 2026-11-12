-- Corrige recursión infinita en la política de inserción de mensajes programados
create or replace function private.sched_count(u uuid) returns int language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.scheduled_messages where sender_id = u $$;
revoke all on function private.sched_count(uuid) from public;
grant execute on function private.sched_count(uuid) to authenticated;
drop policy if exists sched_ins on public.scheduled_messages;
create policy sched_ins on public.scheduled_messages for insert to authenticated
  with check (sender_id = (select auth.uid()) and private.can_send(chat_id) and private.sched_count((select auth.uid())) < 100);
