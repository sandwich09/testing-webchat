// API functions of the chat page (ui-screens 1.6): one function per endpoint, every answer checked
// with its schema from src/contracts through `apiFetch`.
import { apiFetch, apiFetchNoContent, ApiError } from '@/common/common.api';
import {
  errorResponseSchema,
  getContactResponseSchema,
  getMessagesResponseSchema,
  issueUploadResponseSchema,
  markContactReadResponseSchema,
  retryMessageResponseSchema,
  sendMessageResponseSchema,
  setContactAiResponseSchema,
  typingResponseSchema,
  type ContactDetailDto,
  type ContactDto,
  type GetMessagesResponse,
  type IssueUploadBody,
  type MessageDto,
  type SendMessageBody,
  type UploadTargetDto,
  type UploadTicketDto,
} from '@/contracts';

// GET /api/contacts is shared with the shell, which may not import this feature.
export { listContacts } from '@/common/common.api';
export type { ContactsPage, ListContactsParams } from '@/common/common.api';

export type MessagesPage = GetMessagesResponse;

const contactPath = (id: string): string => `/api/contacts/${encodeURIComponent(id)}`;

/** GET /api/contacts/:id */
export function getContact(id: string, signal?: AbortSignal): Promise<ContactDetailDto> {
  return apiFetch(contactPath(id), { schema: getContactResponseSchema, signal });
}

/** PATCH /api/contacts/:id */
export function setContactAi(id: string, aiEnabled: boolean): Promise<ContactDto> {
  return apiFetch(contactPath(id), {
    method: 'PATCH',
    body: { aiEnabled },
    schema: setContactAiResponseSchema,
  });
}

/** POST /api/contacts/:id/read */
export function markContactRead(id: string): Promise<ContactDto> {
  return apiFetch(`${contactPath(id)}/read`, {
    method: 'POST',
    schema: markContactReadResponseSchema,
  });
}

/** GET /api/contacts/:id/messages: latest page, `beforeSeq` page, or polling (`afterUpdatedSeq`). */
export function getMessages(
  id: string,
  params: { beforeSeq?: string; afterUpdatedSeq?: string; limit?: number },
  signal?: AbortSignal,
): Promise<MessagesPage> {
  return apiFetch(`${contactPath(id)}/messages`, {
    query: {
      beforeSeq: params.beforeSeq,
      afterUpdatedSeq: params.afterUpdatedSeq,
      limit: params.limit,
    },
    schema: getMessagesResponseSchema,
    signal,
  });
}

/** POST /api/contacts/:id/messages. `body.id` is made by the browser; sending it again is safe. */
export function sendMessage(id: string, body: SendMessageBody): Promise<MessageDto> {
  return apiFetch(`${contactPath(id)}/messages`, {
    method: 'POST',
    body,
    schema: sendMessageResponseSchema,
  });
}

/** POST /api/contacts/:id/messages/:messageId/retry */
export function retryMessage(id: string, messageId: string): Promise<MessageDto> {
  return apiFetch(`${contactPath(id)}/messages/${encodeURIComponent(messageId)}/retry`, {
    method: 'POST',
    schema: retryMessageResponseSchema,
  });
}

/** POST /api/contacts/:id/typing */
export function notifyTyping(id: string): Promise<{ shown: boolean }> {
  return apiFetch(`${contactPath(id)}/typing`, { method: 'POST', schema: typingResponseSchema });
}

/** POST /api/uploads */
export function requestUpload(body: IssueUploadBody): Promise<UploadTicketDto> {
  return apiFetch('/api/uploads', { method: 'POST', body, schema: issueUploadResponseSchema });
}

/** DELETE /api/uploads/:uploadId */
export function cancelUpload(uploadId: string): Promise<void> {
  return apiFetchNoContent(`/api/uploads/${encodeURIComponent(uploadId)}`, { method: 'DELETE' });
}

export type UploadOptions = {
  /** Percent of the file sent, or `null` when the transport cannot tell. */
  onProgress: (pct: number | null) => void;
  signal: AbortSignal;
};

function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new DOMException('Aborted', 'AbortError');
}

/**
 * `http_put`: PUT to `target.url` (PUT /api/local-storage/*key) with XMLHttpRequest, because only
 * XHR reports upload progress. Success is a 200.
 */
function putWithProgress(
  target: Extract<UploadTargetDto, { strategy: 'http_put' }>,
  blob: Blob,
  { onProgress, signal }: UploadOptions,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError(signal));
      return;
    }
    const xhr = new XMLHttpRequest();
    const onAbort = (): void => {
      xhr.abort();
    };
    const done = (): void => {
      signal.removeEventListener('abort', onAbort);
    };
    xhr.open('PUT', target.url);
    for (const [name, value] of Object.entries(target.headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (event) => {
      onProgress(event.lengthComputable ? Math.round((event.loaded / event.total) * 100) : null);
    };
    xhr.onload = () => {
      done();
      if (xhr.status === 200) {
        onProgress(100);
        resolve();
        return;
      }
      reject(new ApiError(readXhrErrorCode(xhr), xhr.status));
    };
    xhr.onerror = () => {
      done();
      reject(new ApiError('client.network', 0));
    };
    xhr.ontimeout = xhr.onerror;
    xhr.onabort = () => {
      done();
      reject(abortError(signal));
    };
    signal.addEventListener('abort', onAbort);
    xhr.send(blob);
  });
}

function readXhrErrorCode(xhr: XMLHttpRequest): ApiError['code'] {
  let body: unknown = null;
  try {
    body = JSON.parse(xhr.responseText);
  } catch {
    // Not JSON: an unexpected answer.
  }
  const parsed = errorResponseSchema.safeParse(body);
  return parsed.success ? parsed.data.error.code : 'internal.unexpected';
}

/**
 * `vercel_blob_client`: client upload straight to Vercel Blob, not an endpoint of the app. The SDK
 * is loaded only when this strategy is used, so it stays out of the first bundle.
 */
async function putToVercelBlob(
  target: Extract<UploadTargetDto, { strategy: 'vercel_blob_client' }>,
  blob: Blob,
  { onProgress, signal }: UploadOptions,
): Promise<void> {
  const { put } = await import('@vercel/blob/client');
  try {
    await put(target.pathname, blob, {
      access: 'public',
      token: target.clientToken,
      contentType: target.contentType,
      abortSignal: signal,
      onUploadProgress: ({ percentage }) => {
        onProgress(Number.isFinite(percentage) ? Math.round(percentage) : null);
      },
    });
  } catch {
    if (signal.aborted) throw abortError(signal);
    // The SDK's errors carry no code of the catalog; the tray shows its upload-failed text.
    throw new ApiError('storage.unavailable', 0);
  }
}

/** Sends one file to the target of an upload ticket (ui-screens 7.6, api-contract "strategy"). */
export function uploadToTarget(
  target: UploadTargetDto,
  blob: Blob,
  opts: UploadOptions,
): Promise<void> {
  switch (target.strategy) {
    case 'http_put':
      return putWithProgress(target, blob, opts);
    case 'vercel_blob_client':
      return putToVercelBlob(target, blob, opts);
  }
}
