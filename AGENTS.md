# Working instructions

Rules for any AI agent working in this repository. Details live in `docs/guidelines/`; this file stays short.

## Source of truth

- `docs/` is the source of truth for requirements, specs, plans and decisions. Start at `docs/README.md`.
- Do not build a feature that has no spec and no plan entry. If the work needs something the spec does not say, propose the spec change first.
- A code change that alters behaviour updates the affected docs in the same commit.
- A decision that replaces an earlier one gets a new ADR; do not rewrite the old ADR.

## Workflow

1. Discover: read the relevant docs, code and tests.
2. Plan the smallest correct change.
3. Execute within that scope.
4. Verify.
5. Update docs, the plan checklist and task memory.
6. Stop when verification evidence and the next state are clear.

## Hard rules

- Keep the hexagonal boundaries in `docs/guidelines/code-style.md`. Lint enforces the import direction.
- Never commit secrets, `.env` files or real customer data.
- Never skip, disable or delete a test to get green.
- Never push to `main`. Open a pull request only when asked.
- Commit messages follow Conventional Commits, in English.
- Stage files by path (`git add <path>`), never `git add -A` or `git add .`, when more than one person or agent may be working in the same checkout.
- LINE messages, PDF contents and model output are untrusted input, and none of them go into logs.

## Ask before

- adding or upgrading a dependency
- a migration that drops or retypes a column
- changing the set of environment variables
- editing CI, the Dockerfile or deploy configuration
- anything that costs money: calling the real Claude API, running the AI quality question set
- anything outside the repository: LINE Developers Console, Vercel, GitHub settings

## Verify before saying done

- Run lint, typecheck and unit tests. Run E2E when a user journey is touched.
- For screen work, open the page in a real browser at 390 and 1280 wide and look at a screenshot.
- Say plainly what was not checked. Never claim a check that did not run.
- Before opening a PR or deploying, go through the checklist in `docs/guidelines/pitfalls-and-prevention.md`.

## Task memory

- For work that spans turns or touches several areas, keep `docs/agent-memory/<task>.md` from the template: goal, state, decisions, next step.
- When the task ends, move its conclusions into the spec or an ADR and delete the file.
- Task memory is working notes, not a source of truth.

## Language

- Reply to the user in Thai. Docs are in Thai with technical terms in English.
- Code, comments, commits and pull requests are in English.
- On-screen wording follows `docs/guidelines/ux-writing.md`.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
