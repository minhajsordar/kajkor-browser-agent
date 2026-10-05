'use client'
import React from 'react'
import Dialog from '@/components/dialog/Dialog'
import { useDispatch, useSelector } from '@/store/builderHooks'
import { setSelectedUid, updatePageContentState } from '@/store/builderActions'
import { BANNER_TEMPLATES } from '@/utils/templates'
import { normalizeBanner } from '@/utils/normalizeBanner'

const px = (v: any): number => {
    const n = parseFloat(String(v));
    return Number.isNaN(n) ? 0 : n;
};

const TemplatesButton = ({
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

    const applyTemplate = (templateId: string) => {
        const template = BANNER_TEMPLATES.find((t) => t.id === templateId);
        if (!template || !draftPageContentSet?.body) return;
        const bodyStyles = draftPageContentSet.body.style?.light?.default?.styles || {};
        const { builderData } = normalizeBanner(template.tree, {
            width: px(bodyStyles.width) || 1200,
            height: px(bodyStyles.height) || 628,
        });
        dispatch(updatePageContentState({ ...pageContent, draftPageContentSet: builderData }));
        dispatch(setSelectedUid('body'));
        setOpen(false);
    };

    return (
        <React.Fragment>
            <button className={`${className} ${open ? '!bg-indigo-50 !text-indigo-600' : ''}`} onClick={() => setOpen(s => !s)} title="Templates">
                {children}
            </button>
            <Dialog open={open} setOpen={setOpen}
                position='left' dimmed={false}
                height='calc(100vh - 48px)'
                width='320px'
                left={{ left: "64px", top: "48px", transform: "none" }}
            >
                <div className='p-3'>
                    <div className='text-sm font-semibold text-neutral-800 mb-1'>Templates</div>
                    <div className='text-[11px] text-neutral-400 mb-3'>Replaces the current canvas — undo with Ctrl+Z.</div>
                    <div className='flex flex-col gap-2'>
                        {BANNER_TEMPLATES.map((t) => (
                            <button
                                key={t.id}
                                type='button'
                                onClick={() => applyTemplate(t.id)}
                                className='overflow-hidden rounded-md border border-neutral-200 text-left hover:border-indigo-400'
                            >
                                <div className='h-20 w-full' style={{ background: t.swatch }} />
                                <div className='bg-white px-2.5 py-1.5 text-xs font-medium text-neutral-800'>
                                    {t.name}
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            </Dialog>
        </React.Fragment>
    )
}

export default TemplatesButton
