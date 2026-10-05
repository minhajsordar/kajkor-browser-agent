'use client'
import React from 'react'
import Dialog from '@/components/dialog/Dialog'
import { siteFetch } from '@/store/siteFetch'
import { useDispatch, useSelector } from '@/store/builderHooks'
import { setSelectedUid, updatePageContentState } from '@/store/builderActions'
import { toast } from 'react-toastify'
import { useRouter, useSearchParams } from 'next/navigation'

const MAX_REFERENCE_IMAGES = 4;

// Ollama's vision models decode raster images only (png/jpeg/gif/webp/bmp).
// SVG, HEIC, AVIF etc. pass an `image/*` picker but fail at the API with an
// opaque error — reject them here instead.
const DECODABLE_IMAGE_TYPES = new Set([
    'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/bmp',
]);
const IMAGE_ACCEPT = [...DECODABLE_IMAGE_TYPES].join(',');

const toPxNumber = (v: any): number => {
    const n = parseFloat(String(v));
    return Number.isNaN(n) ? 0 : Math.round(n);
};

const AiGenerateButton = ({
    className,
    children
}: {
    className?: string,
    children: React.ReactNode
}) => {
    const [open, setOpen] = React.useState(false)
    const [instruction, setInstruction] = React.useState('')
    const [generating, setGenerating] = React.useState(false)
    const [images, setImages] = React.useState<string[]>([])
    const fileRef = React.useRef<HTMLInputElement>(null)
    const dispatch = useDispatch()
    const router = useRouter()
    const searchParams = useSearchParams()
    const bannerId = searchParams?.get('bannerId')
    const pageContent = useSelector((state: any) => state.pageContent);

    const attachFiles = (files: FileList | null) => {
        if (!files) return;
        const remaining = Math.max(0, MAX_REFERENCE_IMAGES - images.length);
        Array.from(files).slice(0, remaining).forEach((file) => {
            if (!file.type.startsWith('image/')) return;
            if (!DECODABLE_IMAGE_TYPES.has(file.type)) {
                toast.warn(`${file.name}: ${file.type || 'unknown type'} can't be analyzed — use PNG/JPG`);
                return;
            }
            if (file.size > 8 * 1024 * 1024) {
                toast.warn(`${file.name} is over 8MB — skipped`);
                return;
            }
            const reader = new FileReader();
            // Cap inside the updater too — onload is async, so a second
            // attach before the first resolves could otherwise exceed 4.
            reader.onload = () => setImages((prev) => [...prev, String(reader.result)].slice(0, MAX_REFERENCE_IMAGES));
            reader.readAsDataURL(file);
        });
    };

    const generate = async () => {
        const text = instruction.trim();
        if (!text && images.length === 0) {
            toast.error('Describe the banner or attach a reference image');
            return;
        }
        setGenerating(true);
        try {
            // Send the current artboard size — otherwise a NEW banner always
            // comes back 1200×628 even when the user resized the canvas.
            const bodyStyles = pageContent?.draftPageContentSet?.body?.style?.light?.default?.styles || {};
            const response = await siteFetch('/api/agent/design', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    instruction: text,
                    bannerId: bannerId || undefined,
                    width: toPxNumber(bodyStyles.width) || undefined,
                    height: toPxNumber(bodyStyles.height) || undefined,
                    images: images.length ? images : undefined,
                }),
            });
            const payload = await response.json();
            if (!response.ok) {
                toast.error(payload?.msg || 'Generation failed');
                return;
            }
            dispatch(updatePageContentState({ ...pageContent, draftPageContentSet: payload.builderData }));
            // The replaced canvas has new uids — drop the stale selection.
            dispatch(setSelectedUid('body'));
            toast.success(`${bannerId ? 'Design revised' : 'Design generated'} (${payload.model || 'model'})`);
            if (Array.isArray(payload.warnings) && payload.warnings.length) {
                toast.warn(`Repaired: ${payload.warnings.slice(0, 3).join('; ')}`);
            }
            // Drop attachments after a success — otherwise reopening the
            // dialog silently re-runs the (slow) vision stage on stale refs.
            setImages([]);
            setOpen(false);
            // New banner: point the editor at it so saves/publishes attach.
            if (!bannerId && payload.bannerId) {
                router.push(`/?bannerId=${payload.bannerId}`);
            }
        } catch (error) {
            console.error('AI generate error', error);
            toast.error('Generation failed');
        } finally {
            setGenerating(false);
        }
    };

    return (
        <React.Fragment>
            <button className={`${className} ${open ? '!bg-indigo-50 !text-indigo-600' : ''}`} onClick={() => setOpen(s => !s)} title="AI generate">
                {children}
            </button>
            <Dialog open={open} setOpen={setOpen}
                position='left' dimmed={false}
                height='calc(100vh - 48px)'
                width='420px'
                left={{ left: "64px", top: "48px", transform: "none" }}
            >
                <div className='p-3 flex flex-col gap-2'>
                    <div className='text-sm font-semibold text-neutral-800'>
                        {bannerId ? 'Revise with AI' : 'Generate banner with AI'}
                    </div>
                    <textarea
                        value={instruction}
                        onChange={(e) => setInstruction(e.target.value)}
                        rows={6}
                        placeholder={bannerId
                            ? 'e.g. make the headline shorter and move the button to the right'
                            : 'e.g. a summer sale banner, dark gradient, bold headline, orange CTA button'}
                        className='w-full rounded-sm border border-neutral-300 bg-white p-2 text-sm text-neutral-800 placeholder:text-neutral-400'
                    />
                    {/* Reference image attachments — analyzed by the vision model */}
                    <input
                        ref={fileRef}
                        type='file'
                        accept={IMAGE_ACCEPT}
                        multiple
                        className='hidden'
                        onChange={(e) => { attachFiles(e.target.files); e.target.value = ''; }}
                    />
                    <div className='flex flex-wrap items-center gap-1.5'>
                        {images.map((src, i) => (
                            <span key={i} className='relative h-12 w-16 overflow-hidden rounded border border-neutral-200'>
                                <img src={src} alt='' className='h-full w-full object-cover' />
                                <button
                                    type='button'
                                    onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                                    className='absolute right-0 top-0 flex h-4 w-4 items-center justify-center rounded-bl bg-black/60 text-[10px] text-white'
                                    title='Remove'
                                >×</button>
                            </span>
                        ))}
                        {images.length < MAX_REFERENCE_IMAGES && (
                            <button
                                type='button'
                                onClick={() => fileRef.current?.click()}
                                className='flex h-12 w-16 items-center justify-center rounded border border-dashed border-neutral-300 text-lg text-neutral-400 hover:border-indigo-400 hover:text-indigo-500'
                                title='Attach a reference banner image (vision model analyzes it)'
                            >＋</button>
                        )}
                    </div>
                    {images.length > 0 && (
                        <div className='text-[10px] text-neutral-400'>
                            Reference attached — the vision model will analyze and recreate it (slower).
                        </div>
                    )}
                    <button
                        type='button'
                        onClick={generate}
                        disabled={generating}
                        className='rounded-sm bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50'
                    >
                        {generating ? 'Generating…' : 'Generate'}
                    </button>
                </div>
            </Dialog>
        </React.Fragment>
    )
}

export default AiGenerateButton
