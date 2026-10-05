'use client'
import * as React from 'react';
import PopoverRight from '@/components/blocks-development-tools/block-settings/custom-dropdown-select/PopoverRight';
import InputPopoverRight from '@/components/blocks-development-tools/block-settings/custom-dropdown-select/InputPopoverRight';
import "./CssCustomDropdownInput.css"
const optionsSet: any = {
    "px": "PX",
    "%": "%",
    "em": "EM",
    "rem": "REM",
    "ch": "CH",
    "vw": "VW",
    "vh": "VH",
    "svw": "SVW",
    "svh": "SVH",
    "auto": "AUTO",
}
const CssCustomDropdownInput = ({ initialValue,
    update,
    options = optionsSet }:
    {
        initialValue: string,
        update?: any,
        options?: any
    }) => {
    // other display Css dropdown open
    const [settingProperty, setsettingProperty] = React.useState<string>('');
    const [customProperty, setCustomProperty] = React.useState<string>('');
    const [open, setOpen] = React.useState<boolean>(false)
    const [showPopover, setShowPopover] = React.useState<boolean>(false)
    const updateHideShowPopover = () => {
        if (!open) {
            setShowPopover(false)
        }
    }
    const updateOpen = (val: boolean) => {
        setOpen(val)
        setShowPopover(false)
    }
    const handleUpdateCustomValue = (value: string) => {
        if(value !== initialValue){
            update(`${value}`)
        }
    };
    React.useEffect(() => {
        if (initialValue !== undefined && initialValue !== settingProperty) {
            if (open) {
                setsettingProperty("");
                setCustomProperty(initialValue);
            }
            else if(Object.hasOwn(options,initialValue)) {
                setsettingProperty(initialValue);
                setCustomProperty("");
            }
            else {
                setsettingProperty("");
                setCustomProperty(initialValue);
            }
        }
    }, [initialValue, open])

    return (
        <div className='flex items-center' onMouseOver={() => setShowPopover(s => true)} onMouseLeave={updateHideShowPopover}>
            <div className='w-full h-[22px] relative'>
                {showPopover &&
                    <InputPopoverRight
                        open={open} setOpen={updateOpen}
                    >
                        <div className=' p-1'>
                            <button className='custom-dropdown-input-action-btn' onClick={() => handleUpdateCustomValue("")}>Reset</button>
                            <p className='text-xs'>Set Custom Value</p>
                            <input type='text'
                                value={customProperty}
                                onChange={(e) => handleUpdateCustomValue(e.target.value)}
                                className='custom-dropdown-unit-input'
                            />
                        </div>
                    </InputPopoverRight>
                }
                <PopoverRight
                    className='w-full custom-dropdown-input-action-btn'
                    label={<span className=''>
                        {settingProperty? options[settingProperty] : customProperty? customProperty:"-"}
                    </span>}
                >
                    <div className='p-1'>
                        <button className='custom-dropdown-input-action-btn' onClick={() => handleUpdateCustomValue("")}>Reset</button>
                        <div className=' p-1'>
                            <div className='flex flex-col gap-0.5'>
                                {Object.keys(options).map((key: string, index: number) => (
                                    <button className='text-xs p-0.5 custom-dropdown-input-action-btn text-neutral-700 rounded-sm' onClick={() => handleUpdateCustomValue(key)} key={key}>{options[key]}</button>
                                ))}
                            </div>
                        </div>
                    </div>
                </PopoverRight>

            </div>
        </div >
    )
}

export default CssCustomDropdownInput