import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { encodeIco, pngSize } from '../scripts/render-brand-assets.logic';

const file = (p: string): string => fileURLToPath(new URL(`../${p}`, import.meta.url));

describe('encodeIco', () => {
  it('writes the header, one 16-byte entry per frame and the PNG data at the stated offsets', () => {
    const a = Buffer.from('aaaa');
    const b = Buffer.from('bbbbbb');
    const ico = encodeIco([
      { size: 16, png: a },
      { size: 256, png: b },
    ]);
    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.readUInt16LE(4)).toBe(2);
    expect(ico.readUInt8(6)).toBe(16);
    expect(ico.readUInt8(22)).toBe(0); // 256 is written as 0
    expect(ico.readUInt32LE(6 + 12)).toBe(38);
    expect(ico.subarray(38, 42).toString()).toBe('aaaa');
    expect(ico.subarray(42).toString()).toBe('bbbbbb');
    expect(() => encodeIco([{ size: 300, png: a }])).toThrow();
  });
});

describe('checked-in brand files', () => {
  it.each([
    ['app/apple-icon.png', 180],
    ['public/brand/line-profile-640.png', 640],
    ['public/brand/line-profile-1024.png', 1024],
    ['public/brand/app-icon-512.png', 512],
  ])('%s is a %i px square PNG', (path, size) => {
    expect(pngSize(readFileSync(file(path)))).toEqual({ width: size, height: size });
  });

  it('the LINE profile pictures are within the 3 MB limit of LINE profile images', () => {
    for (const p of ['public/brand/line-profile-640.png', 'public/brand/line-profile-1024.png']) {
      expect(statSync(file(p)).size).toBeLessThan(3 * 1024 * 1024);
    }
  });

  it('app/icon.svg is the copy of public/brand/app-icon.svg the script writes', () => {
    expect(readFileSync(file('app/icon.svg'), 'utf8')).toBe(
      readFileSync(file('public/brand/app-icon.svg'), 'utf8'),
    );
  });

  it('the favicon holds 16, 32 and 48 px frames', () => {
    const ico = readFileSync(file('app/favicon.ico'));
    expect(ico.readUInt16LE(4)).toBe(3);
    expect([0, 1, 2].map((i) => ico.readUInt8(6 + 16 * i))).toEqual([16, 32, 48]);
  });
});
