// DUNA · vista previa de enlaces. Solo usuarios con sesión. Protección SSRF: solo http(s) públicos, sin IP privadas.
import { createClient } from 'npm:@supabase/supabase-js@2';
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

function privateIp(ip: string) {
  if (ip.includes(':')) { const l = ip.toLowerCase(); return l === '::1' || l === '::' || l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe80') || l.startsWith('::ffff:'); }
  const p = ip.split('.').map(Number); if (p.length !== 4 || p.some((n) => isNaN(n))) return true;
  return p[0] === 10 || p[0] === 127 || p[0] === 0 || (p[0] === 169 && p[1] === 254) || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168) || (p[0] === 100 && p[1] >= 64 && p[1] <= 127) || p[0] >= 224;
}
async function safeUrl(raw: string) {
  const u = new URL(raw);
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('protocolo');
  if (u.port && !['80', '443'].includes(u.port)) throw new Error('puerto');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(host)) throw new Error('host');
  if (/^[\d.]+$/.test(host) || host.includes(':')) { if (privateIp(host)) throw new Error('ip'); return u; }
  const ips: string[] = [];
  for (const t of ['A', 'AAAA'] as const) { try { ips.push(...(await Deno.resolveDns(host, t))); } catch (_e) { /* sin registro */ } }
  if (!ips.length || ips.some(privateIp)) throw new Error('dns');
  return u;
}
const dec = (s = '') => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/\s+/g, ' ').trim();
function meta(html: string, names: string[]) {
  for (const n of names) {
    const re1 = new RegExp(`<meta[^>]+(?:property|name)=["']${n}["'][^>]*content=["']([^"']*)["']`, 'i');
    const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${n}["']`, 'i');
    const m = html.match(re1) || html.match(re2); if (m) return dec(m[1]);
  }
  return '';
}
async function get(url: URL, accept: string, max: number) {
  let cur = url;
  for (let i = 0; i < 4; i++) {
    const r = await fetch(cur, { redirect: 'manual', signal: AbortSignal.timeout(5000), headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DUNA-LinkPreview/1.0; +https://andresrivera9426-sketch.github.io/duna/)', Accept: accept, 'Accept-Language': 'es,en;q=0.8' } });
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) { cur = await safeUrl(new URL(r.headers.get('location')!, cur).toString()); continue; }
    if (!r.ok || !r.body) throw new Error('http ' + r.status);
    const reader = r.body.getReader(); const chunks: Uint8Array[] = []; let n = 0;
    while (n < max) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); n += value.length; }
    reader.cancel().catch(() => {});
    const out = new Uint8Array(Math.min(n, max)); let o = 0; for (const c of chunks) { const take = Math.min(c.length, out.length - o); out.set(c.subarray(0, take), o); o += take; if (o >= out.length) break; }
    return { bytes: out, type: r.headers.get('content-type') || '', url: cur };
  }
  throw new Error('demasiadas redirecciones');
}
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'método' }, 405);
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: u } = await sb.auth.getUser(token);
  if (!u?.user) return json({ error: 'Inicia sesión' }, 401);
  try {
    const { url } = await req.json();
    const target = await safeUrl(String(url).slice(0, 2000));
    const page = await get(target, 'text/html,application/xhtml+xml', 600_000);
    if (!/html|xml/i.test(page.type)) return json({ title: target.hostname + target.pathname, description: '' });
    const html = new TextDecoder().decode(page.bytes);
    const title = meta(html, ['og:title', 'twitter:title']) || dec(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || '');
    const description = meta(html, ['og:description', 'twitter:description', 'description']);
    let image = meta(html, ['og:image', 'og:image:url', 'twitter:image']);
    let imageData = '';
    if (image) {
      try {
        const iu = await safeUrl(new URL(image, page.url).toString()); image = iu.toString();
        const img = await get(iu, 'image/*', 400_000);
        if (/^image\/(png|jpe?g|webp|gif)/i.test(img.type) && img.bytes.length < 400_000) {
          let s = ''; for (let i = 0; i < img.bytes.length; i += 0x8000) s += String.fromCharCode(...img.bytes.subarray(i, i + 0x8000));
          imageData = `data:${img.type.split(';')[0]};base64,${btoa(s)}`;
        }
      } catch (_e) { image = ''; }
    }
    return json({ url: page.url.toString(), title: title.slice(0, 200), description: description.slice(0, 300), image, imageData });
  } catch (e) { return json({ error: String((e as Error).message || e) }, 200); }
});
