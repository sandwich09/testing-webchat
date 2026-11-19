import type { ChatRole, ChatTurn } from './chat.model';
import { AI_QUOTE_SNIPPET_MAX_CHARS } from './constants';
import { AI_START_MARKER } from './topic-guard.logic';
import type { OtherKind } from './enums.model';
import type { LineMessageId } from './ids';
import { graphemeBoundaries } from './line-send.logic';
import type { Message } from './message.model';
import { indexByLineId, quoteOf } from './message-quote.logic';

const OTHER_LABELS: Record<OtherKind, string> = {
  audio: 'ข้อความเสียง',
  file: 'ไฟล์',
  location: 'ตำแหน่ง',
  unknown: 'ข้อความชนิดอื่น',
};

const QUOTED_KIND_LABELS: Record<Exclude<Message['type'], 'text' | 'event'>, string> = {
  image: 'รูปภาพ',
  video: 'วิดีโอ',
  audio: 'ข้อความเสียง',
  sticker: 'สติกเกอร์',
  other: 'ข้อความ',
};

/**
 * The line put before a customer text that quotes another message (ai-prompt 4.2): the quoted
 * text cut to AI_QUOTE_SNIPPET_MAX_CHARS characters when it is in the same history window, its
 * kind for media, or a plain marker when it is not in the window. Never longer than that.
 */
function quoteLineOf(m: Message, index: ReadonlyMap<LineMessageId, Message>): string | null {
  const quoted = quoteOf(m, index);
  if (quoted === undefined) return null;
  if (quoted === null || quoted.type === 'event') return '[ตอบกลับข้อความก่อนหน้า]';
  if (quoted.type !== 'text') return `[ตอบกลับ${QUOTED_KIND_LABELS[quoted.type]}]`;
  const flat = (quoted.text ?? '').replace(/\s+/g, ' ').trim();
  const bounds = graphemeBoundaries(flat);
  const cut = bounds.length - 1 > AI_QUOTE_SNIPPET_MAX_CHARS;
  const snippet = cut ? `${flat.slice(0, bounds[AI_QUOTE_SNIPPET_MAX_CHARS])}…` : flat;
  return `[ตอบกลับข้อความ: "${snippet}"]`;
}

/**
 * A rich menu or welcome card tap as the model sees it (ai-prompt 4.2): never the button title,
 * so a typed "คุยกับ AI" and a tap stay apart. The topic guard lets the start marker through.
 */
export const TAP_MARKERS: Partial<Record<NonNullable<Message['eventCode']>, string>> = {
  'customer.tapped_ai_on': AI_START_MARKER,
  'customer.tapped_admin': '[ผู้ใช้กดปุ่ม "คุยกับแอดมิน"]',
  'customer.tapped_how_to': '[ผู้ใช้กดปุ่ม "วิธีทดสอบ"]',
};

/** Text of one message as the model sees it, or null when it is left out of the history. */
function contentOf(m: Message, role: ChatRole): string | null {
  switch (m.type) {
    case 'text': {
      const marker = m.eventCode === null ? undefined : TAP_MARKERS[m.eventCode];
      if (marker !== undefined) return marker;
      return m.text === null || m.text === '' ? null : m.text;
    }
    case 'image':
      return role === 'customer' ? '[ผู้ใช้ส่งรูปภาพ]' : '[แอดมินส่งรูปภาพ]';
    case 'video':
      return role === 'customer' ? '[ผู้ใช้ส่งวิดีโอ]' : '[แอดมินส่งวิดีโอ]';
    case 'audio':
      return role === 'customer' ? '[ผู้ใช้ส่งข้อความเสียง]' : null;
    case 'sticker':
      return role === 'customer' ? '[ผู้ใช้ส่งสติกเกอร์]' : null;
    case 'other':
      return role === 'customer' ? `[ผู้ใช้ส่ง${OTHER_LABELS[m.otherKind ?? 'unknown']}]` : null;
    case 'event':
      return null;
  }
}

/**
 * Messages (already ordered by seq and limited by the caller) to alternating chat turns,
 * ai-prompt section 4. Returns [] when the last turn is not the customer's.
 */
export function toHistoryTurns(messages: Message[]): ChatTurn[] {
  const turns: ChatTurn[] = [];
  // Only the rows of this window are looked at, so a quote costs no query and stays bounded.
  const index = indexByLineId(messages);
  for (const m of messages) {
    if (m.type === 'event' || m.author === 'system') continue;
    if (
      m.direction === 'outbound' &&
      (m.deliveryStatus === 'pending' || m.deliveryStatus === 'failed')
    ) {
      continue;
    }
    const role: ChatRole = m.author === 'customer' ? 'customer' : 'assistant';
    const content = contentOf(m, role);
    if (content === null) continue;
    const quoteLine = role === 'customer' && m.type === 'text' ? quoteLineOf(m, index) : null;
    const text = quoteLine === null ? content : `${quoteLine}\n${content}`;
    const last = turns[turns.length - 1];
    if (last !== undefined && last.role === role) {
      turns[turns.length - 1] = { role, text: `${last.text}\n${text}` };
    } else {
      turns.push({ role, text });
    }
  }
  while (turns[0]?.role === 'assistant') turns.shift();
  return turns[turns.length - 1]?.role === 'customer' ? turns : [];
}
