import { describe, expect, it } from 'vitest';

describe('@/composition entry', () => {
  it('can be imported without any environment variable (next build loads routes this way)', async () => {
    const mod = await import('./index');
    for (const name of [
      'withRoute',
      'runJob',
      'assertEnv',
      'proxyGate',
      'scheduleLineFollowUps',
      'scheduleDocumentExtraction',
      'usageMonth',
      'verifyAccess',
      'testTopicGuard',
      'getGuardrailStats',
      'toSettingsDto',
      'readPdfUpload',
    ]) {
      expect(typeof (mod as Record<string, unknown>)[name]).toBe('function');
    }
  });

  it('exports no repository, adapter or container', async () => {
    const names = Object.keys(await import('./index'));
    expect(
      names.filter((n) => /repository|adapter|container|ports|prisma|^create/i.test(n)),
    ).toEqual([]);
  });
});
