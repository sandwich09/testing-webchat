import { IMAGE_MAX_BYTES, VIDEO_MAX_BYTES } from './constants';
import type { StorageKey, UploadId } from './ids';
import type { SniffedType } from './media.model';

const startsWith = (bytes: Uint8Array, offset: number, expected: readonly number[]): boolean =>
  bytes.length >= offset + expected.length && expected.every((b, i) => bytes[offset + i] === b);

const ascii = (s: string): number[] => Array.from(s, (c) => c.charCodeAt(0));

export const sniffContentType: (leadingBytes: Uint8Array) => SniffedType | null = (bytes) => {
  if (startsWith(bytes, 0, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(bytes, 0, ascii('GIF8'))) return 'image/gif';
  if (startsWith(bytes, 0, ascii('RIFF')) && startsWith(bytes, 8, ascii('WEBP'))) {
    return 'image/webp';
  }
  if (startsWith(bytes, 4, ascii('ftyp')) && bytes.length >= 12) {
    // QuickTime (.mov) files share the box layout but are not accepted as mp4.
    return startsWith(bytes, 8, ascii('qt  ')) ? null : 'video/mp4';
  }
  if (startsWith(bytes, 0, ascii('%PDF-'))) return 'application/pdf';
  return null;
};

export const outboundMediaRule: (kind: 'image' | 'video') => {
  contentTypes: string[];
  maxBytes: number;
} = (kind) =>
  kind === 'image'
    ? { contentTypes: ['image/jpeg', 'image/png'], maxBytes: IMAGE_MAX_BYTES }
    : { contentTypes: ['video/mp4'], maxBytes: VIDEO_MAX_BYTES };

export const inboundMediaMaxBytes: (type: 'image' | 'video') => number = (type) =>
  type === 'image' ? IMAGE_MAX_BYTES : VIDEO_MAX_BYTES;

export const isAllowedInboundType: (
  type: 'image' | 'video',
  sniffed: SniffedType | null,
) => boolean = (type, sniffed) => {
  if (sniffed === null) return false;
  if (type === 'video') return sniffed === 'video/mp4';
  return (
    sniffed === 'image/jpeg' ||
    sniffed === 'image/png' ||
    sniffed === 'image/gif' ||
    sniffed === 'image/webp'
  );
};

const OUTBOUND_EXT: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'video/mp4': 'mp4',
};

export const outboundStorageKeys: (
  uploadId: UploadId,
  contentType: string,
) => { original: StorageKey; preview: StorageKey } = (uploadId, contentType) => {
  const ext = Object.hasOwn(OUTBOUND_EXT, contentType) ? OUTBOUND_EXT[contentType] : undefined;
  if (ext === undefined) throw new Error(`unsupported outbound content type: ${contentType}`);
  return {
    original: `outbound/${uploadId}/original.${ext}` as StorageKey,
    preview: `outbound/${uploadId}/preview.jpg` as StorageKey,
  };
};

export const inboundStorageKeys: (
  token: string,
  ext: string,
) => { original: StorageKey; preview: StorageKey } = (token, ext) => ({
  original: `inbound/${token}/original.${ext}` as StorageKey,
  preview: `inbound/${token}/preview.jpg` as StorageKey,
});
