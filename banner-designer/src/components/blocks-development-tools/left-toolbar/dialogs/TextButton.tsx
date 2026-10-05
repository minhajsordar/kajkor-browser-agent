'use client'
import React from 'react'
import Dialog from '@/components/dialog/Dialog'
import { useDispatch, useSelector } from '@/store/builderHooks'
import { setSelectedUid, updatePageContentState } from '@/store/builderActions'
import { treeToElements } from '@/utils/normalizeBanner'

const px = (v: any): number | null => {
    const n = parseFloat(String(v));
    return Number.isNaN(n) ? null : n;
};

const TEXT_PRESETS = [
    {
        label: 'Add a heading',
        preview: { fontSize: '22px', fontWeight: 800 },
        node: { tag: 'h1', text: 'Add a heading', styles: { 'font-size': '64px', 'font-weight': '800', color: '#111111', 'font-family': 'Arial, sans-serif', width: '520px' } },
    },
    {
        label: 'Add a subheading',
        preview: { fontSize: '16px', fontWeight: 600 },
        node: { tag: 'h3', text: 'Add a subheading', styles: { 'font-size': '30px', 'font-weight': '600', color: '#333333', 'font-family': 'Arial, sans-serif', width: '440px' } },
    },
    {
        label: 'Add body text',
        preview: { fontSize: '12px', fontWeight: 400 },
        node: { tag: 'p', text: 'Add a little bit of body text', styles: { 'font-size': '16px', color: '#444444', 'font-family': 'Arial, sans-serif', width: '420px', 'line-height': '1.5' } },
    },
];

const FONT_COMBOS = [
    {
        name: 'Elegant',
        head: 'Georgia, serif',
        body: 'Arial, sans-serif',
    },
    {
        name: 'Bold',
        head: 'Impact, sans-serif',
        body: 'Verdana, sans-serif',
    },
    {
        name: 'Friendly',
        head: '"Trebuchet MS", sans-serif',
        body: 'Tahoma, sans-serif',
    },
    {
        name: 'Classic',
        head: '"Times New Roman", serif',
        body: 'Georgia, serif',
    },
];

const TextButton = ({
    className,
    children
}: {
    className?: string,
    children: React.ReactNode
}) => {
    const [open, setOpen] = React.useState(false)
    const dispatch = useDispatch()
    const pageContent = useSelector((state: any) => state.pageContent);
    const { draftPageContentSet } = pageContent;

    const center = (w: number, h: number) => {
        const bs = draftPageContentSet?.body?.style?.light?.default?.styles || {};
        const cw = px(bs.width) ?? 1200;
        const ch = px(bs.height) ?? 628;
        return { left: `${Math.max(0, Math.round((cw - w) / 2))}px`, top: `${Math.max(0, Math.round((ch - h) / 2))}px` };
    };

    const insertTree = (node: any, w: number, h: number) => {
        if (!draftPageContentSet?.body?.child) return;
        const pos = center(w, h);
        const tree = { ...node, styles: { position: 'absolute', ...pos, ...(node.styles || {}) } };
        const { entries, uid } = treeToElements(tree, 'body');
        if (!uid) return;
        const next = JSON.parse(JSON.stringify(pageContent));
        Object.assign(next.draftPageContentSet, entries);
        next.draftPageContentSet.body.child.push(uid);
        dispatch(updatePageContentState(next));
        dispatch(setSelectedUid(uid));
    };

    const itemCls = 'w-full rounded-md border border-neutral-200 bg-neutral-100 px-3 py-3 text-left text-neutral-800 hover:bg-neutral-200 hover:border-neutral-300';

    return (
        <React.Fragment>
            <button className={`${className} ${open ? '!bg-indigo-50 !text-indigo-600' : ''}`} onClick={() => setOpen(s => !s)} title="Text">
                {children}
            </button>
            <Dialog open={open} setOpen={setOpen}
                position='left' dimmed={false}
                height='calc(100vh - 48px)'
                width='320px'
                left={{ left: "64px", top: "48px", transform: "none" }}
            >
                <div className='p-3 flex flex-col gap-4'>
                    <div className='text-sm font-semibold text-neutral-800'>Text</div>

                    <div className='flex flex-col gap-1.5'>
                        {TEXT_PRESETS.map((p) => (
                            <button key={p.label} type='button' className={itemCls}
                                onClick={() => insertTree(p.node, 480, 90)}>
                                <span style={{ fontSize: p.preview.fontSize, fontWeight: p.preview.fontWeight, fontFamily: 'Arial, sans-serif' }}>
                                    {p.label}
                                </span>
                            </button>
                        ))}
                    </div>

                    <div>
                        <div className='text-[11px] uppercase tracking-wider text-neutral-500 mb-2'>Font combinations</div>
                        <div className='flex flex-col gap-1.5'>
                            {FONT_COMBOS.map((c) => (
                                <button key={c.name} type='button' className={itemCls}
                                    onClick={() => insertTree({
                                        tag: 'div',
                                        styles: { width: '520px' },
                                        children: [
                                            { tag: 'h1', text: c.name, styles: { 'font-size': '52px', 'font-weight': '700', color: '#111111', 'font-family': c.head, 'line-height': '1.1' } },
                                            { tag: 'p', text: 'Supporting text in a matching body font.', styles: { 'font-size': '18px', color: '#555555', 'font-family': c.body, 'margin-top': '10px' } },
                                        ],
                                    }, 520, 140)}>
                                    <div style={{ fontFamily: c.head, fontSize: '20px', fontWeight: 700, color: '#111111' }}>{c.name}</div>
                                    <div style={{ fontFamily: c.body, fontSize: '11px', color: '#777777' }}>Heading + body pair</div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </Dialog>
        </React.Fragment>
    )
}

export default TextButton
