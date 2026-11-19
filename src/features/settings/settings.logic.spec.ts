import { describe, expect, it } from 'vitest';

import { LINE_CHANNEL_ID_MAX_CHARS } from '@/contracts';
import {
  AI_DAILY_BUDGET_MAX_USD,
  AI_INSTRUCTIONS_MAX_CHARS,
  AI_NAME_MAX_CHARS,
  PDF_MAX_BYTES,
  PDF_MAX_PAGES,
} from '@/contracts';
import {
  defaultBackedDirty,
  defaultBackedPatch,
  defaultBackedValue,
  kbUsage,
  monthOptions,
  parseBudgetInput,
  pdfUploadHintText,
  textCounter,
  usageTokenTotal,
  validateAiName,
  validateInstructions,
  lineCredentialsSendable,
  lineCredentialsToSend,
  lineFieldLocked,
  validateLineCredentials,
  validatePdfFile,
} from './settings.logic';

const pdfHead = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);

describe('kbUsage', () => {
  it('passes the counts through with a ratio', () => {
    expect(kbUsage({ usedTokens: 25_000, capacityTokens: 50_000 })).toEqual({
      used: 25_000,
      limit: 50_000,
      ratio: 0.5,
      tone: 'normal',
    });
  });

  it('warns from 90 percent and is full at 100 percent', () => {
    expect(kbUsage({ usedTokens: 44_999, capacityTokens: 50_000 }).tone).toBe('normal');
    expect(kbUsage({ usedTokens: 45_000, capacityTokens: 50_000 }).tone).toBe('warn');
    expect(kbUsage({ usedTokens: 49_999, capacityTokens: 50_000 }).tone).toBe('warn');
    expect(kbUsage({ usedTokens: 50_000, capacityTokens: 50_000 }).tone).toBe('full');
  });
});

describe('validatePdfFile', () => {
  it('accepts a PDF', () => {
    expect(validatePdfFile({ size: 1000 }, pdfHead)).toEqual({ ok: true });
  });

  it('rejects empty files, other types and too large files', () => {
    expect(validatePdfFile({ size: 0 }, pdfHead)).toEqual({ ok: false, code: 'empty_file' });
    expect(validatePdfFile({ size: 10 }, new Uint8Array([1, 2, 3, 4, 5]))).toEqual({
      ok: false,
      code: 'not_pdf',
    });
    expect(validatePdfFile({ size: 10 }, new Uint8Array([0x25, 0x50]))).toEqual({
      ok: false,
      code: 'not_pdf',
    });
    expect(validatePdfFile({ size: PDF_MAX_BYTES }, pdfHead)).toEqual({ ok: true });
    expect(validatePdfFile({ size: PDF_MAX_BYTES + 1 }, pdfHead)).toEqual({
      ok: false,
      code: 'pdf_too_large',
      sizeMb: '4.0',
    });
  });
});

describe('parseBudgetInput', () => {
  it('accepts numbers with up to two decimals in range', () => {
    expect(parseBudgetInput('5')).toEqual({ ok: true, value: 5 });
    expect(parseBudgetInput(' 0 ')).toEqual({ ok: true, value: 0 });
    expect(parseBudgetInput('2.5')).toEqual({ ok: true, value: 2.5 });
    expect(parseBudgetInput('0.07')).toEqual({ ok: true, value: 0.07 });
    expect(parseBudgetInput(AI_DAILY_BUDGET_MAX_USD)).toEqual({
      ok: true,
      value: Number(AI_DAILY_BUDGET_MAX_USD),
    });
  });

  it('rejects other text', () => {
    for (const input of ['', ' ', 'abc', '1.234', '-1', '1,5', '.5', '5.', '1e2', '$5']) {
      expect(parseBudgetInput(input), input).toEqual({ ok: false, code: 'budget_invalid' });
    }
  });

  it('rejects values above the maximum', () => {
    expect(parseBudgetInput('10.01')).toEqual({ ok: false, code: 'budget_out_of_range' });
    expect(parseBudgetInput('1000')).toEqual({ ok: false, code: 'budget_out_of_range' });
  });
});

describe('validateInstructions', () => {
  it('limits the length', () => {
    expect(validateInstructions('x'.repeat(AI_INSTRUCTIONS_MAX_CHARS))).toEqual({ ok: true });
    expect(validateInstructions('x'.repeat(AI_INSTRUCTIONS_MAX_CHARS + 1))).toEqual({
      ok: false,
      code: 'instructions_too_long',
    });
    expect(validateInstructions('')).toEqual({ ok: true });
  });
});

describe('validateAiName', () => {
  it('trims, allows blank, and limits the trimmed length', () => {
    expect(validateAiName('  มินนี่ ')).toEqual({ ok: true, value: 'มินนี่' });
    expect(validateAiName('   ')).toEqual({ ok: true, value: '' });
    expect(validateAiName(` ${'ก'.repeat(AI_NAME_MAX_CHARS)} `).ok).toBe(true);
    expect(validateAiName('ก'.repeat(AI_NAME_MAX_CHARS + 1))).toEqual({
      ok: false,
      code: 'ai_name_too_long',
    });
  });
});

describe('validateLineCredentials', () => {
  const id = '1234567890';

  it('requires every open value, in the order of the form, and sends them trimmed', () => {
    expect(
      validateLineCredentials({ channelId: ' ', channelSecret: '', channelAccessToken: '' }),
    ).toEqual({ ok: false, field: 'channelId', code: 'required' });
    expect(
      validateLineCredentials({ channelId: id, channelSecret: ' ', channelAccessToken: 't' }),
    ).toEqual({ ok: false, field: 'channelSecret', code: 'required' });
    expect(
      validateLineCredentials({ channelId: id, channelSecret: 's', channelAccessToken: '' }),
    ).toEqual({ ok: false, field: 'channelAccessToken', code: 'required' });
    expect(
      validateLineCredentials({
        channelId: ` ${id} `,
        channelSecret: 's ',
        channelAccessToken: 't',
      }),
    ).toEqual({ ok: true, body: { channelId: id, channelSecret: 's', channelAccessToken: 't' } });
  });

  it('checks and sends only the fields that are open', () => {
    expect(validateLineCredentials({ channelAccessToken: ' t ' })).toEqual({
      ok: true,
      body: { channelAccessToken: 't' },
    });
    expect(validateLineCredentials({ channelSecret: '' })).toEqual({
      ok: false,
      field: 'channelSecret',
      code: 'required',
    });
  });

  it('takes a Channel ID of digits only, up to LINE_CHANNEL_ID_MAX_CHARS', () => {
    const check = (channelId: string) => validateLineCredentials({ channelId });
    expect(check('9'.repeat(LINE_CHANNEL_ID_MAX_CHARS)).ok).toBe(true);
    for (const bad of [
      '12a4',
      '12 34',
      '-123',
      '1.5',
      '９９',
      '9'.repeat(LINE_CHANNEL_ID_MAX_CHARS + 1),
    ]) {
      expect(check(bad)).toEqual({ ok: false, field: 'channelId', code: 'invalid' });
    }
  });
});

describe('LINE credential fields', () => {
  const locked = { saved: true, editing: false, value: '' };
  const open = (value: string) => ({ saved: true, editing: true, value });
  const unsaved = (value: string) => ({ saved: false, editing: false, value });

  it('locks a saved field until it is opened; a field with nothing saved is open', () => {
    expect(lineFieldLocked(locked)).toBe(true);
    expect(lineFieldLocked(open(''))).toBe(false);
    expect(lineFieldLocked(unsaved(''))).toBe(false);
  });

  it('sends only the open fields', () => {
    expect(
      lineCredentialsToSend({
        channelId: locked,
        channelSecret: locked,
        channelAccessToken: open('new-token'),
      }),
    ).toEqual({ channelAccessToken: 'new-token' });
    expect(
      lineCredentialsToSend({
        channelId: unsaved('1'),
        channelSecret: unsaved('s'),
        channelAccessToken: unsaved(''),
      }),
    ).toEqual({ channelId: '1', channelSecret: 's', channelAccessToken: '' });
  });

  it('can save once an open field has something typed in it', () => {
    expect(lineCredentialsSendable({})).toBe(false);
    expect(lineCredentialsSendable({ channelSecret: '  ' })).toBe(false);
    expect(lineCredentialsSendable({ channelSecret: '', channelAccessToken: 't' })).toBe(true);
  });
});

describe('monthOptions', () => {
  it('lists months newest first with Buddhist-era labels', () => {
    const options = monthOptions(new Date('2026-11-18T07:00:00.000Z'));
    expect(options).toHaveLength(12);
    expect(options[0]).toEqual({ value: '2026-11', label: 'พ.ย. 2569' });
    expect(options[1]).toEqual({ value: '2026-10', label: 'ต.ค. 2569' });
    expect(options[11]).toEqual({ value: '2025-12', label: 'ธ.ค. 2568' });
  });

  it('starts from the Bangkok month at the year boundary, with the process in UTC', () => {
    // 2026-12-31T17:30Z is 2027-01-01 00:30 in Bangkok.
    const options = monthOptions(new Date('2026-12-31T17:30:00.000Z'), 2);
    expect(options).toEqual([
      { value: '2027-01', label: 'ม.ค. 2570' },
      { value: '2026-12', label: 'ธ.ค. 2569' },
    ]);
  });

  it('crosses the year boundary and honours count', () => {
    const options = monthOptions(new Date('2027-01-10T07:00:00.000Z'), 3);
    expect(options.map((o) => o.value)).toEqual(['2027-01', '2026-12', '2026-11']);
  });

  it('uses the month in Thai time', () => {
    const options = monthOptions(new Date('2026-10-31T18:00:00.000Z'), 1); // 1 Nov, 01:00 in Thai time
    expect(options[0]?.value).toBe('2026-11');
  });
});

describe('usageTokenTotal', () => {
  it('adds every contact row, the ingest and the topic guard', () => {
    const report = {
      contacts: [{ totalTokens: 100 }, { totalTokens: 250 }] as never,
      ingest: { totalTokens: 1000 } as never,
      guard: { totalTokens: 40 } as never,
    };
    expect(usageTokenTotal(report)).toBe(1390);
  });

  it('counts the guard row even with no contacts', () => {
    const report = {
      contacts: [],
      ingest: { totalTokens: 0 } as never,
      guard: { totalTokens: 7 } as never,
    };
    expect(usageTokenTotal(report)).toBe(7);
  });
});

describe('default-backed texts', () => {
  const DEFAULT = 'ข้อความเริ่มต้น';

  it('shows what was typed, else the saved text, else the default', () => {
    expect(defaultBackedValue('พิมพ์อยู่', 'บันทึกไว้', DEFAULT)).toBe('พิมพ์อยู่');
    expect(defaultBackedValue(null, 'บันทึกไว้', DEFAULT)).toBe('บันทึกไว้');
    expect(defaultBackedValue(null, '', DEFAULT)).toBe(DEFAULT);
    expect(defaultBackedValue('', '', DEFAULT)).toBe('');
  });

  it('saves the default as empty, so it keeps following the particle, and trims', () => {
    expect(defaultBackedPatch(`  ${DEFAULT} `, DEFAULT)).toBe('');
    expect(defaultBackedPatch(' ใหม่ ', DEFAULT)).toBe('ใหม่');
  });

  it('is dirty only when the value to save differs from the saved one', () => {
    expect(defaultBackedDirty(null, '', DEFAULT)).toBe(false);
    expect(defaultBackedDirty(DEFAULT, '', DEFAULT)).toBe(false);
    expect(defaultBackedDirty('ใหม่', '', DEFAULT)).toBe(true);
    expect(defaultBackedDirty('ใหม่ ', 'ใหม่', DEFAULT)).toBe(false);
    expect(defaultBackedDirty(DEFAULT, 'ใหม่', DEFAULT)).toBe(true);
  });

  it('counts as n/max', () => {
    expect(textCounter(12, 300)).toBe('12/300');
  });
});

describe('pdfUploadHintText', () => {
  it('names the size and page limits of a PDF from the constants', () => {
    const hint = pdfUploadHintText();
    expect(hint).toContain('PDF');
    expect(hint).toContain(`${String(PDF_MAX_BYTES / 1024 / 1024)} MB`);
    expect(hint).toContain(`${String(PDF_MAX_PAGES)} หน้า`);
    expect(hint).not.toMatch(/\{\w+\}/);
  });
});
