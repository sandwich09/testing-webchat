import { describe, expect, it } from 'vitest';
import { toHistoryTurns } from './ai-history.logic';
import type { ContactId, MessageId, Seq } from './ids';
import type { Message } from './message.model';

let n = 0;
const msg = (p: Partial<Message>): Message => {
  n += 1;
  return {
    id: `m${String(n)}` as MessageId, // test helper: brand a literal
    seq: BigInt(n) as Seq,
    updatedSeq: BigInt(n) as Seq,
    contactId: 'c1' as ContactId,
    direction: 'inbound',
    author: 'customer',
    type: 'text',
    text: null,
    mediaUrl: null,
    previewUrl: null,
    mediaStatus: null,
    stickerPackageId: null,
    stickerId: null,
    otherKind: null,
    eventCode: null,
    lineMessageId: null,
    deliveryStatus: null,
    deliveryError: null,
    retryKey: null,
    createdAt: new Date(0),
    sentAt: null,
    ...p,
  };
};
const customer = (text: string) => msg({ text });
const customerMedia = (type: Message['type'], otherKind: Message['otherKind'] = null) =>
  msg({ type, otherKind });
const shop = (author: 'admin' | 'ai', text: string, status: Message['deliveryStatus'] = 'sent') =>
  msg({ direction: 'outbound', author, text, deliveryStatus: status });

describe('toHistoryTurns', () => {
  it('matches the example of ai-prompt 4.3', () => {
    const turns = toHistoryTurns([
      customer('สวัสดีค่ะ'),
      customerMedia('image'),
      shop('admin', 'สวัสดีค่ะ รูปนี้คือเค้กช็อกโกแลตค่ะ'),
      shop('ai', 'ต้องการสั่งล่วงหน้าไหมคะ'),
      customer('ราคาเท่าไหร่คะ'),
      customer('ปอนด์เดียว'),
    ]);
    expect(turns).toEqual([
      { role: 'customer', text: 'สวัสดีค่ะ\n[ลูกค้าส่งรูปภาพ]' },
      { role: 'shop', text: 'สวัสดีค่ะ รูปนี้คือเค้กช็อกโกแลตค่ะ\nต้องการสั่งล่วงหน้าไหมคะ' },
      { role: 'customer', text: 'ราคาเท่าไหร่คะ\nปอนด์เดียว' },
    ]);
  });

  it('returns [] for no messages', () => {
    expect(toHistoryTurns([])).toEqual([]);
  });

  it('skips event lines', () => {
    const e = msg({
      direction: 'internal',
      author: 'system',
      type: 'event',
      eventCode: 'contact.followed',
    });
    expect(toHistoryTurns([customer('a'), e, customer('b')])).toEqual([
      { role: 'customer', text: 'a\nb' },
    ]);
  });

  it('skips non-event messages written by the system author', () => {
    expect(toHistoryTurns([customer('a'), msg({ author: 'system', text: 'x' })])).toEqual([
      { role: 'customer', text: 'a' },
    ]);
  });

  it('drops outbound messages that are pending or failed, keeps sent and null status', () => {
    const turns = toHistoryTurns([
      customer('a'),
      shop('admin', 'pending', 'pending'),
      shop('ai', 'failed', 'failed'),
      shop('admin', 'sent', 'sent'),
      shop('admin', 'unknown status', null),
      customer('b'),
    ]);
    expect(turns).toEqual([
      { role: 'customer', text: 'a' },
      { role: 'shop', text: 'sent\nunknown status' },
      { role: 'customer', text: 'b' },
    ]);
  });

  it('merges customer messages across a dropped failed reply', () => {
    expect(toHistoryTurns([customer('a'), shop('ai', 'x', 'failed'), customer('b')])).toEqual([
      { role: 'customer', text: 'a\nb' },
    ]);
  });

  it('drops leading shop turns', () => {
    expect(toHistoryTurns([shop('admin', 'hi'), shop('ai', 'yo'), customer('a')])).toEqual([
      { role: 'customer', text: 'a' },
    ]);
  });

  it('returns [] when the last turn is the shop', () => {
    expect(toHistoryTurns([customer('a'), shop('admin', 'x')])).toEqual([]);
    expect(toHistoryTurns([shop('admin', 'x')])).toEqual([]);
  });

  it('ignores unsent shop messages after the customer', () => {
    expect(toHistoryTurns([customer('a'), shop('ai', 'x', 'pending')])).toEqual([
      { role: 'customer', text: 'a' },
    ]);
  });

  it('labels customer media', () => {
    const turns = toHistoryTurns([
      customerMedia('video'),
      customerMedia('sticker'),
      customerMedia('other', 'audio'),
      customerMedia('other', 'file'),
      customerMedia('other', 'location'),
      customerMedia('other', 'unknown'),
      customerMedia('other', null),
    ]);
    expect(turns).toEqual([
      {
        role: 'customer',
        text: [
          '[ลูกค้าส่งวิดีโอ]',
          '[ลูกค้าส่งสติกเกอร์]',
          '[ลูกค้าส่งข้อความเสียง]',
          '[ลูกค้าส่งไฟล์]',
          '[ลูกค้าส่งตำแหน่ง]',
          '[ลูกค้าส่งข้อความชนิดอื่น]',
          '[ลูกค้าส่งข้อความชนิดอื่น]',
        ].join('\n'),
      },
    ]);
  });

  it('labels shop images and videos and skips shop types that do not occur', () => {
    const shopMedia = (type: Message['type']) =>
      msg({ direction: 'outbound', author: 'admin', type, deliveryStatus: 'sent' });
    expect(
      toHistoryTurns([
        customer('a'),
        shopMedia('image'),
        shopMedia('video'),
        shopMedia('sticker'),
        shopMedia('other'),
        customer('b'),
      ]),
    ).toEqual([
      { role: 'customer', text: 'a' },
      { role: 'shop', text: '[ร้านส่งรูปภาพ]\n[ร้านส่งวิดีโอ]' },
      { role: 'customer', text: 'b' },
    ]);
  });

  it('skips text messages with no text', () => {
    expect(toHistoryTurns([customer('a'), msg({ text: null }), msg({ text: '' })])).toEqual([
      { role: 'customer', text: 'a' },
    ]);
  });

  it('does not mutate its input', () => {
    const input = [customer('a'), customer('b')];
    const copy = structuredClone(input);
    toHistoryTurns(input);
    expect(input).toEqual(copy);
  });
});
