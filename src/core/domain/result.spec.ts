import { describe, expect, it } from 'vitest';
import { err, ok } from './result';

describe('Result helpers', () => {
  it('ok wraps a value', () => {
    expect(ok(5)).toEqual({ ok: true, value: 5 });
  });

  it('err carries code, detail and retryAfterSeconds', () => {
    expect(err('access.rate_limited', 'too many', 12)).toEqual({
      ok: false,
      error: { code: 'access.rate_limited', detail: 'too many', retryAfterSeconds: 12 },
    });
  });
});
