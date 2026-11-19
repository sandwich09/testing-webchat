import type { CannedReply, CannedReplyId } from '@/core/domain';
import type { CannedReply as CannedReplyRow } from './generated/client';

export function toCannedReply(row: CannedReplyRow): CannedReply {
  return {
    id: row.id as CannedReplyId, // brand: UUIDv7 made by IdGenerator
    title: row.title,
    text: row.text,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
