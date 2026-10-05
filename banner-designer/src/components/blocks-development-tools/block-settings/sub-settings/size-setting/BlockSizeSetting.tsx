'use client'
import * as React from 'react';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import Typography from '@mui/material/Typography';
import { IoChevronDownSharp } from "react-icons/io5";
import { useSelector } from '@/store/builderHooks';
import "./BlockSizeSetting.css"
import CssCustomWidthInput from '@/components/blocks-development-tools/block-settings/sub-settings/size-setting/size-sub-setting/CssCustomWidthInput';
import CssCustomMaxWidthInput from '@/components/blocks-development-tools/block-settings/sub-settings/size-setting/size-sub-setting/CssCustomMaxWidthInput';
import CssCustomMinWidthInput from '@/components/blocks-development-tools/block-settings/sub-settings/size-setting/size-sub-setting/CssCustomMinWidthInput';
import CssCustomHeightInput from '@/components/blocks-development-tools/block-settings/sub-settings/size-setting/size-sub-setting/CssCustomHeightInput';
import CssCustomMaxHeightInput from '@/components/blocks-development-tools/block-settings/sub-settings/size-setting/size-sub-setting/CssCustomMaxHeightInput';
import CssCustomMinHeightInput from '@/components/blocks-development-tools/block-settings/sub-settings/size-setting/size-sub-setting/CssCustomMinHeightInput';
import CssCustomOverflowInput from '@/components/blocks-development-tools/block-settings/sub-settings/size-setting/overflow-setting/CssCustomOverflowInput';
import MoreSizeSettingArea from '@/components/blocks-development-tools/block-settings/sub-settings/size-setting/more-size-setting/MoreSizeSettingArea';

const BlockSizeSetting = () => {
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
                    <Typography className='setting-accordion-text'>Size</Typography>
                </AccordionSummary>
                <AccordionDetails className='setting-accordion-details'>
                    <div className="block-size-setting-container">
                        <CssCustomWidthInput/>
                        <CssCustomHeightInput/>
                        <CssCustomMaxWidthInput/>
                        <CssCustomMaxHeightInput/>
                        <CssCustomMinWidthInput/>
                        <CssCustomMinHeightInput/>
                        <CssCustomOverflowInput/>
                        <MoreSizeSettingArea/>
                    </div>
                </AccordionDetails>
            </Accordion>
        </div>
    )
}

export default BlockSizeSetting