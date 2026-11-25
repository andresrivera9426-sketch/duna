// Mini apps de DUNA: registro extensible. Cada mini app es un módulo propio que se descarga solo al abrirla.
// Para añadir una: registerMiniApp({ id, name, desc, emoji, color, load: () => import('./apps/x.js') }) — el módulo exporta mount(ctx).
import { h, icon, toast } from '../../shared/ui.js';
import { ensureCss, openApp, local } from '../../shared/kit.js';
export const MINIAPPS = [];
export function registerMiniApp(a) { const i = MINIAPPS.findIndex(x => x.id === a.id); if (i >= 0) MINIAPPS.splice(i, 1); MINIAPPS.push(a); }
registerMiniApp({ id: 'clima', name: 'Clima', desc: 'Pronóstico por horas y 7 días', emoji: '🌤️', color: '#2F80ED', load: () => import('./apps/clima.js') });
registerMiniApp({ id: 'divisas', name: 'TRM y divisas', desc: 'Dólar oficial y conversor', emoji: '💱', color: '#1E9E6A', load: () => import('./apps/divisas.js') });
registerMiniApp({ id: 'calc', name: 'Calculadora', desc: 'Rápida, con historial', emoji: '🧮', color: '#5B4BDB', load: () => import('./apps/calc.js') });
registerMiniApp({ id: 'qr', name: 'QR', desc: 'Escanear y crear códigos', emoji: '🔳', color: '#15132B', load: () => import('./apps/qr.js') });
registerMiniApp({ id: 'notas', name: 'Notas y recordatorios', desc: 'Con aviso a la hora que elijas', emoji: '📝', color: '#E2A12F', load: () => import('./apps/notas.js') });
registerMiniApp({ id: 'festivos', name: 'Festivos', desc: 'Puentes festivos de Colombia', emoji: '📅', color: '#E2552F', load: () => import('./apps/festivos.js') });
registerMiniApp({ id: 'saber', name: 'Saber', desc: 'Consulta en Wikipedia', emoji: '📚', color: '#6B7280', load: () => import('./apps/saber.js') });
registerMiniApp({ id: 'sismos', name: 'Sismos', desc: 'Temblores recientes en la región', emoji: '🌎', color: '#B4532A', load: () => import('./apps/sismos.js') });
registerMiniApp({ id: 'unidades', name: 'Conversor', desc: 'Medidas, peso, temperatura', emoji: '📏', color: '#0EA5A4', load: () => import('./apps/unidades.js') });
export async function openMiniApp(id) {
  const a = MINIAPPS.find(x => x.id === id); if (!a) return;
  const rec = local.get('apps-recent', []).filter(x => x !== id); rec.unshift(id); local.set('apps-recent', rec.slice(0, 4));
  await ensureCss();
  return openApp(a.name, async ctx => { ctx.body.append(h('div', { class: 'spinner' })); try { const m = await a.load(); ctx.body.innerHTML = ''; await m.mount(ctx); } catch (e) { ctx.body.innerHTML = ''; ctx.body.append(h('p', { class: 'muted center' }, e.message || 'No se pudo abrir')); } }, { sub: a.desc });
}
const tile = a => h('button', { class: 'ma', type: 'button', dataset: { app: a.id }, onclick: () => openMiniApp(a.id) }, h('span', { class: 'ma-ic', style: { '--c': a.color } }, a.emoji), h('b', null, a.name), h('small', null, a.desc));
export async function renderApps(side, head) {
  await ensureCss();
  const rec = local.get('apps-recent', []).map(id => MINIAPPS.find(a => a.id === id)).filter(Boolean);
  side.append(head('Mini apps', []), h('div', { class: 'ma-scroll' },
    rec.length ? [h('h4', { class: 'sec-t' }, 'Recientes'), h('div', { class: 'ma-rec' }, rec.map(a => h('button', { class: 'ma-chip', onclick: () => openMiniApp(a.id) }, h('span', null, a.emoji), a.name)))] : null,
    h('div', { class: 'pay-card', role: 'note' }, h('div', null, h('b', null, 'DUNA Pay'), h('small', null, 'Pagos y transferencias entre contactos')), h('em', null, 'Próximamente')),
    h('h4', { class: 'sec-t' }, 'Herramientas'), h('div', { class: 'ma-grid' }, MINIAPPS.map(tile)),
    h('p', { class: 'fine center dsc-foot' }, 'Datos abiertos y gratuitos: Open-Meteo, Banco de la República vía datos.gov.co (TRM), ExchangeRate-API (open.er-api.com), Nager.Date, Wikipedia y USGS.')));
}
