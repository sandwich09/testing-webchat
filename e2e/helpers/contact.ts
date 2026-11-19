import type { APIRequestContext } from '@playwright/test';
import { newFixtureVars, postLineWebhook, type FixtureVars } from './line-webhook';
import { stubLineProfile } from './stub';

/**
 * Registers a LINE profile in the stub, then sends `follow` and one text message from a new
 * customer. Returns the variables of the text message event, so `replyToken`, `messageId` and
 * `webhookEventId` are the ones of that message (the reply token the app answers with, and the
 * values `redelivery-duplicate` must repeat). `overrides` win over the generated values, e.g.
 * `{ replyToken: 'expired-…' }`.
 */
export async function createContactWithMessage(
  request: APIRequestContext,
  input: { displayName: string; text: string; overrides?: Partial<FixtureVars> },
): Promise<FixtureVars> {
  const vars = newFixtureVars({ ...input.overrides, text: input.text });
  await stubLineProfile({ userId: vars.userId, displayName: input.displayName });

  // The follow event needs its own webhookEventId and reply token.
  const followVars: FixtureVars = {
    ...vars,
    webhookEventId: vars.webhookEventId2,
    replyToken: newFixtureVars().replyToken,
  };
  const follow = await postLineWebhook(request, 'follow', followVars);
  if (!follow.ok()) throw new Error(`Follow webhook failed with status ${String(follow.status())}`);

  const text = await postLineWebhook(request, 'message-text', vars);
  if (!text.ok()) throw new Error(`Text webhook failed with status ${String(text.status())}`);

  return vars;
}

/** Fresh event ids, message ids and reply token for another event of the same customer. */
export function nextEventVars(of: FixtureVars, overrides: Partial<FixtureVars> = {}): FixtureVars {
  return newFixtureVars({ userId: of.userId, ...overrides });
}
