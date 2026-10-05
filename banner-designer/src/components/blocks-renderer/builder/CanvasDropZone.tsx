"use client"
import React from 'react'
import { useDispatch, useSelector } from '@/store/builderHooks';
import { setSelectedUid, updatePageContentState } from '@/store/builderActions';
import { nanoid } from 'nanoid';

const px = (v: any): number | null => {
    const n = parseFloat(String(v));
    return Number.isNaN(n) ? null : n;
};

/**
 * Accepts elements dragged from the parent's Elements panel and drops them
 * onto the artboard at the drop point. Lives inside the preview iframe —
 * the dragged payload arrives via dataTransfer or, for cross-document
 * drags, via `window.parent.__bannerDrag`.
 */
const CanvasDropZone = () => {
    const dispatch = useDispatch();
    const pageContent = useSelector((state: any) => state.pageContent);
    const contentRef = React.useRef(pageContent);
    contentRef.current = pageContent;

    React.useEffect(() => {
        const canvasEl = document.querySelector('.banner-canvas') as HTMLElement | null;

        const onDragOver = (e: DragEvent) => {
            // Only claim banner-element drags so other drags behave normally.
            const types = Array.from(e.dataTransfer?.types || []);
            const fromPanel = types.includes('application/x-banner-element') || (window.parent as any)?.__bannerDrag;
            if (!fromPanel) return;
            e.preventDefault();
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
        };

        const onDrop = (e: DragEvent) => {
            const raw =
                e.dataTransfer?.getData('application/x-banner-element') ||
                (window.parent as any)?.__bannerDrag;
            if (!raw) return;
            e.preventDefault();
            (window.parent as any).__bannerDrag = null;

            let block: any;
            try { block = JSON.parse(raw); } catch { return; }

            const rect = canvasEl?.getBoundingClientRect();
            const uid = `uid-${nanoid(10)}`;
            const element = JSON.parse(JSON.stringify(block));
            element.systemAddedClass = uid;
            element.uid = uid;
            element.parentId = 'body';
            const styles = element.style?.light?.default?.styles || {};
            const elW = px(styles.width) ?? 120;
            const elH = px(styles.height) ?? 40;
            const sc = (window as any).__canvasScale || 1;
            const dropX = rect ? (e.clientX - rect.left) / sc : 0;
            const dropY = rect ? (e.clientY - rect.top) / sc : 0;
            styles.left = `${Math.max(0, Math.round(dropX - elW / 2))}px`;
            styles.top = `${Math.max(0, Math.round(dropY - elH / 2))}px`;

            const next = JSON.parse(JSON.stringify(contentRef.current));
            if (!next.draftPageContentSet?.body?.child) return;
            next.draftPageContentSet.body.child.push(uid);
            next.draftPageContentSet[uid] = element;
            dispatch(updatePageContentState(next));
            dispatch(setSelectedUid(uid));
            if (window.parent && window.parent !== window) {
                window.parent.postMessage(
                    { type: 'builder-content-from-iframe', value: { draftPageContentSet: next.draftPageContentSet } },
                    window.location.origin
                );
            }
        };

        document.addEventListener('dragover', onDragOver);
        document.addEventListener('drop', onDrop);
        return () => {
            document.removeEventListener('dragover', onDragOver);
            document.removeEventListener('drop', onDrop);
        };
    }, [dispatch]);

    return null;
};

export default CanvasDropZone;
