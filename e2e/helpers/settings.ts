import type { APIRequestContext } from '@playwright/test';

/**
 * Direct API calls the serial journeys use to read and restore the global state they change
 * (kill switch, topic guard, knowledge base). The screens are what the journeys test; these calls
 * only make the clean-up in `finally` independent of the screen. Writes need the `Origin` of the
 * app (access-gate), which is the `baseURL` of playwright.config.ts.
 */

export type SettingsSnapshot = {
  ai: { enabled: boolean; politeParticle: string };
  guard: { enabled: boolean; topics: string[]; refusalText: string; blockedToday: number };
};

export type KbDocument = { id: string; fileName: string; status: string };

const ORIGIN = 'http://localhost:3000';

async function ok<T>(response: Awaited<ReturnType<APIRequestContext['get']>>): Promise<T> {
  if (!response.ok()) {
    throw new Error(`${response.url()} answered ${String(response.status())}`);
  }
  return (await response.json()) as T;
}

export async function getSettings(request: APIRequestContext): Promise<SettingsSnapshot> {
  return ok<SettingsSnapshot>(await request.get('/api/settings'));
}

export async function patchSettings(
  request: APIRequestContext,
  body: { aiEnabled?: boolean; guardEnabled?: boolean; guardTopics?: string[] },
): Promise<SettingsSnapshot> {
  return ok<SettingsSnapshot>(
    await request.patch('/api/settings', { headers: { Origin: ORIGIN }, data: body }),
  );
}

export async function listKbDocuments(request: APIRequestContext): Promise<KbDocument[]> {
  return (await ok<{ documents: KbDocument[] }>(await request.get('/api/knowledge/documents')))
    .documents;
}

export async function deleteKbDocument(request: APIRequestContext, id: string): Promise<void> {
  const response = await request.delete(`/api/knowledge/documents/${encodeURIComponent(id)}`, {
    headers: { Origin: ORIGIN },
  });
  if (!response.ok() && response.status() !== 404) {
    throw new Error(`DELETE knowledge document answered ${String(response.status())}`);
  }
}
