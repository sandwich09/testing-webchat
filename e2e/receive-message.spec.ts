import { expectNoA11yViolations } from './helpers/axe';
import { nextEventVars } from './helpers/contact';
import { uiCopy } from './helpers/copy';
import { backToList, bubbles, openChat, row, uniqueSuffix } from './helpers/inbox';
import { newFixtureVars, postLineWebhook } from './helpers/line-webhook';
import { stubLineProfile } from './helpers/stub';
import { testIds } from './helpers/test-ids';
import { expect, test } from './helpers/test';

// Journey 1: receive a message (stubs-and-fixtures section 9). Projects `desktop` and `mobile`.

test('journey 1: a new customer and their messages show up in the inbox', async ({
  page,
  request,
  isMobile,
}) => {
  const suffix = uniqueSuffix();
  const name = `ผู้ใช้ทดสอบ ${suffix}`;
  const firstText = `สวัสดี ${suffix}`;

  // 1.1 (the shared login state of global.setup.ts is the loginByApi of this step)
  const v = newFixtureVars();
  await stubLineProfile({ userId: v.userId, displayName: name });

  // 1.2
  const follow = await postLineWebhook(request, 'follow', nextEventVars(v));
  expect(follow.status()).toBe(200);

  // 1.3
  const message = { ...v, text: firstText };
  expect((await postLineWebhook(request, 'message-text', message)).status()).toBe(200);

  // 1.4
  await page.goto('/chats');
  const contactRow = row(page, name);
  await expect(contactRow).toBeVisible();
  await expect(contactRow.getByTestId(testIds.contactRowPreview)).toContainText(firstText);
  await expect(
    contactRow.getByTestId(testIds.contactRowUnread).locator('[aria-hidden="true"]'),
  ).toHaveText('1');
  await expect(contactRow).toHaveAttribute('data-unread', 'true');
  await expect(page.getByTestId(testIds.navInboxUnread)).toBeVisible();

  // 1.5
  const markedRead = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      /\/api\/contacts\/[^/]+\/read$/.test(new URL(response.url()).pathname),
  );
  await openChat(page, name);
  await expect(bubbles(page, { author: 'customer', text: firstText })).toHaveCount(1);

  // 1.6: the open chat marks the contact read after MARK_READ_DELAY_MS; stay until it has.
  expect((await markedRead).status()).toBe(200);
  await backToList(page, isMobile);
  await expect(contactRow).toHaveAttribute('data-unread', 'false');

  // 1.7: the redelivery repeats the same event and is stored once.
  if (isMobile) await openChat(page, name);
  const redelivery = await postLineWebhook(request, 'redelivery-duplicate', message);
  expect(redelivery.status()).toBe(200);
  const newText = `ข้อความใหม่ ${suffix}`;
  const fresh = await postLineWebhook(request, 'message-text', nextEventVars(v, { text: newText }));
  expect(fresh.status()).toBe(200);
  await expect(bubbles(page, { author: 'customer', text: newText })).toHaveCount(1);
  await expect(bubbles(page, { author: 'customer', text: firstText })).toHaveCount(1);

  // 1.8: the event without message.id is skipped; the text and the sticker are kept.
  const batchText = `ชุดข้อความ ${suffix}`;
  const batch = await postLineWebhook(
    request,
    'batch-with-malformed',
    nextEventVars(v, { text: batchText }),
  );
  expect(batch.status()).toBe(200);
  await expect(bubbles(page, { author: 'customer', text: batchText })).toHaveCount(1);
  const sticker = bubbles(page, { type: 'sticker' });
  await expect(sticker).toHaveCount(1);
  await expect(sticker.locator('img')).toBeVisible();

  // 1.9: an unknown event type is answered 200 and changes nothing in the list.
  const strangerName = `ไม่ควรขึ้น ${suffix}`;
  const stranger = newFixtureVars();
  await stubLineProfile({ userId: stranger.userId, displayName: strangerName });
  expect((await postLineWebhook(request, 'unknown-type', nextEventVars(v))).status()).toBe(200);
  expect((await postLineWebhook(request, 'unknown-type', stranger)).status()).toBe(200);
  const search = await request.get(`/api/contacts?q=${encodeURIComponent(strangerName)}`);
  expect(search.status()).toBe(200);
  expect(((await search.json()) as { contacts: unknown[] }).contacts).toEqual([]);
  const own = await request.get(`/api/contacts?q=${encodeURIComponent(name)}`);
  expect(((await own.json()) as { contacts: unknown[] }).contacts).toHaveLength(1);

  // 1.10
  const forged = await postLineWebhook(request, 'message-text', nextEventVars(v), {
    signature: 'invalid',
  });
  expect(forged.status()).toBe(401);

  // 1.11
  const image = await postLineWebhook(request, 'message-image', nextEventVars(v));
  expect(image.status()).toBe(200);
  const ready = bubbles(page, { type: 'image' }).and(page.locator('[data-media-status="ready"]'));
  await expect(ready).toHaveCount(1);
  await expect(ready.locator('img')).toBeVisible();

  // 1.12
  const gone = await postLineWebhook(request, 'message-image-gone', nextEventVars(v));
  expect(gone.status()).toBe(200);
  const failed = bubbles(page, { type: 'image' }).and(page.locator('[data-media-status="failed"]'));
  await expect(failed).toHaveCount(1);
  // The bubble names why: LINE no longer has the content, so the download failed.
  await expect(failed).toContainText(uiCopy('inbox.media.problem.download_failed'));
  await expect(failed.locator('[data-failure="download_failed"]')).toHaveCount(1);

  // 1.13
  await expectNoA11yViolations(page);
});

// LINE serves profile pictures from two hosts; both must pass the CSP `img-src` (pitfalls S7).
// The real hosts are never called: the test fixture (helpers/test.ts) answers them with a fixture
// image, and fails on any CSP violation.

for (const host of ['profile.line-scdn.net', 'sprofile.line-scdn.net']) {
  test(`journey 1: a profile picture on ${host} shows as the avatar`, async ({ page, request }) => {
    const suffix = uniqueSuffix();
    const name = `ผู้ใช้มีรูป ${suffix}`;
    const pictureUrl = `https://${host}/e2e-${suffix}`;
    const v = newFixtureVars({ text: `สวัสดี ${suffix}` });
    await stubLineProfile({ userId: v.userId, displayName: name, pictureUrl });
    expect((await postLineWebhook(request, 'follow', nextEventVars(v))).status()).toBe(200);
    expect((await postLineWebhook(request, 'message-text', v)).status()).toBe(200);

    await page.goto('/chats');
    const avatar = row(page, name).locator(`img[src="${pictureUrl}"]`);
    await expect(avatar).toBeVisible();
    await expect
      .poll(() => avatar.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0))
      .toBe(true);
  });
}
