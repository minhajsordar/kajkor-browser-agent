"use client"
import React from 'react'
import "./MoreSizeSettingArea.css"
import CssCustomRatioInput from '@/components/blocks-development-tools/block-settings/sub-settings/size-setting/more-size-setting/sub-setting/CssCustomRatioInput'
import CssCustomBoxSizingInput from '@/components/blocks-development-tools/block-settings/sub-settings/size-setting/more-size-setting/sub-setting/box-sizing/CssCustomBoxSizingInput'
import CssCustomObjectFitInput from '@/components/blocks-development-tools/block-settings/sub-settings/size-setting/more-size-setting/sub-setting/object-fit/CssCustomObjectFitInput'
const MoreSizeSettingArea = () => {
    return (
        <div className='more-size-setting-area'>
            <div className='more-size-setting-container'>
                <div className='more-size-setting-dropdown-action-button'>
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
                    <div className='more-size-setting-dropdown-button-title'>
                        <span>More size options</span>
                    </div>
                </div>
                <div>
                    <div className='more-size-setting-input-container'>
                        <CssCustomRatioInput />
                        <CssCustomBoxSizingInput />
                        <CssCustomObjectFitInput />
                    </div>
                </div>
            </div>
        </div>
    )
}

export default MoreSizeSettingArea
