// D2: fails when any migration file in the tree has a destructive statement and no
// `-- approved-destructive: <reason>` line. Every file is scanned on every run, so a statement
// added in a commit whose own CI run failed or was cancelled is still caught by the next run.
//   pnpm migrations:destructive
import { readWorkingFile, workingMigrationPaths } from './git-base';
import { APPROVAL_MARKER, findUnapprovedDestructive, migrationSqlPaths } from './migrations.logic';

const paths = migrationSqlPaths(workingMigrationPaths());
const reports = findUnapprovedDestructive(
  paths.map((path) => ({ path, sql: readWorkingFile(path) })),
);
if (reports.length === 0) {
  console.log(`migrations:destructive: ok (${String(paths.length)} migration file(s) scanned).`);
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
