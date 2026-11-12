-- ===== Funciones auxiliares (private, security definer) =====
create or replace function private.try_uuid(t text) returns uuid
language plpgsql immutable set search_path = '' as $$
begin return t::uuid; exception when others then return null; end $$;

create or replace function private.is_member(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.chat_members m where m.chat_id = c and m.user_id = auth.uid())
$$;

create or replace function private.is_admin(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.chat_members m where m.chat_id = c and m.user_id = auth.uid() and m.role in ('owner','admin'))
$$;

create or replace function private.is_blocked_between(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.blocks x where (x.blocker_id = a and x.blocked_id = b) or (x.blocker_id = b and x.blocked_id = a))
$$;

create or replace function private.shares_chat(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.chat_members m1 join public.chat_members m2 on m1.chat_id = m2.chat_id
    join public.chats c on c.id = m1.chat_id
    where m1.user_id = a and m2.user_id = b and c.type in ('direct','group'))
$$;

create or replace function private.can_see(owner uuid, field text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when owner = auth.uid() then true
    when exists(select 1 from public.blocks b where b.blocker_id = owner and b.blocked_id = auth.uid()) then false
    else coalesce((select case coalesce(p.privacy->>field,'all')
        when 'all' then true
        when 'none' then false
        when 'contacts' then exists(select 1 from public.contacts k where k.owner_id = owner and k.contact_id = auth.uid())
        else true end
      from public.profiles p where p.id = owner), false)
  end
$$;

create or replace function private.can_view_stories(author uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select author = auth.uid() or (
    not private.is_blocked_between(author, auth.uid()) and
    case coalesce((select p.privacy->>'stories' from public.profiles p where p.id = author),'chats')
      when 'contacts' then exists(select 1 from public.contacts k where k.owner_id = author and k.contact_id = auth.uid())
      when 'none' then false
      else private.shares_chat(author, auth.uid()) or exists(select 1 from public.contacts k where k.owner_id = author and k.contact_id = auth.uid())
    end)
$$;

create or replace function private.can_send(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(
    select 1 from public.chats ch join public.chat_members m on m.chat_id = ch.id and m.user_id = auth.uid()
    where ch.id = c
      and (not ch.only_admins_send or m.role in ('owner','admin'))
      and ch.type <> 'community'
      and (ch.type <> 'direct' or not exists(
        select 1 from public.chat_members o where o.chat_id = c and o.user_id <> auth.uid()
          and private.is_blocked_between(o.user_id, auth.uid()))))
$$;

create or replace function private.msg_visible(mid uuid, c uuid, ts timestamptz, exp timestamptz) returns boolean
language sql stable security definer set search_path = '' as $$
  select (exp is null or exp > now())
    and exists(select 1 from public.chat_members m join public.chats ch on ch.id = m.chat_id
       left join public.chat_prefs p on p.chat_id = m.chat_id and p.user_id = m.user_id
       where m.chat_id = c and m.user_id = auth.uid()
         and (ch.type in ('direct','channel') or ts >= m.joined_at - interval '2 seconds')
         and ts > coalesce(p.cleared_at, '-infinity'::timestamptz))
    and not exists(select 1 from public.message_hidden h where h.message_id = mid and h.user_id = auth.uid())
$$;

create or replace function private.can_edit_chat(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.chats ch join public.chat_members m on m.chat_id = ch.id and m.user_id = auth.uid()
    where ch.id = c and (m.role in ('owner','admin') or (ch.type in ('direct','group') and not ch.only_admins_edit)))
$$;

create or replace function private.media_allowed(objname text) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_member(private.try_uuid((storage.foldername(objname))[1]))
    and not exists(select 1 from public.messages msg join public.view_once_opens v on v.message_id = msg.id
       where msg.media->>'path' = objname and msg.view_once and v.user_id = auth.uid() and msg.sender_id <> auth.uid())
    and not exists(select 1 from public.messages msg where msg.media->>'path' = objname and msg.view_once
       and msg.sender_id <> auth.uid() and not private.msg_visible(msg.id, msg.chat_id, msg.created_at, msg.expires_at))
$$;

grant execute on all functions in schema private to authenticated;
revoke execute on all functions in schema private from anon, public;
grant execute on all functions in schema private to authenticated;

-- ===== Políticas =====
create policy prof_sel on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy prof_upd on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy keys_all on public.user_keys for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy contacts_all on public.contacts for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy blocks_all on public.blocks for all to authenticated using (blocker_id = (select auth.uid())) with check (blocker_id = (select auth.uid()));
create policy prefs_all on public.chat_prefs for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and private.is_member(chat_id));
create policy hidden_all on public.message_hidden for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy stars_all on public.message_stars for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy push_all on public.push_subscriptions for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy chats_sel on public.chats for select to authenticated using (private.is_member(id) or is_public);

create policy members_sel on public.chat_members for select to authenticated using (
  user_id = (select auth.uid()) or (private.is_member(chat_id) and (
    private.is_admin(chat_id) or (select c.type from public.chats c where c.id = chat_id) <> 'channel')));
create policy members_upd on public.chat_members for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy msg_sel on public.messages for select to authenticated using (private.msg_visible(id, chat_id, created_at, expires_at));
create policy msg_ins on public.messages for insert to authenticated with check (
  sender_id = (select auth.uid()) and kind not in ('system') and private.can_send(chat_id));

create policy react_sel on public.message_reactions for select to authenticated using (private.is_member(chat_id));
create policy react_ins on public.message_reactions for insert to authenticated with check (
  user_id = (select auth.uid()) and private.is_member(chat_id)
  and exists(select 1 from public.messages m where m.id = message_id and m.chat_id = message_reactions.chat_id));
create policy react_upd on public.message_reactions for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy react_del on public.message_reactions for delete to authenticated using (user_id = (select auth.uid()));

create policy pins_sel on public.chat_pins for select to authenticated using (private.is_member(chat_id));
create policy pins_ins on public.chat_pins for insert to authenticated with check (
  private.can_edit_chat(chat_id) and exists(select 1 from public.messages m where m.id = message_id and m.chat_id = chat_pins.chat_id));
create policy pins_del on public.chat_pins for delete to authenticated using (private.can_edit_chat(chat_id));

create policy votes_sel on public.poll_votes for select to authenticated using (private.is_member(chat_id));
create policy votes_ins on public.poll_votes for insert to authenticated with check (
  user_id = (select auth.uid()) and private.is_member(chat_id)
  and exists(select 1 from public.messages m where m.id = message_id and m.chat_id = poll_votes.chat_id and m.kind = 'poll'));
create policy votes_del on public.poll_votes for delete to authenticated using (user_id = (select auth.uid()));

create policy vo_sel on public.view_once_opens for select to authenticated using (
  user_id = (select auth.uid()) or exists(select 1 from public.messages m where m.id = message_id and m.sender_id = (select auth.uid())));
create policy vo_ins on public.view_once_opens for insert to authenticated with check (
  user_id = (select auth.uid()) and exists(select 1 from public.messages m where m.id = message_id and m.view_once and private.is_member(m.chat_id)));

create policy stories_sel on public.stories for select to authenticated using (expires_at > now() and private.can_view_stories(user_id));
create policy stories_ins on public.stories for insert to authenticated with check (user_id = (select auth.uid()));
create policy stories_del on public.stories for delete to authenticated using (user_id = (select auth.uid()));

create policy sv_sel on public.story_views for select to authenticated using (
  viewer_id = (select auth.uid()) or exists(select 1 from public.stories s where s.id = story_id and s.user_id = (select auth.uid())));
create policy sv_ins on public.story_views for insert to authenticated with check (
  viewer_id = (select auth.uid()) and exists(select 1 from public.stories s where s.id = story_id and private.can_view_stories(s.user_id)));
create policy sv_upd on public.story_views for update to authenticated using (viewer_id = (select auth.uid())) with check (viewer_id = (select auth.uid()));

create policy calls_sel on public.calls for select to authenticated using (private.is_member(chat_id));
create policy calls_ins on public.calls for insert to authenticated with check (caller_id = (select auth.uid()) and private.is_member(chat_id));
create policy calls_upd on public.calls for update to authenticated using (private.is_member(chat_id)) with check (private.is_member(chat_id));

create policy reports_ins on public.reports for insert to authenticated with check (reporter_id = (select auth.uid()));
create policy reports_sel on public.reports for select to authenticated using (reporter_id = (select auth.uid()));
