'use client'
import React from 'react'
import { useDispatch, useSelector } from '@/store/builderHooks';
import { updatePageContentSetByKey } from '@/store/builderActions';
import useUpdateStyle from './hooks/update-hooks/useUpdateStyle';

const num = (v: any): string => {
    const n = parseFloat(String(v));
    return Number.isNaN(n) ? '' : String(Math.round(n));
};

/**
 * Quick props — the friendly inspector shown above the raw CSS panels:
 * content, position/size, opacity, fill, and image source for the
 * currently selected element.
 */
const QuickProps = () => {
    const dispatch = useDispatch();
    const updateStyleHook = useUpdateStyle();
    const pageBuilder = useSelector((state: any) => state.pageBuilder);
    const { selectedUid } = pageBuilder;
    const pageContent = useSelector((state: any) => state.pageContent);
    const element = pageContent?.draftPageContentSet?.[`${selectedUid}`];

    if (!element || selectedUid === 'body') {
        return null;
    }

    const styles = element.style?.light?.default?.styles || {};
    const isImage = element.tag === 'img';
    const hasText = Object.hasOwn(element, 'text');

    const setStyle = (key: string, value: string) => {
        updateStyleHook.update([{ key, value }]);
    };

    const patchElement = (patch: Record<string, any>) => {
        const next = JSON.parse(JSON.stringify(element));
        Object.assign(next, patch);
        dispatch(updatePageContentSetByKey({ key: String(selectedUid), value: next }));
    };

    const patchAttributes = (patch: Record<string, string>) => {
        const next = JSON.parse(JSON.stringify(element));
        next.attributes = { ...(next.attributes || {}), ...patch };
        dispatch(updatePageContentSetByKey({ key: String(selectedUid), value: next }));
    };

    const rotation = (() => {
        const m = String(styles.transform || '').match(/rotate\(\s*(-?[\d.]+)deg\s*\)/);
        return m ? Math.round(parseFloat(m[1])) : 0;
    })();

    const setRotation = (deg: number) => {
        deg = Math.round(((deg % 360) + 360) % 360);
        const rest = String(styles.transform || '').replace(/rotate\(\s*-?[\d.]+deg\s*\)/g, '').trim();
        setStyle('transform', deg === 0 ? rest : `rotate(${deg}deg)${rest ? ` ${rest}` : ''}`);
    };

    const label = `${element.tag} · ${String(selectedUid).slice(0, 12)}`;
    const inputCls = 'w-full rounded-sm border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-800';
    const labelCls = 'text-[10px] uppercase tracking-wider text-neutral-500';

    return (
        <div className='border-b border-neutral-200 p-3 flex flex-col gap-3'>
            <div className={labelCls}>{label}</div>

            {hasText && (
                <div>
                    <div className={labelCls}>Text</div>
                    <textarea
                        rows={2}
                        className={inputCls}
                        value={element.text || ''}
                        onChange={(e) => patchElement({ text: e.target.value })}
                    />
                </div>
            )}

            {isImage && (
                <>
                    <div>
                        <div className={labelCls}>Image URL</div>
                        <input
                            className={inputCls}
                            value={element.attributes?.src || ''}
                            onChange={(e) => patchAttributes({ src: e.target.value })}
                        />
                    </div>
                    <div>
                        <div className={labelCls}>Alt text</div>
                        <input
                            className={inputCls}
                            value={element.attributes?.alt || ''}
                            onChange={(e) => patchAttributes({ alt: e.target.value })}
                        />
                    </div>
                </>
            )}

            <div className='grid grid-cols-4 gap-1.5'>
                {(['left', 'top', 'width', 'height'] as const).map((key) => (
                    <div key={key}>
                        <div className={labelCls}>{key === 'left' ? 'X' : key === 'top' ? 'Y' : key === 'width' ? 'W' : 'H'}</div>
                        <input
                            type='number'
                            className={inputCls}
                            value={num(styles[key])}
                            onChange={(e) => setStyle(key, e.target.value ? `${e.target.value}px` : '')}
                        />
                    </div>
                ))}
            </div>

            <div className='grid grid-cols-2 gap-1.5 items-end'>
                <div>
                    <div className={labelCls}>Opacity</div>
                    <input
                        type='range'
                        min={0}
                        max={100}
                        className='w-full'
                        value={Math.round((parseFloat(styles.opacity ?? '1') || 0) * 100)}
                        onChange={(e) => setStyle('opacity', String(Number(e.target.value) / 100))}
                    />
                </div>
                <div>
                    <div className={labelCls}>Fill</div>
                    <input
                        type='color'
                        className='h-7 w-full cursor-pointer rounded-sm border border-neutral-200 bg-white'
                        value={toHex(styles['background-color']) || '#ffffff'}
                        onChange={(e) => setStyle('background-color', e.target.value)}
                    />
                </div>
            </div>

            <div className='grid grid-cols-2 gap-1.5 items-end'>
                <div>
                    <div className={labelCls}>Rotation °</div>
                    <input
                        type='number'
                        step={15}
                        className={inputCls}
                        value={rotation}
                        onChange={(e) => setRotation(Number(e.target.value) || 0)}
                    />
                </div>
                <button
                    type='button'
                    disabled={rotation === 0}
                    onClick={() => setRotation(0)}
                    className='h-7 rounded-sm border border-neutral-200 bg-white text-xs text-neutral-600 hover:bg-neutral-100 disabled:opacity-40'
                    title='Reset rotation to 0°'
                >
                    ↺ Reset
                </button>
            </div>
        </div>
    );
};

/** Best-effort css color -> #rrggbb for <input type=color>. */
function toHex(color: any): string | null {
    if (typeof color !== 'string') return null;
    if (/^#[0-9a-f]{6}$/i.test(color)) return color;
    if (/^#[0-9a-f]{3}$/i.test(color)) {
        return '#' + color.slice(1).split('').map((c) => c + c).join('');
    }
    return null;
}

export default QuickProps;
