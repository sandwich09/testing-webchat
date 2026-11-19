import { describe, expect, it } from 'vitest';
import {
  HOW_TO_TEXT_MAX_CHARS,
  POSTBACK_DATA_MAX_CHARS,
  RICH_MENU_HEIGHT,
  RICH_MENU_WIDTH,
  WELCOME_TEXT_MAX_CHARS,
} from './constants';
import {
  RICH_MENU_LABELS,
  WELCOME_FALLBACK_NAME,
  WELCOME_NOTE,
  adminRequestedText,
  aiBudgetReachedText,
  aiUnavailableText,
  buildWelcomeCard,
  defaultHowToText,
  defaultWelcomeText,
  howToTextOf,
  parsePostbackData,
  postbackDataOf,
  richMenuSpec,
  welcomeTextOf,
} from './rich-menu.logic';
import { RICH_MENU_ACTIONS } from './rich-menu.model';

describe('postback data', () => {
  it('round-trips every action through the versioned data', () => {
    for (const action of RICH_MENU_ACTIONS) {
      const data = postbackDataOf(action);
      expect(data.startsWith('tw1:')).toBe(true);
      expect(data.length).toBeLessThanOrEqual(POSTBACK_DATA_MAX_CHARS);
      expect(parsePostbackData(data)).toBe(action);
    }
  });

  it('ignores data of another version, another prefix, or an unknown action', () => {
    expect(parsePostbackData('tw2:ai_on')).toBeNull();
    expect(parsePostbackData('ai_on')).toBeNull();
    expect(parsePostbackData('tw1:')).toBeNull();
    expect(parsePostbackData('tw1:toString')).toBeNull();
    expect(parsePostbackData('tw1:ai_on ')).toBeNull();
    expect(parsePostbackData('')).toBeNull();
  });
});

describe('richMenuSpec', () => {
  it('is a 2500x843 menu of three areas that cover the picture without gaps', () => {
    const menu = richMenuSpec();
    expect([menu.width, menu.height]).toEqual([RICH_MENU_WIDTH, RICH_MENU_HEIGHT]);
    expect([menu.width, menu.height]).toEqual([2500, 843]);
    expect(menu.areas).toHaveLength(3);
    let x = 0;
    for (const area of menu.areas) {
      expect(area.x).toBe(x);
      expect(area.y).toBe(0);
      expect(area.height).toBe(843);
      x += area.width;
    }
    expect(x).toBe(2500);
  });

  it('shows each button title as the customer text and carries the action data', () => {
    const menu = richMenuSpec();
    expect(menu.areas.map((a) => a.displayText)).toEqual(['คุยกับ AI', 'คุยกับแอดมิน', 'วิธีทดสอบ']);
    expect(menu.areas.map((a) => parsePostbackData(a.data))).toEqual(['ai_on', 'admin', 'how_to']);
    expect(menu.chatBarText.length).toBeLessThanOrEqual(14);
  });
});

describe('fixed replies', () => {
  it('ends with นะคะ or นะครับ by the particle', () => {
    expect(aiUnavailableText('ค่ะ')).toBe('ตอนนี้ AI ปิดให้บริการอยู่ แอดมินจะมาตอบแทนนะคะ');
    expect(aiUnavailableText('ครับ')).toBe('ตอนนี้ AI ปิดให้บริการอยู่ แอดมินจะมาตอบแทนนะครับ');
    expect(aiBudgetReachedText('ค่ะ')).toBe('วันนี้ AI ให้บริการครบโควตาแล้ว แอดมินจะมาตอบแทนนะคะ');
    expect(aiBudgetReachedText('ครับ')).toBe('วันนี้ AI ให้บริการครบโควตาแล้ว แอดมินจะมาตอบแทนนะครับ');
    expect(adminRequestedText('ค่ะ')).toBe('รับทราบ แอดมินจะมาตอบแชทนี้นะคะ');
    expect(adminRequestedText('ครับ')).toBe('รับทราบ แอดมินจะมาตอบแชทนี้นะครับ');
  });
});

describe('how-to text', () => {
  it('has the approved lines, the first one ending with the particle', () => {
    const lines = defaultHowToText('ครับ').split('\n');
    expect(lines[0]).toBe('ลองได้ตามนี้เลยครับ');
    expect(lines).toHaveLength(6);
    expect(lines[5]).toBe('ข้อความทั้งหมดไปขึ้นที่หน้า webchat ของแอดมินทันที');
    expect(defaultHowToText('ค่ะ').split('\n')[0]).toBe('ลองได้ตามนี้เลยค่ะ');
    expect(defaultHowToText('ค่ะ').length).toBeLessThanOrEqual(HOW_TO_TEXT_MAX_CHARS);
  });

  it('uses the saved text, trimmed, and the default when the saved one is blank', () => {
    expect(howToTextOf('  ลองเลย \n', 'ค่ะ')).toBe('ลองเลย');
    expect(howToTextOf(' \n ', 'ครับ')).toBe(defaultHowToText('ครับ'));
  });
});

describe('welcome card', () => {
  const base = { botName: 'บัญชีทดสอบ', welcomeText: '', particle: 'ค่ะ' as const };

  it('uses the default text by the particle, with no AI name in it', () => {
    expect(defaultWelcomeText('ค่ะ')).toBe('ขอบคุณที่เพิ่มเพื่อนนะคะ ที่นี่ทดลองคุยกับ AI และแอดมินได้เลยค่ะ');
    expect(defaultWelcomeText('ครับ')).toBe('ขอบคุณที่เพิ่มเพื่อนนะครับ ที่นี่ทดลองคุยกับ AI และแอดมินได้เลยครับ');
    expect(defaultWelcomeText('ค่ะ').length).toBeLessThanOrEqual(WELCOME_TEXT_MAX_CHARS);
    expect(welcomeTextOf(' สวัสดี ', 'ค่ะ')).toBe('สวัสดี');
  });

  it('links the logo on an HTTPS base and draws a text header otherwise', () => {
    expect(buildWelcomeCard({ ...base, appBaseUrl: 'https://chat.example.com/' }).logoUrl).toBe(
      'https://chat.example.com/brand/app-icon-512.png',
    );
    expect(buildWelcomeCard({ ...base, appBaseUrl: 'http://localhost:3000' }).logoUrl).toBeNull();
  });

  it('names the account, or the app when no name is stored', () => {
    const card = buildWelcomeCard({ ...base, appBaseUrl: 'https://x.test' });
    expect(card.titleLine).toBe('ยินดีต้อนรับสู่');
    expect(card.accountName).toBe('บัญชีทดสอบ');
    expect(card.note).toBe(WELCOME_NOTE);
    expect(
      buildWelcomeCard({ ...base, botName: '  ', appBaseUrl: 'https://x.test' }).accountName,
    ).toBe(WELCOME_FALLBACK_NAME);
    expect(
      buildWelcomeCard({ ...base, botName: null, appBaseUrl: 'https://x.test' }).accountName,
    ).toBe(WELCOME_FALLBACK_NAME);
  });

  it('has the three rich menu buttons with the same data, primary, secondary and link', () => {
    const card = buildWelcomeCard({ ...base, welcomeText: 'แก้แล้ว', appBaseUrl: 'https://x.test' });
    expect(card.body).toBe('แก้แล้ว');
    expect(card.buttons).toEqual(
      RICH_MENU_ACTIONS.map((action, i) => ({
        label: RICH_MENU_LABELS[action].title,
        data: postbackDataOf(action),
        displayText: RICH_MENU_LABELS[action].title,
        style: (['primary', 'secondary', 'link'] as const)[i],
      })),
    );
    expect(card.altText).not.toContain('AI ชื่อ');
  });
});
