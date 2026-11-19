import type {
  AiModelId,
  AiProvider,
  EncryptedLineCredentials,
  ErrorCode,
  PoliteParticle,
  Settings,
} from '@/core/domain';
import type { Settings as SettingsRow } from './generated/client';
import { decimalStringToNano } from './money.mapper';

type DbPoliteParticle = SettingsRow['aiPoliteParticle'];

const PARTICLE_FROM_DB: Record<DbPoliteParticle, PoliteParticle> = {
  kha: 'ค่ะ',
  khrap: 'ครับ',
};

export const PARTICLE_TO_DB: Record<PoliteParticle, DbPoliteParticle> = {
  ค่ะ: 'kha',
  ครับ: 'khrap',
};

const toError = (code: string | null, at: Date | null): Settings['lastLineError'] =>
  code !== null && at !== null ? { code: code as ErrorCode, at } : null; // brand: the column holds an error-catalog code

export function toSettings(row: SettingsRow): Settings {
  return {
    aiEnabled: row.aiEnabled,
    aiProvider: row.aiProvider as AiProvider, // brand: only 'claude' is ever written
    aiModel: row.aiModel as AiModelId, // brand: written from AiModelId by update
    aiDailyBudget: decimalStringToNano(row.aiDailyBudgetUsd.toFixed(9)),
    aiPoliteParticle: PARTICLE_FROM_DB[row.aiPoliteParticle],
    aiInstructions: row.aiInstructions,
    guardEnabled: row.guardEnabled,
    guardTopics: [...row.guardTopics],
    guardRefusalText: row.guardRefusalText,
    lineConfigured: row.lineChannelSecretEnc !== null && row.lineAccessTokenEnc !== null,
    lineBotName: row.lineBotName,
    lineBasicId: row.lineBasicId,
    lineChannelId: row.lineChannelId,
    lineSecretVerifiedAt: row.lineSecretVerifiedAt,
    lastWebhookAt: row.lastWebhookAt,
    lastLineError: toError(row.lastLineError, row.lastLineErrorAt),
    lastAiError: toError(row.lastAiError, row.lastAiErrorAt),
  };
}

export function toEncryptedCredentials(row: SettingsRow): EncryptedLineCredentials | null {
  if (row.lineChannelSecretEnc === null || row.lineAccessTokenEnc === null) return null;
  return {
    channelSecretEnc: row.lineChannelSecretEnc,
    channelAccessTokenEnc: row.lineAccessTokenEnc,
  };
}
