'use client'
import { updatePageContentState, undo, redo } from '@/store/builderActions';
import { siteFetch } from '@/store/siteFetch';
import React from 'react'
import { useDispatch, useSelector } from '@/store/builderHooks';
import { useSearchParams } from 'next/navigation';
import { toast } from 'react-toastify';
import { toPng, toJpeg } from 'html-to-image';
import VersionHistory from '../VersionHistory';

const DevActionHeader = () => {
    const dispatch = useDispatch()
    const pageBuilder = useSelector((state: any) => state.pageBuilder);
    const { selectedUid, width, height } = pageBuilder;

    const pageContent = useSelector((state: any) => state.pageContent);
    const { draftPageContentSet } = pageContent;
    const history = useSelector((state: any) => state.history) || { past: [], future: [] };

    const searchParams = useSearchParams();
    const bannerId = searchParams?.get('bannerId');
    const [exportOpen, setExportOpen] = React.useState(false);

    const requireBanner = () => {
        if (!bannerId) {
            toast.error('Pick or create a banner first (New banner).');
            return false;
        }
        return true;
    };

    const contentRef = React.useRef(draftPageContentSet);
    contentRef.current = draftPageContentSet;
    const savingRef = React.useRef(false);

    const createDraft = async () => {
        if (!requireBanner()) return;
        if (savingRef.current) return; // ignore rapid double Ctrl+S
        savingRef.current = true;
        try {
            const response = await siteFetch('/api/banner-drafts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bannerId, builderData: contentRef.current }),
            });
            const data = await response.json();
            if (!response.ok) {
                toast.error(data?.msg || 'Unable to save draft');
                return;
            }
            toast.success('Draft saved');
        } catch (error) {
            console.error('Draft save error', error);
            toast.error('Failed to save draft');
        } finally {
            savingRef.current = false;
        }
    };

    // Ctrl+S / Cmd+S saves a draft — works with focus in the chrome or in
    // the canvas iframe (the iframe forwards 'builder-save-request').
    React.useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                e.preventDefault();
                void createDraft();
            }
        };
        const onMessage = (e: MessageEvent) => {
            if (e.origin === window.location.origin && e.data?.type === 'builder-save-request') {
                void createDraft();
            }
        };
        window.addEventListener('keydown', onKey);
        window.addEventListener('message', onMessage);
        return () => {
            window.removeEventListener('keydown', onKey);
            window.removeEventListener('message', onMessage);
        };
        // createDraft reads refs, so the listener never goes stale.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bannerId]);

    const publishBanner = async () => {
        if (!requireBanner()) return;
        try {
            const response = await siteFetch(`/api/banners/${bannerId}/publish`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ builderData: draftPageContentSet }),
            });
            const data = await response.json();
            if (!response.ok) {
                toast.error(data?.msg || 'Unable to publish banner');
                return;
            }
            toast.success('Banner published');
        } catch (error) {
            console.error('Publish error', error);
            toast.error('Failed to publish banner');
        }
    };

    const exportImage = async (format: 'png' | 'jpeg') => {
        setExportOpen(false);
        const iframe = document.querySelector('.ui-builder-preview') as HTMLIFrameElement | null;
        const node = iframe?.contentDocument?.querySelector('.banner-canvas') as HTMLElement | null;
        if (!node) {
            toast.error('Canvas not found — is a banner loaded?');
            return;
        }
        try {
            const fn = format === 'png' ? toPng : toJpeg;
            const dataUrl = await fn(node, {
                pixelRatio: 1,
                backgroundColor: format === 'jpeg' ? '#ffffff' : undefined,
            });
            const link = document.createElement('a');
            link.download = `banner-${bannerId || 'untitled'}.${format === 'png' ? 'png' : 'jpg'}`;
            link.href = dataUrl;
            link.click();
        } catch (error) {
            console.error('Export error', error);
            toast.error('Export failed (external images may block it)');
        }
    };

    const btn = 'rounded-md px-2.5 py-1.5 text-xs font-medium text-white hover:bg-white/20 whitespace-nowrap';
    const btnAccent = 'rounded-md px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-white hover:bg-indigo-50 whitespace-nowrap';

    return (
        <div className='h-12 overflow-visible shrink-0 z-[9999] flex items-center justify-between px-3 gap-3 text-white'
            style={{
                background: "linear-gradient(90deg, #8b3dff 0%, #6420ff 45%, #00a9c0 100%)",
            }}
        >
            <div className='flex items-center gap-2 min-w-0'>
                <span className='text-sm font-bold whitespace-nowrap mr-1'>◨ Banner</span>
            </div>

            <div className='flex items-center gap-1'>
                <button
                    className={`${btn} ${history.past.length ? '' : 'opacity-40 cursor-default'}`}
                    onClick={() => history.past.length && dispatch(undo())}
                    title="Undo (Ctrl+Z)"
                >↶</button>
                <button
                    className={`${btn} ${history.future.length ? '' : 'opacity-40 cursor-default'}`}
                    onClick={() => history.future.length && dispatch(redo())}
                    title="Redo (Ctrl+Shift+Z)"
                >↷</button>
            </div>

            <div className='flex items-center gap-2'>
                <VersionHistory />
                <button className={btn} onClick={createDraft}>Save Draft</button>
                <button className={btnAccent} onClick={publishBanner}>Publish</button>
                <div className='relative'>
                    <button className={btn} onClick={() => setExportOpen((s) => !s)}>Export ▾</button>
                    {exportOpen && (
                        <div className='absolute right-0 top-full z-50 mt-1 w-36 rounded-md border border-neutral-200 bg-white py-1 shadow-lg'>
                            <button className='block w-full px-3 py-1.5 text-left text-xs text-neutral-800 hover:bg-neutral-100' onClick={() => exportImage('png')}>PNG image</button>
                            <button className='block w-full px-3 py-1.5 text-left text-xs text-neutral-800 hover:bg-neutral-100' onClick={() => exportImage('jpeg')}>JPG image</button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

export default DevActionHeader
