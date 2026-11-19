import { formatKnowledgeBase } from '@/core/domain';
import type { KnowledgeSource } from '@/core/ports';
import type { PrismaClient } from './prisma-client';

export function createKnowledgeSource(client: PrismaClient): KnowledgeSource {
  return {
    async getKnowledge() {
      // Fixed order (createdAt, then id) keeps the prompt bytes stable while the library is unchanged.
      const rows = await client.kbDocument.findMany({
        where: { status: 'ready' },
        select: { fileName: true, extractedText: true, tokenCount: true },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      return {
        text: formatKnowledgeBase(
          rows.map((r) => ({ fileName: r.fileName, text: r.extractedText ?? '' })),
        ),
        documentCount: rows.length,
        tokenCount: rows.reduce((sum, r) => sum + (r.tokenCount ?? 0), 0),
      };
    },
  };
}
