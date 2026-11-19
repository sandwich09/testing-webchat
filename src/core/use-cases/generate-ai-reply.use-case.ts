import type {
  AiUsageRecord,
  ChatModelResponse,
  ChatTurn,
  Contact,
  ContactId,
  ErrorCode,
  HandoffReason,
  LineCredentials,
  Message,
  MessageId,
  Seq,
  Settings,
  TokenUsage,
  UsageOutcome,
} from '@/core/domain';
import {
  AI_HISTORY_LIMIT,
  AI_MAX_ROUNDS_PER_RUN,
  AI_MAX_TOKENS,
  GUARD_MAX_TOKENS,
  GUARD_MODEL,
  GUARD_TIMEOUT_MS,
  LINE_LOADING_SECONDS,
  bangkokDayRange,
  buildGuardRulesBlock,
  buildSystemInstructions,
  computeCost,
  disallowedLinks,
  guardContextTurns,
  guardVerdictOf,
  handoffText,
  isNoResponse,
  noResponseUsage,
  ok,
  previewOf,
  sanitizeAiReply,
  shouldAiReply,
  toHistoryTurns,
  usageOutcomeOf,
} from '@/core/domain';
import { makeDeliverOutbound } from './shared/deliver-outbound';
import { makeLoadLineAccess } from './shared/load-line-access';
import { makeRaiseHandoff } from './shared/raise-handoff';
import type { AllPorts, UseCase, UseCaseConfig } from './types';

export type AiReplyRunOutcome =
  | { kind: 'superseded' }
  | { kind: 'locked' }
  | {
      kind: 'skipped';
      reason:
        'kill_switch_off' | 'contact_ai_off' | 'unfollowed' | 'contact_missing' | 'no_history';
    }
  | { kind: 'handoff'; reason: HandoffReason }
  | { kind: 'replied'; messageId: MessageId }
  /** Outside the topic guard: the refusal text was sent. */
  | { kind: 'blocked'; messageId: MessageId }
  | { kind: 'cancelled' };

export type GenerateAiReplyInput = { contactId: ContactId; triggerMessageId: MessageId };

export type GenerateAiReplyOutput = AiReplyRunOutcome;

export type GenerateAiReplyDeps = Pick<
  AllPorts,
  | 'clock'
  | 'messages'
  | 'contacts'
  | 'settings'
  | 'usage'
  | 'cipher'
  | 'gateway'
  | 'topicGuard'
  | 'knowledgeSource'
  | 'chatModel'
  | 'ids'
  | 'logger'
>;

/** An AiUsage row of a billed call, before its outcome is known. */
type UsageDraft = Omit<AiUsageRecord, 'messageId' | 'outcome' | 'error'>;

/**
 * What one round showed the model and wrote: `seenSeq` is the highest seq among the rows of its
 * history (the trigger's seq when it read none), `replyIds` the AI messages it inserted.
 */
interface RoundTrace {
  seenSeq: Seq;
  replyIds: MessageId[];
}

const compareSeq = (a: Seq, b: Seq): number => (a < b ? -1 : a > b ? 1 : 0);

/** Usage-cost and log fields shared by every billed call. */
const tokenFields = (u: TokenUsage) => ({
  inputTokens: u.inputTokens,
  outputTokens: u.outputTokens,
  cacheReadTokens: u.cacheReadTokens,
  cacheWriteTokens: u.cacheWriteTokens,
});

/**
 * Steps of docs/architecture/use-cases.md "GenerateAiReply": the main loop, `replyOnce` and
 * `sendGuardRefusal`. Every expected failure ends in an outcome and in the database; only a
 * thrown repository or programming error escapes, and the AI lock is released either way.
 */
export const makeGenerateAiReply: (
  deps: GenerateAiReplyDeps,
  config: UseCaseConfig,
) => UseCase<GenerateAiReplyInput, GenerateAiReplyOutput> = (deps, config) => {
  const { clock, messages, contacts, settings, usage, gateway, ids, logger } = deps;
  const { topicGuard, knowledgeSource, chatModel } = deps;
  const loadLineAccess = makeLoadLineAccess(deps);
  const raiseHandoff = makeRaiseHandoff(deps);
  const deliverOutbound = makeDeliverOutbound(deps);

  /**
   * raiseHandoff with a contact read just now: a row read before a model call may hold a
   * needsAdmin flag an admin has cleared since, and raiseHandoff would then skip the event line.
   */
  const handoff = async (c: Contact, reason: HandoffReason): Promise<AiReplyRunOutcome> => {
    const fresh = await contacts.findById(c.id);
    if (fresh !== null) await raiseHandoff(fresh, reason);
    return { kind: 'handoff', reason };
  };

  /** Builds the usage draft of one billed call and logs a price outside the table. */
  const draftOf = (
    kind: 'reply' | 'guard',
    contactId: ContactId,
    r: { usage: TokenUsage; servedModel: string },
  ): UsageDraft => {
    const { cost, priceKnown } = computeCost(r.usage, r.servedModel, config.priceTable);
    if (!priceKnown) logger.log('warn', 'ai.price_unknown_model', { model: r.servedModel });
    return {
      id: ids.usageId(),
      kind,
      contactId,
      documentId: null,
      provider: 'claude',
      model: r.servedModel,
      usage: r.usage,
      cost,
      createdAt: clock.now(),
    };
  };

  /**
   * A call that was sent and got no answer may still be billed (usage-cost), so it gets an
   * AiUsage row with zero tokens and cost. Any other port error means the API answered with an
   * error or nothing was sent, and no row is written.
   */
  const recordNoResponse = async (
    kind: 'reply' | 'guard',
    contactId: ContactId,
    model: string,
    code: ErrorCode,
  ): Promise<void> => {
    if (!isNoResponse(code)) return;
    await usage.insert(
      noResponseUsage({
        id: ids.usageId(),
        kind,
        contactId,
        documentId: null,
        provider: 'claude',
        model,
        createdAt: clock.now(),
      }),
    );
  };

  const record = (
    d: UsageDraft,
    messageId: MessageId | null,
    outcome: UsageOutcome,
    error: ErrorCode | null,
  ): Promise<void> => usage.insert({ ...d, messageId, outcome, error });

  /**
   * The check right before any send to LINE: kill switch, the contact's switch, follow status.
   * Returns the fresh rows, or null after recording the draft as cancelled.
   */
  const recheckBeforeSend = async (
    contactId: ContactId,
    d: UsageDraft,
  ): Promise<{ s2: Settings; c2: Contact } | null> => {
    const s2 = await settings.get();
    const c2 = await contacts.findById(contactId);
    if (s2.aiEnabled && c2 !== null && c2.aiEnabled && c2.followStatus !== 'unfollowed') {
      return { s2, c2 };
    }
    await record(d, null, 'cancelled', null);
    logger.log('info', 'ai.reply.cancelled', { contactId });
    return null;
  };

  /** Inserts a pending AI text message and updates the contact's last message. */
  const insertAiText = async (
    contactId: ContactId,
    text: string,
    trace: RoundTrace,
  ): Promise<Message> => {
    const id = ids.messageId();
    const now = clock.now();
    const { message } = await messages.insertOutboundIfAbsent({
      id,
      contactId,
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
      deliveryStatus: 'pending',
      deliveryError: null,
      retryKey: id,
      createdAt: now,
      sentAt: null,
    });
    await contacts.recordOutbound(contactId, { at: now, preview: previewOf(message), by: 'ai' });
    trace.replyIds.push(message.id);
    return message;
  };

  const sendGuardRefusal = async (
    c: Contact,
    access: LineCredentials,
    d: UsageDraft,
    by: 'classifier' | 'chat_model',
    trace: RoundTrace,
  ): Promise<AiReplyRunOutcome> => {
    const fresh = await recheckBeforeSend(c.id, d);
    if (fresh === null) return { kind: 'cancelled' };
    const { s2, c2 } = fresh;
    const message = await insertAiText(c.id, s2.guardRefusalText, trace);
    await messages.insertEvent({
      id: ids.messageId(),
      contactId: c.id,
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
      eventCode: 'guard.blocked',
      lineMessageId: null,
      deliveryStatus: null,
      deliveryError: null,
      retryKey: null,
      createdAt: clock.now(),
      sentAt: null,
    });
    await record(d, message.id, 'blocked', null);
    logger.log('info', 'guard.blocked', { contactId: c.id, messageId: message.id, reason: by });
    const sent = await deliverOutbound(message, c2, access, 'auto');
    if (sent.deliveryStatus === 'failed') return handoff(c2, 'ai_failed');
    return { kind: 'blocked', messageId: message.id };
  };

  /**
   * replyOnce step 4: the topic guard. Returns null when the message may go on to the chat
   * model, or the outcome that ends this round.
   */
  const runGuard = async (
    c: Contact,
    s: Settings,
    access: LineCredentials,
    history: ChatTurn[],
    trace: RoundTrace,
  ): Promise<AiReplyRunOutcome | null> => {
    const started = clock.now().getTime();
    const { message, context } = guardContextTurns(history);
    const g = await topicGuard.classify({
      topics: s.guardTopics,
      message,
      context,
      model: GUARD_MODEL,
      maxTokens: GUARD_MAX_TOKENS,
      timeoutMs: GUARD_TIMEOUT_MS,
    });
    const durationMs = clock.now().getTime() - started;
    const failed = async (code: ErrorCode): Promise<AiReplyRunOutcome> => {
      await settings.recordAiError({ code, at: clock.now() });
      logger.log('warn', 'guard.failed', { contactId: c.id, errorCode: code, durationMs });
      return handoff(c, 'ai_failed');
    };
    if (!g.ok) {
      await recordNoResponse('guard', c.id, GUARD_MODEL, g.error.code);
      return failed(g.error.code);
    }

    const d = draftOf('guard', c.id, g.value);
    const v = guardVerdictOf(g.value, s.guardTopics);
    if (v.verdict === 'failed') {
      const code = v.error ?? 'ai.invalid_output'; // guardVerdictOf always sets error on failed
      await record(d, null, 'failed', code);
      return failed(code); // fail closed: nothing is sent to the customer
    }
    const outcome = v.verdict === 'blocked' ? 'blocked' : 'ok';
    logger.log('info', 'guard.checked', {
      contactId: c.id,
      model: d.model,
      ...tokenFields(d.usage),
      costNanoUsd: d.cost.toString(),
      outcome,
      durationMs,
    });
    if (v.verdict === 'blocked') return sendGuardRefusal(c, access, d, 'classifier', trace);
    await record(d, null, 'ok', null);
    return null;
  };

  /**
   * replyOnce steps 5 to 8: knowledge and the chat model. Also returns the texts the shop wrote
   * (knowledge and instructions), against which the links of the reply are checked.
   */
  const callChatModel = async (s: Settings, history: ChatTurn[]) => {
    const knowledge = await knowledgeSource.getKnowledge();
    const base = buildSystemInstructions(s);
    const systemInstructions = s.guardEnabled
      ? `${base}\n\n${buildGuardRulesBlock(s.guardTopics)}`
      : base;
    const res = await chatModel.generateReply({
      model: s.aiModel,
      systemInstructions,
      knowledgeText: knowledge.text,
      history,
      now: clock.now(),
      maxTokens: AI_MAX_TOKENS,
    });
    return { res, shopTexts: [knowledge.text, s.aiInstructions] };
  };

  /**
   * replyOnce steps 9 to 11: cost, outcome and the cleaned text. A reply with a link the shop
   * never wrote is not sent (ai-prompt 6.1): it fails with ai.link_not_allowed.
   */
  const readReply = (
    c: Contact,
    r: ChatModelResponse,
    durationMs: number,
    shopTexts: readonly string[],
  ) => {
    const d = draftOf('reply', c.id, r);
    let o = usageOutcomeOf(r);
    let text: string | null = null;
    if (o.outcome === 'ok' && r.output !== null) {
      text = sanitizeAiReply(r.output.reply);
      if (text === null) {
        o = { outcome: 'failed', error: 'ai.invalid_output', handoff: 'ai_failed' };
      } else if (disallowedLinks(text, shopTexts).length > 0) {
        text = null;
        o = { outcome: 'failed', error: 'ai.link_not_allowed', handoff: 'ai_failed' };
      }
    }
    logger.log('info', 'ai.model.called', {
      contactId: c.id,
      model: d.model,
      ...tokenFields(d.usage),
      costNanoUsd: d.cost.toString(),
      outcome: o.outcome,
      durationMs,
    });
    return { d, o, text };
  };

  /**
   * History of replyOnce step 3. recentForAi applies AI_HISTORY_LIMIT; toHistoryTurns only shapes
   * the turns. A message that arrived during an earlier round's model call has a lower seq than
   * that round's reply although the reply never saw it; left in seq order, the history would end
   * with the shop and the message would never be answered. So each earlier reply of this run is
   * placed right after the last row its round saw, and every other row keeps its seq order.
   */
  const loadHistory = async (
    contactId: ContactId,
    earlier: readonly RoundTrace[],
    trace: RoundTrace,
  ): Promise<ChatTurn[]> => {
    const rows = await messages.recentForAi(contactId, AI_HISTORY_LIMIT);
    for (const m of rows) if (m.seq > trace.seenSeq) trace.seenSeq = m.seq;
    if (earlier.length === 0) return toHistoryTurns(rows);
    const placedAfter = new Map<MessageId, Seq>();
    for (const r of earlier) for (const id of r.replyIds) placedAfter.set(id, r.seenSeq);
    const keyed = rows.map((m) => {
      const after = placedAfter.get(m.id);
      return { m, key: after ?? m.seq, placed: after === undefined ? 0 : 1 };
    });
    keyed.sort(
      (a, b) => compareSeq(a.key, b.key) || a.placed - b.placed || compareSeq(a.m.seq, b.m.seq),
    );
    return toHistoryTurns(keyed.map((k) => k.m));
  };

  const replyOnce = async (
    c: Contact,
    s: Settings,
    earlier: readonly RoundTrace[],
    trace: RoundTrace,
  ): Promise<AiReplyRunOutcome> => {
    const accessResult = await loadLineAccess();
    // Nothing could be sent anyway, so the model is not called.
    if (!accessResult.ok) return handoff(c, 'ai_failed');
    const access = accessResult.value;

    const loading = await gateway.showLoading(
      access.channelAccessToken,
      c.lineUserId,
      LINE_LOADING_SECONDS,
    );
    if (!loading.ok) {
      logger.log('warn', 'line.loading.failed', { contactId: c.id, errorCode: loading.error.code });
    }

    const history = await loadHistory(c.id, earlier, trace);
    if (history.length === 0) {
      logger.log('info', 'ai.reply.skipped', { contactId: c.id, reason: 'no_history' });
      return { kind: 'skipped', reason: 'no_history' };
    }

    if (s.guardEnabled) {
      const stop = await runGuard(c, s, access, history, trace);
      if (stop !== null) return stop;
    }

    const started = clock.now().getTime();
    const { res, shopTexts } = await callChatModel(s, history);
    if (!res.ok) {
      await recordNoResponse('reply', c.id, s.aiModel, res.error.code);
      await settings.recordAiError({ code: res.error.code, at: clock.now() });
      logger.log('error', 'ai.reply.failed', { contactId: c.id, errorCode: res.error.code });
      return handoff(c, 'ai_failed');
    }
    const { d, o, text } = readReply(c, res.value, clock.now().getTime() - started, shopTexts);

    // Second layer of the topic guard: the chat model judged the message off-topic.
    if (s.guardEnabled && o.handoff === 'ai_unsafe_or_offtopic') {
      return sendGuardRefusal(c, access, d, 'chat_model', trace);
    }

    const fresh = await recheckBeforeSend(c.id, d);
    if (fresh === null) return { kind: 'cancelled' };
    const { s2, c2 } = fresh;

    if (o.outcome === 'refused' || o.outcome === 'failed') {
      const code = o.error ?? 'ai.invalid_output'; // usageOutcomeOf always sets error here
      await record(d, null, o.outcome, code);
      await settings.recordAiError({ code, at: clock.now() });
      return handoff(c2, o.handoff ?? 'ai_failed');
    }

    // needsAdmin: the fixed handoff text, never the model's own reply (ai-prompt 5.4).
    const outgoing = o.outcome === 'ok' && text !== null ? text : handoffText(s2.aiPoliteParticle);
    const message = await insertAiText(c.id, outgoing, trace);
    await record(d, message.id, o.outcome, null);
    const sent = await deliverOutbound(message, c2, access, 'auto');
    if (sent.deliveryStatus === 'failed') return handoff(c2, 'ai_failed');
    if (o.outcome === 'handoff' && o.handoff !== null) return handoff(c2, o.handoff);

    logger.log('info', 'ai.reply.sent', { contactId: c.id, messageId: message.id });
    return { kind: 'replied', messageId: message.id };
  };

  /**
   * Main steps 2 to 4 of a round: the latest inbound message and the conditions. Returns what
   * the round answers with, or the outcome that ends the run. Runs before the lock in round 1
   * and while holding it in every later round, so the switches are re-checked in each round.
   */
  const checkRound = async (
    contactId: ContactId,
    triggerMessageId: MessageId,
    first: boolean,
  ): Promise<
    { ready: { c: Contact; s: Settings; latest: Message } } | { outcome: AiReplyRunOutcome }
  > => {
    const latest = await messages.latestInbound(contactId);
    // Round 1 withdraws when a newer message arrived: that message's own run answers it.
    if (latest === null || (first && latest.id !== triggerMessageId)) {
      logger.log('info', 'ai.reply.superseded', { contactId, messageId: triggerMessageId });
      return { outcome: { kind: 'superseded' } };
    }

    const s = await settings.get();
    const c = await contacts.findById(contactId);
    if (c === null) {
      logger.log('info', 'ai.reply.skipped', { contactId, reason: 'contact_missing' });
      return { outcome: { kind: 'skipped', reason: 'contact_missing' } };
    }
    // Guard calls are AiUsage rows too, so the budget covers them before any billed call.
    const todayCost = await usage.sumCost(bangkokDayRange(clock.now()));
    const decision = shouldAiReply({
      killSwitchOn: s.aiEnabled,
      contact: c,
      latestInbound: latest,
      todayCost,
      dailyBudget: s.aiDailyBudget,
    });
    if (!decision.reply) {
      if (decision.handoff !== null) return { outcome: await handoff(c, decision.handoff) };
      logger.log('info', 'ai.reply.skipped', { contactId, reason: decision.reason });
      return { outcome: { kind: 'skipped', reason: decision.reason } };
    }
    return { ready: { c, s, latest } };
  };

  /**
   * The lock is taken once, after the checks of round 1, and held until the run ends: the wait
   * before a later round happens while holding it. A run of a message that arrives meanwhile
   * therefore gets `locked` (or `superseded`) and can never read a history that ends with this
   * run's reply; the next round of the holder answers that message instead.
   */
  return async ({ contactId, triggerMessageId }) => {
    await clock.sleep(config.aiDebounceMs);
    let checked = await checkRound(contactId, triggerMessageId, true);
    if ('outcome' in checked) return ok(checked.outcome);

    if (!(await contacts.tryAcquireAiLock(contactId, clock.now()))) {
      logger.log('info', 'ai.reply.locked', { contactId });
      return ok({ kind: 'locked' });
    }
    try {
      const earlier: RoundTrace[] = [];
      for (let round = 1; ; round += 1) {
        const { c, s, latest } = checked.ready;
        const trace: RoundTrace = { seenSeq: latest.seq, replyIds: [] };
        const outcome = await replyOnce(c, s, earlier, trace);
        if (outcome.kind === 'cancelled') return ok(outcome);
        earlier.push(trace);
        // A message the model already saw in this round's history is not newer, so it is not
        // answered twice.
        const newer = await messages.latestInbound(contactId);
        if (newer === null || newer.seq <= trace.seenSeq) return ok(outcome);
        const last = round >= AI_MAX_ROUNDS_PER_RUN;
        if (!last) await clock.sleep(config.aiDebounceMs);
        checked = await checkRound(contactId, triggerMessageId, false);
        if ('outcome' in checked) return ok(checked.outcome);
        // No round left: the run of that message already got `locked`, or would read a history
        // that ends with this run's reply, so an admin is asked to answer it.
        if (last) return ok(await handoff(checked.ready.c, 'ai_timeout'));
      }
    } finally {
      await contacts.releaseAiLock(contactId);
    }
  };
};
