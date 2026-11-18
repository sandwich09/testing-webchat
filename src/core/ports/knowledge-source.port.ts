export interface KnowledgeSource {
  /** The whole library with status ready, ordered by createdAt then id. */
  getKnowledge(): Promise<{ text: string; documentCount: number; tokenCount: number }>;
}
