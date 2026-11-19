import type { CannedReply, CannedReplyId } from '@/core/domain';
import type { CannedReplyRepository } from '@/core/ports';

const compare = (a: CannedReply, b: CannedReply): number =>
  a.sortOrder - b.sortOrder ||
  a.createdAt.getTime() - b.createdAt.getTime() ||
  (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** In-memory CannedReplyRepository. */
export class FakeCannedReplyRepository implements CannedReplyRepository {
  private readonly rows = new Map<CannedReplyId, CannedReply>();

  readonly list: CannedReplyRepository['list'] = () =>
    Promise.resolve([...this.rows.values()].sort(compare).map((c) => structuredClone(c)));

  readonly findById: CannedReplyRepository['findById'] = (id) => {
    const row = this.rows.get(id);
    return Promise.resolve(row ? structuredClone(row) : null);
  };

  readonly count: CannedReplyRepository['count'] = () => Promise.resolve(this.rows.size);

  readonly maxSortOrder: CannedReplyRepository['maxSortOrder'] = () => {
    let max = 0;
    let any = false;
    for (const c of this.rows.values()) {
      max = any ? Math.max(max, c.sortOrder) : c.sortOrder;
      any = true;
    }
    return Promise.resolve(max);
  };

  readonly create: CannedReplyRepository['create'] = (c) => {
    if (this.rows.has(c.id)) {
      return Promise.reject(new Error('FakeCannedReplyRepository.create: id already used'));
    }
    this.rows.set(c.id, structuredClone(c));
    return Promise.resolve();
  };

  readonly update: CannedReplyRepository['update'] = (id, p) => {
    const row = this.rows.get(id);
    if (!row) return Promise.resolve(null);
    if (p.title !== undefined) row.title = p.title;
    if (p.text !== undefined) row.text = p.text;
    if (p.sortOrder !== undefined) row.sortOrder = p.sortOrder;
    row.updatedAt = p.now;
    return Promise.resolve(structuredClone(row));
  };

  readonly delete: CannedReplyRepository['delete'] = (id) => Promise.resolve(this.rows.delete(id));
}
