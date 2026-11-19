// Unit tests of scripts/migrations.logic.ts (the rules of the D1 and D2 CI checks). The file is
// `.unit.ts` in e2e/ because the root vitest config collects only `src/**/*.spec.ts` and
// `e2e/**/*.unit.ts`. No test here runs git.
import { describe, expect, it } from 'vitest';
import {
  findAppliedMismatches,
  findDestructiveStatements,
  findImmutabilityViolations,
  findUnapprovedDestructive,
  hasApproval,
  migrationDirOf,
  migrationDirsOf,
  migrationSqlPaths,
  parseNameStatus,
  stripSqlNoise,
} from '../scripts/migrations.logic';

const INIT = 'prisma/migrations/20261118133808_init';
const GUARD = 'prisma/migrations/20261118143909_topic_guard';
const BASE_DIRS = migrationDirsOf([
  `${INIT}/migration.sql`,
  `${GUARD}/migration.sql`,
  'prisma/migrations/migration_lock.toml',
]);
const violationsOf = (diff: string) => findImmutabilityViolations(parseNameStatus(diff), BASE_DIRS);

describe('parseNameStatus', () => {
  it('reads plain statuses and the two paths of a rename', () => {
    expect(parseNameStatus(`M\ta.ts\nD\tb.ts\nR087\told/x.sql\tnew/x.sql\nA\tc.ts\n\n`)).toEqual([
      { status: 'M', path: 'a.ts' },
      { status: 'D', path: 'b.ts' },
      { status: 'R', oldPath: 'old/x.sql', path: 'new/x.sql' },
      { status: 'A', path: 'c.ts' },
    ]);
  });

  it('rejects a line it cannot read instead of ignoring it', () => {
    expect(() => parseNameStatus('X\tfile')).toThrow('Cannot parse diff line');
    expect(() => parseNameStatus('R100\tonly-one')).toThrow('Cannot parse diff line');
  });
});

describe('migrationDirOf', () => {
  it('returns the directory name, and null for the lock file and other paths', () => {
    expect(migrationDirOf(`${INIT}/migration.sql`)).toBe('20261118133808_init');
    expect(migrationDirOf('prisma/migrations/migration_lock.toml')).toBeNull();
    expect(migrationDirOf('prisma/schema.prisma')).toBeNull();
  });
});

describe('findImmutabilityViolations (D1)', () => {
  it('allows a new migration directory and unrelated changes', () => {
    const diff = [
      'A\tprisma/migrations/20261201000000_add_note/migration.sql',
      'M\tprisma/schema.prisma',
      'M\tprisma/migrations/migration_lock.toml',
      'M\tsrc/core/domain/constants.ts',
    ].join('\n');
    expect(violationsOf(diff)).toEqual([]);
  });

  it('rejects a modified file of an existing migration', () => {
    expect(violationsOf(`M\t${GUARD}/migration.sql`)).toEqual([
      { path: `${GUARD}/migration.sql`, reason: 'modified' },
    ]);
  });

  it('rejects a deleted file and a deleted directory', () => {
    const diff = `D\t${INIT}/migration.sql\nD\t${GUARD}/migration.sql`;
    expect(violationsOf(diff).map((v) => v.reason)).toEqual(['deleted', 'deleted']);
  });

  it('rejects renaming an existing migration, in place or to a new directory', () => {
    const renamedDir = `R100\t${INIT}/migration.sql\tprisma/migrations/20261201000000_init/migration.sql`;
    const renamedFile = `R090\t${GUARD}/migration.sql\t${GUARD}/migration.sql.bak`;
    expect(violationsOf(renamedDir)).toEqual([
      {
        path: `${INIT}/migration.sql`,
        reason: 'renamed to prisma/migrations/20261201000000_init/migration.sql',
      },
    ]);
    expect(violationsOf(renamedFile)).toHaveLength(1);
  });

  it('rejects a file moved or copied into an existing migration directory', () => {
    expect(violationsOf(`R100\tdocs/x.sql\t${INIT}/extra.sql`)).toHaveLength(1);
    expect(violationsOf(`C100\tdocs/x.sql\t${INIT}/extra.sql`)).toHaveLength(1);
  });

  it('rejects a file added next to the applied ones', () => {
    expect(violationsOf(`A\t${INIT}/notes.md`)).toEqual([
      { path: `${INIT}/notes.md`, reason: 'added to an existing migration directory' },
    ]);
  });

  it('allows renaming inside a migration directory that is new in this change', () => {
    const diff =
      'A\tprisma/migrations/20261201000000_new/a.sql\nR100\tx/a.sql\tprisma/migrations/20261201000000_new/b.sql';
    expect(violationsOf(diff)).toEqual([]);
  });
});

describe('stripSqlNoise', () => {
  it('blanks comments and string literals without moving a single character', () => {
    const sql = `-- DROP TABLE a\nSELECT 'DROP TABLE b' /* TRUNCATE\nx */ , "DROP"; $$ RENAME $$`;
    const clean = stripSqlNoise(sql);
    expect(clean).toHaveLength(sql.length);
    expect(clean.split('\n')).toHaveLength(sql.split('\n').length);
    expect(clean).not.toMatch(/DROP TABLE|TRUNCATE|RENAME/);
  });

  it('treats a doubled quote as part of the string', () => {
    expect(stripSqlNoise(`'it''s DROP TABLE'; DROP TABLE x`)).toMatch(/^'\s+'; DROP TABLE x$/);
  });
});

describe('findDestructiveStatements (D2)', () => {
  const kinds = (sql: string) => findDestructiveStatements(sql).map((f) => f.kind);

  it('accepts additive Prisma migrations', () => {
    const sql = [
      '-- AlterEnum',
      `ALTER TYPE "AiOutcome" ADD VALUE 'blocked';`,
      '-- AlterTable',
      `ALTER TABLE "Settings" ADD COLUMN "guardEnabled" BOOLEAN NOT NULL DEFAULT false;`,
      'CREATE TABLE "Note" ("id" TEXT NOT NULL);',
      'CREATE UNIQUE INDEX "Note_id_key" ON "Note"("id");',
      `DELETE FROM "Settings" WHERE "id" = 1;`,
    ].join('\n');
    expect(kinds(sql)).toEqual([]);
  });

  it('finds each destructive statement with its line number', () => {
    const sql = [
      'DROP TABLE "Old";',
      'ALTER TABLE "A" DROP COLUMN "b";',
      'ALTER TABLE "A" ALTER COLUMN "c" SET DATA TYPE INTEGER;',
      'ALTER TABLE "A" ALTER COLUMN "d" TYPE TEXT;',
      'ALTER TABLE "A" RENAME COLUMN "e" TO "f";',
      "ALTER TYPE \"X\" RENAME VALUE 'a' TO 'b';",
      'TRUNCATE TABLE "A";',
      'DELETE FROM "A";',
    ].join('\n');
    expect(findDestructiveStatements(sql).map((f) => [f.line, f.kind])).toEqual([
      [1, 'DROP TABLE'],
      [2, 'DROP COLUMN'],
      [3, 'ALTER COLUMN ... TYPE'],
      [4, 'ALTER COLUMN ... TYPE'],
      [5, 'RENAME'],
      [6, 'RENAME'],
      [7, 'TRUNCATE'],
      [8, 'DELETE FROM without WHERE'],
    ]);
  });

  it('is case and whitespace insensitive', () => {
    expect(kinds('drop\n   table "a";')).toEqual(['DROP TABLE']);
    expect(kinds('delete   from "a" ;')).toEqual(['DELETE FROM without WHERE']);
  });

  it('judges DELETE FROM per statement, not per file', () => {
    expect(kinds(`DELETE FROM "A" WHERE "x" = 1; DELETE FROM "B";`)).toEqual([
      'DELETE FROM without WHERE',
    ]);
  });

  it('ignores keywords inside comments, strings and identifiers', () => {
    const sql = [
      '-- DROP TABLE "A"',
      '/* TRUNCATE "A"; DELETE FROM "A"; */',
      `INSERT INTO "T" ("text") VALUES ('DROP TABLE x; RENAME');`,
      'CREATE TABLE "RENAME" ("TRUNCATE" TEXT);',
    ].join('\n');
    expect(kinds(sql)).toEqual([]);
  });

  it('reports the source text of the line', () => {
    expect(findDestructiveStatements('SELECT 1;\n  DROP TABLE "A";')[0]).toEqual({
      line: 2,
      kind: 'DROP TABLE',
      text: 'DROP TABLE "A";',
    });
  });
});

describe('hasApproval', () => {
  it('needs the exact marker with a non-empty reason', () => {
    expect(hasApproval('-- approved-destructive: owner approved dropping Old on 2026-12-01')).toBe(
      true,
    );
    expect(hasApproval('SELECT 1;\n   -- approved-destructive: reason\nDROP TABLE "A";')).toBe(
      true,
    );
    expect(hasApproval('-- approved-destructive:')).toBe(false);
    expect(hasApproval('-- approved-destructive:   ')).toBe(false);
    expect(hasApproval('--approved-destructive: reason')).toBe(false);
    expect(hasApproval('-- approved: reason')).toBe(false);
    expect(hasApproval('/* approved-destructive: reason */')).toBe(false);
    expect(hasApproval('SELECT 1; -- approved-destructive: reason')).toBe(false);
  });
});

describe('findUnapprovedDestructive', () => {
  it('reports only files that have findings and no approval line', () => {
    const reports = findUnapprovedDestructive([
      { path: 'a.sql', sql: 'DROP TABLE "A";' },
      { path: 'b.sql', sql: '-- approved-destructive: owner approved\nDROP TABLE "B";' },
      { path: 'c.sql', sql: 'CREATE TABLE "C" ();' },
    ]);
    expect(reports.map((r) => r.path)).toEqual(['a.sql']);
  });
});

describe('migrationSqlPaths', () => {
  it('lists every SQL file of a migration directory, existing and new, sorted', () => {
    expect(
      migrationSqlPaths([
        'prisma/migrations/20261201000000_n/migration.sql',
        'prisma/migrations/20261118133808_init/migration.sql',
        'prisma/migrations/20261201000000_n/README.md',
        'prisma/migrations/migration_lock.toml',
        'docs/example.sql',
      ]),
    ).toEqual([
      'prisma/migrations/20261118133808_init/migration.sql',
      'prisma/migrations/20261201000000_n/migration.sql',
    ]);
  });
});

describe('findAppliedMismatches', () => {
  const local = new Map([
    ['20261118133808_init', 'aaa'],
    ['20261118143909_topic_guard', 'bbb'],
  ]);

  it('passes when every applied migration is present with the same checksum', () => {
    expect(
      findAppliedMismatches(
        [
          { name: '20261118133808_init', checksum: 'aaa' },
          { name: '20261118143909_topic_guard', checksum: 'bbb' },
        ],
        local,
      ),
    ).toEqual([]);
  });

  it('reports an applied migration that was edited or deleted, and ignores pending ones', () => {
    expect(
      findAppliedMismatches(
        [
          { name: '20261118133808_init', checksum: 'changed' },
          { name: '20261119000000_gone', checksum: 'ccc' },
        ],
        local,
      ),
    ).toEqual([
      { name: '20261118133808_init', reason: 'modified' },
      { name: '20261119000000_gone', reason: 'missing' },
    ]);
  });
});
