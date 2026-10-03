import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect } from 'vitest';
import type { DesignKind, Issue, ParseResult } from '../src/index';

export const NOTES_FIXTURE_DIR = fileURLToPath(new URL('./fixtures/notes', import.meta.url));

/** The raw text of a notes fixture file. */
export function fixtureText(kind: DesignKind): string {
  return readFileSync(`${NOTES_FIXTURE_DIR}/${kind}.json`, 'utf8');
}

/** A fresh, mutable copy of a notes fixture document. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tests mutate fixtures into invalid shapes
export function fixture(kind: DesignKind): any {
  return JSON.parse(fixtureText(kind));
}

/** Asserts the parse failed and returns its issues. */
export function issuesOf(result: ParseResult<unknown>): Issue[] {
  if (result.ok) throw new Error('Expected parse to fail, but it succeeded');
  return result.error.issues;
}

/** Asserts the parse failed with an issue at exactly `path` whose message matches. */
export function expectIssue(
  result: ParseResult<unknown>,
  path: Issue['path'],
  message?: RegExp,
): void {
  const issues = issuesOf(result);
  const match = issues.find((i) => JSON.stringify(i.path) === JSON.stringify(path));
  expect(match, `no issue at ${JSON.stringify(path)}; got ${JSON.stringify(issues)}`).toBeDefined();
  if (message) expect(match?.message).toMatch(message);
}
