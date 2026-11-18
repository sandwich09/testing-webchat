import { describe, expect, it } from 'vitest';
import { config } from 'zod';
import { contactDtoSchema } from '@/contracts';

describe('zod config of the contracts', () => {
  it('turns the JIT off so schemas never probe eval under the CSP', () => {
    expect(contactDtoSchema).toBeDefined();
    expect(config().jitless).toBe(true);
  });
});
