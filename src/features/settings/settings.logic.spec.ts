import { describe, expect, it } from 'vitest';
import {
  AI_DAILY_BUDGET_MAX_USD,
  AI_INSTRUCTIONS_MAX_CHARS,
  CANNED_TEXT_MAX_CHARS,
  CANNED_TITLE_MAX_CHARS,
  PDF_MAX_BYTES,
} from '@/contracts';
import {
  kbUsage,
  monthOptions,
  parseBudgetInput,
  usageTokenTotal,
  validateCannedReply,
  validateInstructions,
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

describe('validateCannedReply', () => {
  it('requires both fields after trim', () => {
    expect(validateCannedReply({ title: '  ', text: 'x' })).toEqual({
      ok: false,
      field: 'title',
      code: 'required',
    });
    expect(validateCannedReply({ title: 'a', text: ' \n ' })).toEqual({
      ok: false,
      field: 'text',
      code: 'required',
    });
  });

  it('limits the lengths after trim', () => {
    expect(
      validateCannedReply({ title: 'x'.repeat(CANNED_TITLE_MAX_CHARS + 1), text: 'x' }),
    ).toEqual({ ok: false, field: 'title', code: 'too_long' });
    expect(
      validateCannedReply({ title: 'a', text: 'x'.repeat(CANNED_TEXT_MAX_CHARS + 1) }),
    ).toEqual({ ok: false, field: 'text', code: 'too_long' });
    expect(
      validateCannedReply({
        title: ` ${'x'.repeat(CANNED_TITLE_MAX_CHARS)} `,
        text: `${'x'.repeat(CANNED_TEXT_MAX_CHARS)}  `,
      }),
    ).toEqual({ ok: true });
  });
});

describe('validateLineCredentials', () => {
  it('requires both values', () => {
    expect(validateLineCredentials({ channelSecret: ' ', channelAccessToken: 't' })).toEqual({
      ok: false,
      field: 'channelSecret',
      code: 'required',
    });
    expect(validateLineCredentials({ channelSecret: 's', channelAccessToken: '' })).toEqual({
      ok: false,
      field: 'channelAccessToken',
      code: 'required',
    });
    expect(validateLineCredentials({ channelSecret: 's', channelAccessToken: 't' })).toEqual({
      ok: true,
    });
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
