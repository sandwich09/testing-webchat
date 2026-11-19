import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DocumentDto } from '@/contracts';

import {
  createCannedReply,
  deleteCannedReply,
  deleteKbDocument,
  getKbDocument,
  getSystemStatus,
  getUsage,
  getUsageDetail,
  listKbDocuments,
  retryKbDocument,
  saveLineCredentials,
  testLineConnection,
  updateCannedReply,
  updateSettings,
  uploadKbDocument,
} from './settings.api';
import { hasProcessingDocument } from './settings.hooks';

const fetchMock = vi.fn<typeof fetch>();
const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const noContent = (): Response => new Response(null, { status: 204 });

const urlOf = (input: RequestInfo | URL): string =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

function call(n = 0): { url: string; method: string; body: unknown } {
  const args = fetchMock.mock.calls[n];
  if (args === undefined) throw new Error('no call');
  const init = args[1] ?? {};
  return {
    url: urlOf(args[0]),
    method: init.method ?? 'GET',
    body: typeof init.body === 'string' ? JSON.parse(init.body) : init.body,
  };
}

const T = '2026-11-18T07:00:00.000Z';
const settings = {
  ai: {
    enabled: false,
    provider: 'claude',
    model: 'claude-haiku-5-5',
    dailyBudgetUsd: '3.50',
    todayCostUsd: '0.012345',
    politeParticle: 'ครับ',
    instructions: 'สุภาพ',
  },
  guard: { enabled: false, topics: [], refusalText: 'คุยได้เฉพาะหัวข้อที่กำหนดไว้นะคะ', blockedToday: 0 },
  line: {
    configured: false,
    status: 'not_configured',
    botName: null,
    basicId: null,
    channelId: null,
    secretStatus: 'no_channel_id',
    webhookUrl: 'https://example.test/api/line/webhook',
    lastWebhookAt: null,
  },
  client: { pollIntervalMs: 500 },
};
const doc = (id: string, status: DocumentDto['status']): DocumentDto => ({
  id,
  fileName: 'menu.pdf',
  sizeBytes: 1000,
  pageCount: null,
  tokenCount: null,
  status,
  errorCode: null,
  createdAt: T,
  updatedAt: T,
});
const reply = { id: 'r/1', title: 'ราคา', text: '100 บาท', sortOrder: 1, updatedAt: T };
const usage = {
  month: '2026-11',
  priceTableDate: '2026-11-01',
  contacts: [],
  ingest: {
    count: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    totalTokens: 0,
    costUsd: '0.000000',
  },
  guard: {
    count: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    totalTokens: 0,
    costUsd: '0.000000',
  },
  totalCostUsd: '0.000000',
  replyCount: 0,
  averageCostPerReplyUsd: null,
  noResponseCount: 0,
};
const record = {
  id: 'u1',
  createdAt: T,
  kind: 'reply',
  model: 'claude-haiku-5-5',
  inputTokens: 1,
  outputTokens: 2,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  costUsd: '0.000010',
  outcome: 'ok',
};
const status = {
  lastWebhookAt: null,
  lastLineError: null,
  lastAiError: { code: 'ai.refused', at: T },
  todayCostUsd: '0.000000',
  dailyBudgetUsd: '5.00',
  priceTableDate: '2026-11-01',
  database: 'ok',
};

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AI and LINE', () => {
  it('updateSettings sends PATCH with the patch and parses SettingsDto', async () => {
    fetchMock.mockResolvedValue(json(settings));
    await expect(updateSettings({ aiEnabled: false })).resolves.toEqual(settings);
    expect(call()).toEqual({ url: '/api/settings', method: 'PATCH', body: { aiEnabled: false } });
  });

  it('saveLineCredentials sends PUT and returns the bot info with the secret check', async () => {
    const info = { botName: 'ร้าน', basicId: '@shop', secretStatus: 'verified' };
    fetchMock.mockResolvedValue(json(info));
    const body = { channelId: '1234567890', channelSecret: 's', channelAccessToken: 't' };
    await expect(saveLineCredentials(body)).resolves.toEqual(info);
    expect(call()).toEqual({ url: '/api/settings/line-credentials', method: 'PUT', body });
  });

  it('saveLineCredentials passes on line.credentials_invalid', async () => {
    fetchMock.mockResolvedValue(
      json({ error: { code: 'line.credentials_invalid', message: 'x', requestId: 'r' } }, 422),
    );
    await expect(
      saveLineCredentials({ channelId: '1234567890', channelSecret: 's', channelAccessToken: 't' }),
    ).rejects.toMatchObject({ code: 'line.credentials_invalid', status: 422 });
  });

  it('testLineConnection posts to /api/settings/line/test', async () => {
    fetchMock.mockResolvedValue(
      json({ botName: 'ร้าน', basicId: '@shop', secretStatus: 'no_channel_id' }),
    );
    await testLineConnection();
    expect(call()).toMatchObject({ url: '/api/settings/line/test', method: 'POST' });
  });
});

describe('knowledge base', () => {
  it('listKbDocuments parses the list', async () => {
    const list = { documents: [doc('d1', 'ready')], usedTokens: 10, capacityTokens: 100 };
    fetchMock.mockResolvedValue(json(list));
    await expect(listKbDocuments()).resolves.toEqual(list);
    expect(call().url).toBe('/api/knowledge/documents');
  });

  it('uploadKbDocument posts multipart with the single part "file"', async () => {
    fetchMock.mockResolvedValue(json(doc('d1', 'processing'), 202));
    const file = new File(['%PDF-1.7'], 'menu.pdf', { type: 'application/pdf' });
    await expect(uploadKbDocument(file)).resolves.toMatchObject({ status: 'processing' });
    const { url, method, body } = call();
    expect(url).toBe('/api/knowledge/documents');
    expect(method).toBe('POST');
    expect(body).toBeInstanceOf(FormData);
    const part = (body as FormData).get('file'); // asserted FormData above
    expect(part).toBeInstanceOf(File);
    expect((part as File).name).toBe('menu.pdf'); // asserted File above
  });

  it('retryKbDocument posts multipart to .../:id/retry', async () => {
    fetchMock.mockResolvedValue(json(doc('d/1', 'processing'), 202));
    await retryKbDocument('d/1', new File(['%PDF-'], 'a.pdf'));
    expect(call()).toMatchObject({ url: '/api/knowledge/documents/d%2F1/retry', method: 'POST' });
  });

  it('getKbDocument parses DocumentDetailDto', async () => {
    fetchMock.mockResolvedValue(json({ ...doc('d1', 'ready'), extractedText: 'เมนู' }));
    await expect(getKbDocument('d1')).resolves.toMatchObject({ extractedText: 'เมนู' });
  });

  it('deleteKbDocument sends DELETE and resolves on 204', async () => {
    fetchMock.mockResolvedValue(noContent());
    await expect(deleteKbDocument('d1')).resolves.toBeUndefined();
    expect(call()).toMatchObject({ url: '/api/knowledge/documents/d1', method: 'DELETE' });
  });

  it('hasProcessingDocument keeps the list polling only while a file is processing', () => {
    expect(hasProcessingDocument(undefined)).toBe(false);
    const list = (s: DocumentDto['status']) => ({
      documents: [doc('a', 'ready'), doc('b', s)],
      usedTokens: 0,
      capacityTokens: 1,
    });
    expect(hasProcessingDocument(list('processing'))).toBe(true);
    expect(hasProcessingDocument(list('failed'))).toBe(false);
  });
});

describe('canned replies', () => {
  it('createCannedReply posts and parses the 201 body', async () => {
    fetchMock.mockResolvedValue(json(reply, 201));
    await expect(createCannedReply({ title: 'ราคา', text: '100 บาท' })).resolves.toEqual(reply);
    expect(call()).toEqual({
      url: '/api/canned-replies',
      method: 'POST',
      body: { title: 'ราคา', text: '100 บาท' },
    });
  });

  it('updateCannedReply sends PATCH to the encoded id', async () => {
    fetchMock.mockResolvedValue(json(reply));
    await updateCannedReply('r/1', { sortOrder: 3 });
    expect(call()).toEqual({
      url: '/api/canned-replies/r%2F1',
      method: 'PATCH',
      body: { sortOrder: 3 },
    });
  });

  it('deleteCannedReply sends DELETE', async () => {
    fetchMock.mockResolvedValue(noContent());
    await deleteCannedReply('r1');
    expect(call()).toMatchObject({ url: '/api/canned-replies/r1', method: 'DELETE' });
  });
});

describe('usage and status', () => {
  it('getUsage sends the month', async () => {
    fetchMock.mockResolvedValue(json(usage));
    await expect(getUsage('2026-11')).resolves.toEqual(usage);
    expect(call().url).toBe('/api/usage?month=2026-11');
  });

  it('getUsageDetail returns the records', async () => {
    fetchMock.mockResolvedValue(json({ records: [record] }));
    await expect(getUsageDetail('c1', '2026-10')).resolves.toEqual([record]);
    expect(call().url).toBe('/api/usage/contacts/c1?month=2026-10');
  });

  it('getSystemStatus parses SystemStatusDto, and a 500 is an error the section shows', async () => {
    fetchMock.mockResolvedValueOnce(json(status));
    await expect(getSystemStatus()).resolves.toEqual(status);
    fetchMock.mockResolvedValueOnce(
      json({ error: { code: 'internal.unexpected', message: 'x', requestId: 'r' } }, 500),
    );
    await expect(getSystemStatus()).rejects.toMatchObject({
      code: 'internal.unexpected',
      status: 500,
    });
  });
});
