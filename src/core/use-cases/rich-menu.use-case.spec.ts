import { beforeEach, describe, expect, it } from 'vitest';
import type {
  Contact,
  LineUserId,
  Message,
  MessageId,
  NanoUsd,
  RichMenuAction,
} from '@/core/domain';
import {
  AI_START_MARKER,
  PRICE_TABLE,
  REPLY_TOKEN_USABLE_MS,
  RICH_MENU_LABELS,
  WELCOME_FALLBACK_NAME,
  adminRequestedText,
  aiBudgetReachedText,
  aiUnavailableText,
  defaultHowToText,
  defaultWelcomeText,
  postbackDataOf,
} from '@/core/domain';
import {
  FAKE_LINE_ACCESS_TOKEN,
  FAKE_LINE_CHANNEL_SECRET,
  FAKE_USAGE,
  FakeChatModel,
  FakeClock,
  FakeContactRepository,
  FakeContentHasher,
  FakeIdGenerator,
  FakeKnowledgeSource,
  FakeLogger,
  FakeMessageRepository,
  FakeMessagingGateway,
  FakeRateLimitRepository,
  FakeSecretCipher,
  FakeSettingsRepository,
  FakeTopicGuard,
  FakeUsageRepository,
  FakeWebhookEventRepository,
} from '@/adapters/fakes';
import { makeGenerateAiReply } from './generate-ai-reply.use-case';
import { makeHandleRichMenuAction } from './handle-rich-menu-action.use-case';
import { makePublishRichMenu, makeRemoveRichMenu } from './publish-rich-menu.use-case';
import { type FollowUpJob, makeReceiveLineEvents } from './receive-line-events.use-case';
import { makeSendWelcome } from './send-welcome.use-case';
import type { UseCaseConfig } from './types';

const T0 = new Date('2026-11-18T03:00:00.000Z');
const LINE_USER = 'U-secret-line-user' as LineUserId; // brand: test id
const ctx = { requestId: 'req-test', clientIp: null };
const config: UseCaseConfig = {
  appBaseUrl: 'https://chat.example.com',
  aiDebounceMs: 0,
  aiStuckAfterMs: 180_000,
  pollIntervalMs: 3000,
  rateLimitScale: 1,
  priceTable: PRICE_TABLE,
};

let clock: FakeClock;
let ids: FakeIdGenerator;
let contacts: FakeContactRepository;
let messages: FakeMessageRepository;
let usage: FakeUsageRepository;
let settings: FakeSettingsRepository;
let cipher: FakeSecretCipher;
let gateway: FakeMessagingGateway;
let logger: FakeLogger;
let contact: Contact;

const ports = () => ({ clock, ids, contacts, messages, usage, settings, cipher, gateway, logger });

const reload = async (): Promise<Contact> => {
  const c = await contacts.findById(contact.id);
  if (c === null) throw new Error('contact missing');
  return c;
};
const allMessages = async (): Promise<Message[]> =>
  (await messages.listLatest(contact.id, 100)).messages;
const sentParts = () => [
  ...gateway.replies.flatMap((r) => r.parts),
  ...gateway.pushes.flatMap((p) => p.parts),
];

/** The tap as ReceiveLineEvents stores it, with a usable reply token. */
const tap = async (
  action: RichMenuAction,
  replyToken: string | null = 'rt-tap',
): Promise<Message> => {
  const now = clock.now();
  const { message } = await messages.insertInboundIfAbsent({
    id: ids.messageId(),
    contactId: contact.id,
    direction: 'inbound',
    author: 'customer',
    type: 'text',
    text: RICH_MENU_LABELS[action].title,
    mediaUrl: null,
    previewUrl: null,
    mediaStatus: null,
    stickerPackageId: null,
    stickerId: null,
    otherKind: null,
    eventCode: `customer.tapped_${action}`,
    lineMessageId: null,
    deliveryStatus: null,
    deliveryError: null,
    retryKey: null,
    createdAt: now,
    sentAt: null,
  });
  await contacts.recordInbound(contact.id, {
    at: now,
    preview: { type: 'text', text: message.text },
    replyToken,
    replyTokenExpiresAt:
      replyToken === null ? null : new Date(now.getTime() + REPLY_TOKEN_USABLE_MS),
  });
  return message;
};

const handle = async (action: RichMenuAction, tapMessageId?: MessageId) => {
  const id = tapMessageId ?? (await tap(action)).id;
  const r = await makeHandleRichMenuAction(ports(), config)(
    { contactId: contact.id, action, tapMessageId: id },
    ctx,
  );
  if (!r.ok) throw new Error('HandleRichMenuAction has no error results');
  return { ...r.value, tapId: id };
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
  logger = new FakeLogger(clock);
  await settings.saveLineCredentials(
    {
      channelSecretEnc: cipher.encrypt(FAKE_LINE_CHANNEL_SECRET),
      channelAccessTokenEnc: cipher.encrypt(FAKE_LINE_ACCESS_TOKEN),
    },
    { botName: 'บัญชีทดสอบ', basicId: '@test' },
    { channelId: '1000000001', secretVerifiedAt: null },
  );
  await settings.update({ aiEnabled: true });
  ({ contact } = await contacts.ensure({ id: ids.contactId(), lineUserId: LINE_USER, now: T0 }));
});

describe('HandleRichMenuAction: คุยกับ AI', () => {
  it('turns the contact AI on, clears a wait for an admin and hands the tap to GenerateAiReply', async () => {
    await contacts.setNeedsAdmin(contact.id, 'customer_asked_admin');
    const r = await handle('ai_on');
    expect(r).toMatchObject({
      outcome: 'ai_started',
      aiReply: { contactId: contact.id, triggerMessageId: r.tapId },
    });
    expect(await reload()).toMatchObject({ aiEnabled: true, needsAdmin: false });
    expect(sentParts()).toEqual([]);
  });

  it('starts the AI the same way when it is already on', async () => {
    await contacts.setAiEnabled(contact.id, true);
    expect((await handle('ai_on')).outcome).toBe('ai_started');
  });

  it('kill switch off: the fixed text by reply, a wait for an admin, AI stays off', async () => {
    await settings.update({ aiEnabled: false, aiPoliteParticle: 'ครับ' });
    const r = await handle('ai_on');
    expect(r).toMatchObject({ outcome: 'ai_unavailable', aiReply: null });
    expect(gateway.replies).toEqual([
      expect.objectContaining({
        replyToken: 'rt-tap',
        parts: [{ type: 'text', text: aiUnavailableText('ครับ') }],
      }),
    ]);
    expect(await reload()).toMatchObject({
      aiEnabled: false,
      needsAdmin: true,
      needsAdminReason: 'ai_unavailable',
    });
    const events = (await allMessages()).filter((m) => m.type === 'event');
    expect(events.map((m) => m.eventCode)).toEqual(['handoff.ai_unavailable']);
  });

  it('budget used up: the fixed quota text and the budget reason', async () => {
    await settings.update({ aiDailyBudget: 1n as NanoUsd }); // brand: test amount
    await usage.insert({
      id: ids.usageId(),
      kind: 'reply',
      contactId: contact.id,
      messageId: null,
      documentId: null,
      provider: 'claude',
      model: 'claude-sonnet-5-5',
      usage: FAKE_USAGE,
      cost: 5n as NanoUsd, // brand: test amount
      outcome: 'ok',
      error: null,
      createdAt: clock.now(),
    });
    const r = await handle('ai_on');
    expect(r.outcome).toBe('ai_budget_reached');
    expect(sentParts()).toEqual([{ type: 'text', text: aiBudgetReachedText('ค่ะ') }]);
    expect(await reload()).toMatchObject({ needsAdmin: true, needsAdminReason: 'budget_reached' });
  });

  it('greets through GenerateAiReply: the model sees the start marker, not the button title', async () => {
    const chatModel = new FakeChatModel();
    chatModel.enqueueReply({ reply: 'สวัสดีค่ะ', needsAdmin: false, handoffReason: null });
    const r = await handle('ai_on');
    const generate = makeGenerateAiReply(
      {
        ...ports(),
        chatModel,
        topicGuard: new FakeTopicGuard(),
        knowledgeSource: new FakeKnowledgeSource(),
      },
      config,
    );
    if (r.aiReply === null) throw new Error('no AI job');
    const outcome = await generate(r.aiReply, ctx);
    expect(outcome).toMatchObject({ ok: true, value: { kind: 'replied' } });
    expect(chatModel.requests[0]?.history).toEqual([{ role: 'customer', text: AI_START_MARKER }]);
    expect(sentParts()).toEqual([{ type: 'text', text: 'สวัสดีค่ะ' }]);
  });
});

describe('taps next to a text the AI has not answered yet', () => {
  const ANSWER = 'เปิด 9 โมงค่ะ';
  let chatModel: FakeChatModel;
  let generate: ReturnType<typeof makeGenerateAiReply>;

  beforeEach(() => {
    chatModel = new FakeChatModel();
    // Two answers queued: a second model call would pass silently with one only if it threw.
    chatModel.enqueueReply({ reply: ANSWER, needsAdmin: false, handoffReason: null });
    chatModel.enqueueReply({ reply: 'ตอบซ้ำ', needsAdmin: false, handoffReason: null });
    generate = makeGenerateAiReply(
      {
        ...ports(),
        chatModel,
        topicGuard: new FakeTopicGuard(),
        knowledgeSource: new FakeKnowledgeSource(),
      },
      { ...config, aiDebounceMs: 2000 },
    );
  });

  /** A customer text stored like ReceiveLineEvents stores it. */
  const text = async (body: string): Promise<Message> => {
    const now = clock.now();
    const { message } = await messages.insertInboundIfAbsent({
      id: ids.messageId(),
      contactId: contact.id,
      direction: 'inbound',
      author: 'customer',
      type: 'text',
      text: body,
      mediaUrl: null,
      previewUrl: null,
      mediaStatus: null,
      stickerPackageId: null,
      stickerId: null,
      otherKind: null,
      eventCode: null,
      lineMessageId: ids.randomToken() as Message['lineMessageId'], // brand: test id
      deliveryStatus: null,
      deliveryError: null,
      retryKey: null,
      createdAt: now,
      sentAt: null,
    });
    await contacts.recordInbound(contact.id, {
      at: now,
      preview: { type: 'text', text: body },
      replyToken: 'rt-text',
      replyTokenExpiresAt: new Date(now.getTime() + REPLY_TOKEN_USABLE_MS),
    });
    return message;
  };
  const aiTexts = async () =>
    (await allMessages()).filter((m) => m.author === 'ai').map((m) => m.text);

  it('text then วิธีทดสอบ within the debounce: the text is answered once, after the fixed text', async () => {
    await contacts.setAiEnabled(contact.id, true);
    const question = await text('ร้านเปิดกี่โมง');
    const howTo = await tap('how_to');

    const [ai] = await Promise.all([
      generate({ contactId: contact.id, triggerMessageId: question.id }, ctx),
      handle('how_to', howTo.id),
    ]);

    expect(ai).toMatchObject({ ok: true, value: { kind: 'replied' } });
    expect(chatModel.requests).toHaveLength(1);
    expect(chatModel.requests[0]?.history.at(-1)).toMatchObject({ role: 'customer' });
    expect(chatModel.requests[0]?.history.at(-1)?.text).toContain('ร้านเปิดกี่โมง');
    expect(await aiTexts()).toEqual([defaultHowToText('ค่ะ'), ANSWER]);
  });

  it('text then คุยกับแอดมิน: no AI call, AI off and a wait for an admin with the tap reason', async () => {
    await contacts.setAiEnabled(contact.id, true);
    const question = await text('ขอคุยกับคน');
    const admin = await tap('admin');

    const [ai] = await Promise.all([
      generate({ contactId: contact.id, triggerMessageId: question.id }, ctx),
      handle('admin', admin.id),
    ]);

    expect(ai).toMatchObject({ ok: true, value: { kind: 'skipped', reason: 'contact_ai_off' } });
    expect(chatModel.requests).toHaveLength(0);
    expect(await reload()).toMatchObject({
      aiEnabled: false,
      needsAdmin: true,
      needsAdminReason: 'customer_asked_admin',
    });
    expect(await aiTexts()).toEqual([adminRequestedText('ค่ะ')]);
  });

  describe('คุยกับ AI and a text from the same customer, AI off before the tap', () => {
    const receive = () =>
      makeReceiveLineEvents(
        {
          ...ports(),
          webhookEvents: new FakeWebhookEventRepository(),
          rateLimits: new FakeRateLimitRepository(),
          hasher: new FakeContentHasher(),
        },
        config,
      );
    let n = 0;
    const event = (o: Record<string, unknown>) => ({
      webhookEventId: `wev-${String((n += 1))}`,
      timestamp: clock.now().getTime(),
      source: { type: 'user', userId: LINE_USER },
      deliveryContext: { isRedelivery: false },
      mode: 'active',
      replyToken: `rt-${String(n)}`,
      ...o,
    });
    const tapEvent = () => event({ type: 'postback', postback: { data: postbackDataOf('ai_on') } });
    const textEvent = (body: string) =>
      event({ type: 'message', message: { id: `lm-${String(n + 1)}`, type: 'text', text: body } });
    const deliver = async (...events: Record<string, unknown>[]): Promise<FollowUpJob[]> => {
      const rawBody = JSON.stringify({ destination: 'Ubot', events });
      const r = await receive()({ rawBody, signature: gateway.sign(rawBody) }, ctx);
      if (!r.ok) throw new Error(r.error.code);
      // The daily profile refresh is not part of these races (receive-line-events spec).
      return r.value.followUps.filter((job) => job.kind !== 'refresh_profile');
    };
    /** Runs every follow-up at once, as scheduleLineFollowUps does after the 200. */
    const runAll = (jobs: FollowUpJob[]) =>
      Promise.all(
        jobs.map(async (job) => {
          if (job.kind === 'ai_reply') {
            await generate(
              { contactId: job.contactId, triggerMessageId: job.triggerMessageId },
              ctx,
            );
          } else if (job.kind === 'rich_menu_action') {
            const h = await handle(job.action, job.tapMessageId);
            if (h.aiReply !== null) await generate(h.aiReply, ctx);
          }
        }),
      );

    it.each([
      ['tap first', () => [tapEvent(), textEvent('ร้านเปิดกี่โมง')]],
      ['text first', () => [textEvent('ร้านเปิดกี่โมง'), tapEvent()]],
    ] as const)('in one batch (%s): the text is answered exactly once', async (_label, events) => {
      await runAll(await deliver(...events()));

      expect(chatModel.requests).toHaveLength(1);
      expect(chatModel.requests[0]?.history.at(-1)?.text).toContain('ร้านเปิดกี่โมง');
      expect(await aiTexts()).toEqual([ANSWER]);
      expect((await reload()).aiEnabled).toBe(true);
    });

    it('a text that arrives before the tap job turned the AI on is answered exactly once', async () => {
      const tapJobs = await deliver(tapEvent());
      const textJobs = await deliver(textEvent('ร้านเปิดกี่โมง'));
      expect(textJobs).toEqual([]);

      await runAll([...tapJobs, ...textJobs]);

      expect(chatModel.requests).toHaveLength(1);
      expect(await aiTexts()).toEqual([ANSWER]);
    });

    it('a text whose own job exists (AI turned on first) is still answered exactly once', async () => {
      const tapJobs = await deliver(tapEvent());
      const handled = await Promise.all(
        tapJobs.map((j) =>
          j.kind === 'rich_menu_action' ? handle(j.action, j.tapMessageId) : Promise.resolve(null),
        ),
      );
      const textJobs = await deliver(textEvent('ร้านเปิดกี่โมง'));
      expect(textJobs.map((j) => j.kind)).toEqual(['ai_reply']);

      await Promise.all([
        ...handled.map((h) => (h?.aiReply ? generate(h.aiReply, ctx) : null)),
        runAll(textJobs),
      ]);

      expect(chatModel.requests).toHaveLength(1);
      expect(await aiTexts()).toEqual([ANSWER]);
    });
  });
});

describe('HandleRichMenuAction: คุยกับแอดมิน and วิธีทดสอบ', () => {
  it('turns the AI off, waits for an admin with its own reason and replies the fixed text', async () => {
    await contacts.setAiEnabled(contact.id, true);
    const r = await handle('admin');
    expect(r).toMatchObject({ outcome: 'admin_requested', aiReply: null });
    expect(await reload()).toMatchObject({
      aiEnabled: false,
      needsAdmin: true,
      needsAdminReason: 'customer_asked_admin',
    });
    expect(sentParts()).toEqual([{ type: 'text', text: adminRequestedText('ค่ะ') }]);
    const [reply] = (await allMessages()).filter((m) => m.direction === 'outbound');
    expect(reply).toMatchObject({ author: 'ai', deliveryStatus: 'sent' });
  });

  it('adds one event line only, when tapped twice', async () => {
    await handle('admin');
    clock.advance(60_000);
    await handle('admin');
    const events = (await allMessages()).filter((m) => m.type === 'event');
    expect(events.map((m) => m.eventCode)).toEqual(['handoff.customer_asked_admin']);
    expect(sentParts()).toHaveLength(2);
  });

  it('pushes when no reply token is left', async () => {
    const tapped = await tap('admin', null);
    await handle('admin', tapped.id);
    expect(gateway.replies).toEqual([]);
    expect(gateway.pushes).toHaveLength(1);
  });

  it('sends the default how-to text by the particle, or the saved text', async () => {
    await settings.update({ aiPoliteParticle: 'ครับ' });
    expect((await handle('how_to')).outcome).toBe('how_to_sent');
    await settings.update({ howToText: 'ลองพิมพ์อะไรก็ได้' });
    await handle('how_to');
    expect(sentParts()).toEqual([
      { type: 'text', text: defaultHowToText('ครับ') },
      { type: 'text', text: 'ลองพิมพ์อะไรก็ได้' },
    ]);
  });

  it('keeps the reply as failed, for the admin to send again, when LINE answers an error', async () => {
    gateway.failNext('reply', 'line.unavailable');
    await handle('how_to');
    const [reply] = (await allMessages()).filter((m) => m.direction === 'outbound');
    expect(reply).toMatchObject({ deliveryStatus: 'failed', deliveryError: 'line.unavailable' });
  });

  it('marks the reply failed without calling LINE when LINE is not set up', async () => {
    settings = new FakeSettingsRepository();
    await handle('how_to');
    expect(sentParts()).toEqual([]);
    const [reply] = (await allMessages()).filter((m) => m.direction === 'outbound');
    expect(reply).toMatchObject({ deliveryStatus: 'failed', deliveryError: 'line.not_configured' });
  });

  it('answers contact_missing for an unknown contact', async () => {
    const r = await makeHandleRichMenuAction(ports(), config)(
      { contactId: ids.contactId(), action: 'how_to', tapMessageId: ids.messageId() },
      ctx,
    );
    expect(r).toMatchObject({ ok: true, value: { outcome: 'contact_missing' } });
  });

  it('never logs the texts', async () => {
    await settings.update({ howToText: 'ข้อความลับของแอดมิน' });
    await handle('how_to');
    expect(JSON.stringify(logger.entries)).not.toContain('ข้อความลับ');
  });
});

describe('SendWelcome', () => {
  const welcome = async (replyToken = 'rt-follow') => {
    const r = await makeSendWelcome(ports(), config)({ contactId: contact.id, replyToken }, ctx);
    if (!r.ok) throw new Error('SendWelcome has no error results');
    return r.value;
  };

  it('replies with the card and keeps it as a sent welcome row, list untouched', async () => {
    const before = await reload();
    const r = await welcome();
    expect(r.outcome).toBe('sent');
    expect(gateway.replies).toHaveLength(1);
    const [part] = gateway.replies[0]?.parts ?? [];
    expect(part).toMatchObject({
      type: 'card',
      card: {
        accountName: 'บัญชีทดสอบ',
        body: defaultWelcomeText('ค่ะ'),
        logoUrl: 'https://chat.example.com/brand/app-icon-512.png',
      },
    });
    const [row] = await allMessages();
    expect(row).toMatchObject({
      direction: 'outbound',
      author: 'ai',
      type: 'text',
      eventCode: 'welcome.sent',
      deliveryStatus: 'sent',
      text: defaultWelcomeText('ค่ะ'),
    });
    expect(await reload()).toEqual(before);
  });

  it('uses the saved text and the app name when no LINE name is stored', async () => {
    settings = new FakeSettingsRepository();
    await settings.saveLineCredentials(
      {
        channelSecretEnc: cipher.encrypt(FAKE_LINE_CHANNEL_SECRET),
        channelAccessTokenEnc: cipher.encrypt(FAKE_LINE_ACCESS_TOKEN),
      },
      { botName: '', basicId: '@test' },
      { channelId: '1000000001', secretVerifiedAt: null },
    );
    await settings.update({ welcomeText: 'ยินดีที่ได้รู้จัก' });
    await welcome();
    expect(gateway.replies[0]?.parts[0]).toMatchObject({
      card: { accountName: WELCOME_FALLBACK_NAME, body: 'ยินดีที่ได้รู้จัก' },
    });
  });

  it('does nothing when the switch is off', async () => {
    await settings.update({ welcomeEnabled: false });
    expect(await welcome()).toEqual({ outcome: 'disabled' });
    expect(sentParts()).toEqual([]);
    expect(await allMessages()).toEqual([]);
    expect(logger.eventsOf()).toContain('line.welcome.skipped');
  });

  it('does nothing but log when LINE is not set up', async () => {
    settings = new FakeSettingsRepository();
    expect(await welcome()).toEqual({ outcome: 'failed' });
    expect(sentParts()).toEqual([]);
    expect(logger.eventsOf('warn')).toContain('line.welcome.failed');
  });

  it('never pushes when the reply fails, and stores nothing', async () => {
    gateway.invalidReplyTokens.add('rt-used');
    expect(await welcome('rt-used')).toEqual({ outcome: 'failed' });
    expect(gateway.pushes).toEqual([]);
    expect(await allMessages()).toEqual([]);
    expect(logger.entries).toContainEqual(
      expect.objectContaining({
        event: 'line.welcome.failed',
        errorCode: 'line.reply_token_invalid',
      }),
    );
  });

  it('sends while the AI is off and leaves the contact AI switch alone', async () => {
    await settings.update({ aiEnabled: false });
    expect((await welcome()).outcome).toBe('sent');
    expect((await reload()).aiEnabled).toBe(false);
  });

  it('draws a text-only header when APP_BASE_URL is not HTTPS', async () => {
    const r = await makeSendWelcome(ports(), { ...config, appBaseUrl: 'http://localhost:3000' })(
      { contactId: contact.id, replyToken: 'rt-1' },
      ctx,
    );
    expect(r.ok).toBe(true);
    expect(gateway.replies[0]?.parts[0]).toMatchObject({ card: { logoUrl: null } });
  });
});

describe('PublishRichMenu and RemoveRichMenu', () => {
  const publish = () => makePublishRichMenu(ports(), config)({}, ctx);
  const remove = () => makeRemoveRichMenu(ports(), config)({}, ctx);

  it('creates, uploads, sets the default and records the menu', async () => {
    const r = await publish();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const id = r.value.richMenuId;
    expect(gateway.defaultRichMenuId).toBe(id);
    expect(gateway.richMenus.get(id)).toMatchObject({ hasImage: true });
    expect((await settings.get()).richMenu).toEqual({ id, publishedAt: T0 });
    expect(logger.eventsOf()).toContain('line.rich_menu.published');
  });

  it('deletes the menu published before, after the new one is the default', async () => {
    const first = await publish();
    const second = await publish();
    if (!first.ok || !second.ok) throw new Error('publish failed');
    expect([...gateway.richMenus.keys()]).toEqual([second.value.richMenuId]);
  });

  it('two interleaved publishes: one wins, the other answers line.rich_menu_conflict and leaves no menu', async () => {
    const earlier = await publish();
    if (!earlier.ok) throw new Error('publish failed');

    const results = await Promise.all([publish(), publish()]);

    const won = results.filter((r) => r.ok);
    expect(won).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.error.code === 'line.rich_menu_conflict')).toHaveLength(
      1,
    );
    const stored = (await settings.get()).richMenu;
    expect(stored?.id).toBe(won[0]?.ok ? won[0].value.richMenuId : null);
    expect(gateway.defaultRichMenuId).toBe(stored?.id);
    expect([...gateway.richMenus.keys()]).toEqual([stored?.id]);
  });

  it('keeps and records the new menu when setting the default gets no answer', async () => {
    const earlier = await publish();
    if (!earlier.ok) throw new Error('publish failed');
    gateway.failNext('setDefaultRichMenu', 'line.unavailable');

    const r = await publish();

    expect(r).toEqual({ ok: false, error: { code: 'line.unavailable' } });
    const created = [...gateway.richMenus.keys()].filter((id) => id !== earlier.value.richMenuId);
    expect(created).toHaveLength(1);
    const s = await settings.get();
    expect(s.richMenu?.id).toBe(created[0]);
    expect(s.richMenuError?.code).toBe('line.unavailable');
    // The next publish cleans up both: the unknown one is the stored one now.
    const next = await publish();
    if (!next.ok) throw new Error('publish failed');
    expect([...gateway.richMenus.keys()]).toEqual([
      earlier.value.richMenuId,
      next.value.richMenuId,
    ]);
  });

  it('keeps the publish when deleting the earlier menu fails, and logs it', async () => {
    await publish();
    gateway.failNext('deleteRichMenu', 'line.unavailable');
    expect((await publish()).ok).toBe(true);
    expect(gateway.richMenus.size).toBe(2);
    expect(logger.eventsOf('warn')).toContain('line.rich_menu.cleanup_failed');
  });

  it.each([
    ['createRichMenu', 'create', 0],
    ['uploadRichMenuImage', 'upload', 0],
    ['setDefaultRichMenu', 'set_default', 0],
  ] as const)(
    'a failure of %s records the error, cleans up and keeps the earlier menu',
    async (method, step, left) => {
      const earlier = await publish();
      if (!earlier.ok) throw new Error('publish failed');
      gateway.failNext(method, 'line.rich_menu_failed');
      const r = await publish();
      expect(r).toMatchObject({ ok: false, error: { code: 'line.rich_menu_failed' } });
      expect(gateway.richMenus.size - 1).toBe(left);
      expect(gateway.defaultRichMenuId).toBe(earlier.value.richMenuId);
      const s = await settings.get();
      expect(s.richMenu?.id).toBe(earlier.value.richMenuId);
      expect(s.richMenuError).toEqual({ code: 'line.rich_menu_failed', at: T0 });
      expect(logger.entries).toContainEqual(
        expect.objectContaining({ event: 'line.rich_menu.publish_failed', outcome: step }),
      );
    },
  );

  it('logs a failed clean-up of the new menu and still reports the first error', async () => {
    gateway.failNext('uploadRichMenuImage', 'line.unavailable');
    gateway.failNext('deleteRichMenu', 'line.unavailable');
    const r = await publish();
    expect(r).toMatchObject({ ok: false, error: { code: 'line.unavailable' } });
    expect(logger.eventsOf('warn')).toContain('line.rich_menu.cleanup_failed');
  });

  it('clears the error after a publish that works', async () => {
    gateway.failNext('createRichMenu', 'line.rate_limited');
    await publish();
    expect((await settings.get()).richMenuError?.code).toBe('line.rate_limited');
    await publish();
    expect((await settings.get()).richMenuError).toBeNull();
  });

  it.each([
    ['line.unauthorized', 'line.credentials_invalid'],
    ['line.rate_limited', 'line.unavailable'],
  ] as const)("answers %s from LINE as %s, keeping LINE's code stored", async (code, answer) => {
    gateway.failNext('createRichMenu', code);
    expect(await publish()).toMatchObject({ ok: false, error: { code: answer } });
    expect((await settings.get()).richMenuError?.code).toBe(code);
  });

  it('answers line.not_configured without calling LINE', async () => {
    settings = new FakeSettingsRepository();
    expect(await publish()).toMatchObject({ ok: false, error: { code: 'line.not_configured' } });
    expect(await remove()).toMatchObject({ ok: false, error: { code: 'line.not_configured' } });
    expect(gateway.richMenus.size).toBe(0);
  });

  it('removes: clears the default, deletes the menu and forgets it', async () => {
    await publish();
    expect((await remove()).ok).toBe(true);
    expect(gateway.defaultRichMenuId).toBeNull();
    expect(gateway.richMenus.size).toBe(0);
    expect((await settings.get()).richMenu).toBeNull();
    expect(logger.eventsOf()).toContain('line.rich_menu.removed');
  });

  it('removes with no stored menu: clears the default only', async () => {
    expect((await remove()).ok).toBe(true);
  });

  it.each(['clearDefaultRichMenu', 'deleteRichMenu'] as const)(
    'a failure of %s keeps the stored menu and records the error',
    async (method) => {
      const published = await publish();
      if (!published.ok) throw new Error('publish failed');
      gateway.failNext(method, 'line.unavailable');
      expect(await remove()).toMatchObject({ ok: false, error: { code: 'line.unavailable' } });
      const s = await settings.get();
      expect(s.richMenu?.id).toBe(published.value.richMenuId);
      expect(s.richMenuError?.code).toBe('line.unavailable');
      expect(logger.eventsOf('warn')).toContain('line.rich_menu.remove_failed');
    },
  );
});
