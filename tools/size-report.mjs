// Informe de tamaño: lo que se descarga al arrancar (imports estáticos desde app.js) vs. lo diferido
import fs from 'node:fs'; import zlib from 'node:zlib';
const m = JSON.parse(fs.readFileSync('tools/.meta.json', 'utf8')).outputs;
const seen = new Set(); const walk = f => { if (seen.has(f)) return; seen.add(f); for (const i of m[f].imports || []) if (i.kind === 'import-statement') walk(i.path); };
walk('docs/app.js');
const gz = f => zlib.gzipSync(fs.readFileSync(f)).length;
const kb = n => (n / 1024).toFixed(1);
let raw = 0, z = 0; for (const f of seen) { raw += fs.statSync(f).size; z += gz(f); }
const all = Object.keys(m).filter(f => f.endsWith('.js'));
let rawAll = 0; for (const f of all) rawAll += fs.statSync(f).size;
console.log(JSON.stringify({ inicialJS_KB: +kb(raw), inicialJS_gzip_KB: +kb(z), archivosIniciales: seen.size, totalJS_KB: +kb(rawAll), diferidoJS_KB: +kb(rawAll - raw), css_KB: +kb(fs.statSync('docs/styles.css').size), css_gzip_KB: +kb(gz('docs/styles.css')) }));
if (process.argv[2] === '-v') { for (const f of seen) console.log('  inicial', kb(fs.statSync(f).size), f, Object.keys(m[f].inputs).filter(x => x.startsWith('src')).join(' ')); }
