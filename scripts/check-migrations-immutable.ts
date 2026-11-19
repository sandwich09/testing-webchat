// D1: fails when the change modifies, renames or deletes a file of a migration directory that
// already exists on the base. Adding a new migration directory is allowed.
//   pnpm migrations:immutable [--base <ref>]
import { basePaths, changedFiles, resolveBase } from './git-base';
import { findImmutabilityViolations, migrationDirsOf, parseNameStatus } from './migrations.logic';

const base = resolveBase(process.argv.slice(2));
if (base === null) {
  console.log('migrations:immutable: no parent commit to compare with, nothing to check.');
} else {
  const violations = findImmutabilityViolations(
    parseNameStatus(changedFiles(base)),
    migrationDirsOf(basePaths(base)),
  );
  if (violations.length === 0) {
    console.log(`migrations:immutable: ok (compared with ${base.slice(0, 12)}).`);
  } else {
    for (const v of violations) console.error(`${v.path}: ${v.reason}`);
    console.error(
      '\nApplied migrations are immutable. Restore the files from Git history and put the change in a new migration directory.',
    );
    process.exitCode = 1;
  }
}
