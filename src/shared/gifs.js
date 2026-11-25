// Catálogo propio de GIF animados de DUNA (SVG animado, sin proveedor externo, sin clave y sin almacenamiento)
const ANIM = {
  bounce: '<animateTransform attributeName="transform" type="translate" values="0 0;0 -18;0 0;0 -6;0 0" dur="1s" repeatCount="indefinite"/>',
  spin: '<animateTransform attributeName="transform" type="rotate" values="0 80 70;360 80 70" dur="2.4s" repeatCount="indefinite"/>',
  pulse: '<animateTransform attributeName="transform" type="scale" values="1;1.18;1;1.1;1" dur="1.1s" repeatCount="indefinite" additive="sum"/>',
  shake: '<animateTransform attributeName="transform" type="rotate" values="0 80 70;-12 80 70;12 80 70;-8 80 70;8 80 70;0 80 70" dur="0.9s" repeatCount="indefinite"/>',
  wave: '<animateTransform attributeName="transform" type="rotate" values="0 95 105;-22 95 105;14 95 105;-22 95 105;0 95 105" dur="1.2s" repeatCount="indefinite"/>',
  nod: '<animateTransform attributeName="transform" type="translate" values="0 0;0 10;0 0;0 10;0 0" dur="1s" repeatCount="indefinite"/>',
  swing: '<animateTransform attributeName="transform" type="translate" values="-14 0;14 0;-14 0" dur="1.4s" repeatCount="indefinite"/>',
};
const FX = {
  confetti: [...Array(14)].map((_, i) => `<rect x="${(i * 23) % 150 + 5}" y="-10" width="6" height="10" rx="2" fill="${['#FF8A3D', '#6D4BFF', '#E8467C', '#22C55E', '#FFD447'][i % 5]}"><animate attributeName="y" values="-10;150" dur="${1.2 + (i % 4) * 0.35}s" begin="${(i % 5) * 0.2}s" repeatCount="indefinite"/><animateTransform attributeName="transform" type="rotate" values="0 ${(i * 23) % 150 + 8} 70;360 ${(i * 23) % 150 + 8} 70" dur="1.5s" repeatCount="indefinite"/></rect>`).join(''),
  hearts: [...Array(6)].map((_, i) => `<text x="${20 + i * 24}" y="150" font-size="16" opacity=".85">❤️<animate attributeName="y" values="150;-10" dur="${2 + (i % 3) * 0.5}s" begin="${i * 0.3}s" repeatCount="indefinite"/></text>`).join(''),
  stars: [...Array(7)].map((_, i) => `<text x="${12 + (i * 37) % 140}" y="${18 + (i * 29) % 110}" font-size="14">✨<animate attributeName="opacity" values="0;1;0" dur="${1 + (i % 3) * 0.4}s" begin="${i * 0.2}s" repeatCount="indefinite"/></text>`).join(''),
  rain: [...Array(12)].map((_, i) => `<line x1="${(i * 13) % 160}" y1="0" x2="${(i * 13) % 160 - 4}" y2="12" stroke="#7CC4FF" stroke-width="3" stroke-linecap="round"><animateTransform attributeName="transform" type="translate" values="0 -20;0 150" dur="${0.7 + (i % 3) * 0.2}s" begin="${(i % 4) * 0.15}s" repeatCount="indefinite"/></line>`).join(''),
  zzz: [0, 1, 2].map(i => `<text x="${110 + i * 12}" y="50" font-size="${14 + i * 4}" font-weight="900" fill="#fff" font-family="system-ui">z<animate attributeName="y" values="60;20" dur="1.8s" begin="${i * 0.5}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;1;0" dur="1.8s" begin="${i * 0.5}s" repeatCount="indefinite"/></text>`).join(''),
};
const g = (emoji, caption, anim, bg, fx = '') => `<svg viewBox="0 0 160 140" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg[0]}"/><stop offset="1" stop-color="${bg[1]}"/></linearGradient></defs><rect width="160" height="140" rx="18" fill="url(#b)"/>${FX[fx] || ''}<g><g transform="translate(0 0)">${ANIM[anim]}<text x="80" y="86" font-size="62" text-anchor="middle">${emoji}</text></g></g><text x="80" y="128" font-size="17" font-weight="900" text-anchor="middle" fill="#fff" stroke="rgba(0,0,0,.25)" stroke-width="3" paint-order="stroke" font-family="system-ui,sans-serif">${caption}</text></svg>`;
const P = { sun: ['#FFB547', '#FF6A3D'], vio: ['#7C5CFF', '#C24BD6'], pink: ['#FF8FB1', '#E8467C'], sky: ['#5BC8FF', '#4C6FFF'], mint: ['#4ADE80', '#0EA5A5'], night: ['#2E2A5A', '#1D1A2E'], gold: ['#FFE066', '#FFB547'], red: ['#FF6B6B', '#C81E4B'], gray: ['#9AA3B2', '#5B6475'] };
export const GIFS = {
  hola: { k: 'hola saludo hi hello buenas', svg: g('👋', '¡Hola!', 'wave', P.sun) },
  jaja: { k: 'jaja risa jajaja lol gracioso', svg: g('😂', 'JAJAJA', 'shake', P.gold) },
  amor: { k: 'amor te quiero corazon love', svg: g('❤️', 'Te quiero', 'pulse', P.pink, 'hearts') },
  gracias: { k: 'gracias thanks agradecido', svg: g('🙏', '¡Gracias!', 'nod', P.vio, 'stars') },
  fiesta: { k: 'fiesta celebrar party feliz', svg: g('🥳', '¡A celebrar!', 'bounce', P.vio, 'confetti') },
  cumple: { k: 'cumpleaños feliz cumple torta pastel', svg: g('🎂', 'Feliz cumple', 'bounce', P.pink, 'confetti') },
  buenosdias: { k: 'buenos dias mañana sol', svg: g('☀️', 'Buenos días', 'spin', P.sun) },
  buenasnoches: { k: 'buenas noches dormir sueño luna', svg: g('🌙', 'Buenas noches', 'swing', P.night, 'zzz') },
  ok: { k: 'ok listo vale de una si', svg: g('👍', '¡De una!', 'pulse', P.mint) },
  aplausos: { k: 'aplausos bravo felicitaciones clap', svg: g('👏', '¡Bravo!', 'shake', P.sun, 'stars') },
  wow: { k: 'wow sorpresa increible asombro', svg: g('😮', '¡Wow!', 'pulse', P.sky, 'stars') },
  triste: { k: 'triste llorar pena sad', svg: g('😢', 'Qué tristeza', 'nod', P.sky, 'rain') },
  enojo: { k: 'enojo bravo rabia molesto', svg: g('😤', 'Uy no…', 'shake', P.red) },
  fuego: { k: 'fuego genial top hot candela', svg: g('🔥', '¡Candela!', 'pulse', P.red) },
  gol: { k: 'gol futbol seleccion partido', svg: g('⚽', '¡GOOOL!', 'bounce', P.mint, 'confetti') },
  cafe: { k: 'cafe tinto tintico mañana', svg: g('☕', '¿Un tintico?', 'nod', ['#C9A27E', '#7B4A2D']) },
  pensando: { k: 'pensando hmm duda mmm', svg: g('🤔', 'Mmm…', 'swing', P.gray) },
  no: { k: 'no nope negativo', svg: g('🙅', '¡Nooo!', 'shake', P.red) },
  si: { k: 'si yes claro afirmativo', svg: g('🙆', '¡Claro!', 'nod', P.mint) },
  tarde: { k: 'tarde reloj espera ya voy', svg: g('⏰', 'Ya voy…', 'shake', P.vio) },
  animo: { k: 'animo fuerza tu puedes vamos', svg: g('💪', '¡Tú puedes!', 'pulse', P.sun) },
  baile: { k: 'baile bailar salsa rumba', svg: g('💃', '¡A bailar!', 'swing', P.pink, 'stars') },
  lluvia: { k: 'lluvia llueve clima frio', svg: g('🌧️', 'Llueve…', 'swing', P.gray, 'rain') },
  besos: { k: 'besos beso kiss', svg: g('😘', 'Besos', 'pulse', P.pink, 'hearts') },
  ojos: { k: 'ojos mirando chisme', svg: g('👀', 'Ajá…', 'swing', P.vio) },
  dormido: { k: 'dormido sueño cansado', svg: g('😴', 'Qué sueño', 'nod', P.night, 'zzz') },
  felicidades: { k: 'felicidades logro exito', svg: g('🏆', '¡Felicidades!', 'bounce', P.gold, 'confetti') },
  saludo: { k: 'chao adios bye nos vemos', svg: g('🤗', '¡Chao!', 'wave', P.sky) },
};
export const gifUrl = id => GIFS[id] ? 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(GIFS[id].svg) : '';
export function searchGifs(q) {
  const n = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const t = n(q || '').trim(); if (!t) return Object.keys(GIFS);
  return Object.entries(GIFS).filter(([id, v]) => n(id + ' ' + v.k).includes(t)).map(([id]) => id);
}
