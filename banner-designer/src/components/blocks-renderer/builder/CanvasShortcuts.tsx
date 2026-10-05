"use client"
import React from 'react'
import { useDispatch, useSelector } from '@/store/builderHooks';
import { setSelectedUid, updatePageContentState } from '@/store/builderActions';
import { duplicateElement, nudgeElement, removeElement } from '@/utils/contentOps';
import { nanoid } from 'nanoid';

const isEditableTarget = (target: EventTarget | null): boolean => {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
};

/**
 * Canvas keyboard shortcuts — lives inside the preview iframe.
 * Updates the iframe store live; the finished content set is pushed to the
 * parent via `builder-content-from-iframe` (ParentState applies it there).
 */
const CanvasShortcuts = () => {
  const dispatch = useDispatch();
  const pageBuilder = useSelector((state: any) => state.pageBuilder);
  const { selectedUid } = pageBuilder;
  const pageContent = useSelector((state: any) => state.pageContent);
  const contentRef = React.useRef(pageContent);
  contentRef.current = pageContent;

  const pushToParent = React.useCallback(() => {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(
        { type: 'builder-content-from-iframe', value: { draftPageContentSet: contentRef.current.draftPageContentSet } },
        window.location.origin
      );
    }
  }, []);

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Save is global — valid even while inline-editing text.
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        window.parent?.postMessage({ type: 'builder-save-request' }, window.location.origin);
        return;
      }
      if (isEditableTarget(e.target)) return;

      // Undo/redo lives in the parent (its store holds history) — forward.
      if ((e.ctrlKey || e.metaKey)) {
        const key = e.key.toLowerCase();
        if (key === 'z' && !e.shiftKey) {
          e.preventDefault();
          window.parent?.postMessage({ type: 'builder-undo-request' }, window.location.origin);
          return;
        }
        if ((key === 'z' && e.shiftKey) || key === 'y') {
          e.preventDefault();
          window.parent?.postMessage({ type: 'builder-redo-request' }, window.location.origin);
          return;
        }
      }

      const uid = selectedUid;
      if (!uid || uid === 'body') {
        if (e.key === 'Escape') {
          dispatch(setSelectedUid(null));
          const pb = JSON.parse(JSON.stringify(pageBuilder));
          pb.selectedUid = null;
          window.parent?.postMessage({ type: 'builder-state-from-iframe', value: pb }, window.location.origin);
        }
        return;
      }

      const contentSet = contentRef.current.draftPageContentSet;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        const next = removeElement(contentSet, uid);
        dispatch(updatePageContentState({ ...contentRef.current, draftPageContentSet: next }));
        dispatch(setSelectedUid(null));
        contentRef.current = { ...contentRef.current, draftPageContentSet: next };
        pushToParent();
        // Also clear the parent's selection — it would otherwise keep a
        // uid that no longer exists and crash on it.
        const pb = JSON.parse(JSON.stringify(pageBuilder));
        pb.selectedUid = null;
        window.parent?.postMessage({ type: 'builder-state-from-iframe', value: pb }, window.location.origin);
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        const { contentSet: next, newRootUid } = duplicateElement(contentSet, uid, () => `uid-${nanoid(10)}`);
        if (newRootUid) {
          dispatch(updatePageContentState({ ...contentRef.current, draftPageContentSet: next }));
          contentRef.current = { ...contentRef.current, draftPageContentSet: next };
          pushToParent();
        }
        return;
      }

      const nudgeMap: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      };
      if (nudgeMap[e.key]) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const [dx, dy] = nudgeMap[e.key];
        const next = nudgeElement(contentSet, uid, dx * step, dy * step);
        dispatch(updatePageContentState({ ...contentRef.current, draftPageContentSet: next }));
        contentRef.current = { ...contentRef.current, draftPageContentSet: next };
        pushToParent();
        return;
      }

      if (e.key === 'Escape') {
        dispatch(setSelectedUid(null));
        const pb = JSON.parse(JSON.stringify(pageBuilder));
        pb.selectedUid = null;
        window.parent?.postMessage({ type: 'builder-state-from-iframe', value: pb }, window.location.origin);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dispatch, selectedUid, pageBuilder, pushToParent]);

  return null;
};

export default CanvasShortcuts;
