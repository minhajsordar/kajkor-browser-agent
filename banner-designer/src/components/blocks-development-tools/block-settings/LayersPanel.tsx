'use client'
import React from 'react'
import { useDispatch, useSelector } from '@/store/builderHooks';
import { removeElement, reorderElement } from '@/utils/contentOps';
import { setSelectedUid, updatePageContentSetByKey, updatePageContentState } from '@/store/builderActions';

const TAG_ICONS: Record<string, string> = {
    h1: 'H1', h2: 'H2', h3: 'H3', h4: 'H4', h5: 'H5', h6: 'H6',
    p: '¶', span: 'Aa', strong: 'B', em: 'I', a: '↗',
    img: '▣', button: '▭', div: '▢', section: '▤', ul: '☰', ol: '☰', li: '•',
};

function elementLabel(el: any): string {
    if (typeof el?.text === 'string' && el.text.trim()) {
        return el.text.trim().slice(0, 22);
    }
    if (el?.tag === 'img') return 'Image';
    if (el?.tag === 'button') return 'Button';
    return el?.tag || 'element';
}

interface Row {
    uid: string;
    el: any;
    depth: number;
    parentId: string;
    /** index of this uid inside its parent's child array */
    index: number;
}

function collectRows(contentSet: Record<string, any>): Row[] {
    const rows: Row[] = [];
    const walk = (parentUid: string, depth: number) => {
        const children: string[] = contentSet[parentUid]?.child || [];
        // Display front-most first (later DOM = painted on top).
        for (let i = children.length - 1; i >= 0; i--) {
            const uid = children[i];
            const el = contentSet[uid];
            if (!el) continue;
            rows.push({ uid, el, depth, parentId: parentUid, index: i });
            walk(uid, depth + 1);
        }
    };
    walk('body', 0);
    return rows;
}

const LayersPanel = () => {
    const dispatch = useDispatch();
    const pageBuilder = useSelector((state: any) => state.pageBuilder);
    const { selectedUid } = pageBuilder;
    const pageContent = useSelector((state: any) => state.pageContent);
    const { draftPageContentSet } = pageContent;
    const [dragUid, setDragUid] = React.useState<string | null>(null);

    if (!draftPageContentSet?.body) return null;
    const rows = collectRows(draftPageContentSet);

    const toggleHidden = (uid: string) => {
        const el = JSON.parse(JSON.stringify(draftPageContentSet[uid]));
        const styles = el.style?.light?.default?.styles;
        if (!styles) return;
        if (styles.visibility === 'hidden') {
            delete styles.visibility;
        } else {
            styles.visibility = 'hidden';
        }
        dispatch(updatePageContentSetByKey({ key: uid, value: el }));
    };

    const remove = (uid: string) => {
        const next = removeElement(draftPageContentSet, uid);
        dispatch(updatePageContentState({ ...pageContent, draftPageContentSet: next }));
        if (selectedUid === uid) dispatch(setSelectedUid('body'));
    };

    const onDropRow = (target: Row) => {
        if (!dragUid || dragUid === target.uid) return;
        const dragged = draftPageContentSet[dragUid];
        // Only same-parent reorder (z-order) — reparenting via layers is
        // deliberately out of scope.
        if (dragged?.parentId !== target.parentId) return;
        dispatch(updatePageContentState({
            ...pageContent,
            draftPageContentSet: reorderElement(draftPageContentSet, dragUid, target.index),
        }));
        setDragUid(null);
    };

    return (
        <div className='flex flex-col gap-0.5 p-2'>
            <div className='px-1 pb-2 text-[10px] uppercase tracking-wider text-neutral-400'>
                {rows.length} layer{rows.length === 1 ? '' : 's'} · top of list = front
            </div>
            {rows.map((row) => {
                const hidden = row.el.style?.light?.default?.styles?.visibility === 'hidden';
                const selected = selectedUid === row.uid;
                return (
                    <div
                        key={row.uid}
                        draggable
                        onDragStart={() => setDragUid(row.uid)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => onDropRow(row)}
                        onClick={() => dispatch(setSelectedUid(row.uid))}
                        className={`group flex cursor-pointer items-center gap-1.5 rounded-sm px-1.5 py-1 text-xs ${
                            selected ? 'bg-indigo-100 text-indigo-800' : 'text-neutral-700 hover:bg-neutral-100'
                        } ${dragUid === row.uid ? 'opacity-40' : ''}`}
                        style={{ paddingLeft: `${6 + row.depth * 14}px` }}
                    >
                        <span className='w-6 shrink-0 text-center text-[10px] text-neutral-500'>
                            {TAG_ICONS[row.el.tag] || '▢'}
                        </span>
                        <span className={`min-w-0 flex-1 truncate ${hidden ? 'line-through opacity-50' : ''}`}>
                            {elementLabel(row.el)}
                        </span>
                        <button
                            className='invisible px-1 text-neutral-500 hover:text-neutral-800 group-hover:visible'
                            title={hidden ? 'Show' : 'Hide'}
                            onClick={(e) => { e.stopPropagation(); toggleHidden(row.uid); }}
                        >
                            {hidden ? '◌' : '◉'}
                        </button>
                        <button
                            className='invisible px-1 text-neutral-400 hover:text-red-500 group-hover:visible'
                            title='Delete'
                            onClick={(e) => { e.stopPropagation(); remove(row.uid); }}
                        >
                            ✕
                        </button>
                    </div>
                );
            })}
            {rows.length === 0 && (
                <div className='px-2 py-6 text-center text-xs text-neutral-400'>
                    Empty canvas — add elements from the left rail.
                </div>
            )}
        </div>
    );
};

export default LayersPanel;
