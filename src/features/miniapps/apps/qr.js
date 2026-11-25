// QR: escanear con la cámara (BarcodeDetector nativo o jsQR como respaldo) y crear códigos. Todo en el teléfono.
import { h, icon, toast, copyText, download } from '../../../shared/ui.js';
import qrcode from 'qrcode-generator';
import { openLink } from '../../../shared/reader.js';
export function mount(ctx) {
  const tabsEl = h('div', { class: 'seg' }), body = h('div', { class: 'qr-b' });
  let stream = null, raf = 0;
  const stop = () => { cancelAnimationFrame(raf); stream?.getTracks().forEach(t => t.stop()); stream = null; };
  new MutationObserver((_, o) => { if (!ctx.layer.isConnected) { stop(); o.disconnect(); } }).observe(document.body, { childList: true });
  const found = txt => {
    stop(); body.innerHTML = '';
    const url = /^https?:\/\//i.test(txt);
    body.append(h('div', { class: 'qr-found' }, h('small', null, 'Contenido del código'), h('p', { class: 'qr-txt' }, txt),
      h('div', { class: 'row-btns' }, url ? h('button', { class: 'btn primary', onclick: () => openLink(txt) }, 'Abrir en DUNA') : null, h('button', { class: 'btn ghost', onclick: () => copyText(txt) }, 'Copiar'), h('button', { class: 'btn ghost', onclick: scan }, 'Escanear otro'))));
  };
  async function scan() {
    stop(); body.innerHTML = '';
    const video = h('video', { playsinline: true, muted: true, autoplay: true }), hint = h('p', { class: 'muted center' }, 'Apunta la cámara a un código QR');
    body.append(h('div', { class: 'qr-cam' }, video, h('i', { class: 'qr-frame' })), hint,
      h('label', { class: 'btn ghost sm center-b' }, 'Leer desde una foto', h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: async e => { const f = e.target.files[0]; if (!f) return; const t = await fromImage(await createImageBitmap(f)); t ? found(t) : toast('No se encontró un QR en esa foto'); } })));
    try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }); video.srcObject = stream; await video.play(); }
    catch { hint.textContent = 'No hay permiso de cámara. Puedes leer el código desde una foto.'; return; }
    const det = 'BarcodeDetector' in window ? new window.BarcodeDetector({ formats: ['qr_code'] }) : null;
    const jsqr = det ? null : (await import('jsqr')).default;
    const cv = document.createElement('canvas'), cx = cv.getContext('2d', { willReadFrequently: true }); let last = 0;
    const tick = async t => {
      if (!stream) return; raf = requestAnimationFrame(tick); if (t - last < 180 || video.readyState < 2) return; last = t;
      try {
        if (det) { const r = await det.detect(video); if (r[0]?.rawValue) found(r[0].rawValue); }
        else { const w = 480, hh = Math.round(w * video.videoHeight / video.videoWidth); cv.width = w; cv.height = hh; cx.drawImage(video, 0, 0, w, hh); const r = jsqr(cx.getImageData(0, 0, w, hh).data, w, hh, { inversionAttempts: 'dontInvert' }); if (r?.data) found(r.data); }
      } catch {}
    };
    raf = requestAnimationFrame(tick);
  }
  async function fromImage(bmp) {
    if ('BarcodeDetector' in window) { try { const r = await new window.BarcodeDetector({ formats: ['qr_code'] }).detect(bmp); if (r[0]) return r[0].rawValue; } catch {} }
    const jsqr = (await import('jsqr')).default; const cv = document.createElement('canvas'); const s = Math.min(1, 1200 / Math.max(bmp.width, bmp.height)); cv.width = bmp.width * s; cv.height = bmp.height * s;
    const cx = cv.getContext('2d'); cx.drawImage(bmp, 0, 0, cv.width, cv.height); return jsqr(cx.getImageData(0, 0, cv.width, cv.height).data, cv.width, cv.height)?.data || null;
  }
  function make() {
    stop(); body.innerHTML = '';
    const out = h('div', { class: 'qr-out' }); const ta = h('textarea', { rows: 3, maxlength: 1500, placeholder: 'Escribe un texto, enlace, número o Wi-Fi', 'aria-label': 'Texto del QR' });
    const draw = () => { out.innerHTML = ''; const v = ta.value.trim(); if (!v) return; const q = qrcode(0, 'M'); q.addData(unescape(encodeURIComponent(v))); q.make(); out.innerHTML = q.createSvgTag({ cellSize: 6, margin: 3, scalable: true }); };
    ta.addEventListener('input', draw);
    body.append(h('div', { class: 'form' }, ta, out, h('div', { class: 'row-btns' }, h('button', { class: 'btn primary', onclick: () => { const svg = out.querySelector('svg'); if (!svg) return toast('Escribe algo primero'); download('duna-qr.svg', new Blob([svg.outerHTML], { type: 'image/svg+xml' })); } }, 'Guardar imagen'))));
  }
  const tabs = [['Escanear', scan], ['Crear', make]];
  tabs.forEach(([l, f], i) => tabsEl.append(h('button', { class: 'seg-b' + (i ? '' : ' on'), type: 'button', onclick: e => { tabsEl.querySelectorAll('.seg-b').forEach(b => b.classList.toggle('on', b === e.currentTarget)); f(); } }, l)));
  ctx.body.append(h('div', { class: 'ap' }, tabsEl, body)); scan();
}
