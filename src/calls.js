// Llamadas de voz y video (WebRTC, malla hasta 6 personas). Señalización por Supabase Realtime (canal privado call:<chat>).
import { sb } from './sb.js';
import { h, icon, btn, toast, fmtDur, fmtListTime, menu } from './ui.js';
import { S, chatTitle, nameOf, refreshChat } from './state.js';
import { avatar, chatAvatar, beep } from './main.js';

// Solo servidores STUN públicos y gratuitos (varios proveedores por redundancia). Sin TURN: en redes con NAT simétrico o firewalls estrictos la llamada puede no conectar.
export const ICE = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302', 'stun:stun3.l.google.com:19302', 'stun:stun4.l.google.com:19302'] },
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:global.stun.twilio.com:3478' },
];
const RTC_CFG = { iceServers: ICE, iceCandidatePoolSize: 4, bundlePolicy: 'max-bundle' };
// Servidores TURN (relé) configurados en el servidor (private.app_config 'turn_ice'); sin ellos solo STUN.
// Sin TURN, entre datos móviles (CGNAT) o redes estrictas la llamada puede quedarse en "Conectando…".
let iceAt = 0, iceTurn = [];
async function loadIce() {
  if (Date.now() - iceAt < 10 * 60e3) return;
  try { const { data } = await sb.rpc('ice_servers'); if (Array.isArray(data)) { iceTurn = data; iceAt = Date.now(); } } catch (e) { log('ice-cfg', e.message); }
  RTC_CFG.iceServers = [...ICE, ...iceTurn];
}
export const hasTurn = () => iceTurn.length > 0;
let active = null, incoming = null, ringTimer = null;
Object.defineProperty(window.__duna = window.__duna || {}, 'call', { get: () => active, configurable: true });
window.__duna = window.__duna || {}; const LOG = window.__duna.callLog = []; const log = (...a) => { LOG.push(a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' ').slice(0, 200)); if (LOG.length > 200) LOG.shift(); }; Object.defineProperty(window.__duna, 'call', { get: () => active, configurable: true });

export function initCalls() { checkRinging(); }
/** Al abrir/volver a la app (p. ej. desde la notificación de llamada): si hay una llamada sonando que no vimos por Realtime, se muestra. */
export async function checkRinging() {
  if (active || incoming || !S.user) return;
  const since = new Date(Date.now() - 45000).toISOString();
  const { data } = await sb.from('calls').select('*').eq('status', 'ringing').neq('caller_id', S.user.id).gt('created_at', since).order('created_at', { ascending: false }).limit(1);
  if (data?.[0]) onCallEvent({ eventType: 'INSERT', new: data[0] });
}
function ring(on) { clearInterval(ringTimer); if (on) { const r = () => { beep(620, 0.25, 0.07); setTimeout(() => beep(780, 0.3, 0.07), 300); }; r(); ringTimer = setInterval(r, 2200); } }

export async function startCall(chatId, kind = 'audio') {
  if (active) return toast('Ya estás en una llamada');
  const c = S.chats.get(chatId); if (!c) return;
  if (c.type === 'direct' && !c.other_id) return toast('No puedes llamarte a ti mismo');
  if ((S.members.get(chatId)?.size || 2) > 6) return toast('Las llamadas grupales admiten hasta 6 personas en esta versión');
  let local;
  loadIce();
  try { local = await getMedia(kind); } catch (e) { return toast('Sin acceso a micrófono/cámara: ' + e.message); }
  await loadIce();
  const { data: call, error } = await sb.from('calls').insert({ chat_id: chatId, caller_id: S.user.id, kind, status: 'ringing' }).select().single();
  if (error) { local.getTracks().forEach(t => t.stop()); return toast('No se pudo iniciar la llamada: ' + error.message); }
  active = newSession(call, local, true);
  renderCallUI();
  joinRoom();
  active.noAnswer = setTimeout(() => { if (active && active.call.id === call.id && !active.connectedOnce) { sb.from('calls').update({ status: 'missed', ended_at: new Date().toISOString() }).eq('id', call.id).then(() => {}); toast('No contestaron'); hangup(false); } }, 45000);
}
async function getMedia(kind) {
  return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: kind === 'video' ? { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' } : false });
}
function newSession(call, local, outgoing) {
  return { call, local, outgoing, pcs: new Map(), streams: new Map(), pendingIce: new Map(), ch: null, muted: false, camOff: call.kind !== 'video', started: null, connectedOnce: false, facing: 'user', states: {}, missing: new Map(), restarts: {}, discT: {}, chRetry: 0 };
}

export async function onCallEvent(p) {
  const call = p.new; if (!call?.id) return;
  if (p.eventType === 'INSERT') {
    if (call.caller_id === S.user.id || call.status !== 'ringing') return;
    if (active || incoming) return; // ocupado
    if (!S.chats.has(call.chat_id)) await refreshChat(call.chat_id);
    const c = S.chats.get(call.chat_id); if (!c || (c.muted_until && new Date(c.muted_until) > new Date() && c.type !== 'direct')) return;
    incoming = call; showIncoming(call); ring(true);
    if (S.prefs.notif && document.hidden && 'Notification' in window && Notification.permission === 'granted') navigator.serviceWorker?.ready.then(r => r.showNotification('Llamada entrante · ' + chatTitle(c), { body: call.kind === 'video' ? 'Videollamada' : 'Llamada de voz', tag: 'call-' + call.id, requireInteraction: true, data: { chat: c.id } }));
    setTimeout(() => { if (incoming?.id === call.id) { incoming = null; ring(false); document.getElementById('incoming')?.remove(); } }, 45000);
  } else if (p.eventType === 'UPDATE') {
    if (incoming?.id === call.id && call.status !== 'ringing') {
      const c = S.chats.get(call.chat_id);
      if (c?.type === 'direct' || call.status !== 'ongoing') { incoming = null; ring(false); document.getElementById('incoming')?.remove(); }
    }
    if (active?.call.id === call.id) {
      active.call = { ...active.call, ...call };
      const c = S.chats.get(call.chat_id);
      if (call.status === 'declined' && c?.type === 'direct') { toast('Llamada rechazada'); hangup(false); }
      else if (['ended', 'missed'].includes(call.status) && (c?.type === 'direct' || !active.pcs.size)) hangup(false);
    }
  }
}
function showIncoming(call) {
  const c = S.chats.get(call.chat_id);
  document.getElementById('incoming')?.remove();
  document.body.append(h('div', { class: 'incoming', id: 'incoming', role: 'alertdialog', 'aria-label': 'Llamada entrante' },
    chatAvatar(c, 64), h('div', { class: 'grow' }, h('b', null, chatTitle(c)), h('small', null, (call.kind === 'video' ? 'Videollamada' : 'Llamada de voz') + (c.type !== 'direct' ? ' · ' + nameOf(call.caller_id) : '') + ' entrante')),
    h('button', { class: 'round red', id: 'call-decline', 'aria-label': 'Rechazar', onclick: () => decline(call) }, icon('phoneoff')),
    h('button', { class: 'round green', id: 'call-accept', 'aria-label': 'Contestar', onclick: () => accept(call) }, icon(call.kind === 'video' ? 'video' : 'call'))));
}
async function decline(call) {
  incoming = null; ring(false); document.getElementById('incoming')?.remove();
  if (S.chats.get(call.chat_id)?.type === 'direct') await sb.from('calls').update({ status: 'declined', ended_at: new Date().toISOString() }).eq('id', call.id);
}
/** Contestar desde la notificación del teléfono (botón "Contestar"): sin segundo toque. */
export async function answerFromNotification(call) {
  if (active) return;
  if (incoming && incoming.id !== call.id) return;
  return accept(call);
}
async function accept(call) {
  incoming = null; ring(false); document.getElementById('incoming')?.remove();
  loadIce();
  let local; try { local = await getMedia(call.kind); } catch (e) { try { local = await getMedia('audio'); } catch (e2) { return toast('Sin acceso al micrófono: ' + e2.message); } }
  await loadIce();
  active = newSession(call, local, false);
  await sb.from('calls').update({ status: 'ongoing', answered_at: new Date().toISOString() }).eq('id', call.id);
  renderCallUI(); joinRoom();
}
function joinRoom() {
  const s = active; const me = S.user.id;
  s.ch = sb.channel('call:' + s.call.chat_id, { config: { private: true, broadcast: { self: false }, presence: { key: me } } })
    .on('presence', { event: 'sync' }, () => {
      if (active !== s) return;
      const st = s.ch.presenceState();
      const here = Object.entries(st).filter(([uid, arr]) => uid !== me && arr.some(x => x.call_id === s.call.id)).map(([uid]) => uid);
      for (const uid of here) if (!s.pcs.has(uid) && me < uid) makeOffer(uid);
      for (const uid of [...s.pcs.keys()]) {
        if (here.includes(uid)) { clearTimeout(s.missing.get(uid)); s.missing.delete(uid); }
        else if (!s.missing.has(uid)) s.missing.set(uid, setTimeout(() => { s.missing.delete(uid); if (active === s && s.pcs.has(uid)) { log('presence-timeout', uid.slice(0, 6)); dropPeer(uid); } }, 10000)); // margen para cortes breves de red
      }
      renderCallUI();
    })
    .on('broadcast', { event: 'sig' }, ({ payload }) => { if (active === s && payload.to === me && payload.call === s.call.id) onSignal(payload); })
    .subscribe(async st => {
      log('ch', st);
      if (st === 'SUBSCRIBED') { s.chRetry = 0; await s.ch.track({ call_id: s.call.id, kind: s.call.kind, at: Date.now() }); }
      if ((st === 'CHANNEL_ERROR' || st === 'TIMED_OUT' || st === 'CLOSED') && active === s && s.chRetry < 6) {
        s.chRetry++; const old = s.ch; setTimeout(() => { if (active !== s) return; sb.removeChannel(old); joinRoom(); }, 1500 * s.chRetry); // reconectar señalización
      }
    });
}
function restartIce(uid) {
  const s = active; const pc = s?.pcs.get(uid); if (!pc) return;
  s.restarts[uid] = (s.restarts[uid] || 0) + 1; if (s.restarts[uid] > 4) return;
  log('ice-restart', uid.slice(0, 6), s.restarts[uid]);
  if (S.user.id < uid) { pc.restartIce?.(); pc.createOffer({ iceRestart: true }).then(o => pc.setLocalDescription(o)).then(() => send(uid, 'offer', pc.localDescription.toJSON())).catch(e => log('restart-err', e.message)); }
  else send(uid, 'restart', {});
}
const send = (to, type, data) => { log('tx', type, to.slice(0, 6)); return active?.ch.send({ type: 'broadcast', event: 'sig', payload: { call: active.call.id, from: S.user.id, to, type, data } }).then(r => { if (r !== 'ok') log('send-res', r); return r; }); };
function ensurePc(uid) {
  const s = active; if (s.pcs.has(uid)) return s.pcs.get(uid);
  const pc = new RTCPeerConnection(RTC_CFG);
  s.pcs.set(uid, pc);
  s.local.getTracks().forEach(t => pc.addTrack(t, s.local));
  if (s.call.kind === 'video' && !s.local.getVideoTracks().length) pc.addTransceiver('video', { direction: 'recvonly' });
  pc.onicecandidate = e => e.candidate && send(uid, 'ice', e.candidate.toJSON());
  pc.ontrack = e => { s.streams.set(uid, e.streams[0] || new MediaStream([e.track])); renderCallUI(); };
  pc.onconnectionstatechange = () => {
    s.states[uid] = pc.connectionState; log('state', pc.connectionState);
    clearTimeout(s.discT[uid]);
    if (pc.connectionState === 'connected') { if (!s.started) s.started = Date.now(); s.connectedOnce = true; clearTimeout(s.noAnswer); s.restarts[uid] = 0; }
    if (pc.connectionState === 'disconnected') s.discT[uid] = setTimeout(() => { if (active === s && pc.connectionState !== 'connected') restartIce(uid); }, 3000);
    if (pc.connectionState === 'failed') {
      if ((s.restarts[uid] || 0) < 4) restartIce(uid);
      else toast('No se pudo conectar el audio/video con ' + nameOf(uid) + (hasTurn() ? '. Revisa la conexión a internet.' : '. Entre datos móviles algunas redes necesitan un servidor de relé (TURN) que aún no está activado.'), 7000);
    }
    renderCallUI();
  };
  return pc;
}
async function makeOffer(uid) {
  const pc = ensurePc(uid);
  const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
  send(uid, 'offer', pc.localDescription.toJSON());
}
async function onSignal({ from, type, data }) {
  const s = active; log('rx', type, from.slice(0, 6));
  if (type === 'bye') return dropPeer(from);
  if (type === 'restart') return restartIce(from);
  const pc = ensurePc(from);
  try {
    if (type === 'offer') {
      await pc.setRemoteDescription(data); flushIce(from, pc);
      const ans = await pc.createAnswer(); await pc.setLocalDescription(ans); send(from, 'answer', pc.localDescription.toJSON());
    } else if (type === 'answer') { await pc.setRemoteDescription(data); flushIce(from, pc); }
    else if (type === 'ice') { if (pc.remoteDescription) await pc.addIceCandidate(data).catch(() => {}); else { if (!s.pendingIce.has(from)) s.pendingIce.set(from, []); s.pendingIce.get(from).push(data); } }
  } catch (e) { log('err', type, e.message); }
}
function flushIce(uid, pc) { const q = active.pendingIce.get(uid) || []; active.pendingIce.delete(uid); q.forEach(c => pc.addIceCandidate(c).catch(() => {})); }
function dropPeer(uid) {
  const s = active; if (!s) return; s.pcs.get(uid)?.close(); s.pcs.delete(uid); s.streams.delete(uid); delete s.states[uid];
  const c = S.chats.get(s.call.chat_id);
  if (c?.type === 'direct' || !s.pcs.size) { toast('Llamada finalizada'); hangup(true); } else renderCallUI();
}
export async function hangup(updateDb = true) {
  const s = active; if (!s) return; active = null; clearTimeout(s.noAnswer); clearInterval(s.tick);
  for (const uid of s.pcs.keys()) s.ch?.send({ type: 'broadcast', event: 'sig', payload: { call: s.call.id, from: S.user.id, to: uid, type: 'bye' } });
  s.pcs.forEach(pc => pc.close()); s.local.getTracks().forEach(t => t.stop()); s.screen?.getTracks().forEach(t => t.stop());
  document.getElementById('call-ui')?.remove();
  const c = S.chats.get(s.call.chat_id);
  if (updateDb && (c?.type === 'direct' || s.outgoing)) {
    const status = s.connectedOnce ? 'ended' : (s.outgoing ? 'missed' : 'ended');
    await sb.from('calls').update({ status, ended_at: new Date().toISOString() }).eq('id', s.call.id);
  }
  setTimeout(() => { try { s.ch?.untrack(); sb.removeChannel(s.ch); } catch {} }, 600);
  if (S.tab === 'calls') import('./main.js').then(m => m.renderSide());
}

// ===== Interfaz de llamada =====
function renderCallUI() {
  const s = active; if (!s) return;
  const c = S.chats.get(s.call.chat_id);
  let ui = document.getElementById('call-ui');
  if (!ui) {
    ui = h('div', { class: 'call-ui', id: 'call-ui', role: 'dialog', 'aria-label': 'Llamada' },
      h('div', { class: 'call-grid', id: 'call-grid' }),
      h('video', { class: 'call-local', id: 'call-local', autoplay: true, muted: true, playsInline: true }),
      h('div', { class: 'call-top' }, h('b', { id: 'call-title' }), h('small', { id: 'call-status' })),
      h('div', { class: 'call-ctrls' },
        h('button', { class: 'round', id: 'call-mute', 'aria-label': 'Silenciar micrófono', onclick: toggleMute }),
        h('button', { class: 'round', id: 'call-cam', 'aria-label': 'Cámara', onclick: toggleCam }),
        h('button', { class: 'round', id: 'call-flip', 'aria-label': 'Cambiar cámara', onclick: flipCam }, icon('flip')),
        navigator.mediaDevices?.getDisplayMedia ? h('button', { class: 'round', id: 'call-screen', 'aria-label': 'Compartir pantalla', onclick: shareScreen }, icon('screen')) : null,
        h('button', { class: 'round red', id: 'call-hang', 'aria-label': 'Colgar', onclick: () => hangup(true) }, icon('phoneoff'))));
    document.body.append(ui);
    s.tick = setInterval(() => { const st = document.getElementById('call-status'); if (st && s.started) st.textContent = Object.values(s.states).some(x => x === 'disconnected' || x === 'failed') ? 'Reconectando…' : fmtDur((Date.now() - s.started) / 1000); }, 1000);
  }
  const lv = document.getElementById('call-local'); if (lv.srcObject !== (s.screen || s.local)) lv.srcObject = s.screen || s.local;
  lv.hidden = s.camOff && !s.screen;
  document.getElementById('call-title').textContent = chatTitle(c);
  if (!s.started) document.getElementById('call-status').textContent = s.pcs.size ? 'Conectando…' : (s.outgoing ? 'Llamando…' : 'Conectando…');
  else if (Object.values(s.states).some(x => x === 'disconnected' || x === 'failed')) document.getElementById('call-status').textContent = 'Reconectando…';
  const mb = document.getElementById('call-mute'); mb.innerHTML = ''; mb.append(icon(s.muted ? 'micoff' : 'mic')); mb.classList.toggle('off', s.muted);
  const cb = document.getElementById('call-cam'); cb.innerHTML = ''; cb.append(icon(s.camOff ? 'videooff' : 'video')); cb.classList.toggle('off', s.camOff);
  const grid = document.getElementById('call-grid');
  const want = new Set([...s.pcs.keys()]);
  [...grid.children].forEach(t => { if (!want.has(t.dataset.uid)) t.remove(); });
  for (const uid of want) {
    let t = grid.querySelector(`[data-uid="${uid}"]`);
    if (!t) { t = h('div', { class: 'call-tile', dataset: { uid } }, avatar(S.profiles.get(uid), 96), h('video', { autoplay: true, playsInline: true }), h('span', { class: 'call-name' }, nameOf(uid))); grid.append(t); }
    const v = t.querySelector('video'); const st = s.streams.get(uid);
    if (st && v.srcObject !== st) { v.srcObject = st; v.muted = true; v.play?.().catch(() => {}); }
    // El audio va en su propio <audio> con play() explícito (iPhone/Safari no siempre reproduce el sonido de un <video> oculto)
    let au = t.querySelector('audio'); if (!au) { au = h('audio', { autoplay: true, playsInline: true }); t.append(au); }
    if (st && au.srcObject !== st) { au.srcObject = st; au.play().catch(() => showAudioUnlock(au)); }
    const hasVid = st?.getVideoTracks().some(x => x.readyState === 'live' && !x.muted);
    t.classList.toggle('has-video', !!hasVid);
    t.dataset.state = s.states[uid] || 'new';
  }
  if (!want.size) { grid.innerHTML = ''; grid.append(h('div', { class: 'call-tile solo' }, chatAvatar(c, 120), h('span', { class: 'call-name' }, chatTitle(c)))); }
  grid.dataset.n = want.size;
  setTimeout(() => active === s && grid.querySelectorAll('.call-tile[data-uid]').forEach(t => { const st = s.streams.get(t.dataset.uid); t.classList.toggle('has-video', !!st?.getVideoTracks().some(x => x.readyState === 'live' && !x.muted)); }), 1200);
}
function showAudioUnlock(au) {
  if (document.getElementById('call-unmute')) return;
  const b = h('button', { class: 'btn primary', id: 'call-unmute', style: { position: 'fixed', left: '50%', bottom: '120px', transform: 'translateX(-50%)', zIndex: 9999 }, onclick: () => { document.querySelectorAll('#call-ui audio').forEach(a => a.play().catch(() => {})); b.remove(); } }, '🔊 Toca para activar el audio');
  document.body.append(b);
}
function toggleMute() { const s = active; s.muted = !s.muted; s.local.getAudioTracks().forEach(t => t.enabled = !s.muted); renderCallUI(); }
async function toggleCam() {
  const s = active;
  if (s.camOff) {
    let vt = s.local.getVideoTracks()[0];
    if (!vt) { try { const st = await navigator.mediaDevices.getUserMedia({ video: { facingMode: s.facing, width: { ideal: 640 } } }); vt = st.getVideoTracks()[0]; s.local.addTrack(vt); for (const [uid, pc] of s.pcs) { const tr = pc.getTransceivers().find(t => t.receiver.track.kind === 'video'); if (tr) { tr.direction = 'sendrecv'; await tr.sender.replaceTrack(vt); } else pc.addTrack(vt, s.local); const o = await pc.createOffer(); await pc.setLocalDescription(o); send(uid, 'offer', pc.localDescription.toJSON()); } } catch (e) { return toast('Sin cámara: ' + e.message); } }
    vt.enabled = true; s.camOff = false;
  } else { s.local.getVideoTracks().forEach(t => t.enabled = false); s.camOff = true; }
  renderCallUI();
}
async function flipCam() {
  const s = active; const old = s.local.getVideoTracks()[0]; if (!old) return toast('Activa la cámara primero');
  s.facing = s.facing === 'user' ? 'environment' : 'user';
  try {
    const st = await navigator.mediaDevices.getUserMedia({ video: { facingMode: s.facing } }); const vt = st.getVideoTracks()[0];
    for (const pc of s.pcs.values()) pc.getSenders().find(x => x.track?.kind === 'video')?.replaceTrack(vt);
    s.local.removeTrack(old); old.stop(); s.local.addTrack(vt); renderCallUI();
  } catch (e) { toast('No se pudo cambiar la cámara'); }
}
async function shareScreen() {
  const s = active;
  if (s.screen) { const vt = s.local.getVideoTracks()[0] || null; for (const pc of s.pcs.values()) pc.getSenders().find(x => x.track?.kind === 'video')?.replaceTrack(vt); s.screen.getTracks().forEach(t => t.stop()); s.screen = null; return renderCallUI(); }
  try {
    s.screen = await navigator.mediaDevices.getDisplayMedia({ video: true }); const vt = s.screen.getVideoTracks()[0];
    let needOffer = false;
    for (const pc of s.pcs.values()) { const snd = pc.getSenders().find(x => x.track?.kind === 'video') || pc.getTransceivers().find(t => t.receiver.track.kind === 'video')?.sender; if (snd) { await snd.replaceTrack(vt); const tr = pc.getTransceivers().find(t => t.sender === snd); if (tr && tr.direction === 'recvonly') { tr.direction = 'sendrecv'; needOffer = true; } } else { pc.addTrack(vt, s.screen); needOffer = true; } }
    if (needOffer) for (const [uid, pc] of s.pcs) { const o = await pc.createOffer(); await pc.setLocalDescription(o); send(uid, 'offer', pc.localDescription.toJSON()); }
    vt.onended = () => active === s && s.screen && shareScreen();
    renderCallUI();
  } catch {}
}

// ===== Pestaña Llamadas =====
export async function renderCalls(side, sideHeader) {
  const list = h('div', { class: 'list' }, h('div', { class: 'spinner' }));
  side.append(sideHeader('Llamadas', [btn('plus', 'Nueva llamada', e => newCallMenu(e.currentTarget))]), list,
    h('button', { class: 'fab', title: 'Nueva llamada', 'aria-label': 'Nueva llamada', onclick: e => newCallMenu(e.currentTarget) }, icon('call', 24)));
  const { data, error } = await sb.from('calls').select('*').order('created_at', { ascending: false }).limit(60);
  list.innerHTML = '';
  if (error) return list.append(h('p', { class: 'muted' }, error.message));
  if (!data.length) list.append(h('div', { class: 'list-empty' }, h('p', null, 'Aún no tienes llamadas.'), h('p', { class: 'fine' }, 'Las llamadas usan WebRTC con servidores STUN públicos. Sin un servidor TURN algunas redes (corporativas o datos móviles con NAT estricto) pueden no conectar.')));
  for (const call of data) {
    const c = S.chats.get(call.chat_id); if (!c) continue;
    const out = call.caller_id === S.user.id; const missed = !out && ['missed', 'ringing'].includes(call.status) || (!out && call.status === 'declined');
    const dur = call.answered_at && call.ended_at ? fmtDur((new Date(call.ended_at) - new Date(call.answered_at)) / 1000) : '';
    list.append(h('div', { class: 'chat-row' }, chatAvatar(c, 46),
      h('div', { class: 'row-main' }, h('div', { class: 'row-top' }, h('span', { class: 'title' + (missed ? ' miss' : '') }, chatTitle(c))),
        h('div', { class: 'row-bot' }, h('span', { class: 'prev' + (missed ? ' miss' : '') }, out ? '↗ ' : '↙ ', missed ? 'Perdida' : call.status === 'declined' ? 'Rechazada' : out && call.status === 'missed' ? 'Sin respuesta' : (out ? 'Saliente' : 'Entrante'), ' · ', fmtListTime(call.created_at), dur ? ' · ' + dur : ''))),
      btn(call.kind === 'video' ? 'video' : 'call', 'Llamar de nuevo', () => startCall(c.id, call.kind))));
  }
}
function newCallMenu(anchor) {
  const chats = [...S.chats.values()].filter(c => (c.type === 'direct' && c.other_id) || c.type === 'group').slice(0, 12);
  if (!chats.length) return toast('Primero inicia un chat');
  menu(chats.map(c => ({ icon: 'call', label: chatTitle(c), action: () => setTimeout(() => menu([{ icon: 'call', label: 'Voz', action: () => startCall(c.id, 'audio') }, { icon: 'video', label: 'Video', action: () => startCall(c.id, 'video') }], anchor), 10) })), anchor);
}
