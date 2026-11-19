import { createContactWithMessage } from './helpers/contact';
import { uiCopy } from './helpers/copy';
import {
  backToList,
  hideInfoPanel,
  openChat,
  row,
  showInfoPanel,
  uniqueSuffix,
} from './helpers/inbox';
import { stubClaudeRequests, stubLineRequests } from './helpers/stub';
import { testIds } from './helpers/test-ids';
import { expect, failedResourceLine, test } from './helpers/test';

// Admin notes (webchat-inbox "โน้ตของแอดมิน", stubs-and-fixtures journey 11). Projects
// `desktop` (side panel) and `mobile` (full-screen sheet).

test('journey 11: an admin note is kept, survives a reload and never leaves the app', async ({
  page,
  request,
}) => {
  const suffix = uniqueSuffix();
  const name = `ลูกค้าโน้ต ${suffix}`;
  await createContactWithMessage(request, { displayName: name, text: `สวัสดี ${suffix}` });
  const lineBefore = await stubLineRequests();
  const claudeBefore = await stubClaudeRequests();
  const since = Math.max(0, ...lineBefore.map((r) => r.seq), ...claudeBefore.map((r) => r.seq));

  // 11.1 Open the panel: no notes yet.
  await openChat(page, name);
  const panel = await showInfoPanel(page);
  const notes = panel.getByTestId(testIds.infoNotes);
  await expect(notes).toContainText(uiCopy('inbox.notes.title'));
  await expect(notes.getByTestId(testIds.infoNotesEmpty)).toBeVisible();

  // 11.2 Shift+Enter keeps typing, Enter adds; the note shows at the top at once.
  const secret = `โน้ตลับ ${suffix}`;
  const input = notes.getByTestId(testIds.infoNoteInput);
  await input.fill(secret);
  await input.press('Shift+Enter');
  await input.pressSequentially('บรรทัดสอง');
  await input.press('Enter');
  await expect(input).toHaveValue('');
  const rows = notes.getByTestId(testIds.infoNote);
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText(secret);
  await expect(rows.first()).not.toHaveAttribute('data-pending', 'true');

  // 11.3 Reload: the note is still there.
  await page.reload();
  const again = await showInfoPanel(page);
  await expect(again.getByTestId(testIds.infoNote).first()).toContainText(secret);

  // 11.4 The note text was never sent to LINE or Claude.
  const sent = [...(await stubLineRequests({ since })), ...(await stubClaudeRequests({ since }))];
  expect(JSON.stringify(sent.map((r) => r.body))).not.toContain('โน้ตลับ');

  // 11.5 Delete with confirmation.
  await again.getByTestId(testIds.infoNoteDelete).first().click();
  await page.getByTestId(testIds.infoNoteDeleteConfirm).click();
  await expect(again.getByTestId(testIds.infoNotesEmpty)).toBeVisible();
});

test('journey 11: a note being typed and a failed delete stay with their own customer', async ({
  page,
  request,
  isMobile,
  consoleErrors,
}) => {
  // 11.7 answers one delete with 503 on purpose.
  consoleErrors.allow(failedResourceLine(503));
  const suffix = uniqueSuffix();
  const first = `ลูกค้าแรก ${suffix}`;
  const second = `ลูกค้าสอง ${suffix}`;
  await createContactWithMessage(request, { displayName: first, text: `หนึ่ง ${suffix}` });
  await createContactWithMessage(request, { displayName: second, text: `สอง ${suffix}` });

  // 11.6 A draft typed for one customer is not in the box of the next one.
  await openChat(page, first);
  const panel = await showInfoPanel(page);
  await panel.getByTestId(testIds.infoNoteInput).fill(`ร่างของคนแรก ${suffix}`);
  if (isMobile) {
    await hideInfoPanel(page);
    await backToList(page, true);
  }
  await row(page, second).click();
  await expect(page.getByTestId(testIds.threadName)).toHaveText(second);
  const next = await showInfoPanel(page);
  await expect(next.getByTestId(testIds.infoNoteInput)).toHaveValue('');

  // 11.7 A delete that failed shows its error once; opened again, the dialog starts clean.
  const input = next.getByTestId(testIds.infoNoteInput);
  await input.fill(`โน้ต ${suffix}`);
  await input.press('Enter');
  await expect(next.getByTestId(testIds.infoNote)).toHaveCount(1);
  await expect(next.getByTestId(testIds.infoNote).first()).not.toHaveAttribute(
    'data-pending',
    'true',
  );
  let failOnce = true;
  await page.route('**/api/contacts/*/notes/*', async (route) => {
    if (route.request().method() !== 'DELETE' || !failOnce) return route.fallback();
    failOnce = false;
    return route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { code: 'db.unavailable', message: 'down', requestId: 'e2e' },
      }),
    });
  });
  await next.getByTestId(testIds.infoNoteDelete).first().click();
  const dialog = page.getByTestId(testIds.infoNoteDeleteDialog);
  await page.getByTestId(testIds.infoNoteDeleteConfirm).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await next.getByTestId(testIds.infoNoteDelete).first().click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('alert')).toHaveCount(0);
});
