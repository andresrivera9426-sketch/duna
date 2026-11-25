// Tema claro/oscuro y tamaño de letra (se aplica antes de pintar)
import { S } from '../services/state.js';

export function applyTheme() {
  const t = S.prefs.theme || 'system';
  const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.style.fontSize = ({ s: '15px', m: '16px', l: '17.5px' })[S.prefs.font || 'm'];
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#0D0C17' : '#F5F1EA');
  if (document.documentElement.classList.contains('native')) import('../services/native.js').then(n => n.nativeTheme(dark));
}
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);
