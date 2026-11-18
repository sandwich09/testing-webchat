import type { ChatModelResponse } from './chat.model';
import type { Contact } from './contact.model';
import type {
  HandoffReason,
  MessageType,
  ModelHandoffReason,
  PoliteParticle,
  UsageOutcome,
} from './enums.model';
import type { NanoUsd } from './ids';
import type { Message } from './message.model';
import type { ErrorCode } from './result';

export interface AiReplyConditionsInput {
  killSwitchOn: boolean;
  contact: Pick<Contact, 'aiEnabled' | 'followStatus'>;
  latestInbound: Pick<Message, 'type'>;
  todayCost: NanoUsd;
  dailyBudget: NanoUsd;
}

export type AiReplyDecision =
  | { reply: true }
  | { reply: false; reason: 'kill_switch_off' | 'contact_ai_off' | 'unfollowed'; handoff: null }
  | { reply: false; reason: 'not_text'; handoff: HandoffReason }
  | { reply: false; reason: 'budget_reached'; handoff: 'budget_reached' };

export function handoffReasonForType(type: Exclude<MessageType, 'text' | 'event'>): HandoffReason {
  switch (type) {
    case 'image':
      return 'customer_sent_image';
    case 'video':
      return 'customer_sent_video';
    case 'sticker':
    case 'other':
      return 'customer_sent_non_text';
  }
}

/** Checks in the order of domain-and-ports (AI): the first failing condition wins. */
export function shouldAiReply(input: AiReplyConditionsInput): AiReplyDecision {
  if (!input.killSwitchOn) return { reply: false, reason: 'kill_switch_off', handoff: null };
  if (!input.contact.aiEnabled) return { reply: false, reason: 'contact_ai_off', handoff: null };
  if (input.contact.followStatus === 'unfollowed') {
    return { reply: false, reason: 'unfollowed', handoff: null };
  }
  const type = input.latestInbound.type;
  if (type !== 'text') {
    // An event line is never the latest inbound message; treat it as non-text media of no kind.
    return {
      reply: false,
      reason: 'not_text',
      handoff: handoffReasonForType(type === 'event' ? 'other' : type),
    };
  }
  if (input.todayCost >= input.dailyBudget) {
    return { reply: false, reason: 'budget_reached', handoff: 'budget_reached' };
  }
  return { reply: true };
}

export function handoffReasonFromModel(r: ModelHandoffReason | null): HandoffReason {
  return r === null ? 'ai_other' : `ai_${r}`;
}

/** The fixed handoff message. After "นะ" the particle "ค่ะ" is written "คะ". */
export function handoffText(particle: PoliteParticle): string {
  const p = particle === 'ค่ะ' ? 'คะ' : 'ครับ';
  return `ขออนุญาตให้แอดมินมาตอบเรื่องนี้นะ${p}`;
}

export function isAiStateStuck(
  c: Pick<Contact, 'aiState' | 'aiStateAt'>,
  now: Date,
  stuckAfterMs: number,
): boolean {
  if (c.aiState !== 'replying') return false;
  if (c.aiStateAt === null) return true;
  return c.aiStateAt.getTime() < now.getTime() - stuckAfterMs;
}

export function usageOutcomeOf(r: ChatModelResponse): {
  outcome: UsageOutcome;
  error: ErrorCode | null;
  handoff: HandoffReason | null;
} {
  if (r.stop === 'refused')
    return { outcome: 'refused', error: 'ai.refused', handoff: 'ai_failed' };
  if (r.stop === 'truncated') {
    return { outcome: 'failed', error: 'ai.truncated', handoff: 'ai_failed' };
  }
  if (r.output === null) {
    return { outcome: 'failed', error: 'ai.invalid_output', handoff: 'ai_failed' };
  }
  if (r.output.needsAdmin) {
    return {
      outcome: 'handoff',
      error: null,
      handoff: handoffReasonFromModel(r.output.handoffReason),
    };
  }
  return { outcome: 'ok', error: null, handoff: null };
}
