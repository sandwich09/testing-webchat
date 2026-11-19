import { fileURLToPath } from 'node:url';
import { test as base, expect } from '@playwright/test';

/**
 * `test` of every journey. On top of Playwright's own fixtures it:
 *
 * - fails the test on any console error, uncaught page error or CSP violation of the page, except
 *   lines the test allows with `consoleErrors.allow(...)` (only for statuses the journey provokes
 *   on purpose, such as the 401 of a wrong access code);
 * - answers the LINE sticker CDN and both LINE profile picture hosts with a local fixture image,
 *   because they are external services the suite never calls (stubs-and-fixtures section 7.4).
 *   A contact with a picture shows in the list of every journey that runs beside it.
 */
export type ConsoleErrors = {
  /** Lets console errors matching `pattern` pass for the rest of the test. */
  allow: (pattern: RegExp) => void;
};

const LINE_IMAGE_HOSTS = [
  'https://stickershop.line-scdn.net/**',
  'https://profile.line-scdn.net/**',
  'https://sprofile.line-scdn.net/**',
];
const STICKER_FIXTURE = fileURLToPath(new URL('../fixtures/media/tiny.png', import.meta.url));

/** Console text of a CSP violation event, recorded by the init script below. */
const CSP_TAG = '[csp-violation]';

export const test = base.extend<{ consoleErrors: ConsoleErrors }>({
  consoleErrors: [
    async ({ page }, use) => {
      const allowed: RegExp[] = [];
      const errors: string[] = [];
      page.on('console', (message) => {
        if (message.type() !== 'error') return;
        const text = message.text();
        if (!allowed.some((pattern) => pattern.test(text))) errors.push(text);
      });
      page.on('pageerror', (error) => {
        errors.push(`pageerror: ${error.message}`);
      });
      await page.addInitScript((tag) => {
        document.addEventListener('securitypolicyviolation', (event) => {
          console.error(`${tag} ${event.effectiveDirective} ${event.blockedURI}`);
        });
      }, CSP_TAG);
      for (const host of LINE_IMAGE_HOSTS) {
        await page.route(host, (route) =>
          route.fulfill({ path: STICKER_FIXTURE, contentType: 'image/png' }),
        );
      }

      await use({
        allow: (pattern) => {
          allowed.push(pattern);
        },
      });

      expect(errors, 'console errors, page errors or CSP violations').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** The browser's own line for a response with `status`, for `consoleErrors.allow`. */
export function failedResourceLine(status: number): RegExp {
  return new RegExp(
    `^Failed to load resource: the server responded with a status of ${String(status)}\\b`,
  );
}
