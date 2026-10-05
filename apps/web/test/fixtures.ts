import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseDesignJson, type Erd } from '@modelwright/schema';

const NOTES_ERD = fileURLToPath(
  new URL('../../../packages/schema/test/fixtures/notes/erd.json', import.meta.url),
);

/** The phase 1 notes fixture's ERD, parsed, as a fresh object each call. */
export function notesErd(): Erd {
  const result = parseDesignJson('erd', readFileSync(NOTES_ERD, 'utf8'));
  if (!result.ok) throw new Error('notes fixture erd.json is invalid');
  return result.doc;
}

/** The fixture's raw canonical text. */
export function notesErdText(): string {
  return readFileSync(NOTES_ERD, 'utf8');
}
