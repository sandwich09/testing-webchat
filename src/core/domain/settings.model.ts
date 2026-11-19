import type { AiModelId, AiProvider, PoliteParticle } from './enums.model';
import type { LineAccessToken, NanoUsd } from './ids';
import type { ErrorCode } from './result';

export interface Settings {
  /** Kill switch. */
  aiEnabled: boolean;
  aiProvider: AiProvider;
  aiModel: AiModelId;
  aiDailyBudget: NanoUsd;
  aiPoliteParticle: PoliteParticle;
  aiInstructions: string;
  /** Topic guard, see specs/topic-guard.md. */
  guardEnabled: boolean;
  /** 0 to GUARD_MAX_TOPICS topics, trimmed and unique. At least 1 while guardEnabled is true. */
  guardTopics: string[];
  /** 1 to GUARD_REFUSAL_MAX_CHARS characters. */
  guardRefusalText: string;
  /** Both encrypted credentials are stored. */
  lineConfigured: boolean;
  lineBotName: string | null;
  lineBasicId: string | null;
  /** Not secret. null for credentials saved before the Channel ID was asked for. */
  lineChannelId: string | null;
  /** When LINE last confirmed the Channel ID and channel secret pair; null when it has not. */
  lineSecretVerifiedAt: Date | null;
  lastWebhookAt: Date | null;
  lastLineError: { code: ErrorCode; at: Date } | null;
  lastAiError: { code: ErrorCode; at: Date } | null;
}

/** Plain credentials live in memory only. No API returns them. */
export interface LineCredentials {
  channelSecret: string;
  channelAccessToken: LineAccessToken;
}

export interface EncryptedLineCredentials {
  channelSecretEnc: string;
  channelAccessTokenEnc: string;
}
