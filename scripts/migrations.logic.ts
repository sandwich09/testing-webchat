// Pure rules of the two migration checks (docs/guidelines/pitfalls-and-prevention.md D1 and D2).
// No I/O: scripts/check-migrations-immutable.ts and scripts/check-migrations-destructive.ts feed
// in `git diff --name-status` output and file contents. Unit tests: e2e/migrations.unit.ts.

export const MIGRATIONS_DIR = 'prisma/migrations';

/**
 * Exact format of the approval line. The file must contain a line that starts with it (after
 * optional indentation) and the reason must not be empty:
 *   -- approved-destructive: <reason>
 */
export const APPROVAL_MARKER = '-- approved-destructive:';

// ---------------------------------------------------------------------------
// Diff parsing
// ---------------------------------------------------------------------------

export type DiffEntry = {
  /** First letter of the git status: A, M, D, R, C or T. */
  status: string;
  /** Path on the new side (the only path for A, M, D and T). */
  path: string;
  /** Path on the base side for R and C. */
  oldPath?: string;
};

/** Parses `git diff --name-status` output (tab separated, R and C carry two paths). */
export function parseNameStatus(output: string): DiffEntry[] {
  const entries: DiffEntry[] = [];
  for (const line of output.split('\n')) {
    if (line.trim() === '') continue;
    const [rawStatus = '', first = '', second] = line.split('\t');
    const status = rawStatus.charAt(0);
    if (status === 'R' || status === 'C') {
      if (second === undefined) throw new Error(`Cannot parse diff line: ${line}`);
      entries.push({ status, oldPath: first, path: second });
    } else if (['A', 'M', 'D', 'T'].includes(status) && first !== '') {
      entries.push({ status, path: first });
    } else {
      throw new Error(`Cannot parse diff line: ${line}`);
    }
  }
  return entries;
}

/** Name of the migration directory a path belongs to, or null (e.g. migration_lock.toml). */
export function migrationDirOf(path: string): string | null {
  const prefix = `${MIGRATIONS_DIR}/`;
  if (!path.startsWith(prefix)) return null;
  const rest = path.slice(prefix.length);
  const slash = rest.indexOf('/');
  return slash > 0 ? rest.slice(0, slash) : null;
}

/** Migration directory names that exist on the base, from `git ls-tree -r --name-only`. */
export function migrationDirsOf(paths: readonly string[]): Set<string> {
  const dirs = new Set<string>();
  for (const path of paths) {
    const dir = migrationDirOf(path);
    if (dir !== null) dirs.add(dir);
  }
  return dirs;
}

// ---------------------------------------------------------------------------
// D1: applied migrations are immutable
// ---------------------------------------------------------------------------

export type ImmutabilityViolation = { path: string; reason: string };

/**
 * A change is a violation when it touches a file of a migration directory that exists on the
 * base: modify, delete, type change, rename away, rename or copy into, or add a file next to the
 * applied ones. A new migration directory is allowed.
 */
export function findImmutabilityViolations(
  entries: readonly DiffEntry[],
  baseDirs: ReadonlySet<string>,
): ImmutabilityViolation[] {
  const violations: ImmutabilityViolation[] = [];
  const inBase = (path: string | undefined): boolean => {
    if (path === undefined) return false;
    const dir = migrationDirOf(path);
    return dir !== null && baseDirs.has(dir);
  };
  for (const entry of entries) {
    switch (entry.status) {
      case 'M':
        if (inBase(entry.path)) violations.push({ path: entry.path, reason: 'modified' });
        break;
      case 'T':
        if (inBase(entry.path)) violations.push({ path: entry.path, reason: 'type changed' });
        break;
      case 'D':
        if (inBase(entry.path)) violations.push({ path: entry.path, reason: 'deleted' });
        break;
      case 'A':
        if (inBase(entry.path)) {
          violations.push({ path: entry.path, reason: 'added to an existing migration directory' });
        }
        break;
      case 'R':
        if (inBase(entry.oldPath)) {
          violations.push({
            path: entry.oldPath ?? entry.path,
            reason: `renamed to ${entry.path}`,
          });
        } else if (inBase(entry.path)) {
          violations.push({
            path: entry.path,
            reason: 'moved into an existing migration directory',
          });
        }
        break;
      case 'C':
        if (inBase(entry.path)) {
          violations.push({
            path: entry.path,
            reason: 'copied into an existing migration directory',
          });
        }
        break;
      default:
        break;
    }
  }
  return violations;
}

// ---------------------------------------------------------------------------
// D2: destructive statements need an approval line
// ---------------------------------------------------------------------------

export type DestructiveFinding = { line: number; kind: string; text: string };

/**
 * Blanks comments and string literals but keeps every newline and character position, so line
 * numbers of the result match the source. Quoted identifiers keep their quotes with the content
 * replaced by underscores, so `ALTER COLUMN "x" TYPE` still reads as a column reference.
 */
export function stripSqlNoise(sql: string): string {
  let out = '';
  let i = 0;
  const blank = (text: string, fill: string): string => text.replace(/[^\n]/g, fill);
  while (i < sql.length) {
    const two = sql.slice(i, i + 2);
    const ch = sql.charAt(i);
    if (two === '--') {
      const end = sql.indexOf('\n', i);
      const stop = end === -1 ? sql.length : end;
      out += blank(sql.slice(i, stop), ' ');
      i = stop;
    } else if (two === '/*') {
      // PostgreSQL block comments nest.
      let depth = 1;
      let j = i + 2;
      while (j < sql.length && depth > 0) {
        if (sql.startsWith('/*', j)) {
          depth += 1;
          j += 2;
        } else if (sql.startsWith('*/', j)) {
          depth -= 1;
          j += 2;
        } else {
          j += 1;
        }
      }
      out += blank(sql.slice(i, j), ' ');
      i = j;
    } else if (ch === "'") {
      let j = i + 1;
      while (j < sql.length) {
        if (sql.charAt(j) === "'" && sql.charAt(j + 1) === "'") j += 2;
        else if (sql.charAt(j) === "'") break;
        else j += 1;
      }
      const stop = Math.min(j + 1, sql.length);
      out += `'${blank(sql.slice(i + 1, stop - 1), ' ')}'`.slice(0, stop - i);
      i = stop;
    } else if (ch === '"') {
      const close = sql.indexOf('"', i + 1);
      const stop = close === -1 ? sql.length : close + 1;
      out += `"${blank(sql.slice(i + 1, stop - 1), '_')}"`.slice(0, stop - i);
      i = stop;
    } else if (ch === '$') {
      const tag = /^\$[A-Za-z_]*\$/.exec(sql.slice(i));
      const close = tag === null ? -1 : sql.indexOf(tag[0], i + tag[0].length);
      if (tag !== null && close !== -1) {
        const stop = close + tag[0].length;
        out += blank(sql.slice(i, stop), ' ');
        i = stop;
      } else {
        out += ch;
        i += 1;
      }
    } else {
      out += ch;
      i += 1;
    }
  }
  return out;
}

const SIMPLE_PATTERNS: readonly { kind: string; pattern: RegExp }[] = [
  { kind: 'DROP TABLE', pattern: /\bDROP\s+TABLE\b/gi },
  { kind: 'DROP COLUMN', pattern: /\bDROP\s+COLUMN\b/gi },
  {
    kind: 'ALTER COLUMN ... TYPE',
    pattern: /\bALTER\s+(?:COLUMN\s+)?(?:"[^"]*"|\w+)\s+(?:SET\s+DATA\s+)?TYPE\b/gi,
  },
  { kind: 'RENAME', pattern: /\bRENAME\b/gi },
  { kind: 'TRUNCATE', pattern: /\bTRUNCATE\b/gi },
];

const lineOf = (text: string, index: number): number => text.slice(0, index).split('\n').length;

/** Destructive statements in one migration file, comments and string literals ignored. */
export function findDestructiveStatements(sql: string): DestructiveFinding[] {
  const clean = stripSqlNoise(sql);
  const sourceLines = sql.split('\n');
  const findings: DestructiveFinding[] = [];
  const add = (kind: string, index: number): void => {
    const line = lineOf(clean, index);
    findings.push({ line, kind, text: (sourceLines[line - 1] ?? '').trim() });
  };
  for (const { kind, pattern } of SIMPLE_PATTERNS) {
    for (const match of clean.matchAll(pattern)) add(kind, match.index);
  }
  // DELETE FROM is destructive only without a WHERE in the same statement.
  let offset = 0;
  for (const statement of clean.split(';')) {
    const del = /\bDELETE\s+FROM\b/i.exec(statement);
    if (del !== null && !/\bWHERE\b/i.test(statement))
      add('DELETE FROM without WHERE', offset + del.index);
    offset += statement.length + 1;
  }
  return findings.sort((a, b) => a.line - b.line || a.kind.localeCompare(b.kind));
}

/** True when a line of the file is `-- approved-destructive: <reason>` with a non-empty reason. */
export function hasApproval(sql: string): boolean {
  return sql.split('\n').some((line) => {
    const trimmed = line.trim();
    return (
      trimmed.startsWith(APPROVAL_MARKER) && trimmed.slice(APPROVAL_MARKER.length).trim() !== ''
    );
  });
}

export type DestructiveReport = { path: string; findings: DestructiveFinding[] };

/** Files with destructive statements and no approval line. */
export function findUnapprovedDestructive(
  files: readonly { path: string; sql: string }[],
): DestructiveReport[] {
  const reports: DestructiveReport[] = [];
  for (const file of files) {
    const findings = findDestructiveStatements(file.sql);
    if (findings.length > 0 && !hasApproval(file.sql)) reports.push({ path: file.path, findings });
  }
  return reports;
}

/** Paths of SQL files that the change adds (new files, and the target of a rename or copy). */
export function addedMigrationSqlPaths(entries: readonly DiffEntry[]): string[] {
  return entries
    .filter((e) => ['A', 'R', 'C'].includes(e.status))
    .map((e) => e.path)
    .filter((p) => migrationDirOf(p) !== null && p.endsWith('.sql'));
}
