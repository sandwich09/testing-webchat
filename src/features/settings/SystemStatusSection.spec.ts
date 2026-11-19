import { describe, expect, it } from 'vitest';

import { budgetMeter, errorEntryText, webhookText } from './SystemStatusSection';

const now = new Date('2026-11-18T08:00:00Z');

describe('webhookText', () => {
  it('shows the Thai date and time, or the never text', () => {
    expect(webhookText('2026-11-18T07:32:00Z', now)).toBe('18 พ.ย. 14:32');
    expect(webhookText(null, now)).toBe('ยังไม่เคยรับ');
  });
});

describe('errorEntryText', () => {
  it('says none when there is no error', () => {
    expect(errorEntryText(null, now)).toBe('ไม่มี');
  });

  it('joins the catalog text and the time', () => {
    expect(
      errorEntryText({ code: 'ai.budget_exhausted', at: '2026-11-18T07:32:00Z' }, now),
    ).toMatch(/^งบ AI ของวันนี้เต็ม .* · 18 พ\.ย\. 14:32$/);
  });

  it('shows the code itself when the catalog has no text for it', () => {
    expect(
      errorEntryText({ code: 'line.reply_token_invalid', at: '2026-11-18T07:32:00Z' }, now),
    ).toBe('line.reply_token_invalid · 18 พ.ย. 14:32');
  });
});

describe('budgetMeter', () => {
  it('shows used against the budget', () => {
    const meter = budgetMeter('2.500000', '5.00');
    expect(meter.text).toBe('$2.50 จาก $5.00');
    expect(meter.ratio).toBeCloseTo(0.5);
    expect(meter.tone).toBe('normal');
  });

  it('warns from 90% and is full at the budget, never past the bar', () => {
    expect(budgetMeter('4.600000', '5.00').tone).toBe('warn');
    const full = budgetMeter('7.000000', '5.00');
    expect(full.tone).toBe('full');
    expect(full.ratio).toBe(1);
  });

  it('counts a tiny amount as used', () => {
    const meter = budgetMeter('0.004000', '5.00');
    expect(meter.text).toBe('<$0.01 จาก $5.00');
    expect(meter.ratio).toBeGreaterThan(0);
  });

  it('handles a zero budget', () => {
    expect(budgetMeter('0.000000', '0.00').ratio).toBe(0);
    expect(budgetMeter('0.010000', '0.00').tone).toBe('full');
  });
});
