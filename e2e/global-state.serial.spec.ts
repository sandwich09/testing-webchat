import { fileURLToPath } from 'node:url';
import type { APIRequestContext, Page } from '@playwright/test';
import {
  AI_START_MARKER,
  GUARD_MAX_TOPICS,
  RICH_MENU_LABELS,
  adminRequestedText,
  defaultHowToText,
  GUARD_MODEL,
  guardRefusalText,
  LINE_CHANNEL_ID_MAX_CHARS,
  handoffText,
  type PoliteParticle,
} from '../src/core/domain';
import {
  STUB_CHANNEL_ACCESS_TOKEN,
  STUB_CHANNEL_ID,
  STUB_CHANNEL_SECRET,
} from './fixtures/line/credentials';
import { AUTH_STATE_PATH } from './helpers/auth';
import { expectNoA11yViolations } from './helpers/axe';
import { expectDocumentNotScrollable } from './helpers/layout';
import { createContactWithMessage, nextEventVars } from './helpers/contact';
import { uiCopy } from './helpers/copy';
import {
  backToList,
  bubbleBlock,
  bubbles,
  hideInfoPanel,
  openChat,
  row,
  sendText,
  showInfoPanel,
  systemLine,
  toastWith,
  uniqueSuffix,
} from './helpers/inbox';
import { newFixtureVars, postLineWebhook, type FixtureVars } from './helpers/line-webhook';
import {
  deleteKbDocument,
  getSettings,
  listKbDocuments,
  patchSettings,
  removeRichMenu,
  type SettingsSnapshot,
} from './helpers/settings';
import {
  stubClaudeCountTokens,
  stubClaudeDelayNext,
  stubClaudeNextReply,
  stubClaudeRequests,
  stubLineProfile,
  stubLineRequests,
  type RecordedRequest,
} from './helpers/stub';
import { testIds } from './helpers/test-ids';
import { expect, failedResourceLine, test } from './helpers/test';
import { waitAiIdle } from './helpers/wait';

// Journeys 3, 4, 6, 9, 14 and 15 change global state (kill switch, knowledge base, topic guard,
// rich menu, welcome card), so they
// run one at a time in this one file (stubs-and-fixtures 6.1), in `serial-desktop` and then
// `serial-mobile`. Each test puts back what it changed; `afterEach` restores the snapshot taken
// before the file started, even when a test failed half way.
test.describe.configure({ mode: 'serial' });

/** Reply cost of the default `reply` usage of the stub per model (stubs-and-fixtures 5.3). */
const REPLY_COST_USD: Record<string, number> = {
  'claude-opus-5-5': 0.0064,
  'claude-sonnet-5-5': 0.0032,
  'claude-haiku-5-5': 0.00016,
};

let initial: SettingsSnapshot;
let initialDocumentIds: Set<string>;

test.beforeAll(async ({ playwright, baseURL }) => {
  const api = await playwright.request.newContext({ baseURL, storageState: AUTH_STATE_PATH });
  try {
    initial = await getSettings(api);
    initialDocumentIds = new Set((await listKbDocuments(api)).map((d) => d.id));
  } finally {
    await api.dispose();
  }
  // Every journey here needs AI on for the whole system at the start.
  expect(initial.ai.enabled).toBe(true);
  expect(initial.guard.enabled).toBe(false);
  expect(initial.richMenu.published).toBe(false);
});

test.afterEach(async ({ request }) => {
  const now = await getSettings(request);
  const sameTopics = JSON.stringify(now.guard.topics) === JSON.stringify(initial.guard.topics);
  if (now.ai.enabled !== initial.ai.enabled || now.guard.enabled !== initial.guard.enabled) {
    await patchSettings(request, {
      aiEnabled: initial.ai.enabled,
      guardEnabled: initial.guard.enabled,
    });
  }
  if (!sameTopics) await patchSettings(request, { guardTopics: initial.guard.topics });
  if (now.richMenu.published) await removeRichMenu(request);
  if (
    now.richMenu.howToText !== initial.richMenu.howToText ||
    now.welcome.text !== initial.welcome.text ||
    now.welcome.enabled !== initial.welcome.enabled
  ) {
    await patchSettings(request, {
      howToText: initial.richMenu.howToText,
      welcomeText: initial.welcome.text,
      welcomeEnabled: initial.welcome.enabled,
    });
  }
  for (const doc of await listKbDocuments(request)) {
    if (!initialDocumentIds.has(doc.id)) await deleteKbDocument(request, doc.id);
  }
});

type ClaudeBody = {
  model?: string;
  output_config?: { effort?: string };
  system?: Array<{ text?: string }>;
  messages?: Array<{ role: string; content: unknown }>;
};
type LineBody = { to?: string; replyToken?: string; messages?: Array<{ text?: string }> };

const claudeBody = (r: RecordedRequest | undefined): ClaudeBody => r?.body ?? {};

/** The text of a message's content, whether a string or content blocks. */
function contentText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((block) => ((block as { text?: unknown }).text ?? '') as string).join('\n');
  }
  return '';
}

function lastUserText(body: ClaudeBody): string {
  const users = (body.messages ?? []).filter((m) => m.role === 'user');
  return contentText(users.at(-1)?.content);
}

/** Texts LINE received for a customer: pushes to them and replies with their reply tokens. */
async function lineTextsTo(v: FixtureVars, replyTokens: string[]): Promise<string[]> {
  const all = [
    ...(await stubLineRequests({ endpoint: 'reply' })),
    ...(await stubLineRequests({ endpoint: 'push', to: v.userId })),
  ];
  return all
    .map((r) => (r.body ?? {}) as LineBody)
    .filter((b) => b.to === v.userId || replyTokens.includes(b.replyToken ?? ''))
    .flatMap((b) => (b.messages ?? []).map((m) => m.text ?? ''));
}

/** Sends one text from the customer and returns the event's variables. */
async function customerSays(request: APIRequestContext, v: FixtureVars, text: string) {
  const vars = nextEventVars(v, { text });
  const response = await postLineWebhook(request, 'message-text', vars);
  expect(response.status()).toBe(200);
  return vars;
}

async function turnContactAiOn(page: Page): Promise<void> {
  const aiSwitch = page.getByTestId(testIds.threadAiSwitch);
  await expect(aiSwitch).toHaveAttribute('aria-checked', 'false');
  await aiSwitch.click();
  await expect(aiSwitch).toHaveAttribute('aria-checked', 'true');
}

/** Today's date in Bangkok time, the day of the guard counter and the daily budget. */
function bangkokDay(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
}

/** The number at the end of a text such as "รอแอดมิน 3". */
async function trailingNumber(page: Page, testId: string): Promise<number> {
  const text = (await page.getByTestId(testId).textContent()) ?? '';
  const match = /(\d[\d,]*)\D*$/.exec(text);
  if (match?.[1] === undefined) throw new Error(`No number in "${text}"`);
  return Number(match[1].replace(/,/g, ''));
}

test.describe('journey 3: AI replies for the customer', () => {
  test('AI answers, hands off, merges a burst and stops when the admin replies', async ({
    page,
    request,
    isMobile,
  }) => {
    const suffix = uniqueSuffix();
    const name = `ลูกค้า AI ${suffix}`;
    const particle = initial.ai.politeParticle as PoliteParticle;

    // 3.1
    const v = await createContactWithMessage(request, { displayName: name, text: `ทัก ${suffix}` });
    const contactId = await openChat(page, name);
    await expect(page.getByTestId(testIds.threadAiSwitch)).toHaveAttribute('aria-checked', 'false');

    // 3.2
    await turnContactAiOn(page);
    await expect(page.getByTestId(testIds.threadSubline)).toContainText(
      uiCopy('inbox.thread.aiHelping'),
    );

    // 3.3
    const q = `ร้านเปิดกี่โมง ${suffix}`;
    const answer = `ร้านเปิด 08:00 ถึง 18:00 ค่ะ ${suffix}`;
    await stubClaudeNextReply({
      match: q,
      json: { reply: answer, needsAdmin: false, handoffReason: null },
    });

    // 3.4
    const qVars = await customerSays(request, v, q);
    const aiBubble = bubbles(page, { author: 'ai', text: answer });
    await expect(aiBubble).toHaveCount(1);
    await expect(bubbleBlock(aiBubble).getByTestId(testIds.messageSender)).toHaveText(
      uiCopy('inbox.message.senderAi'),
    );

    // 3.5
    const calls = await stubClaudeRequests({ match: q });
    expect(calls).toHaveLength(1);
    const body = claudeBody(calls[0]);
    expect(body.output_config?.effort).toBe('low');
    expect(body.system?.[1]?.text?.startsWith('<knowledge>')).toBe(true);
    // The last turn before the trailing system message is the customer's (ai-prompt).
    const turns = (body.messages ?? []).filter((m) => m.role !== 'system');
    expect(body.messages?.at(-1)?.role).toBe('system');
    expect(turns.at(-1)?.role).toBe('user');
    expect(contentText(turns.at(-1)?.content)).toContain(q);

    // 3.6
    expect(await lineTextsTo(v, [qVars.replyToken])).toContain(answer);

    // 3.7: the model asks for the admin; the customer gets the fixed handoff text instead.
    const q2 = `ขอคุยกับคน ${suffix}`;
    const modelText = `เรื่องนี้ขอให้แอดมินมาตอบนะคะ ${suffix}`;
    await stubClaudeNextReply({
      match: q2,
      json: { reply: modelText, needsAdmin: true, handoffReason: 'not_in_knowledge' },
    });
    await customerSays(request, v, q2);
    const handoff = bubbles(page, { author: 'ai', text: handoffText(particle) });
    await expect(handoff).toHaveCount(1);
    await expect(bubbles(page, { text: modelText })).toHaveCount(0);
    await expect(
      bubbleBlock(handoff).locator(
        `xpath=following::*[@data-testid="${testIds.systemLine}" and @data-event-code="handoff.ai_not_in_knowledge"]`,
      ),
    ).toBeVisible();
    await backToList(page, isMobile);
    await expect(row(page, name)).toHaveAttribute('data-needs-admin', 'true');
    expect(await trailingNumber(page, testIds.contactTabNeedsAdmin)).toBeGreaterThanOrEqual(1);
    if (isMobile) await openChat(page, name);

    // 3.8: three texts in a burst become one model call with all three in the last turn.
    const burst = `รัว ${suffix}`;
    const burstVars = nextEventVars(v, {
      text: `${burst} หนึ่ง`,
      text2: `${burst} สอง`,
      text3: `${burst} สาม`,
    });
    await stubClaudeNextReply({
      match: `${burst} สาม`,
      json: { reply: `ตอบรวม ${suffix}`, needsAdmin: false, handoffReason: null },
    });
    expect((await postLineWebhook(request, 'burst-three-texts', burstVars)).status()).toBe(200);
    await expect(bubbles(page, { author: 'ai', text: `ตอบรวม ${suffix}` })).toHaveCount(1);
    await waitAiIdle(request, contactId);
    const burstCalls = await stubClaudeRequests({ match: burst });
    expect(burstCalls).toHaveLength(1);
    const burstTurn = lastUserText(claudeBody(burstCalls[0]));
    for (const part of ['หนึ่ง', 'สอง', 'สาม']) expect(burstTurn).toContain(`${burst} ${part}`);

    // 3.9: the admin answers, so AI turns off for this customer with an event line.
    await sendText(page, `แอดมินตอบเอง ${suffix}`);
    await expect(page.getByTestId(testIds.threadAiSwitch)).toHaveAttribute('aria-checked', 'false');
    await expect(systemLine(page, 'ai.turned_off_by_admin')).toBeVisible();
    const info = await showInfoPanel(page);
    await expect(info.getByTestId(testIds.infoAiNote)).toHaveText(uiCopy('inbox.ai.noteOff'));
    await hideInfoPanel(page);
    await backToList(page, isMobile);
    await expect(row(page, name)).toHaveAttribute('data-needs-admin', 'false');
    if (isMobile) await openChat(page, name);

    // 3.10
    const q3 = `ยังอยู่ไหม ${suffix}`;
    await customerSays(request, v, q3);
    await expect(bubbles(page, { author: 'customer', text: q3 })).toHaveCount(1);
    await waitAiIdle(request, contactId);
    expect(await stubClaudeRequests({ match: q3 })).toEqual([]);

    // 3.11: a picture is never answered by AI; it goes to the admin.
    await turnContactAiOn(page);
    expect((await postLineWebhook(request, 'message-image', nextEventVars(v))).status()).toBe(200);
    await expect(systemLine(page, 'handoff.customer_sent_image')).toBeVisible();

    // 3.12: three model calls (3.4, 3.7, 3.8) at the stub's default usage.
    const expectedCost = 3 * (REPLY_COST_USD[initial.ai.model] ?? Number.NaN);
    const usage = (await (await request.get('/api/usage')).json()) as {
      contacts: Array<{ contactId: string | null; costUsd: string; replyCount: number }>;
    };
    const usageRow = usage.contacts.find((c) => c.contactId === contactId);
    expect(Number(usageRow?.costUsd)).toBeCloseTo(expectedCost, 9);
    await page.goto('/settings');
    const screenRow = page.locator(
      `[data-testid="${testIds.usageRow}"][data-contact-id="${contactId}"]`,
    );
    await expect(screenRow).toContainText(`$${expectedCost.toFixed(2)}`);
  });
});

test.describe('journey 4: kill switch', () => {
  test('the kill switch stops AI everywhere and the contact switch comes back', async ({
    page,
    request,
    isMobile,
  }) => {
    const suffix = uniqueSuffix();
    const name = `ลูกค้า kill ${suffix}`;

    // 4.1
    const v = await createContactWithMessage(request, { displayName: name, text: `ทัก ${suffix}` });
    const contactId = await openChat(page, name);
    await turnContactAiOn(page);

    try {
      // 4.2a: the model is a themed listbox driven by the keyboard. Escape closes it without a
      // change and gives focus back to the trigger.
      await page.goto('/settings');
      const model = page.getByTestId(testIds.settingsModel);
      const savedModel = await model.getAttribute('data-value');
      await model.focus();
      await model.press('Enter');
      await expect(model).toHaveAttribute('aria-expanded', 'true');
      const listbox = page.getByRole('listbox');
      await expect(listbox).toBeVisible();
      const options = listbox.getByTestId(testIds.settingsModelOption);
      await expect(options).toHaveCount(3);
      await expect(options.and(page.locator('[aria-selected="true"]'))).toHaveAttribute(
        'data-value',
        savedModel ?? '',
      );
      await model.press('End');
      await expect(options.last()).toHaveAttribute('data-active', 'true');
      await expect(model).toHaveAttribute(
        'aria-activedescendant',
        (await options.last().getAttribute('id')) ?? '',
      );
      await model.press('Escape');
      await expect(listbox).toBeHidden();
      await expect(model).toHaveAttribute('aria-expanded', 'false');
      await expect(model).toBeFocused();
      await expect(model).toHaveAttribute('data-value', savedModel ?? '');
      // The month of the usage report: a click on another month shows that month.
      const month = page.getByTestId(testIds.usageMonth);
      await expect(month).toHaveAttribute('data-value', /^\d{4}-\d{2}$/);
      await month.click();
      const previous = page.getByTestId(testIds.usageMonthOption).nth(1);
      const previousValue = (await previous.getAttribute('data-value')) ?? '';
      await previous.click();
      await expect(month).toHaveAttribute('data-value', previousValue);
      await expect(page.getByRole('listbox')).toBeHidden();
      await expectDocumentNotScrollable(page);

      // 4.2
      const killSwitch = page.getByTestId(testIds.settingsKillSwitch);
      await expect(killSwitch).toHaveAttribute('aria-checked', 'true');
      await killSwitch.click();
      await expect(killSwitch).toHaveAttribute('aria-checked', 'false');
      await expect(
        toastWith(page, uiCopy('settings.ai.killSwitchOffToast'), 'success'),
      ).toBeVisible();

      // 4.3: only the inner columns scroll, on the list and in a chat.
      await page.goto('/chats');
      await expect(page.getByTestId(testIds.contactList)).toBeVisible();
      await expectDocumentNotScrollable(page);
      await openChat(page, name);
      await expectDocumentNotScrollable(page);
      if (!isMobile) {
        // A wide, short window as well (ui-screens 1.4).
        const size = page.viewportSize();
        await page.setViewportSize({ width: 1535, height: 920 });
        await expectDocumentNotScrollable(page);
        if (size !== null) await page.setViewportSize(size);
      }
      const aiSwitch = page.getByTestId(testIds.threadAiSwitch);
      await expect(aiSwitch).toBeDisabled();
      await expect(aiSwitch).toHaveAttribute('aria-checked', 'false');
      await expect(page.getByTestId(testIds.threadAiLabel)).toHaveText(
        uiCopy('inbox.ai.labelKilled'),
      );
      const info = await showInfoPanel(page);
      await expect(info.getByTestId(testIds.infoAiSwitch)).toBeDisabled();
      await expect(info.getByTestId(testIds.infoAiNote)).toHaveText(uiCopy('inbox.ai.noteKilled'));
      await hideInfoPanel(page);

      // 4.4
      const q = `มีใครอยู่ไหม ${suffix}`;
      await customerSays(request, v, q);
      await expect(bubbles(page, { author: 'customer', text: q })).toHaveCount(1);
      await waitAiIdle(request, contactId);
      expect(await stubClaudeRequests({ match: q })).toEqual([]);

      // 4.5
      await page.goto('/settings');
      await killSwitch.click();
      await expect(killSwitch).toHaveAttribute('aria-checked', 'true');
      await expect(
        toastWith(page, uiCopy('settings.ai.killSwitchOnToast'), 'success'),
      ).toBeVisible();

      // 4.6: the contact's own switch kept its value.
      await openChat(page, name);
      await expect(aiSwitch).toBeEnabled();
      await expect(aiSwitch).toHaveAttribute('aria-checked', 'true');

      // 4.7: the LINE section shows the saved Channel ID (not secret) and that LINE confirmed the
      // pair; saving the same values again checks the secret with LINE and keeps the Channel ID.
      await page.goto('/settings');
      const line = page.getByTestId(testIds.settingsSectionLine);
      const channelId = line.getByTestId(testIds.lineChannelId);
      await expect(channelId).toHaveValue(STUB_CHANNEL_ID);
      await expect(line.getByTestId(testIds.lineSecretStatus)).toHaveAttribute(
        'data-status',
        'verified',
      );
      await expect(line.getByTestId(testIds.lineChannelSecret)).toHaveValue('');
      await channelId.fill('12ab');
      await line.getByTestId(testIds.lineSave).click();
      await expect(
        line.getByText(
          uiCopy('settings.line.error.channelIdInvalid', { max: LINE_CHANNEL_ID_MAX_CHARS }),
        ),
      ).toBeVisible();
      const oauthBefore = (await stubLineRequests({ endpoint: 'oauth-token' })).length;
      await channelId.fill(STUB_CHANNEL_ID);
      await line.getByTestId(testIds.lineChannelSecret).fill(STUB_CHANNEL_SECRET);
      await line.getByTestId(testIds.lineAccessToken).fill(STUB_CHANNEL_ACCESS_TOKEN);
      await line.getByTestId(testIds.lineSave).click();
      await expect(toastWith(page, uiCopy('settings.line.savedToast'), 'success')).toBeVisible();
      const oauth = (await stubLineRequests({ endpoint: 'oauth-token' })).slice(oauthBefore);
      expect(oauth.map((r) => r.status)).toEqual([200]);
      await page.reload();
      await expect(channelId).toHaveValue(STUB_CHANNEL_ID);
      await expect(line.getByTestId(testIds.lineChannelSecret)).toHaveValue('');
      await expect(line.getByTestId(testIds.lineAccessToken)).toHaveValue('');
      await expect(line.getByTestId(testIds.lineSecretStatus)).toHaveAttribute(
        'data-status',
        'verified',
      );
    } finally {
      // 4.8
      if (!(await getSettings(request)).ai.enabled)
        await patchSettings(request, { aiEnabled: true });
      expect((await getSettings(request)).ai.enabled).toBe(true);
    }
  });
});

test.describe('journey 6: knowledge base', () => {
  const TINY_PDF = fileURLToPath(new URL('fixtures/kb/tiny.pdf', import.meta.url));
  const NOT_A_PDF = fileURLToPath(new URL('fixtures/kb/not-a-pdf.pdf', import.meta.url));
  /** Over KNOWLEDGE_CAPACITY_TOKENS together with anything already in the library. */
  const OVER_CAPACITY_TOKENS = 60_000;

  test('a PDF is uploaded, read by AI, refused when repeated or too big, and deleted', async ({
    page,
    request,
    consoleErrors,
  }) => {
    const suffix = uniqueSuffix();
    const marker = `KB-MARKER-${suffix}`;
    const tinyRow = page.locator(`[data-testid="${testIds.kbRow}"][data-file-name="tiny.pdf"]`);
    const uploadError = page.getByTestId(testIds.kbUploadError);
    const uploadInput = page.getByTestId(testIds.kbUploadInput);
    const documentPosts: string[] = [];
    page.on('request', (r) => {
      if (r.method() === 'POST' && new URL(r.url()).pathname === '/api/knowledge/documents') {
        documentPosts.push(r.url());
      }
    });

    // 6.1: the extraction request carries the PDF bytes but no file name (ai-prompt 7), so the
    // stub cannot match it by name; this file runs alone, so the next extraction is this one.
    // The delay holds it a little so the processing state is visible for sure.
    await stubClaudeNextReply({ kind: 'extract', text: `Tonhom Cafe\n${marker}` });
    await stubClaudeDelayNext({ ms: 1500 });

    // 6.2
    await page.goto('/settings');
    const usageText = page.getByTestId(testIds.kbUsageText);
    await expect(usageText).toBeVisible();
    const usageBefore = await usageText.textContent();
    await uploadInput.setInputFiles(TINY_PDF);
    await expect(tinyRow).toHaveAttribute('data-status', 'processing');
    await expect(tinyRow).toHaveAttribute('data-status', 'ready');

    // 6.3
    await expect(usageText).not.toHaveText(usageBefore ?? '');

    // 6.4
    const view = tinyRow.getByTestId(testIds.kbRowView);
    await view.click();
    await expect(page.getByTestId(testIds.kbTextDialog)).toBeVisible();
    await expect(page.getByTestId(testIds.kbTextContent)).toContainText(marker);
    await page.getByTestId(testIds.kbTextClose).click();
    await expect(page.getByTestId(testIds.kbTextDialog)).toBeHidden();
    await expect(view).toBeFocused();

    // 6.5: the 409 of the duplicate is provoked on purpose.
    consoleErrors.allow(failedResourceLine(409));
    await uploadInput.setInputFiles(TINY_PDF);
    await expect(uploadError).toHaveAttribute('data-code', 'knowledge.duplicate');
    await expect(tinyRow).toHaveCount(1);

    // 6.6: checked in the browser, so no request.
    const postsBefore = documentPosts.length;
    await uploadInput.setInputFiles(NOT_A_PDF);
    await expect(uploadError).toHaveAttribute('data-code', 'not_pdf');
    expect(documentPosts).toHaveLength(postsBefore);

    // 6.7: AI gets the document in its knowledge.
    const name = `ลูกค้าคลัง ${suffix}`;
    const v = await createContactWithMessage(request, { displayName: name, text: `ทัก ${suffix}` });
    const contactId = await openChat(page, name);
    await turnContactAiOn(page);
    const q = `มีอะไรในไฟล์ ${suffix}`;
    await customerSays(request, v, q);
    await expect(bubbles(page, { author: 'ai' })).toHaveCount(1);
    await waitAiIdle(request, contactId);
    const calls = await stubClaudeRequests({ match: q, purpose: 'reply' });
    expect(calls).toHaveLength(1);
    const knowledge = claudeBody(calls[0]).system?.[1]?.text ?? '';
    expect(knowledge).toContain('<document name="tiny.pdf">');
    expect(knowledge).toContain(marker);

    // 6.8
    await page.goto('/settings');
    await tinyRow.getByTestId(testIds.kbRowDelete).click();
    await expect(page.getByTestId(testIds.kbDeleteDialog)).toBeVisible();
    await expect(page.getByTestId(testIds.kbDeleteCancel)).toBeFocused();

    // 6.9
    await page.getByTestId(testIds.kbDeleteConfirm).click();
    await expect(tinyRow).toHaveCount(0);
    await expect(toastWith(page, uiCopy('settings.kb.deletedToast'), 'success')).toBeVisible();
    // The dialog leaves the DOM after its close animation; until then Radix keeps the rest of the
    // page aria-hidden, which axe in 6.11 would report.
    await expect(page.getByTestId(testIds.kbDeleteDialog)).toHaveCount(0);

    // 6.10: too many tokens for the library; the document never becomes ready.
    await stubClaudeCountTokens({ value: OVER_CAPACITY_TOKENS });
    await uploadInput.setInputFiles(TINY_PDF);
    await expect(tinyRow).toHaveAttribute('data-status', 'failed');
    await expect(tinyRow.getByTestId(testIds.kbRowStatus)).toHaveAttribute(
      'data-code',
      'knowledge.capacity_exceeded',
    );

    // 6.11
    await expectNoA11yViolations(page);
  });
});

test.describe('journey 9: topic guard', () => {
  test('in-topic messages get AI answers and the rest get the refusal', async ({
    page,
    request,
    isMobile,
  }) => {
    const suffix = uniqueSuffix();
    const topics = ['มุกตลกไทย', 'มุกจากภาพยนตร์'];

    // 9.1
    await page.goto('/settings');
    const order = await page
      .locator('[data-testid^="settings-section-"]')
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-testid')));
    expect(order.indexOf(testIds.settingsSectionGuard)).toBe(
      order.indexOf(testIds.settingsSectionAi) + 1,
    );
    const topicItems = page.getByTestId(testIds.guardTopic);
    const counter = page.getByTestId(testIds.guardTopicsCounter);
    const topicInput = page.getByTestId(testIds.guardTopicInput);
    await expect(counter).toHaveText(
      uiCopy('settings.guard.topicsCounter', {
        n: initial.guard.topics.length,
        max: GUARD_MAX_TOPICS,
      }),
    );
    const before = {
      blocked: await trailingNumber(page, testIds.guardBlockedToday),
      day: bangkokDay(),
      // The refusal is fixed; only its ending follows the particle of the AI section.
      refusal: guardRefusalText(initial.ai.politeParticle as PoliteParticle),
    };

    try {
      // 9.2: the list is edited one topic at a time; every add and remove saves at once.
      for (let left = initial.guard.topics.length; left > 0; left -= 1) {
        await topicItems.first().getByTestId(testIds.guardTopicRemove).click();
        await expect(topicItems).toHaveCount(left - 1);
      }
      await topicInput.fill(topics[0] ?? '');
      await topicInput.press('Enter');
      await expect(topicItems).toHaveCount(1);
      await expect(topicInput).toHaveValue('');
      await expect(topicInput).toBeFocused();
      await topicInput.fill(` ${topics[1] ?? ''} `);
      await page.getByTestId(testIds.guardTopicAdd).click();
      await expect(topicItems).toHaveCount(2);
      expect(
        await topicItems.evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-topic'))),
      ).toEqual(topics);
      await expect(counter).toHaveText(
        uiCopy('settings.guard.topicsCounter', { n: 2, max: GUARD_MAX_TOPICS }),
      );
      // A duplicate is refused under the input, and the typed text stays.
      await topicInput.fill(topics[0] ?? '');
      await topicInput.press('Enter');
      await expect(page.getByTestId(testIds.guardTopicsError)).toHaveAttribute(
        'data-code',
        'duplicate_topic',
      );
      await expect(topicInput).toHaveValue(topics[0] ?? '');
      await expect(topicItems).toHaveCount(2);
      expect((await getSettings(request)).guard.topics).toEqual(topics);
      await topicInput.fill('');
      const guardSwitch = page.getByTestId(testIds.guardSwitch);
      await guardSwitch.click();
      await expect(guardSwitch).toHaveAttribute('aria-checked', 'true');

      // 9.3
      const name = `ลูกค้าหัวข้อ ${suffix}`;
      const v = await createContactWithMessage(request, {
        displayName: name,
        text: `ทัก ${suffix}`,
      });
      const contactId = await openChat(page, name);
      await turnContactAiOn(page);
      const qa = `เล่ามุกหน่อย ${suffix}`;
      const joke = `มุกทดสอบ ${suffix}`;
      await stubClaudeNextReply({
        match: qa,
        kind: 'guard',
        json: { allowed: true, matchedTopic: topics[0] },
      });
      await stubClaudeNextReply({
        match: qa,
        kind: 'reply',
        json: { reply: joke, needsAdmin: false, handoffReason: null },
      });

      // 9.4
      await customerSays(request, v, qa);
      await expect(bubbles(page, { author: 'ai', text: joke })).toHaveCount(1);
      const guardCalls = await stubClaudeRequests({ match: qa, purpose: 'guard' });
      expect(guardCalls).toHaveLength(1);
      expect(claudeBody(guardCalls[0]).model).toBe(GUARD_MODEL);
      const replyCalls = await stubClaudeRequests({ match: qa, purpose: 'reply' });
      expect(replyCalls).toHaveLength(1);
      expect(claudeBody(replyCalls[0]).system?.[0]?.text).toContain('<topic_guard>');

      // 9.5
      const qb = `ร้านเปิดกี่โมง ${suffix}`;
      await stubClaudeNextReply({ match: qb, json: { allowed: false, matchedTopic: null } });
      const qbVars = await customerSays(request, v, qb);
      const refusals = bubbles(page, { author: 'ai', text: before.refusal });
      await expect(refusals).toHaveCount(1);
      await expect(bubbleBlock(refusals).getByTestId(testIds.messageSender)).toHaveText(
        uiCopy('inbox.message.senderAi'),
      );
      await expect(
        bubbleBlock(refusals).locator(
          `xpath=following::*[@data-testid="${testIds.systemLine}" and @data-event-code="guard.blocked"]`,
        ),
      ).toBeVisible();
      await expect.poll(() => lineTextsTo(v, [qbVars.replyToken])).toContain(before.refusal);

      // 9.6
      await waitAiIdle(request, contactId);
      expect(await stubClaudeRequests({ match: qb, purpose: 'reply' })).toEqual([]);
      await expect(page.getByTestId(testIds.threadAiSwitch)).toHaveAttribute(
        'aria-checked',
        'true',
      );
      // 9.6a: a greeting passes the guard (allowed, no topic) and reaches the chat model.
      const hello = `สวัสดีค่ะ ${suffix}`;
      const intro = `สวัสดีค่ะ ผู้ช่วยแนะนำตัว ${suffix}`;
      await stubClaudeNextReply({
        match: hello,
        kind: 'guard',
        json: { allowed: true, matchedTopic: null },
      });
      await stubClaudeNextReply({
        match: hello,
        kind: 'reply',
        json: { reply: intro, needsAdmin: false, handoffReason: null },
      });
      await customerSays(request, v, hello);
      await expect(bubbles(page, { author: 'ai', text: intro })).toHaveCount(1);
      expect(await stubClaudeRequests({ match: hello, purpose: 'guard' })).toHaveLength(1);
      const helloReplies = await stubClaudeRequests({ match: hello, purpose: 'reply' });
      expect(helloReplies).toHaveLength(1);
      expect(claudeBody(helloReplies[0]).system?.[0]?.text).toContain(
        'คำทักทาย ขอบคุณ และบอกลาสั้น ๆ ที่ไม่มีคำขออื่น',
      );

      // 9.6b: a greeting with an off-topic request is blocked; the chat model is not called.
      const helloWeather = `สวัสดีค่ะ ขอพยากรณ์อากาศ ${suffix}`;
      await stubClaudeNextReply({
        match: helloWeather,
        json: { allowed: false, matchedTopic: null },
      });
      await customerSays(request, v, helloWeather);
      await expect(bubbles(page, { author: 'ai', text: before.refusal })).toHaveCount(2);
      await waitAiIdle(request, contactId);
      expect(await stubClaudeRequests({ match: helloWeather, purpose: 'reply' })).toEqual([]);

      await backToList(page, isMobile);
      await expect(row(page, name)).toHaveAttribute('data-needs-admin', 'false');

      // 9.7
      await page.goto('/settings');
      await expect(page.getByTestId(testIds.guardBlockedToday)).toHaveText(
        // The counter is per Bangkok day: past midnight it starts again from these two messages.
        uiCopy('settings.guard.blockedToday', {
          n: bangkokDay() === before.day ? before.blocked + 2 : 2,
        }),
      );
    } finally {
      // 9.8: switch off through the screen, then put the saved topics back.
      await page.goto('/settings');
      const guardSwitch = page.getByTestId(testIds.guardSwitch);
      if ((await guardSwitch.getAttribute('aria-checked')) === 'true') await guardSwitch.click();
      await expect(guardSwitch).toHaveAttribute('aria-checked', 'false');
      await patchSettings(request, { guardTopics: initial.guard.topics });
      const after = await getSettings(request);
      expect(after.guard.enabled).toBe(false);
      expect(after.guard.topics).toEqual(initial.guard.topics);
    }
  });
});

/** Sends one tap of a rich menu or welcome card button from the customer. */
async function customerTaps(
  request: APIRequestContext,
  v: FixtureVars,
  action: 'ai_on' | 'admin' | 'how_to',
): Promise<FixtureVars> {
  const vars = nextEventVars(v, { postbackData: `tw1:${action}` });
  const response = await postLineWebhook(request, 'postback', vars);
  expect(response.status()).toBe(200);
  return vars;
}

/** The text messages LINE got in the reply that used `replyToken`. */
async function replyTexts(replyToken: string): Promise<string[]> {
  const replies = await stubLineRequests({ endpoint: 'reply' });
  return replies
    .map((r) => (r.body ?? {}) as LineBody)
    .filter((b) => b.replyToken === replyToken)
    .flatMap((b) => (b.messages ?? []).map((m) => m.text ?? ''));
}

test.describe('journey 14: rich menu', () => {
  test('publish, the three buttons in a chat, and remove', async ({ page, request }) => {
    const suffix = uniqueSuffix();
    const particle = initial.ai.politeParticle as PoliteParticle;
    const section = page.getByTestId(testIds.settingsSectionRichMenu);

    // 14.1 Publish from the settings page: create, upload on the data host, set as default.
    const since = Math.max(0, ...(await stubLineRequests()).map((r) => r.seq));
    await page.goto('/settings');
    await expect(section.getByTestId(testIds.richMenuStatus)).toHaveAttribute(
      'data-status',
      'not_published',
    );
    await section.getByTestId(testIds.richMenuPublish).click();
    await expect(
      toastWith(page, uiCopy('settings.richMenu.publishedToast'), 'success'),
    ).toBeVisible();
    await expect(section.getByTestId(testIds.richMenuStatus)).toHaveAttribute(
      'data-status',
      'published',
    );
    const calls = await stubLineRequests({ since });
    expect(calls.map((r) => [r.endpoint, r.status])).toEqual([
      ['richmenu-create', 200],
      ['richmenu-upload', 200],
      ['richmenu-default', 200],
    ]);
    expect(calls[1]?.service).toBe('line-data');
    expect(calls[1]?.headers.contentType).toBe('image/png');
    expect(calls[0]?.body).toMatchObject({
      size: { width: 2500, height: 843 },
      areas: [
        {
          action: {
            type: 'postback',
            data: 'tw1:ai_on',
            displayText: RICH_MENU_LABELS.ai_on.title,
          },
        },
        {
          action: {
            type: 'postback',
            data: 'tw1:admin',
            displayText: RICH_MENU_LABELS.admin.title,
          },
        },
        {
          action: {
            type: 'postback',
            data: 'tw1:how_to',
            displayText: RICH_MENU_LABELS.how_to.title,
          },
        },
      ],
    });

    // 14.2 The how-to text, edited and saved.
    const howTo = `ลองตามนี้ ${suffix}`;
    const howToField = section.getByTestId(testIds.settingsHowTo);
    await expect(howToField).toHaveValue(defaultHowToText(particle));
    await howToField.fill(howTo);
    await section.getByTestId(testIds.settingsHowToSave).click();
    await expect(toastWith(page, uiCopy('common.toast.saved'), 'success')).toBeVisible();

    // 14.3 A customer taps "วิธีทดสอบ": an event line and the saved text by reply.
    const name = `ลูกค้าเมนู ${suffix}`;
    const v = await createContactWithMessage(request, { displayName: name, text: `ทัก ${suffix}` });
    const contactId = await openChat(page, name);
    const howToTap = await customerTaps(request, v, 'how_to');
    await expect(systemLine(page, 'customer.tapped_how_to')).toHaveText('ลูกค้ากดปุ่ม วิธีทดสอบ');
    await expect(bubbles(page, { author: 'ai', text: howTo })).toHaveCount(1);
    expect(await replyTexts(howToTap.replyToken)).toEqual([howTo]);

    // 14.4 "คุยกับแอดมิน": AI off, waiting for an admin, the fixed reply.
    const adminTap = await customerTaps(request, v, 'admin');
    await expect(systemLine(page, 'customer.tapped_admin')).toBeVisible();
    await expect(systemLine(page, 'handoff.customer_asked_admin')).toBeVisible();
    await expect(bubbles(page, { author: 'ai', text: adminRequestedText(particle) })).toHaveCount(
      1,
    );
    expect(await replyTexts(adminTap.replyToken)).toEqual([adminRequestedText(particle)]);
    await expect(page.getByTestId(testIds.threadAiSwitch)).toHaveAttribute('aria-checked', 'false');

    // 14.5 "คุยกับ AI": AI on, and the AI greets through the normal path.
    const greeting = `สวัสดี ผู้ช่วยมาแล้ว ${suffix}`;
    await stubClaudeNextReply({
      match: 'เพื่อเริ่มคุย',
      json: { reply: greeting, needsAdmin: false, handoffReason: null },
    });
    await customerTaps(request, v, 'ai_on');
    await expect(systemLine(page, 'customer.tapped_ai_on')).toBeVisible();
    await expect(bubbles(page, { author: 'ai', text: greeting })).toHaveCount(1);
    await expect(page.getByTestId(testIds.threadAiSwitch)).toHaveAttribute('aria-checked', 'true');
    const [claude] = await stubClaudeRequests({ match: 'เพื่อเริ่มคุย', purpose: 'reply' });
    expect(lastUserText(claudeBody(claude))).toContain(AI_START_MARKER);
    // The button title never reaches the model as the customer's text.
    expect(lastUserText(claudeBody(claude))).not.toMatch(/^คุยกับ AI$/m);
    await waitAiIdle(request, contactId);

    // 14.6 Remove, and the how-to text back to the default.
    const beforeRemove = Math.max(0, ...(await stubLineRequests()).map((r) => r.seq));
    await page.goto('/settings');
    await section.getByTestId(testIds.richMenuRemove).click();
    await expect(
      toastWith(page, uiCopy('settings.richMenu.removedToast'), 'success'),
    ).toBeVisible();
    await expect(section.getByTestId(testIds.richMenuStatus)).toHaveAttribute(
      'data-status',
      'not_published',
    );
    expect((await stubLineRequests({ since: beforeRemove })).map((r) => r.endpoint)).toEqual([
      'richmenu-default-clear',
      'richmenu-delete',
    ]);
    await section.getByTestId(testIds.settingsHowToReset).click();
    await expect(toastWith(page, uiCopy('settings.richMenu.resetToast'), 'success')).toBeVisible();
    await expect(howToField).toHaveValue(defaultHowToText(particle));
  });
});

test.describe('journey 15: welcome card', () => {
  type FlexBody = {
    replyToken?: string;
    messages?: Array<{
      type?: string;
      contents?: { footer?: { contents?: Array<{ action?: { type?: string; data?: string } }> } };
    }>;
  };

  async function follow(request: APIRequestContext, displayName: string): Promise<FixtureVars> {
    const vars = newFixtureVars();
    await stubLineProfile({ userId: vars.userId, displayName });
    const response = await postLineWebhook(request, 'follow', vars);
    expect(response.status()).toBe(200);
    return vars;
  }

  test('a follow gets the edited card once, shown in the chat; off sends nothing', async ({
    page,
    request,
  }) => {
    const suffix = uniqueSuffix();
    const section = page.getByTestId(testIds.settingsSectionRichMenu);

    // 15.1 The switch is on; the welcome text is edited and shows in the preview.
    const text = `ยินดีต้อนรับสู่การทดสอบ ${suffix}`;
    await page.goto('/settings');
    await expect(section.getByTestId(testIds.settingsWelcomeSwitch)).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await section.getByTestId(testIds.settingsWelcomeText).fill(text);
    await section.getByTestId(testIds.settingsWelcomeTextSave).click();
    await expect(toastWith(page, uiCopy('common.toast.saved'), 'success')).toBeVisible();
    await expect(section.getByTestId(testIds.welcomePreview)).toContainText(text);

    // 15.2 A new friend: one reply with a Flex bubble that has the text and the three postbacks.
    const name = `เพื่อนใหม่ ${suffix}`;
    const v = await follow(request, name);
    await expect
      .poll(async () =>
        (await stubLineRequests({ endpoint: 'reply' })).filter(
          (r) => (r.body as FlexBody | null)?.replyToken === v.replyToken,
        ),
      )
      .toHaveLength(1);
    const [reply] = (await stubLineRequests({ endpoint: 'reply' })).filter(
      (r) => (r.body as FlexBody | null)?.replyToken === v.replyToken,
    );
    const message = (reply?.body as FlexBody).messages?.[0];
    expect(message?.type).toBe('flex');
    expect(JSON.stringify(message)).toContain(text);
    expect(message?.contents?.footer?.contents?.map((b) => b.action)).toEqual([
      expect.objectContaining({ type: 'postback', data: 'tw1:ai_on' }),
      expect.objectContaining({ type: 'postback', data: 'tw1:admin' }),
      expect.objectContaining({ type: 'postback', data: 'tw1:how_to' }),
    ]);

    // 15.3 The chat shows the card as a welcome bubble with its three buttons as chips.
    await openChat(page, name);
    const card = page.getByTestId(testIds.welcomeBubble);
    await expect(card).toHaveCount(1);
    await expect(card).toContainText(uiCopy('inbox.welcome.label'));
    await expect(card).toContainText(text);
    for (const action of ['ai_on', 'admin', 'how_to'] as const) {
      await expect(card).toContainText(RICH_MENU_LABELS[action].title);
    }

    // 15.4 A button of the card works like the rich menu.
    await customerTaps(request, v, 'how_to');
    await expect(systemLine(page, 'customer.tapped_how_to')).toBeVisible();

    // 15.5 The switch off: a new friend gets no reply.
    await page.goto('/settings');
    await section.getByTestId(testIds.settingsWelcomeSwitch).click();
    await expect(
      toastWith(page, uiCopy('settings.richMenu.welcomeOffToast'), 'success'),
    ).toBeVisible();
    const quiet = await follow(request, `เพื่อนเงียบ ${suffix}`);
    await page.goto('/chats');
    await expect(row(page, `เพื่อนเงียบ ${suffix}`)).toBeVisible();
    expect(
      (await stubLineRequests({ endpoint: 'reply' })).filter(
        (r) => (r.body as FlexBody | null)?.replyToken === quiet.replyToken,
      ),
    ).toEqual([]);
  });
});
