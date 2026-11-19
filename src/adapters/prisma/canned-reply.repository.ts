import type { CannedReplyRepository } from '@/core/ports';
import type { PrismaClient } from './prisma-client';
import { toCannedReply } from './canned-reply.mapper';

export function createCannedReplyRepository(client: PrismaClient): CannedReplyRepository {
  return {
    async list() {
      const rows = await client.cannedReply.findMany({
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      });
      return rows.map(toCannedReply);
    },

    async findById(id) {
      const row = await client.cannedReply.findUnique({ where: { id } });
      return row === null ? null : toCannedReply(row);
    },

    count() {
      return client.cannedReply.count();
    },

    async maxSortOrder() {
      const r = await client.cannedReply.aggregate({ _max: { sortOrder: true } });
      return r._max.sortOrder ?? 0;
    },

    async create(c) {
      await client.cannedReply.create({
        data: {
          id: c.id,
          title: c.title,
          text: c.text,
          sortOrder: c.sortOrder,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
        },
      });
    },

    async update(id, p) {
      const { count } = await client.cannedReply.updateMany({
        where: { id },
        data: { title: p.title, text: p.text, sortOrder: p.sortOrder, updatedAt: p.now },
      });
      if (count === 0) return null;
      const row = await client.cannedReply.findUnique({ where: { id } });
      return row === null ? null : toCannedReply(row);
    },

    async delete(id) {
      const { count } = await client.cannedReply.deleteMany({ where: { id } });
      return count === 1;
    },
  };
}
