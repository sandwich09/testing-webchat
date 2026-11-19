import { describe, expect, it } from 'vitest';
import { AUDIO_MAX_BYTES, IMAGE_MAX_BYTES, VIDEO_MAX_BYTES } from './constants';
import type { UploadId } from './ids';
import {
  inboundAudioFormat,
  inboundMediaMaxBytes,
  inboundStorageKeys,
  isAllowedInboundType,
  outboundMediaRule,
  outboundStorageKeys,
  sniffContentType,
} from './media.logic';

const bytes = (...b: number[]): Uint8Array => Uint8Array.from(b);
const ascii = (s: string): number[] => Array.from(s, (c) => c.charCodeAt(0));
const pad = (b: number[], n = 16): Uint8Array => {
  const out = new Uint8Array(Math.max(n, b.length));
  out.set(b);
  return out;
};

describe('sniffContentType', () => {
  it('detects each supported signature', () => {
    expect(sniffContentType(pad([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffContentType(pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(
      'image/png',
    );
    expect(sniffContentType(pad(ascii('GIF89a')))).toBe('image/gif');
    expect(sniffContentType(pad([...ascii('RIFF'), 1, 2, 3, 4, ...ascii('WEBP')]))).toBe(
      'image/webp',
    );
    expect(sniffContentType(pad([0, 0, 0, 0x18, ...ascii('ftyp'), ...ascii('isom')]))).toBe(
      'video/mp4',
    );
    expect(sniffContentType(pad(ascii('%PDF-1.7')))).toBe('application/pdf');
  });

  it('rejects QuickTime and near misses', () => {
    expect(sniffContentType(pad([0, 0, 0, 0x14, ...ascii('ftyp'), ...ascii('qt  ')]))).toBeNull();
    expect(sniffContentType(pad([...ascii('RIFF'), 1, 2, 3, 4, ...ascii('WAVE')]))).toBeNull();
    expect(sniffContentType(pad([0xff, 0xd8, 0x00]))).toBeNull();
    expect(sniffContentType(pad(ascii('GIF7')))).toBeNull();
  });

  it('detects the audio containers: M4A and M4B brands, ID3 and MPEG frames, AAC ADTS', () => {
    expect(sniffContentType(pad([0, 0, 0, 0x1c, ...ascii('ftyp'), ...ascii('M4A ')]))).toBe(
      'audio/mp4',
    );
    expect(sniffContentType(pad([0, 0, 0, 0x1c, ...ascii('ftyp'), ...ascii('M4B ')]))).toBe(
      'audio/mp4',
    );
    expect(sniffContentType(pad(ascii('ID3')))).toBe('audio/mpeg');
    expect(sniffContentType(pad([0xff, 0xfb, 0x90]))).toBe('audio/mpeg');
    expect(sniffContentType(pad([0xff, 0xf3, 0x90]))).toBe('audio/mpeg');
    expect(sniffContentType(pad([0xff, 0xf1, 0x50]))).toBe('audio/aac');
    expect(sniffContentType(pad([0xff, 0xf9, 0x50]))).toBe('audio/aac');
    // Layer 00 with the MPEG-1 bit is neither; 0xff 0x00 is nothing.
    expect(sniffContentType(pad([0xff, 0xe0, 0]))).toBeNull();
    expect(sniffContentType(pad([0xff, 0x00, 0]))).toBeNull();
  });

  it('returns null for short or empty input', () => {
    expect(sniffContentType(bytes())).toBeNull();
    expect(sniffContentType(bytes(0xff, 0xd8))).toBeNull();
    expect(sniffContentType(Uint8Array.from([0, 0, 0, 0, ...ascii('ftyp')]))).toBeNull();
  });
});

describe('outbound and inbound media rules', () => {
  it('returns the outbound rule per kind', () => {
    expect(outboundMediaRule('image')).toEqual({
      contentTypes: ['image/jpeg', 'image/png'],
      maxBytes: IMAGE_MAX_BYTES,
    });
    expect(outboundMediaRule('video')).toEqual({
      contentTypes: ['video/mp4'],
      maxBytes: VIDEO_MAX_BYTES,
    });
  });

  it('returns the inbound size limit per type', () => {
    expect(inboundMediaMaxBytes('image')).toBe(IMAGE_MAX_BYTES);
    expect(inboundMediaMaxBytes('video')).toBe(VIDEO_MAX_BYTES);
    expect(inboundMediaMaxBytes('audio')).toBe(AUDIO_MAX_BYTES);
  });

  it('stores accepted audio with its extension and Content-Type, and refuses anything else', () => {
    expect(inboundAudioFormat('audio/mp4')).toEqual({ ext: 'm4a', contentType: 'audio/mp4' });
    expect(inboundAudioFormat('video/mp4')).toEqual({ ext: 'm4a', contentType: 'audio/mp4' });
    expect(inboundAudioFormat('audio/mpeg')).toEqual({ ext: 'mp3', contentType: 'audio/mpeg' });
    expect(inboundAudioFormat('audio/aac')).toEqual({ ext: 'aac', contentType: 'audio/aac' });
    for (const t of ['image/jpeg', 'application/pdf', null] as const) {
      expect(inboundAudioFormat(t)).toBeNull();
      expect(isAllowedInboundType('audio', t)).toBe(false);
    }
    expect(isAllowedInboundType('audio', 'audio/mp4')).toBe(true);
    expect(isAllowedInboundType('video', 'audio/mp4')).toBe(false);
  });

  it('accepts only matching sniffed types', () => {
    for (const t of ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const) {
      expect(isAllowedInboundType('image', t)).toBe(true);
      expect(isAllowedInboundType('video', t)).toBe(false);
    }
    expect(isAllowedInboundType('video', 'video/mp4')).toBe(true);
    expect(isAllowedInboundType('image', 'video/mp4')).toBe(false);
    expect(isAllowedInboundType('image', 'application/pdf')).toBe(false);
    expect(isAllowedInboundType('video', 'application/pdf')).toBe(false);
    expect(isAllowedInboundType('image', null)).toBe(false);
    expect(isAllowedInboundType('video', null)).toBe(false);
  });
});

describe('storage keys', () => {
  const id = 'abc_-123' as UploadId;

  it('builds outbound keys per content type', () => {
    expect(outboundStorageKeys(id, 'image/jpeg')).toEqual({
      original: 'outbound/abc_-123/original.jpg',
      preview: 'outbound/abc_-123/preview.jpg',
    });
    expect(outboundStorageKeys(id, 'image/png').original).toBe('outbound/abc_-123/original.png');
    expect(outboundStorageKeys(id, 'video/mp4').original).toBe('outbound/abc_-123/original.mp4');
  });

  it('throws for an unsupported outbound content type', () => {
    expect(() => outboundStorageKeys(id, 'image/gif')).toThrow();
    expect(() => outboundStorageKeys(id, 'toString')).toThrow();
  });

  it('builds inbound keys', () => {
    expect(inboundStorageKeys('tok', 'webp')).toEqual({
      original: 'inbound/tok/original.webp',
      preview: 'inbound/tok/preview.jpg',
    });
  });
});
