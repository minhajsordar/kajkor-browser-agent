"use client"
import React from 'react'
import "./MoreTypographyInputArea.css"
import CssCustomLetterSpacingInput from '@/components/blocks-development-tools/block-settings/sub-settings/typography-setting/more-typography-input-setting/typography-sub-settings/CssCustomLetterSpacingInput'
import CssCustomTextIndentInput from '@/components/blocks-development-tools/block-settings/sub-settings/typography-setting/more-typography-input-setting/typography-sub-settings/CssCustomTextIndentInput'
import CssCustomTextColumnCountInput from '@/components/blocks-development-tools/block-settings/sub-settings/typography-setting/more-typography-input-setting/typography-sub-settings/CssCustomTextColumnCountInput'
import CssCustomTextTransformInput from '@/components/blocks-development-tools/block-settings/sub-settings/typography-setting/more-typography-input-setting/typography-sub-settings/CssCustomTextTransformInput'
import CssCustomTextDirectionInput from '@/components/blocks-development-tools/block-settings/sub-settings/typography-setting/more-typography-input-setting/typography-sub-settings/CssCustomTextDirectionInput'
import CssCustomWordBreakInput from '@/components/blocks-development-tools/block-settings/sub-settings/typography-setting/more-typography-input-setting/typography-sub-settings/CssCustomWordBreakInput'
import CssCustomWhiteSpaceInput from '@/components/blocks-development-tools/block-settings/sub-settings/typography-setting/more-typography-input-setting/typography-sub-settings/CssCustomWhiteSpaceInput'
import CssCustomOverFlowWrapInput from '@/components/blocks-development-tools/block-settings/sub-settings/typography-setting/more-typography-input-setting/typography-sub-settings/CssCustomOverFlowWrapInput'
import CssCustomTextStrokeWidthInput from '@/components/blocks-development-tools/block-settings/sub-settings/typography-setting/more-typography-input-setting/typography-sub-settings/CssCustomTextStrokeWidthInput'
import CssCustomTextStrokeColorInput from '@/components/blocks-development-tools/block-settings/sub-settings/typography-setting/more-typography-input-setting/typography-sub-settings/CssCustomTextStrokeColorInput'
import CssCustomTextShadowInput from '@/components/blocks-development-tools/block-settings/sub-settings/typography-setting/more-typography-input-setting/typography-sub-settings/text-shadow/CssCustomTextShadowInput'
const MoreTypographyInputArea = () => {
    return (
        <div className='more-typography-input-area'>
            <div className='more-typography-input-container'>
                <div className='typography-setting-dropdown-action-button'>
                    <svg
                        data-wf-icon="ChevronSmallDownIcon"
                        width={16}
                        height={16}
                        viewBox="0 0 16 16"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <path
                            fillRule="evenodd"
                            clipRule="evenodd"
                            d="M8.00002 9.29293L10.6465 6.64648L11.3536 7.35359L8.00002 10.7071L4.64647 7.35359L5.35358 6.64648L8.00002 9.29293Z"
                            fill="currentColor"
                        />
                    </svg>
                    <div className='typography-setting-dropdown-button-title'>
                        <span>More type options</span>
                    </div>
                </div>
                <div>
                    <div className='typography-spacing-indentation-columns-container'>
                        <div className='typography-spacing-setting-container'>
                            <CssCustomLetterSpacingInput />
                        </div>
                        <div className='typography-spacing-setting-container'>
                            <CssCustomTextIndentInput />
                        </div>
                        <div className='typography-spacing-setting-container'>
                            <CssCustomTextColumnCountInput />
                        </div>
                    </div>
                    <div className='typography-case-direction-container'>
                        <div className='typography-case-setting-container'>
                            <CssCustomTextTransformInput />
                        </div>
                        <div className='typography-direction-setting-container'>
                            <CssCustomTextDirectionInput />
                        </div>
                    </div>
                    <div className='typography-break-wrap-container'>
                        <CssCustomWordBreakInput />
                        <CssCustomWhiteSpaceInput />
                    </div>
                    <div className='typography-overflow-wrap-container'>
                        <CssCustomOverFlowWrapInput />
                    </div>
                    <div className='typography-stroke-container'>
                        <CssCustomTextStrokeWidthInput />
                        <CssCustomTextStrokeColorInput />
                    </div>
                    <div className='typography-shadow-container'>
                        <CssCustomTextShadowInput />
                    </div>
                </div>
            </div>
        </div>
    )
}

export default MoreTypographyInputArea
