import { e2eAccessCode } from './helpers/auth';
import { expectNoA11yViolations } from './helpers/axe';
import { uiCopy } from './helpers/copy';
import { testIds } from './helpers/test-ids';
import { expect, failedResourceLine, test } from './helpers/test';

// Journey 8: access code (stubs-and-fixtures section 9, test-strategy). A fresh context with no
// cookie, so the shared login state of global.setup.ts is not used.
test.use({ storageState: { cookies: [], origins: [] } });

const UNLOCK_PATH = '/api/access/unlock';
const WRONG_CODE = 'wrong-code';

test('journey 8: wrong code stays out, the right code gets in, the API needs the cookie', async ({
  page,
  playwright,
  baseURL,
  consoleErrors,
}) => {
  if (baseURL === undefined) throw new Error('baseURL is not set');
  const unlockRequests: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === UNLOCK_PATH) {
      unlockRequests.push(request.url());
    }
  });

  // 8.1
  await page.goto('/chats');
  await expect(page.getByTestId(testIds.welcomeCover)).toBeVisible();
  await expect(page.getByTestId(testIds.appRail)).toHaveCount(0);

  // 8.2
  await page.getByTestId(testIds.accessSubmit).click();
  const error = page.getByTestId(testIds.accessError);
  await expect(error).toHaveText(uiCopy('access.error.empty'));
  expect(unlockRequests).toEqual([]);

  // 8.3: the 401 of the wrong code is provoked on purpose.
  consoleErrors.allow(failedResourceLine(401));
  const input = page.getByTestId(testIds.accessCodeInput);
  await input.fill(WRONG_CODE);
  await input.press('Enter');
  await expect(error).toHaveAttribute('data-code', 'access.code_invalid');
  await expect(input).toHaveValue(WRONG_CODE);
  expect(unlockRequests).toHaveLength(1);

  // 8.4
  const toggle = page.getByTestId(testIds.accessCodeToggle);
  await expect(input).toHaveAttribute('type', 'password');
  await toggle.click();
  await expect(input).toHaveAttribute('type', 'text');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');

  // 8.5
  await input.fill(e2eAccessCode());
  await page.getByTestId(testIds.accessSubmit).click();
  await expect(page.getByTestId(testIds.appRail)).toBeVisible();
  await expect(page).toHaveURL(/\/chats$/);

  // 8.6: a fresh request context has no cookie.
  const anonymous = await playwright.request.newContext({ baseURL });
  try {
    const response = await anonymous.get('/api/contacts');
    expect(response.status()).toBe(401);
  } finally {
    await anonymous.dispose();
  }

  // 8.7: the page's context has the cookie, but the Origin is another site.
  const forbidden = await page.context().request.post('/api/contacts/x/messages', {
    headers: { Origin: 'https://evil.example' },
    data: { id: '00000000-0000-4000-8000-000000000000', type: 'text', text: 'x' },
  });
  expect(forbidden.status()).toBe(403);
  expect(((await forbidden.json()) as { error?: { code?: string } }).error?.code).toBe(
    'request.origin_forbidden',
  );

  // 8.8
  await page.getByTestId(testIds.navLogout).click();
  await expect(page.getByTestId(testIds.welcomeCover)).toBeVisible();

  // 8.9
  await page.goto('/settings');
  await expect(page.getByTestId(testIds.welcomeCover)).toBeVisible();
  await expect(page.getByTestId(testIds.appRail)).toHaveCount(0);

  // 8.10
  await expectNoA11yViolations(page);
});
