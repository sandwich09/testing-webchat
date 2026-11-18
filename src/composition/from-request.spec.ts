import { describe, expect, it } from 'vitest';
import type { ContactId } from '@/core/domain';
import { encodeContactCursor } from './http-request';
import {
  toCreateCannedReplyInput,
  toGetMessagesInput,
  toListContactsInput,
  toLocalStorageKey,
  toSendAdminMessageInput,
  toSetLineCredentialsInput,
  toUpdateCannedReplyInput,
  toUpdateSettingsInput,
  toUsageMonth,
} from './from-request';

describe('toListContactsInput', () => {
  it('defaults to page mode with filter all', () => {
    expect(toListContactsInput({})).toEqual({
      ok: true,
      value: { mode: 'page', filter: 'all', search: null, before: null },
    });
  });

  it('decodes the before cursor and keeps filter and q', () => {
    const cursor = { sortAt: new Date('2026-11-18T00:00:00.000Z'), id: 'c-1' as ContactId };
    expect(
      toListContactsInput({ filter: 'unread', q: 'มะลิ', before: encodeContactCursor(cursor) }),
    ).toEqual({
      ok: true,
      value: { mode: 'page', filter: 'unread', search: 'มะลิ', before: cursor },
    });
  });

  it('answers request.invalid for a tampered cursor', () => {
    expect(toListContactsInput({ before: 'AAAA' })).toMatchObject({ ok: false });
  });

  it('switches to polling mode with a bigint cursor', () => {
    expect(toListContactsInput({ afterUpdatedSeq: '18446744073709551615' })).toEqual({
      ok: true,
      value: { mode: 'changes', afterUpdatedSeq: 18446744073709551615n },
    });
  });
});

describe('toGetMessagesInput', () => {
  it.each([
    [{}, { kind: 'latest' }],
    [{ beforeSeq: '5' }, { kind: 'before', beforeSeq: 5n }],
    [
      { afterUpdatedSeq: '9', limit: 3 },
      { kind: 'changes', afterUpdatedSeq: 9n },
    ],
  ])('maps %j', (query, mode) => {
    expect(toGetMessagesInput('c1', query)).toEqual({ contactId: 'c1', mode });
  });
});

describe('toSendAdminMessageInput', () => {
  const id = '0193a0b1-2c3d-7e4f-8a9b-0c1d2e3f4a5b';

  it('maps text and media bodies', () => {
    expect(toSendAdminMessageInput('c1', { id, kind: 'text', text: 'hi' })).toEqual({
      contactId: 'c1',
      messageId: id,
      content: { kind: 'text', text: 'hi' },
    });
    expect(
      toSendAdminMessageInput('c1', {
        id,
        kind: 'image',
        uploadId: 'abcdefghijklmnopqrstuv',
        contentType: 'image/png',
      }),
    ).toEqual({
      contactId: 'c1',
      messageId: id,
      content: { kind: 'image', uploadId: 'abcdefghijklmnopqrstuv', contentType: 'image/png' },
    });
  });
});

describe('toUpdateSettingsInput', () => {
  it('renames fields and turns the budget into NanoUsd', () => {
    expect(
      toUpdateSettingsInput({
        aiEnabled: false,
        aiModel: 'claude-haiku-5-5',
        aiDailyBudgetUsd: '5.5',
        aiPoliteParticle: 'ครับ',
        aiInstructions: '',
        guardEnabled: true,
        guardTopics: ['a'],
        guardRefusalText: 'no',
      }),
    ).toEqual({
      ok: true,
      value: {
        aiEnabled: false,
        aiModel: 'claude-haiku-5-5',
        aiDailyBudget: 5_500_000_000n,
        aiPoliteParticle: 'ครับ',
        aiInstructions: '',
        guardEnabled: true,
        guardTopics: ['a'],
        guardRefusalText: 'no',
      },
    });
  });

  it('passes only the fields that were sent', () => {
    expect(toUpdateSettingsInput({ guardEnabled: false })).toEqual({
      ok: true,
      value: { guardEnabled: false },
    });
  });

  it('answers request.invalid for a budget parseUsd cannot read', () => {
    expect(toUpdateSettingsInput({ aiDailyBudgetUsd: '1.2.3' })).toMatchObject({ ok: false });
  });
});

describe('other mappers', () => {
  it('maps canned reply bodies', () => {
    expect(toCreateCannedReplyInput({ title: 't', text: 'x' })).toEqual({
      id: null,
      title: 't',
      text: 'x',
    });
    expect(toUpdateCannedReplyInput('r1', { sortOrder: 3 })).toEqual({ id: 'r1', sortOrder: 3 });
  });

  it('maps LINE credentials, local storage keys and the usage month', () => {
    expect(toSetLineCredentialsInput({ channelSecret: 's', channelAccessToken: 't' })).toEqual({
      channelSecret: 's',
      channelAccessToken: 't',
    });
    expect(toLocalStorageKey(['out', 'abc', 'original.jpg'])).toBe('out/abc/original.jpg');
    expect(toUsageMonth('2026-01', new Date('2026-11-18T00:00:00Z'))).toBe('2026-01');
    // 2026-11-30T18:00Z is already 1 December in Bangkok (UTC+7).
    expect(toUsageMonth(undefined, new Date('2026-11-30T18:00:00Z'))).toBe('2026-12');
  });
});
