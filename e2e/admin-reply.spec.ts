import { createContactWithMessage } from './helpers/contact';
import { uiCopy } from './helpers/copy';
import {
  backToList,
  bubbleBlock,
  bubbles,
  openChat,
  row,
  sendText,
  uniqueSuffix,
} from './helpers/inbox';
import { postLineWebhook } from './helpers/line-webhook';
import { stubLineDelayNext, stubLineRequests } from './helpers/stub';
import { testIds } from './helpers/test-ids';
import { expect, test } from './helpers/test';

// Journey 2: the admin replies (stubs-and-fixtures section 9). Projects `desktop` and `mobile`.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type LineBody = { replyToken?: string; to?: string; chatId?: string; messages?: unknown[] };
const bodyOf = (body: unknown): LineBody => body ?? {};

test('journey 2: the admin reply reaches LINE and shows as sent', async ({
  page,
  request,
  isMobile,
}) => {
  const suffix = uniqueSuffix();
  const name = `ลูกค้าแอดมินตอบ ${suffix}`;

  // 2.1
  const v = await createContactWithMessage(request, { displayName: name, text: `ถาม ${suffix}` });
  await openChat(page, name);
  const input = page.getByTestId(testIds.composerInput);
  await expect(input).toBeEnabled();

  // 2.2: hold the reply so the pending state is visible for sure.
  await stubLineDelayNext({ endpoint: 'reply', match: { replyToken: v.replyToken }, ms: 1500 });

  // 2.3: typing asks LINE to show the loading animation to the customer.
  const first = `ตอบจากแอดมิน ${suffix}`;
  await input.fill(first);
  await expect
    .poll(async () =>
      (await stubLineRequests({ endpoint: 'loading' })).filter(
        (r) => bodyOf(r.body).chatId === v.userId,
      ),
    )
    .toHaveLength(1);

  // 2.4
  await input.press('Enter');
  const sent = bubbles(page, { author: 'admin', text: first });
  await expect(sent).toHaveAttribute('data-status', 'pending');
  await expect(input).toHaveValue('');

  // 2.5
  await expect(sent).toHaveAttribute('data-status', 'sent');
  await expect(bubbleBlock(sent).getByTestId(testIds.messageSender)).toHaveText(
    uiCopy('inbox.message.senderYou'),
  );

  // 2.6: the first answer uses the reply token of the customer's message.
  const replies = (await stubLineRequests({ endpoint: 'reply' })).filter(
    (r) => bodyOf(r.body).replyToken === v.replyToken,
  );
  expect(replies).toHaveLength(1);
  expect(bodyOf(replies[0]?.body).messages?.[0]).toEqual({ type: 'text', text: first });

  // 2.7: the reply token is used up, so the second answer is a push with a retry key.
  const second = `ตอบครั้งที่สอง ${suffix}`;
  await sendText(page, second);
  await expect(bubbles(page, { author: 'admin', text: second })).toHaveAttribute(
    'data-status',
    'sent',
  );
  const pushes = await stubLineRequests({ endpoint: 'push', to: v.userId });
  expect(pushes).toHaveLength(1);
  expect(pushes[0]?.headers.xLineRetryKey).toMatch(UUID);
  expect(bodyOf(pushes[0]?.body).messages?.[0]).toEqual({ type: 'text', text: second });

  // 2.8
  await backToList(page, isMobile);
  await expect(row(page, name).getByTestId(testIds.contactRowPreview)).toHaveText(
    new RegExp(`^${uiCopy('inbox.preview.you')}`),
  );

  // 2.9: Shift+Enter is a new line, not a send.
  if (isMobile) await openChat(page, name);
  await input.fill('บรรทัดแรก');
  await input.press('Shift+Enter');
  await input.pressSequentially('บรรทัดสอง');
  await expect(input).toHaveValue('บรรทัดแรก\nบรรทัดสอง');
  await expect(bubbles(page, { author: 'admin' })).toHaveCount(2);

  // 2.10
  const unfollow = await postLineWebhook(request, 'unfollow', {
    ...v,
    webhookEventId: v.webhookEventId3,
  });
  expect(unfollow.status()).toBe(200);
  await expect(page.getByTestId(testIds.composerDisabledReason)).toBeVisible();
  await expect(input).toBeDisabled();
  await backToList(page, isMobile);
  await expect(row(page, name)).toHaveAttribute('data-follow', 'unfollowed');
});
