// Unit test of the fixture helpers. It does not need the app or the stub. The name is `.unit.ts`
// because `*.spec.ts` under e2e/ is collected by Playwright, and the root vitest config only
// includes src/**. Run it with:  pnpm vitest run --config <config that includes this file>
import { createHmac } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { STUB_CHANNEL_SECRET } from '../fixtures/line/credentials';
import { newFixtureVars, renderFixture, signLineBody, type FixtureVars } from './line-webhook';
import { deepFreeze } from '../../test-support/deep-freeze';

const FIXTURE_DIR = fileURLToPath(new URL('../fixtures/line/', import.meta.url));
const TEMPLATES = readdirSync(FIXTURE_DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace(/\.json$/, ''));

type Event = {
  type: string;
  timestamp: number;
  webhookEventId: string;
  replyToken?: string;
  source: { type: string; userId: string };
  deliveryContext: { isRedelivery: boolean };
  message?: Record<string, unknown>;
};
type Body = { destination: string; events: Event[] };

const vars: FixtureVars = deepFreeze(newFixtureVars({ text: 'สวัสดี "ค่ะ"\n{{userId}}' }));
const render = (name: string, v: FixtureVars = vars) => JSON.parse(renderFixture(name, v)) as Body;

describe('fixture catalogue', () => {
  it('has every file of stubs-and-fixtures 7.2', () => {
    expect([...TEMPLATES].sort()).toEqual(
      [
        'batch-with-malformed',
        'burst-three-texts',
        'follow',
        'message-audio',
        'message-file',
        'message-image',
        'message-image-gone',
        'message-image-too-large',
        'message-location',
        'message-sticker',
        'message-text',
        'message-video',
        'redelivery-duplicate',
        'unfollow',
        'unknown-type',
      ].sort(),
    );
  });

  it.each(TEMPLATES)('renders %s as valid JSON with no placeholder left', (name) => {
    const plain = { ...vars, text: 'plain' };
    const raw = renderFixture(name, plain);
    expect(raw).not.toContain('{{');
    const body = JSON.parse(raw) as Body;
    expect(body.destination).toBe('Ustub00000000000000000000000000000');
    expect(body.events.length).toBeGreaterThan(0);
    for (const event of body.events) {
      expect(event.source.userId).toBe(vars.userId);
      expect(typeof event.timestamp).toBe('number');
    }
  });

  it('accepts the name with the .json extension', () => {
    expect(renderFixture('follow.json', vars)).toBe(renderFixture('follow', vars));
  });

  it('rejects names with a path', () => {
    expect(() => renderFixture('../x', vars)).toThrow();
  });
});

describe('renderFixture', () => {
  it('escapes the text as a JSON string and does not expand placeholders inside it', () => {
    const event = render('message-text').events[0];
    expect(event?.message?.text).toBe('สวัสดี "ค่ะ"\n{{userId}}');
    expect(event?.message?.id).toBe(vars.messageId);
    expect(event?.timestamp).toBe(vars.timestamp);
    expect(event?.replyToken).toBe(vars.replyToken);
  });

  it('prefixes media message ids', () => {
    expect(render('message-image').events[0]?.message?.id).toBe(`img${vars.messageId}`);
    expect(render('message-video').events[0]?.message?.id).toBe(`vid${vars.messageId}`);
    expect(render('message-image-too-large').events[0]?.message?.id).toBe(
      `bigimg${vars.messageId}`,
    );
    expect(render('message-image-gone').events[0]?.message?.id).toBe(`gone${vars.messageId}`);
  });

  it('follows the shapes of section 7.3', () => {
    expect(render('follow').events[0]).toMatchObject({
      type: 'follow',
      replyToken: vars.replyToken,
    });
    const unfollow = render('unfollow').events[0];
    expect(unfollow?.type).toBe('unfollow');
    expect(unfollow).not.toHaveProperty('replyToken');
    expect(unfollow).not.toHaveProperty('follow');
    expect(render('unknown-type').events[0]?.type).toBe('futureEventType');
    expect(render('message-sticker').events[0]?.message).toMatchObject({
      type: 'sticker',
      packageId: '446',
      stickerId: '1988',
    });
  });

  it('redelivery-duplicate differs from message-text only in isRedelivery', () => {
    const original = render('message-text').events[0];
    const redelivery = render('redelivery-duplicate').events[0];
    expect(original?.deliveryContext.isRedelivery).toBe(false);
    expect(redelivery?.deliveryContext.isRedelivery).toBe(true);
    expect({ ...redelivery, deliveryContext: undefined }).toEqual({
      ...original,
      deliveryContext: undefined,
    });
  });

  it('batch-with-malformed has a text, a text without message.id and a sticker', () => {
    const [first, second, third] = render('batch-with-malformed').events;
    expect(first?.message?.id).toBe(vars.messageId);
    expect(second?.message).not.toHaveProperty('id');
    expect(second?.message?.type).toBe('text');
    expect(second?.webhookEventId).toBe(vars.webhookEventId2);
    expect(third?.message).toMatchObject({ type: 'sticker', id: vars.messageId2 });
    expect(third?.webhookEventId).toBe(vars.webhookEventId3);
  });

  it('burst-three-texts has three texts 300 ms apart from one customer', () => {
    const events = render('burst-three-texts').events;
    expect(events.map((e) => e.timestamp)).toEqual([
      vars.timestamp,
      vars.timestamp + 300,
      vars.timestamp + 600,
    ]);
    expect(new Set(events.map((e) => e.webhookEventId)).size).toBe(3);
    expect(new Set(events.map((e) => e.message?.id)).size).toBe(3);
    expect(events.every((e) => e.message?.type === 'text')).toBe(true);
    expect(events.map((e) => e.message?.text)).toEqual([
      vars.text,
      `${vars.text ?? ''} 2`,
      `${vars.text ?? ''} 3`,
    ]);
  });

  it('throws on an unknown placeholder or a missing file', () => {
    expect(() => renderFixture('does-not-exist', vars)).toThrow();
  });
});

describe('newFixtureVars', () => {
  it('generates unique values in the documented formats', () => {
    const a = newFixtureVars();
    const b = newFixtureVars();
    expect(a.userId).toMatch(/^U[0-9a-f]{32}$/);
    expect(a.messageId).toMatch(/^[1-9][0-9]{17}$/);
    expect(a.messageId2).toMatch(/^[1-9][0-9]{17}$/);
    expect(a.replyToken).toMatch(/^[0-9a-f]{32}$/);
    expect(a.webhookEventId).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(a.userId).not.toBe(b.userId);
    expect(a.messageId).not.toBe(b.messageId);
    expect(a.webhookEventId).not.toBe(a.webhookEventId2);
  });

  it('lets overrides win', () => {
    expect(newFixtureVars({ userId: 'Ux', timestamp: 5 })).toMatchObject({
      userId: 'Ux',
      timestamp: 5,
    });
  });
});

describe('signLineBody', () => {
  it('matches a HMAC-SHA256 computed with node:crypto', () => {
    const body = renderFixture('message-text', vars);
    const expected = createHmac('sha256', STUB_CHANNEL_SECRET).update(body).digest('base64');
    expect(signLineBody(body, STUB_CHANNEL_SECRET)).toBe(expected);
  });

  it('matches a known HMAC-SHA256 vector (RFC 4231 test case 2)', () => {
    // key "Jefe", data "what do ya want for nothing?"
    expect(signLineBody('what do ya want for nothing?', 'Jefe')).toBe(
      Buffer.from(
        '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843',
        'hex',
      ).toString('base64'),
    );
  });

  it('signs the exact bytes: one changed byte changes the signature', () => {
    const body = renderFixture('message-text', vars);
    expect(signLineBody(body + ' ', 'k')).not.toBe(signLineBody(body, 'k'));
  });
});
