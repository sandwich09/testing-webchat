#!/usr/bin/env bash
# Generates the small media and PDF fixtures of docs/qa/stubs-and-fixtures.md section 8 and copies
# the files the stub serves into stubs/assets. Run once by hand; CI uses the committed files.
#
# Needs: ffmpeg (with libx264 and libx265), ImageMagick 6 (`convert`) or 7 (`magick`), node, and the
# Chromium of the installed Playwright (never downloaded here). No network access.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MEDIA="$ROOT/e2e/fixtures/media"
KB="$ROOT/e2e/fixtures/kb"
ASSETS="$ROOT/stubs/assets"
mkdir -p "$MEDIA" "$KB" "$ASSETS"
cd "$ROOT"

if command -v magick >/dev/null 2>&1; then IM=(magick); else IM=(convert); fi

# --- Images: solid colour, 64x64, no metadata, as small as the codec allows -----------------------
"${IM[@]}" -size 64x64 'xc:#F0055A' -strip -quality 60 "$MEDIA/tiny.jpg"
"${IM[@]}" -size 64x64 'xc:#191327' -strip -define png:exclude-chunk=all -define png:compression-level=9 "$MEDIA/tiny.png"
"${IM[@]}" -size 64x64 'xc:#F0055A' -strip -define webp:method=6 -quality 50 "$MEDIA/tiny.webp"

# --- HEIC: one HEVC intra frame (ffmpeg + libx265) wrapped in a HEIF container by hand ------------
# ImageMagick here can read HEIC but not write it, and there is no heif-enc, so the container
# (ftyp, meta with hdlr/pitm/iloc/iinf/iprp, mdat) is built from the box structure in ISO 14496-12
# and 23008-12.
HEVC_TMP="$(mktemp -d)"
trap 'rm -rf "$HEVC_TMP"' EXIT
ffmpeg -v error -y -f lavfi -i 'color=c=0xF0055A:s=64x64:d=1' -frames:v 1 -pix_fmt yuv420p \
  -c:v libx265 -x265-params 'log-level=error:keyint=1:repeat-headers=1:frame-threads=1:pools=1:no-info=1' \
  -f hevc "$HEVC_TMP/frame.hevc"
node --input-type=module - "$HEVC_TMP/frame.hevc" "$MEDIA/tiny.heic" <<'EOF'
import { readFileSync, writeFileSync } from 'node:fs';

const [, , input, output] = process.argv;
const stream = readFileSync(input);

// Split an Annex B stream into NAL units.
const nals = [];
let start = -1;
for (let i = 0; i + 2 < stream.length; i += 1) {
  if (stream[i] === 0 && stream[i + 1] === 0 && stream[i + 2] === 1) {
    if (start >= 0) nals.push(stream.subarray(start, i));
    start = i + 3;
    i += 2;
  }
}
nals.push(stream.subarray(start));
const trimmed = nals.map((n) => {
  let end = n.length;
  while (end > 0 && n[end - 1] === 0) end -= 1;
  return n.subarray(0, end);
});
const typeOf = (n) => (n[0] >> 1) & 0x3f;
const vps = trimmed.find((n) => typeOf(n) === 32);
const sps = trimmed.find((n) => typeOf(n) === 33);
const pps = trimmed.find((n) => typeOf(n) === 34);
const slices = trimmed.filter((n) => typeOf(n) < 32);
if (!vps || !sps || !pps || slices.length !== 1) throw new Error('unexpected HEVC stream layout');

const box = (type, ...parts) => {
  const payload = Buffer.concat(parts);
  const head = Buffer.alloc(8);
  head.writeUInt32BE(payload.length + 8, 0);
  head.write(type, 4, 'latin1');
  return Buffer.concat([head, payload]);
};
const full = (type, version, flags, ...parts) =>
  box(type, Buffer.from([version, (flags >> 16) & 255, (flags >> 8) & 255, flags & 255]), ...parts);
const u16 = (v) => Buffer.from([(v >> 8) & 255, v & 255]);
const u32 = (v) => {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(v);
  return b;
};

// profile_tier_level of the SPS: after the 2-byte NAL header and one parameter byte, in the RBSP
// (emulation-prevention bytes 00 00 03 removed first).
const rbsp = [];
for (let i = 2, zeros = 0; i < sps.length; i += 1) {
  if (zeros >= 2 && sps[i] === 3) {
    zeros = 0;
    continue;
  }
  zeros = sps[i] === 0 ? zeros + 1 : 0;
  rbsp.push(sps[i]);
}
const ptl = Buffer.from(rbsp.slice(1, 13));
const hvcC = box(
  'hvcC',
  Buffer.from([1]),
  ptl.subarray(0, 1), // profile_space, tier, profile_idc
  ptl.subarray(1, 5), // compatibility flags
  ptl.subarray(5, 11), // constraint flags
  ptl.subarray(11, 12), // level_idc
  Buffer.from([0xf0, 0x00, 0xfc, 0xfd, 0xf8, 0xf8, 0x00, 0x00, 0x0f, 0x03]),
  ...[vps, sps, pps].map((n) => Buffer.concat([Buffer.from([0x80 | typeOf(n), 0, 1]), u16(n.length), n])),
);
const ispe = full('ispe', 0, 0, u32(64), u32(64));

const sample = Buffer.concat(slices.map((s) => Buffer.concat([u32(s.length), s])));
const ftyp = box('ftyp', Buffer.from('heic'), u32(0), Buffer.from('mif1heic'));
const hdlr = full('hdlr', 0, 0, u32(0), Buffer.from('pict'), Buffer.alloc(12), Buffer.from([0]));
const pitm = full('pitm', 0, 0, u16(1));
const iinf = full('iinf', 0, 0, u16(1), full('infe', 2, 0, u16(1), u16(0), Buffer.from('hvc1'), Buffer.from([0])));
const iprp = box('iprp', box('ipco', hvcC, ispe), full('ipma', 0, 0, u32(1), u16(1), Buffer.from([2, 0x81, 0x02])));
const ilocFor = (offset) =>
  full('iloc', 0, 0, Buffer.from([0x44, 0x00]), u16(1), u16(1), u16(0), u16(1), u32(offset), u32(sample.length));
const metaFor = (offset) => full('meta', 0, 0, hdlr, pitm, ilocFor(offset), iinf, iprp);
const offset = ftyp.length + metaFor(0).length + 8; // payload of mdat starts after its 8-byte header
writeFileSync(output, Buffer.concat([ftyp, metaFor(offset), box('mdat', sample)]));
EOF

# --- Video: 1 second, 160x120, H.264, no audio; MOV is the same stream in a QuickTime container ---
VIDEO_ARGS=(-v error -y -f lavfi -i 'testsrc=size=160x120:rate=10' -t 1 -an -map_metadata -1
  -fflags +bitexact -flags:v +bitexact -c:v libx264 -preset veryslow -crf 36 -pix_fmt yuv420p
  -x264-params 'threads=1:sliced-threads=0')
ffmpeg "${VIDEO_ARGS[@]}" -movflags +faststart -f mp4 "$MEDIA/tiny.mp4"
ffmpeg "${VIDEO_ARGS[@]}" -f mov "$MEDIA/tiny.mov"

# --- Text files that only pretend to be an image or a PDF ---------------------------------------
echo 'not an image' > "$MEDIA/fake.jpg"
echo 'not a pdf' > "$KB/not-a-pdf.pdf"

# --- PDFs: Playwright page.pdf() with fixed creation and modification dates ----------------------
node --input-type=module - "$KB" "$ROOT/docs/specs/ai-prompt.md" "$ROOT/src/common/fonts/line-seed-sans-th" <<'EOF'
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const [, , kbDir, promptDoc, fontDir] = process.argv;

// tonhom-cafe.pdf: the text block of ai-prompt.md section 8.2 (read from the doc, not copied).
const doc = readFileSync(promptDoc, 'utf8');
const section = doc.slice(doc.indexOf('### 8.2'));
const block = /```text\n([\s\S]*?)\n```/.exec(section);
if (!block) throw new Error('section 8.2 text block not found');
const escapeHtml = (s) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const fontUrl = (name) => `file://${fontDir}/${name}`;
const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><style>
@font-face { font-family: "LINE Seed Sans TH"; font-weight: 400; src: url("${fontUrl('LINESeedSansTH_W_Rg.woff2')}") format("woff2"); }
@font-face { font-family: "LINE Seed Sans TH"; font-weight: 700; src: url("${fontUrl('LINESeedSansTH_W_Bd.woff2')}") format("woff2"); }
@page { margin: 18mm; }
body { font-family: "LINE Seed Sans TH", sans-serif; font-size: 12pt; line-height: 1.5; margin: 0; }
pre { font: inherit; white-space: pre-wrap; margin: 0; }
</style></head><body><pre>${escapeHtml(block[1])}</pre></body></html>`;

// Chromium writes the current time into /CreationDate and /ModDate. Overwriting them with
// same-length constants keeps every xref offset valid and makes the output reproducible.
function normalise(buffer) {
  let text = buffer.toString('latin1');
  text = text.replace(/\/(CreationDate|ModDate) \(D:[^)]*\)/g, (_m, key) => `/${key} (D:20000101000000+00'00')`);
  return Buffer.from(text, 'latin1');
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  writeFileSync(`${kbDir}/tonhom-cafe.pdf`, normalise(await page.pdf({ format: 'A4' })));
} finally {
  await browser.close();
}

// tiny.pdf: one page with the single line "Tonhom Cafe test file". Written by hand (a standard
// Helvetica page, ~0.5 KB) because a browser-printed PDF is about 15 times larger for the same text.
const objects = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
];
const stream = 'BT /F1 14 Tf 10 50 Td (Tonhom Cafe test file) Tj ET';
objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
let pdf = '%PDF-1.4\n';
const offsets = [];
objects.forEach((body, i) => {
  offsets.push(pdf.length);
  pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
});
const xref = pdf.length;
pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
for (const o of offsets) pdf += `${String(o).padStart(10, '0')} 00000 n \n`;
pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
writeFileSync(`${kbDir}/tiny.pdf`, pdf, 'latin1');
EOF

# --- Files the stub serves, committed under stubs/assets ------------------------------------------
cp "$MEDIA/tiny.jpg" "$ASSETS/tiny.jpg"
cp "$MEDIA/tiny.mp4" "$ASSETS/tiny.mp4"
cp "$MEDIA/tiny.png" "$ASSETS/avatar.png"
cp "$MEDIA/tiny.png" "$ASSETS/oa.png"

echo "Fixtures written to $MEDIA, $KB and $ASSETS"

# --- Audio: 3 s of a 440 Hz tone, AAC in an M4A (ftyp brand "M4A "), like a LINE voice message ----
ffmpeg -v error -y -f lavfi -i 'sine=frequency=440:duration=3' -ac 1 -ar 16000 -c:a aac -b:a 24k \
  -map_metadata -1 -fflags +bitexact -movflags +faststart -f ipod "$MEDIA/tiny.m4a"
cp "$MEDIA/tiny.m4a" "$ASSETS/tiny.m4a"
