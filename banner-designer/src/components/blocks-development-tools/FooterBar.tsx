'use client'
import React from 'react'
import { useDispatch, useSelector } from '@/store/builderHooks';
import { updateBuilderState } from '@/store/builderActions';
import ParentElementFlow from './parent-navigator/ParentElementFlow';

/**
 * Canva-style footer bar: element breadcrumb on the left, zoom slider +
 * percentage + fullscreen toggle on the right.
 */
const FooterBar = () => {
    const dispatch = useDispatch();
    const pageBuilder = useSelector((state: any) => state.pageBuilder);
    const { zoom } = pageBuilder;
    const zoomPct = zoom === 'fit' || !zoom ? 100 : Number(zoom);
    const [isFullscreen, setIsFullscreen] = React.useState(false);

    React.useEffect(() => {
        const onChange = () => setIsFullscreen(!!document.fullscreenElement);
        document.addEventListener('fullscreenchange', onChange);
        return () => document.removeEventListener('fullscreenchange', onChange);
    }, []);

    const toggleFullscreen = () => {
        if (document.fullscreenElement) {
            document.exitFullscreen();
        } else {
            document.getElementById('banner-workspace')?.requestFullscreen?.();
        }
    };

    return (
        <div className='flex h-9 shrink-0 items-center justify-between gap-3 border-t border-neutral-200 bg-white px-2'>
            <div className='scrollbar-none min-w-0 flex-1 overflow-x-auto'>
                <ParentElementFlow />
            </div>

            <div className='flex shrink-0 items-center gap-2'>
                <span
                    className='hidden select-none text-[10px] leading-tight text-neutral-400 lg:block'
                    title='Scroll to pan · Shift+scroll for horizontal · Ctrl+scroll to zoom · Space+drag or middle-drag to pan'
                >
                    Scroll&nbsp;to&nbsp;pan · Ctrl+scroll&nbsp;to&nbsp;zoom · Space+drag
                </span>
                <span className='hidden h-4 w-px bg-neutral-200 lg:block' />
                <input
                    type='range'
                    min={10}
                    max={400}
                    step={5}
                    value={Math.min(400, Math.max(10, zoomPct))}
                    onChange={(e) => dispatch(updateBuilderState({ ...pageBuilder, zoom: Number(e.target.value) }))}
                    className='h-1 w-28 cursor-pointer accent-indigo-600'
                    title='Zoom'
                />
                <button
                    type='button'
                    onClick={() => dispatch(updateBuilderState({ ...pageBuilder, zoom: 'fit' }))}
                    className='min-w-[44px] rounded-md px-1 py-0.5 text-xs font-medium text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
                    title='Fit canvas to window'
                >
                    {zoom === 'fit' || !zoom ? 'Fit' : `${zoom}%`}
                </button>
                <button
                    type='button'
                    onClick={toggleFullscreen}
                    className='flex h-7 w-7 items-center justify-center rounded-md text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
                    title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen canvas'}
                >
                    {isFullscreen ? (
                        <svg width='15' height='15' viewBox='0 0 24 24' fill='none'><path d='M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round' /></svg>
                    ) : (
                        <svg width='15' height='15' viewBox='0 0 24 24' fill='none'><path d='M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round' /></svg>
                    )}
                </button>
            </div>
        </div>
    );
};

export default FooterBar;
