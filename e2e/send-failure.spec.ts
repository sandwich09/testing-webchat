import { randomBytes } from 'node:crypto';
import { createContactWithMessage } from './helpers/contact';
import { bubbleBlock, bubbles, openChat, sendText, uniqueSuffix } from './helpers/inbox';
import {
  lineRetryKeyOf,
  stubLineDelayNext,
  stubLineFailNext,
  stubLineRequests,
} from './helpers/stub';
import { testIds } from './helpers/test-ids';
import { expect, test } from './helpers/test';

// Journey 7: a send fails and is sent again (stubs-and-fixtures section 9). Projects `desktop`
// and `mobile`.

test('journey 7: a failed send shows the error and the retry sends it with the same key', async ({
  page,
  request,
}) => {
  const suffix = uniqueSuffix();
  const name = `ลูกค้าส่งไม่สำเร็จ ${suffix}`;

  // 7.1: the reply token is refused by the stub, so every answer goes out as a push.
  const v = await createContactWithMessage(request, {
    displayName: name,
    text: `ถาม ${suffix}`,
    overrides: { replyToken: `expired-${randomBytes(16).toString('hex')}` },
  });
  await openChat(page, name);
  const pushesToCustomer = () => stubLineRequests({ endpoint: 'push', to: v.userId });

  // 7.2
  await stubLineFailNext({
    endpoint: 'push',
    match: { to: v.userId },
    status: 400,
    body: { message: 'stub failure' },
  });

  // 7.3
  const m = `ข้อความที่ส่งไม่ได้ ${suffix}`;
  await sendText(page, m);
  const failed = bubbles(page, { author: 'admin', text: m });
  await expect(failed).toHaveAttribute('data-status', 'failed');
  const block = bubbleBlock(failed);
  await expect(block.getByTestId(testIds.messageError)).toBeVisible();
  await expect(block.getByTestId(testIds.messageError)).toHaveAttribute('data-code', /^line\./);
  await expect(block.getByTestId(testIds.messageRetry)).toBeVisible();

  // 7.4: the key is the version-5 UUID derived from the message id, not the UUIDv7 id itself.
  const firstTry = await pushesToCustomer();
  expect(firstTry).toHaveLength(1);
  const k = firstTry[0]?.headers.xLineRetryKey;
  const messageId = await failed.getAttribute('data-message-id');
  expect(messageId).toBeTruthy();
  expect(k).toBe(lineRetryKeyOf(messageId ?? ''));
  expect(k).not.toBe(messageId);
  expect(k).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);

  // 7.5: hold the retried push so the pending state is visible for sure.
  await stubLineDelayNext({ endpoint: 'push', match: { to: v.userId }, ms: 1500 });
  await block.getByTestId(testIds.messageRetry).click();
  await expect(failed).toHaveAttribute('data-status', 'pending');
  await expect(failed).toHaveAttribute('data-status', 'sent');

  // 7.6
  const afterRetry = await pushesToCustomer();
  expect(afterRetry).toHaveLength(2);
  expect(afterRetry.map((r) => r.headers.xLineRetryKey)).toEqual([k, k]);

  // 7.7: 409 for a retry key LINE already accepted counts as sent.
  await stubLineFailNext({
    endpoint: 'push',
    match: { to: v.userId },
    status: 409,
    headers: { 'x-line-accepted-request-id': 'stub-req-1' },
  });
  const accepted = `ข้อความซ้ำ ${suffix}`;
  await sendText(page, accepted);
  await expect(bubbles(page, { author: 'admin', text: accepted })).toHaveAttribute(
    'data-status',
    'sent',
  );

  // 7.8: 429 on every attempt; the app retries LINE_MAX_RETRIES times, then gives up.
  await stubLineFailNext({ endpoint: 'push', match: { to: v.userId }, status: 429, times: 5 });
  const limited = `ข้อความถี่เกิน ${suffix}`;
  await sendText(page, limited);
  const limitedBubble = bubbles(page, { author: 'admin', text: limited });
  await expect(limitedBubble).toHaveAttribute('data-status', 'failed');
  await expect(bubbleBlock(limitedBubble).getByTestId(testIds.messageError)).toHaveAttribute(
    'data-code',
    'line.rate_limited',
  );

  // 7.9
  await page.reload();
  await expect(limitedBubble).toHaveAttribute('data-status', 'failed');
  await expect(bubbleBlock(limitedBubble).getByTestId(testIds.messageRetry)).toBeVisible();
});
