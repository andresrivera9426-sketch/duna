// Notas y recordatorios: viven solo en este teléfono (nada en Supabase).
// Aviso: en Android con notificaciones locales del sistema (aunque la app esté cerrada); en la web, aviso del navegador mientras DUNA esté abierta.
import { h, icon, btn, toast, confirmDialog } from '../../../shared/ui.js';
import { local } from '../../../shared/kit.js';
const LN = () => window.Capacitor?.isNativePlatform?.() ? window.Capacitor.Plugins?.LocalNotifications : null;
const all = () => local.get('notas', []);
const save = l => local.set('notas', l);
const nid = () => Math.floor(Math.random() * 2e9);
const webTimers = new Map();
async function schedule(n) {
  if (!n.at || new Date(n.at) <= new Date()) return;
  const ln = LN();
  if (ln) {
    const p = await ln.requestPermissions().catch(() => ({ display: 'denied' })); if (p.display !== 'granted') return toast('Activa las notificaciones de DUNA para recibir el aviso');
    await ln.schedule({ notifications: [{ id: n.nid, title: '⏰ Recordatorio', body: n.text.slice(0, 200), schedule: { at: new Date(n.at), allowWhileIdle: true } }] }).catch(() => toast('No se pudo programar el aviso'));
  } else webSchedule(n);
}
function webSchedule(n) {
  clearTimeout(webTimers.get(n.nid)); const ms = new Date(n.at) - Date.now(); if (ms <= 0 || ms > 2 ** 31 - 1) return;
  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
  webTimers.set(n.nid, setTimeout(() => { if ('Notification' in window && Notification.permission === 'granted') navigator.serviceWorker?.ready.then(r => r.showNotification('⏰ Recordatorio', { body: n.text, tag: 'nota-' + n.nid })).catch(() => {}); toast('⏰ ' + n.text, 8000); }, ms));
}
async function unschedule(n) { clearTimeout(webTimers.get(n.nid)); await LN()?.cancel({ notifications: [{ id: n.nid }] }).catch(() => {}); }
export function mount(ctx) {
  const list = h('div', { class: 'nt-list' });
  const ta = h('textarea', { rows: 2, maxlength: 2000, placeholder: 'Escribe una nota…', 'aria-label': 'Nueva nota' });
  const when = h('input', { type: 'datetime-local', 'aria-label': 'Recordarme el', min: new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16) });
  const add = async () => {
    const text = ta.value.trim(); if (!text) return toast('Escribe algo');
    const n = { id: crypto.randomUUID(), nid: nid(), text, at: when.value ? new Date(when.value).toISOString() : null, created: Date.now(), done: false };
    save([n, ...all()]); await schedule(n); ta.value = ''; when.value = ''; paint(); toast(n.at ? 'Recordatorio guardado' : 'Nota guardada');
  };
  const paint = () => {
    list.innerHTML = ''; const l = all();
    if (!l.length) list.append(h('p', { class: 'muted center' }, 'Tus notas y recordatorios aparecerán aquí. Solo se guardan en este teléfono.'));
    for (const n of l) list.append(h('div', { class: 'nt' + (n.done ? ' done' : ''), dataset: { id: n.id } },
      h('button', { class: 'nt-ck', type: 'button', 'aria-label': n.done ? 'Marcar pendiente' : 'Marcar hecha', onclick: async () => { n.done = !n.done; save(l); if (n.done) await unschedule(n); else await schedule(n); paint(); } }, n.done ? icon('check', 16) : null),
      h('div', { class: 'grow' }, h('p', null, n.text), n.at ? h('small', { class: new Date(n.at) < new Date() && !n.done ? 'late' : '' }, '⏰ ' + new Date(n.at).toLocaleString('es-CO', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })) : null),
      btn('trash', 'Eliminar', async () => { if (!(await confirmDialog('¿Eliminar esta nota?', 'Eliminar', true))) return; await unschedule(n); save(all().filter(x => x.id !== n.id)); paint(); })));
  };
  ctx.body.append(h('div', { class: 'ap' }, h('div', { class: 'nt-new' }, ta, h('div', { class: 'nt-row' }, h('label', null, '⏰ ', when), h('button', { class: 'btn primary', onclick: add }, 'Guardar'))), list));
  paint();
}
