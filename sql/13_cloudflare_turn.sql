-- DUNA 13: TURN de Cloudflare Realtime (1.000 GB/mes gratis) con Metered ('turn_ice') como respaldo.
-- Secretos (NO en el repo): private.app_config k='cf_turn_key_id' y k='cf_turn_token' (se cargan aparte).
-- Un job de pg_cron (cada 5 min, casi siempre sin hacer nada) pide credenciales efímeras a Cloudflare cada 6 h (TTL 48 h)
-- vía pg_net y guarda el arreglo iceServers en 'cf_ice' (+ 'cf_ice_exp'). Si Cloudflare falla, ice_servers() devuelve solo Metered.
-- La app (web y APK >= 1.0.5) llama public.ice_servers() en cada llamada: no requiere APK nueva.

create or replace function private.cfg_set(p_k text, p_v text) returns void
language sql security definer set search_path = '' as $$
  insert into private.app_config (k, v) values (p_k, p_v) on conflict (k) do update set v = excluded.v
$$;
revoke execute on function private.cfg_set(text, text) from public, anon, authenticated;

create or replace function private.cf_turn_tick(p_force boolean default false) returns text
language plpgsql security definer set search_path = '' as $$
declare
  kid text; tok text; req text; req_at timestamptz; r record; arr jsonb; nxt timestamptz; body jsonb;
begin
  select v into kid from private.app_config where k = 'cf_turn_key_id';
  select v into tok from private.app_config where k = 'cf_turn_token';
  if kid is null or tok is null then return 'sin claves'; end if;

  -- 1) ¿Hay una petición pendiente? Recoger su respuesta.
  select v into req from private.app_config where k = 'cf_ice_req';
  if req is not null then
    select v::timestamptz into req_at from private.app_config where k = 'cf_ice_req_at';
    select status_code, content, error_msg into r from net._http_response where id = req::bigint;
    if not found then
      if req_at < now() - interval '10 minutes' then
        delete from private.app_config where k in ('cf_ice_req', 'cf_ice_req_at');
        perform private.cfg_set('cf_ice_err', now()::text || ' sin respuesta');
        perform private.cfg_set('cf_ice_next', (now() + interval '15 minutes')::text);
        return 'timeout';
      end if;
      return 'pendiente';
    end if;
    delete from private.app_config where k in ('cf_ice_req', 'cf_ice_req_at');
    delete from net._http_response where id = req::bigint; -- no dejar credenciales en el log de pg_net
    begin body := r.content::jsonb; exception when others then body := null; end;
    if r.status_code in (200, 201) and body ? 'iceServers' then
      -- normaliza urls a arreglo y quita el puerto alterno 53 (bloqueado por navegadores)
      select coalesce(jsonb_agg(s), '[]'::jsonb) into arr from (
        select e || jsonb_build_object('urls', (select jsonb_agg(u) from jsonb_array_elements(
                 case jsonb_typeof(e->'urls') when 'array' then e->'urls' else jsonb_build_array(e->'urls') end) u
               where (u #>> '{}') !~ ':53(\?|/|$)')) s
        from jsonb_array_elements(body->'iceServers') e) x
      where jsonb_typeof(s->'urls') = 'array' and jsonb_array_length(s->'urls') > 0;
      if jsonb_array_length(arr) > 0 then
        perform private.cfg_set('cf_ice', arr::text);
        perform private.cfg_set('cf_ice_exp', (now() + interval '47 hours')::text);
        perform private.cfg_set('cf_ice_ok', now()::text);
        perform private.cfg_set('cf_ice_next', (now() + interval '6 hours')::text);
        delete from private.app_config where k = 'cf_ice_err';
        return 'ok';
      end if;
    end if;
    perform private.cfg_set('cf_ice_err', now()::text || ' http ' || coalesce(r.status_code::text, '?') || ' ' || left(coalesce(r.error_msg, ''), 120));
    perform private.cfg_set('cf_ice_next', (now() + interval '15 minutes')::text);
    return 'error';
  end if;

  -- 2) ¿Toca renovar?
  select v::timestamptz into nxt from private.app_config where k = 'cf_ice_next';
  if not p_force and nxt is not null and nxt > now() then return 'al día'; end if;
  req := net.http_post(
    url := 'https://rtc.live.cloudflare.com/v1/turn/keys/' || kid || '/credentials/generate-ice-servers',
    body := jsonb_build_object('ttl', 172800),
    headers := jsonb_build_object('Authorization', 'Bearer ' || tok, 'Content-Type', 'application/json'),
    timeout_milliseconds := 10000)::text;
  perform private.cfg_set('cf_ice_req', req);
  perform private.cfg_set('cf_ice_req_at', now()::text);
  return 'pedido';
end $$;
revoke execute on function private.cf_turn_tick(boolean) from public, anon, authenticated;

-- Cloudflare primero (si sus credenciales siguen vigentes al menos 2 h más), luego Metered como respaldo.
create or replace function public.ice_servers() returns jsonb
language sql stable security definer set search_path = '' as $$
  select
    coalesce((select c.v::jsonb from private.app_config c
              where c.k = 'cf_ice' and c.v ~ '^\s*\['
                and exists (select 1 from private.app_config e where e.k = 'cf_ice_exp' and e.v::timestamptz > now() + interval '2 hours')), '[]'::jsonb)
    || coalesce((select v::jsonb from private.app_config where k = 'turn_ice' and v ~ '^\s*\['), '[]'::jsonb)
$$;
revoke execute on function public.ice_servers() from public, anon;
grant execute on function public.ice_servers() to authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'duna-cf-turn';
select cron.schedule('duna-cf-turn', '*/5 * * * *', $$select private.cf_turn_tick()$$);
