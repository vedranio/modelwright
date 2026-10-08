import type { Change, DesignDiff } from './diff';
import { inlineText } from './ids';

/** The section headings, in the order the spec uses. */
export const DIFF_GROUPS = [
  { key: 'dataModel', title: 'Data model' },
  { key: 'screens', title: 'Screens and flows' },
  { key: 'config', title: 'Config' },
] as const satisfies readonly { key: keyof DesignDiff; title: string }[];

/**
 * A design diff as Markdown: a `###` heading per group that has changes, then one bullet per
 * change. Groups without changes are left out; an empty diff reads "No changes."
 */
export function renderDiff(diff: DesignDiff): string {
  const lines: string[] = [];
  for (const { key, title } of DIFF_GROUPS) {
    const changes: Change[] = diff[key];
    if (changes.length === 0) continue;
    lines.push(`### ${title}`, '');
    for (const change of changes) lines.push(`- ${inlineText(change.text)}`);
    lines.push('');
  }
  if (lines.length === 0) return 'No changes.\n';
  while (lines[lines.length - 1] === '') lines.pop();
  return `${lines.join('\n')}\n`;
}
