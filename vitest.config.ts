import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const realAdapters = 'src/adapters/{line,claude,prisma,blob,local-storage}/**/*.spec.ts';

export default defineConfig({
  resolve: {
    alias: { '@': r('./src'), 'server-only': r('./test-support/server-only.ts') },
  },
  test: {
    env: { TZ: 'UTC' },
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      include: ['src/core/**/*.ts'],
      exclude: ['**/*.spec.ts', '**/index.ts'],
      thresholds: { lines: 90, functions: 90, branches: 90, statements: 90 },
      reporter: ['text', 'html'],
      reportsDirectory: 'coverage',
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.spec.ts', 'e2e/**/*.unit.ts'],
          exclude: [realAdapters],
        },
      },
      {
        extends: true,
        test: {
          name: 'adapters',
          environment: 'node',
          include: [realAdapters],
          globalSetup: ['test-support/adapters.global-setup.ts'],
          fileParallelism: false,
          testTimeout: 20_000,
        },
      },
    ],
  },
});
