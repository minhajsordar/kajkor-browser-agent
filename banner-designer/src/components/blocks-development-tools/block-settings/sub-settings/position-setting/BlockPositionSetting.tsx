'use client'
import * as React from 'react';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import Typography from '@mui/material/Typography';
import { IoChevronDownSharp } from "react-icons/io5";
import { useSelector } from '@/store/builderHooks';
import CssCustomPositionSetting from '@/components/blocks-development-tools/block-settings/sub-settings/position-setting/custom-position-setting/CssCustomPositionSetting';
import "./BlockPositionSetting.css"
const BlockPositionSetting = () => {
    // other display Css dropdown open
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
                    <Typography className='setting-accordion-text'>Position</Typography>
                </AccordionSummary>
                <AccordionDetails className='setting-accordion-details'>
                    <div>
                        <div className='position-setting-area'>
                            <CssCustomPositionSetting />
                        </div>
                    </div>
                </AccordionDetails>
            </Accordion>
        </div>
    )
}

export default BlockPositionSetting