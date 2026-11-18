import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_AI_MODEL,
  DEFAULT_GUARD_REFUSAL_TEXT,
  DEFAULT_POLITE_PARTICLE,
  type NanoUsd,
  type Settings,
} from '@/core/domain';
import type { SettingsRepository } from '@/core/ports';

const at = (iso: string): Date => new Date(iso);
// DEFAULT_AI_DAILY_BUDGET_USD is '2.00'; written out so the suite does not depend on parseUsd.
const DEFAULT_BUDGET = 2_000_000_000n as NanoUsd; // brand: 2 USD in nano-USD

const DEFAULTS: Settings = {
  aiEnabled: false,
  aiProvider: 'claude',
  aiModel: DEFAULT_AI_MODEL,
  aiDailyBudget: DEFAULT_BUDGET,
  aiPoliteParticle: DEFAULT_POLITE_PARTICLE,
  aiInstructions: '',
  guardEnabled: false,
  guardTopics: [],
  guardRefusalText: DEFAULT_GUARD_REFUSAL_TEXT,
  lineConfigured: false,
  lineBotName: null,
  lineBasicId: null,
  lastWebhookAt: null,
  lastLineError: null,
  lastAiError: null,
};

/**
 * Runs the SettingsRepository contract (docs/architecture/domain-and-ports.md) against the subject.
 *
 * `makeSubject` runs before every test and must return a repository with no Settings row yet
 * (a Postgres harness deletes the row first), so `get` creates it with the defaults.
 */
export const describeSettingsRepositorySuite = (
  makeSubject: () => SettingsRepository | Promise<SettingsRepository>,
): void => {
  describe('SettingsRepository contract', () => {
    let repo: SettingsRepository;

    beforeEach(async () => {
      repo = await makeSubject();
    });

    it('get creates the single row with the defaults of a new install', async () => {
      expect(await repo.get()).toEqual(DEFAULTS);
      expect(await repo.get()).toEqual(DEFAULTS);
      expect(await repo.getEncryptedLineCredentials()).toBeNull();
    });

    it('update changes only the given fields and returns the row', async () => {
      const budget = 1_234_567_891n as NanoUsd; // brand: exact nano-USD round trip
      const updated = await repo.update({ aiEnabled: true, aiDailyBudget: budget });
      expect(updated).toEqual({ ...DEFAULTS, aiEnabled: true, aiDailyBudget: budget });
      const again = await repo.update({
        aiModel: 'claude-haiku-5-5',
        aiPoliteParticle: 'ครับ',
        aiInstructions: 'ตอบสั้น ๆ',
      });
      expect(again).toEqual({
        ...DEFAULTS,
        aiEnabled: true,
        aiDailyBudget: budget,
        aiModel: 'claude-haiku-5-5',
        aiPoliteParticle: 'ครับ',
        aiInstructions: 'ตอบสั้น ๆ',
      });
      expect(await repo.get()).toEqual(again);
    });

    it('update stores the topic guard fields, keeping the topic order', async () => {
      const topics = ['มุกตลกไทย', 'มีมจากละครและซีรีส์', 'มุกจากภาพยนตร์'];
      const updated = await repo.update({ guardTopics: topics });
      expect(updated).toEqual({ ...DEFAULTS, guardTopics: topics });
      const enabled = await repo.update({ guardEnabled: true, guardRefusalText: 'คุยได้แค่มุกนะคะ' });
      expect(enabled).toEqual({
        ...DEFAULTS,
        guardEnabled: true,
        guardTopics: topics,
        guardRefusalText: 'คุยได้แค่มุกนะคะ',
      });
      expect(await repo.get()).toEqual(enabled);
    });

    it('update with an empty topic list clears the topics and leaves the rest', async () => {
      await repo.update({ guardTopics: ['a', 'b'], aiInstructions: 'x' });
      expect(await repo.update({ guardTopics: [] })).toEqual({
        ...DEFAULTS,
        aiInstructions: 'x',
      });
    });

    it('update does not keep a reference to the given topic array', async () => {
      const topics = ['a'];
      await repo.update({ guardTopics: topics });
      topics.push('b');
      expect((await repo.get()).guardTopics).toEqual(['a']);
    });

    it('update works before the row exists', async () => {
      expect(await repo.update({ aiPoliteParticle: 'ครับ' })).toEqual({
        ...DEFAULTS,
        aiPoliteParticle: 'ครับ',
      });
    });

    it('saveLineCredentials stores both values and the bot info', async () => {
      await repo.saveLineCredentials(
        { channelSecretEnc: 'enc-secret', channelAccessTokenEnc: 'enc-token' },
        { botName: 'ต้นหอม คาเฟ่', basicId: '@tonhom' },
      );
      expect(await repo.getEncryptedLineCredentials()).toEqual({
        channelSecretEnc: 'enc-secret',
        channelAccessTokenEnc: 'enc-token',
      });
      expect(await repo.get()).toEqual({
        ...DEFAULTS,
        lineConfigured: true,
        lineBotName: 'ต้นหอม คาเฟ่',
        lineBasicId: '@tonhom',
      });

      await repo.saveLineCredentials(
        { channelSecretEnc: 'enc-secret-2', channelAccessTokenEnc: 'enc-token-2' },
        { botName: 'b2', basicId: '@b2' },
      );
      expect(await repo.getEncryptedLineCredentials()).toEqual({
        channelSecretEnc: 'enc-secret-2',
        channelAccessTokenEnc: 'enc-token-2',
      });
    });

    it('updateLineBotInfo changes the bot name and basic id only', async () => {
      await repo.saveLineCredentials(
        { channelSecretEnc: 's', channelAccessTokenEnc: 't' },
        { botName: 'old', basicId: '@old' },
      );
      await repo.updateLineBotInfo({ botName: 'new', basicId: '@new' });
      expect(await repo.get()).toMatchObject({
        lineConfigured: true,
        lineBotName: 'new',
        lineBasicId: '@new',
      });
      expect(await repo.getEncryptedLineCredentials()).toEqual({
        channelSecretEnc: 's',
        channelAccessTokenEnc: 't',
      });
    });

    it('records the last webhook time and the last LINE and AI errors, and clears them', async () => {
      await repo.recordWebhookReceived(at('2026-11-18T03:00:00.123Z'));
      await repo.recordLineError({ code: 'line.unauthorized', at: at('2026-11-18T03:01:00.000Z') });
      await repo.recordAiError({ code: 'ai.unavailable', at: at('2026-11-18T03:02:00.000Z') });
      expect(await repo.get()).toMatchObject({
        lastWebhookAt: at('2026-11-18T03:00:00.123Z'),
        lastLineError: { code: 'line.unauthorized', at: at('2026-11-18T03:01:00.000Z') },
        lastAiError: { code: 'ai.unavailable', at: at('2026-11-18T03:02:00.000Z') },
      });
      await repo.recordLineError(null);
      await repo.recordAiError(null);
      expect(await repo.get()).toMatchObject({ lastLineError: null, lastAiError: null });
    });

    it('ping resolves when the store is reachable', async () => {
      await expect(repo.ping()).resolves.toBeUndefined();
    });
  });
};
