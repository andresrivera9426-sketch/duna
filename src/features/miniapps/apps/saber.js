// Saber: consulta rápida en Wikipedia en español (API pública). El artículo completo se lee dentro de DUNA.
import { h, icon, debounce } from '../../../shared/ui.js';
import { openContent } from '../../../shared/reader.js';
export function mount(ctx) {
  const out = h('div', { class: 'sb-out' });
  const show = async title => {
    out.innerHTML = ''; out.append(h('div', { class: 'spinner' }));
    try { const j = await (await fetch('https://es.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(title))).json(); out.innerHTML = '';
      out.append(h('article', { class: 'sb-card' }, j.thumbnail?.source ? h('img', { src: j.thumbnail.source, alt: '', loading: 'lazy' }) : null, h('h3', null, j.title), j.description ? h('small', null, j.description) : null, h('p', null, j.extract || ''),
        h('button', { class: 'btn ghost sm', onclick: () => openContent({ kind: 'page', url: j.content_urls?.mobile?.page || `https://es.wikipedia.org/wiki/${encodeURIComponent(title)}`, title: j.title, sub: 'Wikipedia' }) }, 'Leer artículo completo'),
        h('p', { class: 'fine' }, 'Fuente: Wikipedia (CC BY-SA 4.0)')));
    } catch { out.innerHTML = ''; out.append(h('p', { class: 'muted' }, 'No se pudo consultar Wikipedia.')); }
  };
  const sug = h('div', { class: 'ap-res' });
  const input = h('input', { type: 'search', placeholder: 'Busca un tema, lugar o persona', 'aria-label': 'Buscar en Wikipedia', oninput: debounce(async e => {
    const q = e.target.value.trim(); sug.innerHTML = ''; if (q.length < 2) return;
    try { const [, names] = await (await fetch(`https://es.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(q)}&limit=6&namespace=0&format=json&origin=*`)).json();
      for (const n of names) sug.append(h('button', { class: 'ap-pick', onclick: () => { sug.innerHTML = ''; input.value = n; show(n); } }, n)); } catch {}
  }, 300) });
  ctx.body.append(h('div', { class: 'ap' }, h('div', { class: 'searchbar' }, icon('search', 18), input), sug, out));
  show('Putumayo');
}
