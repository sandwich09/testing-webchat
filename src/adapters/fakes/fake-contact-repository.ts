import type { Contact, ContactId, Seq } from '@/core/domain';
import type { ContactListCursor, ContactRepository } from '@/core/ports';

/**
 * In-memory stand-in for the database sequence `change_seq`. One instance is shared by the
 * Contact and Message fakes so `Message.seq`, `Message.updatedSeq` and `Contact.updatedSeq`
 * come from the same counter, as in docs/architecture/data-model.md.
 */
export class FakeChangeSequence {
  private last = 0n;

  next(): Seq {
    this.last += 1n;
    return this.last as Seq; // brand: the counter is the only source of Seq values here
  }
}

const sortAtOf = (c: Contact): Date => c.lastMessageAt ?? c.createdAt;

/** Newest first by coalesce(lastMessageAt, createdAt), the latest inbound time, then id. */
const compareForList = (a: Contact, b: Contact): number => {
  const byTime = sortAtOf(b).getTime() - sortAtOf(a).getTime();
  if (byTime !== 0) return byTime;
  if (a.id === b.id) return 0;
  return a.id < b.id ? 1 : -1;
};

const isAfterCursor = (c: Contact, cursor: ContactListCursor): boolean => {
  const t = sortAtOf(c).getTime();
  const ct = cursor.sortAt.getTime();
  return t < ct || (t === ct && c.id < cursor.id);
};

/**
 * Every method body runs without an `await`, so a call is atomic with respect to other calls,
 * like a single SQL statement. Concurrent callers (Promise.all) therefore see one winner for the
 * conditional writes, the same as the conditional UPDATE in Postgres.
 */
export class FakeContactRepository implements ContactRepository {
  /** Shared with FakeMessageRepository when it is built with `{ contacts }`. */
  readonly sequence: FakeChangeSequence;
  private readonly rows = new Map<ContactId, Contact>();

  constructor(options: { sequence?: FakeChangeSequence } = {}) {
    this.sequence = options.sequence ?? new FakeChangeSequence();
  }

  /** Synchronous read for other fakes (foreign keys, joins). Returns a copy. */
  peek(id: ContactId): Contact | null {
    const row = this.rows.get(id);
    return row ? structuredClone(row) : null;
  }

  /** Applies `change` to an existing row and gives it a new updatedSeq. Missing rows are a no-op. */
  private write(id: ContactId, change: (c: Contact) => void): void {
    const row = this.rows.get(id);
    if (!row) return;
    change(row);
    row.updatedSeq = this.sequence.next();
  }

  readonly findById: ContactRepository['findById'] = (id) => Promise.resolve(this.peek(id));

  readonly ensure: ContactRepository['ensure'] = ({ id, lineUserId, now }) => {
    for (const row of this.rows.values()) {
      if (row.lineUserId === lineUserId) {
        return Promise.resolve({ contact: structuredClone(row), created: false });
      }
    }
    if (this.rows.has(id)) {
      return Promise.reject(new Error('FakeContactRepository.ensure: id already used'));
    }
    const contact: Contact = {
      id,
      lineUserId,
      displayName: null,
      pictureUrl: null,
      followStatus: 'following',
      followedAt: null,
      aiEnabled: false,
      needsAdmin: false,
      needsAdminReason: null,
      aiState: 'idle',
      aiStateAt: null,
      unreadCount: 0,
      lastMessageAt: null,
      lastMessagePreview: null,
      lastMessageBy: null,
      lastMessageType: null,
      replyToken: null,
      replyTokenExpiresAt: null,
      createdAt: now,
      updatedSeq: this.sequence.next(),
    };
    this.rows.set(id, contact);
    return Promise.resolve({ contact: structuredClone(contact), created: true });
  };

  readonly updateProfile: ContactRepository['updateProfile'] = (id, p) => {
    this.write(id, (c) => {
      c.displayName = p.displayName;
      c.pictureUrl = p.pictureUrl;
    });
    return Promise.resolve();
  };

  /** `Contact.followStatusAt`, a column the domain model does not carry. */
  private readonly followStatusAt = new Map<ContactId, number>();

  readonly setFollowStatus: ContactRepository['setFollowStatus'] = (id, status, at) => {
    const c = this.rows.get(id);
    const statusAt = this.followStatusAt.get(id);
    const changes =
      status === 'following'
        ? c?.followStatus === 'unfollowed' || c?.followedAt === null
        : c?.followStatus === 'following';
    if (c === undefined || !changes || (statusAt !== undefined && statusAt > at.getTime())) {
      return Promise.resolve(false);
    }
    this.followStatusAt.set(id, at.getTime());
    this.write(id, (row) => {
      row.followStatus = status;
      if (status === 'following') {
        row.followedAt = at;
      } else {
        row.replyToken = null;
        row.replyTokenExpiresAt = null;
      }
    });
    return Promise.resolve(true);
  };

  readonly recordInbound: ContactRepository['recordInbound'] = (id, i) => {
    this.write(id, (c) => {
      c.unreadCount += 1;
      // lastMessageAt (the latest inbound time) never goes backwards when events arrive out of order.
      if (c.lastMessageAt === null || c.lastMessageAt.getTime() <= i.at.getTime()) {
        c.lastMessageAt = i.at;
        c.lastMessagePreview = i.preview.text;
        c.lastMessageType = i.preview.type;
        c.lastMessageBy = 'customer';
      }
      const newer =
        i.replyToken !== null &&
        i.replyTokenExpiresAt !== null &&
        (c.replyTokenExpiresAt === null ||
          c.replyTokenExpiresAt.getTime() < i.replyTokenExpiresAt.getTime());
      if (newer) {
        c.replyToken = i.replyToken;
        c.replyTokenExpiresAt = i.replyTokenExpiresAt;
      }
    });
    return Promise.resolve();
  };

  readonly recordOutbound: ContactRepository['recordOutbound'] = (id, o) => {
    // Only the preview: lastMessageAt is the latest inbound time, the sort key of the list.
    this.write(id, (c) => {
      c.lastMessagePreview = o.preview.text;
      c.lastMessageType = o.preview.type;
      c.lastMessageBy = o.by;
    });
    return Promise.resolve();
  };

  readonly consumeReplyToken: ContactRepository['consumeReplyToken'] = (id, replyToken) => {
    const row = this.rows.get(id);
    if (row?.replyToken !== replyToken) return Promise.resolve(false);
    this.write(id, (c) => {
      c.replyToken = null;
      c.replyTokenExpiresAt = null;
    });
    return Promise.resolve(true);
  };

  readonly setAiEnabled: ContactRepository['setAiEnabled'] = (id, enabled) => {
    this.write(id, (c) => {
      c.aiEnabled = enabled;
    });
    return Promise.resolve();
  };

  readonly setNeedsAdmin: ContactRepository['setNeedsAdmin'] = (id, reason) => {
    this.write(id, (c) => {
      c.needsAdmin = true;
      c.needsAdminReason = reason;
    });
    return Promise.resolve();
  };

  readonly clearNeedsAdmin: ContactRepository['clearNeedsAdmin'] = (id) => {
    this.write(id, (c) => {
      c.needsAdmin = false;
      c.needsAdminReason = null;
    });
    return Promise.resolve();
  };

  readonly markRead: ContactRepository['markRead'] = (id) => {
    this.write(id, (c) => {
      c.unreadCount = 0;
    });
    return Promise.resolve();
  };

  readonly tryAcquireAiLock: ContactRepository['tryAcquireAiLock'] = (id, now) => {
    const row = this.rows.get(id);
    if (row?.aiState !== 'idle') return Promise.resolve(false);
    this.write(id, (c) => {
      c.aiState = 'replying';
      c.aiStateAt = now;
    });
    return Promise.resolve(true);
  };

  readonly releaseAiLock: ContactRepository['releaseAiLock'] = (id) => {
    this.write(id, (c) => {
      c.aiState = 'idle';
      c.aiStateAt = null;
    });
    return Promise.resolve();
  };

  readonly recoverStuckAiStates: ContactRepository['recoverStuckAiStates'] = (staleBefore) => {
    const recovered: ContactId[] = [];
    for (const row of this.rows.values()) {
      if (
        row.aiState === 'replying' &&
        row.aiStateAt !== null &&
        row.aiStateAt.getTime() < staleBefore.getTime()
      ) {
        this.write(row.id, (c) => {
          c.aiState = 'idle';
          c.aiStateAt = null;
          c.needsAdmin = true;
          c.needsAdminReason = 'ai_timeout';
        });
        recovered.push(row.id);
      }
    }
    return Promise.resolve(recovered);
  };

  readonly list: ContactRepository['list'] = ({ filter, search, before, limit }) => {
    const needle = search?.toLowerCase() ?? null;
    const matching = [...this.rows.values()]
      .filter((c) => {
        switch (filter) {
          case 'all':
            return true;
          case 'unread':
            return c.unreadCount > 0;
          case 'needs_admin':
            return c.needsAdmin;
        }
      })
      .filter((c) => needle === null || (c.displayName?.toLowerCase().includes(needle) ?? false))
      .filter((c) => before === null || isAfterCursor(c, before))
      .sort(compareForList);
    const page = matching.slice(0, limit);
    const last = page.at(-1);
    const next = matching.length > limit && last ? { sortAt: sortAtOf(last), id: last.id } : null;
    return Promise.resolve({ contacts: page.map((c) => structuredClone(c)), next });
  };

  readonly listChangedAfter: ContactRepository['listChangedAfter'] = (after, limit) => {
    const changed = [...this.rows.values()]
      .filter((c) => c.updatedSeq > after)
      .sort((a, b) => (a.updatedSeq < b.updatedSeq ? -1 : 1));
    return Promise.resolve({
      contacts: changed.slice(0, limit).map((c) => structuredClone(c)),
      hasMore: changed.length > limit,
    });
  };

  readonly maxUpdatedSeq: ContactRepository['maxUpdatedSeq'] = () => {
    let max = 0n;
    for (const row of this.rows.values()) if (row.updatedSeq > max) max = row.updatedSeq;
    return Promise.resolve(max as Seq); // brand: max of Seq values, or 0n for an empty table
  };

  readonly countByFilter: ContactRepository['countByFilter'] = () => {
    const rows = [...this.rows.values()];
    return Promise.resolve({
      all: rows.length,
      unread: rows.filter((c) => c.unreadCount > 0).length,
      needsAdmin: rows.filter((c) => c.needsAdmin).length,
    });
  };
}
