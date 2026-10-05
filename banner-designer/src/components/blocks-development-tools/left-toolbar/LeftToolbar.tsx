'use client'
import React from 'react'
import AssetsListButton from './dialogs/AssetsListButton'
import AiGenerateButton from './dialogs/AiGenerateButton'
import ElementsButton from './dialogs/ElementsButton'
import TemplatesButton from './dialogs/TemplatesButton'
import TextButton from './dialogs/TextButton'
import BrandButton from './dialogs/BrandButton'
import ProjectsButton from './dialogs/ProjectsButton'

const railBtn = 'flex h-14 w-full flex-col items-center justify-center gap-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900';
const label = 'text-[10px] leading-none font-medium';

const LeftToolbar = () => {
    return (
        <div className='scrollbar-none flex h-full w-16 shrink-0 flex-col items-center overflow-y-auto border-r border-neutral-200 bg-white'>
            <AiGenerateButton className='flex h-14 w-full flex-col items-center justify-center gap-1 bg-indigo-600 text-white hover:bg-indigo-500'>
                <svg width={20} height={20} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 2L14.4 8.6L21 11L14.4 13.4L12 20L9.6 13.4L3 11L9.6 8.6L12 2Z" fill="currentColor" />
                    <path d="M19 15L20 18L23 19L20 20L19 23L18 20L15 19L18 18L19 15Z" fill="currentColor" opacity="0.7" />
                </svg>
                <span className={label}>AI</span>
            </AiGenerateButton>

            <TemplatesButton className={railBtn}>
                <svg width={20} height={20} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" />
                    <rect x="7" y="7" width="10" height="4" rx="1" fill="currentColor" opacity="0.7" />
                    <rect x="7" y="13" width="6" height="4" rx="1" fill="currentColor" opacity="0.45" />
                </svg>
                <span className={label}>Templates</span>
            </TemplatesButton>

            <ElementsButton className={railBtn}>
                <svg width={20} height={20} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="3" y="3" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
                    <rect x="13" y="3" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
                    <rect x="3" y="13" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M17 13v8M13 17h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <span className={label}>Elements</span>
            </ElementsButton>

            <TextButton className={railBtn}>
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M5 5V8H9.5V19H14.5V8H19V5H5Z" fill="currentColor" />
                </svg>
                <span className={label}>Text</span>
            </TextButton>

            <BrandButton className={railBtn}>
                <svg width={20} height={20} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 3C7 3 3 7 3 12C3 17 7 21 12 21C13.2 21 14 20.2 14 19.2C14 18.6 13.7 18.1 13.3 17.8C12.9 17.4 12.7 17 12.7 16.4C12.7 15.4 13.5 14.6 14.5 14.6H16.5C19 14.6 21 12.6 21 10C20.7 6 16.8 3 12 3Z" stroke="currentColor" strokeWidth="1.5" />
                    <circle cx="7.5" cy="11.5" r="1.5" fill="currentColor" />
                    <circle cx="12" cy="7.5" r="1.5" fill="currentColor" />
                    <circle cx="16.5" cy="11.5" r="1.5" fill="currentColor" />
                </svg>
                <span className={label}>Brand</span>
            </BrandButton>

            <AssetsListButton className={railBtn}>
                <svg width={20} height={20} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M6 18C4 18 2.5 16.5 2.5 14.5C2.5 12.7 3.7 11.3 5.4 11C5.9 7.8 8.6 5.5 12 5.5C15.4 5.5 18.1 7.8 18.6 11C20.3 11.3 21.5 12.7 21.5 14.5C21.5 16.5 20 18 18 18H6Z" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M12 12V21M12 12L9 15M12 12L15 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className={label}>Uploads</span>
            </AssetsListButton>

            <ProjectsButton className={railBtn}>
                <svg width={20} height={20} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M3 7C3 5.3 4.3 4 6 4H9.5L11.5 6.5H18C19.7 6.5 21 7.8 21 9.5V17C21 18.7 19.7 20 18 20H6C4.3 20 3 18.7 3 17V7Z" stroke="currentColor" strokeWidth="1.5" />
                </svg>
                <span className={label}>Projects</span>
            </ProjectsButton>
        </div>
    )
}

export default LeftToolbar
