-- DUNA · esquema base
create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- ===== Tablas =====
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_.]{3,24}$'),
  display_name text not null check (char_length(display_name) between 1 and 40),
  about text not null default 'Hola, estoy en DUNA' check (char_length(about) <= 140),
  avatar_path text check (avatar_path is null or char_length(avatar_path) < 200),
  phone text check (phone is null or phone ~ '^\+?[0-9 ]{7,18}$'),
  pub_key jsonb,
  privacy jsonb not null default '{"last_seen":"all","photo":"all","about":"all","read_receipts":true,"groups":"all","stories":"chats"}',
  last_seen timestamptz default now(),
  created_at timestamptz not null default now()
);

create table public.user_keys (
  user_id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  enc_priv jsonb not null,
  updated_at timestamptz not null default now()
);

create table public.contacts (
  owner_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  contact_id uuid not null references public.profiles(id) on delete cascade,
  alias text check (alias is null or char_length(alias) <= 40),
  created_at timestamptz not null default now(),
  primary key (owner_id, contact_id),
  check (owner_id <> contact_id)
);

create table public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table public.chats (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('direct','group','channel','community')),
  title text check (title is null or char_length(title) between 1 and 60),
  description text check (description is null or char_length(description) <= 500),
  avatar_path text,
  created_by uuid references public.profiles(id) on delete set null,
  direct_key text unique,
  invite_code text unique default replace(replace(encode(extensions.gen_random_bytes(9),'base64'),'/','_'),'+','-'),
  community_id uuid references public.chats(id) on delete set null,
  is_announcement boolean not null default false,
  is_public boolean not null default false,
  only_admins_send boolean not null default false,
  only_admins_edit boolean not null default false,
  disappearing_seconds integer not null default 0 check (disappearing_seconds in (0, 86400, 604800, 7776000)),
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create table public.chat_members (
  chat_id uuid not null references public.chats(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member')),
  joined_at timestamptz not null default now(),
  delivered_at timestamptz,
  read_at timestamptz,
  primary key (chat_id, user_id)
);
create index on public.chat_members (user_id);

create table public.chat_prefs (
  chat_id uuid not null references public.chats(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  muted_until timestamptz,
  archived boolean not null default false,
  pinned_at timestamptz,
  my_read_at timestamptz,
  cleared_at timestamptz,
  marked_unread boolean not null default false,
  wallpaper text check (wallpaper is null or char_length(wallpaper) <= 40),
  primary key (chat_id, user_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats(id) on delete cascade,
  sender_id uuid references public.profiles(id) on delete set null default auth.uid(),
  kind text not null default 'text' check (kind in ('text','image','video','audio','voice','document','location','contact','poll','sticker','system','call','gif')),
  body text check (body is null or char_length(body) <= 8000),
  enc jsonb,
  media jsonb,
  meta jsonb,
  reply_to uuid references public.messages(id) on delete set null,
  forwarded boolean not null default false,
  view_once boolean not null default false,
  edited_at timestamptz,
  deleted_for_all boolean not null default false,
  expires_at timestamptz,
  client_id text,
  created_at timestamptz not null default now(),
  check (enc is null or pg_column_size(enc) < 20000),
  check (meta is null or pg_column_size(meta) < 12000)
);
create index on public.messages (chat_id, created_at desc);
create index on public.messages (expires_at) where expires_at is not null;

create table public.message_hidden (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  primary key (message_id, user_id)
);

create table public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  chat_id uuid not null references public.chats(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  emoji text not null check (char_length(emoji) <= 16),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
create index on public.message_reactions (chat_id);

create table public.message_stars (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create table public.chat_pins (
  chat_id uuid not null references public.chats(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  pinned_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (chat_id, message_id)
);

create table public.poll_votes (
  message_id uuid not null references public.messages(id) on delete cascade,
  chat_id uuid not null references public.chats(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  option_idx smallint not null check (option_idx between 0 and 11),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, option_idx)
);
create index on public.poll_votes (chat_id);

create table public.view_once_opens (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  opened_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create table public.stories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  kind text not null check (kind in ('text','image','video')),
  body text check (body is null or char_length(body) <= 700),
  style jsonb,
  media jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours'
);
create index on public.stories (user_id, created_at desc);

create table public.story_views (
  story_id uuid not null references public.stories(id) on delete cascade,
  viewer_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  viewed_at timestamptz not null default now(),
  reaction text check (reaction is null or char_length(reaction) <= 16),
  primary key (story_id, viewer_id)
);

create table public.calls (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats(id) on delete cascade,
  caller_id uuid references public.profiles(id) on delete set null default auth.uid(),
  kind text not null check (kind in ('audio','video')),
  status text not null default 'ringing' check (status in ('ringing','ongoing','ended','missed','declined')),
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  ended_at timestamptz
);
create index on public.calls (chat_id, created_at desc);

create table public.reports (
  id bigint generated always as identity primary key,
  reporter_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  target_user uuid references public.profiles(id) on delete set null,
  chat_id uuid references public.chats(id) on delete set null,
  message_id uuid references public.messages(id) on delete set null,
  reason text not null check (char_length(reason) between 3 and 500),
  created_at timestamptz not null default now()
);

create table public.push_subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  endpoint text not null unique check (char_length(endpoint) < 1000),
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create table private.registration_log (
  ip text,
  created_at timestamptz not null default now()
);

-- ===== RLS en todo =====
alter table public.profiles enable row level security;
alter table public.user_keys enable row level security;
alter table public.contacts enable row level security;
alter table public.blocks enable row level security;
alter table public.chats enable row level security;
alter table public.chat_members enable row level security;
alter table public.chat_prefs enable row level security;
alter table public.messages enable row level security;
alter table public.message_hidden enable row level security;
alter table public.message_reactions enable row level security;
alter table public.message_stars enable row level security;
alter table public.chat_pins enable row level security;
alter table public.poll_votes enable row level security;
alter table public.view_once_opens enable row level security;
alter table public.stories enable row level security;
alter table public.story_views enable row level security;
alter table public.calls enable row level security;
alter table public.reports enable row level security;
alter table public.push_subscriptions enable row level security;
alter table private.registration_log enable row level security;

-- Privilegios: nada para anon; authenticated con columnas controladas
revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;
alter default privileges in schema public revoke all on tables from anon;
grant select, insert on public.profiles to authenticated;
grant update (display_name, about, avatar_path, phone, pub_key, privacy, last_seen) on public.profiles to authenticated;
grant select, insert, update, delete on public.user_keys, public.contacts, public.blocks, public.chat_prefs,
  public.message_hidden, public.message_reactions, public.message_stars, public.chat_pins, public.poll_votes,
  public.push_subscriptions to authenticated;
grant select on public.chats, public.chat_members to authenticated;
grant update (delivered_at, read_at) on public.chat_members to authenticated;
grant select, insert on public.messages, public.view_once_opens, public.story_views, public.calls to authenticated;
grant update (reaction) on public.story_views to authenticated;
grant update (status, answered_at, ended_at) on public.calls to authenticated;
grant select, insert, delete on public.stories to authenticated;
grant insert, select on public.reports to authenticated;
