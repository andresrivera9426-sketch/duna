// IA DUNA · parte mínima que se carga al inicio (fila fijada, avatar, detección de @IA).
// Todo lo pesado (chat, voz, imágenes, resúmenes) vive en ia.js y se carga al usarlo.
import { h } from '../../shared/ui.js';
import { S, emit } from '../../services/state.js';
import { kvGet } from '../../services/crypto.js';
export const IA_ID = 'ia-duna';
export const IA_PREFIX = '✨ IA DUNA:\n';
export const iaMention = t => /(^|\s)@ia(?![a-z0-9_.])/i.test(t || '');
export const iaBody = m => (m?.body || '').replace(/^✨ IA DUNA:\s*\n?/, '');
export const SPARK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.1 5.6 5.6 2.1-5.6 2.1L12 17.9l-2.1-5.6-5.6-2.1 5.6-2.1z" fill="#fff"/><path d="M19 15l.9 2.1 2.1.9-2.1.9L19 21l-.9-2.1-2.1-.9 2.1-.9z" fill="#FFE7A8"/></svg>';
export function iaAvatar(size = 48) {
  return h('span', { class: 'avatar ia-av', style: { width: size + 'px', height: size + 'px' }, html: SPARK });
}
const preview = x => x.t || (x.img ? '🖼️ Imagen' : x.voice ? '🎤 Nota de voz' : '');
export function iaRowPreview() { const l = S.iaLast; return l ? (l.r === 'me' ? 'Tú: ' : '') + preview(l).replace(/\s+/g, ' ').slice(0, 90) : 'Tu asistente con IA · pregúntale lo que quieras'; }
export async function iaInitPreview() { const hist = (await kvGet('ia:' + S.user.id).catch(() => null)) || []; S.iaLast = hist[hist.length - 1] || null; emit('chats'); }
