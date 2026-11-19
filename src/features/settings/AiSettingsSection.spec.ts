import { describe, expect, it } from 'vitest';

import { ApiError } from '@/common/common.api';

import {
  budgetDirty,
  budgetErrorText,
  budgetTodayText,
  fieldValue,
  instructionsCounterText,
  instructionsDirty,
  instructionsErrorText,
} from './AiSettingsSection';
import { aiNameDirty, aiNameErrorText, answerModeLabel, particleLabel } from './AiPersonaRows';
import { nextRadioIndex, saveFailureText } from './SettingsFormParts';

describe('saveFailureText', () => {
  it('uses the catalog text of an API error code', () => {
    expect(saveFailureText(new ApiError('line.credentials_invalid', 400))).toContain(
      'Channel access token',
    );
  });

  it('falls back to the form text for an unknown error and for a code with no text', () => {
    const generic = 'บันทึกไม่สำเร็จ ข้อมูลที่กรอกยังอยู่ ลองอีกครั้ง';
    expect(saveFailureText(new Error('boom'))).toBe(generic);
    expect(saveFailureText(new ApiError('db.unavailable', 500))).toBe(generic);
  });

  it('shows the network text when there was no answer', () => {
    expect(saveFailureText(new ApiError('client.network', 0))).toContain('เชื่อมต่อระบบไม่ได้');
  });
});

describe('budget text', () => {
  it('names the maximum without cents', () => {
    expect(budgetErrorText('budget_out_of_range')).toBe('งบต่อวันต้องอยู่ระหว่าง 0 ถึง 10 ดอลลาร์');
    expect(budgetErrorText('budget_invalid')).toContain('ทศนิยมไม่เกิน 2 ตำแหน่ง');
  });

  it('formats today usage as dollars with two decimals', () => {
    expect(budgetTodayText('1.234500')).toBe('วันนี้ใช้ไป $1.23');
    expect(budgetTodayText('0.000000')).toBe('วันนี้ใช้ไป $0.00');
  });

  it('is dirty only when the typed value differs from the saved one', () => {
    expect(budgetDirty(null, '5.00')).toBe(false);
    expect(budgetDirty(' 5.00 ', '5.00')).toBe(false);
    expect(budgetDirty('6', '5.00')).toBe(true);
    expect(budgetDirty('', '5.00')).toBe(true);
  });
});

describe('instructions text', () => {
  it('counts against the maximum', () => {
    expect(instructionsCounterText(12)).toBe('12/2000');
    expect(instructionsErrorText()).toBe('คำแนะนำยาวเกิน 2000 ตัวอักษร');
  });

  it('is dirty on any difference, spaces included', () => {
    expect(instructionsDirty(null, 'a')).toBe(false);
    expect(instructionsDirty('a', 'a')).toBe(false);
    expect(instructionsDirty('a ', 'a')).toBe(true);
  });
});

describe('fieldValue', () => {
  it('shows the draft, else the saved value', () => {
    expect(fieldValue(null, 'saved')).toBe('saved');
    expect(fieldValue('', 'saved')).toBe('');
  });
});

describe('nextRadioIndex', () => {
  it('moves with the arrows and wraps', () => {
    expect(nextRadioIndex('ArrowRight', 0, 2)).toBe(1);
    expect(nextRadioIndex('ArrowDown', 1, 2)).toBe(0);
    expect(nextRadioIndex('ArrowLeft', 0, 2)).toBe(1);
    expect(nextRadioIndex('ArrowUp', 1, 2)).toBe(0);
  });

  it('jumps with Home and End and ignores other keys', () => {
    expect(nextRadioIndex('Home', 1, 3)).toBe(0);
    expect(nextRadioIndex('End', 0, 3)).toBe(2);
    expect(nextRadioIndex('a', 0, 3)).toBeNull();
    expect(nextRadioIndex('ArrowRight', 0, 0)).toBeNull();
  });
});

describe('particleLabel', () => {
  it('maps the stored particle to its label', () => {
    expect(particleLabel('ค่ะ')).toBe('ค่ะ');
    expect(particleLabel('ครับ')).toBe('ครับ');
  });
});

describe('AI name and answer scope', () => {
  it('compares the typed name with the saved one, trimmed, null as empty', () => {
    expect(aiNameDirty(null, 'มินนี่')).toBe(false);
    expect(aiNameDirty(' มินนี่ ', 'มินนี่')).toBe(false);
    expect(aiNameDirty('', null)).toBe(false);
    expect(aiNameDirty('มิน', null)).toBe(true);
    expect(aiNameDirty('', 'มินนี่')).toBe(true);
  });

  it('names the limit in the error and labels both scopes', () => {
    expect(aiNameErrorText()).toBe('ชื่อ AI ยาวเกิน 40 ตัวอักษร');
    expect(answerModeLabel('general')).toBe('คุยทั่วไปได้');
    expect(answerModeLabel('knowledge_only')).toBe('ตอบจากคลังความรู้เท่านั้น');
  });
});
