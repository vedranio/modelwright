import { stringifyDesign, type Issue } from '@modelwright/schema';
import type { DesignDoc, DesignKind } from './platform/ProjectClient';

/** One design file as a view sees it. Each file loads independently, so one bad file can't break the others. */
export type DocState<K extends DesignKind> =
  | { status: 'loading' }
  | { status: 'ok'; doc: DesignDoc<K> }
  | { status: 'invalid'; issues: Issue[] }
  | { status: 'error'; message: string };

/** `prev` when both states hold the same document (compared canonically), otherwise `next`. */
export function keepUnchanged<K extends DesignKind>(
  kind: K,
  prev: DocState<K>,
  next: DocState<K>,
): DocState<K> {
  if (prev.status === 'ok' && next.status === 'ok') {
    return stringifyDesign(kind, prev.doc) === stringifyDesign(kind, next.doc) ? prev : next;
  }
  return next;
}
