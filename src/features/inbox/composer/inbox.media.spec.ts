import { describe, expect, it, vi } from 'vitest';

import { CONVERT_MAX_EDGE, convertHeicWith, readHeadBytes, type HeicDeps } from './inbox.media';

describe('readHeadBytes', () => {
  it('reads at most n bytes from the start', async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3, 4, 5])]);
    expect([...(await readHeadBytes(blob, 3))]).toEqual([1, 2, 3]);
    expect([...(await readHeadBytes(blob, 64))]).toEqual([1, 2, 3, 4, 5]);
    expect((await readHeadBytes(new Blob([]), 64)).length).toBe(0);
  });
});

describe('convertHeicWith', () => {
  const heic = new Blob(['heic'], { type: 'image/heic' });
  const nativeJpeg = new Blob(['native'], { type: 'image/jpeg' });
  const libJpeg = new Blob(['lib'], { type: 'image/jpeg' });
  const resized = new Blob(['resized'], { type: 'image/jpeg' });

  function deps(opts: {
    nativeOk: boolean;
    libSize?: { width: number; height: number };
    heicTo?: () => Promise<Blob>;
    load?: () => Promise<never>;
  }) {
    const close = vi.fn();
    const heicTo = vi.fn(opts.heicTo ?? (() => Promise.resolve(libJpeg)));
    const d: HeicDeps = {
      decode: vi.fn(() =>
        Promise.resolve({ ...(opts.libSize ?? { width: 4032, height: 3024 }), close }),
      ),
      reencode: vi.fn((blob: Blob) => {
        if (blob === heic) {
          return opts.nativeOk ? Promise.resolve(nativeJpeg) : Promise.reject(new Error('decode'));
        }
        return Promise.resolve(resized);
      }),
      loadHeicTo: vi.fn(opts.load ?? (() => Promise.resolve({ heicTo }))),
    };
    return { d, heicTo, close };
  }

  it('uses the browser decoder when it can read HEIC and never loads heic-to', async () => {
    const { d } = deps({ nativeOk: true });
    await expect(convertHeicWith(heic, 0.9, d)).resolves.toBe(nativeJpeg);
    expect(d.reencode).toHaveBeenCalledWith(heic, CONVERT_MAX_EDGE, 0.9);
    expect(d.loadHeicTo).not.toHaveBeenCalled();
  });

  it('loads heic-to only after the browser fails, and asks it for JPEG', async () => {
    const { d, heicTo, close } = deps({ nativeOk: false });
    await expect(convertHeicWith(heic, 0.85, d)).resolves.toBe(libJpeg);
    expect(d.loadHeicTo).toHaveBeenCalledTimes(1);
    expect(heicTo).toHaveBeenCalledWith({ blob: heic, type: 'image/jpeg', quality: 0.85 });
    expect(close).toHaveBeenCalledTimes(1); // the size check releases its bitmap
    expect(d.reencode).toHaveBeenCalledTimes(1); // only the failed native attempt
  });

  it('scales the heic-to result down when its longest side is over 4096 px', async () => {
    const { d } = deps({ nativeOk: false, libSize: { width: 3000, height: 6000 } });
    await expect(convertHeicWith(heic, 0.9, d)).resolves.toBe(resized);
    expect(d.reencode).toHaveBeenLastCalledWith(libJpeg, CONVERT_MAX_EDGE, 0.9);
  });

  it('throws when heic-to cannot be loaded or cannot convert', async () => {
    const failedImport = deps({
      nativeOk: false,
      load: () => Promise.reject(new Error('ChunkLoadError')),
    });
    await expect(convertHeicWith(heic, 0.9, failedImport.d)).rejects.toThrow('ChunkLoadError');

    const failedConvert = deps({
      nativeOk: false,
      heicTo: () => Promise.reject(new Error('ERR_LIBHEIF')),
    });
    await expect(convertHeicWith(heic, 0.9, failedConvert.d)).rejects.toThrow('ERR_LIBHEIF');
  });
});
