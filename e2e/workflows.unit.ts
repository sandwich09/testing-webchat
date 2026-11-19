import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AI_MODEL_IDS } from '@/core/domain';

// The ai-eval workflow (ADR 0032) spends money, so two properties are pinned here: it does
// nothing unless someone ticks "confirm", and it covers exactly the models the settings offer.
const workflow = readFileSync(new URL('../.github/workflows/ai-eval.yml', import.meta.url), 'utf8');

describe('ai-eval workflow', () => {
  it('starts by hand only', () => {
    const on = /^on:\n((?: {2}.*\n|\n)+)/m.exec(workflow)?.[1] ?? '';
    expect(on).toContain('workflow_dispatch:');
    expect(on).not.toMatch(/^ {2}(push|pull_request|schedule):/m);
  });

  it('has a confirm input that is off by default', () => {
    expect(workflow).toMatch(/confirm:\n(?: {8}.*\n)*? {8}type: boolean\n {8}default: false\n/);
  });

  it('runs the question set only after the preflight said so', () => {
    expect(workflow).toContain("if: needs.preflight.outputs.run == 'true'");
  });

  it('runs every model the settings page offers', () => {
    const line = /^ {8}model: \[(.*)\]$/m.exec(workflow)?.[1] ?? '';
    const models = line.split(',').map((m) => m.trim());
    expect(models.toSorted()).toEqual([...AI_MODEL_IDS].toSorted());
  });
});
