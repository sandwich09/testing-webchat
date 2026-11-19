import { afterAll } from 'vitest';
import { describeKnowledgeSourceSuite } from '@/adapters/fakes';
import { ADAPTER_TEST_DATABASE_URL } from '../../../test-support/adapters.constants';
import { createKnowledgeSource } from './knowledge-source.adapter';
import { getPrismaClient } from './prisma-client';

const client = getPrismaClient(ADAPTER_TEST_DATABASE_URL);

afterAll(() => client.$disconnect());

describeKnowledgeSourceSuite(() => ({
  source: createKnowledgeSource(client),
  async setLibrary(documents) {
    await client.kbDocument.deleteMany();
    await client.kbDocument.createMany({
      data: documents.map((d, i) => ({
        id: d.id,
        fileName: d.fileName,
        sizeBytes: 1,
        sha256: (i + 1).toString(16).padStart(64, '0'),
        tokenCount: d.tokenCount,
        extractedText: d.text,
        status: d.status,
        createdAt: d.createdAt,
        updatedAt: d.createdAt,
      })),
    });
  },
}));
