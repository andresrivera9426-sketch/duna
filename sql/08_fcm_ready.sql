-- La app usa solo FCM (y apaga su conexión propia) únicamente cuando el servidor ya tiene la cuenta de servicio
create or replace function public.native_fcm_ready() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from private.app_config where k = 'fcm_sa' and v is not null and v <> '')
$$;
revoke execute on function public.native_fcm_ready() from public, anon;
grant execute on function public.native_fcm_ready() to authenticated;
