/** Narrows away `undefined` (e.g. from indexed access), failing the test if the value is missing. */
export function must<T>(value: T | undefined, what = 'value'): T {
  if (value === undefined) throw new Error(`Expected ${what} to be defined`);
  return value;
}
