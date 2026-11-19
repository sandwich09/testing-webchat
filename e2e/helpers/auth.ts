import type { BrowserContext } from '@playwright/test';

const DEFAULT_BASE_URL = 'http://localhost:3000';
/** Storage state written by global.setup.ts; the `storageState` of every project but `setup`. */
export const AUTH_STATE_PATH = 'e2e/.auth/state.json';

/** `ACCESS_CODE` of docker-compose.yml (stubs-and-fixtures section 2). */
const DEFAULT_ACCESS_CODE = 'test-webchat';

/** The access code the suite logs in with: `E2E_ACCESS_CODE`, else the compose value. */
export function e2eAccessCode(): string {
  return process.env.E2E_ACCESS_CODE ?? DEFAULT_ACCESS_CODE;
}

/**
 * Unlocks the app through `POST /api/access/unlock` and keeps the cookie in the context. The
 * `Origin` header must equal the app origin, which is the `baseURL` of playwright.config.ts
 * (`APP_BASE_URL` in compose); pass `baseURL` when a context uses another origin.
 */
export async function loginByApi(
  context: BrowserContext,
  opts: { baseURL?: string; code?: string } = {},
): Promise<void> {
  const baseURL = opts.baseURL ?? DEFAULT_BASE_URL;
  const code = opts.code ?? e2eAccessCode();
  const response = await context.request.post(new URL('/api/access/unlock', baseURL).toString(), {
    headers: { Origin: new URL(baseURL).origin },
    data: { code },
  });
  if (response.status() !== 204) {
    throw new Error(`Unlock failed with status ${String(response.status())}`);
  }
}
