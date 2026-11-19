// Shared git plumbing of the migration checks: which commit the change is compared with, and
// the changed files as `git diff --name-status` lines. All I/O lives here; rules are in
// migrations.logic.ts.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const git = (args: string[]): string =>
  execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const gitOk = (args: string[]): boolean => {
  try {
    execFileSync('git', args, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

/**
 * Commit to compare with. `--base <ref>` or CHECK_BASE_REF wins. On main (a push to main, or a
 * local checkout of it) it is the first parent of HEAD. Anywhere else it is the merge base of
 * HEAD and origin/main, so a branch is judged by what it adds on top of main.
 * Returns null when there is nothing to compare with (the very first commit).
 */
export function resolveBase(argv: readonly string[]): string | null {
  const flag = argv.indexOf('--base');
  const explicit = (flag === -1 ? undefined : argv[flag + 1]) ?? process.env.CHECK_BASE_REF;
  if (explicit !== undefined && explicit !== '') return git(['rev-parse', explicit]).trim();

  const branch = process.env.GITHUB_REF_NAME ?? git(['rev-parse', '--abbrev-ref', 'HEAD']).trim();
  if (branch === 'main') {
    return gitOk(['rev-parse', '--verify', 'HEAD^1']) ? git(['rev-parse', 'HEAD^1']).trim() : null;
  }
  if (!gitOk(['rev-parse', '--verify', 'origin/main'])) {
    throw new Error('origin/main is not available. Run `git fetch origin main` (full history).');
  }
  return git(['merge-base', 'origin/main', 'HEAD']).trim();
}

/** Changes from `base` to the working tree, untracked files included, as name-status text. */
export function changedFiles(base: string): string {
  const tracked = git(['diff', '--name-status', '--find-renames', base, '--', 'prisma/migrations']);
  const untracked = git(['ls-files', '--others', '--exclude-standard', '--', 'prisma/migrations'])
    .split('\n')
    .filter((p) => p !== '')
    .map((p) => `A\t${p}`)
    .join('\n');
  return `${tracked}\n${untracked}\n`;
}

/** Paths under prisma/migrations in the base commit. */
export function basePaths(base: string): string[] {
  return git(['ls-tree', '-r', '--name-only', base, '--', 'prisma/migrations'])
    .split('\n')
    .filter((p) => p !== '');
}

export function readWorkingFile(path: string): string {
  return readFileSync(path, 'utf8');
}
