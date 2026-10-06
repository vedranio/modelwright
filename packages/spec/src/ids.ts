/**
 * Mermaid identifiers made from schema ids. Ids may hold any character, so everything outside
 * [A-Za-z0-9_] becomes `_`, and a prefix keeps them clear of Mermaid's keywords (`end`,
 * `graph`…) and of edge syntax (an id starting with `o` or `x` after `--`). Two ids that
 * collapse to the same identifier get `_2`, `_3`… in document order, so output is stable.
 */
export class SafeIds {
  private readonly used = new Set<string>();
  private readonly byKey = new Map<string, string>();

  constructor(private readonly prefix: string) {}

  /** The identifier for `key` (one or more schema ids, e.g. screen and state). */
  get(...parts: string[]): string {
    const key = parts.join('\u0000');
    const known = this.byKey.get(key);
    if (known) return known;
    const base = `${this.prefix}${parts.map(clean).join('__')}`;
    let id = base;
    for (let n = 2; this.used.has(id); n++) id = `${base}_${n}`;
    this.used.add(id);
    this.byKey.set(key, id);
    return id;
  }
}

function clean(id: string): string {
  return id.replace(/[^A-Za-z0-9_]/g, '_');
}

/**
 * Text for a quoted Mermaid label. Line breaks become spaces, and a double quote becomes
 * `#quot;`, Mermaid's escape for it, so a name can't end the label early.
 */
export function mermaidText(text: string): string {
  return text.replace(/\s+/g, ' ').trim().replace(/"/g, '#quot;');
}

/** Text for a Markdown table cell: pipes escaped, line breaks as <br>. */
export function cellText(text: string): string {
  return text.trim().replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
}

/** Text for inline Markdown: line breaks become spaces, and Markdown's markers are escaped. */
export function inlineText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/([\\`*_[\]<>#|])/g, '\\$1');
}
