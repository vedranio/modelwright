import { stringifyDesign, type Issue } from '@modelwright/schema';
import type { DesignDoc, DesignKind } from './platform/ProjectClient';

/** One design file as a view sees it. Each file loads independently, so one bad file can't break the others. */
export type DocState<K extends DesignKind> =
  | { status: 'loading' }
  | { status: 'ok'; doc: DesignDoc<K> }
  | { status: 'invalid'; issues: Issue[] }
  /** `unreachable` when the modelwright server couldn't be reached at all. */
  | { status: 'error'; message: string; unreachable?: boolean };

/**
 * `prev` when both states hold the same document (compared canonically), otherwise `next`. A
 * re-read that couldn't reach the server keeps `prev` too: nothing is known to have changed on
 * disk, so the design stays on screen instead of turning into an error while the server is down.
 */
export function keepUnchanged<K extends DesignKind>(
  kind: K,
  prev: DocState<K>,
  next: DocState<K>,
): DocState<K> {
  if (prev.status === 'ok' && next.status === 'error' && next.unreachable) return prev;
  if (prev.status === 'ok' && next.status === 'ok') {
    return stringifyDesign(kind, prev.doc) === stringifyDesign(kind, next.doc) ? prev : next;
  }
  return next;
}
