'use client'
import React from 'react'
import Dialog from '@/components/dialog/Dialog'
import { useDispatch, useSelector } from '@/store/builderHooks'
import { addPageBlock, setSelectedUid } from '@/store/builderActions'
import registeredBlocks, { BlockElementIdentifier, BlockElementIdentifierWithCategory } from '@/components/blocks-development-tools/blocks-list/registeredBlocks'
import { nanoid } from 'nanoid'
import { toast } from 'react-toastify'

const px = (v: any): number | null => {
    const n = parseFloat(String(v));
    return Number.isNaN(n) ? null : n;
};

/** Mini visual preview for a palette block (Canva-style thumbnails). */
const BlockPreview = ({ block }: { block: BlockElementIdentifier }) => {
    const styles: Record<string, string> = block.style?.light?.default?.styles || {};
    const tag = block.tag;
    if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span'].includes(tag)) {
        return (
            <span className='text-neutral-700' style={{
                fontFamily: styles['font-family'] || 'Arial, sans-serif',
                fontWeight: styles['font-weight'] || '400',
                fontSize: tag === 'span' || tag === 'p' ? '16px' : '24px',
                letterSpacing: styles['letter-spacing'] || 'normal',
                textTransform: (styles['text-transform'] as any) || 'none',
            }}>Aa</span>
        );
    }
    if (tag === 'button') {
        return (
            <span className='rounded-md px-3 py-1 text-[11px] font-semibold' style={{
                background: styles['background-color'] || '#111111',
                color: styles.color || '#ffffff',
            }}>Button</span>
        );
    }
    if (tag === 'img') {
        return (
            <span className='flex h-9 w-12 items-center justify-center rounded-sm bg-neutral-300 text-neutral-500'>
                <svg width='18' height='18' viewBox='0 0 24 24' fill='none'><rect x='3' y='5' width='18' height='14' rx='2' stroke='currentColor' strokeWidth='1.5' /><circle cx='9' cy='10' r='2' fill='currentColor' /><path d='M4 18L10 12L14 16L17 13L20 16' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round' /></svg>
            </span>
        );
    }
    // div shapes — render the actual silhouette.
    return (
        <span style={{
            display: 'block',
            width: '36px',
            height: '28px',
            background: styles['background-color'] === 'transparent' || !styles['background-color'] ? '#d4d4d8' : styles['background-color'],
            borderRadius: styles['border-radius'] === '9999px' ? '999px' : (parseFloat(styles['border-radius']) > 20 ? '50%' : '4px'),
            border: styles['background-color'] === 'transparent' ? '1.5px dashed #a1a1aa' : 'none',
        }} />
    );
};

const ElementsButton = ({
    className,
    children
}: {
    className?: string,
    children: React.ReactNode
}) => {
    const [open, setOpen] = React.useState(false)
    const [query, setQuery] = React.useState('')
    const dispatch = useDispatch()
    const pageContent = useSelector((state: any) => state.pageContent);
    const pageBuilder = useSelector((state: any) => state.pageBuilder);
    const { draftPageContentSet } = pageContent;

    const addElement = (block: BlockElementIdentifier) => {
        const body = draftPageContentSet?.body;
        if (!body?.child) {
            toast.error('Canvas not ready');
            return;
        }
        const uid = `uid-${nanoid(10)}`;
        const element = JSON.parse(JSON.stringify(block));
        element.systemAddedClass = uid;
        element.parentId = 'body';

        // Centre on the artboard when both sizes are known.
        const styles = element.style?.light?.default?.styles || {};
        const canvasW = px(body.style?.light?.default?.styles?.width);
        const canvasH = px(body.style?.light?.default?.styles?.height);
        const elW = px(styles.width);
        const elH = px(styles.height);
        if (canvasW !== null) styles.left = `${Math.max(0, Math.round((canvasW - (elW ?? 120)) / 2))}px`;
        if (canvasH !== null) styles.top = `${Math.max(0, Math.round((canvasH - (elH ?? 40)) / 2))}px`;

        dispatch(addPageBlock({
            uid: 'body',
            index: body.child.length,
            newElement: element,
        }));
        dispatch(setSelectedUid(uid));
    };

    return (
        <React.Fragment>
            <button className={`${className} ${open ? '!bg-indigo-50 !text-indigo-600' : ''}`} onClick={() => setOpen(s => !s)} title="Elements">
                {children}
            </button>
            <Dialog open={open} setOpen={setOpen}
                position='left' dimmed={false}
                height='calc(100vh - 48px)'
                width='320px'
                left={{ left: "64px", top: "48px", transform: "none" }}
            >
                <div className='p-3'>
                    <div className='text-sm font-semibold text-neutral-800 mb-3'>Elements</div>
                    <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder='Search elements'
                        className='mb-3 w-full rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 text-xs text-neutral-800 placeholder:text-neutral-400'
                    />
                    {registeredBlocks.map((group: BlockElementIdentifierWithCategory, gi: number) => {
                        const blocks = (group.blocks as BlockElementIdentifier[]).filter((b) =>
                            !query.trim() || b.name.toLowerCase().includes(query.trim().toLowerCase()));
                        if (!blocks.length) return null;
                        return (
                        <div key={gi} className='mb-4'>
                            <div className='text-[11px] uppercase tracking-wider text-neutral-500 mb-2'>{group.category}</div>
                            <div className='grid grid-cols-2 gap-1.5'>
                                {blocks.map((block: BlockElementIdentifier, bi: number) => (
                                    <button
                                        key={bi}
                                        type='button'
                                        draggable
                                        onClick={() => addElement(block)}
                                        onDragStart={(e) => {
                                            const payload = JSON.stringify(block);
                                            e.dataTransfer.setData('application/x-banner-element', payload);
                                            e.dataTransfer.effectAllowed = 'copy';
                                            // Fallback for cross-document drops: the iframe
                                            // reads this directly off the parent window.
                                            (window as any).__bannerDrag = payload;
                                        }}
                                        onDragEnd={() => { (window as any).__bannerDrag = null; }}
                                        className='flex flex-col items-center gap-1 rounded-md border border-neutral-200 bg-white px-2 py-2.5 hover:border-indigo-400 hover:bg-indigo-50/40 cursor-grab active:cursor-grabbing'
                                    >
                                        <BlockPreview block={block} />
                                        <span className='text-[10px] font-medium text-neutral-600'>{block.name}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                        );
                    })}
                    <div className='text-[11px] text-neutral-400'>Click to add centred — or drag a block onto the canvas to drop it in place.</div>
                </div>
            </Dialog>
        </React.Fragment>
    )
}

export default ElementsButton
