import type { AiAnswerMode, AiModelId, AiProvider, PoliteParticle } from './enums.model';
import type { LineAccessToken, NanoUsd } from './ids';
import type { ErrorCode } from './result';

export interface Settings {
  /** Kill switch. */
  aiEnabled: boolean;
  aiProvider: AiProvider;
  aiModel: AiModelId;
  aiDailyBudget: NanoUsd;
  aiPoliteParticle: PoliteParticle;
  /** Custom instructions of the account (the <custom_instructions> block); '' when none. */
  aiInstructions: string;
  /** Name the AI calls itself, trimmed, used as typed; null when none (normalizeAiName). */
  aiName: string | null;
  /** Which answer scope block goes into the prompt. */
  aiAnswerMode: AiAnswerMode;
  /** Topic guard, see specs/topic-guard.md. */
  guardEnabled: boolean;
  /** 0 to GUARD_MAX_TOPICS topics, trimmed and unique. At least 1 while guardEnabled is true. */
  guardTopics: string[];
  /** Text of the rich menu button "วิธีทดสอบ"; '' means the default (howToTextOf). */
  howToText: string;
  /** Send the welcome card on follow events. */
  welcomeEnabled: boolean;
  /** Body of the welcome card; '' means the default (welcomeTextOf). */
  welcomeText: string;
  /** The rich menu this app set as the default at LINE, or null when none. */
  richMenu: { id: string; publishedAt: Date } | null;
  /** The last failed publish or removal of the rich menu; null after one that worked. */
  richMenuError: { code: ErrorCode; at: Date } | null;
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
