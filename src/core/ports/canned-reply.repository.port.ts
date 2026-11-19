import type { CannedReply, CannedReplyId } from '@/core/domain';

export interface CannedReplyRepository {
  /** Ordered by sortOrder then createdAt. */
  list(): Promise<CannedReply[]>;
  findById(id: CannedReplyId): Promise<CannedReply | null>;
  count(): Promise<number>;
  /** Returns 0 when empty. */
  maxSortOrder(): Promise<number>;
  create(c: CannedReply): Promise<void>;
  update(
    id: CannedReplyId,
    p: Partial<Pick<CannedReply, 'title' | 'text' | 'sortOrder'>> & { now: Date },
  ): Promise<CannedReply | null>;
  delete(id: CannedReplyId): Promise<boolean>;
}
