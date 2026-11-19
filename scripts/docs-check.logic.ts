// Pure rules of the docs check (docs/guidelines/pitfalls-and-prevention.md P1):
//   1. every relative Markdown link and #anchor resolves,
//   2. the constant values in docs/architecture/project-setup.md section 10 equal the code,
//   3. the workflow block in project-setup section 8 equals .github/workflows/ci.yml.
// No I/O: scripts/docs-check.ts reads the files. Unit tests: e2e/docs-check.unit.ts.
import { posix } from 'node:path';

export type Problem = { file: string; line: number; message: string };

// ---------------------------------------------------------------------------
// Markdown structure
// ---------------------------------------------------------------------------

/** Lines of `markdown` that are outside fenced code blocks, with their 1-based numbers. */
export function proseLines(markdown: string): { line: number; text: string }[] {
  const lines: { line: number; text: string }[] = [];
  let fence: string | null = null;
  markdown.split('\n').forEach((text, index) => {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(text)?.[1];
    if (marker !== undefined) {
      if (fence === null) fence = marker.charAt(0);
      else if (marker.charAt(0) === fence) fence = null;
      return;
    }
    if (fence === null) lines.push({ line: index + 1, text });
  });
  return lines;
}

/**
 * GitHub heading anchor: lower case, then every character that is not a letter, mark, number,
 * connector punctuation, space or hyphen is dropped, then each space becomes a hyphen. Thai
 * vowel and tone marks are category M, so they stay.
 */
export function slugify(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '')
    .replace(/ /g, '-');
}

/** Visible text of a heading line: links keep their text, tags and emphasis markers go. */
function headingText(raw: string): string {
  return raw
    .replace(/\s+#+\s*$/, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .trim();
}

/** Anchors of every ATX heading; a repeated heading gets `-1`, `-2` ... like GitHub. */
export function headingSlugs(markdown: string): Set<string> {
  const slugs = new Set<string>();
  const seen = new Map<string, number>();
  for (const { text } of proseLines(markdown)) {
    const match = /^ {0,3}#{1,6}\s+(.*)$/.exec(text);
    if (match === null) continue;
    const base = slugify(headingText(match[1] ?? ''));
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    slugs.add(count === 0 ? base : `${base}-${String(count)}`);
  }
  return slugs;
}

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

export type Link = { line: number; target: string };

const blankCode = (text: string): string => text.replace(/`[^`]*`/g, (m) => ' '.repeat(m.length));

/** Inline and reference-definition link targets outside code. */
export function extractLinks(markdown: string): Link[] {
  const links: Link[] = [];
  const inline = /!?\[(?:[^\]\\]|\\.)*\]\(\s*(<[^>]*>|[^)\s]*)(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g;
  for (const { line, text } of proseLines(markdown)) {
    const clean = blankCode(text);
    for (const match of clean.matchAll(inline)) {
      const raw = match[1] ?? '';
      links.push({ line, target: raw.startsWith('<') ? raw.slice(1, -1) : raw });
    }
    const definition = /^ {0,3}\[[^\]]+\]:\s*(\S+)/.exec(clean);
    if (definition?.[1] !== undefined) links.push({ line, target: definition[1] });
  }
  return links;
}

export type FileSystemView = {
  /** 'file', 'dir' or null for a repo-relative path. */
  kind(path: string): 'file' | 'dir' | null;
  /** Text of a Markdown file, or null. */
  markdown(path: string): string | null;
};

const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

function decode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/** Problems of one Markdown file: missing targets and anchors that match no heading. */
export function checkLinks(file: string, markdown: string, view: FileSystemView): Problem[] {
  const problems: Problem[] = [];
  const slugCache = new Map<string, Set<string>>();
  const slugsOf = (path: string, text: string): Set<string> => {
    let slugs = slugCache.get(path);
    if (slugs === undefined) {
      slugs = headingSlugs(text);
      slugCache.set(path, slugs);
    }
    return slugs;
  };
  for (const { line, target } of extractLinks(markdown)) {
    if (target === '' || EXTERNAL.test(target)) continue;
    const hash = target.indexOf('#');
    const pathPart = decode(hash === -1 ? target : target.slice(0, hash));
    const anchor = hash === -1 ? '' : decode(target.slice(hash + 1));
    const resolved =
      pathPart === ''
        ? file
        : posix
            .normalize(
              pathPart.startsWith('/')
                ? pathPart.slice(1)
                : posix.join(posix.dirname(file), pathPart),
            )
            .replace(/(?<=.)\/$/, '');
    const kind = pathPart === '' ? 'file' : view.kind(resolved);
    if (kind === null) {
      problems.push({ file, line, message: `broken link: ${target} (no such file: ${resolved})` });
      continue;
    }
    if (anchor === '' || kind === 'dir' || !resolved.endsWith('.md')) continue;
    const text = resolved === file ? markdown : view.markdown(resolved);
    if (text === null || !slugsOf(resolved, text).has(anchor)) {
      problems.push({
        file,
        line,
        message: `broken anchor: #${anchor} is not a heading of ${resolved}`,
      });
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export type CodeValue = number | string | readonly string[] | { limit: number; windowMs: number };
export type CodeConstant = { value: CodeValue; file: string; line: number };

/** Tiny arithmetic evaluator: numbers, + - * / ( ) and unary minus. Null on anything else. */
function evaluateArithmetic(expression: string): number | null {
  const tokens = expression.match(/\d+(?:\.\d+)?|[()+\-*/]|\S/g) ?? [];
  let position = 0;
  const state = { failed: false };
  const peek = (): string | undefined => tokens[position];
  function factor(): number {
    const token = tokens[position];
    position += 1;
    if (token === '-') return -factor();
    if (token === '(') {
      const inner = sum();
      if (peek() !== ')') state.failed = true;
      position += 1;
      return inner;
    }
    if (token !== undefined && /^\d/.test(token)) return Number(token);
    state.failed = true;
    return 0;
  }
  function product(): number {
    let value = factor();
    while (peek() === '*' || peek() === '/') {
      const op = tokens[position];
      position += 1;
      value = op === '*' ? value * factor() : value / factor();
    }
    return value;
  }
  function sum(): number {
    let value = product();
    while (peek() === '+' || peek() === '-') {
      const op = tokens[position];
      position += 1;
      value = op === '+' ? value + product() : value - product();
    }
    return value;
  }
  const result = sum();
  return state.failed || position !== tokens.length ? null : result;
}

function evaluateNumber(expression: string, env: ReadonlyMap<string, number>): number | null {
  const withValues = expression
    .replace(/(?<=\d)_(?=\d)/g, '')
    .replace(/[A-Za-z_]\w*/g, (name) => (env.has(name) ? String(env.get(name)) : name));
  return evaluateArithmetic(withValues);
}

function stringLiteral(expression: string): string | null {
  const match = /^(['"])((?:(?!\1)[^\\]|\\.)*)\1$/.exec(expression);
  return match === null ? null : (match[2] ?? '').replace(/\\(.)/g, '$1');
}

function evaluate(raw: string, env: ReadonlyMap<string, number>): CodeValue | null {
  const expression = raw
    .trim()
    .replace(/\s+as\s+const$/, '')
    .replace(/\s+satisfies\s[\s\S]+$/, '')
    .trim();
  const text = stringLiteral(expression);
  if (text !== null) return text;
  if (expression.startsWith('[') && expression.endsWith(']')) {
    const items = expression
      .slice(1, -1)
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item !== '')
      .map(stringLiteral);
    return items.every((item) => item !== null) ? items : null;
  }
  if (expression.startsWith('{') && expression.endsWith('}')) {
    const fields = new Map<string, number>();
    for (const part of expression.slice(1, -1).split(',')) {
      const pair = /^\s*(\w+)\s*:\s*([\s\S]+?)\s*$/.exec(part);
      const value = pair === null ? null : evaluateNumber(pair[2] ?? '', env);
      if (pair !== null && value !== null) fields.set(pair[1] ?? '', value);
    }
    const limit = fields.get('limit');
    const windowMs = fields.get('windowMs');
    return limit !== undefined && windowMs !== undefined ? { limit, windowMs } : null;
  }
  return evaluateNumber(expression, env);
}

/**
 * Top-level `const NAME = <literal or arithmetic>;` declarations (exported or not) that this
 * check can evaluate, plus `export const maxDuration = N; // NAME` of route files. Values that
 * are not literals (objects with functions, templates) are skipped.
 */
export function parseSourceConstants(file: string, source: string): Map<string, CodeConstant[]> {
  const found = new Map<string, CodeConstant[]>();
  const env = new Map<string, number>();
  const add = (name: string, constant: CodeConstant): void => {
    found.set(name, [...(found.get(name) ?? []), constant]);
  };
  const declaration = /^(?:export\s+)?const\s+(\w+)(?:\s*:\s*[^=\n]+?)?\s*=\s*([\s\S]*?);[ \t]*$/gm;
  for (const match of source.matchAll(declaration)) {
    const name = match[1] ?? '';
    const value = evaluate(match[2] ?? '', env);
    if (value === null) continue;
    if (typeof value === 'number') env.set(name, value);
    add(name, { value, file, line: lineAt(source, match.index) });
  }
  for (const match of source.matchAll(
    /^export const maxDuration = (\d+);[ \t]*\/\/[ \t]*([A-Z][A-Z0-9_]*)/gm,
  )) {
    add(match[2] ?? '', { value: Number(match[1]), file, line: lineAt(source, match.index) });
  }
  return found;
}

const lineAt = (text: string, index: number): number => text.slice(0, index).split('\n').length;

export type ConstantRow = { name: string; cell: string; line: number };

/** Rows of the tables under the heading `## 10.` of project-setup, up to the next `## `. */
export function parseConstantRows(markdown: string): ConstantRow[] {
  const rows: ConstantRow[] = [];
  let inSection = false;
  let valueColumn = -1;
  for (const { line, text } of proseLines(markdown)) {
    if (/^## /.test(text)) {
      inSection = /^## 10\. /.test(text);
      valueColumn = -1;
      continue;
    }
    if (!inSection || !text.startsWith('|')) {
      if (!text.startsWith('|')) valueColumn = -1;
      continue;
    }
    const cells = text
      .replace(/^\||\|\s*$/g, '')
      .split(/(?<!\\)\|/)
      .map((cell) => cell.trim());
    if (/^:?-+:?$/.test(cells[0] ?? '')) continue;
    const header = cells.findIndex((cell) => cell === 'ค่า' || cell === 'ค่าเริ่มต้น');
    if (header !== -1) {
      valueColumn = header;
      continue;
    }
    const name = /^`([A-Z][A-Z0-9_]*)`$/.exec(cells[0] ?? '')?.[1];
    const cell = cells[valueColumn];
    if (name !== undefined && cell !== undefined) rows.push({ name, cell, line });
  }
  return rows;
}

const UNIT_FACTORS: Record<string, { dimension: 'time' | 'size'; factor: number }> = {
  ms: { dimension: 'time', factor: 1 },
  วินาที: { dimension: 'time', factor: 1000 },
  นาที: { dimension: 'time', factor: 60_000 },
  KB: { dimension: 'size', factor: 1024 },
  MB: { dimension: 'size', factor: 1024 * 1024 },
};

/** Dimension and unit of the number a constant holds, from its name suffix. */
function codeUnit(name: string): { dimension: 'time' | 'size' | null; factor: number } {
  if (name.endsWith('_MS')) return { dimension: 'time', factor: 1 };
  if (name.endsWith('_SECONDS') || name.endsWith('_S')) return { dimension: 'time', factor: 1000 };
  if (name.endsWith('_BYTES')) return { dimension: 'size', factor: 1 };
  return { dimension: null, factor: 1 };
}

const isRate = (value: CodeValue): value is { limit: number; windowMs: number } =>
  typeof value === 'object' && 'limit' in value;

const show = (value: CodeValue): string =>
  typeof value === 'object' && !Array.isArray(value)
    ? JSON.stringify(value)
    : Array.isArray(value)
      ? (value as readonly string[]).join(', ')
      : String(value);

/** Null when the doc cell agrees with the code value, otherwise the reason. */
export function compareConstant(name: string, cell: string, value: CodeValue): string | null {
  if (typeof value === 'string') {
    const quoted = [`"${value}"`, `'${value}'`, `\`${value}\``].some((q) => cell.includes(q));
    return quoted || cell.startsWith(value) ? null : `doc says ${cell}, code has "${value}"`;
  }
  if (Array.isArray(value)) {
    const documented = cell.match(/#[0-9a-f]{6}/gi)?.map((c) => c.toLowerCase()) ?? [];
    const actual = (value as readonly string[]).map((c) => c.toLowerCase());
    return documented.join() === actual.join()
      ? null
      : `doc says ${documented.join(', ')}, code has ${show(value)}`;
  }
  if (isRate(value)) {
    const match = /(\d+)\s*ครั้งต่อ\s*(\d+)\s*วินาที/.exec(cell);
    if (match === null) return `doc value ${cell} is not "<n> ครั้งต่อ <n> วินาที"`;
    const limit = Number(match[1]);
    const windowMs = Number(match[2]) * 1000;
    return limit === value.limit && windowMs === value.windowMs
      ? null
      : `doc says ${String(limit)} per ${String(windowMs)} ms, code has ${show(value)}`;
  }
  if (typeof value !== 'number') return `unsupported code value ${show(value)}`;
  const number = /^[\s"'`]*(\d[\d,_]*(?:\.\d+)?)\s*(ms|วินาที|นาที|KB|MB)?/.exec(cell);
  if (number === null)
    return `doc value ${cell} does not start with a number, code has ${String(value)}`;
  const documented = Number((number[1] ?? '').replace(/[,_]/g, ''));
  const unit = codeUnit(name);
  const docUnit = number[2] === undefined ? undefined : UNIT_FACTORS[number[2]];
  if (docUnit !== undefined && docUnit.dimension !== unit.dimension) {
    return `doc unit ${number[2] ?? ''} does not fit the name ${name}`;
  }
  const docBase = documented * (docUnit?.factor ?? unit.factor);
  const codeBase = value * unit.factor;
  return docBase === codeBase ? null : `doc says ${cell}, code has ${String(value)}`;
}

/** Fallback names: an environment variable's default is `DEFAULT_<NAME>` in env.ts. */
const lookupNames = (name: string): string[] => [name, `DEFAULT_${name}`];

export function checkConstants(
  docFile: string,
  markdown: string,
  constants: ReadonlyMap<string, CodeConstant[]>,
): Problem[] {
  const problems: Problem[] = [];
  for (const row of parseConstantRows(markdown)) {
    const candidates = lookupNames(row.name).flatMap((n) => constants.get(n) ?? []);
    if (candidates.length === 0) {
      problems.push({
        file: docFile,
        line: row.line,
        message: `${row.name}: no constant of this name in the code`,
      });
      continue;
    }
    for (const code of candidates) {
      const why = compareConstant(row.name, row.cell, code.value);
      if (why !== null) {
        problems.push({
          file: docFile,
          line: row.line,
          message: `${row.name}: ${why} (${code.file}:${String(code.line)})`,
        });
      }
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------
// Workflow block
// ---------------------------------------------------------------------------

/** First ```yaml block under the `## 8.` heading: its text and the line of its first content line. */
export function workflowBlock(markdown: string): { text: string; line: number } | null {
  const lines = markdown.split('\n');
  const start = lines.findIndex((l) => /^## 8\. /.test(l));
  if (start === -1) return null;
  const open = lines.findIndex((l, i) => i > start && /^```yaml\s*$/.test(l));
  if (open === -1) return null;
  const close = lines.findIndex((l, i) => i > open && /^```\s*$/.test(l));
  return close === -1 ? null : { text: lines.slice(open + 1, close).join('\n'), line: open + 2 };
}

export function checkWorkflowBlock(docFile: string, markdown: string, workflow: string): Problem[] {
  const block = workflowBlock(markdown);
  if (block === null) {
    return [{ file: docFile, line: 1, message: 'no ```yaml block under the "## 8." heading' }];
  }
  const documented = block.text.split('\n');
  const actual = workflow.replace(/\n$/, '').split('\n');
  const length = Math.max(documented.length, actual.length);
  for (let i = 0; i < length; i += 1) {
    if (documented[i] !== actual[i]) {
      return [
        {
          file: docFile,
          line: block.line + i,
          message: `workflow block differs from .github/workflows/ci.yml at its line ${String(i + 1)}: doc has ${JSON.stringify(documented[i] ?? '(end)')}, file has ${JSON.stringify(actual[i] ?? '(end)')}`,
        },
      ];
    }
  }
  return [];
}
