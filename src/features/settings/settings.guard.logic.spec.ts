import { describe, expect, it } from 'vitest';

import { GUARD_MAX_TOPICS, GUARD_TEST_MAX_CHARS, GUARD_TOPIC_MAX_CHARS } from '@/contracts';

import { copy } from './settings.constants';
import {
  addGuardTopic,
  fillTemplate,
  focusAfterTopicRemoved,
  guardErrorText,
  guardTestDisabledReason,
  removeGuardTopic,
  validateGuardTestInput,
} from './settings.guard.logic';

describe('fillTemplate', () => {
  it('replaces named values and leaves unknown names as written', () => {
    expect(fillTemplate('{n}/{max} หัวข้อ', { n: 3, max: 20 })).toBe('3/20 หัวข้อ');
    expect(fillTemplate('{n} {other}', { n: 1 })).toBe('1 {other}');
  });
});

describe('addGuardTopic', () => {
  it('adds the trimmed topic at the end and keeps the order', () => {
    expect(addGuardTopic(['มุกตลกไทย'], '  มีมจากละคร ')).toEqual({
      ok: true,
      topics: ['มุกตลกไทย', 'มีมจากละคร'],
    });
  });

  it('refuses an empty topic', () => {
    expect(addGuardTopic([], '   ')).toEqual({ ok: false, code: 'topic_required' });
  });

  it('accepts the last free place and refuses one more', () => {
    const list = (n: number) => Array.from({ length: n }, (_, i) => `t${String(i)}`);
    expect(addGuardTopic(list(GUARD_MAX_TOPICS - 1), 'x').ok).toBe(true);
    expect(addGuardTopic(list(GUARD_MAX_TOPICS), 'x')).toEqual({
      ok: false,
      code: 'too_many_topics',
    });
  });

  it('measures the length after trim', () => {
    const edge = 'ก'.repeat(GUARD_TOPIC_MAX_CHARS);
    expect(addGuardTopic([], `  ${edge}  `).ok).toBe(true);
    expect(addGuardTopic([], `${edge}ก`)).toEqual({ ok: false, code: 'topic_too_long' });
  });

  it('refuses a topic that is already in the list after trim', () => {
    expect(addGuardTopic(['มุก'], '  มุก  ')).toEqual({ ok: false, code: 'duplicate_topic' });
  });
});

describe('removeGuardTopic', () => {
  it('removes the topic at the index', () => {
    expect(removeGuardTopic(['a', 'b', 'c'], 1, true)).toEqual({ ok: true, topics: ['a', 'c'] });
  });

  it('refuses to remove the last topic while the guard is on, and allows it when off', () => {
    expect(removeGuardTopic(['a'], 0, true)).toEqual({ ok: false, code: 'topics_required' });
    expect(removeGuardTopic(['a'], 0, false)).toEqual({ ok: true, topics: [] });
  });
});

describe('focusAfterTopicRemoved', () => {
  it('goes to the topic that took the place, else to the input', () => {
    expect(focusAfterTopicRemoved(3, 0)).toBe(0);
    expect(focusAfterTopicRemoved(3, 1)).toBe(1);
    expect(focusAfterTopicRemoved(3, 2)).toBeNull();
    expect(focusAfterTopicRemoved(1, 0)).toBeNull();
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
    expect(guardErrorText('test_too_long')).toContain(String(GUARD_TEST_MAX_CHARS));
  });

  it('gives the text as written for codes without a limit', () => {
    expect(guardErrorText('topics_required')).toBe(copy.guard.errors.topics_required);
    expect(guardErrorText('duplicate_topic')).toBe(copy.guard.errors.duplicate_topic);
    expect(guardErrorText('topic_required')).toBe(copy.guard.errors.topic_required);
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
