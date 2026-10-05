'use client'
import React from 'react'
import Dialog from '@/components/dialog/Dialog'
import { siteFetch } from '@/store/siteFetch'
import { toast } from 'react-toastify'
import { useSearchParams } from 'next/navigation'

interface BannerRow {
    _id: string;
    name: string;
    width: number;
    height: number;
    status: string;
    updatedAt: string;
}

const ProjectsButton = ({
    className,
    children
}: {
    className?: string,
    children: React.ReactNode
}) => {
    const [open, setOpen] = React.useState(false)
    const [banners, setBanners] = React.useState<BannerRow[]>([])
    const [loading, setLoading] = React.useState(false)
    const searchParams = useSearchParams();
    const currentBannerId = searchParams?.get('bannerId');

    const load = React.useCallback(async () => {
        setLoading(true);
        try {
            const res = await siteFetch('/api/banners');
            const data = await res.json();
            setBanners(data.banners || []);
        } catch {
            toast.error('Could not load banners');
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => {
        if (open) load();
    }, [open, load]);

    const openBanner = (id: string) => {
        window.location.href = `/?bannerId=${id}`;
    };

    const createBanner = async () => {
        try {
            const res = await siteFetch('/api/banners', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'Untitled banner', width: 1200, height: 628 }),
            });
            const data = await res.json();
            if (!res.ok) {
                toast.error(data?.msg || 'Could not create banner');
                return;
            }
            openBanner(data.banner._id);
        } catch {
            toast.error('Could not create banner');
        }
    };

    const deleteBanner = async (id: string, name: string) => {
        if (!window.confirm(`Delete "${name}" and all its drafts/versions?`)) return;
        try {
            const res = await siteFetch(`/api/banners/${id}`, { method: 'DELETE' });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                toast.error(data?.msg || 'Could not delete banner');
                return;
            }
            setBanners((rows) => rows.filter((r) => r._id !== id));
            toast.success('Banner deleted');
            // Deleting the banner open in the editor would leave it on a
            // dead bannerId — every save/publish then 404s. Go to a clean
            // canvas instead.
            if (id === currentBannerId) {
                window.location.href = '/';
            }
        } catch {
            toast.error('Could not delete banner');
        }
    };

    return (
        <React.Fragment>
            <button className={`${className} ${open ? '!bg-indigo-50 !text-indigo-600' : ''}`} onClick={() => setOpen(s => !s)} title="Projects">
                {children}
            </button>
            <Dialog open={open} setOpen={setOpen}
                position='left' dimmed={false}
                height='calc(100vh - 48px)'
                width='320px'
                left={{ left: "64px", top: "48px", transform: "none" }}
            >
                <div className='p-3 flex flex-col gap-3'>
                    <div className='flex items-center justify-between'>
                        <div className='text-sm font-semibold text-neutral-800'>Projects</div>
                        <button
                            type='button'
                            onClick={createBanner}
                            className='rounded-sm bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-indigo-500'
                        >
                            + New
                        </button>
                    </div>

                    {loading && <div className='text-xs text-neutral-400 px-1 py-4'>Loading…</div>}
                    {!loading && banners.length === 0 && (
                        <div className='text-xs text-neutral-400 px-1 py-4'>No banners yet — create one.</div>
                    )}

                    <div className='flex flex-col gap-1.5'>
                        {banners.map((b) => (
                            <div
                                key={b._id}
                                className={`group flex items-center gap-2 rounded-md border px-2.5 py-2 cursor-pointer ${
                                    b._id === currentBannerId
                                        ? 'border-indigo-500 bg-indigo-600/20'
                                        : 'border-neutral-200 bg-neutral-100 hover:bg-neutral-200'
                                }`}
                                onClick={() => openBanner(b._id)}
                            >
                                <div className='min-w-0 flex-1'>
                                    <div className='truncate text-xs font-medium text-neutral-800'>{b.name}</div>
                                    <div className='text-[10px] text-neutral-400'>
                                        {b.width}×{b.height} · {b.status} · {new Date(b.updatedAt).toLocaleDateString()}
                                    </div>
                                </div>
                                <button
                                    type='button'
                                    title='Delete'
                                    onClick={(e) => { e.stopPropagation(); deleteBanner(b._id, b.name); }}
                                    className='px-1 text-neutral-400 hover:text-red-500'
                                >
                                    ✕
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            </Dialog>
        </React.Fragment>
    )
}

export default ProjectsButton
