import { describe, expect, it } from 'vitest';
import { FakeKnowledgeSource } from './fake-knowledge-source';
import { describeKnowledgeSourceSuite } from './suites/knowledge-source.suite';

describeKnowledgeSourceSuite(() => {
  const source = new FakeKnowledgeSource();
  return {
    source,
    setLibrary: (documents) => {
      source.setDocuments(documents);
      return Promise.resolve();
    },
  };
});

describe('FakeKnowledgeSource test controls', () => {
  it('counts calls', async () => {
    const source = new FakeKnowledgeSource();
    await source.getKnowledge();
    await source.getKnowledge();
    expect(source.getKnowledgeCalls).toBe(2);
  });
});
