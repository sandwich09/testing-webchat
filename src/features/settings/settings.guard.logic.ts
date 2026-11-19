// Pure logic of the topic guard section (ui-screens 8.5).
import {
  GUARD_MAX_TOPICS,
  GUARD_TEST_MAX_CHARS,
  GUARD_TOPIC_MAX_CHARS,
  normalizeGuardTopics,
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

export type GuardTopicAddErrorCode =
  'topic_required' | 'too_many_topics' | 'topic_too_long' | 'duplicate_topic';

/**
 * The topic list with a typed topic added at the end, checked with the same function the server
 * uses (trimmed, at most GUARD_MAX_TOPICS, each at most GUARD_TOPIC_MAX_CHARS, no duplicate).
 */
export function addGuardTopic(
  topics: readonly string[],
  typed: string,
): { ok: true; topics: string[] } | { ok: false; code: GuardTopicAddErrorCode } {
  const topic = typed.trim();
  if (topic === '') return { ok: false, code: 'topic_required' };
  if (topics.length >= GUARD_MAX_TOPICS) return { ok: false, code: 'too_many_topics' };
  const { topics: next, issue } = normalizeGuardTopics([...topics, topic]);
  if (issue === 'too_long') return { ok: false, code: 'topic_too_long' };
  if (issue === 'duplicate') return { ok: false, code: 'duplicate_topic' };
  if (issue === 'too_many') return { ok: false, code: 'too_many_topics' };
  return { ok: true, topics: next };
}

/**
 * The topic list without the topic at `index`. The last topic cannot go while the guard is on,
 * because the guard cannot be on without a topic: turn it off first.
 */
export function removeGuardTopic(
  topics: readonly string[],
  index: number,
  guardEnabled: boolean,
): { ok: true; topics: string[] } | { ok: false; code: 'topics_required' } {
  const next = topics.filter((_, i) => i !== index);
  if (next.length === 0 && guardEnabled) return { ok: false, code: 'topics_required' };
  return { ok: true, topics: next };
}

/**
 * Where focus goes after the topic at `index` was removed from a list of `countBefore`: the
 * delete button of the topic that took its place, or `null` for the add input when none did.
 */
export function focusAfterTopicRemoved(countBefore: number, index: number): number | null {
  return index < countBefore - 1 ? index : null;
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
  code: GuardTopicAddErrorCode | 'topics_required' | GuardTestErrorCode,
): string {
  const template = copy.guard.errors[code];
  switch (code) {
    case 'too_many_topics':
      return fillTemplate(template, { max: GUARD_MAX_TOPICS });
    case 'topic_too_long':
      return fillTemplate(template, { max: GUARD_TOPIC_MAX_CHARS });
    case 'test_too_long':
      return fillTemplate(template, { max: GUARD_TEST_MAX_CHARS });
    case 'topics_required':
    case 'topic_required':
    case 'duplicate_topic':
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
