import localFont from 'next/font/local';

/**
 * LINE Seed Sans TH 1.003 (docs/adr/0018-use-line-seed-sans-th.md). Only weights 100, 400 and 700
 * exist: Thin is for decorative text of 16px or larger, never for text that must be read.
 * `variable` is the single CSS variable `--font-sans` that Tailwind's `font-sans` reads.
 */
export const lineSeedSansTh = localFont({
  src: [
    { path: './line-seed-sans-th/LINESeedSansTH_W_Th.woff2', weight: '100', style: 'normal' },
    { path: './line-seed-sans-th/LINESeedSansTH_W_Rg.woff2', weight: '400', style: 'normal' },
    { path: './line-seed-sans-th/LINESeedSansTH_W_Bd.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-sans',
  display: 'swap',
  fallback: [
    'Sukhumvit Set',
    'Thonburi',
    'Leelawadee UI',
    'Noto Sans Thai',
    'Tahoma',
    'sans-serif',
  ],
});
