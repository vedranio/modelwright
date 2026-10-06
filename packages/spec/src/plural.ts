/** Words whose plural doesn't follow the rules, matched case-insensitively. */
const IRREGULAR: Record<string, string> = {
  person: 'people',
  child: 'children',
  man: 'men',
  woman: 'women',
  mouse: 'mice',
  goose: 'geese',
  tooth: 'teeth',
  foot: 'feet',
  datum: 'data',
  criterion: 'criteria',
  index: 'indices',
  status: 'statuses',
};

/** Words that read the same in the plural. */
const UNCHANGED = new Set([
  'data',
  'information',
  'equipment',
  'feedback',
  'media',
  'news',
  'series',
  'species',
  'settings',
  'metadata',
]);

/**
 * The plural of a name, by simple English rules applied to its last word: "Note" → "Notes",
 * "Category" → "Categories", "Address" → "Addresses", "Line item" → "Line items", "SKU" →
 * "SKUs", plus a short list of irregular words. The rest of the name is kept.
 */
export function plural(name: string): string {
  // A trailing parenthetical, like "(v2)", isn't the noun.
  const [, base = name, aside = ''] = /^(.*?)(\s*\([^()]*\))?$/.exec(name) ?? [];
  const match = /^(.*?)([A-Za-z]+)([^A-Za-z]*)$/.exec(base);
  if (!match) return name;
  const [, head = '', word = '', tail = ''] = match;
  return `${head}${pluralWord(word)}${tail}${aside}`;
}

function pluralWord(word: string): string {
  const lower = word.toLowerCase();
  if (UNCHANGED.has(lower)) return word;
  const irregular = IRREGULAR[lower];
  if (irregular) return matchCase(word, irregular);
  // An acronym takes a lower-case "s": SKUs, URLs.
  if (word.length > 1 && word === word.toUpperCase()) return `${word}s`;
  if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/i.test(word)) return `${word}es`;
  return `${word}s`;
}

/** `replacement` with the case of `word`'s first letter. */
function matchCase(word: string, replacement: string): string {
  if (word[0] === word[0]?.toUpperCase()) {
    return (replacement[0]?.toUpperCase() ?? '') + replacement.slice(1);
  }
  return replacement;
}
