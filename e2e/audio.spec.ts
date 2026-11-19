import { createContactWithMessage, nextEventVars } from './helpers/contact';
import { uiCopy } from './helpers/copy';
import { bubbles, openChat, row, uniqueSuffix } from './helpers/inbox';
import { postLineWebhook } from './helpers/line-webhook';
import { testIds } from './helpers/test-ids';
import { expect, test } from './helpers/test';

// Inbound audio (line-messaging "สื่อขาเข้า", stubs-and-fixtures journey 13). Projects `desktop`
// and `mobile`.

test('journey 13: a voice message from LINE is stored and plays in the thread', async ({
  page,
  request,
  isMobile,
}) => {
  const suffix = uniqueSuffix();
  const name = `ผู้ใช้เสียง ${suffix}`;
  const v = await createContactWithMessage(request, { displayName: name, text: `ทัก ${suffix}` });
  await openChat(page, name);

  // 13.1 A signed audio event; the stub serves tiny.m4a for an id that starts with "aud".
  const r = await postLineWebhook(request, 'message-audio', nextEventVars(v));
  expect(r.status()).toBe(200);

  // 13.2 The bubble gets a player once the file is stored, with the length from the event.
  const bubble = bubbles(page, { author: 'customer', type: 'audio' });
  await expect(bubble).toHaveAttribute('data-media-status', 'ready');
  const player = bubble.getByTestId(testIds.messageAudio);
  await expect(player).toBeVisible();
  const toggle = player.getByTestId(testIds.messageAudioToggle);
  await expect(toggle).toHaveAccessibleName(uiCopy('inbox.media.audioPlay'));

  // 13.3 The file loads with an audio Content-Type and nosniff, and answers a range request.
  const src = await player.locator('audio').getAttribute('src');
  expect(src).not.toBeNull();
  const file = await request.get(src ?? '');
  expect(file.status()).toBe(200);
  expect(file.headers()['content-type']).toBe('audio/mp4');
  expect(file.headers()['x-content-type-options']).toBe('nosniff');
  const part = await request.get(src ?? '', { headers: { Range: 'bytes=0-15' } });
  expect(part.status()).toBe(206);
  expect((await part.body()).length).toBe(16);

  // 13.4 Keyboard: Enter plays, Space pauses (no autoplay before).
  await expect(player).toHaveAttribute('data-playing', 'false');
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(player).toHaveAttribute('data-playing', 'true');
  await page.keyboard.press('Space');
  await expect(player).toHaveAttribute('data-playing', 'false');

  // 13.5 The list shows the voice message label.
  if (!isMobile) {
    await expect(row(page, name).getByTestId(testIds.contactRowPreview)).toContainText(
      uiCopy('inbox.media.audio'),
    );
  }
});
