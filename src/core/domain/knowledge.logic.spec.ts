import { describe, expect, it } from 'vitest';
import { KNOWLEDGE_CAPACITY_TOKENS } from './constants';
import { knowledgeOverflow } from './knowledge.logic';

describe('knowledgeOverflow', () => {
  it('returns 0 when the total fits, including exactly at capacity', () => {
    expect(knowledgeOverflow(100, 200, 1000)).toBe(0);
    expect(knowledgeOverflow(600, 400, 1000)).toBe(0);
  });

  it('returns the excess tokens', () => {
    expect(knowledgeOverflow(600, 401, 1000)).toBe(1);
    expect(knowledgeOverflow(900, 500, 1000)).toBe(400);
  });

  it('defaults the capacity to KNOWLEDGE_CAPACITY_TOKENS', () => {
    expect(knowledgeOverflow(KNOWLEDGE_CAPACITY_TOKENS, 1)).toBe(1);
    expect(knowledgeOverflow(0, KNOWLEDGE_CAPACITY_TOKENS)).toBe(0);
  });
});
