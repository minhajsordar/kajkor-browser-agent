import React from 'react'
import CssCustomTextStyleInput from '@/components/blocks-development-tools/block-settings/sub-settings/typography-setting/typography-input-setting/CssCustomTextStyleInput';
import CssCustomTextDecorationInput from '@/components/blocks-development-tools/block-settings/sub-settings/typography-setting/typography-input-setting/CssCustomTextDecorationInput';

const TextStyleInputArea = () => {
    return (
        <div className='setting-item-text-style-area'>
            <div className='setting-items-name'>Style</div>
            <CssCustomTextStyleInput cssKeyType='font-style' />
            <CssCustomTextDecorationInput cssKeyType='text-decoration' />
        </div>
    )
}

export default TextStyleInputArea