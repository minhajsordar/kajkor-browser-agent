'use client'
import React from 'react'
import Dialog from '@/components/dialog/Dialog'
import { useDispatch, useSelector } from '@/store/builderHooks'
import { updatePageContentSetByKey } from '@/store/builderActions'
import { toast } from 'react-toastify'

const STORAGE_KEY = 'banner_brand';

const DEFAULT_BRAND = {
    colors: ['#111827', '#ffffff', '#6366f1', '#f59e0b', '#10b981', '#ef4444', '#0ea5e9', '#f472b6'],
    fonts: [
        { name: 'Arial', stack: 'Arial, sans-serif' },
        { name: 'Georgia', stack: 'Georgia, serif' },
        { name: 'Verdana', stack: 'Verdana, sans-serif' },
        { name: 'Trebuchet', stack: '"Trebuchet MS", sans-serif' },
        { name: 'Courier', stack: '"Courier New", monospace' },
        { name: 'Impact', stack: 'Impact, sans-serif' },
    ],
};

function loadBrand() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            return { colors: parsed.colors || DEFAULT_BRAND.colors, fonts: parsed.fonts || DEFAULT_BRAND.fonts };
        }
    } catch { /* fall through */ }
    return DEFAULT_BRAND;
}

/**
 * Brand kit — saved colors + fonts applied to the selected element.
 * Stored in localStorage (per-browser); a color applies to text `color`
 * when the element carries text, otherwise to `background-color`.
 */
const BrandButton = ({
    className,
    children
}: {
    className?: string,
    children: React.ReactNode
}) => {
    const [open, setOpen] = React.useState(false)
    const [brand, setBrand] = React.useState(DEFAULT_BRAND)
    const [newColor, setNewColor] = React.useState('#6366f1')
    const dispatch = useDispatch()
    const pageBuilder = useSelector((state: any) => state.pageBuilder);
    const { selectedUid } = pageBuilder;
    const pageContent = useSelector((state: any) => state.pageContent);

    React.useEffect(() => {
        if (open) setBrand(loadBrand());
    }, [open]);

    const saveColors = (colors: string[]) => {
        const next = { ...brand, colors };
        setBrand(next);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    };

    const applyStyle = (key: string, value: string) => {
        const element = pageContent?.draftPageContentSet?.[`${selectedUid}`];
        if (!element || selectedUid === 'body') {
            toast.warn('Select a canvas element first');
            return;
        }
        const next = JSON.parse(JSON.stringify(element));
        next.style.light.default.styles[key] = value;
        dispatch(updatePageContentSetByKey({ key: String(selectedUid), value: next }));
    };

    const applyColor = (color: string) => {
        const element = pageContent?.draftPageContentSet?.[`${selectedUid}`];
        if (!element || selectedUid === 'body') {
            toast.warn('Select a canvas element first');
            return;
        }
        const key = Object.hasOwn(element, 'text') ? 'color' : 'background-color';
        applyStyle(key, color);
    };

    const sectionTitle = 'text-[11px] uppercase tracking-wider text-neutral-500 mb-2';

    return (
        <React.Fragment>
            <button className={`${className} ${open ? '!bg-indigo-50 !text-indigo-600' : ''}`} onClick={() => setOpen(s => !s)} title="Brand">
                {children}
            </button>
            <Dialog open={open} setOpen={setOpen}
                position='left' dimmed={false}
                height='calc(100vh - 48px)'
                width='320px'
                left={{ left: "64px", top: "48px", transform: "none" }}
            >
                <div className='p-3 flex flex-col gap-5'>
                    <div>
                        <div className='text-sm font-semibold text-neutral-800 mb-1'>Brand kit</div>
                        <div className='text-[11px] text-neutral-400'>Saved to this browser. Select an element, then click a swatch or font.</div>
                    </div>

                    <div>
                        <div className={sectionTitle}>Colors</div>
                        <div className='grid grid-cols-5 gap-2'>
                            {brand.colors.map((c, i) => (
                                <button
                                    key={`${c}-${i}`}
                                    type='button'
                                    title={c}
                                    onClick={() => applyColor(c)}
                                    className='h-9 w-9 rounded-md border border-neutral-300 hover:scale-110 transition-transform'
                                    style={{ background: c }}
                                />
                            ))}
                        </div>
                        <div className='mt-2 flex items-center gap-2'>
                            <input
                                type='color'
                                value={newColor}
                                onChange={(e) => setNewColor(e.target.value)}
                                className='h-8 w-10 cursor-pointer rounded-sm border border-neutral-200 bg-white'
                            />
                            <button
                                type='button'
                                onClick={() => { saveColors([...brand.colors, newColor]); }}
                                className='rounded-sm border border-neutral-200 bg-neutral-100 px-2.5 py-1 text-xs text-neutral-800 hover:bg-neutral-200'
                            >
                                + Add color
                            </button>
                        </div>
                    </div>

                    <div>
                        <div className={sectionTitle}>Fonts</div>
                        <div className='flex flex-col gap-1.5'>
                            {brand.fonts.map((f) => (
                                <button
                                    key={f.name}
                                    type='button'
                                    onClick={() => applyStyle('font-family', f.stack)}
                                    className='rounded-md border border-neutral-200 bg-neutral-100 px-3 py-2.5 text-left hover:bg-neutral-200 hover:border-neutral-300'
                                >
                                    <div className='text-neutral-800' style={{ fontFamily: f.stack, fontSize: '17px' }}>Aa {f.name}</div>
                                    <div className='text-[10px] text-neutral-400'>{f.stack}</div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </Dialog>
        </React.Fragment>
    )
}

export default BrandButton
