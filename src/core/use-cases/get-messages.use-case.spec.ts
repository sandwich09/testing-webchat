import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MEDIA_STUCK_AFTER_MS,
  MESSAGE_PAGE_LIMIT,
  POLL_PAGE_LIMIT,
  SEND_STUCK_AFTER_MS,
  type ContactId,
  type LineMessageId,
  type LineUserId,
  type Message,
  type Seq,
} from '@/core/domain';
import {
  FakeClock,
  FakeContactRepository,
  FakeIdGenerator,
  FakeLogger,
  FakeMessageRepository,
} from '@/adapters/fakes';
import { makeGetMessages, type GetMessagesOutput } from './get-messages.use-case';
import type { RequestContext, UseCaseConfig } from './types';

const ctx: RequestContext = { requestId: 'req-test', clientIp: null };

describe('GetMessages', () => {
  let clock: FakeClock;
  let ids: FakeIdGenerator;
  let contacts: FakeContactRepository;
  let messages: FakeMessageRepository;
  let logger: FakeLogger;
  let getMessages: ReturnType<typeof makeGetMessages>;
  let contactId: ContactId;
  let n = 0;

  const newContact = async (): Promise<ContactId> => {
    n += 1;
    const { contact } = await contacts.ensure({
      id: ids.contactId(),
      lineUserId: `U-${String(n)}` as LineUserId, // brand: test id
      now: clock.now(),
    });
    return contact.id;
  };

  const addText = async (cid: ContactId, text: string): Promise<Message> => {
    const r = await messages.insertOutboundIfAbsent({
      id: ids.messageId(),
      contactId: cid,
      direction: 'outbound',
      author: 'admin',
      type: 'text',
      text,
      mediaUrl: null,
      previewUrl: null,
      mediaStatus: null,
      stickerPackageId: null,
      stickerId: null,
      otherKind: null,
      eventCode: null,
      lineMessageId: null,
      deliveryStatus: 'pending',
      deliveryError: null,
      retryKey: null,
      createdAt: clock.now(),
      sentAt: null,
    });
    return r.message;
  };

  const addEvent = (cid: ContactId): Promise<Message> =>
    messages.insertEvent({
      id: ids.messageId(),
      contactId: cid,
      direction: 'internal',
      author: 'system',
      type: 'event',
      text: null,
      mediaUrl: null,
      previewUrl: null,
      mediaStatus: null,
      stickerPackageId: null,
      stickerId: null,
      otherKind: null,
      eventCode: 'handoff.ai_other',
      lineMessageId: null,
      deliveryStatus: null,
      deliveryError: null,
      retryKey: null,
      createdAt: clock.now(),
      sentAt: null,
    });

  const run = async (input: Parameters<typeof getMessages>[0]): Promise<GetMessagesOutput> => {
    const r = await getMessages(input, ctx);
    if (!r.ok) throw new Error('unexpected error');
    return r.value;
  };

  beforeEach(async () => {
    clock = new FakeClock(new Date('2026-11-18T03:00:00.000Z'));
    ids = new FakeIdGenerator(clock);
    contacts = new FakeContactRepository();
    messages = new FakeMessageRepository({ contacts });
    logger = new FakeLogger(clock);
    getMessages = makeGetMessages({ contacts, messages, clock, logger }, {} as UseCaseConfig); // brand: config unused
    n = 0;
    contactId = await newContact();
  });

  describe('quotes', () => {
    const addQuoting = async (quoted: string): Promise<Message> =>
      (
        await messages.insertInboundIfAbsent({
          id: ids.messageId(),
          contactId,
          direction: 'inbound',
          author: 'customer',
          type: 'text',
          text: 'ตอบอันนี้',
          mediaUrl: null,
          previewUrl: null,
          mediaStatus: null,
          stickerPackageId: null,
          stickerId: null,
          otherKind: null,
          eventCode: null,
          lineMessageId: `line-${ids.messageId()}` as LineMessageId, // brand: test id
          quotedLineMessageId: quoted as LineMessageId, // brand: test id
          deliveryStatus: null,
          deliveryError: null,
          retryKey: null,
          createdAt: clock.now(),
          sentAt: null,
        })
      ).message;

    it('reads the quoted messages of every mode in one query, known ones only', async () => {
      const reply = await addText(contactId, 'ข้อความที่ถูกอ้าง');
      await messages.markSent(reply.id, clock.now(), ['L-1' as LineMessageId]); // brand: test id
      await addQuoting('L-1');
      await addQuoting('L-unknown');
      const spy = vi.spyOn(messages, 'findByLineIds');

      const latest = await run({ contactId, mode: { kind: 'latest' } });
      expect(latest.quoted.map((m) => m.id)).toEqual([reply.id]);
      const changes = await run({
        contactId,
        mode: { kind: 'changes', afterUpdatedSeq: 0n as Seq }, // brand: Seq zero
      });
      expect(changes.quoted.map((m) => m.id)).toEqual([reply.id]);
      const before = await run({
        contactId,
        mode: { kind: 'before', beforeSeq: 999n as Seq }, // brand: test seq
      });
      expect(before.quoted.map((m) => m.id)).toEqual([reply.id]);
      expect(spy.mock.calls.map(([, lineIds]) => lineIds)).toEqual([
        ['L-1', 'L-unknown'],
        ['L-1', 'L-unknown'],
        ['L-1', 'L-unknown'],
      ]);
    });

    it('asks for nothing when no message of the page quotes', async () => {
      await addText(contactId, 'a');
      expect((await run({ contactId, mode: { kind: 'latest' } })).quoted).toEqual([]);
    });
  });

  it('latest returns the newest page oldest first with hasOlder and highWater', async () => {
    const all: Message[] = [];
    for (let i = 0; i < MESSAGE_PAGE_LIMIT + 3; i += 1)
      all.push(await addText(contactId, `m${String(i)}`));

    const r = await run({ contactId, mode: { kind: 'latest' } });

    expect(r.messages).toHaveLength(MESSAGE_PAGE_LIMIT);
    expect(r.messages.map((m) => m.id)).toEqual(all.slice(3).map((m) => m.id));
    expect(r.hasOlder).toBe(true);
    expect(r.hasMore).toBe(false);
    expect(r.highWater).toBe(all.at(-1)?.updatedSeq);
  });

  it('latest reports hasOlder false and includes event lines in position', async () => {
    const a = await addText(contactId, 'a');
    const ev = await addEvent(contactId);
    const b = await addText(contactId, 'b');

    const r = await run({ contactId, mode: { kind: 'latest' } });

    expect(r.hasOlder).toBe(false);
    expect(r.messages.map((m) => m.id)).toEqual([a.id, ev.id, b.id]);
  });

  it('latest on an empty chat returns highWater 0', async () => {
    const r = await run({ contactId, mode: { kind: 'latest' } });
    expect(r).toEqual({ messages: [], quoted: [], hasOlder: false, hasMore: false, highWater: 0n });
  });

  it('before excludes beforeSeq, pages older rows and returns highWater 0', async () => {
    const all: Message[] = [];
    for (let i = 0; i < MESSAGE_PAGE_LIMIT + 2; i += 1)
      all.push(await addText(contactId, `m${String(i)}`));
    const oldestShown = all[2] as Message; // first of the latest page

    const r = await run({ contactId, mode: { kind: 'before', beforeSeq: oldestShown.seq } });

    expect(r.messages.map((m) => m.id)).toEqual([all[0]?.id, all[1]?.id]);
    expect(r.hasOlder).toBe(false);
    expect(r.hasMore).toBe(false);
    expect(r.highWater).toBe(0n);
  });

  it('changes returns rows whose status changed even when seq is below the cursor', async () => {
    const a = await addText(contactId, 'a');
    await addText(contactId, 'b');
    const cursor = await messages.maxUpdatedSeq(contactId);
    await messages.markSent(a.id, clock.now(), []);

    const r = await run({ contactId, mode: { kind: 'changes', afterUpdatedSeq: cursor } });

    expect(r.messages.map((m) => m.id)).toEqual([a.id]);
    expect(a.seq).toBeLessThan(cursor);
    expect(r.hasOlder).toBeNull();
    expect(r.hasMore).toBe(false);
    expect(r.highWater).toBe(r.messages[0]?.updatedSeq);
  });

  it('changes with nothing new keeps the cursor', async () => {
    await addText(contactId, 'a');
    const cursor = await messages.maxUpdatedSeq(contactId);

    const r = await run({ contactId, mode: { kind: 'changes', afterUpdatedSeq: cursor } });

    expect(r).toEqual({
      messages: [],
      quoted: [],
      hasOlder: null,
      hasMore: false,
      highWater: cursor,
    });
  });

  it('changes orders by updatedSeq and limits to POLL_PAGE_LIMIT with hasMore', async () => {
    for (let i = 0; i < POLL_PAGE_LIMIT + 1; i += 1) await addText(contactId, `m${String(i)}`);

    const r = await run({ contactId, mode: { kind: 'changes', afterUpdatedSeq: 0n as Seq } }); // brand: test cursor

    expect(r.messages).toHaveLength(POLL_PAGE_LIMIT);
    expect(r.hasMore).toBe(true);
    expect(r.highWater).toBe(r.messages.at(-1)?.updatedSeq);
    const seqs = r.messages.map((m) => m.updatedSeq);
    expect(seqs).toEqual([...seqs].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0)));
  });

  it('never mixes in another contact', async () => {
    const other = await newContact();
    await addText(other, 'ai_other');
    const mine = await addText(contactId, 'mine');
    const modes = [
      { kind: 'latest' },
      { kind: 'before', beforeSeq: 1_000_000n as Seq }, // brand: test cursor
      { kind: 'changes', afterUpdatedSeq: 0n as Seq }, // brand: test cursor
    ] as const;

    for (const mode of modes) {
      const r = await run({ contactId, mode });
      expect(r.messages.map((m) => m.id)).toEqual([mine.id]);
    }
  });

  it('returns contact.not_found for an unknown contact in every mode', async () => {
    const unknown = ids.contactId();
    for (const mode of [
      { kind: 'latest' },
      { kind: 'before', beforeSeq: 5n as Seq }, // brand: test cursor
      { kind: 'changes', afterUpdatedSeq: 0n as Seq }, // brand: test cursor
    ] as const) {
      const r = await getMessages({ contactId: unknown, mode }, ctx);
      expect(r).toMatchObject({ ok: false, error: { code: 'contact.not_found' } });
    }
  });

  describe('recovery of rows left by a stopped function', () => {
    const addImage = async (cid: ContactId): Promise<Message> =>
      (
        await messages.insertInboundIfAbsent({
          id: ids.messageId(),
          contactId: cid,
          direction: 'inbound',
          author: 'customer',
          type: 'image',
          text: null,
          mediaUrl: null,
          previewUrl: null,
          mediaStatus: 'pending',
          stickerPackageId: null,
          stickerId: null,
          otherKind: null,
          eventCode: null,
          lineMessageId: null,
          deliveryStatus: null,
          deliveryError: null,
          retryKey: null,
          createdAt: clock.now(),
          sentAt: null,
        })
      ).message;

    it('fails media pending longer than MEDIA_STUCK_AFTER_MS and shows it in the changes poll', async () => {
      const image = await addImage(contactId);
      const before = await run({ contactId, mode: { kind: 'latest' } });
      clock.advance(MEDIA_STUCK_AFTER_MS + 1);

      const r = await run({
        contactId,
        mode: { kind: 'changes', afterUpdatedSeq: before.highWater },
      });

      expect(r.messages).toEqual([
        expect.objectContaining({ id: image.id, mediaStatus: 'failed' }),
      ]);
      expect(logger.entries).toContainEqual(
        expect.objectContaining({ event: 'media.store.stuck_recovered', contactId, count: 1 }),
      );
    });

    it('fails a send pending longer than SEND_STUCK_AFTER_MS with line.send_interrupted', async () => {
      const text = await addText(contactId, 'ส่งไม่จบ');
      clock.advance(SEND_STUCK_AFTER_MS + 1);

      const r = await run({ contactId, mode: { kind: 'latest' } });

      expect(r.messages).toEqual([
        expect.objectContaining({
          id: text.id,
          deliveryStatus: 'failed',
          deliveryError: 'line.send_interrupted',
        }),
      ]);
      expect(logger.entries).toContainEqual(
        expect.objectContaining({ event: 'line.send.stuck_recovered', contactId, count: 1 }),
      );
      expect(JSON.stringify(logger.entries)).not.toContain('ส่งไม่จบ');
    });

    it('leaves rows younger than the bounds and of other contacts alone', async () => {
      const other = await newContact();
      await addImage(other);
      await addText(other, 'other');
      clock.advance(Math.max(MEDIA_STUCK_AFTER_MS, SEND_STUCK_AFTER_MS) + 1);
      const image = await addImage(contactId);
      const text = await addText(contactId, 'fresh');

      const r = await run({ contactId, mode: { kind: 'latest' } });

      expect(r.messages.map((m) => [m.id, m.mediaStatus, m.deliveryStatus])).toEqual([
        [image.id, 'pending', null],
        [text.id, null, 'pending'],
      ]);
      const otherRows = await run({ contactId: other, mode: { kind: 'latest' } });
      expect(otherRows.messages.map((m) => m.mediaStatus ?? m.deliveryStatus)).toEqual([
        'failed',
        'failed',
      ]);
      expect(logger.eventsOf()).toEqual([
        'media.store.stuck_recovered',
        'line.send.stuck_recovered',
      ]);
    });
  });
});
