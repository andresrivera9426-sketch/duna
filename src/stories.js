// Estados (24 h) y directorio de canales
import { sb, rpc } from './sb.js';
import { h, icon, btn, toast, sheet, fmtListTime, fmtTime, debounce, confirmDialog } from './ui.js';
import { S, nameOf, loadProfiles, sendMessage, refreshChat, loadChats } from './state.js';
import { avatar, setTab, renderSide } from './main.js';
import { compressImage, videoInfo, LIMITS } from './media.js';
import { openChat } from './chat.js';

let stories = [];
const BG = ['#6D4BFF', '#E8467C', '#FF7A45', '#0EA5A4', '#1D1A2E', '#C24BD6', '#2563EB', '#16A34A'];
export async function loadStories() {
  const { data, error } = await sb.from('stories').select('*').gt('expires_at', new Date().toISOString()).order('created_at');
  if (error) throw error; stories = data || [];
  await loadProfiles(stories.map(s => s.user_id));
  const ids = stories.map(s => s.id);
  const seen = ids.length ? (await sb.from('story_views').select('story_id').eq('viewer_id', S.user.id).in('story_id', ids)).data || [] : [];
  const seenSet = new Set(seen.map(x => x.story_id)); stories.forEach(s => s._seen = seenSet.has(s.id) || s.user_id === S.user.id);
  return stories;
}
export function onStoryInsert(st) {
  if (st.user_id === S.user.id) return;
  const b = document.querySelector('[data-badge="updates"]'); if (b) { b.textContent = '•'; b.hidden = false; }
  if (S.tab === 'updates') renderSide();
}
export async function renderUpdates(side, sideHeader) {
  const body = h('div', { class: 'list updates' }, h('div', { class: 'spinner' }));
  side.append(sideHeader('Novedades', [btn('camera', 'Nuevo estado', () => newStory()), btn('search', 'Buscar canales', () => channelSearch())]), body,
    h('button', { class: 'fab', id: 'new-story', title: 'Nuevo estado', 'aria-label': 'Nuevo estado', onclick: () => newStory() }, icon('camera', 24)));
  document.querySelectorAll('[data-badge="updates"]').forEach(b => { b.textContent = ''; b.hidden = true; });
  try { await loadStories(); } catch (e) { body.innerHTML = ''; return body.append(h('p', { class: 'muted' }, e.message)); }
  body.innerHTML = '';
  const byUser = new Map(); for (const s of stories) { if (!byUser.has(s.user_id)) byUser.set(s.user_id, []); byUser.get(s.user_id).push(s); }
  const mine = byUser.get(S.user.id) || [];
  body.append(h('h4', { class: 'sec-t' }, 'Estados'),
    h('div', { class: 'story-row' + (mine.length ? '' : ' none'), onclick: () => mine.length ? viewStories(S.user.id) : newStory() },
      h('span', { class: 'sring' + (mine.length ? ' mine' : '') }, avatar(S.me, 50), !mine.length ? h('i', { class: 'plus' }, '+') : null),
      h('div', { class: 'grow' }, h('b', null, 'Mi estado'), h('small', null, mine.length ? `${mine.length} actualización${mine.length > 1 ? 'es' : ''} · ${fmtListTime(mine[mine.length - 1].created_at)}` : 'Toca para añadir una actualización')),
      mine.length ? btn('plus', 'Añadir', e => { e.stopPropagation(); newStory(); }) : null));
  const others = [...byUser.entries()].filter(([u]) => u !== S.user.id).sort((a, b) => (a[1].every(s => s._seen) - b[1].every(s => s._seen)) || new Date(b[1].at(-1).created_at) - new Date(a[1].at(-1).created_at));
  if (!others.length) body.append(h('p', { class: 'fine pad' }, 'Aquí verás los estados de las personas con las que chateas. Desaparecen a las 24 horas.'));
  for (const [uid, arr] of others) {
    const seen = arr.every(s => s._seen);
    body.append(h('div', { class: 'story-row', onclick: () => viewStories(uid) }, h('span', { class: 'sring' + (seen ? ' seen' : '') }, avatar(S.profiles.get(uid), 50)),
      h('div', { class: 'grow' }, h('b', null, nameOf(uid)), h('small', null, fmtListTime(arr.at(-1).created_at)))));
  }
  // Canales
  body.append(h('h4', { class: 'sec-t' }, 'Canales'));
  const myCh = [...S.chats.values()].filter(c => c.type === 'channel');
  for (const c of myCh) body.append(h('div', { class: 'story-row', onclick: () => openChat(c.id) }, avatar({ id: c.id, title: c.title, avatar_path: c.avatar_path }, 46, { group: true, channel: true }), h('div', { class: 'grow' }, h('b', null, c.title), h('small', null, c.my_role === 'member' ? 'Siguiendo' : 'Administras este canal'))));
  const sug = await rpc('list_channels', { q: '' }).catch(() => []);
  const rest = sug.filter(x => !x.following).slice(0, 8);
  if (rest.length) body.append(h('small', { class: 'muted pad' }, 'Encuentra canales para seguir'));
  for (const ch of rest) body.append(channelRow(ch));
  body.append(h('div', { class: 'row-btns pad' }, h('button', { class: 'btn ghost', onclick: () => import('./newchat.js').then(m => m.newGroupSheet('channel')) }, icon('plus', 16), ' Crear canal'), h('button', { class: 'btn ghost', onclick: () => channelSearch() }, icon('search', 16), ' Explorar')));
}
function channelRow(ch) {
  return h('div', { class: 'story-row' }, avatar({ id: ch.id, title: ch.title, avatar_path: ch.avatar_path }, 46, { group: true, channel: true }),
    h('div', { class: 'grow' }, h('b', null, ch.title), h('small', null, `${ch.followers} seguidor${ch.followers === 1 ? '' : 'es'}${ch.description ? ' · ' + ch.description.slice(0, 60) : ''}`)),
    ch.following ? h('button', { class: 'btn ghost sm', onclick: async () => { await refreshChat(ch.id); openChat(ch.id); } }, 'Abrir') :
      h('button', { class: 'btn primary sm', onclick: async e => { e.stopPropagation(); try { await rpc('follow_channel', { p_chat: ch.id, p_follow: true }); await loadChats(); toast('Siguiendo ' + ch.title); renderSide(); } catch (er) { toast(er.message); } } }, 'Seguir'));
}
function channelSearch() {
  const list = h('div', { class: 'list' });
  const q = h('input', { type: 'search', placeholder: 'Buscar canales', oninput: debounce(async () => { list.innerHTML = ''; for (const ch of await rpc('list_channels', { q: q.value.trim() })) list.append(channelRow(ch)); }, 250) });
  sheet('Explorar canales', h('div', { class: 'form' }, q, list)); q.dispatchEvent(new Event('input'));
}

// ===== Crear estado =====
function newStory() {
  let s; let bg = 0;
  const text = h('textarea', { class: 'story-text', rows: 4, maxlength: 700, placeholder: 'Escribe un estado', style: { background: BG[0] } });
  const go = async (kind, file) => {
    try {
      let media = null, body = null;
      if (kind === 'text') { body = text.value.trim(); if (!body) return toast('Escribe algo'); }
      else {
        if (file.size > LIMITS.story && !file.type.startsWith('image/')) return toast('Máximo 10 MB por estado');
        let blob = file; media = { mime: file.type };
        if (file.type.startsWith('image/')) { const r = await compressImage(file, 1440, 0.75); blob = r.blob; Object.assign(media, { w: r.w, h: r.h, thumb: r.thumb, mime: blob.type }); }
        else { const v = await videoInfo(file); if (v.dur > 61) return toast('Videos de estado: máximo 60 segundos'); Object.assign(media, { w: v.w, h: v.h, dur: v.dur, thumb: v.thumb }); }
        const path = `${S.user.id}/${crypto.randomUUID()}.${blob.type.split('/')[1]?.split(';')[0] || 'bin'}`;
        toast('Subiendo estado…');
        const { error } = await sb.storage.from('stories').upload(path, blob, { contentType: blob.type }); if (error) throw error;
        media.path = path; body = cap.value.trim() || null;
      }
      const { error } = await sb.from('stories').insert({ user_id: S.user.id, kind, body, style: kind === 'text' ? { bg: BG[bg] } : null, media }); if (error) throw error;
      s.close(); toast('Estado publicado'); if (S.tab === 'updates') renderSide();
    } catch (e) { toast('No se pudo publicar: ' + e.message); }
  };
  const cap = h('input', { placeholder: 'Comentario para la foto/video (opcional)', maxlength: 300 });
  const file = h('input', { type: 'file', accept: 'image/*,video/*', style: { display: 'none' }, onchange: () => file.files[0] && go(file.files[0].type.startsWith('video') ? 'video' : 'image', file.files[0]) });
  s = sheet('Nuevo estado', h('div', { class: 'form' }, text,
    h('div', { class: 'row-btns' }, h('button', { class: 'btn ghost', onclick: () => { bg = (bg + 1) % BG.length; text.style.background = BG[bg]; } }, '🎨 Color'), h('button', { class: 'btn primary', id: 'story-publish', onclick: () => go('text') }, 'Publicar texto')),
    h('hr'), cap, file, h('button', { class: 'btn ghost', onclick: () => file.click() }, icon('image', 18), ' Foto o video'),
    h('p', { class: 'fine' }, 'Visible para quienes compartan un chat contigo (cámbialo en Ajustes > Privacidad). Se elimina a las 24 horas.')));
}

// ===== Visor de estados =====
async function viewStories(uid) {
  const arr = stories.filter(s => s.user_id === uid); if (!arr.length) return;
  let i = Math.max(0, arr.findIndex(s => !s._seen)); if (uid === S.user.id) i = 0;
  let timer, raf;
  const wrap = h('div', { class: 'story-viewer', role: 'dialog', 'aria-label': 'Estado' });
  const close = () => { clearTimeout(timer); cancelAnimationFrame(raf); wrap.remove(); document.removeEventListener('keydown', key); if (S.tab === 'updates') renderSide(); };
  const key = e => { if (e.key === 'Escape') close(); if (e.key === 'ArrowRight') next(); if (e.key === 'ArrowLeft') prev(); };
  document.addEventListener('keydown', key);
  const next = () => { if (i < arr.length - 1) { i++; show(); } else close(); };
  const prev = () => { if (i > 0) { i--; show(); } };
  const show = async () => {
    clearTimeout(timer); cancelAnimationFrame(raf); wrap.innerHTML = '';
    const st = arr[i];
    const bars = h('div', { class: 'sbars' }, arr.map((_, k) => h('i', null, h('b', { style: { width: k < i ? '100%' : '0%' } }))));
    const stage = h('div', { class: 'sstage', style: st.kind === 'text' ? { background: st.style?.bg || BG[0] } : {} });
    if (st.kind === 'text') stage.append(h('p', { class: 'stext' }, st.body));
    else {
      const { data } = await sb.storage.from('stories').createSignedUrl(st.media.path, 600);
      stage.append(st.kind === 'video' ? h('video', { src: data?.signedUrl, autoplay: true, playsInline: true, onended: next }) : h('img', { src: data?.signedUrl, alt: '' }));
      if (st.body) stage.append(h('p', { class: 'scap' }, st.body));
    }
    const head = h('div', { class: 'shead' }, avatar(uid === S.user.id ? S.me : S.profiles.get(uid), 36), h('div', { class: 'grow' }, h('b', null, nameOf(uid)), h('small', null, fmtListTime(st.created_at))),
      uid === S.user.id ? btn('trash', 'Eliminar estado', async () => { if (await confirmDialog('¿Eliminar este estado?', 'Eliminar', true)) { await sb.from('stories').delete().eq('id', st.id); if (st.media?.path) await sb.storage.from('stories').remove([st.media.path]); close(); } }, 'icon-btn light') : null,
      btn('x', 'Cerrar', close, 'icon-btn light'));
    const foot = h('div', { class: 'sfoot' });
    if (uid === S.user.id) {
      const { data: views } = await sb.from('story_views').select('*').eq('story_id', st.id);
      await loadProfiles((views || []).map(v => v.viewer_id));
      foot.append(h('button', { class: 'sviews', onclick: () => { clearTimeout(timer); sheet('Visto por ' + (views?.length || 0), h('div', { class: 'list' }, (views || []).map(v => h('div', { class: 'person' }, avatar(S.profiles.get(v.viewer_id), 36), h('div', { class: 'grow' }, h('b', null, nameOf(v.viewer_id)), h('small', null, fmtTime(v.viewed_at))), v.reaction ? h('span', null, v.reaction) : null)))); } }, '👁 ', String(views?.length || 0)));
    } else {
      sb.from('story_views').upsert({ story_id: st.id, viewer_id: S.user.id }, { onConflict: 'story_id,viewer_id', ignoreDuplicates: true }).then(() => {}); st._seen = true;
      const rep = h('input', { placeholder: 'Responder…', maxlength: 500, onfocus: () => { clearTimeout(timer); cancelAnimationFrame(raf); } });
      const sendReply = async () => {
        const t = rep.value.trim(); if (!t) return;
        const cid = await rpc('open_direct', { other: uid }); await refreshChat(cid);
        await sendMessage(cid, { kind: 'text', body: t, meta: { story: { id: st.id, text: st.body?.slice(0, 80) || (st.kind === 'image' ? '📷 Foto' : '🎬 Video'), thumb: st.media?.thumb || null } } });
        toast('Respuesta enviada'); close();
      };
      rep.addEventListener('keydown', e => e.key === 'Enter' && sendReply());
      foot.append(rep, ...['❤️', '😂', '🔥', '👏'].map(e => h('button', { class: 'sreact', onclick: async () => { await sb.from('story_views').upsert({ story_id: st.id, viewer_id: S.user.id, reaction: e }); toast('Reaccionaste ' + e); } }, e)), btn('send', 'Enviar', sendReply, 'icon-btn light'));
    }
    wrap.append(bars, head, stage, h('button', { class: 'snav l', 'aria-label': 'Anterior', onclick: prev }), h('button', { class: 'snav r', 'aria-label': 'Siguiente', onclick: next }), foot);
    const dur = st.kind === 'video' ? (st.media?.dur || 15) * 1000 : 5500; const t0 = performance.now(); const bar = bars.children[i].firstChild;
    const anim = () => { const p = Math.min(1, (performance.now() - t0) / dur); bar.style.width = p * 100 + '%'; if (p < 1) raf = requestAnimationFrame(anim); };
    anim(); if (st.kind !== 'video') timer = setTimeout(next, dur);
  };
  document.body.append(wrap); show();
}
