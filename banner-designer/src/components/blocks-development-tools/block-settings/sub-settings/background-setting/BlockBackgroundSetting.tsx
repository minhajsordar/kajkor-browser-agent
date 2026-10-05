'use client'
import * as React from 'react';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import Typography from '@mui/material/Typography';
import { IoChevronDownSharp } from "react-icons/io5";
import { useSelector } from '@/store/builderHooks';
import "./BlockBackgroundSetting.css"
import BackgroundImageSetting from '@/components/blocks-development-tools/block-settings/sub-settings/background-setting/image-gradient-setting/BackgroundImageSetting';
import BackgroundColorSetting from '@/components/blocks-development-tools/block-settings/sub-settings/background-setting/background-color-setting/BackgroundColorSetting';
import BackgroundClipSetting from '@/components/blocks-development-tools/block-settings/sub-settings/background-setting/background-clip-setting/BackgroundClipSetting';
const BlockBackgroundSetting = () => {
    const pageBuilder = useSelector((state: any) => state.pageBuilder);
    const { selectedUid } = pageBuilder;

    if (!selectedUid) {
        return <></>
    }
    return (
        <div>
            <Accordion className='bg-transparent'>
                <AccordionSummary
                    expandIcon={<div className='setting-accordion-icon'><IoChevronDownSharp /></div>}
                    aria-controls="panel1-content"
                    id="panel1-header"
                    className='setting-accordion-header'
                >
                    <Typography className='setting-accordion-text'>Background</Typography>
                </AccordionSummary>
                <AccordionDetails className='setting-accordion-details'>
                    <div className='flex flex-col gap-1'>
                        <div className='background-setting-items-area'>
                            <BackgroundImageSetting />
                            <BackgroundColorSetting />
                            <BackgroundClipSetting />
                        </div>
                    </div>
                </AccordionDetails>
            </Accordion>
        </div>
    )
}

export default BlockBackgroundSetting