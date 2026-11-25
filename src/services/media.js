import { sb } from './sb.js';
import { S, keyFor, isE2E } from './state.js';
import { encBytes, decBytes } from './crypto.js';

export const LIMITS = { image: 16 * 1048576, video: 16 * 1048576, audio: 16 * 1048576, document: 16 * 1048576, gif: 4 * 1048576, story: 10 * 1048576 };

async function bitmap(file) {
  try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch { const url = URL.createObjectURL(file); const img = new Image(); img.src = url; await img.decode(); URL.revokeObjectURL(url); return img; }
}
function canvasBlob(c, type, q) { return new Promise(r => c.toBlob(r, type, q)); }
// Comprime fotos a WebP (máx. 1600 px, calidad 0.72) y genera miniatura borrosa muy liviana
export async function compressImage(file, max = 1600, q = 0.72) {
  const bmp = await bitmap(file);
  const w0 = bmp.width, h0 = bmp.height, sc = Math.min(1, max / Math.max(w0, h0));
  const w = Math.round(w0 * sc), h = Math.round(h0 * sc);
  const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(bmp, 0, 0, w, h);
  let blob = await canvasBlob(c, 'image/webp', q);
  if (!blob || blob.type !== 'image/webp') blob = await canvasBlob(c, 'image/jpeg', q);
  if (blob.size > file.size && /image\/(jpeg|webp)/.test(file.type) && sc === 1) blob = file;
  return { blob, w, h, thumb: tinyThumb(c) };
}
export function tinyThumb(src) {
  const t = document.createElement('canvas'), w = src.width || src.videoWidth, h = src.height || src.videoHeight, s = 24 / Math.max(w, h);
  t.width = Math.max(1, Math.round(w * s)); t.height = Math.max(1, Math.round(h * s));
  t.getContext('2d').drawImage(src, 0, 0, t.width, t.height);
  return t.toDataURL('image/jpeg', 0.5);
}
export function videoInfo(file) {
  return new Promise(res => {
    const v = document.createElement('video'); v.preload = 'metadata'; v.muted = true; v.playsInline = true;
    const url = URL.createObjectURL(file); v.src = url;
    const done = (x) => { URL.revokeObjectURL(url); res(x); };
    v.onloadeddata = () => { v.currentTime = Math.min(0.5, (v.duration || 1) / 3); };
    v.onseeked = () => {
      const c = document.createElement('canvas'), s = Math.min(1, 480 / Math.max(v.videoWidth, v.videoHeight));
      c.width = Math.max(1, v.videoWidth * s); c.height = Math.max(1, v.videoHeight * s); c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
      done({ w: v.videoWidth, h: v.videoHeight, dur: v.duration, thumb: tinyThumb(c), poster: c.toDataURL('image/jpeg', 0.6) });
    };
    v.onerror = () => done({ w: 0, h: 0, dur: 0 });
    setTimeout(() => done({ w: v.videoWidth || 0, h: v.videoHeight || 0, dur: v.duration || 0 }), 6000);
  });
}
export function audioDuration(file) {
  return new Promise(res => { const a = new Audio(); const u = URL.createObjectURL(file); a.src = u; a.onloadedmetadata = () => { res(isFinite(a.duration) ? a.duration : 0); URL.revokeObjectURL(u); }; a.onerror = () => res(0); });
}
const ext = (type, name) => (name && name.includes('.') ? name.split('.').pop().slice(0, 8) : ({ 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'video/mp4': 'mp4', 'video/webm': 'webm', 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3' }[type?.split(';')[0]] || 'bin')).toLowerCase().replace(/[^a-z0-9]/g, '');

// Sube un archivo al chat; si el chat es 1:1 se cifra antes de salir del dispositivo
export async function uploadToChat(chatId, blob, name) {
  const chat = S.chats.get(chatId);
  let body = blob, contentType = blob.type || 'application/octet-stream';
  if (isE2E(chat)) {
    const key = await keyFor(chatId); if (!key) throw new Error('Sin clave de cifrado');
    body = new Blob([await encBytes(key, await blob.arrayBuffer())], { type: 'application/octet-stream' }); contentType = 'application/octet-stream';
  }
  const path = `${chatId}/${S.user.id}/${crypto.randomUUID()}.${isE2E(chat) ? 'enc' : ext(blob.type, name)}`;
  const { error } = await sb.storage.from('media').upload(path, body, { contentType, upsert: false, cacheControl: '31536000' });
  if (error) throw new Error(error.message.includes('exceeded') || error.message.includes('size') ? 'El archivo supera el límite permitido' : error.message);
  return { path, size: blob.size, mime: (blob.type || 'application/octet-stream').split(';')[0] };
}
const urlCache = new Map();
export async function mediaUrl(m) {
  if (!m?.media?.path) return null;
  if (m._localUrl) return m._localUrl;
  const k = m.media.path; if (urlCache.has(k)) return urlCache.get(k);
  const p = (async () => {
    if (m.media.e2e) {
      const key = await keyFor(m.chat_id); if (!key) throw new Error('Sin clave');
      const { data, error } = await sb.storage.from('media').download(k); if (error) throw error;
      const plain = await decBytes(key, await data.arrayBuffer());
      return URL.createObjectURL(new Blob([plain], { type: m.media.mime || 'application/octet-stream' }));
    }
    const { data, error } = await sb.storage.from('media').createSignedUrl(k, 3600 * 6); if (error) throw error;
    return data.signedUrl;
  })();
  urlCache.set(k, p); p.catch(() => urlCache.delete(k));
  return p;
}
export async function mediaBlob(m) { const u = await mediaUrl(m); return (await fetch(u)).blob(); }
export function forgetUrl(path) { urlCache.delete(path); }

// Grabadora de notas de voz (Opus ~24 kbps ≈ 180 KB por minuto)
export class VoiceRecorder {
  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    const types = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm'];
    const mimeType = types.find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || '';
    this.rec = new MediaRecorder(this.stream, mimeType ? { mimeType, audioBitsPerSecond: 24000 } : { audioBitsPerSecond: 24000 });
    this.chunks = []; this.levels = [];
    this.rec.ondataavailable = e => e.data.size && this.chunks.push(e.data);
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    const src = this.ctx.createMediaStreamSource(this.stream); this.an = this.ctx.createAnalyser(); this.an.fftSize = 512; src.connect(this.an);
    const buf = new Uint8Array(this.an.fftSize);
    this.timer = setInterval(() => { this.an.getByteTimeDomainData(buf); let m = 0; for (const v of buf) m = Math.max(m, Math.abs(v - 128)); this.levels.push(m / 128); this.onlevel && this.onlevel(m / 128); }, 100);
    this.t0 = Date.now(); this.rec.start(250);
  }
  get elapsed() { return (Date.now() - this.t0) / 1000; }
  pause() { this.rec?.state === 'recording' && this.rec.pause(); }
  resume() { this.rec?.state === 'paused' && this.rec.resume(); }
  async stop() {
    const done = new Promise(r => this.rec.onstop = r); this.rec.stop(); await done; this.cleanup();
    const blob = new Blob(this.chunks, { type: (this.rec.mimeType || 'audio/webm').split(';')[0] });
    return { blob, dur: this.elapsed, wave: waveform(this.levels) };
  }
  cancel() { try { this.rec && this.rec.state !== 'inactive' && this.rec.stop(); } catch {} this.cleanup(); }
  cleanup() { clearInterval(this.timer); this.stream?.getTracks().forEach(t => t.stop()); this.ctx?.close().catch(() => {}); }
}
function waveform(levels, n = 40) {
  if (!levels.length) return Array(n).fill(2);
  const out = []; for (let i = 0; i < n; i++) { const a = Math.floor(i * levels.length / n), b = Math.max(a + 1, Math.floor((i + 1) * levels.length / n)); out.push(Math.round(2 + 14 * Math.min(1, Math.max(...levels.slice(a, b)) * 1.8))); }
  return out;
}
