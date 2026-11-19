import { describe, expect, it } from 'vitest';
import {
  AI_INSTRUCTIONS_MAX_CHARS,
  AI_NAME_MAX_CHARS,
  GUARD_MAX_TOPICS,
  GUARD_TEST_MAX_CHARS,
  GUARD_TOPIC_MAX_CHARS,
} from './limits.contract';
import {
  lineBotInfoResponseSchema,
  setLineCredentialsBodySchema,
  testTopicGuardBodySchema,
  testTopicGuardResponseSchema,
  updateSettingsBodySchema,
} from './settings.contract';
import {
  HOW_TO_TEXT_MAX_CHARS,
  LINE_CHANNEL_ID_MAX_CHARS,
  WELCOME_TEXT_MAX_CHARS,
} from './limits.contract';

describe('updateSettingsBodySchema', () => {
  it('accepts each field alone', () => {
    for (const body of [
      { aiEnabled: true },
      { aiModel: 'claude-haiku-5-5' },
      { aiDailyBudgetUsd: '5.00' },
      { aiPoliteParticle: 'ครับ' },
      { aiInstructions: '' },
      { aiName: 'มินนี่' },
      { aiName: '' },
      { aiAnswerMode: 'knowledge_only' },
      { aiAnswerMode: 'general' },
      { guardEnabled: true },
      { guardTopics: [] },
      { guardTopics: ['มุกตลกไทย'] },
      { howToText: '' },
      { welcomeText: 'สวัสดี' },
      { welcomeEnabled: false },
    ]) {
      expect(updateSettingsBodySchema.safeParse(body).success).toBe(true);
    }
  });

  it('accepts budgets up to the cap and rejects above it', () => {
    for (const ok of ['0', '9', '9.99', '10', '10.0', '10.00', '0010']) {
      expect(updateSettingsBodySchema.safeParse({ aiDailyBudgetUsd: ok }).success, ok).toBe(true);
    }
    for (const bad of ['10.01', '11', '99.99', '1000', '5.123', '.5', '-1', '1e1', '12345', '']) {
      expect(updateSettingsBodySchema.safeParse({ aiDailyBudgetUsd: bad }).success, bad).toBe(
        false,
      );
    }
  });

  it('rejects empty, unknown, mistyped and over-long input', () => {
    expect(updateSettingsBodySchema.safeParse({}).success).toBe(false);
    expect(updateSettingsBodySchema.safeParse({ aiEnabled: true, extra: 1 }).success).toBe(false);
    expect(updateSettingsBodySchema.safeParse({ aiModel: 'gpt' }).success).toBe(false);
    expect(updateSettingsBodySchema.safeParse({ aiPoliteParticle: 'จ้ะ' }).success).toBe(false);
    expect(updateSettingsBodySchema.safeParse({ aiDailyBudgetUsd: 5 }).success).toBe(false);
    expect(
      updateSettingsBodySchema.safeParse({
        aiInstructions: 'x'.repeat(AI_INSTRUCTIONS_MAX_CHARS + 1),
      }).success,
    ).toBe(false);
  });
});

describe('updateSettingsBodySchema: rich menu and welcome texts', () => {
  it('trims and allows the limits after trimming, and rejects longer texts', () => {
    const howTo = updateSettingsBodySchema.safeParse({
      howToText: ` ${'ก'.repeat(HOW_TO_TEXT_MAX_CHARS)} `,
    });
    expect(howTo.success && howTo.data.howToText?.length).toBe(HOW_TO_TEXT_MAX_CHARS);
    expect(
      updateSettingsBodySchema.safeParse({ howToText: 'ก'.repeat(HOW_TO_TEXT_MAX_CHARS + 1) })
        .success,
    ).toBe(false);
    expect(
      updateSettingsBodySchema.safeParse({ welcomeText: 'ก'.repeat(WELCOME_TEXT_MAX_CHARS + 1) })
        .success,
    ).toBe(false);
    expect(updateSettingsBodySchema.safeParse({ welcomeEnabled: 'yes' }).success).toBe(false);
  });
});

describe('updateSettingsBodySchema: AI name and answer scope', () => {
  const name = (raw: unknown) => updateSettingsBodySchema.safeParse({ aiName: raw });

  it('trims the name and allows AI_NAME_MAX_CHARS after trimming', () => {
    const parsed = name(`  ${'ก'.repeat(AI_NAME_MAX_CHARS)}  `);
    expect(parsed.success && parsed.data.aiName).toBe('ก'.repeat(AI_NAME_MAX_CHARS));
    expect(name('   ').success && name('   ').data?.aiName).toBe('');
  });

  it('rejects a longer name, a line break, a control character and a non-string', () => {
    expect(name('ก'.repeat(AI_NAME_MAX_CHARS + 1)).success).toBe(false);
    expect(name('มิน\nนี่').success).toBe(false);
    expect(name('มิน\tนี่').success).toBe(false);
    expect(name('มิน\u0000').success).toBe(false);
    expect(name(null).success).toBe(false);
  });

  it('accepts the two answer scopes only', () => {
    expect(updateSettingsBodySchema.safeParse({ aiAnswerMode: 'all' }).success).toBe(false);
  });
});

describe('updateSettingsBodySchema: topic guard', () => {
  const topics = (raw: unknown) => updateSettingsBodySchema.safeParse({ guardTopics: raw });

  it('accepts up to GUARD_MAX_TOPICS topics of up to GUARD_TOPIC_MAX_CHARS after trimming', () => {
    const max = Array.from({ length: GUARD_MAX_TOPICS }, (_, i) => `หัวข้อ ${String(i)}`);
    expect(topics(max).success).toBe(true);
    expect(topics([` ${'ก'.repeat(GUARD_TOPIC_MAX_CHARS)} `]).success).toBe(true);
  });

  it('keeps the topics as sent; UpdateSettings trims them', () => {
    const parsed = topics([' a ', 'b']);
    expect(parsed.success && parsed.data.guardTopics).toEqual([' a ', 'b']);
  });

  it('rejects too many, too long, duplicate, empty and mistyped topics', () => {
    const many = Array.from({ length: GUARD_MAX_TOPICS + 1 }, (_, i) => `t${String(i)}`);
    expect(topics(many).success).toBe(false);
    expect(topics(['ก'.repeat(GUARD_TOPIC_MAX_CHARS + 1)]).success).toBe(false);
    expect(topics(['มุก', ' มุก ']).success).toBe(false);
    expect(topics(['a', '']).success).toBe(false);
    expect(topics(['a', '   ']).success).toBe(false);
    expect(topics('a').success).toBe(false);
    expect(topics([1]).success).toBe(false);
  });

  it('rejects the refusal text, which is fixed in code', () => {
    expect(updateSettingsBodySchema.safeParse({ guardRefusalText: 'ไม่ตอบนะคะ' }).success).toBe(
      false,
    );
  });

  it('rejects a non-boolean guardEnabled', () => {
    expect(updateSettingsBodySchema.safeParse({ guardEnabled: 'true' }).success).toBe(false);
  });
});

describe('POST /api/settings/guard/test', () => {
  it('trims the text and bounds it to 1 to GUARD_TEST_MAX_CHARS', () => {
    const parsed = testTopicGuardBodySchema.safeParse({ text: '  เล่ามุกหน่อย ' });
    expect(parsed.success && parsed.data.text).toBe('เล่ามุกหน่อย');
    expect(
      testTopicGuardBodySchema.safeParse({ text: 'x'.repeat(GUARD_TEST_MAX_CHARS) }).success,
    ).toBe(true);
    for (const text of ['', '  ', 'x'.repeat(GUARD_TEST_MAX_CHARS + 1)]) {
      expect(testTopicGuardBodySchema.safeParse({ text }).success).toBe(false);
    }
  });

  it('takes no topics from the body', () => {
    expect(testTopicGuardBodySchema.safeParse({ text: 'a', topics: ['a'] }).success).toBe(false);
    expect(testTopicGuardBodySchema.safeParse({}).success).toBe(false);
  });

  it('parses the response with a 6-decimal cost', () => {
    const body = { allowed: true, matchedTopic: 'มุกตลกไทย', costUsd: '0.000050' };
    expect(testTopicGuardResponseSchema.safeParse(body).success).toBe(true);
    expect(
      testTopicGuardResponseSchema.safeParse({ ...body, allowed: false, matchedTopic: null })
        .success,
    ).toBe(true);
    expect(testTopicGuardResponseSchema.safeParse({ ...body, costUsd: '0.00005' }).success).toBe(
      false,
    );
    expect(testTopicGuardResponseSchema.safeParse({ ...body, extra: 1 }).success).toBe(false);
    const withoutTopic: Record<string, unknown> = { ...body };
    delete withoutTopic.matchedTopic;
    expect(testTopicGuardResponseSchema.safeParse(withoutTopic).success).toBe(false);
  });
});

describe('setLineCredentialsBodySchema', () => {
  it('accepts values without whitespace and rejects the rest', () => {
    expect(
      setLineCredentialsBodySchema.safeParse({
        channelId: '1234567890',
        channelSecret: 's',
        channelAccessToken: 't',
      }).success,
    ).toBe(true);
    expect(
      setLineCredentialsBodySchema.safeParse({
        channelId: '1234567890',
        channelSecret: 's s',
        channelAccessToken: 't',
      }).success,
    ).toBe(false);
    expect(
      setLineCredentialsBodySchema.safeParse({
        channelId: '1234567890',
        channelSecret: 's',
        channelAccessToken: 't\n',
      }).success,
    ).toBe(false);
    expect(
      setLineCredentialsBodySchema.safeParse({
        channelId: '1234567890',
        channelSecret: '',
        channelAccessToken: 't',
      }).success,
    ).toBe(false);
    expect(
      setLineCredentialsBodySchema.safeParse({
        channelId: '1234567890',
        channelSecret: 'x'.repeat(201),
        channelAccessToken: 't',
      }).success,
    ).toBe(false);
    expect(
      setLineCredentialsBodySchema.safeParse({
        channelId: '1234567890',
        channelSecret: 's',
        channelAccessToken: 'x'.repeat(1001),
      }).success,
    ).toBe(false);
    expect(
      setLineCredentialsBodySchema.safeParse({
        channelId: '1234567890',
        channelSecret: 's',
        channelAccessToken: 't',
        x: 1,
      }).success,
    ).toBe(false);
  });

  it('takes a Channel ID of 1 to LINE_CHANNEL_ID_MAX_CHARS digits and nothing else', () => {
    const parse = (channelId: unknown) =>
      setLineCredentialsBodySchema.safeParse({
        channelId,
        channelSecret: 's',
        channelAccessToken: 't',
      }).success;
    expect(parse('1')).toBe(true);
    expect(parse('9'.repeat(LINE_CHANNEL_ID_MAX_CHARS))).toBe(true);
    for (const bad of [
      '',
      ' 1',
      '12a',
      '1.0',
      '-1',
      '9'.repeat(LINE_CHANNEL_ID_MAX_CHARS + 1),
      12,
      undefined,
    ]) {
      expect(parse(bad), String(bad)).toBe(false);
    }
  });

  it('answers the secret check with the bot info', () => {
    for (const secretStatus of ['verified', 'unchecked', 'no_channel_id']) {
      expect(
        lineBotInfoResponseSchema.safeParse({ botName: 'b', basicId: '@b', secretStatus }).success,
      ).toBe(true);
    }
    expect(lineBotInfoResponseSchema.safeParse({ botName: 'b', basicId: '@b' }).success).toBe(
      false,
    );
  });
});
