/**
 * Pure operations on a builderData map (uid -> element). Used by the iframe
 * keyboard shortcuts, the layers panel, and the elements panel — all
 * return a NEW map (no mutation) so callers can dispatch it straight into
 * updatePageContentState.
 */

export function collectSubtreeUids(contentSet: Record<string, any>, uid: string): string[] {
  const out: string[] = [];
  const walk = (id: string) => {
    if (!contentSet[id]) return;
    out.push(id);
    for (const child of contentSet[id].child || []) walk(child);
  };
  walk(uid);
  return out;
}

export function removeElement(contentSet: Record<string, any>, uid: string): Record<string, any> {
  if (uid === 'body' || !contentSet[uid]) return contentSet;
  const next = JSON.parse(JSON.stringify(contentSet));
  const doomed = new Set(collectSubtreeUids(next, uid));
  const parentId = next[uid]?.parentId;
  if (parentId && next[parentId]?.child) {
    next[parentId].child = next[parentId].child.filter((c: string) => c !== uid);
  }
  for (const id of doomed) delete next[id];
  return next;
}

export function duplicateElement(
  contentSet: Record<string, any>,
  uid: string,
  newUid: () => string,
  offset = 12
): { contentSet: Record<string, any>; newRootUid: string | null } {
  if (uid === 'body' || !contentSet[uid]) return { contentSet, newRootUid: null };
  const next = JSON.parse(JSON.stringify(contentSet));
  const subtree = collectSubtreeUids(next, uid);
  const keyMap: Record<string, string> = {};
  for (const oldUid of subtree) keyMap[oldUid] = newUid();

  for (const oldUid of subtree) {
    const clone = JSON.parse(JSON.stringify(next[oldUid]));
    const cloneUid = keyMap[oldUid];
    clone.uid = cloneUid;
    clone.systemAddedClass = cloneUid;
    clone.child = (clone.child || []).map((c: string) => keyMap[c] || c);
    if (oldUid === uid) {
      clone.parentId = next[oldUid].parentId;
      const styles = clone.style?.light?.default?.styles || {};
      const left = parseFloat(styles.left);
      const top = parseFloat(styles.top);
      if (!Number.isNaN(left)) styles.left = `${left + offset}px`;
      if (!Number.isNaN(top)) styles.top = `${top + offset}px`;
    }
    next[cloneUid] = clone;
  }

  const parentId = next[uid].parentId;
  if (parentId && next[parentId]?.child) {
    const idx = next[parentId].child.indexOf(uid);
    next[parentId].child.splice(idx + 1, 0, keyMap[uid]);
  }
  return { contentSet: next, newRootUid: keyMap[uid] };
}

export function nudgeElement(
  contentSet: Record<string, any>,
  uid: string,
  dx: number,
  dy: number
): Record<string, any> {
  const el = contentSet[uid];
  if (!el || uid === 'body') return contentSet;
  const next = JSON.parse(JSON.stringify(contentSet));
  const styles = next[uid]?.style?.light?.default?.styles;
  if (!styles) return contentSet;
  const left = parseFloat(styles.left) || 0;
  const top = parseFloat(styles.top) || 0;
  styles.position = styles.position || 'absolute';
  styles.left = `${left + dx}px`;
  styles.top = `${top + dy}px`;
  return next;
}

/** Reorder within the same parent — controls z-order on the canvas. */
export function reorderElement(
  contentSet: Record<string, any>,
  uid: string,
  toIndex: number
): Record<string, any> {
  const el = contentSet[uid];
  const parent = el?.parentId ? contentSet[el.parentId] : null;
  if (!parent?.child) return contentSet;
  const next = JSON.parse(JSON.stringify(contentSet));
  const children = next[el.parentId].child;
  const from = children.indexOf(uid);
  if (from === -1) return contentSet;
  children.splice(from, 1);
  children.splice(Math.max(0, Math.min(toIndex, children.length)), 0, uid);
  return next;
}
