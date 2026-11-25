// Momentos: el muro social de DUNA. Reúne los estados (foto, video o texto) de tus contactos en un solo feed.
// Duran 24 horas y se borran solos (tarea private.purge_expired). Las fotos se comprimen en el teléfono antes de subir;
// en la base solo queda la ficha mínima (autor, texto, ruta del archivo y vencimiento).
import { sb } from '../../services/sb.js';
import { h, icon, btn, toast } from '../../shared/ui.js';
import { S, nameOf } from '../../services/state.js';
import { avatar } from '../../shared/people.js';
import { ensureCss, ago, empty, loading } from '../../shared/kit.js';
import { loadStories, newStory, viewStories } from '../discover/stories.js';
const left = iso => { const ms = new Date(iso) - Date.now(); const hh = Math.max(0, Math.floor(ms / 36e5)); return hh >= 1 ? `queda${hh === 1 ? '' : 'n'} ${hh} h` : 'menos de 1 h'; };
export async function renderMoments(side, head) {
  await ensureCss();
  const feedEl = h('div', { class: 'mo-feed', role: 'feed', id: 'moments-feed' }, loading());
  side.append(head('Momentos', [btn('camera', 'Nuevo momento', () => newStory())]),
    h('button', { class: 'mo-new', type: 'button', onclick: () => newStory() }, avatar(S.me, 40), h('span', null, '¿Qué quieres compartir hoy?'), icon('image', 20)), feedEl,
    h('button', { class: 'fab', title: 'Nuevo momento', 'aria-label': 'Nuevo momento', onclick: () => newStory() }, icon('camera', 24)));
  let list;
  try { list = (await loadStories()).slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at)); } catch (e) { feedEl.innerHTML = ''; return feedEl.append(empty(e.message)); }
  feedEl.innerHTML = '';
  if (!list.length) return feedEl.append(empty('Aún no hay momentos. Comparte una foto o un texto: lo verán tus contactos durante 24 horas.', 'camera'));
  // URLs firmadas en un solo viaje para todas las fotos visibles
  const paths = list.filter(s => s.media?.path && s.kind === 'image').map(s => s.media.path);
  const urls = new Map(); if (paths.length) { const { data } = await sb.storage.from('stories').createSignedUrls(paths, 900); (data || []).forEach(d => d.signedUrl && urls.set(d.path, d.signedUrl)); }
  for (const st of list) {
    const mine = st.user_id === S.user.id, who = mine ? S.me : S.profiles.get(st.user_id);
    let media = null;
    if (st.kind === 'text') media = h('div', { class: 'mo-text', style: { background: st.style?.bg || '#3B2FD6' } }, st.body);
    else if (st.kind === 'image') media = h('div', { class: 'mo-img', style: st.media?.thumb ? { backgroundImage: `url(${st.media.thumb})` } : {} }, urls.get(st.media.path) ? h('img', { src: urls.get(st.media.path), alt: st.body || 'Foto', loading: 'lazy', decoding: 'async' }) : null);
    else media = h('div', { class: 'mo-img mo-vid', style: st.media?.thumb ? { backgroundImage: `url(${st.media.thumb})` } : {} }, h('span', { class: 'vd-play' }, icon('play', 26)));
    const like = h('button', { class: 'mo-act', type: 'button', onclick: async e => { e.stopPropagation(); if (mine) return; const { error } = await sb.from('story_views').upsert({ story_id: st.id, viewer_id: S.user.id, reaction: '❤️' }); if (error) return toast(error.message); like.classList.add('on'); toast('Te gusta el momento de ' + nameOf(st.user_id)); } }, '❤️', h('span', null, mine ? 'Tuyo' : 'Me gusta'));
    feedEl.append(h('article', { class: 'mo', dataset: { id: st.id } },
      h('header', { class: 'mo-head' }, avatar(who, 38), h('div', { class: 'grow' }, h('b', null, mine ? 'Tú' : nameOf(st.user_id)), h('small', null, `${ago(st.created_at)} · ${left(st.expires_at)}`))),
      h('div', { class: 'mo-media', onclick: () => viewStories(st.user_id) }, media), st.kind !== 'text' && st.body ? h('p', { class: 'mo-cap' }, st.body) : null,
      h('footer', { class: 'mo-acts' }, like, h('button', { class: 'mo-act', type: 'button', onclick: () => viewStories(st.user_id) }, icon(mine ? 'eye1' : 'reply', 18), h('span', null, mine ? 'Ver quién lo vio' : 'Responder')))));
  }
}
