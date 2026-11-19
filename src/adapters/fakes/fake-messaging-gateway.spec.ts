import { describe, expect, it } from 'vitest';
import type { LineMessageId, LineUserId } from '@/core/domain';
import {
  FAKE_LINE_ACCESS_TOKEN,
  FAKE_LINE_CHANNEL_ID,
  FAKE_LINE_INVALID_TOKEN,
  FAKE_LINE_OTHER_CHANNEL_TOKEN,
  FakeMessagingGateway,
} from './fake-messaging-gateway';
import {
  describeMessagingGatewaySuite,
  type MessagingGatewayHarness,
} from './suites/messaging-gateway.suite';

const KNOWN = 'U-known' as LineUserId;

const makeHarness = (): MessagingGatewayHarness => {
  const gateway = new FakeMessagingGateway();
  gateway.setProfile(KNOWN, { displayName: 'สมชาย', pictureUrl: null });
  let tokens = 0;
  gateway.invalidReplyTokens.add('expired-reply-token');
  return {
    gateway,
    channelSecret: gateway.channelSecret,
    validToken: FAKE_LINE_ACCESS_TOKEN,
    invalidToken: FAKE_LINE_INVALID_TOKEN,
    otherChannelToken: FAKE_LINE_OTHER_CHANNEL_TOKEN,
    knownUserId: KNOWN,
    unknownUserId: 'U-unknown' as LineUserId,
    freshReplyToken: () => Promise.resolve(`reply-token-${String(++tokens)}`),
    invalidReplyToken: 'expired-reply-token',
    seedContent: (c) => {
      gateway.setContent(c.lineMessageId, {
        original: c.original,
        preview: c.preview,
        contentType: c.contentType,
        knownSize: c.knownSize,
        notReadyTimes: c.notReadyTimes,
      });
      return Promise.resolve();
    },
    missingMessageId: 'no-such-message' as LineMessageId,
    exhaustPushQuota: () => {
      gateway.quotaExceeded = true;
      return Promise.resolve();
    },
    deliveredPushCount: (to) => Promise.resolve(gateway.pushes.filter((p) => p.to === to).length),
    channelId: FAKE_LINE_CHANNEL_ID,
    failNextSecretCheck: () => {
      gateway.failNext('verifyChannelSecret', 'line.unavailable');
      return Promise.resolve();
    },
    richMenuState: () =>
      Promise.resolve({ ids: [...gateway.richMenus.keys()], defaultId: gateway.defaultRichMenuId }),
  };
};

describeMessagingGatewaySuite(makeHarness);

describe('FakeMessagingGateway test controls', () => {
  it('records replies and pushes so a test can read what was sent', async () => {
    const gateway = new FakeMessagingGateway();
    await gateway.reply(FAKE_LINE_ACCESS_TOKEN, 'rt', [{ type: 'text', text: 'a' }]);
    await gateway.push(FAKE_LINE_ACCESS_TOKEN, KNOWN, [{ type: 'text', text: 'b' }], 'key-1');
    expect(gateway.replies).toEqual([
      { token: FAKE_LINE_ACCESS_TOKEN, replyToken: 'rt', parts: [{ type: 'text', text: 'a' }] },
    ]);
    expect(gateway.pushes).toEqual([
      {
        token: FAKE_LINE_ACCESS_TOKEN,
        to: KNOWN,
        parts: [{ type: 'text', text: 'b' }],
        retryKey: 'key-1',
      },
    ]);
  });

  it('does not record a repeated push key twice and answers alreadyAccepted', async () => {
    const gateway = new FakeMessagingGateway();
    const parts = [{ type: 'text' as const, text: 'b' }];
    const first = await gateway.push(FAKE_LINE_ACCESS_TOKEN, KNOWN, parts, 'key-1');
    const second = await gateway.push(FAKE_LINE_ACCESS_TOKEN, KNOWN, parts, 'key-1');
    expect(first).toEqual({
      ok: true,
      value: { alreadyAccepted: false, sentIds: ['fake-sent-1'] },
    });
    expect(second).toEqual({ ok: true, value: { alreadyAccepted: true, sentIds: [] } });
    expect(gateway.pushes).toHaveLength(1);
  });

  it('does not remember the retry key of a push that failed', async () => {
    const gateway = new FakeMessagingGateway();
    gateway.failNext('push', 'line.unavailable');
    const parts = [{ type: 'text' as const, text: 'b' }];
    expect((await gateway.push(FAKE_LINE_ACCESS_TOKEN, KNOWN, parts, 'k')).ok).toBe(false);
    expect(await gateway.push(FAKE_LINE_ACCESS_TOKEN, KNOWN, parts, 'k')).toEqual({
      ok: true,
      value: { alreadyAccepted: false, sentIds: ['fake-sent-1'] },
    });
  });

  it('failNext fails exactly the next call of that method, in order', async () => {
    const gateway = new FakeMessagingGateway();
    gateway.failNext('getBotInfo', 'line.unavailable');
    const first = await gateway.getBotInfo(FAKE_LINE_ACCESS_TOKEN);
    const second = await gateway.getBotInfo(FAKE_LINE_ACCESS_TOKEN);
    expect(first.ok).toBe(false);
    expect(second.ok).toBe(true);
  });

  it('rejects more parts than LINE accepts in one request', async () => {
    const gateway = new FakeMessagingGateway();
    const six = Array.from({ length: 6 }, () => ({ type: 'text' as const, text: 'x' }));
    const result = await gateway.reply(FAKE_LINE_ACCESS_TOKEN, 'rt', six);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('line.reply_failed');
  });

  it('drops the reply token of a redelivered or standby event', () => {
    const gateway = new FakeMessagingGateway();
    const raw = (extra: object): string =>
      JSON.stringify({
        events: [
          {
            type: 'follow',
            webhookEventId: 'e',
            timestamp: 1,
            source: { type: 'user', userId: 'U1' },
            replyToken: 'rt',
            deliveryContext: { isRedelivery: false },
            ...extra,
          },
        ],
      });
    const tokenOf = (body: string): unknown => {
      const result = gateway.parseEvents(body);
      const event = result.ok ? result.value[0] : undefined;
      return event?.kind === 'follow' ? event.replyToken : 'not a follow';
    };
    expect(tokenOf(raw({}))).toBe('rt');
    expect(tokenOf(raw({ deliveryContext: { isRedelivery: true } }))).toBeNull();
    expect(tokenOf(raw({ mode: 'standby' }))).toBeNull();
  });

  it('leaves out an event without a non-empty webhookEventId, as the LINE adapter does', () => {
    const gateway = new FakeMessagingGateway();
    const follow = (extra: object): object => ({
      type: 'follow',
      timestamp: 1,
      source: { type: 'user', userId: 'U1' },
      ...extra,
    });
    const result = gateway.parseEvents(
      JSON.stringify({
        events: [
          follow({ webhookEventId: 'a' }),
          follow({}),
          follow({ webhookEventId: '' }),
          follow({ webhookEventId: 7 }),
          null,
          'text',
          follow({ webhookEventId: 'b' }),
        ],
      }),
    );
    expect(result.ok && result.value.map((e) => [e.webhookEventId, e.kind])).toEqual([
      ['a', 'follow'],
      ['b', 'follow'],
    ]);
    expect(gateway.parseEvents(JSON.stringify({ events: [{ type: 'follow' }] }))).toEqual({
      ok: true,
      value: [],
    });
  });

  it('keeps an event with an id but no timestamp as unsupported', () => {
    const gateway = new FakeMessagingGateway();
    const result = gateway.parseEvents(
      JSON.stringify({ events: [{ type: 'follow', webhookEventId: 'e1' }] }),
    );
    expect(result.ok && result.value).toEqual([
      {
        kind: 'unsupported',
        webhookEventId: 'e1',
        timestamp: new Date(0),
        isRedelivery: false,
        lineType: 'follow',
      },
    ]);
  });

  it('sign produces a signature that verifySignature accepts', () => {
    const gateway = new FakeMessagingGateway({ channelSecret: 's' });
    expect(gateway.verifySignature('{}', gateway.sign('{}'), 's')).toBe(true);
  });
});
