import { describe, expect, it } from 'vitest';
import { CONTACT_NOTE_MAX_CHARS } from '@/contracts';
import {
  checkNote,
  confirmPendingNote,
  isAddKey,
  noteCounterText,
  noteTooLongText,
  withPendingNote,
  withoutNote,
  type NoteItem,
} from './inbox.notes.logic';

const note = (id: string, text = id): NoteItem => ({
  id,
  contactId: 'c1',
  text,
  createdAt: '2026-11-18T03:00:00.000Z',
});

describe('notes logic', () => {
  it('checks the trimmed text: not empty, not longer than the limit', () => {
    expect(checkNote('  แพ้ถั่ว \n')).toEqual({ ok: true, text: 'แพ้ถั่ว' });
    expect(checkNote(' \n ')).toEqual({ ok: false, code: 'empty' });
    expect(checkNote('ก'.repeat(CONTACT_NOTE_MAX_CHARS + 1))).toEqual({
      ok: false,
      code: 'too_long',
    });
    expect(checkNote(` ${'ก'.repeat(CONTACT_NOTE_MAX_CHARS)} `).ok).toBe(true);
  });

  it('counts and names the limit', () => {
    expect(noteCounterText('  ab ')).toBe(`2/${String(CONTACT_NOTE_MAX_CHARS)}`);
    expect(noteTooLongText()).toBe(`โน้ตยาวเกิน ${String(CONTACT_NOTE_MAX_CHARS)} ตัวอักษร`);
  });

  it('adds with Enter, keeps typing with Shift+Enter or while composing', () => {
    expect(isAddKey({ key: 'Enter', shiftKey: false, isComposing: false })).toBe(true);
    expect(isAddKey({ key: 'Enter', shiftKey: true, isComposing: false })).toBe(false);
    expect(isAddKey({ key: 'Enter', shiftKey: false, isComposing: true })).toBe(false);
    expect(isAddKey({ key: 'a', shiftKey: false, isComposing: false })).toBe(false);
  });

  it('puts a pending note on top, confirms it with the saved one, or takes it out', () => {
    const list = [note('n1')];
    const pending = withPendingNote(list, note('tmp', 'ใหม่'));
    expect(pending.map((n) => [n.id, n.pending])).toEqual([
      ['tmp', true],
      ['n1', undefined],
    ]);
    expect(confirmPendingNote(pending, 'tmp', note('n2', 'ใหม่')).map((n) => n.id)).toEqual([
      'n2',
      'n1',
    ]);
    expect(withoutNote(pending, 'tmp')).toEqual(list);
  });
});
