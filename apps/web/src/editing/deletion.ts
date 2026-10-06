/** Shared wording for the undo toasts in erd/deletion.ts and flows/deletion.ts. */

/** "1 attribute", "2 attributes", "3 entities". */
export function count(n: number, noun: string): string {
  if (n === 1) return `1 ${noun}`;
  return `${n} ${noun.endsWith('y') ? `${noun.slice(0, -1)}ies` : `${noun}s`}`;
}

/** A name in quotes, e.g. 'User', or "(unnamed)" when it's blank. */
export function quoted(name: string): string {
  return name.trim() ? `'${name.trim()}'` : '(unnamed)';
}

/** "Deleted X", "Deleted X and Y", "Deleted X, Y and Z"; false parts are left out. */
export function deletedMessage(subject: string, ...parts: (string | false)[]): string {
  const all = [subject, ...parts.filter((p): p is string => p !== false)];
  const last = all.pop() as string;
  return all.length === 0 ? `Deleted ${last}` : `Deleted ${all.join(', ')} and ${last}`;
}
