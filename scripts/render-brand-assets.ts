// Renders the checked-in brand sources (public/brand/*.svg, *.html) to the PNG and ICO files
// the app and LINE use (docs/architecture/frontend.md "Brand assets"). Uses the Chromium of
// Playwright, already a dev dependency; nothing is downloaded. Run after editing a source:
//   pnpm exec tsx scripts/render-brand-assets.ts
// Output is deterministic for one Chromium version; commit the files it writes.
import { readFile, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium, type Page } from '@playwright/test';
import { encodeIco, richMenuModule } from './render-brand-assets.logic';

const root = (p: string): string => fileURLToPath(new URL(`../${p}`, import.meta.url));

/** One image: a source file drawn at `size` (square) or `width`×`height`, written to `out`. */
interface Job {
  source: string;
  out: string;
  width: number;
  height: number;
  /** Keep the transparent corners of the rounded tile (favicon, apple icon keeps none). */
  transparent: boolean;
}

const square = (source: string, out: string, size: number, transparent: boolean): Job => ({
  source,
  out,
  width: size,
  height: size,
  transparent,
});

const PNG_JOBS: Job[] = [
  // apple-touch-icon: iOS draws its own rounded mask and shows black behind transparency.
  square('public/brand/line-profile.svg', 'app/apple-icon.png', 180, false),
  square('public/brand/line-profile.svg', 'public/brand/line-profile-640.png', 640, false),
  square('public/brand/line-profile.svg', 'public/brand/line-profile-1024.png', 1024, false),
  square('public/brand/app-icon.svg', 'public/brand/app-icon-512.png', 512, true),
];
const ICO_SIZES = [16, 32, 48];
const RICH_MENU_SIZE = { width: 2500, height: 843 };
const RICH_MENU_PNG = 'public/brand/richmenu-3x1.png';
const RICH_MENU_MODULE = 'src/adapters/line/rich-menu-image.generated.ts';

async function render(page: Page, job: Job): Promise<Buffer> {
  const svg = await readFile(root(job.source), 'utf8');
  await page.setViewportSize({ width: job.width, height: job.height });
  const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  await page.setContent(
    `<!doctype html><html><body style="margin:0;background:transparent">` +
      `<img src="${src}" width="${String(job.width)}" height="${String(job.height)}" ` +
      `style="display:block"></body></html>`,
  );
  await page.locator('img').evaluate((img: HTMLImageElement) => img.decode());
  return page.screenshot({
    omitBackground: job.transparent,
    clip: { x: 0, y: 0, width: job.width, height: job.height },
  });
}

async function main(): Promise<void> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    for (const job of PNG_JOBS) {
      await writeFile(root(job.out), await render(page, job));
      console.log(`wrote ${job.out}`);
    }
    const frames = [];
    for (const size of ICO_SIZES) {
      const png = await render(page, square('public/brand/app-icon.svg', '', size, true));
      frames.push({ size, png });
    }
    await writeFile(root('app/favicon.ico'), encodeIco(frames));
    console.log('wrote app/favicon.ico');
    // app/icon.svg is the Next.js file convention; its one source is public/brand/app-icon.svg.
    await writeFile(root('app/icon.svg'), await readFile(root('public/brand/app-icon.svg')));
    console.log('wrote app/icon.svg');

    // Rich menu picture: the HTML source opened from disk so its fonts load from the repo.
    await page.setViewportSize({ width: RICH_MENU_SIZE.width, height: RICH_MENU_SIZE.height });
    await page.goto(pathToFileURL(root('scripts/brand/richmenu-3x1.html')).href);
    await page.evaluate(() => document.fonts.ready);
    const menuPng = await page.screenshot({
      clip: { x: 0, y: 0, ...RICH_MENU_SIZE },
    });
    await writeFile(root(RICH_MENU_PNG), menuPng);
    console.log(`wrote ${RICH_MENU_PNG} (${String((await stat(root(RICH_MENU_PNG))).size)} bytes)`);
    // The LINE adapter uploads this copy; public/ is not part of a serverless function.
    await writeFile(root(RICH_MENU_MODULE), richMenuModule(menuPng));
    console.log(`wrote ${RICH_MENU_MODULE}`);
  } finally {
    await browser.close();
  }
}

await main();
