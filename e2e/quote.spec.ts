import { createContactWithMessage, nextEventVars } from './helpers/contact';
import { uiCopy } from './helpers/copy';
import { bubbles, openChat, sendText, uniqueSuffix } from './helpers/inbox';
import { postLineWebhook } from './helpers/line-webhook';
import { stubLineRequests } from './helpers/stub';
import { testIds } from './helpers/test-ids';
import { expect, test } from './helpers/test';

// Quoted messages (webchat-inbox "ห้องแชท" 6, stubs-and-fixtures journey 10). Projects `desktop`
// and `mobile`.

test('journey 10: a LINE reply that quotes a message shows the quoted block', async ({
  page,
  request,
}) => {
  const suffix = uniqueSuffix();
  const name = `ผู้ใช้ตอบกลับ ${suffix}`;
  const first = `ข้อความแรก ${suffix}`;
  const v = await createContactWithMessage(request, { displayName: name, text: first });
  await openChat(page, name);

  // 10.1 The admin answers with the customer's reply token; the stub answers with sentMessages.
  const answer = `คำตอบของแอดมิน ${suffix}`;
  await sendText(page, answer);
  await expect(bubbles(page, { author: 'admin', text: answer })).toHaveAttribute(
    'data-status',
    'sent',
  );
  const replies = await stubLineRequests({ endpoint: 'reply' });
  const sent = replies.find(
    (r) => (r.body as { replyToken?: string } | null)?.replyToken === v.replyToken,
  );
  const adminLineId = sent?.sentIds?.[0];
  expect(adminLineId).toBeDefined();

  // 10.2 The customer quotes the admin's message, their own first message and an unknown one.
  const quoteAdmin = `ตอบแอดมิน ${suffix}`;
  const quoteOwn = `ตอบตัวเอง ${suffix}`;
  const quoteGone = `ตอบข้อความเก่า ${suffix}`;
  for (const [text, quotedMessageId] of [
    [quoteAdmin, adminLineId ?? ''],
    [quoteOwn, v.messageId],
    [quoteGone, '999999999999999999'],
  ] as const) {
    const r = await postLineWebhook(
      request,
      'message-text-quote',
      nextEventVars(v, { text, quotedMessageId }),
    );
    expect(r.status()).toBe(200);
  }

  // 10.3 Each bubble shows its quote; a known one is a button named with "ตอบกลับ".
  const adminQuote = bubbles(page, { author: 'customer', text: quoteAdmin }).getByTestId(
    testIds.messageQuote,
  );
  await expect(adminQuote).toHaveAttribute('data-available', 'true');
  await expect(adminQuote).toHaveAccessibleName(
    uiCopy('inbox.quote.label', { name: uiCopy('inbox.message.senderYou'), text: answer }),
  );
  const ownQuote = bubbles(page, { author: 'customer', text: quoteOwn }).getByTestId(
    testIds.messageQuote,
  );
  await expect(ownQuote).toContainText(name);
  await expect(ownQuote).toContainText(first);
  const goneQuote = bubbles(page, { author: 'customer', text: quoteGone }).getByTestId(
    testIds.messageQuote,
  );
  await expect(goneQuote).toHaveAttribute('data-available', 'false');
  await expect(goneQuote).toHaveText(uiCopy('inbox.quote.unavailable'));

  // 10.4 Clicking a known quote highlights the original message.
  await adminQuote.click();
  await expect(bubbles(page, { author: 'admin', text: answer })).toHaveAttribute(
    'data-highlight',
    'true',
  );
});
