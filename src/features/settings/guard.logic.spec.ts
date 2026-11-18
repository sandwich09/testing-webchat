import { describe, expect, it } from 'vitest';

import {
  GUARD_MAX_TOPICS,
  GUARD_REFUSAL_MAX_CHARS,
  GUARD_TEST_MAX_CHARS,
  GUARD_TOPIC_MAX_CHARS,
  type GuardrailStatsDto,
} from '@/contracts';

import {
  countGuardTopicLines,
  fillTemplate,
  guardErrorText,
  guardrailRows,
  guardTestDisabledReason,
  guardTopicsToText,
  validateGuardRefusal,
  validateGuardTestInput,
  validateGuardTopicsInput,
} from './guard.logic';
import { copy } from './settings.constants';

describe('fillTemplate', () => {
  it('replaces named values and leaves unknown names as written', () => {
    expect(fillTemplate('{n}/{max} หัวข้อ', { n: 3, max: 20 })).toBe('3/20 หัวข้อ');
    expect(fillTemplate('{n} {other}', { n: 1 })).toBe('1 {other}');
  });
});

describe('guardTopicsToText and countGuardTopicLines', () => {
  it('writes one topic per line', () => {
    expect(guardTopicsToText(['มุกตลกไทย', 'มีมจากละคร'])).toBe('มุกตลกไทย\nมีมจากละคร');
    expect(guardTopicsToText([])).toBe('');
  });

  it('counts only the lines that are not empty after trim', () => {
    expect(countGuardTopicLines('')).toBe(0);
    expect(countGuardTopicLines('a\n\n  \r\nb\n')).toBe(2);
  });
});

describe('validateGuardTopicsInput', () => {
  it('returns the trimmed topics in order and drops empty lines', () => {
    expect(validateGuardTopicsInput('  มุกตลกไทย \n\nมีม\r\n', true)).toEqual({
      ok: true,
      topics: ['มุกตลกไทย', 'มีม'],
    });
  });

  it('requires a topic only while the guard is on', () => {
    expect(validateGuardTopicsInput(' \n ', true)).toEqual({ ok: false, code: 'topics_required' });
    expect(validateGuardTopicsInput('', true)).toEqual({ ok: false, code: 'topics_required' });
    expect(validateGuardTopicsInput(' \n ', false)).toEqual({ ok: true, topics: [] });
  });

  it('accepts exactly the maximum number of topics and rejects one more', () => {
    const lines = (n: number) => Array.from({ length: n }, (_, i) => `t${String(i)}`).join('\n');
    expect(validateGuardTopicsInput(lines(GUARD_MAX_TOPICS), true).ok).toBe(true);
    expect(validateGuardTopicsInput(lines(GUARD_MAX_TOPICS + 1), true)).toEqual({
      ok: false,
      code: 'too_many_topics',
    });
  });

  it('measures the length of a topic after trim', () => {
    const edge = 'ก'.repeat(GUARD_TOPIC_MAX_CHARS);
    expect(validateGuardTopicsInput(`  ${edge}  `, true).ok).toBe(true);
    expect(validateGuardTopicsInput(`${edge}ก`, true)).toEqual({
      ok: false,
      code: 'topic_too_long',
    });
  });

  it('finds duplicates after trim', () => {
    expect(validateGuardTopicsInput('มุก\n  มุก  ', true)).toEqual({
      ok: false,
      code: 'duplicate_topic',
    });
  });
});

describe('validateGuardRefusal', () => {
  it('requires text after trim and limits the length', () => {
    expect(validateGuardRefusal('  ')).toEqual({ ok: false, code: 'refusal_required' });
    expect(validateGuardRefusal('ก'.repeat(GUARD_REFUSAL_MAX_CHARS))).toEqual({ ok: true });
    expect(validateGuardRefusal(`${'ก'.repeat(GUARD_REFUSAL_MAX_CHARS)}ก`)).toEqual({
      ok: false,
      code: 'refusal_too_long',
    });
    expect(validateGuardRefusal(` ${'ก'.repeat(GUARD_REFUSAL_MAX_CHARS)} `)).toEqual({ ok: true });
  });
});

describe('validateGuardTestInput', () => {
  it('requires text after trim and limits the length', () => {
    expect(validateGuardTestInput('')).toEqual({ ok: false, code: 'test_required' });
    expect(validateGuardTestInput('สวัสดี')).toEqual({ ok: true });
    expect(validateGuardTestInput('ก'.repeat(GUARD_TEST_MAX_CHARS))).toEqual({ ok: true });
    expect(validateGuardTestInput('ก'.repeat(GUARD_TEST_MAX_CHARS + 1))).toEqual({
      ok: false,
      code: 'test_too_long',
    });
  });
});

describe('guardErrorText', () => {
  it('fills the limit of each code that has one', () => {
    expect(guardErrorText('too_many_topics')).toBe(`ใส่ได้ไม่เกิน ${String(GUARD_MAX_TOPICS)} หัวข้อ`);
    expect(guardErrorText('topic_too_long')).toContain(String(GUARD_TOPIC_MAX_CHARS));
    expect(guardErrorText('refusal_too_long')).toContain(String(GUARD_REFUSAL_MAX_CHARS));
    expect(guardErrorText('test_too_long')).toContain(String(GUARD_TEST_MAX_CHARS));
  });

  it('gives the text as written for codes without a limit', () => {
    expect(guardErrorText('topics_required')).toBe(copy.guard.errors.topics_required);
    expect(guardErrorText('duplicate_topic')).toBe(copy.guard.errors.duplicate_topic);
    expect(guardErrorText('refusal_required')).toBe(copy.guard.errors.refusal_required);
    expect(guardErrorText('test_required')).toBe(copy.guard.errors.test_required);
  });
});

describe('guardTestDisabledReason', () => {
  const settings = (enabled: boolean, topics: string[]) => ({
    ai: { enabled },
    guard: { topics },
  });

  it('says killed first, then needs_topics, otherwise null', () => {
    expect(guardTestDisabledReason(settings(false, ['a']))).toBe('killed');
    expect(guardTestDisabledReason(settings(false, []))).toBe('killed');
    expect(guardTestDisabledReason(settings(true, []))).toBe('needs_topics');
    expect(guardTestDisabledReason(settings(true, ['a']))).toBeNull();
  });
});

describe('guardrailRows', () => {
  const stats: GuardrailStatsDto = {
    aiEnabled: true,
    guardEnabled: true,
    guardBlocked: 4,
    outputRejected: 2,
    handoffs: { notInKnowledge: 5, needsHuman: 6, failedOrTimeout: 7, other: 8 },
    budgetReached: 1,
    nonText: 3,
  };

  it('lists the ten rows in the order of the panel with their layers', () => {
    expect(guardrailRows(stats)).toEqual([
      { layer: 'control', metric: 'aiEnabled', value: true },
      { layer: 'input', metric: 'guardBlocked', value: 4 },
      { layer: 'input', metric: 'nonText', value: 3 },
      { layer: 'output', metric: 'outputRejected', value: 2 },
      { layer: 'action', metric: 'noTools', value: null },
      { layer: 'human', metric: 'handoffNotInKnowledge', value: 5 },
      { layer: 'human', metric: 'handoffNeedsHuman', value: 6 },
      { layer: 'human', metric: 'handoffFailedOrTimeout', value: 7 },
      { layer: 'human', metric: 'handoffOther', value: 8 },
      { layer: 'control', metric: 'budgetReached', value: 1 },
    ]);
  });

  it('carries a switched-off AI as false', () => {
    expect(guardrailRows({ ...stats, aiEnabled: false })[0]?.value).toBe(false);
  });
});
