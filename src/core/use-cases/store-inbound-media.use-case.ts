import type {
  ErrorCode,
  LineAccessToken,
  LineMessageId,
  MediaFailure,
  MediaStatus,
  MessageId,
  StorageKey,
} from '@/core/domain';
import {
  MEDIA_CONTENT_CALL_WORST_MS,
  MEDIA_JOB_BUDGET_MS,
  MEDIA_NOT_READY_POLL_MS,
  MEDIA_STATUS_CALL_WORST_MS,
  MEDIA_STORE_CALL_WORST_MS,
  PREVIEW_MAX_BYTES,
  inboundAudioFormat,
  inboundMediaMaxBytes,
  inboundStorageKeys,
  err,
  isAllowedInboundType,
  ok,
  sniffContentType,
} from '@/core/domain';
import type { InboundMediaType } from '@/core/domain';
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

/**
 * The step a job is in. Logged as `stage` on `media.store.failed`, so a failure (or a job cut at
 * MEDIA_JOB_BUDGET_MS) names where it stopped: reading the LINE credentials, downloading from LINE,
 * waiting for LINE to prepare the content, uploading to FileStorage, inspecting the stored file,
 * the video preview, or saving the result.
 */
export type MediaStoreStage =
  'access' | 'download' | 'wait_ready' | 'upload' | 'inspect' | 'preview' | 'save';

/** `outcome` of `media.store.failed`: the status set, or `deadline` for a job cut at its budget. */
type FailedOutcome = Exclude<MediaStatus, 'ready' | 'pending'> | 'deadline';

interface JobState {
  stage: MediaStoreStage;
  startedMs: number;
  /** Stops the LINE stream being read, so a job cut at its deadline lets go of the download. */
  stopSource: (() => void) | null;
}

interface Download {
  stream: ReadableStream<Uint8Array>;
  contentType: string | null;
  sizeBytes: number | null;
}

type PutOutcome =
  | { kind: 'stored'; object: StoredObject }
  | { kind: 'too_large' }
  | { kind: 'failed'; code: ErrorCode };

class MediaJobDeadlineError extends Error {
  constructor() {
    super('media job passed its deadline');
    this.name = 'MediaJobDeadlineError';
  }
}

interface WatchedSource {
  stream: ReadableStream<Uint8Array>;
  state: { failed: boolean; error: unknown; ended: boolean; bytes: number };
  /** Errors the stream and cancels the source; no effect once the source has ended. */
  stop: () => void;
}

/**
 * Passes the LINE stream through unchanged and remembers whether the source itself errored, which
 * storage adapters report in different ways (a thrown read or `storage.unavailable`), and when it
 * ended (`onEnd` with the byte count: the download is over and the upload starts).
 */
const watchSource = (
  source: ReadableStream<Uint8Array>,
  onEnd?: (bytes: number) => void,
): WatchedSource => {
  const state: WatchedSource['state'] = { failed: false, error: undefined, ended: false, bytes: 0 };
  const reader = source.getReader();
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  let stopped = false;
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
    async pull(c) {
      try {
        const { done, value } = await reader.read();
        if (stopped) return;
        if (done) {
          state.ended = true;
          onEnd?.(state.bytes);
          c.close();
        } else {
          state.bytes += value.byteLength;
          c.enqueue(value);
        }
      } catch (e) {
        if (stopped) return;
        state.failed = true;
        state.error = e;
        c.error(e);
      }
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
  const stop = (): void => {
    if (stopped || state.ended) return;
    stopped = true;
    const e = new MediaJobDeadlineError();
    state.failed = true;
    state.error = e;
    try {
      controller?.error(e);
    } catch {
      // already closed or errored
    }
    void reader.cancel(e).catch(() => undefined);
  };
  return { stream, state, stop };
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

/** Bytes an audio container is told apart by (sniffContentType reads at most 12). */
const AUDIO_SNIFF_BYTES = 16;

/**
 * Reads the first `n` bytes of a stream (fewer when it is shorter) and gives back a stream that
 * still yields every byte, so the type can be known before the file is stored.
 */
const peekHead = async (
  source: ReadableStream<Uint8Array>,
  n: number,
): Promise<{ head: Uint8Array; stream: ReadableStream<Uint8Array> }> => {
  const reader = source.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  let done = false;
  while (length < n && !done) {
    const r = await reader.read();
    if (r.done) done = true;
    else {
      chunks.push(r.value);
      length += r.value.length;
    }
  }
  const head = new Uint8Array(Math.min(n, length));
  let offset = 0;
  for (const c of chunks) {
    if (offset >= head.length) break;
    head.set(c.subarray(0, head.length - offset), offset);
    offset += Math.min(c.length, head.length - offset);
  }
  const buffered = [...chunks];
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const next = buffered.shift();
      if (next !== undefined) {
        controller.enqueue(next);
        return;
      }
      if (done) {
        controller.close();
        return;
      }
      const r = await reader.read();
      if (r.done) controller.close();
      else controller.enqueue(r.value);
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
  return { head, stream };
};

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

  /**
   * Stores one LINE download. With `job`, the download and upload are tracked as stages: the end
   * of the LINE stream logs `media.store.downloaded` and moves the job to `upload`.
   */
  const putCapped = async (
    key: StorageKey,
    d: Download,
    maxBytes: number,
    job?: { state: JobState; ctx: RequestContext; id: MessageId },
  ): Promise<PutOutcome> => {
    const watched = watchSource(
      d.stream,
      job === undefined
        ? undefined
        : (bytes) => {
            job.state.stage = 'upload';
            logger.log('info', 'media.store.downloaded', {
              requestId: job.ctx.requestId,
              messageId: job.id,
              sizeBytes: bytes,
            });
          },
    );
    if (job !== undefined) job.state.stopSource = watched.stop;
    const result = await storage
      .put(key, watched.stream, {
        contentType: d.contentType ?? 'application/octet-stream',
        maxSizeBytes: maxBytes,
      })
      .catch((e: unknown) => {
        // A read error of the LINE stream may surface as a throw; anything else is unexpected.
        if (watched.state.failed) return null;
        throw e;
      })
      .finally(() => {
        if (job !== undefined) job.state.stopSource = null;
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
    // The store refused or broke while the LINE stream was fine: an upload failure, even when the
    // store stopped before reading the whole download.
    if (job !== undefined) job.state.stage = 'upload';
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
   * call, the original again and its store), then downloads the original once more. When the
   * budget cannot hold that, nothing is retried and the caller fails the message, so it never
   * stays pending without a retry under way. A video's preview is not reserved here: it is only
   * fetched when the budget still holds it after the original is stored.
   */
  const downloadWhenReady = async (
    token: LineAccessToken,
    id: MessageId,
    lineMessageId: LineMessageId,
    max: number,
    job: JobState,
    ctx: RequestContext,
  ): ReturnType<typeof gateway.downloadContent> => {
    const elapsed = (): number => clock.now().getTime() - job.startedMs;
    const rest = MEDIA_CONTENT_CALL_WORST_MS + MEDIA_STORE_CALL_WORST_MS;
    job.stage = 'wait_ready';
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
    job.stage = 'download';
    return gateway.downloadContent(token, lineMessageId, 'original', max);
  };

  /** The status another run left, when the compare-and-set on pending lost to it. */
  const currentStatus = async (id: MessageId, fallback: MediaStatus): Promise<MediaStatus> =>
    (await messages.findById(id))?.mediaStatus ?? fallback;

  const finish = async (
    id: MessageId,
    status: Exclude<MediaStatus, 'ready' | 'pending'>,
    ctx: RequestContext,
    job: JobState | null,
    o: { errorCode?: ErrorCode; failure?: MediaFailure; outcome?: FailedOutcome } = {},
  ): Promise<{ status: MediaStatus }> => {
    if (!(await messages.setMediaStatus(id, status, o.failure ?? 'download_failed'))) {
      // Another run already finished this message; its result stands.
      return { status: await currentStatus(id, status) };
    }
    logger.log('warn', 'media.store.failed', {
      requestId: ctx.requestId,
      messageId: id,
      outcome: o.outcome ?? status,
      errorCode: o.errorCode,
      ...(job === null
        ? {}
        : { stage: job.stage, durationMs: clock.now().getTime() - job.startedMs }),
    });
    return { status };
  };

  const store = async (
    id: MessageId,
    type: InboundMediaType,
    lineMessageId: LineMessageId,
    ctx: RequestContext,
    job: JobState,
  ): Promise<{ status: MediaStatus }> => {
    const fail = (errorCode?: ErrorCode, failure?: MediaFailure) =>
      finish(id, 'failed', ctx, job, { errorCode, failure });
    const tooLarge = () => finish(id, 'too_large', ctx, job, { errorCode: 'media.too_large' });

    const access = await loadLineAccess();
    if (!access.ok) return fail(access.error.code);
    const token = access.value.channelAccessToken;

    const max = inboundMediaMaxBytes(type);

    job.stage = 'download';
    let download = await gateway.downloadContent(token, lineMessageId, 'original', max);
    if (!download.ok && download.error.code === 'line.content_not_ready') {
      download = await downloadWhenReady(token, id, lineMessageId, max, job, ctx);
    }
    if (!download.ok) {
      return download.error.code === 'media.too_large' ? tooLarge() : fail(download.error.code);
    }

    // Images and video: the extension follows the message type; a PNG named .jpg is fine because
    // browsers read the type from the content and the header. Audio: the container is read from
    // the first bytes before storing, so the file gets the extension and Content-Type a browser
    // needs to play it (an unknown container is not stored at all).
    let file: Download = download.value;
    let ext = type === 'image' ? 'jpg' : 'mp4';
    if (type === 'audio') {
      const peeked = await peekHead(file.stream, AUDIO_SNIFF_BYTES);
      const format = inboundAudioFormat(sniffContentType(peeked.head));
      if (format === null) {
        await peeked.stream.cancel().catch(() => undefined);
        return fail(undefined, 'unsupported_type');
      }
      file = { ...file, stream: peeked.stream, contentType: format.contentType };
      ext = format.ext;
    }
    const keys = inboundStorageKeys(ids.randomToken(), ext);

    const put = await putCapped(keys.original, file, max, { state: job, ctx, id });
    if (put.kind === 'too_large') return tooLarge();
    if (put.kind === 'failed') return fail(put.code);
    logger.log('info', 'media.store.uploaded', {
      requestId: ctx.requestId,
      messageId: id,
      sizeBytes: put.object.sizeBytes,
    });

    job.stage = 'inspect';
    const inspected = await storage.inspect(keys.original);
    if (
      !inspected.ok ||
      !isAllowedInboundType(type, sniffContentType(inspected.value.leadingBytes))
    ) {
      await dropFile(keys.original);
      return inspected.ok ? fail(undefined, 'unsupported_type') : fail(inspected.error.code);
    }

    const mediaUrl = put.object.publicUrl;
    let previewUrl = mediaUrl;
    if (type === 'video') {
      // The preview is optional: it is only fetched while the budget still holds its worst case.
      job.stage = 'preview';
      const left = MEDIA_JOB_BUDGET_MS - (clock.now().getTime() - job.startedMs);
      if (left >= MEDIA_CONTENT_CALL_WORST_MS + MEDIA_STORE_CALL_WORST_MS) {
        previewUrl = (await storePreview(token, lineMessageId, keys.preview)) ?? mediaUrl;
      }
    }

    job.stage = 'save';
    if (!(await messages.setMediaReady(id, mediaUrl, previewUrl))) {
      // A concurrent run for the same message finished first (a second store_media job after a
      // redelivery), or this job passed its deadline and was marked failed. The stored result
      // stays; our files are unreachable, so they are removed.
      await dropFile(keys.original);
      if (previewUrl !== mediaUrl) await dropFile(keys.preview);
      return { status: await currentStatus(id, 'ready') };
    }
    logger.log('info', 'media.store.succeeded', {
      requestId: ctx.requestId,
      messageId: id,
      sizeBytes: put.object.sizeBytes,
      durationMs: clock.now().getTime() - job.startedMs,
    });
    return { status: 'ready' };
  };

  /**
   * Runs `store` against MEDIA_JOB_BUDGET_MS. Every step has its own bound in its adapter, and the
   * steps are only started while the budget holds them; this deadline is the last guard, for a
   * step that does not end (a stalled stream, a call that never settles). The job is then marked
   * `failed` (`interrupted`) with the stage it was in, the LINE stream is let go, and whatever the
   * abandoned step does later cannot change the message (every write is a compare-and-set on
   * pending).
   */
  const storeWithDeadline = async (
    id: MessageId,
    type: InboundMediaType,
    lineMessageId: LineMessageId,
    ctx: RequestContext,
  ): Promise<{ status: MediaStatus }> => {
    const job: JobState = { stage: 'access', startedMs: clock.now().getTime(), stopSource: null };
    logger.log('info', 'media.store.started', { requestId: ctx.requestId, messageId: id });
    const timer = clock.startTimer(MEDIA_JOB_BUDGET_MS);
    const work = store(id, type, lineMessageId, ctx, job);
    let first: { done: true; result: { status: MediaStatus } } | { done: false };
    try {
      first = await Promise.race([
        work.then((result) => ({ done: true as const, result })),
        timer.fired.then(() => ({ done: false as const })),
      ]);
    } finally {
      timer.cancel();
    }
    if (first.done) return first.result;
    // The abandoned step may still end later, with a result or an error; neither is used.
    work.catch(() => undefined);
    job.stopSource?.();
    return finish(id, 'failed', ctx, job, { failure: 'interrupted', outcome: 'deadline' });
  };

  return async (input, ctx) => {
    const message = await messages.findById(input.messageId);
    if (message === null) return ok({ status: 'failed' });
    if (message.type !== 'image' && message.type !== 'video' && message.type !== 'audio') {
      return ok({ status: message.mediaStatus ?? 'failed' });
    }
    // Already handled (or never downloadable): repeat calls do nothing.
    if (message.mediaStatus !== 'pending') return ok({ status: message.mediaStatus ?? 'failed' });
    if (message.lineMessageId === null) {
      return ok(
        await finish(message.id, 'failed', ctx, null, { errorCode: 'line.content_unavailable' }),
      );
    }

    try {
      return ok(await storeWithDeadline(message.id, message.type, message.lineMessageId, ctx));
    } catch (e) {
      // Never leave the message pending (a no-op if another run already finished it); runJob
      // logs the exception.
      await messages.setMediaStatus(message.id, 'failed').catch(() => undefined);
      throw e;
    }
  };
};
