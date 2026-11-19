import { describe, expect, it } from 'vitest';
import type { ContactId, LineMessageId, MessageId, Seq } from './ids';
import type { Message } from './message.model';
import { indexByLineId, lineIdsOf, quoteOf, quotedLineIdsOf } from './message-quote.logic';

let n = 0;
const lid = (s: string) => s as LineMessageId; // brand: test id
const msg = (p: Partial<Message>): Message => {
  n += 1;
  return {
    id: `m${String(n)}` as MessageId, // brand: test id
    seq: BigInt(n) as Seq, // brand: test seq
    updatedSeq: BigInt(n) as Seq, // brand: test seq
    contactId: 'c1' as ContactId, // brand: test id
    direction: 'inbound',
    author: 'customer',
    type: 'text',
    text: 'x',
    mediaUrl: null,
    previewUrl: null,
    mediaStatus: null,
    mediaFailure: null,
    mediaDurationMs: null,
    stickerPackageId: null,
    stickerId: null,
    otherKind: null,
    eventCode: null,
    lineMessageId: null,
    quotedLineMessageId: null,
    lineSentIds: [],
    deliveryStatus: null,
    deliveryError: null,
    retryKey: null,
    createdAt: new Date(0),
    sentAt: null,
    firstPushAt: null,
    ...p,
  };
};

describe('message quotes', () => {
  it('lists the distinct quoted ids of a page in first-seen order', () => {
    const page = [
      msg({ quotedLineMessageId: lid('b') }),
      msg({}),
      msg({ quotedLineMessageId: lid('a') }),
      msg({ quotedLineMessageId: lid('b') }),
    ];
    expect(quotedLineIdsOf(page)).toEqual(['b', 'a']);
  });

  it('knows a message by its inbound id and by every sent part', () => {
    expect(lineIdsOf(msg({ lineMessageId: lid('in') }))).toEqual(['in']);
    expect(lineIdsOf(msg({ direction: 'outbound', lineSentIds: [lid('p1'), lid('p2')] }))).toEqual([
      'p1',
      'p2',
    ]);
  });

  it('resolves a quote: undefined without one, null when unknown, else the message', () => {
    const customer = msg({ lineMessageId: lid('in') });
    const ai = msg({ direction: 'outbound', author: 'ai', lineSentIds: [lid('p1'), lid('p2')] });
    const event = msg({ type: 'event', author: 'system', lineSentIds: [lid('ev')] });
    const index = indexByLineId([customer, ai, event]);
    expect(quoteOf(msg({}), index)).toBeUndefined();
    expect(quoteOf(msg({ quotedLineMessageId: lid('in') }), index)).toBe(customer);
    expect(quoteOf(msg({ quotedLineMessageId: lid('p2') }), index)).toBe(ai);
    expect(quoteOf(msg({ quotedLineMessageId: lid('ev') }), index)).toBeNull();
    expect(quoteOf(msg({ quotedLineMessageId: lid('zz') }), index)).toBeNull();
  });
});
