import { describe, expect, it } from 'vitest';
import { toHistoryTurns } from './ai-history.logic';
import { AI_START_MARKER } from './topic-guard.logic';
import { AI_QUOTE_SNIPPET_MAX_CHARS } from './constants';
import type { ContactId, LineMessageId, MessageId, Seq } from './ids';
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
const customer = (text: string) => msg({ text });
const customerMedia = (type: Message['type'], otherKind: Message['otherKind'] = null) =>
  msg({ type, otherKind });
const reply = (author: 'admin' | 'ai', text: string, status: Message['deliveryStatus'] = 'sent') =>
  msg({ direction: 'outbound', author, text, deliveryStatus: status });

describe('toHistoryTurns', () => {
  it('matches the example of ai-prompt 4.3', () => {
    const turns = toHistoryTurns([
      customer('สวัสดีค่ะ'),
      customerMedia('image'),
      reply('admin', 'สวัสดีค่ะ รูปนี้คือเค้กช็อกโกแลตค่ะ'),
      reply('ai', 'ต้องการสั่งล่วงหน้าไหมคะ'),
      customer('ราคาเท่าไหร่คะ'),
      customer('ปอนด์เดียว'),
    ]);
    expect(turns).toEqual([
      { role: 'customer', text: 'สวัสดีค่ะ\n[ผู้ใช้ส่งรูปภาพ]' },
      { role: 'assistant', text: 'สวัสดีค่ะ รูปนี้คือเค้กช็อกโกแลตค่ะ\nต้องการสั่งล่วงหน้าไหมคะ' },
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
      reply('admin', 'pending', 'pending'),
      reply('ai', 'failed', 'failed'),
      reply('admin', 'sent', 'sent'),
      reply('admin', 'unknown status', null),
      customer('b'),
    ]);
    expect(turns).toEqual([
      { role: 'customer', text: 'a' },
      { role: 'assistant', text: 'sent\nunknown status' },
      { role: 'customer', text: 'b' },
    ]);
  });

  it('merges customer messages across a dropped failed reply', () => {
    expect(toHistoryTurns([customer('a'), reply('ai', 'x', 'failed'), customer('b')])).toEqual([
      { role: 'customer', text: 'a\nb' },
    ]);
  });

  it('drops leading assistant turns', () => {
    expect(toHistoryTurns([reply('admin', 'hi'), reply('ai', 'yo'), customer('a')])).toEqual([
      { role: 'customer', text: 'a' },
    ]);
  });

  it('returns [] when the last turn is the assistant', () => {
    expect(toHistoryTurns([customer('a'), reply('admin', 'x')])).toEqual([]);
    expect(toHistoryTurns([reply('admin', 'x')])).toEqual([]);
  });

  it('ignores unsent assistant messages after the customer', () => {
    expect(toHistoryTurns([customer('a'), reply('ai', 'x', 'pending')])).toEqual([
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
          '[ผู้ใช้ส่งวิดีโอ]',
          '[ผู้ใช้ส่งสติกเกอร์]',
          '[ผู้ใช้ส่งข้อความเสียง]',
          '[ผู้ใช้ส่งไฟล์]',
          '[ผู้ใช้ส่งตำแหน่ง]',
          '[ผู้ใช้ส่งข้อความชนิดอื่น]',
          '[ผู้ใช้ส่งข้อความชนิดอื่น]',
        ].join('\n'),
      },
    ]);
  });

  it('labels admin images and videos and skips assistant types that do not occur', () => {
    const adminMedia = (type: Message['type']) =>
      msg({ direction: 'outbound', author: 'admin', type, deliveryStatus: 'sent' });
    expect(
      toHistoryTurns([
        customer('a'),
        adminMedia('image'),
        adminMedia('video'),
        adminMedia('sticker'),
        adminMedia('other'),
        customer('b'),
      ]),
    ).toEqual([
      { role: 'customer', text: 'a' },
      { role: 'assistant', text: '[แอดมินส่งรูปภาพ]\n[แอดมินส่งวิดีโอ]' },
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

describe('toHistoryTurns: quotes', () => {
  const lid = (s: string) => s as LineMessageId; // brand: test id

  it('puts a bounded line naming the quoted message before a customer text that quotes it', () => {
    const long = 'ก'.repeat(AI_QUOTE_SNIPPET_MAX_CHARS + 5);
    const ai = msg({
      direction: 'outbound',
      author: 'ai',
      text: `ราคา\n${long}`,
      deliveryStatus: 'sent',
      lineSentIds: [lid('s1')],
    });
    const photo = msg({ type: 'image', lineMessageId: lid('p1') });
    const turns = toHistoryTurns([
      photo,
      ai,
      msg({ text: 'อันนี้เท่าไหร่', quotedLineMessageId: lid('s1') }),
      msg({ text: 'รูปนี้', quotedLineMessageId: lid('p1') }),
      msg({ text: 'อันก่อน', quotedLineMessageId: lid('gone') }),
    ]);
    const cut = `ราคา ${'ก'.repeat(AI_QUOTE_SNIPPET_MAX_CHARS - 5)}…`;
    expect(turns.at(-1)).toEqual({
      role: 'customer',
      text: [
        `[ตอบกลับข้อความ: "${cut}"]`,
        'อันนี้เท่าไหร่',
        '[ตอบกลับรูปภาพ]',
        'รูปนี้',
        '[ตอบกลับข้อความก่อนหน้า]',
        'อันก่อน',
      ].join('\n'),
    });
  });

  it('keeps a short quoted text whole and leaves messages without a quote unchanged', () => {
    const q = msg({ text: 'สั้น', lineMessageId: lid('a') });
    expect(toHistoryTurns([q, msg({ text: 'ตอบ', quotedLineMessageId: lid('a') })])).toEqual([
      { role: 'customer', text: 'สั้น\n[ตอบกลับข้อความ: "สั้น"]\nตอบ' },
    ]);
  });
});

describe('toHistoryTurns: rich menu taps', () => {
  it('shows a tap as its marker, never as the button title', () => {
    const turns = toHistoryTurns([
      msg({ text: 'คุยกับแอดมิน', eventCode: 'customer.tapped_admin' }),
      msg({ direction: 'outbound', author: 'ai', text: 'รับทราบ', deliveryStatus: 'sent' }),
      msg({ text: 'วิธีทดสอบ', eventCode: 'customer.tapped_how_to' }),
      msg({ direction: 'outbound', author: 'ai', text: 'ลองได้', deliveryStatus: 'sent' }),
      msg({ text: 'คุยกับ AI', eventCode: 'customer.tapped_ai_on' }),
    ]);
    expect(turns).toEqual([
      { role: 'customer', text: '[ผู้ใช้กดปุ่ม "คุยกับแอดมิน"]' },
      { role: 'assistant', text: 'รับทราบ' },
      { role: 'customer', text: '[ผู้ใช้กดปุ่ม "วิธีทดสอบ"]' },
      { role: 'assistant', text: 'ลองได้' },
      { role: 'customer', text: AI_START_MARKER },
    ]);
  });

  it('keeps a typed "คุยกับ AI" as typed', () => {
    expect(toHistoryTurns([customer('คุยกับ AI')])).toEqual([{ role: 'customer', text: 'คุยกับ AI' }]);
  });
});
