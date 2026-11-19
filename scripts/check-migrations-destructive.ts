// D2: fails when a migration file added by the change has a destructive statement and no
// `-- approved-destructive: <reason>` line. Existing migration files are not scanned.
//   pnpm migrations:destructive [--base <ref>]
import { changedFiles, readWorkingFile, resolveBase } from './git-base';
import {
  addedMigrationSqlPaths,
  APPROVAL_MARKER,
  findUnapprovedDestructive,
  parseNameStatus,
} from './migrations.logic';

const base = resolveBase(process.argv.slice(2));
if (base === null) {
  console.log('migrations:destructive: no parent commit to compare with, nothing to check.');
} else {
  const paths = addedMigrationSqlPaths(parseNameStatus(changedFiles(base)));
  const reports = findUnapprovedDestructive(
    paths.map((path) => ({ path, sql: readWorkingFile(path) })),
  );
  if (reports.length === 0) {
    console.log(
      `migrations:destructive: ok (${String(paths.length)} added migration file(s) scanned).`,
    );
  } else {
    for (const report of reports) {
      for (const f of report.findings) {
        console.error(`${report.path}:${String(f.line)}: ${f.kind}: ${f.text}`);
      }
    }
    console.error(
      `\nA destructive migration needs the owner's approval. Once approved, add a line "${APPROVAL_MARKER} <reason>" to the file.`,
    );
    process.exitCode = 1;
  }
}
