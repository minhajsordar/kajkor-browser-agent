'use client'
import * as React from 'react';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import Typography from '@mui/material/Typography';
import { IoChevronDownSharp } from "react-icons/io5";
import { useSelector } from '@/store/builderHooks';
import "./BlockBorderSetting.css"
import BorderRadiusSetting from './border-radius-setting/BorderRadiusSetting';
import BorderStyleSetting from './border-style-setting/BorderStyleSetting';
const BlockBorderSetting = () => {
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
                    <Typography className='setting-accordion-text'>Border</Typography>
                </AccordionSummary>
                <AccordionDetails className='setting-accordion-details'>
                    <div className='flex flex-col gap-1'>
                        <div className='border-setting-items-area'>
                            <BorderRadiusSetting />
                            <BorderStyleSetting />
                        </div>
                    </div>
                </AccordionDetails>
            </Accordion>
        </div>
    )
}

export default BlockBorderSetting