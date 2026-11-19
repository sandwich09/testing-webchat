import { describe, expect, it } from 'vitest';
import { CONTACT_NOTE_MAX_CHARS, CONTACT_SEARCH_MAX_CHARS } from './limits.contract';
import {
  addContactNoteBodySchema,
  contactNoteParamsSchema,
  listContactNotesResponseSchema,
  listContactsQuerySchema,
  listContactsResponseSchema,
  setContactAiBodySchema,
} from './contacts.contract';

describe('listContactsQuerySchema', () => {
  it('accepts page mode and polling mode', () => {
    expect(listContactsQuerySchema.safeParse({}).success).toBe(true);
    expect(
      listContactsQuerySchema.safeParse({ filter: 'unread', q: 'som', before: 'abc_-9' }).success,
    ).toBe(true);
    expect(listContactsQuerySchema.safeParse({ afterUpdatedSeq: '1048576' }).success).toBe(true);
  });

  it('rejects afterUpdatedSeq together with filter, q or before', () => {
    for (const extra of [{ filter: 'all' }, { q: 'a' }, { before: 'abc' }]) {
      expect(listContactsQuerySchema.safeParse({ afterUpdatedSeq: '5', ...extra }).success).toBe(
        false,
      );
    }
  });

  it('rejects bad values and unknown fields', () => {
    expect(listContactsQuerySchema.safeParse({ filter: 'archived' }).success).toBe(false);
    expect(listContactsQuerySchema.safeParse({ q: '' }).success).toBe(false);
    expect(
      listContactsQuerySchema.safeParse({ q: 'x'.repeat(CONTACT_SEARCH_MAX_CHARS + 1) }).success,
    ).toBe(false);
    expect(listContactsQuerySchema.safeParse({ afterUpdatedSeq: '-1' }).success).toBe(false);
    expect(listContactsQuerySchema.safeParse({ afterUpdatedSeq: 'abc' }).success).toBe(false);
    expect(listContactsQuerySchema.safeParse({ before: 'a b' }).success).toBe(false);
    expect(listContactsQuerySchema.safeParse({ page: '2' }).success).toBe(false);
  });
});

describe('contact bodies and responses', () => {
  it('validates the PATCH body strictly', () => {
    expect(setContactAiBodySchema.safeParse({ aiEnabled: false }).success).toBe(true);
    expect(setContactAiBodySchema.safeParse({}).success).toBe(false);
    expect(setContactAiBodySchema.safeParse({ aiEnabled: false, x: 1 }).success).toBe(false);
  });

  it('validates the list response', () => {
    const body = {
      contacts: [],
      before: null,
      hasMore: false,
      highWater: '0',
      counts: { all: 0, unread: 0, needsAdmin: 0 },
      lineConfigured: true,
    };
    expect(listContactsResponseSchema.safeParse(body).success).toBe(true);
    expect(listContactsResponseSchema.safeParse({ ...body, extra: 1 }).success).toBe(false);
  });
});

describe('contact notes', () => {
  it('trims the text and takes 1 to CONTACT_NOTE_MAX_CHARS characters', () => {
    const parsed = addContactNoteBodySchema.safeParse({ text: '  แพ้ถั่ว\nโทรหลังห้าโมง  ' });
    expect(parsed.success && parsed.data.text).toBe('แพ้ถั่ว\nโทรหลังห้าโมง');
    expect(
      addContactNoteBodySchema.safeParse({ text: 'ก'.repeat(CONTACT_NOTE_MAX_CHARS) }).success,
    ).toBe(true);
    for (const text of ['', '   ', 'ก'.repeat(CONTACT_NOTE_MAX_CHARS + 1)]) {
      expect(addContactNoteBodySchema.safeParse({ text }).success).toBe(false);
    }
    expect(addContactNoteBodySchema.safeParse({ text: 'x', extra: 1 }).success).toBe(false);
  });

  it('takes both ids in the delete path and checks the list response', () => {
    const id = '0193a0b1-0000-7000-8000-000000000001';
    expect(contactNoteParamsSchema.safeParse({ id, noteId: id }).success).toBe(true);
    expect(contactNoteParamsSchema.safeParse({ id, noteId: 'x' }).success).toBe(false);
    expect(
      listContactNotesResponseSchema.safeParse({
        notes: [{ id, contactId: id, text: 'a', createdAt: '2026-11-18T03:00:00.000Z' }],
      }).success,
    ).toBe(true);
  });
});
