// DUNA · Descubrir: noticias y videos desde fuentes públicas y gratuitas (RSS oficiales de cada medio, feeds RSS de canales
// de YouTube y de Vimeo). El servidor lee los feeds (los navegadores no pueden por CORS), los normaliza y los guarda en memoria
// unos minutos. No se guarda nada en la base de datos salvo el contador de uso por persona (public.rl_take).
import { createClient } from 'npm:@supabase/supabase-js@2';
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const UA = 'Mozilla/5.0 (compatible; DUNA-Lector/1.0; +https://andresrivera9426-sketch.github.io/duna/)';
type Src = [string, string]; // [nombre del medio, url del feed]
const ARC = (host: string, cat = '') => `https://www.${host}/arc/outboundfeeds/rss/${cat ? 'category/' + cat + '/' : ''}?outputType=xml`;
const EP = (s: string) => `https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/${s}/portada`;
const IB = (c: string) => `https://www.infobae.com/arc/outboundfeeds/rss/category/${c}/`;
const NEWS: Record<string, Src[]> = {
  colombia: [['El Tiempo', 'https://www.eltiempo.com/rss/colombia.xml'], ['El Tiempo', 'https://www.eltiempo.com/rss/politica.xml'], ['Semana', ARC('semana.com', 'nacion')],
    ['Infobae Colombia', IB('colombia')], ['Caracol Radio', 'https://caracol.com.co/arc/outboundfeeds/rss/?outputType=xml'], ['El Universal', ARC('eluniversal.com.co')]],
  mundo: [['BBC Mundo', 'https://feeds.bbci.co.uk/mundo/rss.xml'], ['DW Español', 'https://rss.dw.com/xml/rss-sp-all'], ['France 24', 'https://www.france24.com/es/rss'],
    ['El País', EP('internacional')], ['El Tiempo', 'https://www.eltiempo.com/rss/mundo.xml'], ['Semana', ARC('semana.com', 'mundo')]],
  deportes: [['El Tiempo', 'https://www.eltiempo.com/rss/deportes.xml'], ['Semana', ARC('semana.com', 'deportes')], ['Marca Colombia', 'https://e00-marca.uecdn.es/rss/futbol/colombia.xml'],
    ['Infobae', IB('deportes')], ['El País', EP('deportes')]],
  tecnologia: [['Xataka Colombia', 'https://www.xataka.com.co/feedburner.xml'], ['El Tiempo Tecnósfera', 'https://www.eltiempo.com/rss/tecnosfera.xml'], ['Enter.co', 'https://www.enter.co/feed/'],
    ['Hipertextual', 'https://hipertextual.com/feed'], ['BBC Mundo', 'https://feeds.bbci.co.uk/mundo/temas/tecnologia/rss.xml'], ['Semana', ARC('semana.com', 'tecnologia')]],
  economia: [['Portafolio', 'https://www.portafolio.co/rss/economia.xml'], ['La República', 'https://www.larepublica.co/rss/'], ['El Tiempo', 'https://www.eltiempo.com/rss/economia.xml'],
    ['Semana', ARC('semana.com', 'economia')], ['BBC Mundo', 'https://feeds.bbci.co.uk/mundo/temas/economia/rss.xml'], ['El País', EP('economia')]],
  entretenimiento: [['El Tiempo', 'https://www.eltiempo.com/rss/cultura_entretenimiento.xml'], ['El Tiempo', 'https://www.eltiempo.com/rss/cultura_cine-y-tv.xml'], ['Semana Gente', ARC('semana.com', 'gente')],
    ['Infobae', IB('entretenimiento')], ['El País', EP('cultura')]],
  regional: [['Mi Putumayo', 'https://www.miputumayo.com.co/feed/'], ['La Nación (Huila)', 'https://www.lanacion.com.co/feed/'], ['Eje21 (Eje Cafetero)', 'https://www.eje21.com.co/feed/'], ['El Universal (Caribe)', ARC('eluniversal.com.co')]],
};
const YT = (id: string) => 'https://www.youtube.com/feeds/videos.xml?channel_id=' + id;
const VIDEOS: Record<string, Src[]> = {
  noticias: [['Noticias Caracol', YT('UC2Xq2PK-got3Rtz9ZJ32hLQ')], ['Noticias RCN', YT('UCnr6pbeXJmkNQJ9PSYle7QQ')], ['RTVC Noticias', YT('UCykAfJIwT4VSQDFdRrZ1DXA')],
    ['BBC News Mundo', YT('UCUBIrDsIVzRpKsClMlSlTpQ')], ['CNN en Español', YT('UC_lEiu6917IJz03TnntWUaQ')], ['El Espectador', YT('UCFYdMS-M4mRdbxPuErz1CVw')]],
  deportes: [['Win Sports', YT('UCZjpA3YBPXvJv3pg4SPEjfw')]],
  tecnologia: [['Xataka TV', YT('UCUrYBZGlEOSD1_ds_HcNd6A')], ['Platzi', YT('UC55-mxUj5Nj3niXFReG44OQ')], ['Date un Vlog', YT('UCQX_MZRCaluNKxkywkLEgfA')]],
  ciencia: [['NASA', YT('UCLA_DiR1FfKNvjuUpBHmylQ')], ['QuantumFracture', YT('UCbdSYaPD-lr1kW27UJuk8Pw')], ['Ciencia de Sofá', YT('UCMbQbVilo-nezMvwf1BZfAA')],
    ['National Geographic Latinoamérica', YT('UCnmlG_YzRYzWzJbW2oDn_ow')], ['TED', YT('UCAuUUnT6oDeKwE6v1NGQxug')]],
  entretenimiento: [['Caracol Televisión', YT('UCcpE1fmG2qBZatj28bak2ng')], ['El Rincón de Giorgio', YT('UCDZsyOkn-WTiTwgAvZSQ_cg')], ['La Kalle', YT('UClAlbNsawVywJF99roh7qvA')]],
  cortos: [['Vimeo Staff Picks', 'https://vimeo.com/channels/staffpicks/videos/rss']],
};
const ent = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
const strip = (s: string) => ent(ent(s || '')).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const tag = (x: string, t: string) => x.match(new RegExp(`<${t}(?:\\s[^>]*)?>([\\s\\S]*?)</${t}>`, 'i'))?.[1] ?? '';
const attr = (x: string, re: RegExp) => x.match(re)?.[1] ?? '';
type Item = { t: string; u: string; s: string; d: string; i?: string; x?: string; v?: string };
function parse(xml: string, src: string, video: boolean): Item[] {
  const out: Item[] = [];
  const blocks = xml.match(/<(item|entry)[\s>][\s\S]*?<\/\1>/g) || [];
  for (const b of blocks.slice(0, 40)) {
    const t = strip(tag(b, 'title')); let u = strip(tag(b, 'link')) || attr(b, /<link[^>]*href="([^"]+)"/i);
    if (!/^https:\/\//.test(u) && /^https:\/\//.test(strip(tag(b, 'guid')))) u = strip(tag(b, 'guid'));
    if (!t || !/^https?:\/\//.test(u)) continue;
    u = u.replace(/^http:/, 'https:');
    const d = strip(tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'dc:date') || tag(b, 'updated'));
    let i = attr(b, /<media:thumbnail[^>]*url="([^"]+)"/i) || attr(b, /<media:content[^>]*url="([^"]+\.(?:jpe?g|png|webp)[^"]*)"/i) || attr(b, /<media:content[^>]*medium="image"[^>]*url="([^"]+)"/i)
      || attr(b, /<media:content[^>]*url="([^"]+)"[^>]*medium="image"/i) || attr(b, /<enclosure[^>]*url="([^"]+)"[^>]*type="image/i) || attr(b, /<enclosure[^>]*type="image[^"]*"[^>]*url="([^"]+)"/i)
      || attr(ent(b), /<img[^>]*src="(https:[^"]+)"/i);
    i = ent(i).replace(/^http:/, 'https:');
    const x = strip(tag(b, 'media:description') || tag(b, 'description') || tag(b, 'summary') || tag(b, 'content:encoded')).slice(0, 260);
    const it: Item = { t: t.slice(0, 240), u, s: src, d: d ? new Date(d).toISOString() : '' };
    if (i && /^https:\/\//.test(i)) it.i = i; if (x && x !== t) it.x = x;
    if (video) { const v = strip(tag(b, 'yt:videoId')); if (v) { it.v = v; it.i = `https://i.ytimg.com/vi/${v}/mqdefault.jpg`; it.u = 'https://www.youtube.com/watch?v=' + v; } }
    if (it.d === 'Invalid Date') it.d = '';
    out.push(it);
  }
  return out;
}
const cache = new Map<string, { at: number; items: Item[] }>();
async function feed([src, url]: Src, video: boolean): Promise<Item[]> {
  const c = cache.get(url); if (c && Date.now() - c.at < 10 * 60e3) return c.items;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/rss+xml, application/xml, text/xml, */*' }, signal: AbortSignal.timeout(7000) });
    if (!r.ok) throw new Error('http ' + r.status);
    const items = parse(await r.text(), src, video); cache.set(url, { at: Date.now(), items }); return items;
  } catch { return c?.items || []; }
}
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
async function collect(srcs: Src[], video: boolean, limit = 80) {
  const all = (await Promise.all(srcs.map(s => feed(s, video)))).flat();
  const seen = new Set<string>(); const out: Item[] = [];
  for (const it of all.sort((a, b) => (b.d || '').localeCompare(a.d || ''))) { const k = norm(it.t).slice(0, 80); if (seen.has(k) || seen.has(it.u)) continue; seen.add(k); seen.add(it.u); out.push(it); }
  return out.slice(0, limit);
}
// Portada: mezcla de lo más reciente de cada sección, para que no la acapare un solo medio
async function portada() {
  const parts = await Promise.all(['colombia', 'mundo', 'economia', 'deportes', 'tecnologia', 'entretenimiento'].map(c => collect(NEWS[c], false, 12)));
  const out: Item[] = []; for (let i = 0; i < 12; i++) for (const p of parts) if (p[i] && !out.some(o => o.u === p[i].u)) out.push({ ...p[i] });
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'método' }, 405);
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: u, error: ue } = await sb.auth.getUser(token);
  if (ue || !u?.user?.id) return json({ error: 'Inicia sesión para ver Descubrir' }, 401);
  const b = await req.json().catch(() => ({}));
  const type = String(b?.type || ''), cat = String(b?.cat || '');
  if (type === 'sources') return json({ news: Object.fromEntries(Object.entries(NEWS).map(([k, v]) => [k, [...new Set(v.map(s => s[0]))]])), videos: Object.fromEntries(Object.entries(VIDEOS).map(([k, v]) => [k, v.map(s => s[0])])) });
  const { data: lim } = await sb.rpc('rl_take', { p_user: u.user.id, p_key: 'feed', p_min: 40, p_day: 1500 });
  if (lim && !lim.ok) return json({ error: lim.why === 'min' ? `Vas muy rápido. Intenta de nuevo en ${lim.retry || 60} s.` : 'Llegaste al límite de hoy. Vuelve mañana.' }, 429);
  if (type === 'news') {
    if (cat === 'portada') return json({ items: await portada() });
    if (!NEWS[cat]) return json({ error: 'Categoría no válida' }, 400);
    return json({ items: await collect(NEWS[cat], false) });
  }
  if (type === 'videos') {
    if (cat === 'tendencias') { const parts = await Promise.all(Object.values(VIDEOS).map(v => collect(v, true, 10))); const out: Item[] = []; for (let i = 0; i < 10; i++) for (const p of parts) if (p[i]) out.push(p[i]); return json({ items: out }); }
    if (!VIDEOS[cat]) return json({ error: 'Categoría no válida' }, 400);
    return json({ items: await collect(VIDEOS[cat], true) });
  }
  if (type === 'search') {
    const q = norm(String(b?.q || '').slice(0, 80)).trim(); if (q.length < 2) return json({ items: [] });
    const words = q.split(/\s+/).filter(w => w.length > 1);
    const pool = String(b?.what) === 'videos' ? await collect(Object.values(VIDEOS).flat(), true, 400) : await collect(Object.values(NEWS).flat(), false, 600);
    return json({ items: pool.filter(it => { const t = norm(it.t + ' ' + (it.x || '') + ' ' + it.s); return words.every(w => t.includes(w)); }).slice(0, 60) });
  }
  return json({ error: 'Solicitud no válida' }, 400);
});
