import { describe, expect, it } from 'vitest';
import { testIds } from './test-ids';

describe('testIds', () => {
  const values = Object.values(testIds);

  it('has no id twice', () => {
    expect(new Set(values).size).toBe(values.length);
  });

  it('names every id in kebab-case English', () => {
    for (const id of values) expect(id).toMatch(/^[a-z]+(-[a-z0-9]+)*$/);
  });

  it('uses the camelCase of the id as its key', () => {
    for (const [key, id] of Object.entries(testIds)) {
      expect(key).toBe(id.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase()));
    }
  });

  it('has the ids that end-to-end tests rely on', () => {
    expect(testIds.contactRow).toBe('contact-row');
    expect(testIds.messageBubble).toBe('message-bubble');
    expect(testIds.accessError).toBe('access-error');
    expect(testIds.lineResult).toBe('line-result');
    expect(testIds.kbRowStatus).toBe('kb-row-status');
    expect(testIds.toast).toBe('toast');
  });
});
