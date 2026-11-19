import {
  HOW_TO_TEXT_MAX_CHARS,
  RICH_MENU_HEIGHT,
  RICH_MENU_WIDTH,
  WELCOME_TEXT_MAX_CHARS,
} from './constants';
import type { PoliteParticle } from './enums.model';
import type { Message } from './message.model';
import type { RichMenuAction, RichMenuSpec, WelcomeCard } from './rich-menu.model';
import { RICH_MENU_ACTIONS } from './rich-menu.model';

// Rich menu and welcome card (specs/line-messaging.md "Rich menu" and "ข้อความต้อนรับ"). Every
// text a customer sees here is neutral; the polite ending follows the setting as in handoffText.

/** Version of the postback data. A future change of the data gets a new prefix. */
export const POSTBACK_DATA_PREFIX = 'tw1:';

export const postbackDataOf = (action: RichMenuAction): string =>
  `${POSTBACK_DATA_PREFIX}${action}`;

/** The action of postback data this app made; null for anything else (ignored with a log). */
export function parsePostbackData(data: string): RichMenuAction | null {
  if (!data.startsWith(POSTBACK_DATA_PREFIX)) return null;
  const rest = data.slice(POSTBACK_DATA_PREFIX.length);
  return (RICH_MENU_ACTIONS as readonly string[]).includes(rest) ? (rest as RichMenuAction) : null; // brand: checked against RICH_MENU_ACTIONS
}

/** Title (also the text the tap shows in the chat) and subtitle of each button. */
export const RICH_MENU_LABELS: Record<RichMenuAction, { title: string; subtitle: string }> = {
  ai_on: { title: 'คุยกับ AI', subtitle: 'เปิดให้ AI ตอบแชทนี้' },
  admin: { title: 'คุยกับแอดมิน', subtitle: 'ปิด AI แล้วส่งต่อให้คน' },
  how_to: { title: 'วิธีทดสอบ', subtitle: 'ดูว่าลองอะไรได้บ้าง' },
};

/** Widths of the three areas, left to right: 833 + 834 + 833 = RICH_MENU_WIDTH. */
const AREA_WIDTHS = [833, 834, 833] as const;

/** The 3×1 compact rich menu of the app. */
export function richMenuSpec(): RichMenuSpec {
  let x = 0;
  const areas = RICH_MENU_ACTIONS.map((action, i) => {
    const width = AREA_WIDTHS[i] ?? 0;
    const area = {
      x,
      y: 0,
      width,
      height: RICH_MENU_HEIGHT,
      data: postbackDataOf(action),
      displayText: RICH_MENU_LABELS[action].title,
    };
    x += width;
    return area;
  });
  return {
    width: RICH_MENU_WIDTH,
    height: RICH_MENU_HEIGHT,
    name: 'Test webchat menu v1',
    chatBarText: 'เมนู',
    areas,
  };
}

/** "นะคะ" or "นะครับ", as in handoffText. */
const naEnding = (p: PoliteParticle): string => (p === 'ค่ะ' ? 'นะคะ' : 'นะครับ');

/** Button "คุยกับ AI" while the kill switch is off. */
export const aiUnavailableText = (p: PoliteParticle): string =>
  `ตอนนี้ AI ปิดให้บริการอยู่ แอดมินจะมาตอบแทน${naEnding(p)}`;

/** Button "คุยกับ AI" while today's budget is used up. */
export const aiBudgetReachedText = (p: PoliteParticle): string =>
  `วันนี้ AI ให้บริการครบโควตาแล้ว แอดมินจะมาตอบแทน${naEnding(p)}`;

/** Button "คุยกับแอดมิน". */
export const adminRequestedText = (p: PoliteParticle): string =>
  `รับทราบ แอดมินจะมาตอบแชทนี้${naEnding(p)}`;

/** The default "how to test" text; its first line ends with the setting's particle. */
export function defaultHowToText(p: PoliteParticle): string {
  return [
    `ลองได้ตามนี้เลย${p}`,
    '1. กด "คุยกับ AI" แล้วพิมพ์ถามอะไรก็ได้ AI จะตอบและแนะนำตัวในครั้งแรก',
    '2. ส่งรูป สติกเกอร์ หรือวิดีโอ AI จะหยุดและส่งต่อให้แอดมิน',
    '3. กด "คุยกับแอดมิน" AI จะปิด และแอดมินจะมาตอบเอง',
    '4. กดค้างที่ข้อความแล้วเลือก "ตอบกลับ" แอดมินจะเห็นว่าคุณอ้างถึงข้อความไหน',
    'ข้อความทั้งหมดไปขึ้นที่หน้า webchat ของแอดมินทันที',
  ].join('\n');
}

/** The text button "วิธีทดสอบ" sends: the saved one, or the default when it is blank. */
export const howToTextOf = (saved: string, p: PoliteParticle): string =>
  saved.trim() === '' ? defaultHowToText(p) : saved.trim();

export const defaultWelcomeText = (p: PoliteParticle): string =>
  `ขอบคุณที่เพิ่มเพื่อน${naEnding(p)} ที่นี่ทดลองคุยกับ AI และแอดมินได้เลย${p}`;

export const WELCOME_NOTE = 'ข้อความของคุณจะขึ้นที่หน้า webchat ของแอดมินทันที';
export const WELCOME_TITLE_LINE = 'ยินดีต้อนรับสู่';
export const WELCOME_ALT_TEXT = 'ยินดีต้อนรับ กดปุ่มในข้อความเพื่อเริ่มคุยกับ AI หรือแอดมิน';
/** Name shown when no LINE OA name is stored. */
export const WELCOME_FALLBACK_NAME = 'Test webchat';

/** The name on the welcome card: the LINE OA name, or the app name when none is stored. */
export const welcomeAccountName = (botName: string | null): string => {
  const name = (botName ?? '').trim();
  return name === '' ? WELCOME_FALLBACK_NAME : name;
};

/** The text of the welcome card: the saved one, or the default when it is blank. */
export const welcomeTextOf = (saved: string, p: PoliteParticle): string =>
  saved.trim() === '' ? defaultWelcomeText(p) : saved.trim();

/** Both limits fit LINE: HOW_TO_TEXT_MAX_CHARS under a text message, the welcome text in Flex. */
export const RICH_MENU_TEXT_LIMITS = {
  howTo: HOW_TO_TEXT_MAX_CHARS,
  welcome: WELCOME_TEXT_MAX_CHARS,
} as const;

/**
 * The welcome card. The logo is a public HTTPS picture of the app (`/brand/app-icon-512.png` on
 * APP_BASE_URL); a base URL that is not HTTPS (local Docker) gets a text-only header, because
 * LINE only loads HTTPS pictures.
 */
export function buildWelcomeCard(input: {
  botName: string | null;
  welcomeText: string;
  particle: PoliteParticle;
  appBaseUrl: string;
}): WelcomeCard {
  const base = input.appBaseUrl.replace(/\/+$/, '');
  const styles = { ai_on: 'primary', admin: 'secondary', how_to: 'link' } as const;
  return {
    altText: WELCOME_ALT_TEXT,
    logoUrl: base.startsWith('https://') ? `${base}/brand/app-icon-512.png` : null,
    titleLine: WELCOME_TITLE_LINE,
    accountName: welcomeAccountName(input.botName),
    body: welcomeTextOf(input.welcomeText, input.particle),
    note: WELCOME_NOTE,
    buttons: RICH_MENU_ACTIONS.map((action) => ({
      label: RICH_MENU_LABELS[action].title,
      data: postbackDataOf(action),
      displayText: RICH_MENU_LABELS[action].title,
      style: styles[action],
    })),
  };
}

/**
 * Taps answered with a fixed text only. They never start an AI reply, so they never supersede
 * the AI reply of a text sent before them, and they are not what an AI run answers
 * (MessageRepository.latestInbound skips them).
 */
export const NO_AI_TAP_EVENT_CODES = ['customer.tapped_admin', 'customer.tapped_how_to'] as const;

export const isNoAiTap = (m: Pick<Message, 'direction' | 'eventCode'>): boolean =>
  m.direction === 'inbound' &&
  m.eventCode !== null &&
  (NO_AI_TAP_EVENT_CODES as readonly string[]).includes(m.eventCode);
