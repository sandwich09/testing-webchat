import { expect, type Locator, type Page } from '@playwright/test';
import { testIds } from './test-ids';

/**
 * Screen helpers shared by the journeys (stubs-and-fixtures section 9). At 390 px wide the list
 * and the thread are separate screens: a chat opens by clicking its `contact-row` and closes with
 * `thread-back`, and the info panel opens with `thread-info-toggle`.
 */

/** `row(name)` of section 9: the contact row that shows `name`. */
export function row(page: Page, name: string): Locator {
  return page.getByTestId(testIds.contactRow).filter({ hasText: name });
}

/** Message bubbles, optionally of one author and containing `text`. */
export function bubbles(
  page: Page,
  opts: { author?: 'customer' | 'admin' | 'ai'; type?: string; text?: string } = {},
): Locator {
  let selector = `[data-testid="${testIds.messageBubble}"]`;
  if (opts.author !== undefined) selector += `[data-author="${opts.author}"]`;
  if (opts.type !== undefined) selector += `[data-type="${opts.type}"]`;
  const locator = page.locator(selector);
  return opts.text === undefined ? locator : locator.filter({ hasText: opts.text });
}

/**
 * The block of one bubble: the bubble, its time and sender (beside the last bubble of a group)
 * and its delivery line with the retry button (under it). `MessageBubble` renders the bubble two
 * levels below that block.
 */
export function bubbleBlock(bubble: Locator): Locator {
  return bubble.locator('xpath=../..');
}

/** A `system-line` with this event code. */
export function systemLine(page: Page, eventCode: string): Locator {
  return page.locator(`[data-testid="${testIds.systemLine}"][data-event-code="${eventCode}"]`);
}

/**
 * The toast that shows `text` (ui-screens 10), optionally of one tone. Sonner writes the tone to
 * `data-type` on the element that carries the `toast` test id.
 */
export function toastWith(page: Page, text: string, tone?: 'success' | 'error'): Locator {
  const toneSelector = tone === undefined ? '' : `[data-type="${tone}"]`;
  return page.locator(`[data-testid="${testIds.toast}"]${toneSelector}`).filter({ hasText: text });
}

/** Opens `/chats`, waits for the row of `name`, clicks it and waits for the thread. */
export async function openChat(page: Page, name: string): Promise<string> {
  await page.goto('/chats');
  const target = row(page, name);
  await expect(target).toBeVisible();
  const contactId = await target.getAttribute('data-contact-id');
  if (contactId === null) throw new Error('contact-row has no data-contact-id');
  await target.click();
  await expect(page).toHaveURL(new RegExp(`/chats/${contactId}$`));
  await expect(page.getByTestId(testIds.thread)).toBeVisible();
  await expect(page.getByTestId(testIds.threadName)).toHaveText(name);
  return contactId;
}

/** Back from a chat to the list: `thread-back` at 390 px; the list is always shown when wider. */
export async function backToList(page: Page, isMobile: boolean): Promise<void> {
  if (isMobile) {
    await page.getByTestId(testIds.threadBack).click();
    await expect(page).toHaveURL(/\/chats$/);
  }
  await expect(page.getByTestId(testIds.contactList)).toBeVisible();
}

/** Makes the info panel visible, clicking `thread-info-toggle` when it is closed. */
export async function showInfoPanel(page: Page): Promise<Locator> {
  const panel = page.getByTestId(testIds.infoPanel);
  const toggle = page.getByTestId(testIds.threadInfoToggle);
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(panel).toBeVisible();
  return panel;
}

/** Closes the info panel when it is open (it covers the thread on narrow screens). */
export async function hideInfoPanel(page: Page): Promise<void> {
  const toggle = page.getByTestId(testIds.threadInfoToggle);
  if ((await toggle.getAttribute('aria-expanded')) === 'true') {
    // On narrow screens the panel covers the header; its own close button is always reachable.
    const close = page.getByTestId(testIds.infoClose);
    if (await close.isVisible()) await close.click();
    else await toggle.click();
  }
  await expect(page.getByTestId(testIds.infoPanel)).toBeHidden();
}

/** Types `text` in the composer and sends it with Enter. */
export async function sendText(page: Page, text: string): Promise<void> {
  const input = page.getByTestId(testIds.composerInput);
  await expect(input).toBeEnabled();
  await input.fill(text);
  await input.press('Enter');
  await expect(input).toHaveValue('');
}

/** A short unique suffix for names and texts of one test. */
export function uniqueSuffix(): string {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}
