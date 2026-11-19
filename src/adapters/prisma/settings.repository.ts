import type { Clock, SettingsRepository } from '@/core/ports';
import type { PrismaClient } from './prisma-client';
import { nanoToDecimalString } from './money.mapper';
import { PARTICLE_TO_DB, toEncryptedCredentials, toSettings } from './settings.mapper';

const SINGLE_ROW_ID = 1;

export interface SettingsRepositoryDeps {
  clock: Clock;
}

export function createSettingsRepository(
  client: PrismaClient,
  deps: SettingsRepositoryDeps,
): SettingsRepository {
  const where = { id: SINGLE_ROW_ID };

  /** Insert-if-absent: the column defaults of the schema are the install defaults. */
  const ensureRow = async (): Promise<void> => {
    await client.settings.createMany({
      data: [{ id: SINGLE_ROW_ID, updatedAt: deps.clock.now() }],
      skipDuplicates: true,
    });
  };

  const change = async (data: Parameters<typeof client.settings.update>[0]['data']) => {
    await ensureRow();
    return client.settings.update({ where, data: { ...data, updatedAt: deps.clock.now() } });
  };

  return {
    async get() {
      await ensureRow();
      return toSettings(await client.settings.findUniqueOrThrow({ where }));
    },

    async update(patch) {
      const row = await change({
        aiEnabled: patch.aiEnabled,
        aiModel: patch.aiModel,
        aiDailyBudgetUsd:
          patch.aiDailyBudget === undefined ? undefined : nanoToDecimalString(patch.aiDailyBudget),
        aiPoliteParticle:
          patch.aiPoliteParticle === undefined ? undefined : PARTICLE_TO_DB[patch.aiPoliteParticle],
        aiInstructions: patch.aiInstructions,
        guardEnabled: patch.guardEnabled,
        guardTopics: patch.guardTopics === undefined ? undefined : { set: [...patch.guardTopics] },
      });
      return toSettings(row);
    },

    async getEncryptedLineCredentials() {
      await ensureRow();
      return toEncryptedCredentials(await client.settings.findUniqueOrThrow({ where }));
    },

    async saveLineCredentials(c, bot, channel) {
      await change({
        lineChannelSecretEnc: c.channelSecretEnc,
        lineAccessTokenEnc: c.channelAccessTokenEnc,
        lineBotName: bot.botName,
        lineBasicId: bot.basicId,
        lineChannelId: channel.channelId,
        lineSecretVerifiedAt: channel.secretVerifiedAt,
      });
    },

    async recordLineSecretCheck(verifiedAt) {
      await change({ lineSecretVerifiedAt: verifiedAt });
    },

    async updateLineBotInfo(bot) {
      await change({ lineBotName: bot.botName, lineBasicId: bot.basicId });
    },

    async recordWebhookReceived(at) {
      await change({ lastWebhookAt: at });
    },

    async recordLineError(e) {
      await change({ lastLineError: e?.code ?? null, lastLineErrorAt: e?.at ?? null });
    },

    async recordAiError(e) {
      await change({ lastAiError: e?.code ?? null, lastAiErrorAt: e?.at ?? null });
    },

    async ping() {
      await client.$queryRaw`SELECT 1`;
    },
  };
}
