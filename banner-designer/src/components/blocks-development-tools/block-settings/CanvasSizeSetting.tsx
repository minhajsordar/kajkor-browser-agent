'use client'
import React from 'react'
import { useDispatch, useSelector } from '@/store/builderHooks';
import { updateBuilderState, updatePageContentState } from '@/store/builderActions';
import { siteFetch } from '@/store/siteFetch';
import { useSearchParams } from 'next/navigation';
import { toast } from 'react-toastify';
import { BANNER_PRESETS } from '@/utils/bannerContent';

const px = (v: any): number => {
    const n = parseFloat(String(v));
    return Number.isNaN(n) ? 0 : Math.round(n);
};

const MIN = 50;
const MAX = 8000;

/**
 * Canvas size — editable W/H for the artboard (Canva's "Resize").
 * Updates body styles (the artboard box), pageBuilder width/height
 * (iframe intrinsic size), and persists to the banner record.
 */
const CanvasSizeSetting = () => {
    const dispatch = useDispatch();
    const pageBuilder = useSelector((state: any) => state.pageBuilder);
    const pageContent = useSelector((state: any) => state.pageContent);
    const { draftPageContentSet } = pageContent;
    const searchParams = useSearchParams();
    const bannerId = searchParams?.get('bannerId');

    const w = px(pageBuilder.width) || 1200;
    const h = px(pageBuilder.height) || 628;
    const [wInput, setWInput] = React.useState(String(w));
    const [hInput, setHInput] = React.useState(String(h));

    React.useEffect(() => { setWInput(String(w)); }, [w]);
    React.useEffect(() => { setHInput(String(h)); }, [h]);

    const apply = (nextW: number, nextH: number) => {
        nextW = Math.max(MIN, Math.min(MAX, Math.round(nextW)));
        nextH = Math.max(MIN, Math.min(MAX, Math.round(nextH)));
        if (!draftPageContentSet?.body || (nextW === w && nextH === h)) {
            setWInput(String(w));
            setHInput(String(h));
            return;
        }
        const next = JSON.parse(JSON.stringify(pageContent));
        const styles = next.draftPageContentSet.body.style.light.default.styles;
        styles.width = `${nextW}px`;
        styles.height = `${nextH}px`;
        dispatch(updatePageContentState(next));
        dispatch(updateBuilderState({
            ...pageBuilder,
            width: `${nextW}px`,
            height: `${nextH}px`,
        }));
        if (bannerId) {
            siteFetch(`/api/banners/${bannerId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ width: nextW, height: nextH }),
            }).catch(() => toast.warn('Size changed locally; could not persist to banner'));
        }
    };

    const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
    };

    const inputCls = 'w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-xs text-neutral-800 focus:border-indigo-400 focus:outline-none';
    const labelCls = 'text-[10px] font-medium text-neutral-400';

    return (
        <div className='border-b border-neutral-200 px-3 py-3'>
            <div className='mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500'>Canvas size</div>
            <div className='flex items-end gap-2'>
                <label className='flex-1'>
                    <span className={labelCls}>W</span>
                    <input
                        type='number'
                        min={MIN}
                        max={MAX}
                        value={wInput}
                        onChange={(e) => setWInput(e.target.value)}
                        onBlur={() => apply(px(wInput) || w, h)}
                        onKeyDown={onKey}
                        className={inputCls}
                    />
                </label>
                <span className='pb-2 text-neutral-400'>×</span>
                <label className='flex-1'>
                    <span className={labelCls}>H</span>
                    <input
                        type='number'
                        min={MIN}
                        max={MAX}
                        value={hInput}
                        onChange={(e) => setHInput(e.target.value)}
                        onBlur={() => apply(w, px(hInput) || h)}
                        onKeyDown={onKey}
                        className={inputCls}
                    />
                </label>
                <span className='pb-2 text-[10px] text-neutral-400'>px</span>
            </div>
            <select
                defaultValue=''
                onChange={(e) => {
                    const preset = BANNER_PRESETS[e.target.value];
                    if (preset) apply(preset.width, preset.height);
                    e.target.value = '';
                }}
                className='mt-2 w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-xs text-neutral-500'
                title='Apply a preset size'
            >
                <option value='' disabled>Presets…</option>
                {Object.entries(BANNER_PRESETS).map(([key, preset]) => (
                    <option key={key} value={key}>{preset.label}</option>
                ))}
            </select>
        </div>
    );
};

export default CanvasSizeSetting;
