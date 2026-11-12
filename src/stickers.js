// Stickers propios de DUNA (SVG generados en el cliente, no ocupan almacenamiento)
const face = (bg, mouth, extra = '') => `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg[0]}"/><stop offset="1" stop-color="${bg[1]}"/></linearGradient></defs><circle cx="60" cy="62" r="50" fill="url(#g)" stroke="#fff" stroke-width="6"/>${extra}<circle cx="44" cy="54" r="6" fill="#2b1d3a"/><circle cx="76" cy="54" r="6" fill="#2b1d3a"/>${mouth}</svg>`;
export const STICKERS = {
  hola: { label: '¡Hola!', svg: face(['#FFB547', '#FF7A45'], '<path d="M42 74q18 16 36 0" stroke="#2b1d3a" stroke-width="6" fill="none" stroke-linecap="round"/>', '<text x="60" y="112" font-size="20" font-family="system-ui" font-weight="800" text-anchor="middle" fill="#fff" stroke="#2b1d3a" stroke-width="1">¡HOLA!</text>') },
  amor: { label: 'Amor', svg: face(['#FF8FB1', '#E8467C'], '<path d="M46 76q14 10 28 0" stroke="#2b1d3a" stroke-width="6" fill="none" stroke-linecap="round"/>', '<path d="M88 18c6-8 18-2 12 8l-12 12-12-12c-6-10 6-16 12-8z" fill="#fff"/>') },
  risa: { label: 'Jajaja', svg: face(['#FFE066', '#FFB547'], '<path d="M38 70h44q-4 22-22 22T38 70z" fill="#2b1d3a"/>', '<path d="M30 40l12 6M90 40l-12 6" stroke="#2b1d3a" stroke-width="5" stroke-linecap="round"/>') },
  wow: { label: 'Wow', svg: face(['#8FD3FF', '#6D4BFF'], '<ellipse cx="60" cy="82" rx="10" ry="13" fill="#2b1d3a"/>') },
  triste: { label: 'Triste', svg: face(['#B9C2FF', '#7C83DB'], '<path d="M44 86q16-14 32 0" stroke="#2b1d3a" stroke-width="6" fill="none" stroke-linecap="round"/>', '<path d="M80 62q4 10 0 14q-4-4 0-14z" fill="#4FC3F7"/>') },
  ok: { label: 'De una', svg: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg"><rect x="10" y="22" width="100" height="76" rx="26" fill="#6D4BFF" stroke="#fff" stroke-width="6" transform="rotate(-6 60 60)"/><text x="60" y="72" font-size="30" font-family="system-ui" font-weight="900" text-anchor="middle" fill="#fff" transform="rotate(-6 60 60)">¡DE UNA!</text></svg>` },
  gracias: { label: 'Gracias', svg: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg"><rect x="8" y="28" width="104" height="64" rx="32" fill="#FF7A45" stroke="#fff" stroke-width="6" transform="rotate(5 60 60)"/><text x="60" y="70" font-size="24" font-family="system-ui" font-weight="900" text-anchor="middle" fill="#fff" transform="rotate(5 60 60)">GRACIAS</text></svg>` },
  duna: { label: 'Duna', svg: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg"><circle cx="60" cy="60" r="52" fill="#1D1A2E" stroke="#fff" stroke-width="6"/><circle cx="80" cy="40" r="12" fill="#FFE7A8"/><path d="M14 78c14-16 30-20 46-12s28 6 46-8v20c-10 22-30 34-46 34-22 0-40-14-46-34z" fill="#FF8A3D"/><path d="M20 90c16-10 32-10 48-2s26 4 38-6" stroke="#FFB547" stroke-width="5" fill="none"/></svg>` },
  cafe: { label: 'Tintico', svg: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg"><rect x="24" y="46" width="60" height="50" rx="14" fill="#fff" stroke="#2b1d3a" stroke-width="5"/><path d="M84 58h8a10 10 0 0 1 0 20h-8" stroke="#2b1d3a" stroke-width="5" fill="none"/><rect x="30" y="52" width="48" height="16" rx="6" fill="#7B4A2D"/><path d="M44 20q6 8 0 16M60 16q6 8 0 16" stroke="#C9A27E" stroke-width="5" fill="none" stroke-linecap="round"/><text x="54" y="88" font-size="13" font-family="system-ui" font-weight="800" text-anchor="middle" fill="#2b1d3a">tintico</text></svg>` },
  fiesta: { label: 'Fiesta', svg: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg"><path d="M20 100L48 24l48 48z" fill="#FFB547" stroke="#fff" stroke-width="6" stroke-linejoin="round"/><path d="M36 58l20 20M30 76l12 12" stroke="#E8467C" stroke-width="6"/><circle cx="86" cy="24" r="6" fill="#6D4BFF"/><circle cx="102" cy="46" r="5" fill="#E8467C"/><circle cx="70" cy="14" r="4" fill="#4FC3F7"/><path d="M96 14l4 8M106 30l8-2" stroke="#FF7A45" stroke-width="5" stroke-linecap="round"/></svg>` },
  pulgar: { label: 'Listo', svg: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg"><circle cx="60" cy="60" r="52" fill="#22C55E" stroke="#fff" stroke-width="6"/><path d="M38 58h12l10-22c8 0 10 6 8 14l-2 8h16c6 0 8 6 6 10l-6 18c-2 4-4 6-8 6H50V58" fill="#fff"/><rect x="34" y="58" width="12" height="34" rx="3" fill="#fff"/></svg>` },
  noche: { label: 'Buenas noches', svg: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg"><circle cx="60" cy="60" r="52" fill="#2E2A5A" stroke="#fff" stroke-width="6"/><path d="M76 30a28 28 0 1 0 14 40 22 22 0 1 1-14-40z" fill="#FFE7A8"/><circle cx="34" cy="38" r="3" fill="#fff"/><circle cx="46" cy="24" r="2" fill="#fff"/><circle cx="28" cy="70" r="2.5" fill="#fff"/></svg>` },
};
export const stickerUrl = id => STICKERS[id] ? 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(STICKERS[id].svg) : '';

export const EMOJI = {
  'Recientes': [],
  'Caras': '😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😗 😚 😙 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🤫 🤔 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 😌 😔 😪 🤤 😴 😷 🤒 🤕 🤢 🤮 🥵 🥶 🥴 😵 🤯 🤠 🥳 😎 🤓 🧐 😕 😟 🙁 😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 👿 💀 💩 🤡 👻 👽 🤖'.split(' '),
  'Gestos': '👋 🤚 🖐️ ✋ 🖖 👌 🤌 🤏 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ 👍 👎 ✊ 👊 🤛 🤜 👏 🙌 👐 🤲 🤝 🙏 ✍️ 💪 🦾 👀 👁️ 👅 👄 💋 🧠 🫶 ❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 🔥 ✨ ⭐ 🌟 💯 ✅ ❌ ⚠️ 💤'.split(' '),
  'Gente': '👶 🧒 👦 👧 🧑 👨 👩 🧓 👴 👵 👮 👷 💂 🕵️ 👩‍⚕️ 👨‍🌾 👩‍🍳 👨‍🎓 👩‍🏫 👨‍💻 👩‍💼 👨‍🔧 👩‍🔬 👨‍🎨 🧑‍🚀 👸 🤴 🦸 🧙 🧚 🧛 🧜 🧝 💃 🕺 👯 🧘 🏃 🚶 👫 👬 👭 💏 💑 👪'.split(' '),
  'Naturaleza': '🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🐔 🐧 🐦 🐤 🦆 🦅 🦉 🦇 🐺 🐴 🦄 🐝 🦋 🐌 🐞 🐢 🐍 🦎 🐙 🦑 🦀 🐠 🐬 🐳 🦈 🐊 🦒 🐘 🦛 🐪 🦙 🌵 🎄 🌲 🌳 🌴 🌱 🌿 ☘️ 🍀 🍁 🍂 🌷 🌹 🌺 🌸 🌼 🌻 🌞 🌝 🌙 ⭐ 🌈 ☀️ ⛅ 🌧️ ⛈️ ❄️ 🌊 🏜️'.split(' '),
  'Comida': '🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍈 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🥑 🥦 🌽 🥕 🥔 🍠 🥐 🍞 🧀 🥚 🍳 🥓 🥩 🍗 🍖 🌭 🍔 🍟 🍕 🥪 🌮 🌯 🥗 🍝 🍜 🍲 🍛 🍣 🍱 🥟 🍤 🍙 🍚 🍰 🎂 🧁 🍫 🍬 🍭 🍩 🍪 ☕ 🍵 🧃 🥤 🍺 🍻 🥂 🍷 🍹'.split(' '),
  'Actividad': '⚽ 🏀 🏈 ⚾ 🎾 🏐 🏉 🎱 🏓 🏸 🥊 🥋 ⛳ 🚴 🏊 🏄 🧗 🏆 🥇 🥈 🥉 🎖️ 🎫 🎪 🎭 🎨 🎬 🎤 🎧 🎼 🎹 🥁 🎷 🎺 🎸 🎻 🎲 🎯 🎳 🎮 🧩'.split(' '),
  'Viajes': '🚗 🚕 🚙 🚌 🏎️ 🚓 🚑 🚒 🚚 🚜 🛵 🏍️ 🚲 🛴 🚨 🚆 🚇 ✈️ 🛫 🛬 🚀 🛸 🚁 ⛵ 🚤 🛳️ ⚓ 🗺️ 🗽 🗼 🏰 🏟️ 🎡 🎢 🏖️ 🏝️ ⛰️ 🏔️ 🌋 🏕️ 🏠 🏡 🏢 🏥 🏦 🏨 🏪 🏫 ⛪ 🕌'.split(' '),
  'Objetos': '⌚ 📱 💻 ⌨️ 🖥️ 🖨️ 🖱️ 💾 📷 📸 📹 🎥 📞 ☎️ 📺 📻 ⏰ ⌛ 🔋 🔌 💡 🔦 🕯️ 💸 💵 💰 💳 💎 🔧 🔨 🛠️ 🔩 ⚙️ 🔫 💣 🔪 🛡️ 💊 💉 🩺 🔑 🗝️ 🚪 🛏️ 🎁 🎈 🎉 🎊 ✉️ 📦 📝 📁 📅 📌 📎 ✂️ 🔒 🔓'.split(' '),
  'Símbolos': '❤️ 💯 💢 💥 💫 💦 💨 🕳️ 💬 👁️‍🗨️ 🗯️ 💭 ♻️ ⚜️ 🔱 📛 🔰 ⭕ ✅ ☑️ ✔️ ❌ ❎ ➕ ➖ ➗ ✖️ ♾️ ‼️ ⁉️ ❓ ❔ ❕ ❗ 〰️ 💲 ©️ ®️ ™️ 🔟 🔠 🆗 🆕 🆒 🆓 🆙 🔴 🟠 🟡 🟢 🔵 🟣 ⚫ ⚪ 🔶 🔷 🇨🇴'.split(' '),
};
export const QUICK = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
export function recentEmoji(add) {
  let r = JSON.parse(localStorage.getItem('duna-emoji') || '[]');
  if (add) { r = [add, ...r.filter(x => x !== add)].slice(0, 32); localStorage.setItem('duna-emoji', JSON.stringify(r)); }
  return r;
}
