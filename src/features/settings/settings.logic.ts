// Pure logic of the settings screens (docs/specs/ui-screens.md section 8.5).
import { bangkokParts, formatMonthYear } from '@/common/common.logic';
import {
  AI_DAILY_BUDGET_MAX_USD,
  AI_INSTRUCTIONS_MAX_CHARS,
  LINE_CHANNEL_ID_PATTERN,
  PDF_MAX_BYTES,
  type UsageReportResponse,
} from '@/contracts';

/** Knowledge base usage from the server's token counts. */
export function kbUsage(list: { usedTokens: number; capacityTokens: number }): {
  used: number;
  limit: number;
  ratio: number;
  tone: 'normal' | 'warn' | 'full';
} {
  const { usedTokens: used, capacityTokens: limit } = list;
  const ratio = limit > 0 ? used / limit : used > 0 ? 1 : 0;
  return { used, limit, ratio, tone: ratio >= 1 ? 'full' : ratio >= 0.9 ? 'warn' : 'normal' };
}

/** A knowledge file must be a PDF (by its first bytes) within the size limit. */
export function validatePdfFile(
  file: { size: number },
  head: Uint8Array,
): { ok: true } | { ok: false; code: 'not_pdf' | 'pdf_too_large' | 'empty_file'; sizeMb?: string } {
  if (file.size === 0) return { ok: false, code: 'empty_file' };
  const magic = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"
  if (head.length < magic.length || !magic.every((b, i) => head[i] === b)) {
    return { ok: false, code: 'not_pdf' };
  }
  if (file.size > PDF_MAX_BYTES) {
    return { ok: false, code: 'pdf_too_large', sizeMb: (file.size / (1024 * 1024)).toFixed(1) };
  }
  return { ok: true };
}

/** Cents of a decimal string such as "10.00". */
function centsOf(decimal: string): number {
  return Math.round(Number(decimal) * 100);
}

/** Daily budget typed by the admin: a number with at most 2 decimals from 0 to the maximum. */
export function parseBudgetInput(
  input: string,
): { ok: true; value: number } | { ok: false; code: 'budget_invalid' | 'budget_out_of_range' } {
  const text = input.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return { ok: false, code: 'budget_invalid' };
  const value = Number(text);
  if (!Number.isFinite(value) || Math.round(value * 100) > centsOf(AI_DAILY_BUDGET_MAX_USD)) {
    return { ok: false, code: 'budget_out_of_range' };
  }
  return { ok: true, value };
}

/** The extra AI instructions must not be longer than the limit. */
export function validateInstructions(
  text: string,
): { ok: true } | { ok: false; code: 'instructions_too_long' } {
  return text.length > AI_INSTRUCTIONS_MAX_CHARS
    ? { ok: false, code: 'instructions_too_long' }
    : { ok: true };
}

/** Field of the LINE credentials form that a check refers to. */
export type LineCredentialField = 'channelId' | 'channelSecret' | 'channelAccessToken';

/**
 * All three LINE values are required (after trim), in the order of the form; the Channel ID is
 * digits only, at most LINE_CHANNEL_ID_MAX_CHARS (the contract's LINE_CHANNEL_ID_PATTERN).
 */
export function validateLineCredentials(input: {
  channelId: string;
  channelSecret: string;
  channelAccessToken: string;
}): { ok: true } | { ok: false; field: LineCredentialField; code: 'required' | 'invalid' } {
  const channelId = input.channelId.trim();
  if (channelId === '') return { ok: false, field: 'channelId', code: 'required' };
  if (!LINE_CHANNEL_ID_PATTERN.test(channelId)) {
    return { ok: false, field: 'channelId', code: 'invalid' };
  }
  if (input.channelSecret.trim() === '') {
    return { ok: false, field: 'channelSecret', code: 'required' };
  }
  if (input.channelAccessToken.trim() === '') {
    return { ok: false, field: 'channelAccessToken', code: 'required' };
  }
  return { ok: true };
}

/** Months for the usage picker, newest first: value "2026-11", label "พ.ย. 2569". */
export function monthOptions(now: Date, count = 12): { value: string; label: string }[] {
  const { year, month } = bangkokParts(now);
  const out: { value: string; label: string }[] = [];
  for (let i = 0; i < count; i += 1) {
    const index = year * 12 + (month - 1) - i;
    const y = Math.floor(index / 12);
    const m = (index % 12) + 1;
    out.push({
      value: `${String(y)}-${String(m).padStart(2, '0')}`,
      label: formatMonthYear(y, m),
    });
  }
  return out;
}

/** Total tokens of the usage table: every contact row, the knowledge ingest and the topic guard. */
export function usageTokenTotal(
  report: Pick<UsageReportResponse, 'contacts' | 'ingest' | 'guard'>,
): number {
  return report.contacts.reduce(
    (sum, row) => sum + row.totalTokens,
    report.ingest.totalTokens + report.guard.totalTokens,
  );
}
