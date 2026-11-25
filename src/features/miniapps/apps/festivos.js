// Festivos de Colombia (Nager.Date, API pública) con cuenta regresiva y puentes.
import { h } from '../../../shared/ui.js';
export async function mount(ctx) {
  const box = h('div', { class: 'ap' }, h('div', { class: 'spinner' })); ctx.body.append(box);
  const y = new Date().getFullYear();
  try {
    const [a, b] = await Promise.all([y, y + 1].map(async yy => (await fetch(`https://date.nager.at/api/v3/PublicHolidays/${yy}/CO`)).json()));
    const d0 = new Date(); const today = new Date(d0 - d0.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); const list = [...a, ...b].filter(x => x.date >= today).slice(0, 14);
    const next = list[0], days = Math.round((new Date(next.date + 'T00:00') - new Date(today + 'T00:00')) / 864e5);
    const dt = d => new Date(d + 'T12:00');
    box.innerHTML = '';
    box.append(h('div', { class: 'fe-next' }, h('small', null, 'Próximo festivo'), h('b', null, next.localName), h('span', null, dt(next.date).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })), h('em', null, days === 0 ? '¡Es hoy!' : days === 1 ? 'Mañana' : `Faltan ${days} días`)),
      h('h4', { class: 'sec-t' }, 'Siguientes'), list.slice(1).map(x => h('div', { class: 'fe' }, h('div', { class: 'fe-d' }, h('b', null, dt(x.date).getDate()), h('small', null, dt(x.date).toLocaleDateString('es-CO', { month: 'short' }))),
        h('div', { class: 'grow' }, h('b', null, x.localName), h('small', null, dt(x.date).toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric' }) + (dt(x.date).getDay() === 1 ? ' · puente festivo' : ''))))),
      h('p', { class: 'fine center' }, 'Datos: Nager.Date (date.nager.at)'));
  } catch { box.innerHTML = ''; box.append(h('p', { class: 'muted center' }, 'No se pudieron cargar los festivos.')); }
}
