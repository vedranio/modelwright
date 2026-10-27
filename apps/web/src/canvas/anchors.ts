/**
 * Join points (`anchors` in erd.json and flows.json) are layout keyed by link id. Once a link
 * goes, its entry must go too, or the file won't validate. Views run every edit through this,
 * so no operation has to remember it. Returns the same document when nothing changes.
 */
export function pruneAnchors<D extends { anchors?: Readonly<Record<string, unknown>> }>(
  doc: D,
  links: readonly { id: string }[],
): D {
  const anchors = doc.anchors;
  if (!anchors) return doc;
  const live = new Set(links.map((l) => l.id));
  const kept = Object.entries(anchors).filter(
    ([id, ends]) => live.has(id) && ends !== null && Object.keys(ends as object).length > 0,
  );
  if (kept.length === Object.keys(anchors).length) return doc;
  const next = { ...doc };
  if (kept.length === 0) delete next.anchors;
  else next.anchors = Object.fromEntries(kept) as D['anchors'];
  return next;
}

/**
 * Sets or clears one end of one link's anchors, dropping the entry once both ends are clear.
 * Returns the same document when nothing changes.
 */
export function withAnchorEnd<
  D extends { anchors?: Readonly<Record<string, Readonly<Partial<Record<'from' | 'to', A>>>>> },
  A,
>(doc: D, linkId: string, end: 'from' | 'to', anchor: A | null, same: (a: A, b: A) => boolean): D {
  const ends = doc.anchors?.[linkId] ?? {};
  const current = ends[end];
  if (anchor === null ? current === undefined : current !== undefined && same(current, anchor)) {
    return doc;
  }
  const nextEnds = Object.fromEntries(
    Object.entries({ ...ends, [end]: anchor }).filter(([, a]) => a !== null && a !== undefined),
  ) as Partial<Record<'from' | 'to', A>>;
  const others = Object.entries(doc.anchors ?? {}).filter(([id]) => id !== linkId);
  const anchors = Object.fromEntries(
    Object.keys(nextEnds).length === 0 ? others : [...others, [linkId, nextEnds]],
  );
  const next: D = { ...doc, anchors };
  if (Object.keys(anchors).length === 0) delete next.anchors;
  return next;
}
