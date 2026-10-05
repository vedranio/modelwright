/**
 * Reads a numeric design token (px, ms or unitless) from tokens.css, for the few places that
 * need one in JS, such as React Flow's background gap and viewport animation durations.
 */
export function tokenNumber(name: `--${string}`): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name);
  const value = parseFloat(raw);
  if (Number.isNaN(value)) throw new Error(`Token ${name} is not a number: "${raw}"`);
  return value;
}
