import { err, ok, type DocumentId } from '@/core/domain';
import type { KnowledgeRepository } from '@/core/ports';
import type { PrismaClient } from './prisma-client';
import { toKbDocument, toKbDocumentWithText } from './knowledge.mapper';
import { hasPrismaCode } from './prisma-error';

export function createKnowledgeRepository(client: PrismaClient): KnowledgeRepository {
  // Columns the library list needs; the extracted text can be large and stays in the database.
  const withoutText = {
    id: true,
    fileName: true,
    sizeBytes: true,
    sha256: true,
    pageCount: true,
    tokenCount: true,
    status: true,
    error: true,
    createdAt: true,
    updatedAt: true,
  } as const;

  return {
    async create(d) {
      try {
        const row = await client.kbDocument.create({
          data: {
            id: d.id,
            fileName: d.fileName,
            sizeBytes: d.sizeBytes,
            sha256: d.sha256,
            status: 'processing',
            createdAt: d.now,
            updatedAt: d.now,
          },
        });
        return ok(toKbDocument(row));
      } catch (e) {
        if (hasPrismaCode(e, 'P2002')) return err('knowledge.duplicate');
        throw e;
      }
    },

    async findById(id) {
      const row = await client.kbDocument.findUnique({ where: { id } });
      return row === null ? null : toKbDocument(row);
    },

    async findBySha256(sha256) {
      const row = await client.kbDocument.findUnique({ where: { sha256 } });
      return row === null ? null : toKbDocument(row);
    },

    async getWithText(id) {
      const row = await client.kbDocument.findUnique({ where: { id } });
      return row === null ? null : toKbDocumentWithText(row);
    },

    async list() {
      const rows = await client.kbDocument.findMany({
        select: withoutText,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      return rows.map(toKbDocument);
    },

    async restartProcessing(id, d) {
      try {
        // Compare-and-set: the status condition is re-checked after the row lock, so of two
        // concurrent retries one updates and the other matches no row.
        const row = await client.kbDocument.update({
          where: { id, status: 'failed' },
          data: {
            fileName: d.fileName,
            sizeBytes: d.sizeBytes,
            sha256: d.sha256,
            status: 'processing',
            error: null,
            extractedText: null,
            pageCount: null,
            tokenCount: null,
            updatedAt: d.now,
          },
        });
        return ok(toKbDocument(row));
      } catch (e) {
        // The unique index on sha256 fires only for a different document; the same row may keep its own.
        if (hasPrismaCode(e, 'P2002')) return err('knowledge.duplicate');
        if (hasPrismaCode(e, 'P2025')) {
          const found = await client.kbDocument.findUnique({ where: { id }, select: { id: true } });
          return err(found === null ? 'knowledge.not_found' : 'knowledge.not_retryable');
        }
        throw e;
      }
    },

    async markReady(id, d) {
      const { count } = await client.kbDocument.updateMany({
        where: { id },
        data: {
          status: 'ready',
          error: null,
          extractedText: d.text,
          pageCount: d.pageCount,
          tokenCount: d.tokenCount,
          updatedAt: d.now,
        },
      });
      return count === 1;
    },

    async markFailed(id, d) {
      const { count } = await client.kbDocument.updateMany({
        where: { id },
        data: {
          status: 'failed',
          error: d.code,
          pageCount: d.pageCount,
          tokenCount: d.tokenCount,
          updatedAt: d.now,
        },
      });
      return count === 1;
    },

    // Recovery of a row whose extraction was stopped with its function (data-model rule 13). One
    // UPDATE: a concurrent caller waits for the row lock, then no longer sees `processing`.
    async failStuckProcessing(staleBefore, now) {
      const rows = await client.$queryRaw<{ id: string }[]>`
        UPDATE "KbDocument"
        SET "status" = 'failed', "error" = 'knowledge.extract_interrupted', "updatedAt" = ${now}::timestamptz
        WHERE "status" = 'processing' AND "updatedAt" < ${staleBefore}::timestamptz
        RETURNING "id"`;
      return rows.map((r) => r.id as DocumentId); // brand: ids returned by the KbDocument table
    },

    async delete(id) {
      const { count } = await client.kbDocument.deleteMany({ where: { id } });
      return count === 1;
    },

    async sumReadyTokens() {
      const r = await client.kbDocument.aggregate({
        where: { status: 'ready' },
        _sum: { tokenCount: true },
      });
      return r._sum.tokenCount ?? 0;
    },
  };
}
