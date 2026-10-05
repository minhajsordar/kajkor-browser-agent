'use client'
import * as React from 'react';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import Typography from '@mui/material/Typography';
import { IoChevronDownSharp } from "react-icons/io5";
import { useSelector } from '@/store/builderHooks';
import CssCustomFontFamilyInput from '@/components/blocks-development-tools/block-settings/sub-settings/typography-setting/typography-input-setting/CssCustomFontFamilyInput';
import CssCustomFontWeightInput from '@/components/blocks-development-tools/block-settings/sub-settings/typography-setting/typography-input-setting/CssCustomFontWeightInput';
import CssCustomTextColorInput from '@/components/blocks-development-tools/block-settings/sub-settings/typography-setting/typography-input-setting/CssCustomTextColorInput';
import CssCustomTextAlignInput from '@/components/blocks-development-tools/block-settings/sub-settings/typography-setting/typography-input-setting/CssCustomTextAlignInput';
import CssCustomFontSizeInput from '@/components/blocks-development-tools/block-settings/sub-settings/typography-setting/typography-input-setting/CssCustomFontSizeInput';
import CssCustomLineHeightInput from '@/components/blocks-development-tools/block-settings/sub-settings/typography-setting/typography-input-setting/CssCustomLineHeightInput';
import TextStyleInputArea from '@/components/blocks-development-tools/block-settings/sub-settings/typography-setting/typography-input-setting/TextStyleInputArea';
import MoreTypographyInputArea from '@/components/blocks-development-tools/block-settings/sub-settings/typography-setting/more-typography-input-setting/MoreTypographyInputArea';
const BlockTypographySetting = () => {
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
                    <Typography className='setting-accordion-text'>Typography</Typography>
                </AccordionSummary>
                <AccordionDetails className='setting-accordion-details'>
                    <div className='flex flex-col gap-1'>
                        <div className='setting-items-area'>
                            <CssCustomFontFamilyInput />
                            <CssCustomFontWeightInput />
                            <CssCustomFontSizeInput/>
                            <CssCustomLineHeightInput/>
                            <CssCustomTextColorInput cssKeyType='color' />
                            <CssCustomTextAlignInput cssKeyType='text-align' />
                            <TextStyleInputArea/>
                            <MoreTypographyInputArea/>
                        </div>
                    </div>
                </AccordionDetails>
            </Accordion>
        </div>
    )
}

export default BlockTypographySetting