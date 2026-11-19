import type { NanoUsd } from '@/core/domain';
import {
  GUARD_MAX_TOKENS,
  GUARD_MODEL,
  GUARD_TIMEOUT_MS,
  bangkokDayRange,
  computeCost,
  err,
  guardVerdictOf,
  isNoResponse,
  noResponseUsage,
  ok,
} from '@/core/domain';
import { makeHitRateLimit } from './shared/hit-rate-limit';
import type { AllPorts, UseCase, UseCaseConfig } from './types';

/** The route has checked 1 to GUARD_TEST_MAX_CHARS characters after trimming. */
export type TestTopicGuardInput = { text: string };

export type TestTopicGuardOutput = {
  allowed: boolean;
  /** One of the saved topics, or null. */
  matchedTopic: string | null;
  /** Cost of this check, the same as its AiUsage row. */
  cost: NanoUsd;
};

export type TestTopicGuardError =
  | 'settings.guard_rate_limited'
  | 'ai.disabled_globally'
  | 'settings.guard_topics_required'
  | 'ai.budget_exhausted'
  | 'ai.unavailable'
  | 'ai.no_response'
  | 'ai.rate_limited'
  | 'ai.auth_failed'
  | 'ai.bad_request'
  | 'ai.refused'
  | 'ai.truncated'
  | 'ai.invalid_output';

export type TestTopicGuardDeps = Pick<
  AllPorts,
  'rateLimits' | 'hasher' | 'settings' | 'usage' | 'topicGuard' | 'ids' | 'clock' | 'logger'
>;

/**
 * Tries the topic guard on text the admin typed, with the saved topics. It sends nothing to a
 * customer, and every answer from the API is recorded as AiUsage so the cost shows in the report.
 */
export const makeTestTopicGuard: (
  deps: TestTopicGuardDeps,
  config: UseCaseConfig,
) => UseCase<TestTopicGuardInput, TestTopicGuardOutput, TestTopicGuardError> = (deps, config) => {
  const { settings, usage, topicGuard, ids, clock, logger } = deps;
  const hitRateLimit = makeHitRateLimit(deps, config);

  return async ({ text }, ctx) => {
    const now = clock.now();

    const limit = await hitRateLimit('guard_test', ctx.clientIp ?? 'unknown', now);
    if (limit.limited) {
      return err('settings.guard_rate_limited', undefined, limit.retryAfterSeconds);
    }

    const s = await settings.get();
    if (!s.aiEnabled) return err('ai.disabled_globally');
    if (s.guardTopics.length === 0) return err('settings.guard_topics_required');
    const spent = await usage.sumCost(bangkokDayRange(now));
    if (spent >= s.aiDailyBudget) return err('ai.budget_exhausted');

    const g = await topicGuard.classify({
      topics: s.guardTopics,
      message: text,
      context: [],
      model: GUARD_MODEL,
      maxTokens: GUARD_MAX_TOKENS,
      timeoutMs: GUARD_TIMEOUT_MS,
    });
    if (!g.ok) {
      // Sent without an answer: may be billed, so it gets a zero-cost row (usage-cost).
      if (isNoResponse(g.error.code)) {
        await usage.insert(
          noResponseUsage({
            id: ids.usageId(),
            kind: 'guard',
            contactId: null,
            documentId: null,
            provider: s.aiProvider,
            model: GUARD_MODEL,
            createdAt: now,
          }),
        );
      }
      await settings.recordAiError({ code: g.error.code, at: now });
      logger.log('warn', 'guard.failed', { requestId: ctx.requestId, errorCode: g.error.code });
      return err(g.error.code);
    }

    const { cost } = computeCost(g.value.usage, g.value.servedModel, config.priceTable);
    const v = guardVerdictOf(g.value, s.guardTopics);
    const outcome = v.verdict === 'failed' ? 'failed' : v.verdict === 'blocked' ? 'blocked' : 'ok';
    const usageId = ids.usageId();
    await usage.insert({
      id: usageId,
      kind: 'guard',
      contactId: null,
      messageId: null,
      documentId: null,
      provider: s.aiProvider,
      model: g.value.servedModel,
      usage: g.value.usage,
      cost,
      outcome,
      error: v.error,
      createdAt: now,
    });

    const fields = {
      requestId: ctx.requestId,
      usageId,
      model: g.value.servedModel,
      inputTokens: g.value.usage.inputTokens,
      outputTokens: g.value.usage.outputTokens,
      costNanoUsd: cost.toString(),
    };
    if (v.error !== null) {
      // A failed verdict is an AI error like a port error, so the status screen shows it.
      await settings.recordAiError({ code: v.error, at: now });
      logger.log('warn', 'guard.failed', { ...fields, errorCode: v.error });
      // guardVerdictOf sets error only to one of these three codes when the verdict is failed.
      return err(v.error as 'ai.refused' | 'ai.truncated' | 'ai.invalid_output');
    }
    logger.log('info', 'guard.checked', { ...fields, outcome });
    return ok({ allowed: v.verdict === 'allowed', matchedTopic: v.matchedTopic, cost });
  };
};
