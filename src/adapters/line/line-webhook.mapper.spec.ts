import { describe, expect, it } from 'vitest';
import type { LineEvent } from '@/core/domain';
import { STUB_CHANNEL_SECRET } from '../../../e2e/fixtures/line/credentials';
import { newFixtureVars, renderFixture, signLineBody } from '../../../e2e/helpers/line-webhook';
import { parseLineWebhook, usableReplyToken, verifyLineSignature } from './line-webhook.mapper';

const parse = (raw: string): LineEvent[] => {
  const result = parseLineWebhook(raw);
  if (!result.ok) throw new Error(`unexpected ${result.error.code}`);
  return result.value.events;
};

const event = (extra: Record<string, unknown>): Record<string, unknown> => ({
  type: 'follow',
  webhookEventId: 'e1',
  timestamp: 1_700_000_000_000,
  mode: 'active',
  deliveryContext: { isRedelivery: false },
  source: { type: 'user', userId: 'U1' },
  replyToken: 'rt',
  ...extra,
});
const body = (...events: unknown[]): string => JSON.stringify({ destination: 'Ubot', events });

describe('verifyLineSignature', () => {
  it('accepts the signature the fixture helper makes for a rendered fixture', () => {
    const raw = renderFixture('message-text', newFixtureVars({ text: 'สวัสดี' }));
    expect(
      verifyLineSignature(raw, signLineBody(raw, STUB_CHANNEL_SECRET), STUB_CHANNEL_SECRET),
    ).toBe(true);
  });

  it('returns false for a signature of another length, without throwing', () => {
    const raw = body();
    const short = Buffer.from('abc').toString('base64');
    expect(verifyLineSignature(raw, short, STUB_CHANNEL_SECRET)).toBe(false);
  });

  it('returns false for an empty channel secret', () => {
    const raw = body();
    expect(verifyLineSignature(raw, signLineBody(raw, ''), '')).toBe(false);
  });
});

describe('parseLineWebhook with the shared fixtures', () => {
  it('batch-with-malformed: three events, the second unsupported, in payload order', () => {
    const vars = newFixtureVars({ text: 'ข้อความ' });
    const events = parse(renderFixture('batch-with-malformed', vars));
    expect(events.map((e) => [e.webhookEventId, e.kind])).toEqual([
      [vars.webhookEventId, 'message'],
      [vars.webhookEventId2, 'unsupported'],
      [vars.webhookEventId3, 'message'],
    ]);
    expect(events[1]).toMatchObject({ kind: 'unsupported', lineType: 'message' });
    expect(events[2]).toMatchObject({
      message: {
        type: 'sticker',
        lineMessageId: vars.messageId2,
        packageId: '446',
        stickerId: '1988',
      },
    });
  });

  it('message-text: every used field', () => {
    const vars = newFixtureVars({ text: 'มีโต๊ะว่างไหม' });
    expect(parse(renderFixture('message-text', vars))).toEqual([
      {
        kind: 'message',
        webhookEventId: vars.webhookEventId,
        timestamp: new Date(vars.timestamp),
        isRedelivery: false,
        userId: vars.userId,
        replyToken: vars.replyToken,
        message: {
          type: 'text',
          lineMessageId: vars.messageId,
          text: 'มีโต๊ะว่างไหม',
          quotedLineMessageId: null,
        },
      },
    ]);
  });

  it('postback: the data and the reply token', () => {
    const vars = newFixtureVars({ postbackData: 'tw1:ai_on' });
    expect(parse(renderFixture('postback', vars))).toEqual([
      {
        kind: 'postback',
        webhookEventId: vars.webhookEventId,
        timestamp: new Date(vars.timestamp),
        isRedelivery: false,
        userId: vars.userId,
        replyToken: vars.replyToken,
        data: 'tw1:ai_on',
      },
    ]);
  });

  it('redelivery-duplicate: same ids, redelivery reported, no reply token', () => {
    const vars = newFixtureVars();
    const [first] = parse(renderFixture('message-text', vars));
    const [again] = parse(renderFixture('redelivery-duplicate', vars));
    expect(again).toMatchObject({
      kind: 'message',
      webhookEventId: first?.webhookEventId,
      isRedelivery: true,
      replyToken: null,
      message: { lineMessageId: vars.messageId },
    });
  });

  it.each([
    ['message-image', { type: 'image', hostedByLine: true }, 'img'],
    ['message-video', { type: 'video', hostedByLine: true }, 'vid'],
    ['message-image-too-large', { type: 'image', hostedByLine: true }, 'bigimg'],
    ['message-image-gone', { type: 'image', hostedByLine: true }, 'gone'],
    ['message-audio', { type: 'audio', hostedByLine: true, durationMs: 4000 }, 'aud'],
    ['message-file', { type: 'other', otherKind: 'file' }, ''],
    ['message-location', { type: 'other', otherKind: 'location' }, ''],
  ])('%s', (name, message, prefix) => {
    const vars = newFixtureVars();
    expect(parse(renderFixture(name, vars))).toMatchObject([
      { kind: 'message', message: { ...message, lineMessageId: `${prefix}${vars.messageId}` } },
    ]);
  });

  it('reads an audio duration tolerantly and an external audio as not hosted by LINE', () => {
    const audio = (message: Record<string, unknown>) =>
      parse(
        JSON.stringify({
          events: [
            {
              type: 'message',
              webhookEventId: 'e1',
              timestamp: 1,
              source: { type: 'user', userId: 'U1' },
              message: { id: 'a1', type: 'audio', ...message },
            },
          ],
        }),
      );
    expect(audio({ duration: 'x', contentProvider: { type: 'external' } })).toMatchObject([
      { message: { type: 'audio', durationMs: null, hostedByLine: false } },
    ]);
    expect(audio({ duration: -1, contentProvider: { type: 'line' } })).toMatchObject([
      { message: { type: 'audio', durationMs: null, hostedByLine: true } },
    ]);
  });

  it('follow, unfollow and unknown-type', () => {
    const vars = newFixtureVars();
    expect(parse(renderFixture('follow', vars))).toMatchObject([
      { kind: 'follow', userId: vars.userId, replyToken: vars.replyToken },
    ]);
    expect(parse(renderFixture('unfollow', vars))).toMatchObject([
      { kind: 'unfollow', userId: vars.userId },
    ]);
    expect(parse(renderFixture('unknown-type', vars))).toMatchObject([
      { kind: 'unsupported', lineType: 'futureEventType', webhookEventId: vars.webhookEventId },
    ]);
  });

  it('burst-three-texts keeps order and per-event timestamps', () => {
    const vars = newFixtureVars();
    const events = parse(renderFixture('burst-three-texts', vars));
    expect(events).toHaveLength(3);
    const times = events.map((e) => e.timestamp.getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });
});

describe('parseLineWebhook rules', () => {
  it('skips an event without webhookEventId and counts it, instead of an empty id', () => {
    const result = parseLineWebhook(
      body(
        event({ webhookEventId: 'a' }),
        event({ webhookEventId: undefined }),
        event({ webhookEventId: '' }),
        event({ webhookEventId: 7 }),
        null,
        'text',
        event({ webhookEventId: 'b' }),
      ),
    );
    expect(result).toMatchObject({ ok: true, value: { skippedWithoutEventId: 5 } });
    if (result.ok) expect(result.value.events.map((e) => e.webhookEventId)).toEqual(['a', 'b']);
  });

  it.each([
    ['standby mode', { mode: 'standby' }],
    ['no mode', { mode: undefined }],
    ['redelivery', { deliveryContext: { isRedelivery: true } }],
    ['an empty token', { replyToken: '' }],
  ])('gives no reply token for %s', (_name, extra) => {
    expect(parse(body(event(extra)))).toMatchObject([{ kind: 'follow', replyToken: null }]);
  });

  it.each([
    ['a missing timestamp', { timestamp: undefined }],
    ['a string timestamp', { timestamp: '1700000000000' }],
    ['a missing source', { source: undefined }],
    ['a user source without userId', { source: { type: 'user' } }],
    ['a non-boolean isRedelivery', { deliveryContext: { isRedelivery: 'no' } }],
    ['a room source', { source: { type: 'room', roomId: 'R1', userId: 'U1' } }],
  ])('turns an event with %s into unsupported', (_name, extra) => {
    expect(parse(body(event(extra)))).toMatchObject([
      { kind: 'unsupported', webhookEventId: 'e1', lineType: 'follow' },
    ]);
  });

  it.each([
    ['text without text', { id: 'm', type: 'text' }],
    ['sticker without stickerId', { id: 'm', type: 'sticker', packageId: '1' }],
    ['a numeric id', { id: 5, type: 'text', text: 'x' }],
    ['image with a malformed provider', { id: 'm', type: 'image', contentProvider: 'line' }],
    ['no message', undefined],
  ])('turns a message event with %s into unsupported', (_name, message) => {
    expect(parse(body(event({ type: 'message', message })))).toMatchObject([
      { kind: 'unsupported', lineType: 'message' },
    ]);
  });

  it('treats media without a content provider as not hosted by LINE', () => {
    expect(
      parse(body(event({ type: 'message', message: { id: 'm', type: 'image' } }))),
    ).toMatchObject([{ message: { type: 'image', hostedByLine: false } }]);
  });

  it('ignores unknown fields everywhere', () => {
    const events = parse(
      JSON.stringify({
        destination: 'U',
        extra: [1],
        events: [event({ newField: { deep: true }, source: { type: 'user', userId: 'U1', x: 1 } })],
      }),
    );
    expect(events).toMatchObject([{ kind: 'follow', userId: 'U1' }]);
  });

  it('never throws on malformed input', () => {
    const inputs = ['', 'null', '{"events":null}', '{"events":[[],1,true,{}]}', '\u0000', '{'];
    for (const raw of inputs) expect(() => parseLineWebhook(raw)).not.toThrow();
  });
});

describe('usableReplyToken', () => {
  it('returns the token only for an active, first delivery', () => {
    expect(usableReplyToken('rt', 'active', false)).toBe('rt');
    expect(usableReplyToken('rt', 'active', true)).toBeNull();
    expect(usableReplyToken(undefined, 'active', false)).toBeNull();
  });
});
