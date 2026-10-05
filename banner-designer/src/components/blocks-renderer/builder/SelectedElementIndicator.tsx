"use client"
import { setSelectedUid, updatePageContentState } from '@/store/builderActions';
import { duplicateElement, removeElement, reorderElement } from '@/utils/contentOps';
import React from 'react'
import { useDispatch, useSelector } from '@/store/builderHooks';
import { nanoid } from 'nanoid';

const FONTS = [
    { name: 'Arial', stack: 'Arial, sans-serif' },
    { name: 'Georgia', stack: 'Georgia, serif' },
    { name: 'Verdana', stack: 'Verdana, sans-serif' },
    { name: 'Trebuchet', stack: '"Trebuchet MS", sans-serif' },
    { name: 'Times', stack: '"Times New Roman", serif' },
    { name: 'Courier', stack: '"Courier New", monospace' },
    { name: 'Impact', stack: 'Impact, sans-serif' },
];

const px = (v: any): number | null => {
    const n = parseFloat(String(v));
    return Number.isNaN(n) ? null : n;
};

// x/y are fractions of the selection box; dx/dy mark which edges the
// handle moves (corners move two, edge handles move one).
const HANDLES = [
    { key: 'nw', x: 0, y: 0, dx: -1, dy: -1, edge: false, cursor: 'nwse-resize' },
    { key: 'n', x: 0.5, y: 0, dx: 0, dy: -1, edge: true, cursor: 'ns-resize' },
    { key: 'ne', x: 1, y: 0, dx: 1, dy: -1, edge: false, cursor: 'nesw-resize' },
    { key: 'e', x: 1, y: 0.5, dx: 1, dy: 0, edge: true, cursor: 'ew-resize' },
    { key: 'se', x: 1, y: 1, dx: 1, dy: 1, edge: false, cursor: 'nwse-resize' },
    { key: 's', x: 0.5, y: 1, dx: 0, dy: 1, edge: true, cursor: 'ns-resize' },
    { key: 'sw', x: 0, y: 1, dx: -1, dy: 1, edge: false, cursor: 'nesw-resize' },
    { key: 'w', x: 0, y: 0.5, dx: -1, dy: 0, edge: true, cursor: 'ew-resize' },
];

const SelectedElementIndicator = () => {
    const outlinedBoxRef = React.useRef<HTMLDivElement>(null);
    const headerRef = React.useRef<HTMLDivElement>(null);
    const [pillBelow, setPillBelow] = React.useState(false);
    const pageBuilder = useSelector((state: any) => state.pageBuilder);
    const dispatch = useDispatch()
    const { selectedUid, insertIntoUid } = pageBuilder;

    const pageContent = useSelector((state: any) => state.pageContent);
    const { draftPageContentSet } = pageContent;
    const pageContentRef = React.useRef(pageContent);
    pageContentRef.current = pageContent;

    const sendMessageToParent = (message: any) => {
        if (window.parent && window.parent !== window) {
            window.parent.postMessage(message, window.location.origin);
        }
    };

    /** Commit a new content set locally + push to the parent (one undo step). */
    const commit = (nextContentSet: Record<string, any>) => {
        dispatch(updatePageContentState({ ...pageContentRef.current, draftPageContentSet: nextContentSet }));
        sendMessageToParent({
            type: 'builder-content-from-iframe',
            value: { draftPageContentSet: nextContentSet },
        });
    };

    const contentSet = () => JSON.parse(JSON.stringify(pageContentRef.current.draftPageContentSet));

    const setStyle = (key: string, value: string) => {
        const cs = contentSet();
        const s = cs[`${selectedUid}`]?.style?.light?.default?.styles;
        if (!s) return;
        s[key] = value;
        commit(cs);
    };

    const handleSelectParent = () => {
        const selectedContentSet = draftPageContentSet[`${selectedUid}`]
        const pageBuilderStateObject = JSON.parse(JSON.stringify(pageBuilder))
        if (selectedContentSet?.parentId) {
            pageBuilderStateObject.selectedUid = String(selectedContentSet.parentId)
            if (insertIntoUid) {
                pageBuilderStateObject.insertIntoUid = String(selectedContentSet.parentId)
            }
            sendMessageToParent({ type: "builder-state-from-iframe", value: pageBuilderStateObject })
        }
    };
    const handleInsert = () => {
        if (selectedUid) {
            const pageBuilderStateObject = JSON.parse(JSON.stringify(pageBuilder))
            pageBuilderStateObject.insertIntoUid = selectedUid
            sendMessageToParent({ type: "builder-state-from-iframe", value: pageBuilderStateObject })
        }
    };

    const doDuplicate = () => {
        const { contentSet: next, newRootUid } = duplicateElement(
            contentSet(), `${selectedUid}`, () => `uid-${nanoid(10)}`);
        if (!newRootUid) return;
        commit(next);
        dispatch(setSelectedUid(newRootUid));
        const st = JSON.parse(JSON.stringify(pageBuilder));
        st.selectedUid = newRootUid;
        sendMessageToParent({ type: 'builder-state-from-iframe', value: st });
    };

    const doDelete = () => {
        commit(removeElement(contentSet(), `${selectedUid}`));
        dispatch(setSelectedUid(null));
        const st = JSON.parse(JSON.stringify(pageBuilder));
        st.selectedUid = null;
        sendMessageToParent({ type: 'builder-state-from-iframe', value: st });
    };

    const doReorder = (dir: 1 | -1) => {
        const el = draftPageContentSet[`${selectedUid}`];
        const parent = el?.parentId ? draftPageContentSet[el.parentId] : null;
        if (!parent?.child) return;
        const idx = parent.child.indexOf(selectedUid);
        if (idx === -1) return;
        commit(reorderElement(contentSet(), `${selectedUid}`, idx + dir));
    };

    // Canva-style control points: 8 resize handles (corners + edges) and a
    // rotate handle below the element.
    const resizeState = React.useRef<{
        startX: number; startY: number; left: number; top: number;
        width: number; height: number; dx: number; dy: number; moved: boolean;
    } | null>(null);

    const pushAfterGesture = (state: { moved: boolean } | null) => {
        if (state?.moved) {
            sendMessageToParent({
                type: 'builder-content-from-iframe',
                value: { draftPageContentSet: pageContentRef.current.draftPageContentSet },
            });
        }
    };

    const onResizeMouseDown = (dir: { dx: number; dy: number }) => (event: React.MouseEvent<HTMLElement>) => {
        event.stopPropagation();
        event.preventDefault();
        const element = draftPageContentSet?.[`${selectedUid}`];
        if (!element || element.locked) return;
        const styles = element.style?.light?.default?.styles || {};
        const rect = (event.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
        const sc = (window as any).__canvasScale || 1;
        resizeState.current = {
            startX: event.clientX,
            startY: event.clientY,
            left: parseFloat(styles.left) || 0,
            top: parseFloat(styles.top) || 0,
            width: parseFloat(styles.width) || rect.width / sc,
            height: parseFloat(styles.height) || rect.height / sc,
            dx: dir.dx,
            dy: dir.dy,
            moved: false,
        };
        const MIN = 8;
        const onMove = (e: MouseEvent) => {
            const drag = resizeState.current;
            if (!drag) return;
            drag.moved = true;
            const sc = (window as any).__canvasScale || 1;
            const dxPx = (e.clientX - drag.startX) / sc;
            const dyPx = (e.clientY - drag.startY) / sc;
            let { left, top, width, height } = drag;
            if (drag.dx === 1) width = drag.width + dxPx;
            if (drag.dx === -1) { left = drag.left + dxPx; width = drag.width - dxPx; }
            if (drag.dy === 1) height = drag.height + dyPx;
            if (drag.dy === -1) { top = drag.top + dyPx; height = drag.height - dyPx; }
            if (width < MIN) { if (drag.dx === -1) left = drag.left + drag.width - MIN; width = MIN; }
            if (height < MIN) { if (drag.dy === -1) top = drag.top + drag.height - MIN; height = MIN; }
            const next = JSON.parse(JSON.stringify(pageContentRef.current));
            const s = next.draftPageContentSet?.[`${selectedUid}`]?.style?.light?.default?.styles;
            if (!s) return;
            s.left = `${Math.round(left)}px`;
            s.top = `${Math.round(top)}px`;
            s.width = `${Math.round(width)}px`;
            s.height = `${Math.round(height)}px`;
            dispatch(updatePageContentState(next));
        };
        const onUp = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            pushAfterGesture(resizeState.current);
            resizeState.current = null;
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    };

    // Rotate handle: drag around the element centre → transform: rotate(Ndeg).
    // Shift snaps to 15° steps; releases within 4° of a right angle snap to it.
    const rotateState = React.useRef<{ cx: number; cy: number; moved: boolean } | null>(null);
    const onRotateMouseDown = (event: React.MouseEvent<HTMLElement>) => {
        event.stopPropagation();
        event.preventDefault();
        const element = draftPageContentSet?.[`${selectedUid}`];
        if (!element || element.locked) return;
        const box = event.currentTarget.parentElement as HTMLElement;
        const rect = box.getBoundingClientRect();
        rotateState.current = {
            cx: rect.left + rect.width / 2,
            cy: rect.top + rect.height / 2,
            moved: false,
        };
        const onMove = (e: MouseEvent) => {
            const rot = rotateState.current;
            if (!rot) return;
            rot.moved = true;
            let deg = Math.atan2(e.clientY - rot.cy, e.clientX - rot.cx) * 180 / Math.PI + 90;
            if (e.shiftKey) deg = Math.round(deg / 15) * 15;
            else {
                const snap = Math.round(deg / 90) * 90;
                if (Math.abs(deg - snap) <= 4) deg = snap;
            }
            deg = Math.round(((deg % 360) + 360) % 360);
            const next = JSON.parse(JSON.stringify(pageContentRef.current));
            const s = next.draftPageContentSet?.[`${selectedUid}`]?.style?.light?.default?.styles;
            if (!s) return;
            if (deg === 0) delete s.transform;
            else s.transform = `rotate(${deg}deg)`;
            dispatch(updatePageContentState(next));
        };
        const onUp = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            pushAfterGesture(rotateState.current);
            rotateState.current = null;
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    };

    React.useEffect(() => {
        // No chrome for the artboard itself or when nothing is selected —
        // Canva only toolbars real elements.
        const selectedElement = selectedUid && selectedUid !== 'body'
            ? document.querySelector(`.builder-selected-element-indicator`)
            : null;
        if (selectedElement && outlinedBoxRef.current && headerRef.current) {
            const { top, left, width, height } = selectedElement.getBoundingClientRect();
            const indicator = outlinedBoxRef.current;
            // fixed — resolves against the viewport, so body padding
            // (the pasteboard) can't offset it. Nothing scrolls inside the
            // iframe, so rect coords are already document coords.
            indicator.style.position = 'fixed';
            indicator.style.top = `${top}px`;
            indicator.style.left = `${left}px`;
            indicator.style.width = `${width}px`;
            indicator.style.height = `${height}px`;
            indicator.style.display = 'block';
            // Toolbar anchor: sits on the element's top edge; the pill flips
            // below the element when there isn't room above it.
            const header = headerRef.current;
            header.style.position = 'fixed';
            header.style.top = `${top}px`;
            header.style.left = `${left + width / 2}px`;
            header.style.width = '0px';
            header.style.height = '0px';
            header.style.display = 'block';
            setPillBelow(top < 46);
        } else if (outlinedBoxRef.current && headerRef.current) {
            outlinedBoxRef.current.style.display = 'none';
            headerRef.current.style.display = 'none';
        }
    }, [pageBuilder, pageContent]);

    const el = draftPageContentSet?.[`${selectedUid}`];
    const styles = el?.style?.light?.default?.styles || {};
    const isText = !!el && Object.hasOwn(el, 'text');
    const isBodyChild = el?.parentId === 'body';
    const fontSize = px(styles['font-size']) || 16;
    const isBold = String(styles['font-weight'] || '400') >= '600';
    const isItalic = styles['font-style'] === 'italic';
    const isUnderline = String(styles['text-decoration'] || '').includes('underline');
    const align = styles['text-align'] || 'left';
    const currentFont = FONTS.find((f) => String(styles['font-family'] || '').includes(f.name))?.stack || '';

    const iconBtn = 'flex h-7 w-7 items-center justify-center rounded-md text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 text-[13px]';
    const divider = <span className='mx-0.5 h-4 w-px bg-neutral-200' />;

    return (
        <React.Fragment>
            <div
                ref={outlinedBoxRef}
                className='border-2 border-violet-500 pointer-events-none z-[9999999]'
                style={{ display: 'none' }}
            >
                {/* 8 resize control points — corners are circles, edges are pills */}
                {HANDLES.map((h) => (
                    <div
                        key={h.key}
                        onMouseDown={onResizeMouseDown({ dx: h.dx, dy: h.dy })}
                        className='absolute bg-white border-2 border-violet-500 pointer-events-auto'
                        title='Drag to resize'
                        style={{
                            left: `${h.x * 100}%`,
                            top: `${h.y * 100}%`,
                            transform: 'translate(-50%, -50%)',
                            cursor: h.cursor,
                            ...(h.edge
                                ? (h.dx !== 0
                                    ? { width: '6px', height: '16px', borderRadius: '4px' }
                                    : { width: '16px', height: '6px', borderRadius: '4px' })
                                : { width: '11px', height: '11px', borderRadius: '50%' }),
                        }}
                    />
                ))}
                {/* Rotate handle below the element */}
                <div
                    onMouseDown={onRotateMouseDown}
                    className='absolute left-1/2 top-full mt-4 flex h-7 w-7 -translate-x-1/2 items-center justify-center rounded-full bg-violet-600 text-white shadow-md pointer-events-auto cursor-grab active:cursor-grabbing'
                    title='Drag to rotate (Shift = 15° steps)'
                >
                    <svg width='13' height='13' viewBox='0 0 24 24' fill='none'>
                        <path d='M20 12a8 8 0 1 1-2.34-5.66' stroke='currentColor' strokeWidth='2.4' strokeLinecap='round' />
                        <path d='M20 3v4h-4' stroke='currentColor' strokeWidth='2.4' strokeLinecap='round' strokeLinejoin='round' />
                    </svg>
                </div>
            </div>

            {/* Floating toolbar — white pill like Canva's, anchored on the
                element's top edge (flips below when there is no room). */}
            <div ref={headerRef} className='z-[9999999]' style={{ display: 'none' }}>
                <div
                    className={`absolute left-0 -translate-x-1/2 flex items-center gap-0.5 rounded-lg border border-neutral-200 bg-white px-1.5 py-1 shadow-lg whitespace-nowrap ${
                        pillBelow ? 'top-full mt-2' : 'bottom-full mb-2'
                    }`}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                >
                    {isText && (
                        <React.Fragment>
                            <select
                                value={currentFont}
                                onChange={(e) => e.target.value && setStyle('font-family', e.target.value)}
                                className='h-7 w-[92px] rounded-md border-none bg-transparent text-xs text-neutral-700 hover:bg-neutral-100'
                                title='Font family'
                            >
                                {!currentFont && <option value=''>Font…</option>}
                                {FONTS.map((f) => (
                                    <option key={f.name} value={f.stack} style={{ fontFamily: f.stack }}>{f.name}</option>
                                ))}
                            </select>
                            <button className={iconBtn} title='Decrease size'
                                onClick={() => setStyle('font-size', `${Math.max(8, fontSize - 4)}px`)}>−</button>
                            <span className='w-8 text-center text-xs text-neutral-700'>{fontSize}</span>
                            <button className={iconBtn} title='Increase size'
                                onClick={() => setStyle('font-size', `${fontSize + 4}px`)}>+</button>
                            <label className='relative flex h-7 w-7 cursor-pointer items-center justify-center rounded-md hover:bg-neutral-100' title='Text color'>
                                <span className='h-4 w-4 rounded-full border border-neutral-300' style={{ background: styles.color || '#111111' }} />
                                <input type='color' value={/^#([0-9a-f]{6})$/i.test(styles.color) ? styles.color : '#111111'}
                                    onChange={(e) => setStyle('color', e.target.value)}
                                    className='absolute inset-0 cursor-pointer opacity-0' />
                            </label>
                            <button className={`${iconBtn} font-bold ${isBold ? 'bg-violet-100 text-violet-700' : ''}`} title='Bold'
                                onClick={() => setStyle('font-weight', isBold ? '400' : '700')}>B</button>
                            <button className={`${iconBtn} italic ${isItalic ? 'bg-violet-100 text-violet-700' : ''}`} title='Italic'
                                onClick={() => setStyle('font-style', isItalic ? 'normal' : 'italic')}>I</button>
                            <button className={`${iconBtn} underline ${isUnderline ? 'bg-violet-100 text-violet-700' : ''}`} title='Underline'
                                onClick={() => setStyle('text-decoration', isUnderline ? 'none' : 'underline')}>U</button>
                            {(['left', 'center', 'right'] as const).map((a) => (
                                <button key={a} className={`${iconBtn} ${align === a ? 'bg-violet-100 text-violet-700' : ''}`}
                                    title={`Align ${a}`} onClick={() => setStyle('text-align', a)}>
                                    {a === 'left' ? '⇤' : a === 'center' ? '≡' : '⇥'}
                                </button>
                            ))}
                            {divider}
                        </React.Fragment>
                    )}

                    <button className={iconBtn} title='Duplicate (Ctrl+D)' onClick={doDuplicate}>⧉</button>
                    <button className={iconBtn} title='Bring forward' onClick={() => doReorder(1)}>↑</button>
                    <button className={iconBtn} title='Send backward' onClick={() => doReorder(-1)}>↓</button>
                    {!isBodyChild && el?.parentId && (
                        <button className={iconBtn} title='Select parent' onClick={handleSelectParent}>↖</button>
                    )}
                    <button className={iconBtn} title='Insert inside' onClick={handleInsert}>＋</button>
                    <button className={`${iconBtn} hover:!bg-red-50 hover:!text-red-600`} title='Delete' onClick={doDelete}>✕</button>
                </div>
            </div>
        </React.Fragment>
    );
}

export default SelectedElementIndicator;
