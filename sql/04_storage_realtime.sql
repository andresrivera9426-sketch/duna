-- ===== Almacenamiento (límites pequeños) =====
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types) values
  ('avatars','avatars', true, 307200, array['image/webp','image/jpeg','image/png']),
  ('media','media', false, 16777216, null),
  ('stories','stories', false, 10485760, array['image/webp','image/jpeg','image/png','video/mp4','video/webm','application/octet-stream'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy duna_avatars_ins on storage.objects for insert to authenticated with check (
  bucket_id = 'avatars' and ((storage.foldername(name))[1] = (select auth.uid())::text
    or ((storage.foldername(name))[1] = 'g' and private.can_edit_chat(private.try_uuid((storage.foldername(name))[2])))));
create policy duna_avatars_upd on storage.objects for update to authenticated using (bucket_id = 'avatars' and owner_id = (select auth.uid())::text);
create policy duna_avatars_del on storage.objects for delete to authenticated using (bucket_id = 'avatars' and owner_id = (select auth.uid())::text);
create policy duna_avatars_sel on storage.objects for select to authenticated using (bucket_id = 'avatars' and owner_id = (select auth.uid())::text);

create policy duna_media_sel on storage.objects for select to authenticated using (bucket_id = 'media' and private.media_allowed(name));
create policy duna_media_ins on storage.objects for insert to authenticated with check (
  bucket_id = 'media' and (storage.foldername(name))[2] = (select auth.uid())::text
  and private.is_member(private.try_uuid((storage.foldername(name))[1])));
create policy duna_media_del on storage.objects for delete to authenticated using (bucket_id = 'media' and owner_id = (select auth.uid())::text);

create policy duna_stories_sel on storage.objects for select to authenticated using (
  bucket_id = 'stories' and private.can_view_stories(private.try_uuid((storage.foldername(name))[1])));
create policy duna_stories_ins on storage.objects for insert to authenticated with check (
  bucket_id = 'stories' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy duna_stories_del on storage.objects for delete to authenticated using (bucket_id = 'stories' and owner_id = (select auth.uid())::text);

-- ===== Tiempo real =====
alter publication supabase_realtime add table public.messages, public.chat_members, public.message_reactions,
  public.poll_votes, public.chat_pins, public.chats, public.calls, public.stories, public.view_once_opens;

-- Canales privados: escritura/typing (c:<chat>), timbre de llamadas (u:<usuario>) y sala de llamada (call:<chat>)
create policy duna_rt_sel on realtime.messages for select to authenticated using (
  realtime.topic() = 'u:' || (select auth.uid())::text
  or (realtime.topic() like 'c:%' and private.is_member(private.try_uuid(substr(realtime.topic(), 3))))
  or (realtime.topic() like 'call:%' and private.is_member(private.try_uuid(substr(realtime.topic(), 6)))));
create policy duna_rt_ins on realtime.messages for insert to authenticated with check (
  (realtime.topic() like 'u:%' and private.shares_chat((select auth.uid()), private.try_uuid(substr(realtime.topic(), 3)))
     and not private.is_blocked_between((select auth.uid()), private.try_uuid(substr(realtime.topic(), 3))))
  or realtime.topic() = 'u:' || (select auth.uid())::text
  or (realtime.topic() like 'c:%' and private.is_member(private.try_uuid(substr(realtime.topic(), 3))))
  or (realtime.topic() like 'call:%' and private.is_member(private.try_uuid(substr(realtime.topic(), 6)))));

-- ===== Tareas programadas =====
create extension if not exists pg_cron;
select cron.schedule('duna-limpieza', '*/10 * * * *', 'select private.purge_expired()');
