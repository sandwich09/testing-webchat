import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * On-screen wording by its ui-copy key, e.g. `uiCopy('inbox.message.senderYou')`.
 *
 * The app's copy objects live in `src/features/*\/*.constants.ts` and `src/common/*.constants.ts`,
 * which the lint boundaries do not let `e2e/` import. The key tables of docs/specs/ui-copy.md are
 * the source those objects follow, so the journeys read the wording from there instead of
 * retyping Thai text. A mismatch between the screen and the spec then fails the journey.
 */
const UI_COPY_FILE = fileURLToPath(new URL('../../docs/specs/ui-copy.md', import.meta.url));
const ROW = /^\| `([A-Za-z0-9_.]+)` \| (.*?) \|(?: .*)?$/;

let table: Map<string, string> | undefined;

function load(): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of readFileSync(UI_COPY_FILE, 'utf8').split('\n')) {
    const match = ROW.exec(line);
    if (match?.[1] !== undefined && match[2] !== undefined) map.set(match[1], match[2].trim());
  }
  return map;
}

/** The text of one ui-copy key, with `{name}` placeholders filled from `vars`. */
export function uiCopy(key: string, vars: Record<string, string | number> = {}): string {
  table ??= load();
  const text = table.get(key);
  if (text === undefined) throw new Error(`Unknown ui-copy key: ${key}`);
  return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  );
}
