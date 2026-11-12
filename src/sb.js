import { createClient } from '@supabase/supabase-js';
export const SB_URL = 'https://jvaepilcxwnfssbxneiu.supabase.co';
export const SB_KEY = 'sb_publishable_Xjb_xWzN36EL0z-5UbQShQ_cX2jkRG1'; // clave pública (publishable); la seguridad está en RLS
export const sb = createClient(SB_URL, SB_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'duna-auth' },
  realtime: { params: { eventsPerSecond: 30 } },
});
export const EMAIL_DOMAIN = '@usuarios.duna.app';
export async function rpc(fn, args = {}) {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data;
}
export function avatarUrl(path) {
  if (!path) return null;
  return sb.storage.from('avatars').getPublicUrl(path).data.publicUrl;
}
