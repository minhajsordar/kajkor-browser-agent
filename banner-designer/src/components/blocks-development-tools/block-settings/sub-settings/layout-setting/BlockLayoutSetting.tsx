'use client'
import * as React from 'react';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import Typography from '@mui/material/Typography';
import { IoChevronDownSharp } from "react-icons/io5";
import "./BlockLayoutSetting.css"
import CssCustomDisplaySetting from '@/components/blocks-development-tools/block-settings/sub-settings/layout-setting/display-setting/CssCustomDisplaySetting';
import { useSelector } from '@/store/builderHooks';
const BlockLayoutSetting = () => {
    const pageBuilder = useSelector((state: any) => state.pageBuilder);
    const { selectedUid } = pageBuilder;

    if (!selectedUid) {
        return <></>
    }
    return (
        <div>
            <Accordion defaultExpanded className='bg-transparent'>
                <AccordionSummary
                    expandIcon={<div className='setting-accordion-icon'><IoChevronDownSharp /></div>}
                    aria-controls="panel1-content"
                    id="panel1-header"
                    className='setting-accordion-header'
                >
                    <Typography className='setting-accordion-text'>Layout</Typography>
                </AccordionSummary>
                <AccordionDetails className='setting-accordion-details'>
                    <CssCustomDisplaySetting />
                </AccordionDetails>
            </Accordion>
        </div>
    )
}

export default BlockLayoutSetting