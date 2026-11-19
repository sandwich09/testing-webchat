// Manual AI quality run (docs/specs/ai-prompt.md section 8). It calls the real Claude API and
// costs money, so it runs only when the owner asks:  pnpm ai:eval -- --confirm [--model <id>]
// Without --confirm it exits with code 1 before it reads the environment, builds a client or
// touches the network. Pure logic and pass criteria are in scripts/ai-eval.logic.ts.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { AiModelId, ChatTurn } from '@/core/domain';
import {
  AI_EXTRACT_MAX_TOKENS,
  AI_MAX_TOKENS,
  buildGuardRulesBlock,
  buildSystemInstructions,
  computeCost,
  formatKnowledgeBase,
  GUARD_MAX_TOKENS,
  GUARD_MODEL,
  GUARD_TIMEOUT_MS,
  guardContextTurns,
  guardRefusalText,
  guardVerdictOf,
  PRICE_TABLE,
  sanitizeAiReply,
} from '@/core/domain';
import {
  EVAL_AI_NAME,
  EVAL_CUSTOM_INSTRUCTIONS,
  EVAL_GUARD_TOPICS,
  EVAL_PARTICLE,
  EVAL_SAMPLE_ANSWER_MODE,
  questionsOfRound,
  bangkokDate,
  judgeRun,
  parseArgs,
  renderReport,
  resultFileName,
  suiteResult,
  type ChatRun,
  type EvalQuestion,
  type EvalRound,
  type GuardRun,
  type Judged,
  type QuestionRun,
} from './ai-eval.logic';

const PDF_URL = new URL('../e2e/fixtures/kb/tonhom-cafe.pdf', import.meta.url);
const QA_DIR = new URL('../docs/qa/', import.meta.url);
const KB_FILE_NAME = 'tonhom-cafe.pdf';

/** What the later questions of a chat need: the history so far and the last assistant reply. */
interface ChatState {
  history: ChatTurn[];
  reply: string | null;
}

/** A customer turn after a customer turn (the earlier question got no visible answer) is merged. */
const withCustomerTurn = (history: readonly ChatTurn[], text: string): ChatTurn[] => {
  const last = history.at(-1);
  if (last?.role === 'customer')
    return [...history.slice(0, -1), { role: 'customer', text: `${last.text}\n${text}` }];
  return [...history, { role: 'customer', text }];
};

const nowMs = (): number => performance.now();

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.ok) {
    console.error(args.message);
    return 1;
  }
  const { model } = args;

  // Everything below spends money. Check what can fail before the first call.
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (apiKey === undefined || apiKey.trim() === '') {
    console.error('ai-eval: ANTHROPIC_API_KEY is not set. Nothing was called.');
    return 1;
  }
  const startedAt = new Date();
  const outUrl = new URL(resultFileName(startedAt, model), QA_DIR);
  const exists = await readFile(outUrl).then(
    () => true,
    () => false,
  );
  if (exists) {
    console.error(
      'ai-eval: the result file of today for this model already exists. Nothing was called.',
    );
    return 1;
  }
  const pdf = new Uint8Array(await readFile(PDF_URL));

  const { createClaudeChatModel, createClaudeDocumentExtractor, createClaudeTopicGuard } =
    await import('@/adapters/claude');
  const options = { apiKey };
  const extractor = createClaudeDocumentExtractor(options);
  const chatModel = createClaudeChatModel(options);
  const topicGuard = createClaudeTopicGuard(options);

  const costOf = (usage: ChatRun['usage'], servedModel: string): bigint =>
    computeCost(usage, servedModel, PRICE_TABLE).cost;

  // 1. Convert the PDF.
  console.log(`ai-eval: model ${model}, converting ${KB_FILE_NAME}`);
  const t0 = nowMs();
  const extracted = await extractor.extract({ model, pdf, maxTokens: AI_EXTRACT_MAX_TOKENS });
  const extractMs = nowMs() - t0;
  if (!extracted.ok || extracted.value.stop !== 'completed' || extracted.value.text === null) {
    console.error('ai-eval: the PDF conversion gave no text. Stopped, no result file written.');
    return 1;
  }
  const kbText = extracted.value.text;
  const extraction = {
    ms: extractMs,
    usage: extracted.value.usage,
    cost: costOf(extracted.value.usage, extracted.value.servedModel),
    textChars: kbText.length,
  };

  // 2. Prompts (ai-prompt 8.1 item 2). Rounds 1 and 2: the café sample (AI name, knowledge-only
  // scope and the sample custom instructions). Round 3: the neutral defaults of a fresh install.
  const topics = [...EVAL_GUARD_TOPICS];
  const baseSystem = buildSystemInstructions({
    aiName: EVAL_AI_NAME,
    aiAnswerMode: EVAL_SAMPLE_ANSWER_MODE,
    aiPoliteParticle: EVAL_PARTICLE,
    aiInstructions: EVAL_CUSTOM_INSTRUCTIONS,
  });
  const neutralSystem = buildSystemInstructions({
    aiName: null,
    aiAnswerMode: 'general',
    aiPoliteParticle: EVAL_PARTICLE,
    aiInstructions: '',
  });
  const guardedSystem = `${baseSystem}\n\n${buildGuardRulesBlock(topics)}`;
  const refusal = guardRefusalText(EVAL_PARTICLE);
  const knowledgeText = formatKnowledgeBase([{ fileName: KB_FILE_NAME, text: kbText }]);
  const emptyKnowledge = formatKnowledgeBase([]);

  const askChat = async (
    system: string,
    history: ChatTurn[],
    knowledge = knowledgeText,
  ): Promise<{ run: ChatRun; blockedOffTopic: boolean }> => {
    const t = nowMs();
    const r = await chatModel.generateReply({
      model,
      systemInstructions: system,
      knowledgeText: knowledge,
      history,
      now: startedAt,
      maxTokens: AI_MAX_TOKENS,
    });
    const ms = nowMs() - t;
    if (!r.ok) {
      const empty = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
      return {
        run: { ms, usage: empty, cost: 0n, stop: 'error', output: null, error: r.error.code },
        blockedOffTopic: false,
      };
    }
    const v = r.value;
    return {
      run: {
        ms,
        usage: v.usage,
        cost: costOf(v.usage, v.servedModel),
        stop: v.stop,
        output: v.output,
        error: null,
      },
      blockedOffTopic:
        v.output?.needsAdmin === true && v.output.handoffReason === 'unsafe_or_offtopic',
    };
  };

  const askGuard = async (history: ChatTurn[]): Promise<GuardRun> => {
    const { message, context } = guardContextTurns(history);
    const t = nowMs();
    const r = await topicGuard.classify({
      topics,
      message,
      context,
      model: GUARD_MODEL,
      maxTokens: GUARD_MAX_TOKENS,
      timeoutMs: GUARD_TIMEOUT_MS,
    });
    const ms = nowMs() - t;
    if (!r.ok) {
      const empty = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
      return {
        ms,
        usage: empty,
        cost: 0n,
        verdict: 'failed',
        matchedTopic: null,
        error: r.error.code,
      };
    }
    const v = guardVerdictOf(r.value, topics);
    return {
      ms,
      usage: r.value.usage,
      cost: costOf(r.value.usage, r.value.servedModel),
      verdict: v.verdict,
      matchedTopic: v.matchedTopic,
      error: v.error,
    };
  };

  // 3. One round over all questions. Each chat starts empty unless the question continues another.
  const runRound = async (round: EvalRound): Promise<Judged[]> => {
    const states = new Map<string, ChatState>();
    const judged: Judged[] = [];
    for (const question of questionsOfRound(round)) {
      const before: ChatState | undefined =
        question.after === null ? undefined : states.get(question.after);
      const history = withCustomerTurn(before?.history ?? [], question.text);
      const run: QuestionRun =
        round === 2
          ? await runRound2(question, history)
          : await runChatOnly(round, question, history);
      const visible = run.visibleText;
      states.set(question.id, {
        history: visible === null ? history : [...history, { role: 'assistant', text: visible }],
        reply: visible,
      });
      const j = judgeRun(
        run,
        {
          systemInstructions: round === 3 ? neutralSystem : baseSystem,
          previousReply: before?.reply ?? null,
        },
        refusal,
      );
      judged.push(j);
      // Ids, verdicts, time and cost only. Customer text and model output stay out of the console.
      console.log(
        `ai-eval: round ${String(round)} ${question.id} ${j.pass ? 'pass' : 'fail'} ` +
          `${j.totalMs.toFixed(0)} ms`,
      );
    }
    return judged;
  };

  const runChatOnly = async (
    round: 1 | 3,
    question: EvalQuestion,
    history: ChatTurn[],
  ): Promise<QuestionRun> => {
    const { run: chat } =
      round === 1
        ? await askChat(baseSystem, history)
        : await askChat(neutralSystem, history, emptyKnowledge);
    const reply = chat.output?.reply ?? null;
    return {
      id: question.id,
      round,
      guard: null,
      chat,
      visibleText: reply === null ? null : (sanitizeAiReply(reply) ?? reply),
      blockedBy: null,
    };
  };

  const runRound2 = async (question: EvalQuestion, history: ChatTurn[]): Promise<QuestionRun> => {
    const guard = await askGuard(history);
    const base = { id: question.id, round: 2 as const, guard };
    if (guard.verdict === 'failed') {
      return { ...base, chat: null, visibleText: null, blockedBy: null };
    }
    if (guard.verdict === 'blocked') {
      return {
        ...base,
        chat: null,
        visibleText: refusal,
        blockedBy: 'classifier',
      };
    }
    const { run: chat, blockedOffTopic } = await askChat(guardedSystem, history);
    if (blockedOffTopic) {
      return { ...base, chat, visibleText: refusal, blockedBy: 'chat_model' };
    }
    const reply = chat.output?.reply ?? null;
    return {
      ...base,
      chat,
      visibleText: reply === null ? null : (sanitizeAiReply(reply) ?? reply),
      blockedBy: null,
    };
  };

  const round1 = await runRound(1);
  const round2 = await runRound(2);
  const round3 = await runRound(3);

  const report = renderReport({
    date: bangkokDate(startedAt),
    model: model satisfies AiModelId,
    guardModel: GUARD_MODEL,
    priceAsOf: PRICE_TABLE.asOf,
    extraction,
    round1,
    round2,
    round3,
  });
  await writeFile(fileURLToPath(outUrl), report, { encoding: 'utf8', flag: 'wx' });
  const suite = suiteResult(round1, round2, round3);
  console.log(
    `ai-eval: wrote docs/qa/${resultFileName(startedAt, model)}, suite ${suite.pass ? 'pass' : 'fail'}`,
  );
  return 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  () => {
    // The message of an error could hold request details, so only the fact is printed.
    console.error('ai-eval: stopped by an unexpected error. No result file was written.');
    process.exitCode = 1;
  },
);
