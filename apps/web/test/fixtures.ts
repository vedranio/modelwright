import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseDesignJson, type Erd, type Flows } from '@modelwright/schema';

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

const NOTES_FLOWS = fileURLToPath(
  new URL('../../../packages/schema/test/fixtures/notes/flows.json', import.meta.url),
);

/** The phase 1 notes fixture's flows, parsed, as a fresh object each call. */
export function notesFlows(): Flows {
  const result = parseDesignJson('flows', readFileSync(NOTES_FLOWS, 'utf8'));
  if (!result.ok) throw new Error('notes fixture flows.json is invalid');
  return result.doc;
}

/** The fixture's raw canonical flows text. */
export function notesFlowsText(): string {
  return readFileSync(NOTES_FLOWS, 'utf8');
}
