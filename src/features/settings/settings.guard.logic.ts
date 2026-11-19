// Pure logic of the topic guard section and the Guardrails panel (ui-screens 8.5).
import {
  GUARD_MAX_TOPICS,
  GUARD_REFUSAL_MAX_CHARS,
  GUARD_TEST_MAX_CHARS,
  GUARD_TOPIC_MAX_CHARS,
  normalizeGuardTopics,
  type GuardrailStatsDto,
  type SettingsDto,
} from '@/contracts';

import { copy } from './settings.constants';

/** Replaces each `{name}` of a copy text. A name without a value stays as written. */
export function fillTemplate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{([A-Za-z]+)\}/g, (whole, name: string) => {
    const value = values[name];
    return value === undefined ? whole : String(value);
  });
}

/** One topic per line, as the topics textarea shows them. */
export function guardTopicsToText(topics: string[]): string {
  return topics.join('\n');
}

/** The lines of the topics textarea. Both "\n" and "\r\n" split. */
function topicLines(text: string): string[] {
  return text.split(/\r?\n/);
}

/** Number of non-empty lines, for the counter under the topics textarea. */
export function countGuardTopicLines(text: string): number {
  return topicLines(text).filter((line) => line.trim() !== '').length;
}

export type GuardTopicsErrorCode =
  'topics_required' | 'too_many_topics' | 'topic_too_long' | 'duplicate_topic';

/**
 * Splits the textarea into lines and normalises them with the same function the server uses.
 * An empty result is an error only while the guard is on, because the guard cannot be on
 * without a topic.
 */
export function validateGuardTopicsInput(
  text: string,
  guardEnabled: boolean,
): { ok: true; topics: string[] } | { ok: false; code: GuardTopicsErrorCode } {
  const { topics, issue } = normalizeGuardTopics(topicLines(text));
  if (issue === 'too_many') return { ok: false, code: 'too_many_topics' };
  if (issue === 'too_long') return { ok: false, code: 'topic_too_long' };
  if (issue === 'duplicate') return { ok: false, code: 'duplicate_topic' };
  if (topics.length === 0 && guardEnabled) return { ok: false, code: 'topics_required' };
  return { ok: true, topics };
}

export type GuardRefusalErrorCode = 'refusal_required' | 'refusal_too_long';

/** The refusal text is 1 to the limit characters after trim. */
export function validateGuardRefusal(
  text: string,
): { ok: true } | { ok: false; code: GuardRefusalErrorCode } {
  const length = text.trim().length;
  if (length === 0) return { ok: false, code: 'refusal_required' };
  if (length > GUARD_REFUSAL_MAX_CHARS) return { ok: false, code: 'refusal_too_long' };
  return { ok: true };
}

export type GuardTestErrorCode = 'test_required' | 'test_too_long';

/** The message to try is 1 to the limit characters after trim. */
export function validateGuardTestInput(
  text: string,
): { ok: true } | { ok: false; code: GuardTestErrorCode } {
  const length = text.trim().length;
  if (length === 0) return { ok: false, code: 'test_required' };
  if (length > GUARD_TEST_MAX_CHARS) return { ok: false, code: 'test_too_long' };
  return { ok: true };
}

/** Thai text of a code from the validators above, with its limit filled in. */
export function guardErrorText(
  code: GuardTopicsErrorCode | GuardRefusalErrorCode | GuardTestErrorCode,
): string {
  const template = copy.guard.errors[code];
  switch (code) {
    case 'too_many_topics':
      return fillTemplate(template, { max: GUARD_MAX_TOPICS });
    case 'topic_too_long':
      return fillTemplate(template, { max: GUARD_TOPIC_MAX_CHARS });
    case 'refusal_too_long':
      return fillTemplate(template, { max: GUARD_REFUSAL_MAX_CHARS });
    case 'test_too_long':
      return fillTemplate(template, { max: GUARD_TEST_MAX_CHARS });
    case 'topics_required':
    case 'duplicate_topic':
    case 'refusal_required':
    case 'test_required':
      return template;
  }
}

/** Why the try-a-message box is off, from the saved settings; `null` when it can be used. */
export function guardTestDisabledReason(settings: {
  ai: Pick<SettingsDto['ai'], 'enabled'>;
  guard: Pick<SettingsDto['guard'], 'topics'>;
}): null | 'killed' | 'needs_topics' {
  if (!settings.ai.enabled) return 'killed';
  if (settings.guard.topics.length === 0) return 'needs_topics';
  return null;
}

export type GuardrailMetric =
  | 'aiEnabled'
  | 'guardBlocked'
  | 'nonText'
  | 'outputRejected'
  | 'noTools'
  | 'handoffNotInKnowledge'
  | 'handoffNeedsHuman'
  | 'handoffFailedOrTimeout'
  | 'handoffOther'
  | 'budgetReached';

export type GuardrailLayer = 'input' | 'output' | 'action' | 'human' | 'control';

export type GuardrailRow = {
  layer: GuardrailLayer;
  metric: GuardrailMetric;
  /** A count, an on/off state, or `null` for the row that has no number (the action layer). */
  value: number | boolean | null;
};

/** The rows of the Guardrails panel in the order of ui-screens 9.14. */
export function guardrailRows(stats: GuardrailStatsDto): GuardrailRow[] {
  return [
    { layer: 'control', metric: 'aiEnabled', value: stats.aiEnabled },
    { layer: 'input', metric: 'guardBlocked', value: stats.guardBlocked },
    { layer: 'input', metric: 'nonText', value: stats.nonText },
    { layer: 'output', metric: 'outputRejected', value: stats.outputRejected },
    { layer: 'action', metric: 'noTools', value: null },
    { layer: 'human', metric: 'handoffNotInKnowledge', value: stats.handoffs.notInKnowledge },
    { layer: 'human', metric: 'handoffNeedsHuman', value: stats.handoffs.needsHuman },
    { layer: 'human', metric: 'handoffFailedOrTimeout', value: stats.handoffs.failedOrTimeout },
    { layer: 'human', metric: 'handoffOther', value: stats.handoffs.other },
    { layer: 'control', metric: 'budgetReached', value: stats.budgetReached },
  ];
}
