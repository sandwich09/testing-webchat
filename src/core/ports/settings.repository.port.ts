import type { EncryptedLineCredentials, ErrorCode, Settings } from '@/core/domain';

export interface SettingsRepository {
  /**
   * Single row. Created with the defaults when missing: aiEnabled false, DEFAULT_AI_MODEL,
   * DEFAULT_AI_DAILY_BUDGET_USD, DEFAULT_POLITE_PARTICLE, empty instructions, guardEnabled false,
   * no guard topics, DEFAULT_GUARD_REFUSAL_TEXT.
   */
  get(): Promise<Settings>;
  update(
    patch: Partial<
      Pick<
        Settings,
        | 'aiEnabled'
        | 'aiModel'
        | 'aiDailyBudget'
        | 'aiPoliteParticle'
        | 'aiInstructions'
        | 'guardEnabled'
        | 'guardTopics'
        | 'guardRefusalText'
      >
    >,
  ): Promise<Settings>;
  getEncryptedLineCredentials(): Promise<EncryptedLineCredentials | null>;
  /** Stores the credentials with the Channel ID and when LINE confirmed the secret (or null). */
  saveLineCredentials(
    c: EncryptedLineCredentials,
    bot: { botName: string; basicId: string },
    channel: { channelId: string; secretVerifiedAt: Date | null },
  ): Promise<void>;
  /** Result of a later secret check: when LINE confirmed it, or null when it refused the pair. */
  recordLineSecretCheck(verifiedAt: Date | null): Promise<void>;
  updateLineBotInfo(bot: { botName: string; basicId: string }): Promise<void>;
  recordWebhookReceived(at: Date): Promise<void>;
  recordLineError(e: { code: ErrorCode; at: Date } | null): Promise<void>;
  recordAiError(e: { code: ErrorCode; at: Date } | null): Promise<void>;
  /** Checks the database connection. Throws when it cannot connect. */
  ping(): Promise<void>;
}
