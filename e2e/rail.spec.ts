import { uiCopy } from './helpers/copy';
import { testIds } from './helpers/test-ids';
import { expect, test } from './helpers/test';

// The collapse control of the left menu (ui-screens 3.2, stubs-and-fixtures journey 12).

test('journey 12: the rail collapses from an icon-only button at its top', async ({
  page,
  isMobile,
}) => {
  await page.goto('/chats');
  const toggle = page.getByTestId(testIds.railCollapse);
  if (isMobile) {
    // The narrow top strip has no collapse control.
    await expect(toggle).toBeHidden();
    return;
  }
  const brand = page.getByTestId(testIds.railBrand);
  const rail = page.getByTestId(testIds.appRail);
  await expect(toggle).toBeVisible();
  // Icon only: the wording is the accessible name, never text on the menu.
  await expect(toggle).toHaveAccessibleName(uiCopy('common.nav.collapse'));
  await expect(toggle).toHaveText('');
  await expect(rail).not.toContainText(uiCopy('common.nav.collapse'));
  await expect(brand).toContainText(uiCopy('common.appName'));

  // At the top, right of the name, and the name is not cut.
  const toggleBox = await toggle.boundingBox();
  const railBox = await rail.boundingBox();
  expect(toggleBox && railBox && toggleBox.y - railBox.y).toBeLessThan(40);
  expect(toggleBox?.width).toBeGreaterThanOrEqual(44);
  const nameFits = await brand
    .locator('span')
    .nth(1)
    .evaluate((el) => el.scrollWidth <= el.clientWidth);
  expect(nameFits).toBe(true);

  // Keyboard: focus, Enter collapses; the toggle stays at the top under the logo.
  await toggle.focus();
  await page.keyboard.press('Enter');
  try {
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).toHaveAccessibleName(uiCopy('common.nav.expand'));
    await expect(rail).toHaveAttribute('data-collapsed', 'true');
    const collapsedBox = await toggle.boundingBox();
    expect(collapsedBox && railBox && collapsedBox.y - railBox.y).toBeLessThan(80);
  } finally {
    await page.keyboard.press('Space');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  }
});
