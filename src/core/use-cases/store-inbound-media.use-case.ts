import type {
  ErrorCode,
  LineAccessToken,
  LineMessageId,
  MediaStatus,
  MessageId,
  StorageKey,
} from '@/core/domain';
import {
  MEDIA_CONTENT_CALL_WORST_MS,
  MEDIA_JOB_BUDGET_MS,
  MEDIA_NOT_READY_POLL_MS,
  MEDIA_STATUS_CALL_WORST_MS,
  PREVIEW_MAX_BYTES,
  inboundMediaMaxBytes,
  inboundStorageKeys,
  err,
  isAllowedInboundType,
  ok,
  sniffContentType,
} from '@/core/domain';
import type { StoredObject } from '@/core/ports';
import { makeLoadLineAccess } from './shared/load-line-access';
import type { AllPorts, RequestContext, UseCase, UseCaseConfig } from './types';

export type StoreInboundMediaInput = { messageId: MessageId };

export type StoreInboundMediaOutput = { status: MediaStatus };

export type StoreInboundMediaDeps = Pick<
  AllPorts,
  | 'messages'
  | 'contacts'
  | 'settings'
  | 'cipher'
  | 'gateway'
  | 'storage'
  | 'ids'
  | 'clock'
  | 'logger'
>;

interface Download {
  stream: ReadableStream<Uint8Array>;
  contentType: string | null;
  sizeBytes: number | null;
}

type PutOutcome =
  | { kind: 'stored'; object: StoredObject }
  | { kind: 'too_large' }
  | { kind: 'failed'; code: ErrorCode };

/**
 * Passes the LINE stream through unchanged and remembers whether the source itself errored, which
 * storage adapters report in different ways (a thrown read or `storage.unavailable`).
 */
const watchSource = (
  source: ReadableStream<Uint8Array>,
): { stream: ReadableStream<Uint8Array>; state: { failed: boolean; error: unknown } } => {
  const state: { failed: boolean; error: unknown } = { failed: false, error: undefined };
  const reader = source.getReader();
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) controller.close();
        else controller.enqueue(value);
      } catch (e) {
        state.failed = true;
        state.error = e;
        controller.error(e);
      }
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
  return { stream, state };
};

/**
 * A source error means the size cap only when the size is known to exceed it: a Content-Length
 * over the cap, or the `media.too_large` code the MessagingGateway contract puts on the error of
 * an unsized stream read past maxBytes. Any other break (a reset connection) is a plain failure.
 */
const isCapError = (error: unknown, sizeBytes: number | null, maxBytes: number): boolean =>
  (sizeBytes !== null && sizeBytes > maxBytes) ||
  (typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'media.too_large');

export const makeStoreInboundMedia: (
  deps: StoreInboundMediaDeps,
  config: UseCaseConfig,
) => UseCase<StoreInboundMediaInput, StoreInboundMediaOutput> = (deps) => {
  const { messages, gateway, storage, ids, clock, logger } = deps;
  const loadLineAccess = makeLoadLineAccess(deps);

  const dropFile = async (key: StorageKey): Promise<void> => {
    // Best effort: a file left behind is unreachable because the message never points at it.
    await storage.delete(key).catch(() => undefined);
  };

  const putCapped = async (key: StorageKey, d: Download, maxBytes: number): Promise<PutOutcome> => {
    const watched = watchSource(d.stream);
    const result = await storage
      .put(key, watched.stream, {
        contentType: d.contentType ?? 'application/octet-stream',
        maxSizeBytes: maxBytes,
      })
      .catch((e: unknown) => {
        // A read error of the LINE stream may surface as a throw; anything else is unexpected.
        if (watched.state.failed) return null;
        throw e;
      });
    if (result === null || watched.state.failed) {
      await dropFile(key);
      return isCapError(watched.state.error, d.sizeBytes, maxBytes)
        ? { kind: 'too_large' }
        : { kind: 'failed', code: 'line.unavailable' };
    }
    if (result.ok) return { kind: 'stored', object: result.value };
    if (result.error.code === 'media.too_large') {
      await dropFile(key);
      return { kind: 'too_large' };
    }
    return { kind: 'failed', code: result.error.code };
  };

  /** Video thumbnail from LINE. null on any failure: the page then shows a video icon. */
  const storePreview = async (
    token: LineAccessToken,
    lineMessageId: LineMessageId,
    key: StorageKey,
  ): Promise<string | null> => {
    try {
      const d = await gateway.downloadContent(token, lineMessageId, 'preview', PREVIEW_MAX_BYTES);
      if (!d.ok) return null;
      const put = await putCapped(key, d.value, PREVIEW_MAX_BYTES);
      return put.kind === 'stored' ? put.object.publicUrl : null;
    } catch {
      await dropFile(key);
      return null;
    }
  };

  /**
   * The original answered "not ready" (LINE still prepares it). Waits and asks LINE about the
   * content while the job budget still holds the worst case of what is left (this wait, a status
   * call, the original again and a video's preview), then downloads the original once more. When
   * the budget cannot hold that, nothing is retried and the caller fails the message, so it never
   * stays pending without a retry under way.
   */
  const downloadWhenReady = async (
    token: LineAccessToken,
    id: MessageId,
    type: 'image' | 'video',
    lineMessageId: LineMessageId,
    max: number,
    startedMs: number,
    ctx: RequestContext,
  ): ReturnType<typeof gateway.downloadContent> => {
    const elapsed = (): number => clock.now().getTime() - startedMs;
    const rest = MEDIA_CONTENT_CALL_WORST_MS * (type === 'video' ? 2 : 1);
    for (let attempt = 1; ; attempt += 1) {
      const next = MEDIA_NOT_READY_POLL_MS + MEDIA_STATUS_CALL_WORST_MS + rest;
      if (elapsed() + next > MEDIA_JOB_BUDGET_MS) break;
      logger.log('info', 'media.store.not_ready', {
        requestId: ctx.requestId,
        messageId: id,
        attempt,
      });
      await clock.sleep(MEDIA_NOT_READY_POLL_MS);
      const status = await gateway.getContentStatus(token, lineMessageId);
      if (status.ok && status.value === 'failed') return err('line.content_unavailable');
      if (status.ok && status.value === 'succeeded') break;
      // processing, or no answer: ask again while the budget allows.
    }
    if (elapsed() + rest > MEDIA_JOB_BUDGET_MS) return err('line.content_not_ready');
    return gateway.downloadContent(token, lineMessageId, 'original', max);
  };

  /** The status another run left, when the compare-and-set on pending lost to it. */
  const currentStatus = async (id: MessageId, fallback: MediaStatus): Promise<MediaStatus> =>
    (await messages.findById(id))?.mediaStatus ?? fallback;

  const finish = async (
    id: MessageId,
    status: Exclude<MediaStatus, 'ready' | 'pending'>,
    ctx: RequestContext,
    errorCode?: ErrorCode,
  ): Promise<{ status: MediaStatus }> => {
    if (!(await messages.setMediaStatus(id, status))) {
      // Another run already finished this message; its result stands.
      return { status: await currentStatus(id, status) };
    }
    logger.log('warn', 'media.store.failed', {
      requestId: ctx.requestId,
      messageId: id,
      outcome: status,
      errorCode,
    });
    return { status };
  };

  const store = async (
    id: MessageId,
    type: 'image' | 'video',
    lineMessageId: LineMessageId,
    ctx: RequestContext,
  ): Promise<{ status: MediaStatus }> => {
    const access = await loadLineAccess();
    if (!access.ok) return finish(id, 'failed', ctx, access.error.code);
    const token = access.value.channelAccessToken;

    const max = inboundMediaMaxBytes(type);
    // The extension follows the message type; a PNG named .jpg is fine because browsers read the
    // type from the content and the header.
    const keys = inboundStorageKeys(ids.randomToken(), type === 'image' ? 'jpg' : 'mp4');

    const startedMs = clock.now().getTime();
    let download = await gateway.downloadContent(token, lineMessageId, 'original', max);
    if (!download.ok && download.error.code === 'line.content_not_ready') {
      download = await downloadWhenReady(token, id, type, lineMessageId, max, startedMs, ctx);
    }
    if (!download.ok) {
      return download.error.code === 'media.too_large'
        ? finish(id, 'too_large', ctx, 'media.too_large')
        : finish(id, 'failed', ctx, download.error.code);
    }

    const put = await putCapped(keys.original, download.value, max);
    if (put.kind === 'too_large') return finish(id, 'too_large', ctx, 'media.too_large');
    if (put.kind === 'failed') return finish(id, 'failed', ctx, put.code);

    const inspected = await storage.inspect(keys.original);
    if (
      !inspected.ok ||
      !isAllowedInboundType(type, sniffContentType(inspected.value.leadingBytes))
    ) {
      await dropFile(keys.original);
      return finish(id, 'failed', ctx, inspected.ok ? undefined : inspected.error.code);
    }

    const mediaUrl = put.object.publicUrl;
    const previewUrl =
      type === 'image'
        ? mediaUrl
        : ((await storePreview(token, lineMessageId, keys.preview)) ?? mediaUrl);

    if (!(await messages.setMediaReady(id, mediaUrl, previewUrl))) {
      // A concurrent run for the same message finished first (a second store_media job after a
      // redelivery). Its files stay; ours are unreachable, so they are removed.
      await dropFile(keys.original);
      if (previewUrl !== mediaUrl) await dropFile(keys.preview);
      return { status: await currentStatus(id, 'ready') };
    }
    logger.log('info', 'media.store.succeeded', {
      requestId: ctx.requestId,
      messageId: id,
      sizeBytes: put.object.sizeBytes,
    });
    return { status: 'ready' };
  };

  return async (input, ctx) => {
    const message = await messages.findById(input.messageId);
    if (message === null) return ok({ status: 'failed' });
    if (message.type !== 'image' && message.type !== 'video') {
      return ok({ status: message.mediaStatus ?? 'failed' });
    }
    // Already handled (or never downloadable): repeat calls do nothing.
    if (message.mediaStatus !== 'pending') return ok({ status: message.mediaStatus ?? 'failed' });
    if (message.lineMessageId === null) {
      return ok(await finish(message.id, 'failed', ctx, 'line.content_unavailable'));
    }

    try {
      return ok(await store(message.id, message.type, message.lineMessageId, ctx));
    } catch (e) {
      // Never leave the message pending (a no-op if another run already finished it); runJob
      // logs the exception.
      await messages.setMediaStatus(message.id, 'failed').catch(() => undefined);
      throw e;
    }
  };
};
