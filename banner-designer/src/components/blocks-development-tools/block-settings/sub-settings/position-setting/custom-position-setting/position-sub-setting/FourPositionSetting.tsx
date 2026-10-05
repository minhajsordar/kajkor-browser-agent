'use client'
import * as React from 'react';
import "./FourPositionSetting.css"
import CssPositionTopInputSetting from '@/components/blocks-development-tools/block-settings/sub-settings/position-setting/custom-position-setting/position-sub-setting/position-top-setting/CssPositionTopInputSetting';
import CssPositionRightInputSetting from '@/components/blocks-development-tools/block-settings/sub-settings/position-setting/custom-position-setting/position-sub-setting/position-right-setting/CssPositionRightInputSetting';
import CssPositionBottomInputSetting from '@/components/blocks-development-tools/block-settings/sub-settings/position-setting/custom-position-setting/position-sub-setting/position-bottom-setting/CssPositionBottomInputSetting';
import CssPositionLeftInputSetting from '@/components/blocks-development-tools/block-settings/sub-settings/position-setting/custom-position-setting/position-sub-setting/position-left-setting/CssPositionLeftInputSetting';

const FourPositionSetting = ({ cssKeyType = "position" }: { cssKeyType?: string }) => {

    return (
        <div className='four-position-setting-area'>
            <svg
                xmlns="http://www.w3.org/2000/svg"
                width={172}
                height={56}
                className="four-position-setting-bg-svg"
            >
                <mask id="position-mask" width={172} height={56}>
                    <rect fill="#000" height={56} width={172} x={0} y={0} />
                    <rect fill="#fff" height={56} rx={4} width={172} x={0} y={0} />
                    <rect fill="#000" height={10} rx={4} width={102} x={35} y={23} />
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
                            d="
  m0,0
  h172
  l-36,24
  h-100
  l-36,-24z
"
                            data-automation-id="position-top-button"
                            aria-label="Position top button"
                            mask="url(#position-mask)"
                            style={{ color: "var(--colors-background-1)", cursor: "n-resize" }}
                        />
                        <path
                            cursor="n-resize"
                            mode="delta"
                            fill="white"
                            d="
  m0,0
  h172
  l-36,24
  h-100
  l-36,-24z
"
                            fillOpacity="0.12"
                            mask="url(#position-mask)"
                            style={{ color: "var(--colors-background-1)", cursor: "n-resize" }}
                        />
                        <path
                            cursor="n-resize"
                            mode="delta"
                            fill="url(#FuseLinearGradient)"
                            d="
  m0,0
  h172
  l-36,24
  h-100
  l-36,-24z
"
                            fillOpacity="0.02"
                            mask="url(#position-mask)"
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
  m172,0
  v56
  l-36,-24
  v-8
  l36,-24z
"
                            data-automation-id="position-right-button"
                            aria-label="Position right button"
                            mask="url(#position-mask)"
                            style={{ color: "rgb(85, 85, 85)", cursor: "e-resize" }}
                        />
                        <path
                            cursor="e-resize"
                            mode="delta"
                            fill="white"
                            d="
  m172,0
  v56
  l-36,-24
  v-8
  l36,-24z
"
                            fillOpacity="0.094"
                            mask="url(#position-mask)"
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
                            d="
  m0,56
  h172
  l-36,-24
  h-100
  l-36,24z
"
                            data-automation-id="position-bottom-button"
                            aria-label="Position bottom button"
                            mask="url(#position-mask)"
                            style={{ color: "var(--colors-background-1)", cursor: "s-resize" }}
                        />
                        <path
                            cursor="s-resize"
                            mode="delta"
                            fill="white"
                            d="
  m0,56
  h172
  l-36,-24
  h-100
  l-36,24z
"
                            fillOpacity="0.064"
                            mask="url(#position-mask)"
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
  m0,0
  v56
  l36,-24
  v-8
  l-36,-24z
"
                            data-automation-id="position-left-button"
                            aria-label="Position left button"
                            mask="url(#position-mask)"
                            style={{ color: "rgb(85, 85, 85)", cursor: "w-resize" }}
                        />
                        <path
                            cursor="w-resize"
                            mode="delta"
                            fill="white"
                            d="
  m0,0
  v56
  l36,-24
  v-8
  l-36,-24z
"
                            fillOpacity="0.094"
                            mask="url(#position-mask)"
                            style={{ color: "rgb(85, 85, 85)", cursor: "w-resize" }}
                        />
                    </g>
                </g>
                <clipPath id="position-outer">
                    <rect
                        x={0}
                        y={0}
                        width={172}
                        height={56}
                        fill="transparent"
                        rx={4}
                        ry={4}
                        style={{ pointerEvents: "none" }}
                    />
                </clipPath>
                <rect
                    clipPath="url(#position-outer)"
                    x={0}
                    y={0}
                    width={172}
                    height={56}
                    fill="transparent"
                    rx={4}
                    ry={4}
                    style={{
                        pointerEvents: "none",
                        strokeWidth: 0,
                        stroke: "var(--colors-border-2)"
                    }}
                />
                <clipPath id="position-inner">
                    <rect
                        x={36}
                        y={24}
                        width={100}
                        height={8}
                        fill="transparent"
                        rx={4}
                        ry={4}
                        style={{ pointerEvents: "none" }}
                    />
                </clipPath>
                <rect
                    clipPath="url(#position-inner)"
                    x={36}
                    y={24}
                    width={100}
                    height={8}
                    fill="transparent"
                    rx={4}
                    ry={4}
                    style={{
                        pointerEvents: "none",
                        strokeWidth: 0,
                        stroke: "var(--colors-border-2)"
                    }}
                />
            </svg>
            <CssPositionTopInputSetting/>
            <CssPositionRightInputSetting/>
            <CssPositionBottomInputSetting/>
            <CssPositionLeftInputSetting/>
        </div>
    )
}

export default FourPositionSetting