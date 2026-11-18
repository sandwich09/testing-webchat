// Browser-side media work of the composer (ui-screens 8.3): read the first bytes of a file, turn
// WebP and HEIC/HEIF into JPEG, and make the small JPEG preview the upload ticket asks for. The
// decisions (type, limits, sizes) are pure functions in inbox.logic.ts; this file only touches
// `createImageBitmap`, `OffscreenCanvas` and `<video>`, each behind one small function.
import { computeTargetSize } from './inbox.logic';

/** Longest side of a converted image (WebP or HEIC to JPEG). */
export const CONVERT_MAX_EDGE = 4096;
/** Longest side and quality of the preview image sent with every upload. */
export const PREVIEW_MAX_EDGE = 480;
export const PREVIEW_QUALITY = 0.8;
/** JPEG quality of a converted image. */
export const CONVERT_QUALITY = 0.9;
/** Where the first video frame is taken, and how long to wait for it. */
export const VIDEO_FRAME_AT_SECONDS = 0.1;
export const VIDEO_FRAME_TIMEOUT_MS = 10_000;
/** JPEG has no transparency: transparent pixels become this colour instead of black. */
const JPEG_BACKGROUND = '#ffffff';

/** The first `n` bytes of a file, for `sniffMediaType`. */
export async function readHeadBytes(file: Blob, n: number): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(0, n).arrayBuffer());
}

/** Draws a decoded image or video frame onto a white canvas no larger than `maxEdge`, as JPEG. */
async function drawToJpeg(
  source: CanvasImageSource,
  width: number,
  height: number,
  maxEdge: number,
  quality: number,
): Promise<Blob> {
  const size = computeTargetSize(width, height, maxEdge);
  const canvas = new OffscreenCanvas(size.width, size.height);
  const context = canvas.getContext('2d');
  if (context === null) throw new Error('2d canvas is not available');
  context.fillStyle = JPEG_BACKGROUND;
  context.fillRect(0, 0, size.width, size.height);
  context.drawImage(source, 0, 0, size.width, size.height);
  return canvas.convertToBlob({ type: 'image/jpeg', quality });
}

/** Decodes with the browser and re-encodes as JPEG within `maxEdge`. */
async function reencode(file: Blob, maxEdge: number, quality: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    return await drawToJpeg(bitmap, bitmap.width, bitmap.height, maxEdge, quality);
  } finally {
    bitmap.close();
  }
}

/** WebP (or HEIC the browser decodes itself) to JPEG, longest side at most 4096 px. */
export function convertToJpeg(file: Blob, quality = CONVERT_QUALITY): Promise<Blob> {
  return reencode(file, CONVERT_MAX_EDGE, quality);
}

/** The small JPEG preview of an image that goes with every upload. */
export function buildPreviewImage(
  source: Blob,
  maxEdge = PREVIEW_MAX_EDGE,
  quality = PREVIEW_QUALITY,
): Promise<Blob> {
  return reencode(source, maxEdge, quality);
}

// The overload of `heicTo` from heic-to 1.6.7 (dist/csp/heic-to.d.ts) that this file uses. Written
// out because even a type-only import of heic-to is a lint error; the dynamic import below is
// checked against it by the compiler.
type HeicToModule = {
  heicTo: (args: { blob: Blob; type: 'image/jpeg'; quality?: number }) => Promise<Blob>;
};

export type HeicDeps = {
  /** `createImageBitmap`, used to read the size of the JPEG heic-to returns. */
  decode: (blob: Blob) => Promise<{ width: number; height: number; close(): void }>;
  /** Re-encodes a blob as JPEG within `maxEdge`; rejects when the browser cannot decode it. */
  reencode: (blob: Blob, maxEdge: number, quality: number) => Promise<Blob>;
  /** Loads the HEIC decoder. Only ever called after the browser failed to decode the file. */
  loadHeicTo: () => Promise<HeicToModule>;
};

/**
 * HEIC/HEIF to JPEG with injected browser parts (ui-screens 8.3 steps 1 to 4). Safari decodes HEIC
 * itself; Chrome and Firefox do not, so they load `heic-to` here and only here. Every failure,
 * the failed import included, is thrown on to the caller, which shows `convertFailed`.
 */
export async function convertHeicWith(file: Blob, quality: number, deps: HeicDeps): Promise<Blob> {
  try {
    // Step 1: `convertToJpeg`, which works where the browser decodes HEIC itself (Safari).
    return await deps.reencode(file, CONVERT_MAX_EDGE, quality);
  } catch {
    // `createImageBitmap` cannot read HEIC here (Chrome, Firefox): fall through to heic-to.
  }
  const { heicTo } = await deps.loadHeicTo();
  const jpeg = await heicTo({ blob: file, type: 'image/jpeg', quality });
  const decoded = await deps.decode(jpeg);
  const longest = Math.max(decoded.width, decoded.height);
  decoded.close();
  return longest > CONVERT_MAX_EDGE ? deps.reencode(jpeg, CONVERT_MAX_EDGE, quality) : jpeg;
}

/** The only place that loads heic-to. Static imports of it are a lint error (ADR 0019). */
const loadHeicTo = (): Promise<HeicToModule> => import('heic-to/csp');

/** HEIC/HEIF to JPEG: the browser's own decoder first, then `heic-to/csp` loaded on demand. */
export function convertHeicToJpeg(file: Blob, quality = CONVERT_QUALITY): Promise<Blob> {
  return convertHeicWith(file, quality, {
    decode: (blob) => createImageBitmap(blob),
    reencode,
    loadHeicTo,
  });
}

/**
 * JPEG of the frame at 0.1 s of a video, longest side at most `maxEdge`. Fails after 10 seconds
 * or when the browser cannot play the file. The object URL is always revoked.
 */
export function captureVideoFrame(file: Blob, maxEdge = PREVIEW_MAX_EDGE): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    let settled = false;

    const finish = (result: { blob: Blob } | { error: unknown }): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(url);
      if ('blob' in result) resolve(result.blob);
      else reject(result.error instanceof Error ? result.error : new Error('video frame failed'));
    };
    const timer = setTimeout(() => {
      finish({ error: new Error('video frame timed out') });
    }, VIDEO_FRAME_TIMEOUT_MS);

    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.addEventListener(
      'loadeddata',
      () => {
        video.currentTime = VIDEO_FRAME_AT_SECONDS;
      },
      { once: true },
    );
    video.addEventListener(
      'seeked',
      () => {
        drawToJpeg(video, video.videoWidth, video.videoHeight, maxEdge, PREVIEW_QUALITY).then(
          (blob) => {
            finish({ blob });
          },
          (error: unknown) => {
            finish({ error });
          },
        );
      },
      { once: true },
    );
    video.addEventListener('error', () => {
      finish({ error: new Error('video cannot be decoded') });
    });
    video.src = url;
  });
}
