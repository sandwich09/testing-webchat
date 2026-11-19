import type { LineMessageId } from './ids';
import type { Message } from './message.model';

// Quotes of inbound messages (specs/webchat-inbox.md "ข้อความที่ตอบกลับ"): a customer who used
// LINE's reply on a message sends the LINE id of that message. It is found among the inbound
// `lineMessageId`s and the `lineSentIds` of outbound messages of the same chat.

/** The distinct quoted LINE ids of a page, in first-seen order. */
export function quotedLineIdsOf(messages: readonly Message[]): LineMessageId[] {
  const seen = new Set<LineMessageId>();
  for (const m of messages) if (m.quotedLineMessageId !== null) seen.add(m.quotedLineMessageId);
  return [...seen];
}

/** Every LINE id a message is known by: its inbound id or the ids of its sent parts. */
export function lineIdsOf(m: Message): LineMessageId[] {
  return m.lineMessageId === null ? [...m.lineSentIds] : [m.lineMessageId, ...m.lineSentIds];
}

/** Lookup from a LINE id to the message it belongs to. Event lines are never quoted. */
export function indexByLineId(found: readonly Message[]): Map<LineMessageId, Message> {
  const index = new Map<LineMessageId, Message>();
  for (const m of found) {
    if (m.type === 'event') continue;
    for (const id of lineIdsOf(m)) index.set(id, m);
  }
  return index;
}

/**
 * The quote of a message: `undefined` when it quotes nothing, `null` when the quoted message is
 * not known (sent before ids were stored, from another chat, or never stored), else the message.
 */
export function quoteOf(
  m: Message,
  index: ReadonlyMap<LineMessageId, Message>,
): Message | null | undefined {
  if (m.quotedLineMessageId === null) return undefined;
  return index.get(m.quotedLineMessageId) ?? null;
}
