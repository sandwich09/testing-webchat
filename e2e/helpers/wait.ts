import type { APIRequestContext } from '@playwright/test';

const POLL_MS = 200;
const TIMEOUT_MS = 15_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Waits until the AI is idle for a contact: first longer than `AI_DEBOUNCE_MS` of compose (300 ms
 * by default, override with `E2E_AI_DEBOUNCE_MS`), so a reply that has not started yet is counted,
 * then polls `GET /api/contacts/:id` until `aiReplying` is false twice in a row.
 */
export async function waitAiIdle(request: APIRequestContext, contactId: string): Promise<void> {
  const debounce = Number(process.env.E2E_AI_DEBOUNCE_MS ?? 300);
  await sleep(debounce + 300);
  const deadline = Date.now() + TIMEOUT_MS;
  let idleReads = 0;
  while (Date.now() < deadline) {
    const response = await request.get(`/api/contacts/${encodeURIComponent(contactId)}`);
    if (!response.ok()) {
      throw new Error(`GET contact failed with status ${String(response.status())}`);
    }
    const contact = (await response.json()) as { aiReplying: boolean };
    idleReads = contact.aiReplying ? 0 : idleReads + 1;
    if (idleReads >= 2) return;
    await sleep(POLL_MS);
  }
  throw new Error('AI still replying after the timeout');
}
