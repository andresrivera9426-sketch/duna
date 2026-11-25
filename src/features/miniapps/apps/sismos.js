// Sismos recientes en Colombia y alrededores (catálogo público del USGS). Cada sismo se ve en el mapa integrado.
import { h } from '../../../shared/ui.js';
import { openContent } from '../../../shared/reader.js';
import { ago } from '../../../shared/kit.js';
export async function mount(ctx) {
  const box = h('div', { class: 'ap' }, h('div', { class: 'spinner' })); ctx.body.append(box);
  try {
    const since = new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10);
    const j = await (await fetch(`https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime=${since}&minlatitude=-5&maxlatitude=14&minlongitude=-82&maxlongitude=-66&minmagnitude=2.5&orderby=time&limit=60`)).json();
    box.innerHTML = ''; box.append(h('p', { class: 'muted' }, 'Últimos 14 días · magnitud 2,5 o más · Colombia y países vecinos'));
    if (!j.features.length) box.append(h('p', { class: 'muted center' }, 'No hay sismos registrados en este periodo.'));
    for (const f of j.features) { const p = f.properties, [lo, la, dep] = f.geometry.coordinates, m = p.mag;
      box.append(h('button', { class: 'eq', type: 'button', onclick: () => openContent({ kind: 'map', lat: la, lon: lo, title: `Sismo M${m.toFixed(1)} · ${p.place}` }) },
        h('span', { class: 'eq-m' + (m >= 5 ? ' hi' : m >= 4 ? ' mid' : '') }, m.toFixed(1)), h('div', { class: 'grow' }, h('b', null, p.place), h('small', null, `${ago(new Date(p.time).toISOString())} · profundidad ${Math.round(dep)} km`)))); }
    box.append(h('p', { class: 'fine center' }, 'Datos: USGS Earthquake Hazards Program (dominio público). Para alertas oficiales en Colombia consulta el Servicio Geológico Colombiano.'));
  } catch { box.innerHTML = ''; box.append(h('p', { class: 'muted center' }, 'No se pudieron cargar los sismos.')); }
}
