// DUNA · arquitectura modular de navegación (base para la super-app).
// - NAV: pestañas principales (barra inferior en móvil / franja lateral en PC).
// - MODULES: secciones y mini-apps que viven dentro de "Descubrir".
// Para añadir una sección nueva (noticias, videos, radio, juegos, mini-apps…) basta con
// registerModule({ id, label, icon, order, render(container, header) }) — no hay que tocar el shell.
export const NAV = [];
export const MODULES = [];
export function registerNav(item) { NAV.push(item); NAV.sort((a, b) => a.order - b.order); }
export function registerModule(m) { const i = MODULES.findIndex(x => x.id === m.id); if (i >= 0) MODULES.splice(i, 1); MODULES.push(m); MODULES.sort((a, b) => a.order - b.order); }
export const moduleOf = id => MODULES.find(m => m.id === id && !m.soon);
// Pestaña de navegación que queda resaltada para un S.tab dado
export const navOf = tab => moduleOf(tab) ? 'discover' : tab;
