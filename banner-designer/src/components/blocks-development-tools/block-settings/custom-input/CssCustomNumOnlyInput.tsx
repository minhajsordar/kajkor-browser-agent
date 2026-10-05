'use client'
import * as React from 'react';
import "./CssCustomNumOnlyInput.css"

const CssCustomNumOnlyInput = ({ initialValue,
    update }:
    {
        initialValue: string,
        update?: any,
    }) => {
    // other display Css dropdown open
    const [settingProperty, setsettingProperty] = React.useState<string>('');

    const acceptOnlyNumberKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
        const { key } = e;
        if (!/^\d+$/.test(key) && key !== 'Backspace' && key !== 'Delete' && key !== 'ArrowLeft' && key !== 'ArrowRight' && key !== 'ArrowUp' && key !== 'ArrowDown' && key !== '-' && key !== '.') {
            e.preventDefault();
        }
    }
    const handleUpdateCustomValue = (value: string) => {
        if(value !== initialValue){
            update(`${value}`)
        }
        setsettingProperty(value)
    };
    React.useEffect(() => {
        if (initialValue !== undefined && initialValue !== settingProperty) {
            setsettingProperty(`${initialValue}`);
        }
    }, [initialValue])

    return (
        <div className='flex items-center'>
            <div className='w-full h-[22px] relative'>
                <input type='text'
                    onKeyDown={acceptOnlyNumberKey}
                    value={settingProperty}
                    onChange={(e) => handleUpdateCustomValue(e.target.value)}
                    className='absolute top-0 left-0 custom-number-only-input'
                />
            </div>
        </div >
    )
}

export default CssCustomNumOnlyInput