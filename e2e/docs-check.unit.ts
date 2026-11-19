// Unit tests of scripts/docs-check.logic.ts (the rules of `pnpm docs:check`). The file is
// `.unit.ts` in e2e/ because the root vitest config collects only `src/**/*.spec.ts` and
// `e2e/**/*.unit.ts`. No test here reads the repository docs.
import { describe, expect, it } from 'vitest';
import {
  checkConstants,
  checkLinks,
  checkWorkflowBlock,
  compareConstant,
  extractLinks,
  headingSlugs,
  parseConstantRows,
  parseSourceConstants,
  slugify,
  type FileSystemView,
} from '../scripts/docs-check.logic';

describe('slugify (GitHub anchors)', () => {
  it.each([
    ['Hello World', 'hello-world'],
    ['6.7 vitest.config.ts', '67-vitestconfigts'],
    ['10. Toast', '10-toast'],
    ['รายการตรวจก่อนเปิด PR และก่อน deploy', 'รายการตรวจก่อนเปิด-pr-และก่อน-deploy'],
    ['M3. สถานะกลางทางค้างเมื่อ function ถูกตัด', 'm3-สถานะกลางทางค้างเมื่อ-function-ถูกตัด'],
    ['5.8 Loading ฝั่ง LINE ขณะพิมพ์', '58-loading-ฝั่ง-line-ขณะพิมพ์'],
    ['1. ทิศทางการพึ่งพา (lint)', '1-ทิศทางการพึ่งพา-lint'],
    ['snake_case and `code` -- dash', 'snake_case-and-code----dash'],
    ['Q&A: what/why?', 'qa-whatwhy'],
  ])('%s -> %s', (heading, slug) => {
    expect(slugify(heading)).toBe(slug);
  });

  it('keeps Thai vowel and tone marks (combining marks)', () => {
    const slug = slugify('ค่ะ ครับ น้ำ');
    expect(slug).toBe('ค่ะ-ครับ-น้ำ');
    expect(slug).toContain('่');
  });
});

describe('headingSlugs', () => {
  it('numbers repeated headings like GitHub and ignores headings in code blocks', () => {
    const md = ['# A', '## Same', '### Same', '```sh', '# not a heading', '```', '## Same'].join(
      '\n',
    );
    expect([...headingSlugs(md)]).toEqual(['a', 'same', 'same-1', 'same-2']);
  });

  it('uses the text of a link in a heading and drops tags and closing hashes', () => {
    expect([...headingSlugs('## [Docs](x.md) <b>now</b> ##')]).toEqual(['docs-now']);
  });
});

describe('extractLinks', () => {
  it('finds inline and reference links, skipping code spans and fenced blocks', () => {
    const md = [
      'See [a](a.md#x) and `[no](b.md)` and ![img](c.png "title").',
      '```',
      '[no](d.md)',
      '```',
      '[ref]: e.md',
      '[angle](<f g.md>)',
    ].join('\n');
    expect(extractLinks(md)).toEqual([
      { line: 1, target: 'a.md#x' },
      { line: 1, target: 'c.png' },
      { line: 5, target: 'e.md' },
      { line: 6, target: 'f g.md' },
    ]);
  });
});

describe('checkLinks', () => {
  const files: Record<string, string> = {
    'docs/a.md': '# Alpha\n\n## รายการตรวจ PR\n',
    'docs/sub/b.md': '# Beta\n',
    'src/code.ts': 'export {};\n',
  };
  const view: FileSystemView = {
    kind: (p) => (p in files ? 'file' : p === 'docs' || p === 'docs/sub' ? 'dir' : null),
    markdown: (p) => files[p] ?? null,
  };
  const problems = (file: string, md: string) =>
    checkLinks(file, md, view).map((p) => [p.line, p.message]);

  it('accepts files, directories, same-file anchors, Thai anchors and encoded paths', () => {
    const md = [
      '# Self',
      '[x](a.md) [y](sub/b.md#beta) [z](../src/code.ts) [d](sub/) [s](#self)',
      '[t](a.md#รายการตรวจ-pr) [e](a.md#%E0%B8%A3%E0%B8%B2%E0%B8%A2%E0%B8%81%E0%B8%B2%E0%B8%A3%E0%B8%95%E0%B8%A3%E0%B8%A7%E0%B8%88-pr)',
      '[w](https://example.com/x#y) [m](mailto:a@b.c)',
    ].join('\n');
    expect(problems('docs/self.md', md)).toEqual([]);
  });

  it('reports a missing file with its line', () => {
    expect(problems('docs/self.md', '# Self\n\n[x](missing.md)')).toEqual([
      [3, 'broken link: missing.md (no such file: docs/missing.md)'],
    ]);
  });

  it('reports a missing file reached through ..', () => {
    expect(problems('docs/sub/c.md', '[x](../../nope/x.ts)')).toHaveLength(1);
  });

  it('reports an anchor that matches no heading, in another file and in the same file', () => {
    const md = '# Self\n[x](a.md#nothing)\n[y](#gone)';
    expect(problems('docs/self.md', md)).toEqual([
      [2, 'broken anchor: #nothing is not a heading of docs/a.md'],
      [3, 'broken anchor: #gone is not a heading of docs/self.md'],
    ]);
  });

  it('does not check anchors of non-Markdown targets', () => {
    expect(problems('docs/self.md', '[x](../src/code.ts#L10)')).toEqual([]);
  });
});

describe('parseSourceConstants', () => {
  const source = [
    'const MB = 1024 * 1024;',
    'export const PDF_MAX_BYTES = 4 * MB;',
    'export const TTL_MS = 900_000;',
    "export const MODEL: AiModelId = 'claude-opus-5-5';",
    'export const RATE = { limit: 5, windowMs: 60_000 } as const;',
    'export const COLORS = [',
    "  '#C2185B',",
    "  '#6A1B9A',",
    '] as const;',
    'export const copy = { a: () => 1 };',
  ].join('\n');
  const parsed = parseSourceConstants('f.ts', source);
  const value = (name: string) => parsed.get(name)?.[0]?.value;

  it('evaluates numbers, arithmetic with earlier constants, strings, arrays and rate objects', () => {
    expect(value('PDF_MAX_BYTES')).toBe(4 * 1024 * 1024);
    expect(value('TTL_MS')).toBe(900_000);
    expect(value('MODEL')).toBe('claude-opus-5-5');
    expect(value('RATE')).toEqual({ limit: 5, windowMs: 60_000 });
    expect(value('COLORS')).toEqual(['#C2185B', '#6A1B9A']);
  });

  it('skips what it cannot evaluate and records the line', () => {
    expect(parsed.has('copy')).toBe(false);
    expect(parsed.get('TTL_MS')?.[0]?.line).toBe(3);
  });

  it('reads maxDuration of a route file under the name in its trailing comment', () => {
    const route = 'export const maxDuration = 120; // WEBHOOK_MAX_DURATION_S\n';
    expect(parseSourceConstants('r.ts', route).get('WEBHOOK_MAX_DURATION_S')?.[0]?.value).toBe(120);
  });
});

describe('compareConstant', () => {
  it('compares plain numbers and ignores a unit word it does not know', () => {
    expect(compareConstant('POLL_PAGE_LIMIT', '200', 200)).toBeNull();
    expect(compareConstant('AI_HISTORY_LIMIT', '20 ข้อความ', 20)).toBeNull();
    expect(compareConstant('POLL_PAGE_LIMIT', '201', 200)).toMatch(/doc says 201, code has 200/);
  });

  it('converts milliseconds, seconds and minutes by the name suffix', () => {
    expect(compareConstant('X_MS', '900000 ms (15 นาที)', 900_000)).toBeNull();
    expect(compareConstant('X_MS', '15 นาที', 900_000)).toBeNull();
    expect(compareConstant('X_MS', '50000 ms', 5000)).not.toBeNull();
    expect(compareConstant('LINE_LOADING_SECONDS', '20 วินาที (ต้องยืนยัน)', 20)).toBeNull();
    expect(compareConstant('WEBHOOK_MAX_DURATION_S', '120', 120)).toBeNull();
    expect(compareConstant('WEBHOOK_MAX_DURATION_S', '2 นาที', 120)).toBeNull();
    expect(compareConstant('WEBHOOK_MAX_DURATION_S', '110', 120)).not.toBeNull();
  });

  it('converts KB and MB to bytes and rejects a unit that does not fit the name', () => {
    expect(compareConstant('PDF_MAX_BYTES', '4 MB (4 × 1024 × 1024)', 4 * 1024 * 1024)).toBeNull();
    expect(compareConstant('JSON_MAX_BODY_BYTES', '64 KB', 64 * 1024)).toBeNull();
    expect(compareConstant('PDF_MAX_BYTES', '5 MB', 4 * 1024 * 1024)).not.toBeNull();
    expect(compareConstant('PDF_MAX_PAGES', '4 MB', 30)).toMatch(/unit MB does not fit/);
    expect(compareConstant('SEARCH_DEBOUNCE_MS', '5 MB', 300)).toMatch(/unit MB does not fit/);
  });

  it('compares strings quoted or backticked, and a leading value such as 72%', () => {
    expect(compareConstant('MODEL', '`claude-opus-5-5`', 'claude-opus-5-5')).toBeNull();
    expect(compareConstant('USD', '"10.00"', '10.00')).toBeNull();
    expect(compareConstant('USD', '"110.00"', '10.00')).not.toBeNull();
    expect(compareConstant('W', '72% ของพื้นที่ข้อความ (จอแคบ 85%)', '72%')).toBeNull();
    expect(compareConstant('PARTICLE', '"ค่ะ"', 'ค่ะ')).toBeNull();
  });

  it('compares colour lists in order, ignoring case', () => {
    expect(compareConstant('C', '`#C2185B`, `#6a1b9a`', ['#c2185b', '#6A1B9A'])).toBeNull();
    expect(compareConstant('C', '`#6A1B9A`, `#C2185B`', ['#C2185B', '#6A1B9A'])).not.toBeNull();
  });

  it('compares rate limits written as "<n> ครั้งต่อ <n> วินาที"', () => {
    const rule = { limit: 5, windowMs: 60_000 };
    expect(compareConstant('R', '5 ครั้งต่อ 60 วินาที', rule)).toBeNull();
    expect(compareConstant('R', '5 ครั้งต่อ 3600 วินาที', rule)).not.toBeNull();
    expect(compareConstant('R', '6 ครั้งต่อ 60 วินาที', rule)).not.toBeNull();
  });
});

describe('parseConstantRows and checkConstants', () => {
  const doc = [
    '## 9. Other',
    '| `NOT_IN_SECTION` | 1 |',
    '## 10. ค่าคงที่ของระบบ',
    '### 10.1 Core',
    '| ชื่อ | ค่า | อยู่ที่ |',
    '| --- | --- | --- |',
    '| `POLL_PAGE_LIMIT` | 200 | `constants.ts` |',
    '| `GONE_CONSTANT` | 7 | `constants.ts` |',
    '### 10.3 Env',
    '| ชื่อ | ค่าเริ่มต้น | อยู่ที่ |',
    '| --- | --- | --- |',
    '| `POLL_INTERVAL_MS` | 2000 ms | `env.ts` |',
    '## 11. Next',
    '| `ALSO_NOT` | 1 |',
  ].join('\n');

  it('reads only the tables of section 10, using each table header for the value column', () => {
    expect(parseConstantRows(doc)).toEqual([
      { name: 'POLL_PAGE_LIMIT', cell: '200', line: 7 },
      { name: 'GONE_CONSTANT', cell: '7', line: 8 },
      { name: 'POLL_INTERVAL_MS', cell: '2000 ms', line: 12 },
    ]);
  });

  it('reports a missing constant and a mismatch with the doc line and the code location', () => {
    const constants = new Map([
      ['POLL_PAGE_LIMIT', [{ value: 250, file: 'src/c.ts', line: 9 }]],
      ['DEFAULT_POLL_INTERVAL_MS', [{ value: 2000, file: 'src/env.ts', line: 3 }]],
    ]);
    expect(checkConstants('docs/p.md', doc, constants)).toEqual([
      {
        file: 'docs/p.md',
        line: 7,
        message: 'POLL_PAGE_LIMIT: doc says 200, code has 250 (src/c.ts:9)',
      },
      {
        file: 'docs/p.md',
        line: 8,
        message: 'GONE_CONSTANT: no constant of this name in the code',
      },
    ]);
  });

  it('reports every code definition that disagrees with the doc', () => {
    const constants = new Map([
      [
        'POLL_PAGE_LIMIT',
        [
          { value: 200, file: 'a.ts', line: 1 },
          { value: 300, file: 'b.ts', line: 2 },
        ],
      ],
    ]);
    const found = checkConstants(
      'd.md',
      '## 10. X\n| ชื่อ | ค่า |\n| - | - |\n| `POLL_PAGE_LIMIT` | 200 |',
      constants,
    );
    expect(found.map((p) => p.message)).toEqual([
      'POLL_PAGE_LIMIT: doc says 200, code has 300 (b.ts:2)',
    ]);
  });
});

describe('checkWorkflowBlock', () => {
  const doc = (yaml: string) => `## 8. CI\n\ntext\n\n\`\`\`yaml\n${yaml}\n\`\`\`\n\n## 9. Next\n`;

  it('accepts a block identical to the workflow file', () => {
    expect(checkWorkflowBlock('d.md', doc('a: 1\nb: 2'), 'a: 1\nb: 2\n')).toEqual([]);
  });

  it('reports the first differing line, in doc coordinates', () => {
    const [problem] = checkWorkflowBlock('d.md', doc('a: 1\nb: 2'), 'a: 1\nb: 3\n');
    expect(problem?.line).toBe(7);
    expect(problem?.message).toContain('"b: 2"');
  });

  it('reports a block that is shorter or longer than the file', () => {
    expect(checkWorkflowBlock('d.md', doc('a: 1'), 'a: 1\nb: 2\n')).toHaveLength(1);
    expect(checkWorkflowBlock('d.md', doc('a: 1\nb: 2'), 'a: 1\n')).toHaveLength(1);
  });

  it('reports a doc with no block', () => {
    expect(checkWorkflowBlock('d.md', '## 8. CI\nnothing', 'a: 1')).toHaveLength(1);
  });
});
