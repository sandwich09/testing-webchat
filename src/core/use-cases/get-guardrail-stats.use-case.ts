import { bangkokDayRange, ok } from '@/core/domain';
import type { AllPorts, UseCase, UseCaseConfig } from './types';

/** Today's numbers (Bangkok time) of the Guardrails section. Read only. */
export interface GuardrailStats {
  /** Kill switch. */
  aiEnabled: boolean;
  guardEnabled: boolean;
  /** AiUsage kind guard with outcome blocked. */
  guardBlocked: number;
  /** AiUsage of every kind whose error is ai.invalid_output or ai.refused. */
  outputRejected: number;
  handoffs: { notInKnowledge: number; needsHuman: number; failedOrTimeout: number; other: number };
  /** handoff.budget_reached event lines. */
  budgetReached: number;
  /** handoff.customer_sent_image, _video and _non_text event lines. */
  nonText: number;
}

export type GetGuardrailStatsInput = Record<string, never>;

export type GetGuardrailStatsOutput = GuardrailStats;

export type GetGuardrailStatsDeps = Pick<AllPorts, 'settings' | 'usage' | 'messages' | 'clock'>;

export const makeGetGuardrailStats: (
  deps: GetGuardrailStatsDeps,
  config: UseCaseConfig,
) => UseCase<GetGuardrailStatsInput, GetGuardrailStatsOutput> =
  ({ settings, usage, messages, clock }) =>
  async () => {
    const range = bangkokDayRange(clock.now());
    const [s, safety, events] = await Promise.all([
      settings.get(),
      usage.countSafetyOutcomes(range),
      messages.countEventsByCode(range),
    ]);
    const n = (code: keyof typeof events): number => events[code] ?? 0;

    return ok({
      aiEnabled: s.aiEnabled,
      guardEnabled: s.guardEnabled,
      guardBlocked: safety.guardBlocked,
      outputRejected: safety.outputRejected,
      handoffs: {
        notInKnowledge: n('handoff.ai_not_in_knowledge'),
        needsHuman: n('handoff.ai_needs_human_action'),
        failedOrTimeout: n('handoff.ai_failed') + n('handoff.ai_timeout'),
        other: n('handoff.ai_unsafe_or_offtopic') + n('handoff.ai_other'),
      },
      budgetReached: n('handoff.budget_reached'),
      nonText:
        n('handoff.customer_sent_image') +
        n('handoff.customer_sent_video') +
        n('handoff.customer_sent_non_text'),
    });
  };
