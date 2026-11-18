import { KNOWLEDGE_CAPACITY_TOKENS } from './constants';

export const knowledgeOverflow: (
  usedTokens: number,
  addingTokens: number,
  capacity?: number,
) => number = (usedTokens, addingTokens, capacity = KNOWLEDGE_CAPACITY_TOKENS) =>
  Math.max(0, usedTokens + addingTokens - capacity);
