import {
  DEFAULT_AI_DAILY_BUDGET_USD,
  DEFAULT_AI_MODEL,
  DEFAULT_GUARD_REFUSAL_TEXT,
  DEFAULT_POLITE_PARTICLE,
  parseUsd,
  type EncryptedLineCredentials,
  type NanoUsd,
  type Settings,
} from '@/core/domain';
import type { SettingsRepository } from '@/core/ports';

/** The default daily budget in nano-USD; the constant is a valid "d.dd" string, so null never comes. */
const DEFAULT_BUDGET = parseUsd(DEFAULT_AI_DAILY_BUDGET_USD) ?? (0n as NanoUsd); // brand: zero nano-USD

interface Row {
  settings: Settings;
  credentials: EncryptedLineCredentials | null;
}

const defaults = (): Row => ({
  settings: {
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
  },
  credentials: null,
});

/** In-memory single Settings row, created with the defaults on first use. */
export class FakeSettingsRepository implements SettingsRepository {
  private row: Row | null = null;
  /** Set to make `ping` throw, as when the database cannot be reached. */
  pingError: Error | null = null;

  private current(): Row {
    this.row ??= defaults();
    return this.row;
  }

  readonly get: SettingsRepository['get'] = () =>
    Promise.resolve(structuredClone(this.current().settings));

  readonly update: SettingsRepository['update'] = (patch) => {
    const row = this.current();
    // A key given as undefined leaves the field alone, as Prisma does.
    const s = row.settings;
    s.aiEnabled = patch.aiEnabled ?? s.aiEnabled;
    s.aiModel = patch.aiModel ?? s.aiModel;
    s.aiDailyBudget = patch.aiDailyBudget ?? s.aiDailyBudget;
    s.aiPoliteParticle = patch.aiPoliteParticle ?? s.aiPoliteParticle;
    s.aiInstructions = patch.aiInstructions ?? s.aiInstructions;
    s.guardEnabled = patch.guardEnabled ?? s.guardEnabled;
    s.guardTopics = patch.guardTopics ? [...patch.guardTopics] : s.guardTopics;
    s.guardRefusalText = patch.guardRefusalText ?? s.guardRefusalText;
    return Promise.resolve(structuredClone(row.settings));
  };

  readonly getEncryptedLineCredentials: SettingsRepository['getEncryptedLineCredentials'] = () => {
    const c = this.current().credentials;
    return Promise.resolve(c ? { ...c } : null);
  };

  readonly saveLineCredentials: SettingsRepository['saveLineCredentials'] = (c, bot) => {
    const row = this.current();
    row.credentials = { ...c };
    row.settings.lineConfigured = true;
    row.settings.lineBotName = bot.botName;
    row.settings.lineBasicId = bot.basicId;
    return Promise.resolve();
  };

  readonly updateLineBotInfo: SettingsRepository['updateLineBotInfo'] = (bot) => {
    const row = this.current();
    row.settings.lineBotName = bot.botName;
    row.settings.lineBasicId = bot.basicId;
    return Promise.resolve();
  };

  readonly recordWebhookReceived: SettingsRepository['recordWebhookReceived'] = (at) => {
    this.current().settings.lastWebhookAt = at;
    return Promise.resolve();
  };

  readonly recordLineError: SettingsRepository['recordLineError'] = (e) => {
    this.current().settings.lastLineError = e ? { ...e } : null;
    return Promise.resolve();
  };

  readonly recordAiError: SettingsRepository['recordAiError'] = (e) => {
    this.current().settings.lastAiError = e ? { ...e } : null;
    return Promise.resolve();
  };

  readonly ping: SettingsRepository['ping'] = () =>
    this.pingError ? Promise.reject(this.pingError) : Promise.resolve();
}
