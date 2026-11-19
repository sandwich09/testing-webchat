import { expect, type Page } from '@playwright/test';

/**
 * Scrolls every scrolling container of the page to its end, with the wheel over the middle of
 * the window and with End, then checks that the document itself did not move and is no taller
 * than the window: only the inner containers scroll (ui-screens 1.4).
 */
export async function expectDocumentNotScrollable(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const el of document.querySelectorAll<HTMLElement>('*')) {
      const { overflowY } = getComputedStyle(el);
      if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight) {
        el.scrollTop = el.scrollHeight;
      }
    }
  });
  const size = page.viewportSize();
  if (size !== null) {
    await page.mouse.move(size.width / 2, size.height / 2);
    await page.mouse.wheel(0, 5000);
  }
  await page.keyboard.press('End');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const doc = document.scrollingElement ?? document.documentElement;
        return {
          scrollTop: doc.scrollTop,
          overflow: Math.max(doc.scrollHeight - window.innerHeight, 0),
        };
      }),
    )
    .toEqual({ scrollTop: 0, overflow: 0 });
}
