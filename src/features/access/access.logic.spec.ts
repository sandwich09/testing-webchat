import { describe, expect, it } from 'vitest';
import { validateAccessCode } from './access.logic';

describe('validateAccessCode', () => {
  it.each(['', ' ', '   ', '\t\n', '　'])('rejects blank input %j', (value) => {
    expect(validateAccessCode(value)).toEqual({ ok: false, reason: 'empty' });
  });

  it('accepts a code and keeps it as typed', () => {
    expect(validateAccessCode('secret')).toEqual({ ok: true, code: 'secret' });
    expect(validateAccessCode('  secret ')).toEqual({ ok: true, code: '  secret ' });
  });
});
