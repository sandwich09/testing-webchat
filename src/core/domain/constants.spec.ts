import { describe, expect, it } from 'vitest';
import { RATE_LIMIT_RULES } from './constants';

describe('RATE_LIMIT_RULES', () => {
  it('scales every action except unlock', () => {
    expect(RATE_LIMIT_RULES.unlock).toEqual({ limit: 5, windowMs: 60_000, scaled: false });
    expect(RATE_LIMIT_RULES.send_message).toEqual({ limit: 30, windowMs: 60_000, scaled: true });
    expect(RATE_LIMIT_RULES.upload_ticket).toEqual({ limit: 20, windowMs: 60_000, scaled: true });
    expect(RATE_LIMIT_RULES.pdf_ingest).toEqual({ limit: 5, windowMs: 3_600_000, scaled: true });
    expect(RATE_LIMIT_RULES.typing).toEqual({ limit: 1, windowMs: 10_000, scaled: true });
  });
});
