import { sb, rpc, EMAIL_DOMAIN } from './sb.js';
import { h, logo, toast, icon } from './ui.js';
import { createIdentity, unwrapPrivate, kvSet, kvGet } from './crypto.js';
import { S } from './state.js';

export async function setupKeys(password) {
  const uid = S.user.id;
  const { data: k } = await sb.from('user_keys').select('enc_priv').eq('user_id', uid).maybeSingle();
  const { data: me } = await sb.from('profiles').select('*').eq('id', uid).single();
  if (k?.enc_priv && me?.pub_key) {
    const { key } = await unwrapPrivate(k.enc_priv, password);
    S.priv = key;
  } else {
    const id = await createIdentity(password);
    await sb.from('user_keys').upsert({ user_id: uid, enc_priv: id.wrapped });
    await sb.from('profiles').update({ pub_key: id.pub }).eq('id', uid);
    S.priv = id.priv;
  }
  await kvSet('priv:' + uid, S.priv);
}
export async function restoreKey() { S.priv = (await kvGet('priv:' + S.user.id).catch(() => null)) || null; return !!S.priv; }

export function authScreen(onDone) {
  let mode = 'login';
  const root = h('div', { class: 'auth' });
  const render = () => {
    root.innerHTML = '';
    const err = h('p', { class: 'err', role: 'alert' });
    const user = h('input', { name: 'username', autocomplete: 'username', placeholder: 'tu.usuario', required: true, minlength: 3, maxlength: 24, autocapitalize: 'none', spellcheck: false, id: 'f-user' });
    const name = h('input', { name: 'name', autocomplete: 'name', placeholder: 'Cómo te verán tus contactos', maxlength: 40, id: 'f-name' });
    const pass = h('input', { name: 'password', type: 'password', autocomplete: mode === 'login' ? 'current-password' : 'new-password', placeholder: 'Mínimo 8 caracteres', required: true, minlength: 8, id: 'f-pass' });
    const pass2 = h('input', { name: 'password2', type: 'password', autocomplete: 'new-password', placeholder: 'Repite la contraseña', id: 'f-pass2' });
    const submit = h('button', { class: 'btn primary big', type: 'submit', id: 'f-submit' }, mode === 'login' ? 'Entrar' : 'Crear mi cuenta');
    const form = h('form', { class: 'form', onsubmit: async e => {
      e.preventDefault(); err.textContent = '';
      const u = user.value.trim().toLowerCase().replace(/^@/, '');
      if (!/^[a-z0-9_.]{3,24}$/.test(u)) return err.textContent = 'Usuario: 3 a 24 caracteres (letras, números, punto o guion bajo).';
      if (pass.value.length < 8) return err.textContent = 'La contraseña debe tener al menos 8 caracteres.';
      if (mode === 'register') {
        if (!name.value.trim()) return err.textContent = 'Escribe tu nombre.';
        if (pass.value !== pass2.value) return err.textContent = 'Las contraseñas no coinciden.';
      }
      submit.disabled = true; submit.textContent = mode === 'login' ? 'Entrando…' : 'Creando tu cuenta…';
      try {
        if (mode === 'register') await rpc('register_user', { p_username: u, p_password: pass.value, p_display_name: name.value.trim() });
        const { data, error } = await sb.auth.signInWithPassword({ email: u + EMAIL_DOMAIN, password: pass.value });
        if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Usuario o contraseña incorrectos.' : error.message);
        S.user = data.user;
        submit.textContent = 'Preparando cifrado…';
        await setupKeys(pass.value);
        onDone();
      } catch (e2) {
        err.textContent = e2.message; submit.disabled = false; submit.textContent = mode === 'login' ? 'Entrar' : 'Crear mi cuenta';
      }
    } },
      h('label', null, 'Usuario', user),
      mode === 'register' ? h('label', null, 'Tu nombre', name) : null,
      h('label', null, 'Contraseña', pass),
      mode === 'register' ? h('label', null, 'Confirmar contraseña', pass2) : null,
      err, submit,
      h('button', { class: 'btn link', type: 'button', id: 'f-switch', onclick: () => { mode = mode === 'login' ? 'register' : 'login'; render(); } },
        mode === 'login' ? '¿Nuevo en DUNA? Crea tu cuenta' : 'Ya tengo cuenta · Entrar'));
    if (mode === 'register') user.addEventListener('blur', async () => {
      const u = user.value.trim().toLowerCase(); if (!/^[a-z0-9_.]{3,24}$/.test(u)) return;
      try { if (!(await rpc('username_available', { p_username: u }))) err.textContent = 'Ese usuario ya está en uso.'; else err.textContent = ''; } catch {}
    });
    root.append(
      h('div', { class: 'auth-art', 'aria-hidden': 'true' }, h('div', { class: 'sunball' }), h('div', { class: 'dune d1' }), h('div', { class: 'dune d2' }), h('div', { class: 'dune d3' })),
      h('div', { class: 'auth-card' },
        h('div', { class: 'auth-brand' }, logo(56), h('div', null, h('h1', null, 'DUNA'), h('p', null, 'Mensajes que se sienten cerca'))),
        h('h2', null, mode === 'login' ? 'Bienvenido de nuevo' : 'Crea tu cuenta en segundos'),
        form,
        h('p', { class: 'fine' }, icon('lock', 14), ' Tus chats individuales se cifran de extremo a extremo en tu dispositivo. Guarda bien tu contraseña: sin ella no se pueden recuperar los mensajes cifrados.')));
  };
  render();
  return root;
}

export function unlockSheet(sheetFn, onDone) {
  const pass = h('input', { type: 'password', placeholder: 'Tu contraseña', autocomplete: 'current-password' });
  const err = h('p', { class: 'err' });
  let s;
  const go = async () => {
    try { await setupKeys(pass.value); s.close(); toast('Cifrado desbloqueado en este dispositivo'); onDone && onDone(); }
    catch { err.textContent = 'Contraseña incorrecta'; }
  };
  pass.addEventListener('keydown', e => e.key === 'Enter' && go());
  s = sheetFn('Desbloquear cifrado', h('div', { class: 'form' },
    h('p', { class: 'muted' }, 'Este dispositivo aún no tiene tu llave de cifrado. Escribe tu contraseña para leer y enviar mensajes cifrados 1:1.'),
    pass, err, h('button', { class: 'btn primary', onclick: go }, 'Desbloquear')));
}
