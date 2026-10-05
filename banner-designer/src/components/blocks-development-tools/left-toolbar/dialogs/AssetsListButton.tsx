'use client'
import React from 'react'
import Dialog from '@/components/dialog/Dialog'
import { siteFetch } from '@/store/siteFetch'
import { useDispatch, useSelector } from '@/store/builderHooks'
import { addPageBlock } from '@/store/builderActions'
import { toast } from 'react-toastify'
import { nanoid } from 'nanoid'
import "./AssetsListButton.css";

type MediaItem = {
    _id: string;
    url: string;
    originalName: string;
    mimeType: string;
};

const branch = (styles: Record<string, string> = {}) => ({ styles, custom: '', hover: {} });

const imageElement = (url: string, name: string) => {
    const uid = `uid-${nanoid(10)}`;
    return {
        tag: 'img',
        name: 'Image',
        id: '',
        classList: '',
        systemAddedClass: uid,
        parentId: 'body',
        attributes: { src: url, alt: name },
        style: {
            light: {
                default: branch({
                    position: 'absolute', left: '60px', top: '60px',
                    width: '320px', 'object-fit': 'cover',
                }),
                '478px': branch(), '767px': branch(), '991px': branch(),
                '1280px': branch(), '1440px': branch(), '1920px': branch(),
            },
        },
    };
};

const AssetsListButton = ({
    className,
    children
}: {
    className?: string,
    children: React.ReactNode
}) => {
    const [open, setOpen] = React.useState(false)
    const [media, setMedia] = React.useState<MediaItem[]>([])
    const [uploading, setUploading] = React.useState(false)
    const dispatch = useDispatch()
    const pageContent = useSelector((state: any) => state.pageContent);

    const loadMedia = async () => {
        try {
            const response = await siteFetch('/api/media?type=image');
            const payload = await response.json();
            if (response.ok && Array.isArray(payload.media)) {
                setMedia(payload.media);
            }
        } catch (error) {
            console.error('Media load error', error);
        }
    };

    React.useEffect(() => {
        if (open) loadMedia();
    }, [open]);

    const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        setUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            const response = await siteFetch('/api/upload', { method: 'POST', body: formData });
            const payload = await response.json();
            if (!response.ok) {
                toast.error(payload?.msg || 'Upload failed');
                return;
            }
            toast.success('Uploaded');
            await loadMedia();
        } catch (error) {
            console.error('Upload error', error);
            toast.error('Upload failed');
        } finally {
            setUploading(false);
            event.target.value = '';
        }
    };

    const insertImage = (item: MediaItem) => {
        const bodyChildren = pageContent?.draftPageContentSet?.body?.child || [];
        dispatch(addPageBlock({
            uid: 'body',
            index: bodyChildren.length,
            newElement: imageElement(item.url, item.originalName),
        }));
        toast.success('Image added to canvas');
    };

    return (
        <React.Fragment>
            <button className={`${className} ${open ? '!bg-indigo-50 !text-indigo-600' : ''}`} onClick={() => setOpen(s => !s)} title="Assets">
                {children}
            </button>
            <Dialog open={open} setOpen={setOpen}
                position='left' dimmed={false}
                height='calc(100vh - 48px)'
                width='600px'
                left={{ left: "64px", top: "48px", transform: "none" }}
            >
                <div>
                    <div className='upload-files-button'>
                        <label htmlFor="file">
                            {uploading ? 'Uploading…' : 'Upload New Files'}
                        </label>
                        <input id="file" type='file' accept="image/*" onChange={handleUpload} />
                    </div>
                    <div className='w-full'>
                        <div className='flex flex-wrap -m-1'>
                            {media.map((item) => (
                                <div className='w-[100px] h-[100px] p-1' key={item._id}>
                                    <button
                                        type="button"
                                        onClick={() => insertImage(item)}
                                        title={`Insert ${item.originalName}`}
                                        className='p-1 w-full h-full flex justify-center items-center border border-gray-400 hover:border-blue-500'
                                    >
                                        <img className='w-full h-auto' src={item.url} alt={item.originalName} />
                                    </button>
                                </div>
                            ))}
                            {!media.length && (
                                <div className='p-4 text-sm text-gray-400'>No images uploaded yet.</div>
                            )}
                        </div>
                    </div>
                </div>
            </Dialog>
        </React.Fragment>
    )
}

export default AssetsListButton
