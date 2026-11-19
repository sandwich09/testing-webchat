// P1: docs cannot drift silently.  pnpm docs:check [--root <repo dir>]
// Checks relative links and anchors in docs/**, README.md and AGENTS.md, the constants of
// project-setup section 10 against the code, and the workflow block of section 8 against
// .github/workflows/ci.yml. Prints `file:line: message` per problem and exits 1 on any.
// Pure rules are in scripts/docs-check.logic.ts.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checkConstants,
  checkLinks,
  checkWorkflowBlock,
  parseSourceConstants,
  type CodeConstant,
  type FileSystemView,
  type Problem,
} from './docs-check.logic';

const rootFlag = process.argv.indexOf('--root');
const ROOT =
  (rootFlag === -1 ? undefined : process.argv[rootFlag + 1]) ??
  fileURLToPath(new URL('..', import.meta.url));
const PROJECT_SETUP = 'docs/architecture/project-setup.md';
const SKIPPED_DIRS = new Set(['node_modules', '.next', 'generated', 'coverage']);

function walk(dir: string, accept: (path: string) => boolean): string[] {
  const found: string[] = [];
  for (const name of readdirSync(join(ROOT, dir))) {
    const path = dir === '' ? name : `${dir}/${name}`;
    if (SKIPPED_DIRS.has(name) || name.startsWith('.')) continue;
    if (statSync(join(ROOT, path)).isDirectory()) found.push(...walk(path, accept));
    else if (accept(path)) found.push(path);
  }
  return found;
}

const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8');

const view: FileSystemView = {
  kind(path) {
    try {
      return statSync(join(ROOT, path)).isDirectory() ? 'dir' : 'file';
    } catch {
      return null;
    }
  },
  markdown(path) {
    try {
      return read(path);
    } catch {
      return null;
    }
  },
};

const problems: Problem[] = [];

const markdownFiles = [
  ...walk('docs', (p) => p.endsWith('.md')),
  ...['README.md', 'AGENTS.md'].filter((p) => view.kind(p) === 'file'),
];
for (const file of markdownFiles) problems.push(...checkLinks(file, read(file), view));

const sourceFiles = [
  ...walk('src', (p) => p.endsWith('.constants.ts') || p === 'src/core/domain/constants.ts'),
  'src/composition/env.ts',
  'src/contracts/timeouts.contract.ts',
  // JOB_BUDGET_SHARE of project-setup 10.4 lives next to the worst-case formulas it scales.
  'src/composition/timing-budget.ts',
  ...walk('app', (p) => p.endsWith('/route.ts')),
];
const constants = new Map<string, CodeConstant[]>();
for (const file of sourceFiles) {
  for (const [name, list] of parseSourceConstants(file, read(file))) {
    constants.set(name, [...(constants.get(name) ?? []), ...list]);
  }
}
const projectSetup = read(PROJECT_SETUP);
problems.push(...checkConstants(PROJECT_SETUP, projectSetup, constants));
problems.push(...checkWorkflowBlock(PROJECT_SETUP, projectSetup, read('.github/workflows/ci.yml')));

if (problems.length === 0) {
  console.log(
    `docs:check: ok (${String(markdownFiles.length)} Markdown files, ${String(sourceFiles.length)} source files).`,
  );
} else {
  for (const p of problems)
    console.error(`${relative('', p.file)}:${String(p.line)}: ${p.message}`);
  console.error(`\ndocs:check: ${String(problems.length)} problem(s).`);
  process.exitCode = 1;
}
