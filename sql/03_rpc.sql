-- ===== Disparadores =====
create or replace function private.tg_msg_before() returns trigger
language plpgsql security definer set search_path = '' as $$
declare secs int;
begin
  new.created_at := now();
  new.edited_at := null;
  new.deleted_for_all := false;
  select disappearing_seconds into secs from public.chats where id = new.chat_id;
  if coalesce(secs,0) > 0 then new.expires_at := now() + make_interval(secs => secs); else new.expires_at := null; end if;
  if new.reply_to is not null and not exists(select 1 from public.messages r where r.id = new.reply_to and r.chat_id = new.chat_id) then
    new.reply_to := null;
  end if;
  return new;
end $$;
create trigger msg_before before insert on public.messages for each row execute function private.tg_msg_before();

create or replace function private.tg_msg_after() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.chats set last_message_at = new.created_at where id = new.chat_id;
  update public.chat_prefs set archived = false
    where chat_id = new.chat_id and archived and (muted_until is null or muted_until < now()) and user_id <> coalesce(new.sender_id, '00000000-0000-0000-0000-000000000000');
  if new.sender_id is not null then
    update public.chat_members set read_at = new.created_at, delivered_at = new.created_at where chat_id = new.chat_id and user_id = new.sender_id;
    update public.chat_prefs set my_read_at = new.created_at, marked_unread = false where chat_id = new.chat_id and user_id = new.sender_id;
  end if;
  return null;
end $$;
create trigger msg_after after insert on public.messages for each row execute function private.tg_msg_after();

create or replace function private.tg_member_after() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.chat_prefs(chat_id, user_id, my_read_at) values (new.chat_id, new.user_id, now()) on conflict do nothing;
  return null;
end $$;
create trigger member_after after insert on public.chat_members for each row execute function private.tg_member_after();

create or replace function private.sys_msg(c uuid, txt text, actor uuid default null, m jsonb default null) returns void
language sql security definer set search_path = '' as $$
  insert into public.messages(chat_id, sender_id, kind, body, meta) values (c, null, 'system', txt, coalesce(m,'{}'::jsonb) || jsonb_build_object('actor', actor));
$$;

-- ===== Registro =====
create or replace function public.register_user(p_username text, p_password text, p_display_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare uid uuid := gen_random_uuid(); uname text := lower(trim(p_username)); em text; v_ip text;
begin
  if uname !~ '^[a-z0-9_.]{3,24}$' then raise exception 'Usuario inválido: 3 a 24 caracteres (letras, números, punto o guion bajo)'; end if;
  if char_length(coalesce(p_password,'')) < 8 then raise exception 'La contraseña debe tener al menos 8 caracteres'; end if;
  if char_length(trim(coalesce(p_display_name,''))) < 1 then raise exception 'Escribe tu nombre'; end if;
  v_ip := coalesce(split_part(current_setting('request.headers', true)::json->>'x-forwarded-for', ',', 1), 'x');
  if (select count(*) from private.registration_log r where r.ip = v_ip and r.created_at > now() - interval '1 hour') >= 8 then
    raise exception 'Demasiados registros desde esta red. Intenta más tarde';
  end if;
  if exists(select 1 from public.profiles where username = uname) then raise exception 'Ese usuario ya existe'; end if;
  em := uname || '@usuarios.duna.app';
  insert into auth.users(instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
  values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', em,
    extensions.crypt(p_password, extensions.gen_salt('bf', 10)), now(),
    '{"provider":"email","providers":["email"]}', jsonb_build_object('username', uname),
    now(), now(), '', '', '', '');
  insert into auth.identities(id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), uid, uid::text, jsonb_build_object('sub', uid::text, 'email', em, 'email_verified', true), 'email', now(), now(), now());
  insert into public.profiles(id, username, display_name) values (uid, uname, left(trim(p_display_name), 40));
  insert into private.registration_log(ip) values (v_ip);
  return uid;
end $$;

create or replace function public.username_available(p_username text) returns boolean
language sql stable security definer set search_path = '' as $$
  select not exists(select 1 from public.profiles where username = lower(trim(p_username)))
$$;

-- ===== Perfiles =====
create or replace function public.get_profiles(ids uuid[])
returns table(id uuid, username text, display_name text, about text, avatar_path text, pub_key jsonb,
  last_seen timestamptz, online boolean, is_contact boolean, alias text, i_blocked boolean)
language sql stable security definer set search_path = '' as $$
  select p.id, p.username, p.display_name,
    case when private.can_see(p.id,'about') then p.about end,
    case when private.can_see(p.id,'photo') then p.avatar_path end,
    p.pub_key,
    case when private.can_see(p.id,'last_seen') then p.last_seen end,
    case when private.can_see(p.id,'last_seen') then p.last_seen > now() - interval '70 seconds' else null end,
    exists(select 1 from public.contacts k where k.owner_id = auth.uid() and k.contact_id = p.id),
    (select k.alias from public.contacts k where k.owner_id = auth.uid() and k.contact_id = p.id),
    exists(select 1 from public.blocks b where b.blocker_id = auth.uid() and b.blocked_id = p.id)
  from public.profiles p where p.id = any(ids) and auth.uid() is not null
$$;

create or replace function public.search_users(q text)
returns table(id uuid, username text, display_name text, about text, avatar_path text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.username, p.display_name,
    case when private.can_see(p.id,'about') then p.about end,
    case when private.can_see(p.id,'photo') then p.avatar_path end
  from public.profiles p
  where auth.uid() is not null and p.id <> auth.uid() and char_length(trim(q)) >= 2
    and (p.username ilike trim(q) || '%' or p.display_name ilike '%' || trim(q) || '%' or (p.phone is not null and replace(p.phone,' ','') like '%' || replace(trim(q),' ','') || '%'))
  order by (p.username = lower(trim(q))) desc, p.display_name limit 25
$$;

-- ===== Lista de chats =====
create or replace function public.chat_list()
returns table(chat_id uuid, type text, title text, description text, avatar_path text, community_id uuid,
  is_announcement boolean, only_admins_send boolean, only_admins_edit boolean, disappearing_seconds int, invite_code text, is_public boolean,
  my_role text, other_id uuid, member_count int, last_message jsonb, unread int,
  muted_until timestamptz, archived boolean, pinned_at timestamptz, marked_unread boolean, wallpaper text, last_message_at timestamptz)
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
    p.muted_until, coalesce(p.archived,false), p.pinned_at, coalesce(p.marked_unread,false), p.wallpaper, c.last_message_at
  from public.chat_members m join public.chats c on c.id = m.chat_id
  left join public.chat_prefs p on p.chat_id = c.id and p.user_id = m.user_id
  where m.user_id = auth.uid()
  order by p.pinned_at desc nulls last, c.last_message_at desc
$$;

-- ===== Chats directos y grupos =====
create or replace function public.open_direct(other uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare k text; cid uuid; me uuid := auth.uid();
begin
  if me is null or other is null then raise exception 'No autenticado'; end if;
  if not exists(select 1 from public.profiles where id = other) then raise exception 'Usuario no existe'; end if;
  k := case when me = other then me::text else least(me::text, other::text) || ':' || greatest(me::text, other::text) end;
  select id into cid from public.chats where direct_key = k;
  if cid is null then
    insert into public.chats(type, created_by, direct_key, invite_code) values ('direct', me, k, null) returning id into cid;
    insert into public.chat_members(chat_id, user_id, role) values (cid, me, 'member');
    if other <> me then insert into public.chat_members(chat_id, user_id, role) values (cid, other, 'member'); end if;
  end if;
  return cid;
end $$;

create or replace function private.can_add(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select not private.is_blocked_between(target, auth.uid()) and case coalesce((select privacy->>'groups' from public.profiles where id = target),'all')
    when 'contacts' then exists(select 1 from public.contacts k where k.owner_id = target and k.contact_id = auth.uid())
    when 'none' then false else true end
$$;

create or replace function public.create_group(p_title text, p_description text, p_members uuid[], p_type text default 'group', p_community uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare cid uuid; u uuid; me uuid := auth.uid(); skipped int := 0;
begin
  if me is null then raise exception 'No autenticado'; end if;
  if p_type not in ('group','channel','community') then raise exception 'Tipo inválido'; end if;
  if char_length(trim(coalesce(p_title,''))) < 1 then raise exception 'Escribe un nombre'; end if;
  if p_community is not null and not exists(select 1 from public.chat_members m where m.chat_id = p_community and m.user_id = me and m.role in ('owner','admin')) then
    raise exception 'Solo los admins de la comunidad pueden crear grupos en ella';
  end if;
  insert into public.chats(type, title, description, created_by, community_id, is_public, only_admins_send)
    values (p_type, left(trim(p_title),60), nullif(left(trim(coalesce(p_description,'')),500),''), me, p_community, p_type = 'channel', p_type = 'channel')
    returning id into cid;
  insert into public.chat_members(chat_id, user_id, role) values (cid, me, 'owner');
  if p_type <> 'channel' then
    foreach u in array coalesce(p_members, '{}') loop
      if u <> me and exists(select 1 from public.profiles where id = u) then
        if private.can_add(u) then insert into public.chat_members(chat_id, user_id) values (cid, u) on conflict do nothing;
        else skipped := skipped + 1; end if;
      end if;
    end loop;
  end if;
  if p_type = 'community' then
    declare ann uuid;
    begin
      insert into public.chats(type, title, description, created_by, community_id, is_announcement, only_admins_send, only_admins_edit)
        values ('group', 'Avisos · ' || left(trim(p_title),50), 'Grupo de avisos de la comunidad', me, cid, true, true, true) returning id into ann;
      insert into public.chat_members(chat_id, user_id, role) select ann, m.user_id, case when m.user_id = me then 'owner' else 'member' end from public.chat_members m where m.chat_id = cid;
      perform private.sys_msg(ann, 'Comunidad creada', me);
    end;
  end if;
  perform private.sys_msg(cid, case p_type when 'channel' then 'Canal creado' when 'community' then 'Comunidad creada' else 'Grupo creado' end, me,
    case when skipped > 0 then jsonb_build_object('skipped', skipped) end);
  return cid;
end $$;

create or replace function public.add_members(p_chat uuid, p_members uuid[]) returns int
language plpgsql security definer set search_path = '' as $$
declare u uuid; n int := 0; ann uuid;
begin
  if not private.can_edit_chat(p_chat) or (select type from public.chats where id = p_chat) = 'direct' then raise exception 'No tienes permiso para añadir participantes'; end if;
  foreach u in array coalesce(p_members,'{}') loop
    if private.can_add(u) and not exists(select 1 from public.chat_members where chat_id = p_chat and user_id = u) then
      insert into public.chat_members(chat_id, user_id) values (p_chat, u);
      perform private.sys_msg(p_chat, 'añadió a', auth.uid(), jsonb_build_object('target', u));
      n := n + 1;
      if (select type from public.chats where id = p_chat) = 'community' then
        select id into ann from public.chats where community_id = p_chat and is_announcement limit 1;
        if ann is not null then insert into public.chat_members(chat_id, user_id) values (ann, u) on conflict do nothing; end if;
      end if;
    end if;
  end loop;
  return n;
end $$;

create or replace function public.remove_member(p_chat uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin(p_chat) then raise exception 'Solo admins'; end if;
  if (select role from public.chat_members where chat_id = p_chat and user_id = p_user) = 'owner' then raise exception 'No puedes eliminar al creador'; end if;
  delete from public.chat_members where chat_id = p_chat and user_id = p_user;
  perform private.sys_msg(p_chat, 'eliminó a', auth.uid(), jsonb_build_object('target', p_user));
end $$;

create or replace function public.set_member_role(p_chat uuid, p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin(p_chat) or p_role not in ('admin','member') then raise exception 'Sin permiso'; end if;
  if (select role from public.chat_members where chat_id = p_chat and user_id = p_user) = 'owner' then raise exception 'No aplica al creador'; end if;
  update public.chat_members set role = p_role where chat_id = p_chat and user_id = p_user;
  perform private.sys_msg(p_chat, case p_role when 'admin' then 'nombró admin a' else 'quitó como admin a' end, auth.uid(), jsonb_build_object('target', p_user));
end $$;

create or replace function public.leave_chat(p_chat uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); nxt uuid; t text;
begin
  select type into t from public.chats where id = p_chat;
  if t = 'direct' then raise exception 'Los chats individuales se eliminan, no se abandonan'; end if;
  if (select role from public.chat_members where chat_id = p_chat and user_id = me) = 'owner' then
    select user_id into nxt from public.chat_members where chat_id = p_chat and user_id <> me order by (role = 'admin') desc, joined_at limit 1;
    if nxt is not null then update public.chat_members set role = 'owner' where chat_id = p_chat and user_id = nxt; end if;
  end if;
  delete from public.chat_members where chat_id = p_chat and user_id = me;
  if t <> 'channel' then perform private.sys_msg(p_chat, 'salió', me); end if;
  if not exists(select 1 from public.chat_members where chat_id = p_chat) then delete from public.chats where id = p_chat; end if;
end $$;

create or replace function public.update_chat(p_chat uuid, p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.chats; adm boolean := private.is_admin(p_chat);
begin
  select * into c from public.chats where id = p_chat;
  if not private.is_member(p_chat) then raise exception 'No eres miembro'; end if;
  if p ? 'disappearing_seconds' then
    if c.type <> 'direct' and not private.can_edit_chat(p_chat) then raise exception 'Sin permiso'; end if;
    update public.chats set disappearing_seconds = (p->>'disappearing_seconds')::int where id = p_chat;
    perform private.sys_msg(p_chat, 'cambió los mensajes temporales', auth.uid(), jsonb_build_object('seconds', (p->>'disappearing_seconds')::int));
  end if;
  if c.type = 'direct' then return; end if;
  if (p ? 'title' or p ? 'description' or p ? 'avatar_path') and not private.can_edit_chat(p_chat) then raise exception 'Solo admins pueden editar la info'; end if;
  if p ? 'title' then update public.chats set title = left(trim(p->>'title'),60) where id = p_chat;
    perform private.sys_msg(p_chat, 'cambió el nombre a', auth.uid(), jsonb_build_object('value', left(trim(p->>'title'),60))); end if;
  if p ? 'description' then update public.chats set description = nullif(left(trim(p->>'description'),500),'') where id = p_chat;
    perform private.sys_msg(p_chat, 'cambió la descripción', auth.uid()); end if;
  if p ? 'avatar_path' then update public.chats set avatar_path = p->>'avatar_path' where id = p_chat; end if;
  if (p ? 'only_admins_send' or p ? 'only_admins_edit' or p ? 'is_public') and not adm then raise exception 'Solo admins'; end if;
  if p ? 'only_admins_send' then update public.chats set only_admins_send = (p->>'only_admins_send')::boolean where id = p_chat;
    perform private.sys_msg(p_chat, case when (p->>'only_admins_send')::boolean then 'permitió que solo admins envíen mensajes' else 'permitió que todos envíen mensajes' end, auth.uid()); end if;
  if p ? 'only_admins_edit' then update public.chats set only_admins_edit = (p->>'only_admins_edit')::boolean where id = p_chat; end if;
  if p ? 'is_public' and c.type = 'channel' then update public.chats set is_public = (p->>'is_public')::boolean where id = p_chat; end if;
end $$;

create or replace function public.reset_invite(p_chat uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare code text := replace(replace(encode(extensions.gen_random_bytes(9),'base64'),'/','_'),'+','-');
begin
  if not private.is_admin(p_chat) then raise exception 'Solo admins'; end if;
  update public.chats set invite_code = code where id = p_chat;
  return code;
end $$;

create or replace function public.invite_preview(p_code text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', c.id, 'type', c.type, 'title', c.title, 'description', c.description, 'avatar_path', c.avatar_path,
    'members', (select count(*) from public.chat_members m where m.chat_id = c.id), 'is_member', private.is_member(c.id))
  from public.chats c where c.invite_code = p_code and c.type <> 'direct' and auth.uid() is not null
$$;

create or replace function public.join_by_invite(p_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare cid uuid; t text; ann uuid;
begin
  select id, type into cid, t from public.chats where invite_code = p_code and type <> 'direct';
  if cid is null then raise exception 'Enlace no válido o restablecido'; end if;
  if not private.is_member(cid) then
    insert into public.chat_members(chat_id, user_id) values (cid, auth.uid());
    if t <> 'channel' then perform private.sys_msg(cid, 'se unió con el enlace de invitación', auth.uid()); end if;
    if t = 'community' then
      select id into ann from public.chats where community_id = cid and is_announcement limit 1;
      if ann is not null then insert into public.chat_members(chat_id, user_id) values (ann, auth.uid()) on conflict do nothing; end if;
    end if;
  end if;
  return cid;
end $$;

create or replace function public.follow_channel(p_chat uuid, p_follow boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.chats where id = p_chat and type = 'channel' and (is_public or private.is_member(p_chat))) then raise exception 'Canal no disponible'; end if;
  if p_follow then insert into public.chat_members(chat_id, user_id) values (p_chat, auth.uid()) on conflict do nothing;
  else
    if (select role from public.chat_members where chat_id = p_chat and user_id = auth.uid()) = 'owner' then raise exception 'El creador no puede dejar de seguir su canal'; end if;
    delete from public.chat_members where chat_id = p_chat and user_id = auth.uid();
  end if;
end $$;

create or replace function public.list_channels(q text default '') returns table(id uuid, title text, description text, avatar_path text, followers int, following boolean)
language sql stable security definer set search_path = '' as $$
  select c.id, c.title, c.description, c.avatar_path, (select count(*)::int from public.chat_members m where m.chat_id = c.id), private.is_member(c.id)
  from public.chats c where c.type = 'channel' and c.is_public and auth.uid() is not null
    and (coalesce(q,'') = '' or c.title ilike '%' || q || '%')
  order by 5 desc limit 50
$$;

create or replace function public.community_groups(p_community uuid) returns table(id uuid, title text, description text, avatar_path text, is_announcement boolean, members int, is_member boolean)
language sql stable security definer set search_path = '' as $$
  select c.id, c.title, c.description, c.avatar_path, c.is_announcement, (select count(*)::int from public.chat_members m where m.chat_id = c.id), private.is_member(c.id)
  from public.chats c where c.community_id = p_community and private.is_member(p_community)
  order by c.is_announcement desc, c.title
$$;

create or replace function public.join_community_group(p_group uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare com uuid;
begin
  select community_id into com from public.chats where id = p_group;
  if com is null or not private.is_member(com) then raise exception 'Primero únete a la comunidad'; end if;
  insert into public.chat_members(chat_id, user_id) values (p_group, auth.uid()) on conflict do nothing;
  perform private.sys_msg(p_group, 'se unió desde la comunidad', auth.uid());
end $$;

create or replace function public.link_group_to_community(p_group uuid, p_community uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin(p_group) or not private.is_admin(p_community) then raise exception 'Debes ser admin del grupo y de la comunidad'; end if;
  if (select type from public.chats where id = p_community) <> 'community' or (select type from public.chats where id = p_group) <> 'group' then raise exception 'Tipos inválidos'; end if;
  update public.chats set community_id = p_community where id = p_group;
end $$;

-- ===== Mensajes =====
create or replace function public.edit_message(p_id uuid, p_body text, p_enc jsonb, p_meta jsonb default null) returns void
language plpgsql security definer set search_path = '' as $$
declare m public.messages;
begin
  select * into m from public.messages where id = p_id;
  if m.sender_id is distinct from auth.uid() or m.deleted_for_all then raise exception 'Solo puedes editar tus mensajes'; end if;
  if m.created_at < now() - interval '15 minutes' then raise exception 'Solo se puede editar durante 15 minutos'; end if;
  if m.kind not in ('text','image','video','document','gif') then raise exception 'Este mensaje no se puede editar'; end if;
  update public.messages set body = p_body, enc = p_enc, meta = coalesce(p_meta, meta), edited_at = now() where id = p_id;
end $$;

create or replace function public.update_message_meta(p_id uuid, p_enc jsonb, p_meta jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare m public.messages;
begin
  select * into m from public.messages where id = p_id;
  if m.sender_id is distinct from auth.uid() or m.kind not in ('location','poll') then raise exception 'Sin permiso'; end if;
  update public.messages set enc = coalesce(p_enc, enc), meta = p_meta where id = p_id;
end $$;

create or replace function public.delete_for_all(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare m public.messages;
begin
  select * into m from public.messages where id = p_id;
  if m.id is null then raise exception 'No existe'; end if;
  if m.sender_id is distinct from auth.uid() and not (private.is_admin(m.chat_id) and (select type from public.chats where id = m.chat_id) <> 'direct') then
    raise exception 'Solo puedes eliminar para todos tus mensajes';
  end if;
  if m.sender_id = auth.uid() and m.created_at < now() - interval '2 days' then raise exception 'Solo durante las primeras 48 horas'; end if;
  update public.messages set body = null, enc = null, media = null, meta = jsonb_build_object('deleted_by', auth.uid()), deleted_for_all = true where id = p_id;
  delete from public.chat_pins where message_id = p_id;
  delete from public.message_reactions where message_id = p_id;
  return m.media;
end $$;

create or replace function public.my_orphan_media() returns table(bucket text, name text)
language sql stable security definer set search_path = '' as $$
  select o.bucket_id, o.name from storage.objects o
  where o.owner_id = auth.uid()::text and o.bucket_id in ('media','stories') and o.created_at < now() - interval '10 minutes'
    and not exists(select 1 from public.messages m where m.media->>'path' = o.name or m.media->>'thumb_path' = o.name)
    and not exists(select 1 from public.stories s where s.media->>'path' = o.name)
  limit 200
$$;

create or replace function public.storage_usage() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'mine', coalesce((select sum((o.metadata->>'size')::bigint) from storage.objects o where o.owner_id = auth.uid()::text),0),
    'total', coalesce((select sum((o.metadata->>'size')::bigint) from storage.objects o where o.bucket_id in ('media','stories','avatars')),0))
$$;

create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); c record;
begin
  if me is null then return; end if;
  for c in select chat_id from public.chat_members where user_id = me and role = 'owner' loop
    update public.chat_members set role = 'owner' where (chat_id, user_id) = (select chat_id, user_id from public.chat_members where chat_id = c.chat_id and user_id <> me order by joined_at limit 1);
  end loop;
  delete from auth.users where id = me;
end $$;

-- ===== Limpieza programada =====
create or replace function private.purge_expired() returns void
language sql security definer set search_path = '' as $$
  delete from public.messages where expires_at is not null and expires_at < now();
  delete from public.stories where expires_at < now() - interval '1 hour';
  update public.calls set status = 'missed', ended_at = now() where status = 'ringing' and created_at < now() - interval '2 minutes';
  update public.calls set status = 'ended', ended_at = now() where status = 'ongoing' and created_at < now() - interval '6 hours';
  delete from private.registration_log where created_at < now() - interval '1 day';
$$;

-- ===== Permisos de ejecución =====
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
grant execute on function public.register_user(text,text,text) to anon;
grant execute on function public.username_available(text) to anon;
revoke execute on function private.purge_expired() from authenticated;
