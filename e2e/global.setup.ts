import { test as setup } from '@playwright/test';
import { AUTH_STATE_PATH, loginByApi } from './helpers/auth';
import { stubReset } from './helpers/stub';

// The `setup` project (playwright.config.ts): reset the stub once for the whole run, then log in
// with E2E_ACCESS_CODE and keep the cookie for every other project (stubs-and-fixtures 6.1).
setup('reset the stub and log in', async ({ browser }) => {
  await stubReset();
  const context = await browser.newContext();
  try {
    await loginByApi(context);
    await context.storageState({ path: AUTH_STATE_PATH });
  } finally {
    await context.close();
  }
});
