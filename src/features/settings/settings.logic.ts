// Pure logic of the settings screens (docs/specs/ui-screens.md section 8.5).
import { bangkokParts, formatMonthYear } from '@/common/common.logic';
import {
  AI_DAILY_BUDGET_MAX_USD,
  AI_INSTRUCTIONS_MAX_CHARS,
  AI_NAME_MAX_CHARS,
  LINE_CHANNEL_ID_PATTERN,
  PDF_MAX_BYTES,
  PDF_MAX_PAGES,
  type UsageReportResponse,
} from '@/contracts';

import { copy } from './settings.constants';

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

/**
 * The AI name as the admin typed it: at most AI_NAME_MAX_CHARS after trimming. Blank is valid and
 * clears the name. `value` is what is sent, trimmed.
 */
export function validateAiName(
  text: string,
): { ok: true; value: string } | { ok: false; code: 'ai_name_too_long' } {
  const value = text.trim();
  return value.length > AI_NAME_MAX_CHARS
    ? { ok: false, code: 'ai_name_too_long' }
    : { ok: true, value };
}

/** Field of the LINE credentials form that a check refers to. */
export type LineCredentialField = 'channelId' | 'channelSecret' | 'channelAccessToken';

/** The three LINE fields in the order of the form. */
export const LINE_CREDENTIAL_FIELDS: readonly LineCredentialField[] = [
  'channelId',
  'channelSecret',
  'channelAccessToken',
];

/** The LINE values the form sends: only the fields that are open for typing. */
export type LineCredentialsInput = Partial<Record<LineCredentialField, string>>;

/**
 * Checks the fields that are open (present in `input`), in the order of the form: each one is
 * required after trim, and the Channel ID is digits only, at most LINE_CHANNEL_ID_MAX_CHARS (the
 * contract's LINE_CHANNEL_ID_PATTERN). A locked field is left out and is not checked: the server
 * keeps its stored value. `body` is what is sent, trimmed.
 */
export function validateLineCredentials(
  input: LineCredentialsInput,
):
  | { ok: true; body: LineCredentialsInput }
  | { ok: false; field: LineCredentialField; code: 'required' | 'invalid' } {
  const body: LineCredentialsInput = {};
  for (const field of LINE_CREDENTIAL_FIELDS) {
    const raw = input[field];
    if (raw === undefined) continue;
    const value = raw.trim();
    if (value === '') return { ok: false, field, code: 'required' };
    if (field === 'channelId' && !LINE_CHANNEL_ID_PATTERN.test(value)) {
      return { ok: false, field, code: 'invalid' };
    }
    body[field] = value;
  }
  return { ok: true, body };
}

/** A LINE field: whether a value is saved for it, whether the admin opened it, and what is typed. */
export type LineCredentialFieldState = { saved: boolean; editing: boolean; value: string };

/** A field with a saved value stays locked until the admin presses its edit button. */
export function lineFieldLocked(
  field: Pick<LineCredentialFieldState, 'saved' | 'editing'>,
): boolean {
  return field.saved && !field.editing;
}

/** What the form sends: the values of the fields that are not locked. */
export function lineCredentialsToSend(
  fields: Readonly<Record<LineCredentialField, LineCredentialFieldState>>,
): LineCredentialsInput {
  const out: LineCredentialsInput = {};
  for (const name of LINE_CREDENTIAL_FIELDS) {
    if (!lineFieldLocked(fields[name])) out[name] = fields[name].value;
  }
  return out;
}

/** Save is possible once an open field has something typed in it. */
export function lineCredentialsSendable(input: LineCredentialsInput): boolean {
  return Object.values(input).some((value) => value.trim() !== '');
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

// ---------------------------------------------------------------------------
// Rich menu and welcome texts (ui-screens 9.4.1): '' saved means the default text is sent.
// ---------------------------------------------------------------------------

/** What a default-backed text field shows: what was typed, else the saved text or the default. */
export function defaultBackedValue(
  draft: string | null,
  saved: string,
  defaultText: string,
): string {
  return draft ?? (saved === '' ? defaultText : saved);
}

/** The value to save: trimmed, and '' when it is the default, so the default keeps following the particle. */
export function defaultBackedPatch(value: string, defaultText: string): string {
  const trimmed = value.trim();
  return trimmed === defaultText.trim() ? '' : trimmed;
}

/** Whether the typed text would change what is saved. */
export function defaultBackedDirty(
  draft: string | null,
  saved: string,
  defaultText: string,
): boolean {
  return draft !== null && defaultBackedPatch(draft, defaultText) !== saved;
}

/** "12/300". */
export function textCounter(length: number, max: number): string {
  return `${String(length)}/${String(max)}`;
}

/** The hint by "อัปโหลด PDF": the limits of a file, from the constants (ui-copy `settings.kb.uploadHint`). */
export function pdfUploadHintText(): string {
  return copy.kb.uploadHint
    .replace('{maxMb}', String(PDF_MAX_BYTES / (1024 * 1024)))
    .replace('{maxPages}', String(PDF_MAX_PAGES));
}
