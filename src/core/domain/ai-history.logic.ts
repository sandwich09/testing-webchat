import type { ChatRole, ChatTurn } from './chat.model';
import type { OtherKind } from './enums.model';
import type { Message } from './message.model';

const OTHER_LABELS: Record<OtherKind, string> = {
  audio: 'ข้อความเสียง',
  file: 'ไฟล์',
  location: 'ตำแหน่ง',
  unknown: 'ข้อความชนิดอื่น',
};

/** Text of one message as the model sees it, or null when it is left out of the history. */
function contentOf(m: Message, role: ChatRole): string | null {
  switch (m.type) {
    case 'text':
      return m.text === null || m.text === '' ? null : m.text;
    case 'image':
      return role === 'customer' ? '[ลูกค้าส่งรูปภาพ]' : '[ร้านส่งรูปภาพ]';
    case 'video':
      return role === 'customer' ? '[ลูกค้าส่งวิดีโอ]' : '[ร้านส่งวิดีโอ]';
    case 'sticker':
      return role === 'customer' ? '[ลูกค้าส่งสติกเกอร์]' : null;
    case 'other':
      return role === 'customer' ? `[ลูกค้าส่ง${OTHER_LABELS[m.otherKind ?? 'unknown']}]` : null;
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
  for (const m of messages) {
    if (m.type === 'event' || m.author === 'system') continue;
    if (
      m.direction === 'outbound' &&
      (m.deliveryStatus === 'pending' || m.deliveryStatus === 'failed')
    ) {
      continue;
    }
    const role: ChatRole = m.author === 'customer' ? 'customer' : 'shop';
    const text = contentOf(m, role);
    if (text === null) continue;
    const last = turns[turns.length - 1];
    if (last !== undefined && last.role === role) {
      turns[turns.length - 1] = { role, text: `${last.text}\n${text}` };
    } else {
      turns.push({ role, text });
    }
  }
  while (turns[0]?.role === 'shop') turns.shift();
  return turns[turns.length - 1]?.role === 'customer' ? turns : [];
}
