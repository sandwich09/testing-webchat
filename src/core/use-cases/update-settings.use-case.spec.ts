import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { FakeLogger, FakeSettingsRepository } from '@/adapters/fakes';
import { PRICE_TABLE } from '@/core/domain';
import { makeUpdateSettings } from './update-settings.use-case';
import type { UseCaseConfig } from './types';

const config: UseCaseConfig = {
  appBaseUrl: 'https://app.example.com',
  aiDebounceMs: 0,
  aiStuckAfterMs: 0,
  pollIntervalMs: 3000,
  rateLimitScale: 1,
  priceTable: PRICE_TABLE,
};
const ctx = { requestId: 'req-1', clientIp: null };

describe('UpdateSettings', () => {
  let settings: FakeSettingsRepository;
  let logger: FakeLogger;
  let update: ReturnType<typeof makeUpdateSettings>;
  let updateSpy: MockInstance<FakeSettingsRepository['update']>;

  beforeEach(() => {
    settings = new FakeSettingsRepository();
    updateSpy = vi.spyOn(settings, 'update');
    logger = new FakeLogger();
    update = makeUpdateSettings({ settings, logger }, config);
  });

  it('changes one field and leaves the others alone', async () => {
    const before = await settings.get();

    const result = await update({ aiInstructions: 'Be brief' }, ctx);

    expect(result.ok).toBe(true);
    expect(result.ok ? result.value : null).toEqual({ ...before, aiInstructions: 'Be brief' });
    expect(logger.eventsOf()).toEqual(['settings.values.updated']);
  });

  it('saves the AI name trimmed, clears it with blank text, and saves the answer scope', async () => {
    const named = await update({ aiName: '  มินนี่ ', aiAnswerMode: 'knowledge_only' }, ctx);
    expect(named.ok ? [named.value.aiName, named.value.aiAnswerMode] : null).toEqual([
      'มินนี่',
      'knowledge_only',
    ]);
    const cleared = await update({ aiName: '   ' }, ctx);
    expect(cleared.ok ? cleared.value.aiName : 'x').toBeNull();
    expect((await settings.get()).aiAnswerMode).toBe('knowledge_only');
  });

  it('saves the rich menu and welcome texts trimmed, and the welcome switch', async () => {
    const r = await update(
      { howToText: ' ลองเลย \n', welcomeText: '  ยินดีต้อนรับ ', welcomeEnabled: false },
      ctx,
    );
    expect(r.ok ? [r.value.howToText, r.value.welcomeText, r.value.welcomeEnabled] : null).toEqual([
      'ลองเลย',
      'ยินดีต้อนรับ',
      false,
    ]);
    const reset = await update({ howToText: '   ' }, ctx);
    expect(reset.ok ? reset.value.howToText : 'x').toBe('');
  });

  it('turns the kill switch off', async () => {
    await update({ aiEnabled: true }, ctx);

    const result = await update({ aiEnabled: false }, ctx);

    expect(result.ok ? result.value.aiEnabled : null).toBe(false);
  });

  it('refuses to turn the topic guard on with no topic and writes nothing', async () => {
    const result = await update({ guardEnabled: true, aiInstructions: 'x' }, ctx);

    expect(result.ok ? null : result.error.code).toBe('settings.guard_topics_required');
    expect(updateSpy).not.toHaveBeenCalled();
    expect((await settings.get()).guardEnabled).toBe(false);
    expect((await settings.get()).aiInstructions).toBe('');
    expect(logger.entries).toEqual([]);
  });

  it('turns the guard on together with two topics in one patch', async () => {
    const result = await update({ guardEnabled: true, guardTopics: ['มุกตลก', 'ดูดวง'] }, ctx);

    expect(result.ok).toBe(true);
    const s = await settings.get();
    expect(s.guardEnabled).toBe(true);
    expect(s.guardTopics).toEqual(['มุกตลก', 'ดูดวง']);
  });

  it('refuses an empty topic list while the guard is on', async () => {
    await update({ guardEnabled: true, guardTopics: ['มุกตลก'] }, ctx);
    updateSpy.mockClear();

    const result = await update({ guardTopics: [] }, ctx);

    expect(result.ok ? null : result.error.code).toBe('settings.guard_topics_required');
    expect(updateSpy).not.toHaveBeenCalled();
    expect((await settings.get()).guardTopics).toEqual(['มุกตลก']);
  });

  it('refuses topics that are all blank while the guard is on', async () => {
    await update({ guardEnabled: true, guardTopics: ['มุกตลก'] }, ctx);

    const result = await update({ guardTopics: ['  ', ''] }, ctx);

    expect(result.ok ? null : result.error.code).toBe('settings.guard_topics_required');
  });

  it('refuses turning the guard on when topics were saved empty', async () => {
    await update({ guardTopics: [] }, ctx);

    const result = await update({ guardEnabled: true }, ctx);

    expect(result.ok ? null : result.error.code).toBe('settings.guard_topics_required');
  });

  it('accepts an empty topic list while the guard is off', async () => {
    await update({ guardTopics: ['มุกตลก'] }, ctx);

    const result = await update({ guardTopics: [] }, ctx);

    expect(result.ok ? result.value.guardTopics : null).toEqual([]);
  });

  it('turning the guard off with an empty list in the same patch works', async () => {
    await update({ guardEnabled: true, guardTopics: ['มุกตลก'] }, ctx);

    const result = await update({ guardEnabled: false, guardTopics: [] }, ctx);

    expect(result.ok).toBe(true);
  });

  it('saves topics trimmed', async () => {
    const result = await update({ guardTopics: ['  มุกตลก ', 'ดูดวง\n'] }, ctx);

    expect(result.ok ? result.value.guardTopics : null).toEqual(['มุกตลก', 'ดูดวง']);
  });

  it('throws when the route let an invalid topic list through', async () => {
    await expect(update({ guardTopics: ['a', 'a'] }, ctx)).rejects.toThrow();
  });
});
