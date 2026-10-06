import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(fileURLToPath(new URL('../src/tokens.css', import.meta.url)), 'utf8');

/** The declarations inside the first block that follows `selector`, as name → value. */
function block(selector: string): Map<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`No ${selector} block in tokens.css`);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  const decls = new Map<string, string>();
  for (const m of body.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([-\w]+)\s*:\s*([^;]+);/g)) {
    decls.set(m[1] as string, (m[2] as string).trim());
  }
  return decls;
}

const light = block(':root');
const dark = block(":root[data-theme='dark']");
const systemDark = block(":root:not([data-theme='light'])");
const themed = [...light.keys()].filter(
  (k) => k.startsWith('--color-') || k.startsWith('--shadow-'),
);

const theme = (name: 'light' | 'dark') => (token: string) => {
  const value = (name === 'dark' ? dark.get(token) : undefined) ?? light.get(token);
  if (!value) throw new Error(`No ${token}`);
  return value;
};

function luminance(hex: string): number {
  const h = hex.replace('#', '').slice(0, 6);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
  const f = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Text (4.5:1) and control boundaries (3:1) as the UI actually pairs them. Faint text sits on
 * every background but the hover one (hovered controls switch to full text colour); the accent
 * is both text and a button fill.
 */
const TEXT_PAIRS: [string, string][] = [
  ...['--color-text', '--color-text-muted', '--color-text-faint'].flatMap((fg) =>
    ['--color-bg', '--color-surface', '--color-surface-sunken'].map((bg): [string, string] => [
      fg,
      bg,
    ]),
  ),
  ['--color-text-muted', '--color-surface-hover'],
  ['--color-accent', '--color-surface'],
  ['--color-accent', '--color-bg'],
  ['--color-accent', '--color-accent-subtle'],
  ['--color-on-accent', '--color-accent'],
  ['--color-on-accent', '--color-accent-hover'],
  ['--color-on-accent-muted', '--color-accent'],
  ['--color-success', '--color-surface'],
  ['--color-warning', '--color-surface'],
  ['--color-error', '--color-surface'],
  ['--color-text', '--color-warning-subtle'],
  ['--color-error', '--color-error-subtle'],
];
const CONTROL_PAIRS: [string, string][] = [
  ['--color-border-input', '--color-surface'],
  ['--color-accent', '--color-surface'],
];

describe('tokens.css', () => {
  it('has the same dark values for data-theme="dark" and for System on a dark OS', () => {
    expect(Object.fromEntries(systemDark)).toEqual(Object.fromEntries(dark));
  });

  it('gives every colour and shadow token a dark value, and nothing else', () => {
    const darkTokens = [...dark.keys()].filter((k) => k.startsWith('--'));
    expect(darkTokens.sort()).toEqual([...themed].sort());
  });

  for (const name of ['light', 'dark'] as const) {
    const token = theme(name);
    it(`meets WCAG AA for text in the ${name} theme`, () => {
      const failing = TEXT_PAIRS.map(([fg, bg]) => ({
        pair: `${fg} on ${bg}`,
        ratio: Math.round(contrast(token(fg), token(bg)) * 100) / 100,
      })).filter((p) => p.ratio < 4.5);
      expect(failing).toEqual([]);
    });

    it(`gives text fields and selects a 3:1 edge in the ${name} theme`, () => {
      for (const [fg, bg] of CONTROL_PAIRS) {
        expect(contrast(token(fg), token(bg)), `${fg} on ${bg}`).toBeGreaterThanOrEqual(3);
      }
    });
  }
});
