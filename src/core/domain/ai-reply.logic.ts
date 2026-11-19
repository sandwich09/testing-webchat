import { AI_REPLY_MAX_CHARS } from './constants';

/** Cleans a model reply per ai-prompt section 6. Returns null when empty or too long. */
export function sanitizeAiReply(text: string): string | null {
  const cleaned = text
    // 1. line endings and edges
    .replace(/\r\n/g, '\n')
    .trim()
    // 2. markdown the model may leak
    .replace(/\*\*(.+?)\*\*/gs, '$1')
    .replace(/__(.+?)__/gs, '$1')
    .replace(/`/g, '')
    .replace(/^#{1,6}[ \t]+/gm, '')
    .replace(/^>[ \t]?/gm, '')
    // 3. bullets
    .replace(/^[-*] /gm, '• ')
    // 4. links
    .replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, '$1 $2')
    // 5. more than one blank line in a row
    .replace(/\n(?:[ \t]*\n){2,}/g, '\n\n')
    // 6. edges again
    .trim();
  if (cleaned === '' || cleaned.length > AI_REPLY_MAX_CHARS) return null;
  return cleaned;
}
