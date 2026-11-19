import { describe, expect, it } from 'vitest';
import {
  handoffReasonForType,
  handoffReasonFromModel,
  handoffText,
  isAiStateStuck,
  shouldAiReply,
  usageOutcomeOf,
  type AiReplyConditionsInput,
} from './ai-decision.logic';
import type { ChatModelResponse } from './chat.model';
import { MODEL_HANDOFF_REASONS } from './enums.model';
import type { NanoUsd } from './ids';

const usd = (n: bigint): NanoUsd => n as NanoUsd; // test helper: brand a literal

const base: AiReplyConditionsInput = {
  killSwitchOn: true,
  contact: { aiEnabled: true, followStatus: 'following' },
  latestInbound: { type: 'text' },
  todayCost: usd(0n),
  dailyBudget: usd(100n),
};

describe('shouldAiReply', () => {
  it('replies when every condition passes', () => {
    expect(shouldAiReply(base)).toEqual({ reply: true });
  });

  it('1: kill switch off', () => {
    expect(shouldAiReply({ ...base, killSwitchOn: false })).toEqual({
      reply: false,
      reason: 'kill_switch_off',
      handoff: null,
    });
  });

  it('2: contact AI off', () => {
    expect(
      shouldAiReply({ ...base, contact: { aiEnabled: false, followStatus: 'following' } }),
    ).toEqual({
      reply: false,
      reason: 'contact_ai_off',
      handoff: null,
    });
  });

  it('3: unfollowed', () => {
    expect(
      shouldAiReply({ ...base, contact: { aiEnabled: true, followStatus: 'unfollowed' } }),
    ).toEqual({
      reply: false,
      reason: 'unfollowed',
      handoff: null,
    });
  });

  it.each([
    ['image', 'customer_sent_image'],
    ['video', 'customer_sent_video'],
    ['sticker', 'customer_sent_non_text'],
    ['other', 'customer_sent_non_text'],
  ] as const)('4: latest inbound %s hands off as %s', (type, handoff) => {
    expect(shouldAiReply({ ...base, latestInbound: { type } })).toEqual({
      reply: false,
      reason: 'not_text',
      handoff,
    });
  });

  it('4: an event type is treated as non-text', () => {
    expect(shouldAiReply({ ...base, latestInbound: { type: 'event' } })).toEqual({
      reply: false,
      reason: 'not_text',
      handoff: 'customer_sent_non_text',
    });
  });

  it('5: budget reached at the boundary and above, not below', () => {
    const budget = { reply: false, reason: 'budget_reached', handoff: 'budget_reached' };
    expect(shouldAiReply({ ...base, todayCost: usd(100n) })).toEqual(budget);
    expect(shouldAiReply({ ...base, todayCost: usd(101n) })).toEqual(budget);
    expect(shouldAiReply({ ...base, todayCost: usd(99n) })).toEqual({ reply: true });
  });

  it('returns the first failing reason, in order', () => {
    const all: AiReplyConditionsInput = {
      killSwitchOn: false,
      contact: { aiEnabled: false, followStatus: 'unfollowed' },
      latestInbound: { type: 'image' },
      todayCost: usd(500n),
      dailyBudget: usd(100n),
    };
    expect(shouldAiReply(all)).toMatchObject({ reason: 'kill_switch_off' });
    expect(shouldAiReply({ ...all, killSwitchOn: true })).toMatchObject({
      reason: 'contact_ai_off',
    });
    expect(
      shouldAiReply({
        ...all,
        killSwitchOn: true,
        contact: { aiEnabled: true, followStatus: 'unfollowed' },
      }),
    ).toMatchObject({ reason: 'unfollowed' });
    expect(
      shouldAiReply({
        ...all,
        killSwitchOn: true,
        contact: { aiEnabled: true, followStatus: 'following' },
      }),
    ).toMatchObject({ reason: 'not_text' });
  });

  it('not_text comes before budget_reached', () => {
    expect(
      shouldAiReply({ ...base, latestInbound: { type: 'video' }, todayCost: usd(100n) }),
    ).toMatchObject({ reason: 'not_text', handoff: 'customer_sent_video' });
  });
});

describe('handoffReasonForType', () => {
  it('maps each non-text type', () => {
    expect(handoffReasonForType('image')).toBe('customer_sent_image');
    expect(handoffReasonForType('video')).toBe('customer_sent_video');
    expect(handoffReasonForType('sticker')).toBe('customer_sent_non_text');
    expect(handoffReasonForType('other')).toBe('customer_sent_non_text');
  });
});

describe('handoffReasonFromModel', () => {
  it('prefixes the model reason with ai_', () => {
    for (const r of MODEL_HANDOFF_REASONS) expect(handoffReasonFromModel(r)).toBe(`ai_${r}`);
  });

  it('maps null to ai_other', () => {
    expect(handoffReasonFromModel(null)).toBe('ai_other');
  });
});

describe('handoffText', () => {
  it('uses คะ after นะ for ค่ะ', () => {
    expect(handoffText('ค่ะ')).toBe('ขออนุญาตให้แอดมินมาตอบเรื่องนี้นะคะ');
  });

  it('uses ครับ for ครับ', () => {
    expect(handoffText('ครับ')).toBe('ขออนุญาตให้แอดมินมาตอบเรื่องนี้นะครับ');
  });
});

describe('isAiStateStuck', () => {
  const now = new Date('2026-11-18T10:00:00Z');
  const ms = 60_000;

  it('is false when idle, whatever the time', () => {
    expect(isAiStateStuck({ aiState: 'idle', aiStateAt: null }, now, ms)).toBe(false);
    expect(isAiStateStuck({ aiState: 'idle', aiStateAt: new Date(0) }, now, ms)).toBe(false);
  });

  it('is true when replying with no time', () => {
    expect(isAiStateStuck({ aiState: 'replying', aiStateAt: null }, now, ms)).toBe(true);
  });

  it('is true only when strictly older than now - stuckAfterMs', () => {
    const at = (offset: number) => new Date(now.getTime() - offset);
    expect(isAiStateStuck({ aiState: 'replying', aiStateAt: at(ms + 1) }, now, ms)).toBe(true);
    expect(isAiStateStuck({ aiState: 'replying', aiStateAt: at(ms) }, now, ms)).toBe(false);
    expect(isAiStateStuck({ aiState: 'replying', aiStateAt: at(ms - 1) }, now, ms)).toBe(false);
  });
});

describe('usageOutcomeOf', () => {
  const usage = { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 };
  const res = (p: Partial<ChatModelResponse>): ChatModelResponse => ({
    stop: 'completed',
    output: { reply: 'x', needsAdmin: false, handoffReason: null },
    usage,
    servedModel: 'claude-opus-5-5',
    ...p,
  });

  it('refused', () => {
    expect(usageOutcomeOf(res({ stop: 'refused', output: null }))).toEqual({
      outcome: 'refused',
      error: 'ai.refused',
      handoff: 'ai_failed',
    });
  });

  it('truncated', () => {
    expect(usageOutcomeOf(res({ stop: 'truncated', output: null }))).toEqual({
      outcome: 'failed',
      error: 'ai.truncated',
      handoff: 'ai_failed',
    });
  });

  it('completed with null output is invalid', () => {
    expect(usageOutcomeOf(res({ output: null }))).toEqual({
      outcome: 'failed',
      error: 'ai.invalid_output',
      handoff: 'ai_failed',
    });
  });

  it('needsAdmin hands off with the model reason', () => {
    expect(
      usageOutcomeOf(
        res({ output: { reply: 'x', needsAdmin: true, handoffReason: 'not_in_knowledge' } }),
      ),
    ).toEqual({ outcome: 'handoff', error: null, handoff: 'ai_not_in_knowledge' });
  });

  it('needsAdmin with a null reason hands off as ai_other', () => {
    expect(
      usageOutcomeOf(res({ output: { reply: 'x', needsAdmin: true, handoffReason: null } })),
    ).toEqual({ outcome: 'handoff', error: null, handoff: 'ai_other' });
  });

  it('a normal answer is ok', () => {
    expect(usageOutcomeOf(res({}))).toEqual({ outcome: 'ok', error: null, handoff: null });
  });
});
