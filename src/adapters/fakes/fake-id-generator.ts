import type { ContactId, DocumentId, MessageId, NoteId, UsageId } from '@/core/domain';
import type { Clock, IdGenerator } from '@/core/ports';

const hex = (value: number | bigint, width: number): string =>
  value.toString(16).padStart(width, '0').slice(-width);

/**
 * Deterministic UUIDv7: 48-bit time from the clock (or a counter when none is given), then a
 * counter in the random bits. Ids from one instance are unique and sort in call order.
 */
export class FakeIdGenerator implements IdGenerator {
  private counter = 0;
  private readonly clock: Clock | null;

  constructor(clock: Clock | null = null) {
    this.clock = clock;
  }

  contactId(): ContactId {
    return this.uuid() as ContactId;
  }

  messageId(): MessageId {
    return this.uuid() as MessageId;
  }

  documentId(): DocumentId {
    return this.uuid() as DocumentId;
  }

  usageId(): UsageId {
    return this.uuid() as UsageId;
  }

  noteId(): NoteId {
    return this.uuid() as NoteId;
  }

  requestId(): string {
    return `req-${String(++this.counter)}`;
  }

  /** 128 bits (22 base64url characters) built from a counter: unique, not secret. */
  randomToken(): string {
    const bytes = Buffer.alloc(16, 0xa5);
    bytes.writeBigUInt64BE(BigInt(++this.counter), 8);
    return bytes.toString('base64url');
  }

  private uuid(): string {
    const n = ++this.counter;
    // Without a clock the time moves one millisecond per id, so ids still sort in call order.
    const time = this.clock ? this.clock.now().getTime() : 1_763_424_000_000 + n;
    const t = hex(time, 12);
    const rest = hex(BigInt(n), 18);
    return [
      t.slice(0, 8),
      t.slice(8, 12),
      `7${rest.slice(0, 3)}`,
      `8${rest.slice(3, 6)}`,
      rest.slice(6, 18),
    ].join('-');
  }
}
