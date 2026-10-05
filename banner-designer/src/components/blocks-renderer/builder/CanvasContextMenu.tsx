"use client"
import React from 'react'
import { useDispatch, useSelector } from '@/store/builderHooks';
import { setSelectedUid, updatePageContentState } from '@/store/builderActions';
import { collectSubtreeUids, duplicateElement, removeElement, reorderElement } from '@/utils/contentOps';
import { nanoid } from 'nanoid';
import { toPng } from 'html-to-image';
import { toast } from 'react-toastify';

interface MenuState {
    x: number;
    y: number;
    uid: string;
}

const px = (v: any): number => {
    const n = parseFloat(String(v));
    return Number.isNaN(n) ? 0 : n;
};

/**
 * Canva-style right-click menu for canvas elements. The renderer fires a
 * `banner-context-menu` CustomEvent with {x, y, uid}; this component owns
 * the menu and all its actions. Clipboard lives on window.__bannerClipboard.
 */
const CanvasContextMenu = () => {
    const dispatch = useDispatch();
    const pageContent = useSelector((state: any) => state.pageContent);
    const pageBuilder = useSelector((state: any) => state.pageBuilder);
    const contentRef = React.useRef(pageContent);
    contentRef.current = pageContent;
    const builderRef = React.useRef(pageBuilder);
    builderRef.current = pageBuilder;
    const [menu, setMenu] = React.useState<MenuState | null>(null);
    const [submenu, setSubmenu] = React.useState<'layer' | 'align' | null>(null);
    const menuRef = React.useRef<HTMLDivElement>(null);

    const sendMessageToParent = (message: any) => {
        if (window.parent && window.parent !== window) {
            window.parent.postMessage(message, window.location.origin);
        }
    };

    React.useEffect(() => {
        const onMenu = (e: Event) => {
            const detail = (e as CustomEvent).detail as MenuState;
            setMenu(detail);
            setSubmenu(null);
        };
        const onDismiss = () => { setMenu(null); setSubmenu(null); };
        window.addEventListener('banner-context-menu', onMenu);
        window.addEventListener('click', onDismiss);
        window.addEventListener('blur', onDismiss);
        return () => {
            window.removeEventListener('banner-context-menu', onMenu);
            window.removeEventListener('click', onDismiss);
            window.removeEventListener('blur', onDismiss);
        };
    }, []);

    // Clipboard shortcuts on the selection — the menu advertises them, so
    // they have to work: Ctrl+C copy, Ctrl+Alt+C copy style, Ctrl+V paste.
    React.useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const t = e.target as HTMLElement;
            if (!t || t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName)) return;
            const uid = builderRef.current.selectedUid;
            if (!uid || uid === 'body') return;
            const mod = e.ctrlKey || e.metaKey;
            if (!mod) return;
            const key = e.key.toLowerCase();
            if (key === 'c' && e.altKey) { e.preventDefault(); doCopy(uid, true); }
            else if (key === 'c') { e.preventDefault(); doCopy(uid, false); }
            else if (key === 'v') { e.preventDefault(); doPaste(uid); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Keep the menu on-screen.
    React.useEffect(() => {
        if (!menu || !menuRef.current) return;
        const rect = menuRef.current.getBoundingClientRect();
        const pad = 6;
        if (rect.right > window.innerWidth - pad) {
            menuRef.current.style.left = `${Math.max(pad, window.innerWidth - rect.width - pad)}px`;
        }
        if (rect.bottom > window.innerHeight - pad) {
            menuRef.current.style.top = `${Math.max(pad, window.innerHeight - rect.height - pad)}px`;
        }
    }, [menu]);

    const el = menu ? contentRef.current.draftPageContentSet?.[menu.uid] : undefined;
    const styles = el?.style?.light?.default?.styles || {};
    const isLocked = !!el?.locked;
    const isHidden = styles.display === 'none';
    const clipboard: any = typeof window !== 'undefined'
        ? (window as any).__bannerClipboard || null
        : null;

    const commit = (nextContentSet: Record<string, any>) => {
        dispatch(updatePageContentState({ ...contentRef.current, draftPageContentSet: nextContentSet }));
        sendMessageToParent({
            type: 'builder-content-from-iframe',
            value: { draftPageContentSet: nextContentSet },
        });
    };
    const contentSet = () => JSON.parse(JSON.stringify(contentRef.current.draftPageContentSet));

    const select = (uid: string | null) => {
        dispatch(setSelectedUid(uid));
        const st = JSON.parse(JSON.stringify(pageBuilder));
        st.selectedUid = uid;
        sendMessageToParent({ type: 'builder-state-from-iframe', value: st });
    };

    const setStyle = (key: string, value: string | null) => {
        const cs = contentSet();
        const s = cs[menu!.uid]?.style?.light?.default?.styles;
        if (!s) return;
        if (value === null) delete s[key]; else s[key] = value;
        commit(cs);
    };

    const doCopy = (uid: string, stylesOnly = false) => {
        const cs = contentRef.current.draftPageContentSet;
        const uids = collectSubtreeUids(cs, uid);
        const subtree: Record<string, any> = {};
        for (const u of uids) subtree[u] = cs[u];
        (window as any).__bannerClipboard = stylesOnly
            ? { kind: 'style', styles: JSON.parse(JSON.stringify(subtree[uid]?.style || {})) }
            : { kind: 'element', subtree: JSON.parse(JSON.stringify(subtree)), rootUid: uid };
        toast.success(stylesOnly ? 'Style copied' : 'Element copied');
    };

    const doPaste = (uid: string) => {
        const clip = (window as any).__bannerClipboard;
        const target = contentRef.current.draftPageContentSet?.[uid];
        if (!clip || !target) return;
        if (clip.kind === 'style') {
            const cs = contentSet();
            if (!cs[uid]) return;
            cs[uid].style = JSON.parse(JSON.stringify(clip.styles));
            commit(cs);
            return;
        }
        const cs = contentSet();
        const keyMap: Record<string, string> = {};
        for (const u of Object.keys(clip.subtree)) keyMap[u] = `uid-${nanoid(10)}`;
        for (const [oldUid, element] of Object.entries<any>(clip.subtree)) {
            const clone = JSON.parse(JSON.stringify(element));
            const newUid = keyMap[oldUid];
            clone.uid = newUid;
            clone.systemAddedClass = newUid;
            clone.child = (clone.child || []).map((c: string) => keyMap[c] || c);
            if (oldUid === clip.rootUid) {
                clone.parentId = target.parentId;
                const s = clone.style?.light?.default?.styles || {};
                s.left = `${(parseFloat(s.left) || 0) + 12}px`;
                s.top = `${(parseFloat(s.top) || 0) + 12}px`;
            }
            cs[newUid] = clone;
        }
        const parent = cs[target.parentId];
        if (parent?.child) parent.child.push(keyMap[clip.rootUid]);
        commit(cs);
        select(keyMap[clip.rootUid]);
    };

    const doReorder = (toIndex: number | 'front' | 'back') => {
        const parent = el.parentId ? contentRef.current.draftPageContentSet[el.parentId] : null;
        if (!parent?.child) return;
        const idx = toIndex === 'front' ? parent.child.length - 1
            : toIndex === 'back' ? 0
            : parent.child.indexOf(menu!.uid) + toIndex;
        commit(reorderElement(contentSet(), menu!.uid, idx));
    };

    const doAlign = (mode: 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom') => {
        const bodyStyles = contentRef.current.draftPageContentSet?.body?.style?.light?.default?.styles || {};
        const cw = px(bodyStyles.width);
        const ch = px(bodyStyles.height);
        const elW = px(styles.width) || 0;
        const elH = px(styles.height) || 0;
        const map = {
            left: ['left', '0px'], hcenter: ['left', `${Math.round((cw - elW) / 2)}px`], right: ['left', `${Math.round(cw - elW)}px`],
            top: ['top', '0px'], vcenter: ['top', `${Math.round((ch - elH) / 2)}px`], bottom: ['top', `${Math.round(ch - elH)}px`],
        } as const;
        const [key, value] = map[mode];
        setStyle(key, value);
    };

    const doLock = () => {
        const cs = contentSet();
        if (!cs[menu!.uid]) return;
        cs[menu!.uid].locked = !isLocked;
        commit(cs);
    };

    const doDownload = async () => {
        const node = document.querySelector(`.${menu!.uid}`) as HTMLElement | null;
        if (!node) return;
        try {
            const url = await toPng(node, { pixelRatio: 2 });
            const a = document.createElement('a');
            a.download = `element-${el.tag}.png`;
            a.href = url;
            a.click();
        } catch {
            toast.error('Export failed');
        }
    };

    const close = () => setMenu(null);

    if (!menu || !el) return null;

    const itemCls = 'flex w-full items-center gap-2.5 rounded-md px-2.5 py-[7px] text-left text-[13px] text-neutral-800 hover:bg-neutral-100';
    const shortcutCls = 'ml-auto rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-500';
    const divider = <div className='mx-2 my-1 border-t border-neutral-200' />;
    const chevron = <span className='ml-auto text-neutral-400'>›</span>;

    const item = (label: string, onClick: () => void, shortcut?: string, disabled = false) => (
        <button type='button' disabled={disabled} className={`${itemCls} ${disabled ? 'opacity-40 cursor-default' : ''}`}
            onClick={() => { if (!disabled) { onClick(); close(); } }}>
            {label}
            {shortcut ? <span className={shortcutCls}>{shortcut}</span> : null}
        </button>
    );

    const subItemCls = 'block w-full rounded-md px-3 py-[7px] text-left text-[13px] text-neutral-800 hover:bg-neutral-100 whitespace-nowrap';

    return (
        <div
            ref={menuRef}
            className='fixed z-[2147483646] w-56 rounded-xl border border-neutral-200 bg-white py-1.5 shadow-2xl'
            style={{ left: menu.x, top: menu.y }}
            onContextMenu={(e) => e.preventDefault()}
        >
            {item('Copy', () => doCopy(menu!.uid, false), 'Ctrl+C')}
            {item('Copy style', () => doCopy(menu!.uid, true), 'Ctrl+Alt+C')}
            {item(clipboard?.kind === 'style' ? 'Paste style' : 'Paste', () => doPaste(menu!.uid), 'Ctrl+V', !clipboard)}
            {item('Duplicate', () => {
                const { contentSet: next, newRootUid } = duplicateElement(contentSet(), menu!.uid, () => `uid-${nanoid(10)}`);
                if (newRootUid) { commit(next); select(newRootUid); }
            }, 'Ctrl+D')}
            {item('Delete', () => {
                commit(removeElement(contentSet(), menu!.uid));
                select(null);
            }, 'Del')}
            {divider}

            {/* Layer submenu */}
            <div className='relative' onMouseEnter={() => setSubmenu('layer')} onMouseLeave={() => setSubmenu(null)}>
                <button type='button' className={itemCls}>Layer {chevron}</button>
                {submenu === 'layer' && (
                    <div className='absolute left-full top-0 -ml-1 w-44 rounded-xl border border-neutral-200 bg-white py-1.5 shadow-2xl'>
                        <button className={subItemCls} onClick={() => { doReorder('front'); close(); }}>Bring to front</button>
                        <button className={subItemCls} onClick={() => { doReorder(1); close(); }}>Bring forward</button>
                        <button className={subItemCls} onClick={() => { doReorder(-1); close(); }}>Send backward</button>
                        <button className={subItemCls} onClick={() => { doReorder('back'); close(); }}>Send to back</button>
                    </div>
                )}
            </div>

            {/* Align to page submenu */}
            <div className='relative' onMouseEnter={() => setSubmenu('align')} onMouseLeave={() => setSubmenu(null)}>
                <button type='button' className={itemCls}>Align to page {chevron}</button>
                {submenu === 'align' && (
                    <div className='absolute left-full top-0 -ml-1 w-44 rounded-xl border border-neutral-200 bg-white py-1.5 shadow-2xl'>
                        <button className={subItemCls} onClick={() => { doAlign('left'); close(); }}>Left</button>
                        <button className={subItemCls} onClick={() => { doAlign('hcenter'); close(); }}>Center</button>
                        <button className={subItemCls} onClick={() => { doAlign('right'); close(); }}>Right</button>
                        <div className='mx-2 my-1 border-t border-neutral-200' />
                        <button className={subItemCls} onClick={() => { doAlign('top'); close(); }}>Top</button>
                        <button className={subItemCls} onClick={() => { doAlign('vcenter'); close(); }}>Middle</button>
                        <button className={subItemCls} onClick={() => { doAlign('bottom'); close(); }}>Bottom</button>
                    </div>
                )}
            </div>
            {divider}

            {item(isLocked ? 'Unlock' : 'Lock', doLock)}
            {item(isHidden ? 'Show' : 'Hide', () => setStyle('display', isHidden ? null : 'none'))}
            {el.parentId && el.parentId !== 'body' && item('Select parent', () => select(el.parentId))}
            {item('Download selection', doDownload)}
        </div>
    );
};

export default CanvasContextMenu;
