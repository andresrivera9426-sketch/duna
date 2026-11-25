import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
const V = process.env.DUNA_V || new Date().toISOString().replace(/\D/g, '').slice(0, 12);
const out = 'docs';
fs.mkdirSync(out + '/icons', { recursive: true });
fs.rmSync(out + '/c', { recursive: true, force: true });
// Code splitting: app.js solo trae lo necesario para arrancar; secciones y mini-apps van en docs/c/*.js (con hash, caché larga)
const r = await build({ entryPoints: { app: 'src/app/main.js' }, bundle: true, minify: true, format: 'esm', target: ['es2020'], splitting: true, outdir: out, chunkNames: 'c/[name]-[hash]', legalComments: 'none', metafile: true });
fs.writeFileSync('tools/.meta.json', JSON.stringify(r.metafile));
// Trozos que se cargan al arrancar: se precargan (modulepreload) y el service worker los guarda de una vez
const om = r.metafile.outputs, ini = new Set(); const walk = f => { if (ini.has(f)) return; ini.add(f); for (const i of om[f].imports || []) if (i.kind === 'import-statement') walk(i.path); }; walk(out + '/app.js');
const initial = [...ini].filter(f => f !== out + '/app.js').map(f => path.relative(out, f));
const all = Object.keys(om).filter(f => f.endsWith('.js') && f !== out + '/app.js').map(f => path.relative(out, f));
for (const f of ['index.html', 'manifest.webmanifest', 'sw.js', 'styles.css']) fs.writeFileSync(path.join(out, f), fs.readFileSync('web/' + f, 'utf8').replaceAll('__V__', V)
  .replace('__PRELOAD__', initial.map(c => `<link rel="modulepreload" href="${c}">`).join('\n')).replace('__CHUNKS__', JSON.stringify(all)));
for (const f of fs.readdirSync('web/icons')) fs.copyFileSync('web/icons/' + f, out + '/icons/' + f);
fs.mkdirSync(out + '/fonts', { recursive: true });
for (const f of fs.readdirSync('web/fonts')) fs.copyFileSync('web/fonts/' + f, out + '/fonts/' + f);
fs.writeFileSync(out + '/.nojekyll', '');
fs.writeFileSync(out + '/404.html', fs.readFileSync(out + '/index.html'));
const chunks = fs.readdirSync(out + '/c'); const tot = chunks.reduce((a, f) => a + fs.statSync(out + '/c/' + f).size, 0);
console.log('build', V, 'app.js', (fs.statSync(out + '/app.js').size / 1024).toFixed(1) + ' KB', '·', chunks.length, 'trozos diferidos', (tot / 1024).toFixed(1) + ' KB');
