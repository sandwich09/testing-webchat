import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { LineAccessToken, LineMessageId, LineUserId, OutboundLinePart } from '@/core/domain';
import type { MessagingGateway } from '@/core/ports';

/**
 * What the suite needs besides the port itself. The fake builds it from its own controls; the
 * real adapter builds it by seeding the LINE stub (stubs-and-fixtures section 4).
 */
export interface MessagingGatewayHarness {
  gateway: MessagingGateway;
  /** Secret the subject verifies with. Only `verifySignature` takes it as an argument. */
  channelSecret: string;
  validToken: LineAccessToken;
  /** A token LINE answers 401 to. */
  invalidToken: LineAccessToken;
  /** A user whose profile exists. */
  knownUserId: LineUserId;
  /** A user whose profile LINE answers 404 to. */
  unknownUserId: LineUserId;
  /** A reply token LINE accepts exactly once. Each call returns a new one. */
  freshReplyToken(): Promise<string>;
  /** A reply token LINE rejects as invalid or expired. */
  invalidReplyToken: string;
  /**
   * Makes LINE hold this content. `knownSize: false` serves it without Content-Length.
   * `notReadyTimes`: that many "not ready" answers first (a download of the original answers 202,
   * a status call says processing), each using one.
   */
  seedContent(content: {
    lineMessageId: LineMessageId;
    original: Uint8Array;
    preview?: Uint8Array;
    contentType: string;
    knownSize: boolean;
    notReadyTimes?: number;
  }): Promise<void>;
  /** A message id for which LINE holds no content. */
  missingMessageId: LineMessageId;
  /** Makes LINE answer every later push with its monthly quota error. Applies to this harness only. */
  exhaustPushQuota(): Promise<void>;
  /** How many pushes to this user LINE actually delivered. */
  deliveredPushCount(to: LineUserId): Promise<number>;
  /** A Channel ID whose channel secret is `channelSecret`. */
  channelId: string;
  /** Makes LINE's next secret check fail with a 5xx, for this harness's Channel ID only. */
  failNextSecretCheck(): Promise<void>;
}

const text = (value: string): OutboundLinePart[] => [{ type: 'text', text: value }];

const sign = (body: string, secret: string): string =>
  createHmac('sha256', secret).update(body, 'utf8').digest('base64');

const readAll = async (stream: ReadableStream<Uint8Array>): Promise<Uint8Array> => {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
};

const event = (extra: Record<string, unknown>): Record<string, unknown> => ({
  webhookEventId: 'evt-1',
  timestamp: 1_700_000_000_000,
  mode: 'active',
  deliveryContext: { isRedelivery: false },
  source: { type: 'user', userId: 'U1' },
  ...extra,
});

const body = (...events: unknown[]): string => JSON.stringify({ destination: 'Ubot', events });

let counter = 0;
const uniqueId = (prefix: string): string => `${prefix}-${String(++counter)}-${String(Date.now())}`;

/** Runs every row of the MessagingGateway table in domain-and-ports against the subject. */
export const describeMessagingGatewaySuite = (
  makeHarness: () => MessagingGatewayHarness | Promise<MessagingGatewayHarness>,
): void => {
  describe('MessagingGateway', () => {
    describe('verifySignature', () => {
      it('accepts the HMAC-SHA256 base64 of the raw body', async () => {
        const h = await makeHarness();
        const raw = body();
        expect(h.gateway.verifySignature(raw, sign(raw, h.channelSecret), h.channelSecret)).toBe(
          true,
        );
      });

      it('uses the raw body byte for byte, without parsing it first', async () => {
        const h = await makeHarness();
        const raw = '{ "events" :[ ] }';
        expect(h.gateway.verifySignature(raw, sign(raw, h.channelSecret), h.channelSecret)).toBe(
          true,
        );
        const reformatted = JSON.stringify(JSON.parse(raw));
        expect(
          h.gateway.verifySignature(reformatted, sign(raw, h.channelSecret), h.channelSecret),
        ).toBe(false);
      });

      it('rejects a signature made with another secret', async () => {
        const h = await makeHarness();
        const raw = body();
        expect(h.gateway.verifySignature(raw, sign(raw, 'other-secret'), h.channelSecret)).toBe(
          false,
        );
      });

      it('rejects a body that was changed after signing', async () => {
        const h = await makeHarness();
        const signature = sign(body(), h.channelSecret);
        expect(h.gateway.verifySignature(body(event({})), signature, h.channelSecret)).toBe(false);
      });

      it.each(['', '!!!not base64!!!', 'abc', '=', 'AAAA'])(
        'returns false without throwing for the malformed signature %j',
        async (signature) => {
          const h = await makeHarness();
          expect(h.gateway.verifySignature(body(), signature, h.channelSecret)).toBe(false);
        },
      );
    });

    describe('parseEvents', () => {
      it('returns an empty list for an empty events array (the LINE Verify button)', async () => {
        const h = await makeHarness();
        expect(h.gateway.parseEvents(body())).toEqual({ ok: true, value: [] });
      });

      it.each([
        ['text that is not JSON', 'not json'],
        ['an empty body', ''],
        ['a JSON array', '[]'],
        ['an object without events', '{"destination":"Ubot"}'],
        ['events that is not an array', '{"events":{}}'],
      ])('returns webhook.payload_invalid for %s', async (_name, raw) => {
        const h = await makeHarness();
        const result = h.gateway.parseEvents(raw);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.code).toBe('webhook.payload_invalid');
      });

      it('translates a text message', async () => {
        const h = await makeHarness();
        const result = h.gateway.parseEvents(
          body(
            event({
              type: 'message',
              replyToken: 'rt-1',
              message: { id: 'm1', type: 'text', text: 'สวัสดี' },
            }),
          ),
        );
        expect(result).toEqual({
          ok: true,
          value: [
            {
              kind: 'message',
              webhookEventId: 'evt-1',
              timestamp: new Date(1_700_000_000_000),
              isRedelivery: false,
              userId: 'U1',
              replyToken: 'rt-1',
              message: { type: 'text', lineMessageId: 'm1', text: 'สวัสดี' },
            },
          ],
        });
      });

      it('marks image and video as hosted by LINE only for the line content provider', async () => {
        const h = await makeHarness();
        const result = h.gateway.parseEvents(
          body(
            event({
              type: 'message',
              webhookEventId: 'e1',
              message: { id: 'm1', type: 'image', contentProvider: { type: 'line' } },
            }),
            event({
              type: 'message',
              webhookEventId: 'e2',
              message: {
                id: 'm2',
                type: 'video',
                contentProvider: { type: 'external', originalContentUrl: 'https://x.test/v.mp4' },
              },
            }),
          ),
        );
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value.map((e) => (e.kind === 'message' ? e.message : null))).toEqual([
          { type: 'image', lineMessageId: 'm1', hostedByLine: true },
          { type: 'video', lineMessageId: 'm2', hostedByLine: false },
        ]);
      });

      it('translates stickers and the other message kinds', async () => {
        const h = await makeHarness();
        const message = (id: string, extra: Record<string, unknown>): unknown =>
          event({ type: 'message', webhookEventId: id, message: { id, ...extra } });
        const result = h.gateway.parseEvents(
          body(
            message('s1', { type: 'sticker', packageId: '11537', stickerId: '52002734' }),
            message('a1', { type: 'audio' }),
            message('f1', { type: 'file' }),
            message('l1', { type: 'location' }),
            message('u1', { type: 'somethingNew' }),
          ),
        );
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value.map((e) => (e.kind === 'message' ? e.message : null))).toEqual([
          { type: 'sticker', lineMessageId: 's1', packageId: '11537', stickerId: '52002734' },
          { type: 'other', lineMessageId: 'a1', otherKind: 'audio' },
          { type: 'other', lineMessageId: 'f1', otherKind: 'file' },
          { type: 'other', lineMessageId: 'l1', otherKind: 'location' },
          { type: 'other', lineMessageId: 'u1', otherKind: 'unknown' },
        ]);
      });

      it('translates follow and unfollow', async () => {
        const h = await makeHarness();
        const result = h.gateway.parseEvents(
          body(
            event({ type: 'follow', webhookEventId: 'e1', replyToken: 'rt-f' }),
            event({ type: 'unfollow', webhookEventId: 'e2' }),
          ),
        );
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value.map((e) => e.kind)).toEqual(['follow', 'unfollow']);
        expect(result.value[0]).toMatchObject({ userId: 'U1', replyToken: 'rt-f' });
        expect(result.value[1]).toMatchObject({ userId: 'U1' });
      });

      it('reports redelivery', async () => {
        const h = await makeHarness();
        const result = h.gateway.parseEvents(
          body(event({ type: 'follow', deliveryContext: { isRedelivery: true } })),
        );
        expect(result.ok && result.value[0]?.isRedelivery).toBe(true);
      });

      it('turns events outside a one-to-one chat and unknown types into unsupported', async () => {
        const h = await makeHarness();
        const result = h.gateway.parseEvents(
          body(
            event({
              type: 'message',
              webhookEventId: 'g1',
              source: { type: 'group', groupId: 'G1', userId: 'U1' },
              message: { id: 'm1', type: 'text', text: 'hi' },
            }),
            event({ type: 'postback', webhookEventId: 'p1' }),
          ),
        );
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value).toMatchObject([
          { kind: 'unsupported', webhookEventId: 'g1', lineType: 'message' },
          { kind: 'unsupported', webhookEventId: 'p1', lineType: 'postback' },
        ]);
      });

      it('turns a malformed event into unsupported without failing the whole body, keeping order', async () => {
        const h = await makeHarness();
        const good = (id: string): unknown =>
          event({ type: 'message', webhookEventId: id, message: { id, type: 'text', text: 'ok' } });
        const result = h.gateway.parseEvents(
          body(
            good('e1'),
            event({ type: 'message', webhookEventId: 'e2', message: { type: 'text' } }),
            event({ type: 'message', webhookEventId: 'e3', message: { id: 'm3', type: 'text' } }),
            good('e4'),
          ),
        );
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value.map((e) => [e.webhookEventId, e.kind])).toEqual([
          ['e1', 'message'],
          ['e2', 'unsupported'],
          ['e3', 'unsupported'],
          ['e4', 'message'],
        ]);
      });
    });

    describe('reply', () => {
      it('sends every part in one request', async () => {
        const h = await makeHarness();
        const parts: OutboundLinePart[] = [
          { type: 'text', text: 'หนึ่ง' },
          { type: 'text', text: 'สอง' },
          { type: 'text', text: 'สาม' },
        ];
        const result = await h.gateway.reply(h.validToken, await h.freshReplyToken(), parts);
        expect(result.ok).toBe(true);
      });

      it('returns line.reply_token_invalid for a token LINE rejects', async () => {
        const h = await makeHarness();
        const result = await h.gateway.reply(h.validToken, h.invalidReplyToken, text('hi'));
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.code).toBe('line.reply_token_invalid');
      });

      it('returns line.reply_token_invalid when the same token is used twice', async () => {
        const h = await makeHarness();
        const token = await h.freshReplyToken();
        expect((await h.gateway.reply(h.validToken, token, text('one'))).ok).toBe(true);
        const second = await h.gateway.reply(h.validToken, token, text('two'));
        expect(second.ok).toBe(false);
        if (!second.ok) expect(second.error.code).toBe('line.reply_token_invalid');
      });

      it('returns line.reply_failed, not reply_token_invalid, for a request LINE finds malformed', async () => {
        const h = await makeHarness();
        const result = await h.gateway.reply(h.validToken, await h.freshReplyToken(), []);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.code).toBe('line.reply_failed');
      });

      it('returns line.unauthorized for an invalid access token', async () => {
        const h = await makeHarness();
        const result = await h.gateway.reply(h.invalidToken, await h.freshReplyToken(), text('hi'));
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.code).toBe('line.unauthorized');
      });
    });

    describe('push', () => {
      it('delivers and reports alreadyAccepted false the first time', async () => {
        const h = await makeHarness();
        const result = await h.gateway.push(
          h.validToken,
          h.knownUserId,
          text('hi'),
          uniqueId('rk'),
        );
        expect(result).toEqual({ ok: true, value: { alreadyAccepted: false } });
      });

      it('remembers the retry key: a repeat is alreadyAccepted and not delivered again', async () => {
        const h = await makeHarness();
        const key = uniqueId('rk');
        const before = await h.deliveredPushCount(h.knownUserId);
        const first = await h.gateway.push(h.validToken, h.knownUserId, text('hi'), key);
        const repeat = await h.gateway.push(h.validToken, h.knownUserId, text('hi'), key);
        expect(first).toEqual({ ok: true, value: { alreadyAccepted: false } });
        expect(repeat).toEqual({ ok: true, value: { alreadyAccepted: true } });
        expect(await h.deliveredPushCount(h.knownUserId)).toBe(before + 1);
      });

      it('treats a different retry key as a new request', async () => {
        const h = await makeHarness();
        await h.gateway.push(h.validToken, h.knownUserId, text('hi'), uniqueId('rk'));
        const other = await h.gateway.push(h.validToken, h.knownUserId, text('hi'), uniqueId('rk'));
        expect(other).toEqual({ ok: true, value: { alreadyAccepted: false } });
      });

      it('returns line.unauthorized for an invalid access token', async () => {
        const h = await makeHarness();
        const result = await h.gateway.push(
          h.invalidToken,
          h.knownUserId,
          text('hi'),
          uniqueId('rk'),
        );
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.code).toBe('line.unauthorized');
      });

      it('returns line.quota_exceeded, distinct from rate limiting, when the quota is used up', async () => {
        const h = await makeHarness();
        await h.exhaustPushQuota();
        const result = await h.gateway.push(
          h.validToken,
          h.knownUserId,
          text('hi'),
          uniqueId('rk'),
        );
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.code).toBe('line.quota_exceeded');
      });
    });

    describe('getProfile', () => {
      it('returns the display name and picture url', async () => {
        const h = await makeHarness();
        const result = await h.gateway.getProfile(h.validToken, h.knownUserId);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(typeof result.value.displayName).toBe('string');
        expect(result.value.displayName.length).toBeGreaterThan(0);
        expect(
          result.value.pictureUrl === null || typeof result.value.pictureUrl === 'string',
        ).toBe(true);
      });

      it('returns line.profile_unavailable for a user LINE has no profile for', async () => {
        const h = await makeHarness();
        const result = await h.gateway.getProfile(h.validToken, h.unknownUserId);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.code).toBe('line.profile_unavailable');
      });

      it('returns line.unauthorized for an invalid access token', async () => {
        const h = await makeHarness();
        const result = await h.gateway.getProfile(h.invalidToken, h.knownUserId);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.code).toBe('line.unauthorized');
      });
    });

    describe('downloadContent', () => {
      const bytes = Uint8Array.from({ length: 3000 }, (_, i) => i % 251);

      it('streams the original with its content type and size', async () => {
        const h = await makeHarness();
        const id = uniqueId('img') as LineMessageId;
        await h.seedContent({
          lineMessageId: id,
          original: bytes,
          contentType: 'image/jpeg',
          knownSize: true,
        });
        const result = await h.gateway.downloadContent(h.validToken, id, 'original', 10_000);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value.contentType).toBe('image/jpeg');
        expect(result.value.sizeBytes).toBe(bytes.length);
        expect(await readAll(result.value.stream)).toEqual(bytes);
      });

      it('serves the preview variant separately', async () => {
        const h = await makeHarness();
        const id = uniqueId('vid') as LineMessageId;
        const preview = Uint8Array.from([1, 2, 3, 4]);
        await h.seedContent({
          lineMessageId: id,
          original: bytes,
          preview,
          contentType: 'video/mp4',
          knownSize: true,
        });
        const result = await h.gateway.downloadContent(h.validToken, id, 'preview', 10_000);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(await readAll(result.value.stream)).toEqual(preview);
      });

      it('returns media.too_large when the known size exceeds maxBytes', async () => {
        const h = await makeHarness();
        const id = uniqueId('big') as LineMessageId;
        await h.seedContent({
          lineMessageId: id,
          original: bytes,
          contentType: 'image/png',
          knownSize: true,
        });
        const result = await h.gateway.downloadContent(
          h.validToken,
          id,
          'original',
          bytes.length - 1,
        );
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.code).toBe('media.too_large');
      });

      it('errors the stream with code media.too_large when an unsized body is read past maxBytes', async () => {
        const h = await makeHarness();
        const id = uniqueId('chunked') as LineMessageId;
        await h.seedContent({
          lineMessageId: id,
          original: bytes,
          contentType: 'image/png',
          knownSize: false,
        });
        const result = await h.gateway.downloadContent(h.validToken, id, 'original', 1000);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value.sizeBytes).toBeNull();
        // StoreInboundMedia labels the message too_large only on this code.
        await expect(readAll(result.value.stream)).rejects.toMatchObject({
          code: 'media.too_large',
        });
      });

      it('reads an unsized body that fits within maxBytes', async () => {
        const h = await makeHarness();
        const id = uniqueId('chunked-ok') as LineMessageId;
        await h.seedContent({
          lineMessageId: id,
          original: bytes,
          contentType: 'image/png',
          knownSize: false,
        });
        const result = await h.gateway.downloadContent(h.validToken, id, 'original', 10_000);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(await readAll(result.value.stream)).toEqual(bytes);
      });

      it('returns line.content_not_ready while LINE prepares the content, then streams it', async () => {
        const h = await makeHarness();
        const id = uniqueId('vidwait') as LineMessageId;
        await h.seedContent({
          lineMessageId: id,
          original: bytes,
          contentType: 'video/mp4',
          knownSize: true,
          notReadyTimes: 2,
        });
        const first = await h.gateway.downloadContent(h.validToken, id, 'original', 10_000);
        expect(first.ok).toBe(false);
        if (!first.ok) expect(first.error.code).toBe('line.content_not_ready');
        expect(await h.gateway.getContentStatus(h.validToken, id)).toEqual({
          ok: true,
          value: 'processing',
        });
        expect(await h.gateway.getContentStatus(h.validToken, id)).toEqual({
          ok: true,
          value: 'succeeded',
        });
        const ready = await h.gateway.downloadContent(h.validToken, id, 'original', 10_000);
        expect(ready.ok).toBe(true);
        if (ready.ok) expect(await readAll(ready.value.stream)).toEqual(bytes);
      });

      it('returns line.content_unavailable when LINE holds no such content', async () => {
        const h = await makeHarness();
        const result = await h.gateway.downloadContent(
          h.validToken,
          h.missingMessageId,
          'original',
          10_000,
        );
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.code).toBe('line.content_unavailable');
      });

      it('returns line.unauthorized for an invalid access token', async () => {
        const h = await makeHarness();
        const result = await h.gateway.downloadContent(
          h.invalidToken,
          h.missingMessageId,
          'original',
          10_000,
        );
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.code).toBe('line.unauthorized');
      });
    });

    describe('getContentStatus', () => {
      it('says succeeded for content that is ready', async () => {
        const h = await makeHarness();
        const id = uniqueId('imgready') as LineMessageId;
        await h.seedContent({
          lineMessageId: id,
          original: Uint8Array.from([1, 2, 3]),
          contentType: 'image/jpeg',
          knownSize: true,
        });
        expect(await h.gateway.getContentStatus(h.validToken, id)).toEqual({
          ok: true,
          value: 'succeeded',
        });
      });

      it('returns line.unauthorized for an invalid access token', async () => {
        const h = await makeHarness();
        const result = await h.gateway.getContentStatus(h.invalidToken, h.missingMessageId);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.code).toBe('line.unauthorized');
      });
    });

    describe('verifyChannelSecret', () => {
      it('accepts the channel secret of the Channel ID', async () => {
        const h = await makeHarness();
        expect(await h.gateway.verifyChannelSecret(h.channelId, h.channelSecret)).toEqual({
          ok: true,
          value: undefined,
        });
      });

      it('returns line.channel_secret_invalid for another secret or another Channel ID', async () => {
        const h = await makeHarness();
        for (const [id, secret] of [
          [h.channelId, `${h.channelSecret}-other`],
          ['9999999999', h.channelSecret],
        ] as const) {
          const result = await h.gateway.verifyChannelSecret(id, secret);
          expect(result.ok).toBe(false);
          if (!result.ok) expect(result.error.code).toBe('line.channel_secret_invalid');
        }
      });

      it('returns line.unavailable when LINE cannot check, never line.channel_secret_invalid', async () => {
        const h = await makeHarness();
        await h.failNextSecretCheck();
        const result = await h.gateway.verifyChannelSecret(h.channelId, h.channelSecret);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.code).toBe('line.unavailable');
      });

      it('never puts the secret in an error detail', async () => {
        const h = await makeHarness();
        const result = await h.gateway.verifyChannelSecret(
          h.channelId,
          'secret-that-must-not-leak',
        );
        expect(JSON.stringify(result)).not.toContain('secret-that-must-not-leak');
      });
    });

    describe('showLoading', () => {
      it('accepts a valid number of seconds', async () => {
        const h = await makeHarness();
        expect((await h.gateway.showLoading(h.validToken, h.knownUserId, 20)).ok).toBe(true);
      });

      it('returns line.loading_failed for seconds LINE does not accept', async () => {
        const h = await makeHarness();
        const result = await h.gateway.showLoading(h.validToken, h.knownUserId, 7);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.code).toBe('line.loading_failed');
      });

      it('returns line.unauthorized for an invalid access token', async () => {
        const h = await makeHarness();
        const result = await h.gateway.showLoading(h.invalidToken, h.knownUserId, 20);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.code).toBe('line.unauthorized');
      });
    });

    describe('getBotInfo', () => {
      it('returns the bot name and basic id', async () => {
        const h = await makeHarness();
        const result = await h.gateway.getBotInfo(h.validToken);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value.botName.length).toBeGreaterThan(0);
        expect(result.value.basicId.length).toBeGreaterThan(0);
      });

      it('returns line.credentials_invalid for an invalid access token', async () => {
        const h = await makeHarness();
        const result = await h.gateway.getBotInfo(h.invalidToken);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.code).toBe('line.credentials_invalid');
      });
    });
  });
};
