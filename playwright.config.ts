import { defineConfig } from '@playwright/test';

const AUTH = 'e2e/.auth/state.json';
const desktop = { viewport: { width: 1280, height: 800 } };
const mobile = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'off',
    screenshot: 'only-on-failure',
    locale: 'th-TH',
    timezoneId: 'Asia/Bangkok',
  },
  projects: [
    { name: 'setup', testMatch: /global\.setup\.ts/ },
    {
      name: 'desktop',
      use: { ...desktop, storageState: AUTH },
      dependencies: ['setup'],
      testIgnore: /(global\.setup|\.serial\.spec)\.ts/,
    },
    {
      name: 'mobile',
      use: { ...mobile, storageState: AUTH },
      dependencies: ['setup'],
      testIgnore: /(global\.setup|\.serial\.spec)\.ts/,
    },
    {
      name: 'serial-desktop',
      use: { ...desktop, storageState: AUTH },
      dependencies: ['desktop', 'mobile'],
      testMatch: /\.serial\.spec\.ts/,
    },
    {
      name: 'serial-mobile',
      use: { ...mobile, storageState: AUTH },
      dependencies: ['serial-desktop'],
      testMatch: /\.serial\.spec\.ts/,
    },
  ],
});
