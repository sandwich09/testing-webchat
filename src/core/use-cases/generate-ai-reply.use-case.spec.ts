import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  Contact,
  ContactId,
  HandoffReason,
  LineUserId,
  Message,
  MessageId,
  ModelHandoffReason,
  NanoUsd,
  TokenUsage,
} from '@/core/domain';
import {
  AI_HISTORY_LIMIT,
  AI_MAX_ROUNDS_PER_RUN,
  AI_MAX_TOKENS,
  AI_REPLY_MAX_CHARS,
  DEFAULT_AI_MODEL,
  GUARD_CONTEXT_TURNS,
  GUARD_MAX_TOKENS,
  GUARD_MODEL,
  GUARD_TIMEOUT_MS,
  LINE_LOADING_SECONDS,
  PRICE_TABLE,
  REPLY_TOKEN_USABLE_MS,
  buildGuardRulesBlock,
  err,
  formatKnowledgeBase,
  guardRefusalText,
  handoffText,
  ok,
} from '@/core/domain';
import {
  FAKE_GUARD_USAGE,
  FAKE_LINE_ACCESS_TOKEN,
  FAKE_LINE_CHANNEL_SECRET,
  FAKE_USAGE,
  FakeChatModel,
  FakeClock,
  FakeContactRepository,
  FakeIdGenerator,
  FakeKnowledgeSource,
  FakeLogger,
  FakeMessageRepository,
  FakeMessagingGateway,
  FakeSecretCipher,
  FakeSettingsRepository,
  FakeTopicGuard,
  FakeUsageRepository,
} from '@/adapters/fakes';
import type { AiReplyRunOutcome } from './generate-ai-reply.use-case';
import { makeGenerateAiReply } from './generate-ai-reply.use-case';
import type { UseCaseConfig } from './types';

// 10:00 in Bangkok.
const T0 = new Date('2026-11-18T03:00:00.000Z');
const DEBOUNCE_MS = 2000;
const TOPICS = ['มุกตลกไทย', 'มีมจากละครและซีรีส์'];
/** The refusal for the default particle ค่ะ. */
const REFUSAL = guardRefusalText('ค่ะ', TOPICS);
const CUSTOMER_NAME = 'คุณสมหญิง ใจดี';
const LINE_USER = 'U-secret-line-user' as LineUserId; // brand: test id
const REPLY_TOKEN = 'reply-token-1';

const config: UseCaseConfig = {
  appBaseUrl: 'http://localhost:3000',
  aiDebounceMs: DEBOUNCE_MS,
  aiStuckAfterMs: 180_000,
  pollIntervalMs: 3000,
  rateLimitScale: 1,
  priceTable: PRICE_TABLE,
};
const ctx = { requestId: 'req-test', clientIp: null };

/** Cost of FAKE_USAGE on Sonnet 5.5 (DEFAULT_AI_MODEL): 100 x 2000 + 20 x 10000. */
const DEFAULT_MODEL_REPLY_COST = 400_000n;
/** Cost of FAKE_GUARD_USAGE on Haiku 5.5: 400 x 100 + 20 x 500. */
const GUARD_COST = 50_000n;

const nano = (n: bigint): NanoUsd => n as NanoUsd; // brand: test amounts

describe('GenerateAiReply', () => {
  let clock: FakeClock;
  let ids: FakeIdGenerator;
  let contacts: FakeContactRepository;
  let messages: FakeMessageRepository;
  let usage: FakeUsageRepository;
  let settings: FakeSettingsRepository;
  let cipher: FakeSecretCipher;
  let gateway: FakeMessagingGateway;
  let topicGuard: FakeTopicGuard;
  let knowledgeSource: FakeKnowledgeSource;
  let chatModel: FakeChatModel;
  let logger: FakeLogger;
  let contact: Contact;

  const generate = () =>
    makeGenerateAiReply(
      {
        clock,
        messages,
        contacts,
        settings,
        usage,
        cipher,
        gateway,
        topicGuard,
        knowledgeSource,
        chatModel,
        ids,
        logger,
      },
      config,
    );

  const run = async (
    triggerMessageId: MessageId,
    contactId: ContactId = contact.id,
  ): Promise<AiReplyRunOutcome> => {
    const result = await generate()({ contactId, triggerMessageId }, ctx);
    if (!result.ok) throw new Error('GenerateAiReply has no error results');
    return result.value;
  };

  const reload = async (): Promise<Contact> => {
    const c = await contacts.findById(contact.id);
    if (c === null) throw new Error('contact missing');
    return c;
  };

  const allMessages = async (): Promise<Message[]> =>
    (await messages.listLatest(contact.id, 500)).messages;
  const eventCodes = async () =>
    (await allMessages()).filter((m) => m.type === 'event').map((m) => m.eventCode);
  const aiMessages = async () => (await allMessages()).filter((m) => m.author === 'ai');
  const sentTexts = () => [
    ...gateway.replies.flatMap((r) => r.parts),
    ...gateway.pushes.flatMap((p) => p.parts),
  ];

  /** A customer message; text by default, with a fresh reply token. */
  const customerSays = async (
    text: string | null,
    type: Message['type'] = 'text',
    replyToken: string | null = REPLY_TOKEN,
  ): Promise<Message> => {
    const now = clock.now();
    const { message } = await messages.insertInboundIfAbsent({
      id: ids.messageId(),
      contactId: contact.id,
      direction: 'inbound',
      author: 'customer',
      type,
      text: type === 'text' ? text : null,
      mediaUrl: null,
      previewUrl: null,
      mediaStatus: null,
      stickerPackageId: type === 'sticker' ? '1' : null,
      stickerId: type === 'sticker' ? '2' : null,
      otherKind: type === 'other' ? 'audio' : null,
      eventCode: null,
      lineMessageId: ids.randomToken() as Message['lineMessageId'], // brand: test LINE id
      deliveryStatus: null,
      deliveryError: null,
      retryKey: null,
      createdAt: now,
      sentAt: null,
    });
    await contacts.recordInbound(contact.id, {
      at: now,
      preview: { type: type === 'event' ? 'other' : type, text },
      replyToken,
      replyTokenExpiresAt:
        replyToken === null ? null : new Date(now.getTime() + REPLY_TOKEN_USABLE_MS),
    });
    return message;
  };

  /** An outbound message of the shop that was sent (or failed). */
  const shopSaid = async (
    text: string,
    deliveryStatus: 'sent' | 'failed' = 'sent',
  ): Promise<Message> => {
    const id = ids.messageId();
    const { message } = await messages.insertOutboundIfAbsent({
      id,
      contactId: contact.id,
      direction: 'outbound',
      author: 'ai',
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
      deliveryStatus,
      deliveryError: deliveryStatus === 'failed' ? 'line.unavailable' : null,
      retryKey: id,
      createdAt: clock.now(),
      sentAt: deliveryStatus === 'sent' ? clock.now() : null,
    });
    return message;
  };

  const enableGuard = () => settings.update({ guardEnabled: true, guardTopics: TOPICS });

  const addUsage = (cost: bigint, at: Date = clock.now()) =>
    usage.insert({
      id: ids.usageId(),
      kind: 'reply',
      contactId: contact.id,
      messageId: null,
      documentId: null,
      provider: 'claude',
      model: 'claude-opus-5-5',
      usage: FAKE_USAGE,
      cost: nano(cost),
      outcome: 'ok',
      error: null,
      createdAt: at,
    });

  const replyOk = (reply = 'ร้านเปิด 9 โมงค่ะ') =>
    chatModel.enqueueReply({ reply, needsAdmin: false, handoffReason: null });

  const expectNothingSent = () => {
    expect(gateway.replies).toEqual([]);
    expect(gateway.pushes).toEqual([]);
  };

  const expectUnlocked = async () => {
    expect((await reload()).aiState).toBe('idle');
  };

  beforeEach(async () => {
    clock = new FakeClock(T0);
    ids = new FakeIdGenerator(clock);
    contacts = new FakeContactRepository();
    messages = new FakeMessageRepository({ contacts });
    usage = new FakeUsageRepository({ contacts });
    settings = new FakeSettingsRepository();
    cipher = new FakeSecretCipher();
    gateway = new FakeMessagingGateway();
    topicGuard = new FakeTopicGuard();
    knowledgeSource = new FakeKnowledgeSource();
    chatModel = new FakeChatModel();
    logger = new FakeLogger(clock);

    await settings.saveLineCredentials(
      {
        channelSecretEnc: cipher.encrypt(FAKE_LINE_CHANNEL_SECRET),
        channelAccessTokenEnc: cipher.encrypt(FAKE_LINE_ACCESS_TOKEN),
      },
      { botName: 'ร้านขนม', basicId: '@shop' },
      { channelId: '1000000001', secretVerifiedAt: null },
    );
    await settings.update({ aiEnabled: true });
    ({ contact } = await contacts.ensure({
      id: ids.contactId(),
      lineUserId: LINE_USER,
      now: clock.now(),
    }));
    await contacts.updateProfile(contact.id, { displayName: CUSTOMER_NAME, pictureUrl: null });
    await contacts.setAiEnabled(contact.id, true);
  });

  // ----------------------------------------------------------------------------------------------
  describe('conditions', () => {
    it('kill switch off: skipped, no model call, no handoff', async () => {
      await settings.update({ aiEnabled: false });
      const m = await customerSays('สวัสดีค่ะ');

      expect(await run(m.id)).toEqual({ kind: 'skipped', reason: 'kill_switch_off' });
      expect(chatModel.requests).toEqual([]);
      expect((await reload()).needsAdmin).toBe(false);
      expect(await eventCodes()).toEqual([]);
      expect(logger.entries).toContainEqual(
        expect.objectContaining({ event: 'ai.reply.skipped', reason: 'kill_switch_off' }),
      );
    });

    it('contact AI off: skipped contact_ai_off', async () => {
      await contacts.setAiEnabled(contact.id, false);
      const m = await customerSays('สวัสดีค่ะ');

      expect(await run(m.id)).toEqual({ kind: 'skipped', reason: 'contact_ai_off' });
      expect(chatModel.requests).toEqual([]);
    });

    it('unfollowed: skipped unfollowed', async () => {
      const m = await customerSays('สวัสดีค่ะ');
      await contacts.setFollowStatus(contact.id, 'unfollowed', clock.now());

      expect(await run(m.id)).toEqual({ kind: 'skipped', reason: 'unfollowed' });
      expect(chatModel.requests).toEqual([]);
    });

    it('contact missing: skipped contact_missing', async () => {
      const m = await customerSays('สวัสดีค่ะ');
      vi.spyOn(contacts, 'findById').mockResolvedValueOnce(null);

      expect(await run(m.id)).toEqual({ kind: 'skipped', reason: 'contact_missing' });
      expect(chatModel.requests).toEqual([]);
    });

    it('latest message is an image: handoff customer_sent_image with an event line', async () => {
      const m = await customerSays(null, 'image');

      expect(await run(m.id)).toEqual({ kind: 'handoff', reason: 'customer_sent_image' });
      expect(chatModel.requests).toEqual([]);
      expect(await eventCodes()).toEqual(['handoff.customer_sent_image']);
      expect((await reload()).needsAdminReason).toBe('customer_sent_image');
    });

    it.each([
      ['video', 'customer_sent_video'],
      ['sticker', 'customer_sent_non_text'],
      ['other', 'customer_sent_non_text'],
    ] as const)('latest message is %s: handoff %s', async (type, reason) => {
      const m = await customerSays(null, type);

      expect(await run(m.id)).toEqual({ kind: 'handoff', reason });
      expect(chatModel.requests).toEqual([]);
    });

    it('today cost equal to the budget: handoff budget_reached, no model call', async () => {
      await settings.update({ aiDailyBudget: nano(1000n) });
      await addUsage(1000n);
      const m = await customerSays('สวัสดีค่ะ');

      expect(await run(m.id)).toEqual({ kind: 'handoff', reason: 'budget_reached' });
      expect(chatModel.requests).toEqual([]);
      expect(await eventCodes()).toEqual(['handoff.budget_reached']);
    });

    it('one nano-USD of budget left: the model is called', async () => {
      await settings.update({ aiDailyBudget: nano(1000n) });
      await addUsage(999n);
      const m = await customerSays('สวัสดีค่ะ');
      replyOk();

      expect((await run(m.id)).kind).toBe('replied');
      expect(chatModel.requests).toHaveLength(1);
    });

    it('cost of yesterday in Bangkok time is not counted (23:59 vs 00:01, CI in UTC)', async () => {
      await settings.update({ aiDailyBudget: nano(1000n) });
      // 23:59 of 18 Nov in Bangkok.
      await addUsage(1000n, new Date('2026-11-18T16:59:00.000Z'));

      // Still 18 Nov in Bangkok after the debounce: the cost counts.
      clock.set(new Date('2026-11-18T16:59:10.000Z'));
      const late = await customerSays('ยังเปิดอยู่ไหมคะ');
      expect(await run(late.id)).toEqual({ kind: 'handoff', reason: 'budget_reached' });

      // 00:01 of 19 Nov in Bangkok after the debounce: a new day.
      await contacts.clearNeedsAdmin(contact.id);
      clock.set(new Date(Date.UTC(2026, 10, 18, 17, 1, 0) - DEBOUNCE_MS));
      const early = await customerSays('สวัสดีตอนเช้าค่ะ');
      replyOk();
      expect((await run(early.id)).kind).toBe('replied');
    });

    it('every condition met: one model call and a reply', async () => {
      const m = await customerSays('ร้านเปิดกี่โมงคะ');
      replyOk();

      expect((await run(m.id)).kind).toBe('replied');
      expect(chatModel.requests).toHaveLength(1);
      expect(topicGuard.requests).toEqual([]);
    });

    it('budget reached on two messages in a row: one event line', async () => {
      await settings.update({ aiDailyBudget: nano(1000n) });
      await addUsage(1000n);

      const m1 = await customerSays('ถามหน่อยค่ะ');
      expect(await run(m1.id)).toEqual({ kind: 'handoff', reason: 'budget_reached' });
      const m2 = await customerSays('ถามอีกข้อค่ะ');
      expect(await run(m2.id)).toEqual({ kind: 'handoff', reason: 'budget_reached' });

      expect(await eventCodes()).toEqual(['handoff.budget_reached']);
    });

    it('guard off: TopicGuard is not called and the instructions have no <topic_guard>', async () => {
      const m = await customerSays('ร้านเปิดกี่โมงคะ');
      replyOk();

      await run(m.id);

      expect(topicGuard.requests).toEqual([]);
      expect(chatModel.requests[0]?.systemInstructions).not.toContain('<topic_guard>');
    });

    describe('check order', () => {
      it('kill switch wins over contact switch, follow status, type and budget', async () => {
        await settings.update({ aiEnabled: false, aiDailyBudget: nano(1n) });
        await addUsage(10n);
        await contacts.setAiEnabled(contact.id, false);
        const m = await customerSays(null, 'image');
        await contacts.setFollowStatus(contact.id, 'unfollowed', clock.now());

        expect(await run(m.id)).toEqual({ kind: 'skipped', reason: 'kill_switch_off' });
      });

      it('contact switch wins over follow status', async () => {
        await contacts.setAiEnabled(contact.id, false);
        const m = await customerSays(null, 'image');
        await contacts.setFollowStatus(contact.id, 'unfollowed', clock.now());

        expect(await run(m.id)).toEqual({ kind: 'skipped', reason: 'contact_ai_off' });
      });

      it('follow status wins over the message type', async () => {
        const m = await customerSays(null, 'image');
        await contacts.setFollowStatus(contact.id, 'unfollowed', clock.now());

        expect(await run(m.id)).toEqual({ kind: 'skipped', reason: 'unfollowed' });
      });

      it('message type wins over the budget', async () => {
        await settings.update({ aiDailyBudget: nano(1n) });
        await addUsage(10n);
        const m = await customerSays(null, 'image');

        expect(await run(m.id)).toEqual({ kind: 'handoff', reason: 'customer_sent_image' });
      });

      it('budget is checked before the lock', async () => {
        await settings.update({ aiDailyBudget: nano(1n) });
        await addUsage(10n);
        const m = await customerSays('สวัสดีค่ะ');
        await contacts.tryAcquireAiLock(contact.id, clock.now());

        expect(await run(m.id)).toEqual({ kind: 'handoff', reason: 'budget_reached' });
      });

      it('the lock is taken before the guard', async () => {
        await enableGuard();
        const m = await customerSays('เล่ามุกหน่อย');
        await contacts.tryAcquireAiLock(contact.id, clock.now());

        expect(await run(m.id)).toEqual({ kind: 'locked' });
        expect(topicGuard.requests).toEqual([]);
      });

      it('the guard runs before knowledge and the chat model', async () => {
        await enableGuard();
        const m = await customerSays('เล่ามุกหน่อย');
        const seen: { knowledgeCalls: number; chatCalls: number }[] = [];
        topicGuard.enqueue((req) => {
          seen.push({
            knowledgeCalls: knowledgeSource.getKnowledgeCalls,
            chatCalls: chatModel.requests.length,
          });
          return ok({
            stop: 'completed',
            verdict: { allowed: true, matchedTopic: null },
            usage: FAKE_GUARD_USAGE,
            servedModel: req.model,
          });
        });
        replyOk();

        await run(m.id);

        expect(seen).toEqual([{ knowledgeCalls: 0, chatCalls: 0 }]);
        expect(knowledgeSource.getKnowledgeCalls).toBe(1);
        expect(chatModel.requests).toHaveLength(1);
      });

      it('the debounce comes first: a superseded run checks nothing', async () => {
        await settings.update({ aiEnabled: false });
        const m1 = await customerSays('หนึ่ง');
        await customerSays('สอง');

        expect(await run(m1.id)).toEqual({ kind: 'superseded' });
        expect(clock.sleeps).toEqual([DEBOUNCE_MS]);
      });
    });
  });

  // ----------------------------------------------------------------------------------------------
  describe('topic guard (on, two topics)', () => {
    beforeEach(async () => {
      await enableGuard();
    });

    it('budget reached: handoff budget_reached, neither TopicGuard nor the chat model', async () => {
      await settings.update({ aiDailyBudget: nano(1000n) });
      await addUsage(1000n);
      const m = await customerSays('เล่ามุกหน่อย');

      expect(await run(m.id)).toEqual({ kind: 'handoff', reason: 'budget_reached' });
      expect(topicGuard.requests).toEqual([]);
      expect(chatModel.requests).toEqual([]);
    });

    it('kill switch off: skipped, TopicGuard not called', async () => {
      await settings.update({ aiEnabled: false });
      const m = await customerSays('เล่ามุกหน่อย');

      expect(await run(m.id)).toEqual({ kind: 'skipped', reason: 'kill_switch_off' });
      expect(topicGuard.requests).toEqual([]);
    });

    it('allowed: guard usage ok, then reply usage, and the guard rules block ends the instructions', async () => {
      const m = await customerSays('เล่ามุกหน่อย');
      topicGuard.enqueueAllowed(TOPICS[0]);
      replyOk('มุกมาแล้วค่ะ');

      const outcome = await run(m.id);

      expect(outcome.kind).toBe('replied');
      expect(topicGuard.requests).toHaveLength(1);
      expect(
        chatModel.requests[0]?.systemInstructions.endsWith(`\n\n${buildGuardRulesBlock(TOPICS)}`),
      ).toBe(true);
      expect(usage.records.map((r) => [r.kind, r.outcome, r.cost])).toEqual([
        ['guard', 'ok', GUARD_COST],
        ['reply', 'ok', DEFAULT_MODEL_REPLY_COST],
      ]);
      expect(usage.records[0]).toMatchObject({
        contactId: contact.id,
        messageId: null,
        model: GUARD_MODEL,
        usage: FAKE_GUARD_USAGE,
        error: null,
      });
      expect(logger.entries).toContainEqual(
        expect.objectContaining({ event: 'guard.checked', outcome: 'ok', model: GUARD_MODEL }),
      );
      await expectUnlocked();
    });

    it('greeting while the guard is on: allowed with no topic, the chat model introduces the AI', async () => {
      await settings.update({ aiName: 'มินนี่' });
      const m = await customerSays('สวัสดีค่ะ');
      topicGuard.enqueueAllowed(null);
      replyOk('สวัสดีค่ะ มินนี่เป็นผู้ช่วย AI ค่ะ มีอะไรให้ช่วยไหมคะ');

      expect(await run(m.id)).toMatchObject({ kind: 'replied' });
      expect(topicGuard.requests.map((r) => r.message)).toEqual(['สวัสดีค่ะ']);
      expect(chatModel.requests).toHaveLength(1);
      const system = chatModel.requests[0]?.systemInstructions ?? '';
      expect(system).toContain('ชื่อของคุณคือ "มินนี่"');
      expect(system).toContain('- คำทักทาย ขอบคุณ และบอกลาสั้น ๆ ที่ไม่มีคำขออื่น รวมทั้ง');
      expect(system).toContain('ให้ตอบตามกฎการทักทายใน <rules> ได้ needsAdmin เป็น false');
      expect(sentTexts()).toEqual([
        { type: 'text', text: 'สวัสดีค่ะ มินนี่เป็นผู้ช่วย AI ค่ะ มีอะไรให้ช่วยไหมคะ' },
      ]);
      expect(usage.records.map((r) => [r.kind, r.outcome])).toEqual([
        ['guard', 'ok'],
        ['reply', 'ok'],
      ]);
      expect(await eventCodes()).toEqual([]);
    });

    it('greeting with an off-topic request: blocked by the guard, the chat model is not called', async () => {
      const m = await customerSays('สวัสดีค่ะ ขอพยากรณ์อากาศวันนี้หน่อย');
      topicGuard.enqueueBlocked();

      expect(await run(m.id)).toMatchObject({ kind: 'blocked' });
      expect(chatModel.requests).toEqual([]);
      expect(sentTexts()).toEqual([{ type: 'text', text: REFUSAL }]);
      expect(await eventCodes()).toEqual(['guard.blocked']);
      expect(usage.records.map((r) => [r.kind, r.outcome])).toEqual([['guard', 'blocked']]);
    });

    it('request to TopicGuard: guard model, limits, topics, merged message and bounded context', async () => {
      await settings.update({ aiModel: 'claude-opus-5-5' });
      for (let i = 0; i < 4; i += 1) {
        await customerSays(`ถามข้อ ${String(i)}`);
        await shopSaid(`ตอบข้อ ${String(i)}`);
      }
      await customerSays('ขอมุก');
      await customerSays('อีกมุก');
      const m = await customerSays('ตลก ๆ นะ');
      replyOk();

      await run(m.id);

      expect(topicGuard.requests).toHaveLength(1);
      const req = topicGuard.requests[0];
      expect(req).toMatchObject({
        model: GUARD_MODEL,
        maxTokens: GUARD_MAX_TOKENS,
        timeoutMs: GUARD_TIMEOUT_MS,
        topics: TOPICS,
        message: 'ขอมุก\nอีกมุก\nตลก ๆ นะ',
      });
      expect(req?.context).toHaveLength(GUARD_CONTEXT_TURNS);
      expect(req?.context).toEqual([
        { role: 'customer', text: 'ถามข้อ 2' },
        { role: 'assistant', text: 'ตอบข้อ 2' },
        { role: 'customer', text: 'ถามข้อ 3' },
        { role: 'assistant', text: 'ตอบข้อ 3' },
      ]);
    });

    it('blocked: refusal by reply token, guard.blocked line, guard usage blocked, no handoff', async () => {
      const m = await customerSays('ร้านเปิดกี่โมงคะ');
      topicGuard.enqueueBlocked();
      clock.advance(1_000);

      const outcome = await run(m.id);

      const [refusal] = await aiMessages();
      expect(refusal).toMatchObject({ author: 'ai', type: 'text', text: REFUSAL });
      expect(outcome).toEqual({ kind: 'blocked', messageId: refusal?.id });
      expect(knowledgeSource.getKnowledgeCalls).toBe(0);
      expect(chatModel.requests).toEqual([]);
      expect(gateway.replies).toHaveLength(1);
      expect(gateway.replies[0]?.parts).toEqual([{ type: 'text', text: REFUSAL }]);
      expect(gateway.pushes).toEqual([]);
      expect(refusal?.deliveryStatus).toBe('sent');
      expect(await eventCodes()).toEqual(['guard.blocked']);
      expect(usage.records).toEqual([
        expect.objectContaining({
          kind: 'guard',
          outcome: 'blocked',
          messageId: refusal?.id,
          cost: GUARD_COST,
          error: null,
        }),
      ]);
      const after = await reload();
      expect(after.needsAdmin).toBe(false);
      expect(after.aiEnabled).toBe(true);
      expect(after.lastMessageBy).toBe('ai');
      // The AI reply and the event line keep the contact at the customer's time in the list.
      expect(after.lastMessageAt).toEqual(m.createdAt);
      expect(logger.entries).toContainEqual(
        expect.objectContaining({
          event: 'guard.blocked',
          reason: 'classifier',
          messageId: refusal?.id,
        }),
      );
      expect(logger.entries).toContainEqual(
        expect.objectContaining({ event: 'guard.checked', outcome: 'blocked' }),
      );
      await expectUnlocked();
    });

    it('blocked after the particle changed: the next refusal ends with the new particle', async () => {
      await settings.update({ aiPoliteParticle: 'ครับ' });
      const m = await customerSays('ร้านเปิดกี่โมงครับ');
      topicGuard.enqueueBlocked();

      await run(m.id);

      const [refusal] = await aiMessages();
      expect(refusal?.text).toBe(guardRefusalText('ครับ', TOPICS));
      expect(gateway.replies[0]?.parts).toEqual([
        { type: 'text', text: 'ตอนนี้คุยได้เฉพาะเรื่อง “มุกตลกไทย” และ “มีมจากละครและซีรีส์” นะครับ' },
      ]);
    });

    it('blocked after the topics changed: the next refusal names the saved topics', async () => {
      await settings.update({ guardTopics: ['การศึกษา'] });
      const m = await customerSays('ร้านเปิดกี่โมงคะ');
      topicGuard.enqueueBlocked();

      await run(m.id);

      expect(gateway.replies[0]?.parts).toEqual([
        { type: 'text', text: 'ตอนนี้คุยได้เฉพาะเรื่อง “การศึกษา” นะคะ' },
      ]);
    });

    it('blocked while the reply token has expired: refusal pushed with retryKey = message id', async () => {
      const m = await customerSays('ร้านเปิดกี่โมงคะ');
      clock.advance(REPLY_TOKEN_USABLE_MS);
      topicGuard.enqueueBlocked();

      const outcome = await run(m.id);

      expect(outcome.kind).toBe('blocked');
      expect(gateway.replies).toEqual([]);
      expect(gateway.pushes).toHaveLength(1);
      expect(gateway.pushes[0]?.retryKey).toBe(outcome.kind === 'blocked' && outcome.messageId);
    });

    it('blocked and the refusal cannot be sent: message failed, handoff ai_failed', async () => {
      const m = await customerSays('ร้านเปิดกี่โมงคะ');
      topicGuard.enqueueBlocked();
      gateway.failNext('reply', 'line.unavailable');

      expect(await run(m.id)).toEqual({ kind: 'handoff', reason: 'ai_failed' });
      const [refusal] = await aiMessages();
      expect(refusal?.deliveryStatus).toBe('failed');
      expect(gateway.pushes).toEqual([]);
      expect((await reload()).needsAdminReason).toBe('ai_failed');
      expect(usage.records.map((r) => r.outcome)).toEqual(['blocked']);
    });

    it('kill switch turned off during a blocking check: cancelled, no refusal, guard usage cancelled', async () => {
      const m = await customerSays('ร้านเปิดกี่โมงคะ');
      topicGuard.enqueue((req) => {
        void settings.update({ aiEnabled: false });
        return ok({
          stop: 'completed',
          verdict: { allowed: false, matchedTopic: null },
          usage: FAKE_GUARD_USAGE,
          servedModel: req.model,
        });
      });

      expect(await run(m.id)).toEqual({ kind: 'cancelled' });
      expectNothingSent();
      expect(await aiMessages()).toEqual([]);
      expect(await eventCodes()).toEqual([]);
      expect(usage.records).toEqual([
        expect.objectContaining({
          kind: 'guard',
          outcome: 'cancelled',
          messageId: null,
          cost: GUARD_COST,
        }),
      ]);
      expect((await reload()).needsAdmin).toBe(false);
      await expectUnlocked();
    });

    it.each(['ai.unavailable', 'ai.rate_limited', 'ai.auth_failed', 'ai.bad_request'] as const)(
      'TopicGuard returns %s: nothing sent, no usage, handoff ai_failed, lastAiError recorded',
      async (code) => {
        const m = await customerSays('เล่ามุกหน่อย');
        topicGuard.enqueueError(code);

        expect(await run(m.id)).toEqual({ kind: 'handoff', reason: 'ai_failed' });
        expectNothingSent();
        expect(usage.records).toEqual([]);
        expect(chatModel.requests).toEqual([]);
        expect((await settings.get()).lastAiError?.code).toBe(code);
        expect((await reload()).needsAdminReason).toBe('ai_failed');
        expect(logger.entries).toContainEqual(
          expect.objectContaining({ event: 'guard.failed', errorCode: code, level: 'warn' }),
        );
        await expectUnlocked();
      },
    );

    it('TopicGuard returns ai.no_response: a guard usage row with zero cost, handoff ai_failed', async () => {
      const m = await customerSays('เล่ามุกหน่อย');
      topicGuard.enqueueError('ai.no_response');

      expect(await run(m.id)).toEqual({ kind: 'handoff', reason: 'ai_failed' });
      expectNothingSent();
      expect(chatModel.requests).toEqual([]);
      expect(usage.records).toEqual([
        expect.objectContaining({
          kind: 'guard',
          contactId: contact.id,
          messageId: null,
          model: GUARD_MODEL,
          outcome: 'failed',
          error: 'ai.no_response',
          cost: 0n,
          usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
        }),
      ]);
      expect((await settings.get()).lastAiError?.code).toBe('ai.no_response');
      await expectUnlocked();
    });

    it.each([
      ['refused', 'ai.refused', (g: FakeTopicGuard) => g.enqueueRefusal()],
      ['truncated', 'ai.truncated', (g: FakeTopicGuard) => g.enqueueTruncated()],
      ['schema-invalid', 'ai.invalid_output', (g: FakeTopicGuard) => g.enqueueInvalidOutput()],
    ] as const)(
      'guard answer %s: fail closed, guard usage failed %s, handoff ai_failed',
      async (_name, code, script) => {
        const m = await customerSays('เล่ามุกหน่อย');
        script(topicGuard);

        expect(await run(m.id)).toEqual({ kind: 'handoff', reason: 'ai_failed' });
        expectNothingSent();
        expect(chatModel.requests).toEqual([]);
        expect(usage.records).toEqual([
          expect.objectContaining({
            kind: 'guard',
            outcome: 'failed',
            error: code,
            messageId: null,
            cost: GUARD_COST,
          }),
        ]);
        expect((await settings.get()).lastAiError?.code).toBe(code);
        expect(await eventCodes()).toEqual(['handoff.ai_failed']);
      },
    );

    it('allowed with a matchedTopic outside the list: still allowed', async () => {
      const m = await customerSays('เล่ามุกหน่อย');
      topicGuard.enqueueAllowed('หัวข้อที่ไม่มี');
      replyOk();

      expect((await run(m.id)).kind).toBe('replied');
      expect(usage.records.map((r) => [r.kind, r.outcome])).toEqual([
        ['guard', 'ok'],
        ['reply', 'ok'],
      ]);
    });

    it('guard served by a model outside the price table: highest price and a log', async () => {
      const m = await customerSays('เล่ามุกหน่อย');
      topicGuard.enqueueAllowed(null, { servedModel: 'claude-unknown-guard' });
      replyOk();

      await run(m.id);

      // Highest input 5000 and output 25000 nano-USD per token in the table.
      expect(usage.records[0]).toMatchObject({
        kind: 'guard',
        model: 'claude-unknown-guard',
        cost: 400n * 5000n + 20n * 25_000n,
      });
      expect(logger.entries).toContainEqual(
        expect.objectContaining({ event: 'ai.price_unknown_model', model: 'claude-unknown-guard' }),
      );
    });

    it('chat model answers unsafe_or_offtopic: refusal text, guard.blocked, reply usage blocked, no handoff', async () => {
      const m = await customerSays('เล่ามุกหน่อย');
      chatModel.enqueueReply({
        reply: 'ขอโทษค่ะ',
        needsAdmin: true,
        handoffReason: 'unsafe_or_offtopic',
      });

      const outcome = await run(m.id);

      const [refusal] = await aiMessages();
      expect(outcome).toEqual({ kind: 'blocked', messageId: refusal?.id });
      expect(refusal?.text).toBe(REFUSAL);
      expect(sentTexts()).toEqual([{ type: 'text', text: REFUSAL }]);
      expect(await eventCodes()).toEqual(['guard.blocked']);
      expect(usage.records.map((r) => [r.kind, r.outcome, r.messageId])).toEqual([
        ['guard', 'ok', null],
        ['reply', 'blocked', refusal?.id],
      ]);
      expect((await reload()).needsAdmin).toBe(false);
      expect(logger.entries).toContainEqual(
        expect.objectContaining({ event: 'guard.blocked', reason: 'chat_model' }),
      );
    });

    it('chat model off-topic and kill switch turned off during the call: cancelled', async () => {
      const m = await customerSays('เล่ามุกหน่อย');
      chatModel.enqueue((req) => {
        void settings.update({ aiEnabled: false });
        return ok({
          stop: 'completed',
          output: { reply: 'x', needsAdmin: true, handoffReason: 'unsafe_or_offtopic' },
          usage: FAKE_USAGE,
          servedModel: req.model,
        });
      });

      expect(await run(m.id)).toEqual({ kind: 'cancelled' });
      expectNothingSent();
      expect(usage.records.map((r) => [r.kind, r.outcome])).toEqual([
        ['guard', 'ok'],
        ['reply', 'cancelled'],
      ]);
    });

    it('guard off and the model answers unsafe_or_offtopic: handoff ai_unsafe_or_offtopic', async () => {
      await settings.update({ guardEnabled: false });
      const m = await customerSays('คำหยาบ');
      chatModel.enqueueReply({ reply: 'x', needsAdmin: true, handoffReason: 'unsafe_or_offtopic' });

      expect(await run(m.id)).toEqual({ kind: 'handoff', reason: 'ai_unsafe_or_offtopic' });
      expect(await eventCodes()).toEqual(['handoff.ai_unsafe_or_offtopic']);
    });

    it('guard cost of this morning counts in todayCost of the next message', async () => {
      await settings.update({ aiDailyBudget: nano(GUARD_COST) });
      const m1 = await customerSays('ร้านเปิดกี่โมงคะ');
      topicGuard.enqueueBlocked();
      expect((await run(m1.id)).kind).toBe('blocked');

      clock.advance(60 * 60 * 1000);
      const m2 = await customerSays('เล่ามุกหน่อย');
      expect(await run(m2.id)).toEqual({ kind: 'handoff', reason: 'budget_reached' });
      expect(topicGuard.requests).toHaveLength(1);
    });

    it('guard logs hold no customer text, topic or refusal text', async () => {
      const m1 = await customerSays('ข้อความลับของผู้ใช้');
      topicGuard.enqueueBlocked();
      await run(m1.id);
      const m2 = await customerSays('อีกข้อความลับ');
      topicGuard.enqueueRefusal();
      await run(m2.id);

      const logs = JSON.stringify(logger.entries);
      for (const secret of ['ข้อความลับ', ...TOPICS, REFUSAL]) {
        expect(logs).not.toContain(secret);
      }
    });
  });

  // ----------------------------------------------------------------------------------------------
  describe('debounce and lock', () => {
    it('a new message during the wait: the old run is superseded, the new one answers once', async () => {
      const m1 = await customerSays('หนึ่ง');
      let m2: Message | null = null;
      const sleep = clock.sleep.bind(clock);
      vi.spyOn(clock, 'sleep').mockImplementationOnce(async (ms) => {
        await sleep(ms);
        m2 = await customerSays('สอง');
      });

      expect(await run(m1.id)).toEqual({ kind: 'superseded' });
      expect(chatModel.requests).toEqual([]);
      expect(logger.entries).toContainEqual(
        expect.objectContaining({ event: 'ai.reply.superseded' }),
      );

      replyOk();
      const second = m2 as Message | null;
      if (second === null) throw new Error('second message missing');
      expect((await run(second.id)).kind).toBe('replied');
      expect(chatModel.requests).toHaveLength(1);
    });

    it('three messages within the wait: one model call with all three in the history', async () => {
      const m1 = await customerSays('ราคา');
      const m2 = await customerSays('เค้ก');
      const m3 = await customerSays('ปอนด์เดียวค่ะ');
      replyOk();

      const outcomes = await Promise.all([run(m1.id), run(m2.id), run(m3.id)]);

      expect(outcomes.map((o) => o.kind)).toEqual(['superseded', 'superseded', 'replied']);
      expect(chatModel.requests).toHaveLength(1);
      expect(chatModel.requests[0]?.history).toEqual([
        { role: 'customer', text: 'ราคา\nเค้ก\nปอนด์เดียวค่ะ' },
      ]);
    });

    it('another run holds the lock: locked, no model call, the lock is left alone', async () => {
      const m = await customerSays('สวัสดีค่ะ');
      await contacts.tryAcquireAiLock(contact.id, clock.now());

      expect(await run(m.id)).toEqual({ kind: 'locked' });
      expect(chatModel.requests).toEqual([]);
      expect((await reload()).aiState).toBe('replying');
      expect(logger.entries).toContainEqual(expect.objectContaining({ event: 'ai.reply.locked' }));
    });

    it('concurrent runs of the same message: exactly one wins the lock and calls the model', async () => {
      const m = await customerSays('สวัสดีค่ะ');
      replyOk(); // a second call would throw: the queue holds one answer

      const outcomes = await Promise.all([run(m.id), run(m.id), run(m.id), run(m.id)]);

      expect(outcomes.filter((o) => o.kind === 'replied')).toHaveLength(1);
      expect(outcomes.filter((o) => o.kind === 'locked')).toHaveLength(3);
      expect(chatModel.requests).toHaveLength(1);
      expect(sentTexts()).toHaveLength(1);
      await expectUnlocked();
    });

    it('a message arriving during the model call gets locked; the holder answers it in round 2', async () => {
      const m1 = await customerSays('หนึ่ง');
      let secondOutcome: AiReplyRunOutcome | null = null;
      const original = chatModel.generateReply.bind(chatModel);
      vi.spyOn(chatModel, 'generateReply').mockImplementationOnce(async (req) => {
        const m2 = await customerSays('สอง');
        secondOutcome = await run(m2.id);
        return original(req);
      });
      replyOk('ตอบหนึ่ง');
      replyOk('ตอบสอง');

      const outcome = await run(m1.id);

      expect(secondOutcome).toEqual({ kind: 'locked' });
      expect(chatModel.requests).toHaveLength(2);
      // The round-1 reply did not see 'สอง', so 'สอง' comes after it in the round-2 history.
      expect(chatModel.requests[1]?.history).toEqual([
        { role: 'customer', text: 'หนึ่ง' },
        { role: 'assistant', text: 'ตอบหนึ่ง' },
        { role: 'customer', text: 'สอง' },
      ]);
      const ai = await aiMessages();
      expect(ai.map((x) => x.text)).toEqual(['ตอบหนึ่ง', 'ตอบสอง']);
      expect(outcome).toEqual({ kind: 'replied', messageId: ai[1]?.id });
      expect(clock.sleeps).toEqual([DEBOUNCE_MS, DEBOUNCE_MS, DEBOUNCE_MS]);
      await expectUnlocked();
    });

    describe('history of a later round', () => {
      /** Runs `arrive` inside the next model call, before the model answers. */
      const duringModelCall = (arrive: () => Promise<unknown>) => {
        const original = chatModel.generateReply.bind(chatModel);
        vi.spyOn(chatModel, 'generateReply').mockImplementationOnce(async (req) => {
          await arrive();
          return original(req);
        });
      };

      it('the round-1 reply failed to send: both customer messages form one turn, no shop turn', async () => {
        const m1 = await customerSays('หนึ่ง');
        duringModelCall(() => customerSays('สอง'));
        replyOk('ตอบหนึ่ง');
        replyOk('ตอบสอง');
        gateway.failNext('reply', 'line.unavailable');

        expect((await run(m1.id)).kind).toBe('replied');

        expect(chatModel.requests).toHaveLength(2);
        expect(chatModel.requests[1]?.history).toEqual([{ role: 'customer', text: 'หนึ่ง\nสอง' }]);
        expect(sentTexts()).toEqual([{ type: 'text', text: 'ตอบสอง' }]);
      });

      it('the round-1 answer was the handoff text: it stays before the newer message', async () => {
        const m1 = await customerSays('หนึ่ง');
        duringModelCall(() => customerSays('สอง'));
        chatModel.enqueueReply({ reply: 'x', needsAdmin: true, handoffReason: 'not_in_knowledge' });
        replyOk('ตอบสอง');

        await run(m1.id);

        const handoff = handoffText((await settings.get()).aiPoliteParticle);
        expect(chatModel.requests[1]?.history).toEqual([
          { role: 'customer', text: 'หนึ่ง' },
          { role: 'assistant', text: handoff },
          { role: 'customer', text: 'สอง' },
        ]);
      });

      it('the round-1 answer was a guard refusal: it stays before the newer message', async () => {
        await enableGuard();
        const m1 = await customerSays('หนึ่ง');
        const classify = topicGuard.classify.bind(topicGuard);
        vi.spyOn(topicGuard, 'classify').mockImplementationOnce(async (req) => {
          await customerSays('สอง');
          return classify(req);
        });
        topicGuard.enqueueBlocked();
        topicGuard.enqueueAllowed(TOPICS[0] ?? null);
        replyOk('ตอบสอง');

        expect((await run(m1.id)).kind).toBe('replied');

        expect(topicGuard.requests[1]).toMatchObject({
          message: 'สอง',
          context: [
            { role: 'customer', text: 'หนึ่ง' },
            { role: 'assistant', text: REFUSAL },
          ],
        });
        expect(chatModel.requests).toHaveLength(1);
        expect(chatModel.requests[0]?.history).toEqual([
          { role: 'customer', text: 'หนึ่ง' },
          { role: 'assistant', text: REFUSAL },
          { role: 'customer', text: 'สอง' },
        ]);
      });

      it('several messages during the call: all of them, once and in order, after the round-1 reply', async () => {
        const m1 = await customerSays('หนึ่ง');
        duringModelCall(async () => {
          await customerSays('สอง');
          await customerSays('สาม');
        });
        replyOk('ตอบหนึ่ง');
        replyOk('ตอบสองสาม');

        await run(m1.id);

        expect(chatModel.requests).toHaveLength(2);
        expect(chatModel.requests[1]?.history).toEqual([
          { role: 'customer', text: 'หนึ่ง' },
          { role: 'assistant', text: 'ตอบหนึ่ง' },
          { role: 'customer', text: 'สอง\nสาม' },
        ]);
      });

      it('a message the round-1 model already saw is not answered again in a round 2', async () => {
        const m1 = await customerSays('หนึ่ง');
        const loading = gateway.showLoading.bind(gateway);
        // Arrives after the latest-inbound check but before the history is read.
        vi.spyOn(gateway, 'showLoading').mockImplementationOnce(async (...args) => {
          await customerSays('สอง');
          return loading(...args);
        });
        replyOk('ตอบหนึ่งสอง');

        expect((await run(m1.id)).kind).toBe('replied');

        expect(chatModel.requests).toHaveLength(1);
        expect(chatModel.requests[0]?.history).toEqual([{ role: 'customer', text: 'หนึ่ง\nสอง' }]);
        expect(sentTexts()).toEqual([{ type: 'text', text: 'ตอบหนึ่งสอง' }]);
        expect(clock.sleeps).toEqual([DEBOUNCE_MS]);
      });
    });

    describe('lock held across rounds', () => {
      /** Runs `between` inside the holder's wait before round 2 (its second sleep). */
      const betweenRounds = (between: () => Promise<unknown>) => {
        const sleep = clock.sleep.bind(clock);
        let calls = 0;
        vi.spyOn(clock, 'sleep').mockImplementation(async (ms) => {
          calls += 1;
          await sleep(ms);
          if (calls === 2) await between();
        });
      };

      it('the run of a message from the model call wakes between rounds: locked, the holder answers it', async () => {
        const m1 = await customerSays('หนึ่ง');
        let m2: Message | null = null;
        const original = chatModel.generateReply.bind(chatModel);
        vi.spyOn(chatModel, 'generateReply').mockImplementationOnce(async (req) => {
          m2 = await customerSays('สอง');
          return original(req);
        });
        // The run of m2 is held at its loading call, if it gets that far, until the holder has
        // tried its round 2: the interleaving that left m2 unanswered.
        let m2Running = false;
        let reachedLoading: () => void = () => undefined;
        const reached = new Promise<void>((resolve) => {
          reachedLoading = resolve;
        });
        let openGate: () => void = () => undefined;
        const gate = new Promise<void>((resolve) => {
          openGate = resolve;
        });
        const loading = gateway.showLoading.bind(gateway);
        vi.spyOn(gateway, 'showLoading').mockImplementation(async (...args) => {
          if (m2Running) {
            reachedLoading();
            await gate;
          }
          return loading(...args);
        });
        let secondRun: Promise<AiReplyRunOutcome> | null = null;
        betweenRounds(async () => {
          const second: Message | null = m2;
          if (second === null) throw new Error('second message missing');
          m2Running = true;
          const started = run(second.id).finally(() => {
            m2Running = false;
          });
          secondRun = started;
          await Promise.race([reached, started]);
        });
        replyOk('ตอบหนึ่ง');
        replyOk('ตอบสอง');

        const outcome = await run(m1.id);
        openGate();
        const secondOutcome = await (secondRun as Promise<AiReplyRunOutcome> | null);

        expect(secondOutcome).toEqual({ kind: 'locked' });
        expect(chatModel.requests).toHaveLength(2);
        expect(chatModel.requests[1]?.history).toEqual([
          { role: 'customer', text: 'หนึ่ง' },
          { role: 'assistant', text: 'ตอบหนึ่ง' },
          { role: 'customer', text: 'สอง' },
        ]);
        expect(sentTexts()).toEqual([
          { type: 'text', text: 'ตอบหนึ่ง' },
          { type: 'text', text: 'ตอบสอง' },
        ]);
        const ai = await aiMessages();
        expect(outcome).toEqual({ kind: 'replied', messageId: ai[1]?.id });
        await expectUnlocked();
      });

      it('the lock is taken once and still held during the wait before round 2', async () => {
        const m1 = await customerSays('หนึ่ง');
        const original = chatModel.generateReply.bind(chatModel);
        vi.spyOn(chatModel, 'generateReply').mockImplementationOnce(async (req) => {
          await customerSays('สอง');
          return original(req);
        });
        const acquire = vi.spyOn(contacts, 'tryAcquireAiLock');
        const release = vi.spyOn(contacts, 'releaseAiLock');
        let during: Contact | null = null;
        betweenRounds(async () => {
          during = await reload();
        });
        replyOk('ตอบหนึ่ง');
        replyOk('ตอบสอง');

        expect((await run(m1.id)).kind).toBe('replied');

        expect((during as Contact | null)?.aiState).toBe('replying');
        expect((during as Contact | null)?.aiStateAt).toEqual(new Date(T0.getTime() + DEBOUNCE_MS));
        expect(acquire).toHaveBeenCalledTimes(1);
        expect(release).toHaveBeenCalledTimes(1);
        await expectUnlocked();
      });

      it('kill switch turned off between rounds: round 2 skips kill_switch_off, the lock is released', async () => {
        const m1 = await customerSays('หนึ่ง');
        const original = chatModel.generateReply.bind(chatModel);
        vi.spyOn(chatModel, 'generateReply').mockImplementationOnce(async (req) => {
          await customerSays('สอง');
          return original(req);
        });
        betweenRounds(() => settings.update({ aiEnabled: false }));
        replyOk('ตอบหนึ่ง');

        expect(await run(m1.id)).toEqual({ kind: 'skipped', reason: 'kill_switch_off' });
        expect(chatModel.requests).toHaveLength(1);
        expect(await eventCodes()).toEqual([]);
        await expectUnlocked();
      });

      it('contact switch turned off between rounds: round 2 skips contact_ai_off', async () => {
        const m1 = await customerSays('หนึ่ง');
        const original = chatModel.generateReply.bind(chatModel);
        vi.spyOn(chatModel, 'generateReply').mockImplementationOnce(async (req) => {
          await customerSays('สอง');
          return original(req);
        });
        betweenRounds(() => contacts.setAiEnabled(contact.id, false));
        replyOk('ตอบหนึ่ง');

        expect(await run(m1.id)).toEqual({ kind: 'skipped', reason: 'contact_ai_off' });
        expect(chatModel.requests).toHaveLength(1);
        await expectUnlocked();
      });
    });

    describe('after the last round', () => {
      /** Every model call adds one customer message before the model answers. */
      const newMessageInEveryCall = (onArrive?: (m: Message, n: number) => Promise<unknown>) => {
        const original = chatModel.generateReply.bind(chatModel);
        let n = 0;
        vi.spyOn(chatModel, 'generateReply').mockImplementation(async (req) => {
          n += 1;
          const m = await customerSays(`ใหม่ ${String(n)}`);
          if (onArrive !== undefined) await onArrive(m, n);
          return original(req);
        });
      };

      it(`a message during round ${String(AI_MAX_ROUNDS_PER_RUN)}: no further round, handoff ai_timeout with an event line`, async () => {
        const m1 = await customerSays('หนึ่ง');
        const lockedRuns: AiReplyRunOutcome[] = [];
        let lastMessage: Message | null = null;
        newMessageInEveryCall(async (m, n) => {
          lastMessage = m;
          if (n === AI_MAX_ROUNDS_PER_RUN) lockedRuns.push(await run(m.id));
        });
        for (let i = 0; i < AI_MAX_ROUNDS_PER_RUN + 1; i += 1) replyOk(`ตอบ ${String(i)}`);

        const outcome = await run(m1.id);

        expect(lockedRuns).toEqual([{ kind: 'locked' }]);
        expect(outcome).toEqual({ kind: 'handoff', reason: 'ai_timeout' });
        expect(chatModel.requests).toHaveLength(AI_MAX_ROUNDS_PER_RUN);
        expect(chatModel.pendingCount).toBe(1);
        expect(sentTexts()).toHaveLength(AI_MAX_ROUNDS_PER_RUN);
        expect(await reload()).toMatchObject({ needsAdmin: true, needsAdminReason: 'ai_timeout' });
        expect(await eventCodes()).toEqual(['handoff.ai_timeout']);
        expect(clock.sleeps.filter((ms) => ms === DEBOUNCE_MS)).toHaveLength(
          AI_MAX_ROUNDS_PER_RUN + 1,
        );
        await expectUnlocked();

        // A run of that message that wakes only now reads a history that ends with the shop.
        const late = lastMessage as Message | null;
        if (late === null) throw new Error('last message missing');
        expect(await run(late.id)).toEqual({ kind: 'skipped', reason: 'no_history' });
        expect(chatModel.requests).toHaveLength(AI_MAX_ROUNDS_PER_RUN);
      });

      it('the message left after the last round is an image: its own handoff, not ai_timeout', async () => {
        const m1 = await customerSays('หนึ่ง');
        const original = chatModel.generateReply.bind(chatModel);
        let n = 0;
        vi.spyOn(chatModel, 'generateReply').mockImplementation(async (req) => {
          n += 1;
          if (n < AI_MAX_ROUNDS_PER_RUN) await customerSays(`ใหม่ ${String(n)}`);
          else await customerSays(null, 'image');
          return original(req);
        });
        for (let i = 0; i < AI_MAX_ROUNDS_PER_RUN; i += 1) replyOk(`ตอบ ${String(i)}`);

        expect(await run(m1.id)).toEqual({ kind: 'handoff', reason: 'customer_sent_image' });
        expect(await eventCodes()).toEqual(['handoff.customer_sent_image']);
        await expectUnlocked();
      });

      it('the message left after the last round with the kill switch off: skipped, no handoff', async () => {
        const m1 = await customerSays('หนึ่ง');
        newMessageInEveryCall();
        for (let i = 0; i < AI_MAX_ROUNDS_PER_RUN; i += 1) replyOk(`ตอบ ${String(i)}`);
        const send = gateway.reply.bind(gateway);
        let replies = 0;
        // The last round's reply goes out, then the kill switch is turned off.
        vi.spyOn(gateway, 'reply').mockImplementation(async (...args) => {
          replies += 1;
          const r = await send(...args);
          if (replies === AI_MAX_ROUNDS_PER_RUN) await settings.update({ aiEnabled: false });
          return r;
        });

        expect(await run(m1.id)).toEqual({ kind: 'skipped', reason: 'kill_switch_off' });
        expect(chatModel.requests).toHaveLength(AI_MAX_ROUNDS_PER_RUN);
        expect(await eventCodes()).toEqual([]);
        expect((await reload()).needsAdmin).toBe(false);
        await expectUnlocked();
      });

      it('a message after the final check: its own run takes the lock and answers it', async () => {
        const m1 = await customerSays('หนึ่ง');
        const original = chatModel.generateReply.bind(chatModel);
        vi.spyOn(chatModel, 'generateReply').mockImplementationOnce(async (req) => {
          await customerSays('สอง');
          return original(req);
        });
        let m3: Message | null = null;
        const release = contacts.releaseAiLock.bind(contacts);
        // Arrives after the holder's last latest-inbound check, before the lock is released.
        vi.spyOn(contacts, 'releaseAiLock').mockImplementationOnce(async (id) => {
          m3 = await customerSays('สาม');
          await release(id);
        });
        replyOk('ตอบหนึ่ง');
        replyOk('ตอบสอง');
        replyOk('ตอบสาม');

        expect((await run(m1.id)).kind).toBe('replied');
        await expectUnlocked();

        const third = m3 as Message | null;
        if (third === null) throw new Error('third message missing');
        expect((await run(third.id)).kind).toBe('replied');
        expect(chatModel.requests).toHaveLength(3);
        expect(chatModel.requests[2]?.history.at(-1)).toEqual({ role: 'customer', text: 'สาม' });
        expect(await eventCodes()).toEqual([]);
        await expectUnlocked();
      });
    });

    it('a cancelled round ends the run at once, without a further round', async () => {
      const m1 = await customerSays('หนึ่ง');
      chatModel.enqueue((req) => {
        void customerSays('สอง');
        void settings.update({ aiEnabled: false });
        return ok({
          stop: 'completed',
          output: { reply: 'x', needsAdmin: false, handoffReason: null },
          usage: FAKE_USAGE,
          servedModel: req.model,
        });
      });

      expect(await run(m1.id)).toEqual({ kind: 'cancelled' });
      expect(clock.sleeps).toEqual([DEBOUNCE_MS]);
    });

    it('the model fails: the lock is released', async () => {
      const m = await customerSays('สวัสดีค่ะ');
      chatModel.enqueueError('ai.unavailable');

      expect(await run(m.id)).toEqual({ kind: 'handoff', reason: 'ai_failed' });
      await expectUnlocked();
    });

    it('handoff after the model call uses a fresh contact: an admin clear during the call is seen', async () => {
      await contacts.setNeedsAdmin(contact.id, 'ai_failed');
      const m = await customerSays('สวัสดีค่ะ');
      chatModel.enqueue(() => {
        void contacts.clearNeedsAdmin(contact.id);
        return err('ai.unavailable');
      });

      expect(await run(m.id)).toEqual({ kind: 'handoff', reason: 'ai_failed' });
      expect((await reload()).needsAdminReason).toBe('ai_failed');
      expect(await eventCodes()).toEqual(['handoff.ai_failed']);
    });

    it('replyOnce throws: the lock is released and the exception propagates', async () => {
      const m = await customerSays('สวัสดีค่ะ');
      // The fake throws on an empty queue.

      await expect(run(m.id)).rejects.toThrow('FakeChatModel: no result enqueued');
      await expectUnlocked();
    });
  });

  // ----------------------------------------------------------------------------------------------
  describe('model result', () => {
    it('normal reply: AI message sent, usage ok with messageId and cost of servedModel', async () => {
      const m = await customerSays('ร้านเปิดกี่โมงคะ');
      replyOk('ร้านเปิด 9 โมงค่ะ');

      const outcome = await run(m.id);

      const [reply] = await aiMessages();
      expect(outcome).toEqual({ kind: 'replied', messageId: reply?.id });
      expect(reply).toMatchObject({
        author: 'ai',
        direction: 'outbound',
        type: 'text',
        text: 'ร้านเปิด 9 โมงค่ะ',
        deliveryStatus: 'sent',
        retryKey: reply?.id,
      });
      expect(usage.records).toEqual([
        {
          id: expect.any(String) as unknown,
          kind: 'reply',
          contactId: contact.id,
          messageId: reply?.id,
          documentId: null,
          provider: 'claude',
          model: DEFAULT_AI_MODEL,
          usage: FAKE_USAGE,
          cost: DEFAULT_MODEL_REPLY_COST,
          outcome: 'ok',
          error: null,
          createdAt: clock.now(),
        },
      ]);
      expect(logger.entries).toContainEqual(
        expect.objectContaining({
          event: 'ai.model.called',
          model: DEFAULT_AI_MODEL,
          costNanoUsd: DEFAULT_MODEL_REPLY_COST.toString(),
          outcome: 'ok',
        }),
      );
      expect(logger.entries).toContainEqual(
        expect.objectContaining({ event: 'ai.reply.sent', messageId: reply?.id }),
      );
    });

    it('the reply is sanitised before it is sent', async () => {
      const m = await customerSays('มีเมนูอะไรบ้าง');
      replyOk('**เมนู**\n- เค้ก\n- คุกกี้');

      await run(m.id);

      expect(sentTexts()).toEqual([{ type: 'text', text: 'เมนู\n• เค้ก\n• คุกกี้' }]);
    });

    it('servedModel differs from the setting (fallback): cost from servedModel', async () => {
      const m = await customerSays('สวัสดีค่ะ');
      chatModel.enqueueReply(
        { reply: 'สวัสดีค่ะ', needsAdmin: false, handoffReason: null },
        { servedModel: 'claude-opus-5' },
      );

      await run(m.id);

      expect(usage.records[0]).toMatchObject({
        model: 'claude-opus-5',
        cost: 100n * 5000n + 20n * 25_000n,
      });
      expect(logger.eventsOf()).not.toContain('ai.price_unknown_model');
    });

    it('servedModel outside the price table: highest price per token type and a log', async () => {
      const m = await customerSays('สวัสดีค่ะ');
      const u: TokenUsage = {
        inputTokens: 10,
        outputTokens: 2,
        cacheReadTokens: 30,
        cacheWriteTokens: 4,
      };
      chatModel.enqueueReply(
        { reply: 'สวัสดีค่ะ', needsAdmin: false, handoffReason: null },
        { usage: u, servedModel: 'claude-mystery-9' },
      );

      await run(m.id);

      expect(usage.records[0]).toMatchObject({
        model: 'claude-mystery-9',
        cost: 10n * 5000n + 2n * 25_000n + 30n * 500n + 4n * 6250n,
      });
      expect(logger.entries).toContainEqual(
        expect.objectContaining({
          level: 'warn',
          event: 'ai.price_unknown_model',
          model: 'claude-mystery-9',
        }),
      );
    });

    it('needsAdmin not_in_knowledge with ค่ะ: fixed handoff text, ai_not_in_knowledge, usage handoff', async () => {
      const m = await customerSays('ส่งต่างประเทศไหม');
      chatModel.enqueueReply({
        reply: 'คำตอบของโมเดลที่ห้ามส่ง',
        needsAdmin: true,
        handoffReason: 'not_in_knowledge',
      });

      expect(await run(m.id)).toEqual({ kind: 'handoff', reason: 'ai_not_in_knowledge' });

      const [sent] = await aiMessages();
      expect(sent?.text).toBe('ขออนุญาตให้แอดมินมาตอบเรื่องนี้นะคะ');
      expect(sentTexts()).toEqual([{ type: 'text', text: 'ขออนุญาตให้แอดมินมาตอบเรื่องนี้นะคะ' }]);
      expect((await reload()).needsAdminReason).toBe('ai_not_in_knowledge');
      expect(await eventCodes()).toEqual(['handoff.ai_not_in_knowledge']);
      expect(usage.records).toEqual([
        expect.objectContaining({ outcome: 'handoff', messageId: sent?.id, error: null }),
      ]);
    });

    it('needsAdmin with ครับ: "ขออนุญาตให้แอดมินมาตอบเรื่องนี้นะครับ"', async () => {
      await settings.update({ aiPoliteParticle: 'ครับ' });
      const m = await customerSays('ขอคุยกับคน');
      chatModel.enqueueReply({ reply: 'x', needsAdmin: true, handoffReason: 'needs_human_action' });

      await run(m.id);

      expect(sentTexts()).toEqual([{ type: 'text', text: 'ขออนุญาตให้แอดมินมาตอบเรื่องนี้นะครับ' }]);
    });

    it.each([
      ['needs_human_action', 'ai_needs_human_action'],
      ['unsafe_or_offtopic', 'ai_unsafe_or_offtopic'],
      ['other', 'ai_other'],
    ] as [ModelHandoffReason, HandoffReason][])(
      'handoffReason %s: reason %s',
      async (modelReason, reason) => {
        const m = await customerSays('ช่วยหน่อย');
        chatModel.enqueueReply({ reply: 'x', needsAdmin: true, handoffReason: modelReason });

        expect(await run(m.id)).toEqual({ kind: 'handoff', reason });
        expect((await reload()).needsAdminReason).toBe(reason);
      },
    );

    it('stop refused: nothing sent, usage refused, ai_failed, lastAiError ai.refused', async () => {
      const m = await customerSays('สวัสดีค่ะ');
      chatModel.enqueueRefusal();

      expect(await run(m.id)).toEqual({ kind: 'handoff', reason: 'ai_failed' });
      expectNothingSent();
      expect(await aiMessages()).toEqual([]);
      expect(usage.records).toEqual([
        expect.objectContaining({
          outcome: 'refused',
          error: 'ai.refused',
          messageId: null,
          cost: DEFAULT_MODEL_REPLY_COST,
        }),
      ]);
      expect((await settings.get()).lastAiError).toEqual({ code: 'ai.refused', at: clock.now() });
    });

    it.each([
      ['truncated', 'ai.truncated', (c: FakeChatModel) => c.enqueueTruncated()],
      ['schema-invalid', 'ai.invalid_output', (c: FakeChatModel) => c.enqueueInvalidOutput()],
      [
        'empty after cleaning',
        'ai.invalid_output',
        (c: FakeChatModel) =>
          c.enqueueReply({ reply: ' \r\n\n  ', needsAdmin: false, handoffReason: null }),
      ],
      [
        'too long after cleaning',
        'ai.invalid_output',
        (c: FakeChatModel) =>
          c.enqueueReply({
            reply: 'ก'.repeat(AI_REPLY_MAX_CHARS + 1),
            needsAdmin: false,
            handoffReason: null,
          }),
      ],
    ] as const)('%s: nothing sent, usage failed %s, ai_failed', async (_name, code, script) => {
      const m = await customerSays('สวัสดีค่ะ');
      script(chatModel);

      expect(await run(m.id)).toEqual({ kind: 'handoff', reason: 'ai_failed' });
      expectNothingSent();
      expect(usage.records).toEqual([
        expect.objectContaining({ outcome: 'failed', error: code, messageId: null }),
      ]);
      expect((await settings.get()).lastAiError?.code).toBe(code);
      expect(await eventCodes()).toEqual(['handoff.ai_failed']);
    });

    it.each(['ai.unavailable', 'ai.auth_failed', 'ai.rate_limited', 'ai.bad_request'] as const)(
      'port returns %s: no usage, ai_failed, lastAiError recorded',
      async (code) => {
        const m = await customerSays('สวัสดีค่ะ');
        chatModel.enqueueError(code);

        expect(await run(m.id)).toEqual({ kind: 'handoff', reason: 'ai_failed' });
        expectNothingSent();
        expect(usage.records).toEqual([]);
        expect((await settings.get()).lastAiError?.code).toBe(code);
        expect(logger.entries).toContainEqual(
          expect.objectContaining({ event: 'ai.reply.failed', errorCode: code }),
        );
      },
    );

    it('port returns ai.no_response: a reply usage row with zero cost, ai_failed, lastAiError', async () => {
      await settings.update({ aiModel: 'claude-sonnet-5-5' });
      const m = await customerSays('สวัสดีค่ะ');
      chatModel.enqueueError('ai.no_response');

      expect(await run(m.id)).toEqual({ kind: 'handoff', reason: 'ai_failed' });
      expectNothingSent();
      expect(usage.records).toEqual([
        expect.objectContaining({
          kind: 'reply',
          contactId: contact.id,
          messageId: null,
          model: 'claude-sonnet-5-5',
          outcome: 'failed',
          error: 'ai.no_response',
          cost: 0n,
        }),
      ]);
      expect((await settings.get()).lastAiError?.code).toBe('ai.no_response');
      expect(await eventCodes()).toEqual(['handoff.ai_failed']);
    });

    describe('links in the reply (ai-prompt 6.1)', () => {
      const withShopLinks = async () => {
        await settings.update({ aiInstructions: 'แผนที่ร้าน https://maps.example.com/shop' });
        knowledgeSource.setDocuments([
          {
            id: ids.documentId(),
            fileName: 'menu.pdf',
            text: 'สั่งออนไลน์ได้ที่ www.shop-example.co.th/order',
            tokenCount: 10,
            status: 'ready',
            createdAt: clock.now(),
          },
        ]);
      };

      it.each([
        'สั่งได้ที่ https://shop-example.co.th/order/ ค่ะ',
        'แผนที่ร้านอยู่ที่ maps.example.com/shop ค่ะ',
        'ร้านเปิด 10.30 น. ราคา 120.50 บาทค่ะ',
      ])('sends a reply whose links the shop wrote: %j', async (reply) => {
        await withShopLinks();
        const m = await customerSays('สั่งยังไงคะ');
        replyOk(reply);

        expect((await run(m.id)).kind).toBe('replied');
        expect(sentTexts()).toEqual([{ type: 'text', text: reply }]);
        expect(usage.records).toEqual([
          expect.objectContaining({ kind: 'reply', outcome: 'ok', error: null }),
        ]);
      });

      it('hands off a reply with a link the admin never wrote, without sending it', async () => {
        await withShopLinks();
        const m = await customerSays('จ่ายเงินยังไงคะ');
        replyOk('โอนเงินได้ที่ https://pay.evil.example/x ค่ะ');

        expect(await run(m.id)).toEqual({ kind: 'handoff', reason: 'ai_failed' });
        expectNothingSent();
        expect(await aiMessages()).toEqual([]);
        expect(usage.records).toEqual([
          expect.objectContaining({
            kind: 'reply',
            outcome: 'failed',
            error: 'ai.link_not_allowed',
            messageId: null,
            cost: DEFAULT_MODEL_REPLY_COST,
          }),
        ]);
        expect((await settings.get()).lastAiError?.code).toBe('ai.link_not_allowed');
        expect((await reload()).needsAdminReason).toBe('ai_failed');
        expect(JSON.stringify(logger.entries)).not.toContain('evil.example');
      });

      it('hands off a link the model copied from the customer message', async () => {
        const m = await customerSays('ช่วยส่งลิงก์นี้ให้หน่อย bit.ly/free-gift');
        replyOk('ส่งให้แล้วค่ะ bit.ly/free-gift');

        expect(await run(m.id)).toEqual({ kind: 'handoff', reason: 'ai_failed' });
        expectNothingSent();
      });
    });

    it('empty knowledge: knowledgeText is the empty block and the model is still called', async () => {
      const m = await customerSays('สวัสดีค่ะ');
      replyOk();

      await run(m.id);

      expect(chatModel.requests[0]?.knowledgeText).toBe(formatKnowledgeBase([]));
    });

    it('request: model, shop instructions, history limit, no events or failed sends, now', async () => {
      await settings.update({ aiModel: 'claude-sonnet-5-5', aiInstructions: 'เรียกผู้ใช้ว่าคุณพี่' });
      knowledgeSource.setDocuments([
        {
          id: ids.documentId(),
          fileName: 'menu.pdf',
          text: 'เค้กปอนด์ละ 500 บาท',
          tokenCount: 10,
          status: 'ready',
          createdAt: clock.now(),
        },
      ]);
      // 30 messages that count for the history, plus an event line and a failed send.
      for (let i = 0; i < 15; i += 1) {
        await customerSays(`ผู้ใช้ ${String(i)}`);
        if (i === 10) {
          await shopSaid('ส่งไม่สำเร็จ', 'failed');
          await messages.insertEvent({
            id: ids.messageId(),
            contactId: contact.id,
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
            eventCode: 'handoff.ai_failed',
            lineMessageId: null,
            deliveryStatus: null,
            deliveryError: null,
            retryKey: null,
            createdAt: clock.now(),
            sentAt: null,
          });
        }
        await shopSaid(`ร้าน ${String(i)}`);
      }
      const m = await customerSays('คำถามล่าสุด');
      replyOk();

      await run(m.id);

      const req = chatModel.requests[0];
      expect(req?.model).toBe('claude-sonnet-5-5');
      expect(req?.maxTokens).toBe(AI_MAX_TOKENS);
      expect(req?.systemInstructions).toContain('เรียกผู้ใช้ว่าคุณพี่');
      expect(req?.knowledgeText).toContain('เค้กปอนด์ละ 500 บาท');
      expect(req?.now).toEqual(clock.now());
      const texts = req?.history.flatMap((t) => t.text.split('\n')) ?? [];
      expect(texts.length).toBeLessThanOrEqual(AI_HISTORY_LIMIT);
      expect(texts).not.toContain('ส่งไม่สำเร็จ');
      expect(texts).not.toContain('ผู้ใช้ 0');
      expect(req?.history.at(-1)).toEqual({ role: 'customer', text: 'คำถามล่าสุด' });
      expect(req?.history[0]?.role).toBe('customer');
    });

    it('history that does not end with the customer: skipped no_history, no model call', async () => {
      const m = await customerSays('สวัสดีค่ะ');
      await shopSaid('สวัสดีค่ะ ร้านยินดีให้บริการ');

      expect(await run(m.id)).toEqual({ kind: 'skipped', reason: 'no_history' });
      expect(chatModel.requests).toEqual([]);
      await expectUnlocked();
    });

    it('logs hold no message text, names, tokens or prompt content', async () => {
      await settings.update({ aiInstructions: 'คำแนะนำลับของร้าน' });
      const m = await customerSays('ข้อความส่วนตัวของผู้ใช้');
      replyOk('คำตอบลับของ AI');

      await run(m.id);

      const logs = JSON.stringify(logger.entries);
      for (const secret of [
        'ข้อความส่วนตัว',
        'คำตอบลับ',
        'คำแนะนำลับ',
        CUSTOMER_NAME,
        LINE_USER,
        REPLY_TOKEN,
        FAKE_LINE_ACCESS_TOKEN,
        FAKE_LINE_CHANNEL_SECRET,
      ]) {
        expect(logs).not.toContain(secret);
      }
    });
  });

  // ----------------------------------------------------------------------------------------------
  describe('re-check before sending', () => {
    const duringCall = (change: () => void, needsAdmin = false) =>
      chatModel.enqueue((req) => {
        change();
        return ok({
          stop: 'completed',
          output: {
            reply: 'ตอบ',
            needsAdmin,
            handoffReason: needsAdmin ? 'not_in_knowledge' : null,
          },
          usage: FAKE_USAGE,
          servedModel: req.model,
        });
      });

    it('kill switch turned off during the model call: cancelled, nothing sent, usage cancelled with cost', async () => {
      const m = await customerSays('สวัสดีค่ะ');
      duringCall(() => void settings.update({ aiEnabled: false }));

      expect(await run(m.id)).toEqual({ kind: 'cancelled' });
      expectNothingSent();
      expect(await aiMessages()).toEqual([]);
      expect(usage.records).toEqual([
        expect.objectContaining({
          kind: 'reply',
          outcome: 'cancelled',
          messageId: null,
          error: null,
          cost: DEFAULT_MODEL_REPLY_COST,
        }),
      ]);
      expect((await reload()).needsAdmin).toBe(false);
      expect(logger.eventsOf()).toContain('ai.reply.cancelled');
      await expectUnlocked();
    });

    it('kill switch turned off before the handoff text: nothing sent, no handoff', async () => {
      const m = await customerSays('สวัสดีค่ะ');
      duringCall(() => void settings.update({ aiEnabled: false }), true);

      expect(await run(m.id)).toEqual({ kind: 'cancelled' });
      expectNothingSent();
      expect(await eventCodes()).toEqual([]);
      expect(usage.records.map((r) => r.outcome)).toEqual(['cancelled']);
    });

    it('the admin replied (contact AI turned off) during the model call: cancelled', async () => {
      const m = await customerSays('สวัสดีค่ะ');
      duringCall(() => void contacts.setAiEnabled(contact.id, false));

      expect(await run(m.id)).toEqual({ kind: 'cancelled' });
      expectNothingSent();
    });

    it('the customer unfollowed during the model call: cancelled', async () => {
      const m = await customerSays('สวัสดีค่ะ');
      duringCall(() => void contacts.setFollowStatus(contact.id, 'unfollowed', clock.now()));

      expect(await run(m.id)).toEqual({ kind: 'cancelled' });
      expectNothingSent();
    });
  });

  // ----------------------------------------------------------------------------------------------
  describe('sending', () => {
    it('reply token still usable: sent by reply and the token is used up', async () => {
      const m = await customerSays('สวัสดีค่ะ');
      replyOk();

      await run(m.id);

      expect(gateway.replies).toHaveLength(1);
      expect(gateway.replies[0]?.replyToken).toBe(REPLY_TOKEN);
      expect(gateway.pushes).toEqual([]);
      expect((await reload()).replyToken).toBeNull();
    });

    it('reply token expired by the fake clock: push with retryKey = message id', async () => {
      const m = await customerSays('สวัสดีค่ะ');
      clock.advance(REPLY_TOKEN_USABLE_MS);
      replyOk();

      const outcome = await run(m.id);

      expect(gateway.replies).toEqual([]);
      expect(gateway.pushes).toHaveLength(1);
      expect(gateway.pushes[0]?.retryKey).toBe(outcome.kind === 'replied' && outcome.messageId);
    });

    it('LINE rejects the reply token: push follows and the message is sent', async () => {
      const m = await customerSays('สวัสดีค่ะ');
      gateway.invalidReplyTokens.add(REPLY_TOKEN);
      replyOk();

      expect((await run(m.id)).kind).toBe('replied');
      expect(gateway.pushes).toHaveLength(1);
      expect((await aiMessages())[0]?.deliveryStatus).toBe('sent');
    });

    it('reply gets line.unavailable: no push, message failed, ai_failed, usage still recorded', async () => {
      const m = await customerSays('สวัสดีค่ะ');
      gateway.failNext('reply', 'line.unavailable');
      replyOk();

      expect(await run(m.id)).toEqual({ kind: 'handoff', reason: 'ai_failed' });
      expect(gateway.pushes).toEqual([]);
      const [sent] = await aiMessages();
      expect(sent?.deliveryStatus).toBe('failed');
      expect(usage.records).toEqual([
        expect.objectContaining({
          outcome: 'ok',
          messageId: sent?.id,
          cost: DEFAULT_MODEL_REPLY_COST,
        }),
      ]);
      expect((await reload()).needsAdminReason).toBe('ai_failed');
    });

    it('push gets line.quota_exceeded: message failed, lastLineError recorded, ai_failed', async () => {
      const m = await customerSays('สวัสดีค่ะ', 'text', null);
      gateway.quotaExceeded = true;
      replyOk();

      expect(await run(m.id)).toEqual({ kind: 'handoff', reason: 'ai_failed' });
      const [sent] = await aiMessages();
      expect(sent).toMatchObject({
        deliveryStatus: 'failed',
        deliveryError: 'line.quota_exceeded',
      });
      expect((await settings.get()).lastLineError?.code).toBe('line.quota_exceeded');
    });

    it('handoff text that cannot be sent: ai_failed rather than the model reason', async () => {
      const m = await customerSays('สวัสดีค่ะ');
      gateway.failNext('reply', 'line.unavailable');
      chatModel.enqueueReply({ reply: 'x', needsAdmin: true, handoffReason: 'not_in_knowledge' });

      expect(await run(m.id)).toEqual({ kind: 'handoff', reason: 'ai_failed' });
    });

    it('LINE credentials missing before the model call: no model call, ai_failed', async () => {
      settings = new FakeSettingsRepository();
      await settings.update({ aiEnabled: true });
      const m = await customerSays('สวัสดีค่ะ');

      expect(await run(m.id)).toEqual({ kind: 'handoff', reason: 'ai_failed' });
      expect(chatModel.requests).toEqual([]);
      await expectUnlocked();
    });

    it('loading fails: the reply still goes out', async () => {
      const m = await customerSays('สวัสดีค่ะ');
      gateway.failNext('showLoading', 'line.loading_failed');
      replyOk();

      expect((await run(m.id)).kind).toBe('replied');
      expect(logger.entries).toContainEqual(
        expect.objectContaining({ event: 'line.loading.failed', errorCode: 'line.loading_failed' }),
      );
    });

    it('loading is shown to the customer for LINE_LOADING_SECONDS', async () => {
      const m = await customerSays('สวัสดีค่ะ');
      replyOk();

      await run(m.id);

      expect(gateway.loadingCalls).toEqual([
        { token: FAKE_LINE_ACCESS_TOKEN, userId: LINE_USER, seconds: LINE_LOADING_SECONDS },
      ]);
    });
  });

  it('round 2 re-checks the conditions with the newer message', async () => {
    const m1 = await customerSays('หนึ่ง');
    const original = chatModel.generateReply.bind(chatModel);
    vi.spyOn(chatModel, 'generateReply').mockImplementationOnce(async (req) => {
      await customerSays(null, 'image');
      return original(req);
    });
    replyOk();

    expect(await run(m1.id)).toEqual({ kind: 'handoff', reason: 'customer_sent_image' });
    expect(chatModel.requests).toHaveLength(1);
    expect(await eventCodes()).toEqual(['handoff.customer_sent_image']);
  });
});
