'use client'
import * as React from 'react';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import Typography from '@mui/material/Typography';
import { IoChevronDownSharp } from "react-icons/io5";
import { useSelector } from '@/store/builderHooks';
import MarginTopSetting from '@/components/blocks-development-tools/block-settings/sub-settings/spacing-setting/margin-setting/margin-top/MarginTopSetting';
import MarginRightSetting from '@/components/blocks-development-tools/block-settings/sub-settings/spacing-setting/margin-setting/margin-right/MarginRightSetting';
import MarginBottomSetting from '@/components/blocks-development-tools/block-settings/sub-settings/spacing-setting/margin-setting/margin-bottom/MarginBottomSetting';
import MarginLeftSetting from '@/components/blocks-development-tools/block-settings/sub-settings/spacing-setting/margin-setting/margin-left/MarginLeftSetting';
import PaddingTopSetting from '@/components/blocks-development-tools/block-settings/sub-settings/spacing-setting/padding-setting/padding-top/PaddingTopSetting';
import PaddingRightSetting from '@/components/blocks-development-tools/block-settings/sub-settings/spacing-setting/padding-setting/padding-right/PaddingRightSetting';
import PaddingBottomSetting from '@/components/blocks-development-tools/block-settings/sub-settings/spacing-setting/padding-setting/padding-bottom/PaddingBottomSetting';
import PaddingLeftSetting from '@/components/blocks-development-tools/block-settings/sub-settings/spacing-setting/padding-setting/padding-left/PaddingLeftSetting';
import "./BlockSpacingSetting.css"
const BlockSpacingSetting = () => {
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
                    <Typography className='setting-accordion-text'>Spacing</Typography>
                </AccordionSummary>
                <AccordionDetails className='setting-accordion-details'>
                    <div>
                        <div className='block-spacing-setting-area'>
                            <div className='block-spacing-setting-container'>
                                <div className='block-spacing-setting-margin-container'>
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width={224}
                                        height={112}
                                        className="margin-svg-background"
                                    >
                                        <mask id="margin-mask" width={224} height={112}>
                                            <rect fill="#000" height={112} width={224} x={0} y={0} />
                                            <rect fill="#fff" height={112} rx={4} width={224} x={0} y={0} />
                                            <rect fill="#000" height={66} rx={4} width={154} x={35} y={23} />
                                        </mask>
                                        <defs>
                                            <linearGradient id="FuseLinearGradient" x1={0} y1={0} x2={0} y2={1}>
                                                <stop stopColor="white" />
                                                <stop offset={1} stopColor="white" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <g>
                                            <g>
                                                <path
                                                    cursor="n-resize"
                                                    mode="delta"
                                                    fill="var(--colors-background-1)"
                                                    d=" m0,0 h224 l-36,24 h-152 l-36,-24z"
                                                    data-automation-id="margin-top-button"
                                                    aria-label="Margin top button"
                                                    mask="url(#margin-mask)"
                                                    style={{ color: "var(--colors-background-1)", cursor: "n-resize" }}
                                                />
                                                <path
                                                    cursor="n-resize"
                                                    mode="delta"
                                                    fill="white"
                                                    d="  m0,0  h224  l-36,24  h-152  l-36,-24z"
                                                    fillOpacity="0.12"
                                                    mask="url(#margin-mask)"
                                                    style={{ color: "var(--colors-background-1)", cursor: "n-resize" }}
                                                />
                                                <path
                                                    cursor="n-resize"
                                                    mode="delta"
                                                    fill="url(#FuseLinearGradient)"
                                                    d=" m0,0 h224 l-36,24 h-152 l-36,-24z"
                                                    fillOpacity="0.02"
                                                    mask="url(#margin-mask)"
                                                    style={{ color: "var(--colors-background-1)", cursor: "n-resize" }}
                                                />
                                            </g>
                                        </g>
                                        <g>
                                            <g>
                                                <path
                                                    cursor="e-resize"
                                                    mode="delta"
                                                    fill="var(--colors-background-1)"
                                                    d="  m224,0  v112  l-36,-24  v-64  l36,-24z"
                                                    data-automation-id="margin-right-button"
                                                    aria-label="Margin right button"
                                                    mask="url(#margin-mask)"
                                                    style={{ color: "rgb(85, 85, 85)", cursor: "e-resize" }}
                                                />
                                                <path
                                                    cursor="e-resize"
                                                    mode="delta"
                                                    fill="white"
                                                    d="  m224,0  v112  l-36,-24  v-64  l36,-24z"
                                                    fillOpacity="0.094"
                                                    mask="url(#margin-mask)"
                                                    style={{ color: "rgb(85, 85, 85)", cursor: "e-resize" }}
                                                />
                                            </g>
                                        </g>
                                        <g>
                                            <g>
                                                <path
                                                    cursor="s-resize"
                                                    mode="delta"
                                                    fill="var(--colors-background-1)"
                                                    d="  m0,112  h224  l-36,-24  h-152  l-36,24z"
                                                    data-automation-id="margin-bottom-button"
                                                    aria-label="Margin bottom button"
                                                    mask="url(#margin-mask)"
                                                    style={{ color: "var(--colors-background-1)", cursor: "s-resize" }}
                                                />
                                                <path
                                                    cursor="s-resize"
                                                    mode="delta"
                                                    fill="white"
                                                    d="  m0,112  h224  l-36,-24  h-152  l-36,24z"
                                                    fillOpacity="0.064"
                                                    mask="url(#margin-mask)"
                                                    style={{ color: "var(--colors-background-1)", cursor: "s-resize" }}
                                                />
                                            </g>
                                        </g>
                                        <g>
                                            <g>
                                                <path
                                                    cursor="w-resize"
                                                    mode="delta"
                                                    fill="var(--colors-background-1)"
                                                    d="  m0,0  v112  l36,-24  v-64  l-36,-24z"
                                                    data-automation-id="margin-left-button"
                                                    aria-label="Margin left button"
                                                    mask="url(#margin-mask)"
                                                    style={{ color: "rgb(85, 85, 85)", cursor: "w-resize" }}
                                                />
                                                <path
                                                    cursor="w-resize"
                                                    mode="delta"
                                                    fill="white"
                                                    d="  m0,0  v112  l36,-24  v-64  l-36,-24z"
                                                    fillOpacity="0.094"
                                                    mask="url(#margin-mask)"
                                                    style={{ color: "rgb(85, 85, 85)", cursor: "w-resize" }}
                                                />
                                            </g>
                                        </g>
                                        <clipPath id="margin-outer">
                                            <rect
                                                x={0}
                                                y={0}
                                                width={224}
                                                height={112}
                                                fill="transparent"
                                                rx={4}
                                                ry={4}
                                                style={{ pointerEvents: "none" }}
                                            />
                                        </clipPath>
                                        <rect
                                            clipPath="url(#margin-outer)"
                                            x={0}
                                            y={0}
                                            width={224}
                                            height={112}
                                            fill="transparent"
                                            rx={4}
                                            ry={4}
                                            style={{
                                                pointerEvents: "none",
                                                strokeWidth: 0,
                                                stroke: "var(--colors-border-2)"
                                            }}
                                        />
                                        <clipPath id="margin-inner">
                                            <rect
                                                x={36}
                                                y={24}
                                                width={152}
                                                height={64}
                                                fill="transparent"
                                                rx={4}
                                                ry={4}
                                                style={{ pointerEvents: "none" }}
                                            />
                                        </clipPath>
                                        <rect
                                            clipPath="url(#margin-inner)"
                                            x={36}
                                            y={24}
                                            width={152}
                                            height={64}
                                            fill="transparent"
                                            rx={4}
                                            ry={4}
                                            style={{
                                                pointerEvents: "none",
                                                strokeWidth: 0,
                                                stroke: "var(--colors-border-2)"
                                            }}
                                        />
                                        <text x="5" y="4" fill="#ffffff" fontWeight="500" fontSize="7" dominantBaseline="hanging">MARGIN</text>

                                    </svg>
                                    <MarginTopSetting />
                                    <MarginRightSetting />
                                    <MarginBottomSetting />
                                    <MarginLeftSetting />
                                </div>
                                <div className='block-spacing-setting-padding-container'>
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width={150}
                                        height={62}
                                        className="padding-svg-background"
                                    >
                                        <mask id="padding-mask" width={150} height={62}>
                                            <rect fill="#000" height={60} width={150} x={0} y={0} />
                                            <rect fill="#fff" height={60} rx={2} width={150} x={0} y={0} />
                                            <rect fill="#000" height={14} rx={2} width={80} x={35} y={23} />
                                        </mask>
                                        <defs>
                                            <linearGradient id="FuseLinearGradient" x1={0} y1={0} x2={0} y2={1}>
                                                <stop stopColor="white" />
                                                <stop offset={1} stopColor="white" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <g>
                                            <g>
                                                <path
                                                    cursor="s-resize"
                                                    mode="delta"
                                                    fill="var(--colors-background-1)"
                                                    d="
  m0,0
  h150
  l-36,24
  h-78
  l-36,-24z
"
                                                    data-automation-id="padding-top-button"
                                                    aria-label="Padding top button"
                                                    mask="url(#padding-mask)"
                                                    style={{ color: "var(--colors-background-1)", cursor: "s-resize" }}
                                                />
                                                <path
                                                    cursor="s-resize"
                                                    mode="delta"
                                                    fill="white"
                                                    d="
  m0,0
  h150
  l-36,24
  h-78
  l-36,-24z
"
                                                    fillOpacity="0.064"
                                                    mask="url(#padding-mask)"
                                                    style={{ color: "var(--colors-background-1)", cursor: "s-resize" }}
                                                />
                                            </g>
                                        </g>
                                        <g>
                                            <g>
                                                <path
                                                    cursor="w-resize"
                                                    mode="delta"
                                                    fill="var(--colors-background-1)"
                                                    d="
  m150,0
  v60
  l-36,-24
  v-12
  l36,-24z
"
                                                    data-automation-id="padding-right-button"
                                                    aria-label="Padding right button"
                                                    mask="url(#padding-mask)"
                                                    style={{ color: "rgb(85, 85, 85)", cursor: "w-resize" }}
                                                />
                                                <path
                                                    cursor="w-resize"
                                                    mode="delta"
                                                    fill="white"
                                                    d="
  m150,0
  v60
  l-36,-24
  v-12
  l36,-24z
"
                                                    fillOpacity="0.094"
                                                    mask="url(#padding-mask)"
                                                    style={{ color: "rgb(85, 85, 85)", cursor: "w-resize" }}
                                                />
                                            </g>
                                        </g>
                                        <g>
                                            <g>
                                                <path
                                                    cursor="n-resize"
                                                    mode="delta"
                                                    fill="var(--colors-background-1)"
                                                    d="
  m0,60
  h150
  l-36,-24
  h-78
  l-36,24z
"
                                                    data-automation-id="padding-bottom-button"
                                                    aria-label="Padding bottom button"
                                                    mask="url(#padding-mask)"
                                                    style={{ color: "var(--colors-background-1)", cursor: "n-resize" }}
                                                />
                                                <path
                                                    cursor="n-resize"
                                                    mode="delta"
                                                    fill="white"
                                                    d="
  m0,60
  h150
  l-36,-24
  h-78
  l-36,24z
"
                                                    fillOpacity="0.12"
                                                    mask="url(#padding-mask)"
                                                    style={{ color: "var(--colors-background-1)", cursor: "n-resize" }}
                                                />
                                                <path
                                                    cursor="n-resize"
                                                    mode="delta"
                                                    fill="url(#FuseLinearGradient)"
                                                    d="
  m0,60
  h150
  l-36,-24
  h-78
  l-36,24z
"
                                                    fillOpacity="0.02"
                                                    mask="url(#padding-mask)"
                                                    style={{ color: "var(--colors-background-1)", cursor: "n-resize" }}
                                                />
                                            </g>
                                        </g>
                                        <g>
                                            <g>
                                                <path
                                                    cursor="e-resize"
                                                    mode="delta"
                                                    fill="var(--colors-background-1)"
                                                    d="
  m0,0
  v60
  l36,-24
  v-12
  l-36,-24z
"
                                                    data-automation-id="padding-left-button"
                                                    aria-label="Padding left button"
                                                    mask="url(#padding-mask)"
                                                    style={{ color: "rgb(85, 85, 85)", cursor: "e-resize" }}
                                                />
                                                <path
                                                    cursor="e-resize"
                                                    mode="delta"
                                                    fill="white"
                                                    d="
  m0,0
  v60
  l36,-24
  v-12
  l-36,-24z
"
                                                    fillOpacity="0.094"
                                                    mask="url(#padding-mask)"
                                                    style={{ color: "rgb(85, 85, 85)", cursor: "e-resize" }}
                                                />
                                            </g>
                                        </g>
                                        <clipPath id="padding-outer">
                                            <rect
                                                x={0}
                                                y={0}
                                                width={150}
                                                height={62}
                                                fill="transparent"
                                                rx={4}
                                                ry={4}
                                                style={{ pointerEvents: "none" }}
                                            />
                                        </clipPath>
                                        <rect
                                            clipPath="url(#padding-outer)"
                                            x={0}
                                            y={0}
                                            width={150}
                                            height={62}
                                            fill="transparent"
                                            rx={4}
                                            ry={4}
                                            style={{
                                                pointerEvents: "none",
                                                strokeWidth: 0,
                                                stroke: "var(--colors-border-2)"
                                            }}
                                        />
                                        <clipPath id="padding-inner">
                                            <rect
                                                x={36}
                                                y={24}
                                                width={78}
                                                height={14}
                                                fill="transparent"
                                                rx={4}
                                                ry={4}
                                                style={{ pointerEvents: "none" }}
                                            />
                                        </clipPath>
                                        <rect
                                            clipPath="url(#padding-inner)"
                                            x={36}
                                            y={24}
                                            width={78}
                                            height={14}
                                            fill="transparent"
                                            rx={4}
                                            ry={4}
                                            style={{
                                                pointerEvents: "none",
                                                strokeWidth: 0,
                                                stroke: "var(--colors-border-2)"
                                            }}
                                        />
                                        <text x="5" y="4" fill="#ffffff" fontWeight="500" fontSize="7" dominantBaseline="hanging">PADDING</text>
                                    </svg>

                                    <PaddingTopSetting />
                                    <PaddingRightSetting />
                                    <PaddingBottomSetting />
                                    <PaddingLeftSetting />
                                </div>
                            </div>

                        </div>
                    </div>
                </AccordionDetails>
            </Accordion>
        </div>
    )
}

export default BlockSpacingSetting