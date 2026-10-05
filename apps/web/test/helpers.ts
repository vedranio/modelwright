/** Narrows away `undefined` or `null`, failing the test if the value is missing. */
export function must<T>(value: T | null | undefined, what = 'value'): T {
  if (value === undefined || value === null) throw new Error(`Expected ${what} to be defined`);
  return value;
}

/** Recursively freezes a value, so any mutation throws in strict mode. */
export function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
