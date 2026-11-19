// API functions of the settings page (ui-screens 1.6): one function per endpoint, every answer
// checked with its schema from src/contracts through `apiFetch`.
import { apiFetch, apiFetchNoContent } from '@/common/common.api';
import {
  contactUsageResponseSchema,
  getDocumentResponseSchema,
  ingestDocumentResponseSchema,
  KNOWLEDGE_FILE_FIELD,
  lineBotInfoResponseSchema,
  listDocumentsResponseSchema,
  retryDocumentResponseSchema,
  systemStatusResponseSchema,
  updateSettingsResponseSchema,
  usageReportResponseSchema,
  type DocumentDetailDto,
  type DocumentDto,
  type LineBotInfoResponse,
  type ListDocumentsResponse,
  type SettingsDto,
  type SystemStatusDto,
  type UpdateSettingsBody,
  type UsageRecordDto,
  type UsageReportResponse,
} from '@/contracts';

export type SettingsPatch = UpdateSettingsBody;
export type KbDocumentsList = ListDocumentsResponse;
export type UsageReport = UsageReportResponse;
export type LineBotInfo = LineBotInfoResponse;

const documentPath = (id: string): string => `/api/knowledge/documents/${encodeURIComponent(id)}`;

function pdfForm(file: File): FormData {
  const form = new FormData();
  form.append(KNOWLEDGE_FILE_FIELD, file, file.name);
  return form;
}

/** PATCH /api/settings */
export function updateSettings(patch: SettingsPatch): Promise<SettingsDto> {
  return apiFetch('/api/settings', {
    method: 'PATCH',
    body: patch,
    schema: updateSettingsResponseSchema,
  });
}

/** PUT /api/settings/line-credentials */
export function saveLineCredentials(body: {
  channelId: string;
  channelSecret: string;
  channelAccessToken: string;
}): Promise<LineBotInfo> {
  return apiFetch('/api/settings/line-credentials', {
    method: 'PUT',
    body,
    schema: lineBotInfoResponseSchema,
  });
}

/** POST /api/settings/line/test */
export function testLineConnection(): Promise<LineBotInfo> {
  return apiFetch('/api/settings/line/test', { method: 'POST', schema: lineBotInfoResponseSchema });
}

/** GET /api/knowledge/documents */
export function listKbDocuments(signal?: AbortSignal): Promise<KbDocumentsList> {
  return apiFetch('/api/knowledge/documents', { schema: listDocumentsResponseSchema, signal });
}

/** POST /api/knowledge/documents (multipart, answers 202 with the row in `processing`). */
export function uploadKbDocument(file: File): Promise<DocumentDto> {
  return apiFetch('/api/knowledge/documents', {
    method: 'POST',
    body: pdfForm(file),
    schema: ingestDocumentResponseSchema,
  });
}

/** GET /api/knowledge/documents/:id */
export function getKbDocument(id: string, signal?: AbortSignal): Promise<DocumentDetailDto> {
  return apiFetch(documentPath(id), { schema: getDocumentResponseSchema, signal });
}

/** DELETE /api/knowledge/documents/:id */
export function deleteKbDocument(id: string): Promise<void> {
  return apiFetchNoContent(documentPath(id), { method: 'DELETE' });
}

/** POST /api/knowledge/documents/:id/retry (multipart, answers 202). */
export function retryKbDocument(id: string, file: File): Promise<DocumentDto> {
  return apiFetch(`${documentPath(id)}/retry`, {
    method: 'POST',
    body: pdfForm(file),
    schema: retryDocumentResponseSchema,
  });
}

/** GET /api/usage?month=YYYY-MM */
export function getUsage(month: string, signal?: AbortSignal): Promise<UsageReport> {
  return apiFetch('/api/usage', { query: { month }, schema: usageReportResponseSchema, signal });
}

/** GET /api/usage/contacts/:id?month=YYYY-MM */
export async function getUsageDetail(
  contactId: string,
  month: string,
  signal?: AbortSignal,
): Promise<UsageRecordDto[]> {
  const page = await apiFetch(`/api/usage/contacts/${encodeURIComponent(contactId)}`, {
    query: { month },
    schema: contactUsageResponseSchema,
    signal,
  });
  return page.records;
}

/** GET /api/system/status */
export function getSystemStatus(signal?: AbortSignal): Promise<SystemStatusDto> {
  return apiFetch('/api/system/status', { schema: systemStatusResponseSchema, signal });
}
