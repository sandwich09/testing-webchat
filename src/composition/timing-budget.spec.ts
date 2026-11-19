import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  AI_STUCK_AFTER_MS,
  KNOWLEDGE_STUCK_AFTER_MS,
  MEDIA_CONTENT_CALL_WORST_MS,
  MEDIA_JOB_BUDGET_MS,
  MEDIA_NOT_READY_POLL_MS,
  MEDIA_STATUS_CALL_WORST_MS,
  MEDIA_STORE_CALL_WORST_MS,
  MEDIA_STUCK_AFTER_MS,
  SEND_STUCK_AFTER_MS,
} from '@/core/domain';
import {
  CLIENT_TIMEOUT_GUARD_TEST_MS,
  CLIENT_TIMEOUT_LINE_CHECK_MS,
  CLIENT_TIMEOUT_MARGIN_MS,
  CLIENT_TIMEOUT_RICH_MENU_PUBLISH_MS,
  CLIENT_TIMEOUT_RICH_MENU_REMOVE_MS,
} from '@/contracts';
import { AI_DEBOUNCE_MAX_MS, DEFAULT_AI_DEBOUNCE_MS } from './env';
import {
  JOB_BUDGET_SHARE,
  aiRoundWorstMs,
  aiRunWorstMs,
  contentDownloadWorstMs,
  contentIdleWorstMs,
  contentStatusWorstMs,
  deliverWorstMs,
  extractJobWorstMs,
  lineCallWorstMs,
  mediaDownloadsWorstMs,
  mediaFileJobWorstMs,
  mediaJobWorstMs,
  mediaStoreWorstMs,
  profileRefreshJobWorstMs,
  webhookWorstMs,
  guardTestWorstMs,
  lineCheckWorstMs,
  richMenuPublishWorstMs,
  richMenuRemoveWorstMs,
} from './timing-budget';

/** `export const maxDuration = N;` of a route file, in seconds. Next.js needs it as a literal. */
const maxDurationOf = (route: string): number => {
  const source = readFileSync(new URL(`../../app/api/${route}/route.ts`, import.meta.url), 'utf8');
  const match = /^export const maxDuration = (\d+);/m.exec(source);
  if (match === null) throw new Error(`${route} has no literal maxDuration`);
  return Number(match[1]) * 1000;
};

const WEBHOOK_MS = maxDurationOf('line/webhook');
const KNOWLEDGE_MS = maxDurationOf('knowledge/documents');

describe('timing budget (project-setup 10.4, "เวลาแย่ที่สุด")', () => {
  it('uses the values written in project-setup section 10', () => {
    expect(WEBHOOK_MS).toBe(300_000);
    expect(KNOWLEDGE_MS).toBe(300_000);
    expect(maxDurationOf('knowledge/documents/[id]/retry')).toBe(KNOWLEDGE_MS);
    expect(lineCallWorstMs(5000, 2)).toBe(25_000);
    expect(deliverWorstMs()).toBe(50_000);
    expect(aiRoundWorstMs()).toBe(127_000);
    expect(aiRunWorstMs(DEFAULT_AI_DEBOUNCE_MS)).toBe(259_000);
    expect(webhookWorstMs(DEFAULT_AI_DEBOUNCE_MS)).toBe(262_000);
    expect(contentDownloadWorstMs()).toBe(100_000);
    expect(contentStatusWorstMs()).toBe(5000);
    expect(mediaDownloadsWorstMs()).toBe(200_000);
    expect(mediaStoreWorstMs()).toBe(70_000);
    expect(mediaFileJobWorstMs()).toBe(170_000);
    expect(contentIdleWorstMs()).toBe(10_000);
    expect(mediaJobWorstMs()).toBe(255_000);
    expect(profileRefreshJobWorstMs()).toBe(3000);
    expect(extractJobWorstMs()).toBe(262_000);
  });

  it('fits the webhook jobs under WEBHOOK_MAX_DURATION_S with the margin, up to the highest debounce', () => {
    expect(webhookWorstMs(DEFAULT_AI_DEBOUNCE_MS)).toBeLessThanOrEqual(
      WEBHOOK_MS * JOB_BUDGET_SHARE,
    );
    expect(webhookWorstMs(AI_DEBOUNCE_MAX_MS)).toBeLessThanOrEqual(WEBHOOK_MS * JOB_BUDGET_SHARE);
    // The media job is cut at its budget, so it ends with its row marked before the function is.
    expect(mediaJobWorstMs()).toBeLessThanOrEqual(WEBHOOK_MS * JOB_BUDGET_SHARE);
  });

  it('keeps the media reserves of the core at or above the adapter worst cases', () => {
    // StoreInboundMedia only starts a step when the budget holds these reserves, so they must
    // not be lower than what the step can really take.
    expect(MEDIA_CONTENT_CALL_WORST_MS).toBeGreaterThanOrEqual(contentDownloadWorstMs());
    expect(MEDIA_STATUS_CALL_WORST_MS).toBeGreaterThanOrEqual(contentStatusWorstMs());
    expect(MEDIA_STORE_CALL_WORST_MS).toBeGreaterThanOrEqual(mediaStoreWorstMs());
    // The idle bound of a LINE body only ever ends an attempt before its deadline.
    expect(contentIdleWorstMs()).toBeLessThan(contentDownloadWorstMs());
    // Content LINE has ready at once is downloaded and stored within the budget with every step
    // at its bound, so the deadline only ever cuts a step that broke its own bound.
    expect(mediaFileJobWorstMs()).toBeLessThanOrEqual(MEDIA_JOB_BUDGET_MS);
    expect(MEDIA_CONTENT_CALL_WORST_MS + MEDIA_STORE_CALL_WORST_MS).toBeLessThanOrEqual(
      MEDIA_JOB_BUDGET_MS,
    );
    // Both downloads of a video still fit; its preview is skipped when the store does not.
    expect(mediaDownloadsWorstMs()).toBeLessThanOrEqual(MEDIA_JOB_BUDGET_MS);
    // At least one wait fits after a quick 202, or the not-ready path would never retry.
    expect(
      MEDIA_NOT_READY_POLL_MS +
        MEDIA_STATUS_CALL_WORST_MS +
        MEDIA_CONTENT_CALL_WORST_MS +
        MEDIA_STORE_CALL_WORST_MS,
    ).toBeLessThanOrEqual(MEDIA_JOB_BUDGET_MS);
  });

  it('fits the PDF extraction under KNOWLEDGE_MAX_DURATION_S with the margin', () => {
    expect(extractJobWorstMs()).toBeLessThanOrEqual(KNOWLEDGE_MS * JOB_BUDGET_SHARE);
  });

  it('never recovers a run that may still be alive: every stuck bound exceeds its worst case and maxDuration', () => {
    // AI: a live run holds the lock at most aiRunWorstMs, also in Docker where nothing cuts it.
    expect(AI_STUCK_AFTER_MS).toBeGreaterThan(aiRunWorstMs(AI_DEBOUNCE_MAX_MS));
    expect(AI_STUCK_AFTER_MS).toBeGreaterThanOrEqual(WEBHOOK_MS);
    // Inbound media is downloaded by a job of the webhook function.
    expect(MEDIA_STUCK_AFTER_MS).toBeGreaterThan(Math.max(mediaJobWorstMs(), WEBHOOK_MS));
    // A pending send belongs to the webhook function (AI) or to a request of the inbox, whose
    // routes keep the platform default, which is not above WEBHOOK_MAX_DURATION_S.
    expect(SEND_STUCK_AFTER_MS).toBeGreaterThan(Math.max(deliverWorstMs(), WEBHOOK_MS));
    // A processing document belongs to a PDF route.
    expect(KNOWLEDGE_STUCK_AFTER_MS).toBeGreaterThan(Math.max(extractJobWorstMs(), KNOWLEDGE_MS));
  });
});

describe('client timeouts of slow requests (timeouts.contract.ts)', () => {
  it.each([
    ['guard test', CLIENT_TIMEOUT_GUARD_TEST_MS, guardTestWorstMs()],
    ['rich menu publish', CLIENT_TIMEOUT_RICH_MENU_PUBLISH_MS, richMenuPublishWorstMs()],
    ['rich menu removal', CLIENT_TIMEOUT_RICH_MENU_REMOVE_MS, richMenuRemoveWorstMs()],
    ['LINE credentials save and test', CLIENT_TIMEOUT_LINE_CHECK_MS, lineCheckWorstMs()],
  ])('the %s wait covers the server worst case with the margin', (_label, clientMs, serverMs) => {
    expect(clientMs).toBeGreaterThanOrEqual(serverMs + CLIENT_TIMEOUT_MARGIN_MS);
  });
});
