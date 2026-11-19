import { fileURLToPath } from 'node:url';
import type { Page, Request, Response } from '@playwright/test';
import { createContactWithMessage } from './helpers/contact';
import { bubbles, openChat, uniqueSuffix } from './helpers/inbox';
import { stubLineRequests, type RecordedRequest } from './helpers/stub';
import { testIds } from './helpers/test-ids';
import { expect, test } from './helpers/test';

// Journey 5: send pictures and videos (stubs-and-fixtures section 9). Projects `desktop` and
// `mobile`.

const media = (name: string) => fileURLToPath(new URL(`fixtures/media/${name}`, import.meta.url));
const MIB = 1024 * 1024;
/** Marker string inside the heic-to bundle (dist/csp/heic-to.js). */
const HEIC_TO_MARKER = 'libheif';

type LineMessage = { type?: string; originalContentUrl?: string; previewImageUrl?: string };
type LineBody = { to?: string; replyToken?: string; messages?: LineMessage[] };

const isUploadPost = (request: Request) =>
  request.method() === 'POST' && new URL(request.url()).pathname === '/api/uploads';

/** Every `POST /api/uploads` body the page sends from now on. */
function recordUploadRequests(page: Page): Array<{ contentType?: string; kind?: string }> {
  const bodies: Array<{ contentType?: string; kind?: string }> = [];
  page.on('request', (request) => {
    if (isUploadPost(request)) bodies.push(request.postDataJSON() as { contentType?: string });
  });
  return bodies;
}

/** LINE messages the stub received for this customer, by reply token or push target. */
async function lineMessagesTo(userId: string, replyToken: string): Promise<LineMessage[]> {
  const all: RecordedRequest[] = [
    ...(await stubLineRequests({ endpoint: 'reply' })),
    ...(await stubLineRequests({ endpoint: 'push', to: userId })),
  ];
  return all
    .map((r) => (r.body ?? {}) as LineBody)
    .filter((b) => b.to === userId || b.replyToken === replyToken)
    .flatMap((b) => b.messages ?? []);
}

test('journey 5: pictures and videos are checked, converted, uploaded and sent', async ({
  page,
  request,
}) => {
  const suffix = uniqueSuffix();
  const name = `ลูกค้าส่งรูป ${suffix}`;
  const tray = page.getByTestId(testIds.attachmentTray);
  const status = page.getByTestId(testIds.attachmentStatus);
  const fileInput = page.getByTestId(testIds.composerFileInput);
  const uploads = recordUploadRequests(page);

  // Chunks loaded from opening the page on; 5.11 checks heic-to is not among them.
  const scripts: Array<{ afterPick: boolean; body: Promise<string> }> = [];
  let heicPicked = false;
  page.on('response', (response: Response) => {
    if (response.request().resourceType() === 'script') {
      scripts.push({ afterPick: heicPicked, body: response.text().catch(() => '') });
    }
  });

  // 5.1
  const v = await createContactWithMessage(request, { displayName: name, text: `ส่งรูป ${suffix}` });
  await openChat(page, name);

  // 5.2
  await fileInput.setInputFiles(media('tiny.jpg'));
  await expect(tray).toHaveAttribute('data-state', 'ready');
  await expect(page.getByTestId(testIds.attachmentPreview).locator('img')).toBeVisible();

  // 5.3
  await page.getByTestId(testIds.composerSend).click();
  const image = bubbles(page, { author: 'admin', type: 'image' });
  await expect(image).toHaveAttribute('data-status', 'sent');
  await expect(tray).toHaveCount(0);

  // 5.4
  const sentImage = (await lineMessagesTo(v.userId, v.replyToken)).find((m) => m.type === 'image');
  expect(sentImage?.originalContentUrl).toBeTruthy();
  expect(sentImage?.previewImageUrl).toBeTruthy();
  expect(sentImage?.originalContentUrl).not.toBe(sentImage?.previewImageUrl);
  for (const url of [sentImage?.originalContentUrl, sentImage?.previewImageUrl]) {
    const response = await request.get(url ?? '');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toBe('image/jpeg');
  }

  // 5.5: rejected in the browser, before any upload.
  const uploadsBefore = uploads.length;
  await fileInput.setInputFiles(media('tiny.mov'));
  await expect(tray).toHaveAttribute('data-state', 'rejected');
  await expect(status).toHaveAttribute('data-code', 'mov_not_supported');
  expect(uploads).toHaveLength(uploadsBefore);

  // 5.6
  const big = Buffer.alloc(11 * MIB);
  big.set([0xff, 0xd8, 0xff, 0xe0]);
  await fileInput.setInputFiles({ name: 'big.jpg', mimeType: 'image/jpeg', buffer: big });
  await expect(status).toHaveAttribute('data-code', 'image_too_large');

  // 5.7
  await fileInput.setInputFiles(media('fake.jpg'));
  await expect(status).toHaveAttribute('data-code', 'unsupported_type');
  expect(uploads).toHaveLength(uploadsBefore);

  // 5.8: WebP is converted to JPEG before the upload is requested.
  await fileInput.setInputFiles(media('tiny.webp'));
  await expect(tray).toHaveAttribute('data-state', 'ready');
  expect(uploads.at(-1)).toMatchObject({ kind: 'image', contentType: 'image/jpeg' });

  // 5.9: cancel discards the upload ticket of this file.
  const ticket = page.waitForResponse((response) => isUploadPost(response.request()));
  await fileInput.setInputFiles(media('tiny.jpg'));
  const { uploadId } = (await (await ticket).json()) as { uploadId: string };
  await expect(tray).toHaveAttribute('data-state', 'ready');
  const discard = page.waitForRequest(
    (r) => r.method() === 'DELETE' && new URL(r.url()).pathname === `/api/uploads/${uploadId}`,
  );
  await page.getByTestId(testIds.attachmentCancel).click();
  await discard;
  await expect(tray).toHaveCount(0);

  // 5.10
  await fileInput.setInputFiles(media('tiny.mp4'));
  await expect(tray).toHaveAttribute('data-state', 'ready');
  await page.getByTestId(testIds.composerSend).click();
  await expect(bubbles(page, { author: 'admin', type: 'video' })).toHaveAttribute(
    'data-status',
    'sent',
  );
  await expect
    .poll(async () =>
      (await lineMessagesTo(v.userId, v.replyToken)).filter((m) => m.type === 'video'),
    )
    .toHaveLength(1);

  // 5.11: HEIC is converted in the browser by heic-to, which loads only once a HEIC is picked.
  const loadedBeforePick = await Promise.all(scripts.map((s) => s.body));
  expect(loadedBeforePick.some((body) => body.includes(HEIC_TO_MARKER))).toBe(false);
  heicPicked = true;
  await fileInput.setInputFiles(media('tiny.heic'));
  await expect(tray).toHaveAttribute('data-state', 'ready', { timeout: 20_000 });
  expect(uploads.at(-1)).toMatchObject({ kind: 'image', contentType: 'image/jpeg' });
  const loadedAfterPick = await Promise.all(scripts.filter((s) => s.afterPick).map((s) => s.body));
  expect(loadedAfterPick.some((body) => body.includes(HEIC_TO_MARKER))).toBe(true);
});

test('journey 5: a local upload over 10 MB arrives whole through the proxy, and a cut one is refused', async ({
  request,
  baseURL,
}) => {
  // Next.js buffers non-GET bodies for proxy.ts; past its default 10 MB it used to cut them
  // silently (PROXY_BODY_MAX_BYTES). The PUT target is a path on whatever origin the page uses.
  const size = 12 * MIB;
  const origin = baseURL ?? '';
  const issued = await request.post('/api/uploads', {
    headers: { origin },
    data: {
      kind: 'video',
      contentType: 'video/mp4',
      sizeBytes: size,
      preview: { contentType: 'image/jpeg', sizeBytes: 1024 },
    },
  });
  expect(issued.status()).toBe(200);
  const ticket = (await issued.json()) as { original: { url: string; strategy: string } };
  expect(ticket.original.strategy).toBe('http_put');
  expect(ticket.original.url.startsWith('/api/local-storage/')).toBe(true);

  const body = Buffer.alloc(size, 7);
  const cut = await request.put(ticket.original.url, {
    headers: { origin, 'content-type': 'video/mp4' },
    data: body.subarray(0, size - 1),
  });
  expect(cut.status()).toBe(422);
  expect(((await cut.json()) as { error: { code: string } }).error.code).toBe('upload.incomplete');

  const whole = await request.put(ticket.original.url, {
    headers: { origin, 'content-type': 'video/mp4' },
    data: body,
  });
  expect(whole.status()).toBe(200);
  const stored = await request.get(ticket.original.url.split('?')[0] ?? '');
  expect(stored.status()).toBe(200);
  expect((await stored.body()).equals(body)).toBe(true);
});
