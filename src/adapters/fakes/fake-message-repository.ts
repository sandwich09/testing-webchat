import type { ContactId, EventCode, Message, MessageId, Seq } from '@/core/domain';
import type { MessageRepository, NewMessage } from '@/core/ports';
import { FakeChangeSequence, type FakeContactRepository } from './fake-contact-repository';

const bySeq = (a: Message, b: Message): number => (a.seq < b.seq ? -1 : a.seq > b.seq ? 1 : 0);
const byUpdatedSeq = (a: Message, b: Message): number =>
  a.updatedSeq < b.updatedSeq ? -1 : a.updatedSeq > b.updatedSeq ? 1 : 0;
const copy = (m: Message): Message => structuredClone(m);

/**
 * In-memory MessageRepository. Build it with `{ contacts }` to share the change sequence with
 * that FakeContactRepository (like `change_seq`) and to enforce the Message → Contact foreign key.
 * Every method body runs without an `await`, so each call is atomic like one SQL statement.
 */
export class FakeMessageRepository implements MessageRepository {
  readonly sequence: FakeChangeSequence;
  private readonly contacts: FakeContactRepository | null;
  private readonly rows = new Map<MessageId, Message>();

  constructor(options: { contacts?: FakeContactRepository; sequence?: FakeChangeSequence } = {}) {
    this.contacts = options.contacts ?? null;
    this.sequence = options.contacts?.sequence ?? options.sequence ?? new FakeChangeSequence();
  }

  private forContact(contactId: ContactId): Message[] {
    return [...this.rows.values()].filter((m) => m.contactId === contactId).sort(bySeq);
  }

  /** The row that blocks an insert: same primary key, or same non-null lineMessageId. */
  private conflicting(m: NewMessage): Message | undefined {
    const byId = this.rows.get(m.id);
    if (byId) return byId;
    if (m.lineMessageId === null) return undefined;
    return [...this.rows.values()].find((r) => r.lineMessageId === m.lineMessageId);
  }

  /** Plain INSERT. Throws on a foreign-key or unique violation, like the database. */
  private insert(m: NewMessage): Message {
    if (this.contacts && !this.contacts.peek(m.contactId)) {
      throw new Error('FakeMessageRepository: contactId does not exist (foreign key)');
    }
    if (this.conflicting(m)) {
      throw new Error('FakeMessageRepository: duplicate id or lineMessageId (unique)');
    }
    const seq = this.sequence.next();
    const row: Message = { ...structuredClone(m), seq, updatedSeq: seq };
    this.rows.set(row.id, row);
    return row;
  }

  private update(id: MessageId, change: (m: Message) => void): Message | null {
    const row = this.rows.get(id);
    if (!row) return null;
    change(row);
    row.updatedSeq = this.sequence.next();
    return row;
  }

  private insertIfAbsent(
    m: NewMessage,
    existing: () => Message | undefined,
  ): Promise<{ inserted: boolean; message: Message }> {
    // INSERT ... ON CONFLICT DO NOTHING skips on any unique key, then the row is read back.
    if (this.conflicting(m)) {
      const found = existing();
      if (!found) {
        return Promise.reject(new Error('FakeMessageRepository: conflict on another unique key'));
      }
      return Promise.resolve({ inserted: false, message: copy(found) });
    }
    try {
      return Promise.resolve({ inserted: true, message: copy(this.insert(m)) });
    } catch (e) {
      return Promise.reject(e instanceof Error ? e : new Error(String(e)));
    }
  }

  readonly findById: MessageRepository['findById'] = (id) => {
    const row = this.rows.get(id);
    return Promise.resolve(row ? copy(row) : null);
  };

  readonly insertInboundIfAbsent: MessageRepository['insertInboundIfAbsent'] = (m) =>
    this.insertIfAbsent(m, () =>
      m.lineMessageId === null
        ? this.rows.get(m.id)
        : [...this.rows.values()].find((r) => r.lineMessageId === m.lineMessageId),
    );

  readonly insertOutboundIfAbsent: MessageRepository['insertOutboundIfAbsent'] = (m) =>
    this.insertIfAbsent(m, () => this.rows.get(m.id));

  readonly insertEvent: MessageRepository['insertEvent'] = (m) => {
    try {
      return Promise.resolve(copy(this.insert(m)));
    } catch (e) {
      return Promise.reject(e instanceof Error ? e : new Error(String(e)));
    }
  };

  readonly markSent: MessageRepository['markSent'] = (id, at) => {
    const row = this.update(id, (m) => {
      m.deliveryStatus = 'sent';
      m.deliveryError = null;
      m.sentAt = at;
    });
    return row
      ? Promise.resolve(copy(row))
      : Promise.reject(new Error('FakeMessageRepository.markSent: message does not exist'));
  };

  readonly markFailed: MessageRepository['markFailed'] = (id, code) => {
    const row = this.update(id, (m) => {
      m.deliveryStatus = 'failed';
      m.deliveryError = code;
    });
    return row
      ? Promise.resolve(copy(row))
      : Promise.reject(new Error('FakeMessageRepository.markFailed: message does not exist'));
  };

  readonly markPendingIfFailed: MessageRepository['markPendingIfFailed'] = (id) => {
    if (this.rows.get(id)?.deliveryStatus !== 'failed') return Promise.resolve(false);
    this.update(id, (m) => {
      m.deliveryStatus = 'pending';
      m.deliveryError = null;
    });
    return Promise.resolve(true);
  };

  readonly setMediaReady: MessageRepository['setMediaReady'] = (id, mediaUrl, previewUrl) => {
    if (this.rows.get(id)?.mediaStatus !== 'pending') return Promise.resolve(false);
    this.update(id, (m) => {
      m.mediaStatus = 'ready';
      m.mediaUrl = mediaUrl;
      m.previewUrl = previewUrl;
    });
    return Promise.resolve(true);
  };

  readonly setMediaStatus: MessageRepository['setMediaStatus'] = (id, status) => {
    if (this.rows.get(id)?.mediaStatus !== 'pending') return Promise.resolve(false);
    this.update(id, (m) => {
      m.mediaStatus = status;
    });
    return Promise.resolve(true);
  };

  readonly latestInbound: MessageRepository['latestInbound'] = (contactId) => {
    const row = this.forContact(contactId)
      .filter((m) => m.direction === 'inbound')
      .at(-1);
    return Promise.resolve(row ? copy(row) : null);
  };

  readonly recentForAi: MessageRepository['recentForAi'] = (contactId, limit) => {
    const rows = this.forContact(contactId).filter((m) => m.type !== 'event');
    return Promise.resolve(rows.slice(Math.max(0, rows.length - limit)).map(copy));
  };

  readonly listLatest: MessageRepository['listLatest'] = (contactId, limit) => {
    const rows = this.forContact(contactId);
    const start = Math.max(0, rows.length - limit);
    return Promise.resolve({ messages: rows.slice(start).map(copy), hasOlder: start > 0 });
  };

  readonly listBefore: MessageRepository['listBefore'] = (contactId, beforeSeq, limit) => {
    const rows = this.forContact(contactId).filter((m) => m.seq < beforeSeq);
    const start = Math.max(0, rows.length - limit);
    return Promise.resolve({ messages: rows.slice(start).map(copy), hasOlder: start > 0 });
  };

  readonly listChangedAfter: MessageRepository['listChangedAfter'] = (contactId, after, limit) => {
    const rows = this.forContact(contactId)
      .filter((m) => m.updatedSeq > after)
      .sort(byUpdatedSeq);
    return Promise.resolve({
      messages: rows.slice(0, limit).map(copy),
      hasMore: rows.length > limit,
    });
  };

  readonly maxUpdatedSeq: MessageRepository['maxUpdatedSeq'] = (contactId) => {
    let max = 0n;
    for (const m of this.forContact(contactId)) if (m.updatedSeq > max) max = m.updatedSeq;
    return Promise.resolve(max as Seq); // brand: max of Seq values, or 0n when there is none
  };

  readonly countEventsByCode: MessageRepository['countEventsByCode'] = (range) => {
    const counts: Partial<Record<EventCode, number>> = {};
    for (const m of this.rows.values()) {
      const t = m.createdAt.getTime();
      if (m.type !== 'event' || m.eventCode === null) continue;
      if (t < range.from.getTime() || t >= range.to.getTime()) continue;
      counts[m.eventCode] = (counts[m.eventCode] ?? 0) + 1;
    }
    return Promise.resolve(counts);
  };

  readonly countForContact: MessageRepository['countForContact'] = (contactId) => {
    const rows = this.forContact(contactId).filter((m) => m.type !== 'event');
    return Promise.resolve({
      total: rows.length,
      byAi: rows.filter((m) => m.author === 'ai').length,
    });
  };
}
