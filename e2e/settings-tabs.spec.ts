import type { Page } from '@playwright/test';
import { STUB_CHANNEL_ID } from './fixtures/line/credentials';
import { expectNoA11yViolations } from './helpers/axe';
import { uiCopy } from './helpers/copy';
import { testIds } from './helpers/test-ids';
import { expect, test } from './helpers/test';

// Journey 16: the tabs of the settings page and the fields that keep their place
// (stubs-and-fixtures, เส้นที่ 16). Projects `desktop` and `mobile`. Nothing here is saved, so it
// runs beside the other journeys; the save of LINE values is step 4.7 of the serial file.

const TABS = ['ai', 'knowledge', 'line', 'usage', 'status'] as const;

const tab = (page: Page, name: string) =>
  page.locator(`[data-testid="${testIds.settingsTab}"][data-tab="${name}"]`);
const panel = (page: Page) => page.getByTestId(testIds.settingsTabPanel);

test('journey 16: the settings tabs follow the URL, the keyboard and back and forward', async ({
  page,
}) => {
  // 16.1 LINE is connected in the seed, so the page opens on the AI tab.
  await page.goto('/settings');
  await expect(panel(page)).toHaveAttribute('data-tab', 'ai');
  await expect(tab(page, 'ai')).toHaveAttribute('aria-selected', 'true');
  expect(
    await page
      .getByTestId(testIds.settingsTab)
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-tab'))),
  ).toEqual([...TABS]);
  for (const name of TABS) {
    await expect(tab(page, name)).toHaveText(uiCopy(`settings.tabs.${name}`));
  }
  await expect(panel(page).getByTestId(testIds.settingsSectionAi)).toBeVisible();
  await expect(panel(page).getByTestId(testIds.settingsSectionAiPersona)).toBeVisible();
  // Only the open tab is mounted.
  await expect(page.getByTestId(testIds.settingsSectionLine)).toHaveCount(0);

  // 16.2 A click opens a tab and puts it in the URL.
  await tab(page, 'line').click();
  await expect(page).toHaveURL(/\/settings\?tab=line$/);
  await expect(panel(page)).toHaveAttribute('data-tab', 'line');
  await expect(page.getByTestId(testIds.settingsSectionAi)).toHaveCount(0);
  for (const id of [
    testIds.settingsSectionLine,
    testIds.settingsSectionRichMenu,
    testIds.settingsSectionWelcome,
  ]) {
    await expect(panel(page).getByTestId(id)).toBeVisible();
  }

  // 16.3 Arrow keys move along the tabs and wrap; Home and End go to the ends.
  await tab(page, 'line').focus();
  await page.keyboard.press('ArrowRight');
  await expect(tab(page, 'usage')).toBeFocused();
  await expect(page).toHaveURL(/tab=usage$/);
  await page.keyboard.press('End');
  await expect(tab(page, 'status')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(tab(page, 'ai')).toBeFocused();
  await expect(panel(page)).toHaveAttribute('data-tab', 'ai');
  await page.keyboard.press('ArrowLeft');
  await expect(panel(page)).toHaveAttribute('data-tab', 'status');
  await expect(panel(page).getByTestId(testIds.settingsSectionStatus)).toBeVisible();

  // 16.4 Back and forward walk the tabs; a reload keeps the open one.
  await page.goBack();
  await expect(panel(page)).toHaveAttribute('data-tab', 'ai');
  await page.goBack();
  await expect(panel(page)).toHaveAttribute('data-tab', 'status');
  await page.goForward();
  await expect(panel(page)).toHaveAttribute('data-tab', 'ai');
  await tab(page, 'knowledge').click();
  await page.reload();
  await expect(panel(page)).toHaveAttribute('data-tab', 'knowledge');
  await expect(panel(page).getByTestId(testIds.settingsSectionKb)).toBeVisible();
  await expect(panel(page).getByTestId(testIds.settingsSectionGuard)).toBeVisible();
  // "ขอบเขตคำตอบ" shows once: the row label, not also a card title.
  await expect(
    panel(page).getByText(uiCopy('settings.ai.answerMode'), { exact: true }),
  ).toHaveCount(1);

  // 16.5 An unknown value falls back to the default tab.
  await page.goto('/settings?tab=nope');
  await expect(panel(page)).toHaveAttribute('data-tab', 'ai');

  // 16.6 The tab strip scrolls on its own; the page never scrolls sideways.
  const overflowX = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflowX).toBe(0);
  await expectNoA11yViolations(page);
});

test('journey 16: LINE not connected opens the LINE tab with open fields', async ({ page }) => {
  // The seed has LINE connected; the answer of GET /api/settings is changed in the browser only.
  await page.route('**/api/settings', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    const response = await route.fetch();
    const json = (await response.json()) as { line: Record<string, unknown> };
    json.line = {
      ...json.line,
      configured: false,
      status: 'not_configured',
      channelId: null,
      botName: null,
      basicId: null,
      lastWebhookAt: null,
    };
    await route.fulfill({ response, json });
  });

  // 16.7
  await page.goto('/settings');
  await expect(panel(page)).toHaveAttribute('data-tab', 'line');
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByTestId(testIds.lineSetupSteps)).toBeVisible();
  const line = page.getByTestId(testIds.settingsSectionLine);
  for (const id of [testIds.lineChannelId, testIds.lineChannelSecret, testIds.lineAccessToken]) {
    await expect(line.getByTestId(id)).toBeEnabled();
    await expect(line.getByTestId(id)).toHaveValue('');
  }
  for (const id of [
    testIds.lineChannelIdEdit,
    testIds.lineChannelSecretEdit,
    testIds.lineAccessTokenEdit,
  ]) {
    await expect(line.getByTestId(id)).toHaveCount(0);
  }
  await expect(line.getByTestId(testIds.lineSave)).toBeDisabled();
  await line.getByTestId(testIds.lineChannelSecret).fill('x');
  await expect(line.getByTestId(testIds.lineSave)).toBeEnabled();
  // A tab in the URL still wins.
  await page.goto('/settings?tab=usage');
  await expect(panel(page)).toHaveAttribute('data-tab', 'usage');
  // A settings poll may still be in the handler; let it finish before the page closes.
  await page.unrouteAll({ behavior: 'wait' });
});

test('journey 16: locked LINE values open with the pencil and lock again on cancel', async ({
  page,
}) => {
  // 16.8
  await page.goto('/settings?tab=line');
  const line = page.getByTestId(testIds.settingsSectionLine);
  const webhook = line.getByTestId(testIds.lineWebhookUrl);
  await expect(webhook).toHaveAttribute('readonly', '');
  const secret = line.getByTestId(testIds.lineChannelSecret);
  const secretEdit = line.getByTestId(testIds.lineChannelSecretEdit);
  await expect(line.getByTestId(testIds.lineChannelId)).toHaveValue(STUB_CHANNEL_ID);
  await expect(secret).toBeDisabled();
  await expect(secret).toHaveValue(uiCopy('settings.line.savedMask'));
  await expect(line.getByTestId(testIds.lineAccessToken)).toHaveValue(
    uiCopy('settings.line.savedMask'),
  );
  await expect(secretEdit).toHaveAccessibleName(
    uiCopy('settings.line.edit', { field: uiCopy('settings.line.channelSecret') }),
  );
  await expect(line.getByTestId(testIds.lineSave)).toBeDisabled();

  // 16.9 The pencil empties, opens and focuses the field; it becomes the cancel button.
  await secretEdit.click();
  await expect(secret).toBeEnabled();
  await expect(secret).toBeFocused();
  await expect(secret).toHaveValue('');
  await expect(secret).toHaveAttribute('type', 'password');
  await expect(secretEdit).toHaveAccessibleName(
    uiCopy('settings.line.cancelEdit', { field: uiCopy('settings.line.channelSecret') }),
  );
  await expect(line.getByTestId(testIds.lineSave)).toBeDisabled();
  await secret.fill('typed-but-not-saved');
  await expect(line.getByTestId(testIds.lineSave)).toBeEnabled();

  // 16.10 Cancel locks it again with the mask, and nothing is left to save.
  await secretEdit.click();
  await expect(secret).toBeDisabled();
  await expect(secret).toHaveValue(uiCopy('settings.line.savedMask'));
  await expect(line.getByTestId(testIds.lineSave)).toBeDisabled();
});

test('journey 16: the save button of the AI name is always there', async ({ page }) => {
  // 16.11
  await page.goto('/settings?tab=ai');
  const name = page.getByTestId(testIds.settingsAiName);
  const save = page.getByTestId(testIds.settingsAiNameSave);
  await expect(save).toBeVisible();
  await expect(save).toBeDisabled();
  await expect(save).toHaveAttribute('data-dirty', 'false');
  const saved = await name.inputValue();
  const before = await name.boundingBox();

  // 16.12 Typing turns it into the primary button; the field does not move or change width.
  await name.fill(`${saved}ทดสอบ`);
  await expect(save).toBeEnabled();
  await expect(save).toHaveAttribute('data-dirty', 'true');
  expect(await name.boundingBox()).toEqual(before);

  // 16.13 Back to the saved value: disabled again.
  await name.fill(saved);
  await expect(save).toBeDisabled();
  for (const id of [testIds.settingsBudgetSave, testIds.settingsInstructionsSave]) {
    await expect(page.getByTestId(id)).toBeDisabled();
  }
});
