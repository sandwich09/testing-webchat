// Unit tests of test-support/deep-freeze.ts. The file is `.unit.ts` in e2e/ because the root
// vitest config collects only `src/**/*.spec.ts` and `e2e/**/*.unit.ts`, and test-support/ has
// no suite of its own.
import { describe, expect, it } from 'vitest';
import { deepFreeze } from '../test-support/deep-freeze';

type Sample = { name: string; tags: string[]; nested: { items: { id: number }[] } };
const sample = (): Sample => ({ name: 'a', tags: ['x'], nested: { items: [{ id: 1 }] } });
// Test code writes through a loose view on purpose: the frozen type forbids these writes.
const loose = (value: unknown) => value as Record<string, unknown> & unknown[];

describe('deepFreeze', () => {
  it('returns the same reference', () => {
    const value = sample();
    expect(deepFreeze(value)).toBe(value);
  });

  it('makes a top-level assignment throw', () => {
    const frozen = deepFreeze(sample());
    expect(() => {
      loose(frozen).name = 'b';
    }).toThrow(TypeError);
    expect(frozen.name).toBe('a');
  });

  it('makes nested object, array and array-element writes throw', () => {
    const frozen = deepFreeze(sample());
    expect(() => {
      loose(frozen.nested.items[0]).id = 2;
    }).toThrow(TypeError);
    expect(() => loose(frozen.tags).push('y')).toThrow(TypeError);
    expect(() => loose(frozen.nested.items).pop()).toThrow(TypeError);
    expect(() => {
      loose(frozen.nested).extra = true;
    }).toThrow(TypeError);
    expect(frozen).toEqual(sample());
  });

  it('freezes a shared array of objects', () => {
    const list = deepFreeze([{ id: 1 }, { id: 2 }]);
    expect(() => {
      loose(list[1]).id = 3;
    }).toThrow(TypeError);
    expect(() => loose(list).splice(0, 1)).toThrow(TypeError);
  });

  it('leaves primitives, null and functions alone', () => {
    expect(deepFreeze(5)).toBe(5);
    expect(deepFreeze('x')).toBe('x');
    expect(deepFreeze(null)).toBeNull();
    const fn = () => 1;
    expect(deepFreeze(fn)).toBe(fn);
    expect(Object.isFrozen(fn)).toBe(false);
  });

  it('handles shared and cyclic references and already frozen parts', () => {
    const shared = { n: 1 };
    const cyclic: Record<string, unknown> = {
      a: shared,
      b: shared,
      inner: Object.freeze({ c: { d: 1 } }),
    };
    cyclic.self = cyclic;
    expect(() => deepFreeze(cyclic)).not.toThrow();
    expect(Object.isFrozen(shared)).toBe(true);
    expect(Object.isFrozen(loose(cyclic.inner).c)).toBe(true);
  });

  it('rejects data it cannot protect instead of leaving it open', () => {
    expect(() => deepFreeze({ m: new Map() })).toThrow('plain objects and arrays only, got Map');
    expect(() => deepFreeze([new Set()])).toThrow('got Set');
    expect(() => deepFreeze({ when: new Date(0) })).toThrow('got Date');
    expect(() => deepFreeze({ bytes: new Uint8Array(2) })).toThrow('got Uint8Array');
  });

  it('lets a test work on a copy of frozen data', () => {
    const frozen = deepFreeze(sample());
    const copy = structuredClone(frozen) as Sample;
    copy.tags.push('y');
    copy.nested.items[0] = { id: 9 };
    expect(frozen).toEqual(sample());
    expect(copy.tags).toEqual(['x', 'y']);
  });
});
