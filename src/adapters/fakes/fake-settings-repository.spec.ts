import { describe, expect, it } from 'vitest';
import { describeSettingsRepositorySuite } from './suites/settings-repository.suite';
import { FakeSettingsRepository } from './fake-settings-repository';

describeSettingsRepositorySuite(() => new FakeSettingsRepository());

describe('FakeSettingsRepository', () => {
  it('ping rejects with pingError set, as when the database is unreachable', async () => {
    const repo = new FakeSettingsRepository();
    repo.pingError = new Error('down');
    await expect(repo.ping()).rejects.toThrow('down');
  });

  it('returns copies, so callers cannot change the stored row', async () => {
    const repo = new FakeSettingsRepository();
    const s = await repo.get();
    s.aiEnabled = true;
    expect((await repo.get()).aiEnabled).toBe(false);
  });

  it('returns a copy of the topic list', async () => {
    const repo = new FakeSettingsRepository();
    const s = await repo.update({ guardTopics: ['a'] });
    s.guardTopics.push('b');
    expect((await repo.get()).guardTopics).toEqual(['a']);
  });
});
