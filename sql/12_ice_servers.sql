-- DUNA 12: servidores TURN opcionales para llamadas (relé cuando STUN no basta: CGNAT de datos móviles, NAT simétrico).
-- Se guardan en private.app_config k='turn_ice' como arreglo JSON de iceServers (p. ej. el que entrega Metered/Open Relay).
-- Solo usuarios con sesión los reciben (las credenciales TURN siempre llegan al cliente; no son la clave de la cuenta).
create or replace function public.ice_servers() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce((select v::jsonb from private.app_config where k = 'turn_ice' and v ~ '^\s*\['), '[]'::jsonb)
$$;
revoke execute on function public.ice_servers() from public, anon;
grant execute on function public.ice_servers() to authenticated;
