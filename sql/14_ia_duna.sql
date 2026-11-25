-- DUNA · IA DUNA (asistente). Solo guarda contadores de uso por usuario y día (sin conversaciones).
-- La credencial del modelo vive solo en private.app_config (cuenta de servicio fcm_sa o llave ia_key); nunca en el cliente.
create table if not exists private.ia_usage (
  user_id uuid not null,
  day date not null default (now() at time zone 'America/Bogota')::date,
  n int not null default 0,          -- consultas del día
  win timestamptz not null default now(), -- inicio de la ventana de 1 minuto
  wn int not null default 0,         -- consultas en la ventana
  primary key (user_id, day)
);
alter table private.ia_usage enable row level security;

create or replace function public.ia_config() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from private.app_config where k = 'fcm_sa' or k like 'ia\_%'
$$;

-- Reserva una consulta: límite por minuto y por día por usuario, y tope global diario (para no salir de la cuota gratis).
create or replace function public.ia_take(p_user uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  lim jsonb := coalesce((select v::jsonb from private.app_config where k = 'ia_limits'), '{}'::jsonb);
  per_min int := coalesce((lim->>'per_min')::int, 8);
  per_day int := coalesce((lim->>'per_day')::int, 60);
  global_day int := coalesce((lim->>'global_day')::int, 500);
  d date := (now() at time zone 'America/Bogota')::date;
  r private.ia_usage; tot int;
begin
  if p_user is null then return jsonb_build_object('ok', false, 'why', 'auth'); end if;
  select coalesce(sum(n), 0) into tot from private.ia_usage where day = d;
  if tot >= global_day then return jsonb_build_object('ok', false, 'why', 'global'); end if;
  insert into private.ia_usage(user_id, day) values (p_user, d) on conflict do nothing;
  select * into r from private.ia_usage where user_id = p_user and day = d for update;
  if r.n >= per_day then return jsonb_build_object('ok', false, 'why', 'day', 'left', 0); end if;
  if r.win < now() - interval '1 minute' then r.win := now(); r.wn := 0; end if;
  if r.wn >= per_min then return jsonb_build_object('ok', false, 'why', 'min', 'retry', ceil(extract(epoch from (r.win + interval '1 minute' - now())))); end if;
  update private.ia_usage set n = r.n + 1, win = r.win, wn = r.wn + 1 where user_id = p_user and day = d;
  delete from private.ia_usage where day < d - 2;
  return jsonb_build_object('ok', true, 'left', per_day - r.n - 1);
end $$;

revoke execute on function public.ia_config(), public.ia_take(uuid) from public, anon, authenticated;
grant execute on function public.ia_config(), public.ia_take(uuid) to service_role;
