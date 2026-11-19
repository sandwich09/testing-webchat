// Freezes shared test data so a test that mutates it fails at the assignment (strict mode throws
// a TypeError) instead of leaking the change into the tests that run after it. A test that needs
// a changed value copies first: `{ ...FIXTURE, text: 'x' }` or `structuredClone(FIXTURE)`.

export type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer U)[]
    ? readonly DeepReadonly<U>[]
    : T extends object
      ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
      : T;

/**
 * Freezes `value` and everything reachable through plain objects and arrays, and returns the
 * same reference. Primitives and functions pass through. A Map, Set, Date or typed array cannot
 * be frozen in a way that blocks mutation, so it is rejected instead of being left open.
 */
export function deepFreeze<T>(value: T): DeepReadonly<T> {
  freeze(value, new Set<object>());
  return value as DeepReadonly<T>;
}

function freeze(value: unknown, visited: Set<object>): void {
  if (typeof value !== 'object' || value === null || visited.has(value)) return;
  visited.add(value);
  if (
    value instanceof Map ||
    value instanceof Set ||
    value instanceof Date ||
    ArrayBuffer.isView(value)
  ) {
    throw new TypeError(
      `deepFreeze supports plain objects and arrays only, got ${value.constructor.name}. Copy it per test instead.`,
    );
  }
  for (const key of Reflect.ownKeys(value)) {
    freeze((value as Record<PropertyKey, unknown>)[key], visited);
  }
  Object.freeze(value);
}
