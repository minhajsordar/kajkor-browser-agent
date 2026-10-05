'use client'
import * as React from 'react';
import PopoverRight from '@/components/blocks-development-tools/block-settings/custom-dropdown-select/PopoverRight';
import InputPopoverRight from '@/components/blocks-development-tools/block-settings/custom-dropdown-select/InputPopoverRight';
import "./CssCustomNumUnitInput.css"
const unitsSet: any = {
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
interface ValueUniteObject {
    value: string,
    unit?: string,
}
const CssCustomNumUnitObjectInput = ({ initialValue,
    update,
    numReplceWithSrignFor = ["auto"],
    units = unitsSet,
    customValue = false,
    acceptCustomValue = true
}:
    {
        initialValue: ValueUniteObject,
        update?: any,
        numReplceWithSrignFor?: string[],
        units?: any,
        customValue?: boolean
        acceptCustomValue?: boolean
    }) => {
    // other display Css dropdown open
    const [previousValue, setPreviousValue] = React.useState<ValueUniteObject | null>(null);
    const [settingUnit, setsettingUnit] = React.useState<string>('');
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
    const acceptOnlyNumberKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
        const { key } = e;
        if (!/^\d+$/.test(key) && key !== 'Backspace' && key !== 'Delete' && key !== 'ArrowLeft' && key !== 'ArrowRight' && key !== 'ArrowUp' && key !== 'ArrowDown' && key !== '-' && key !== '.') {
            e.preventDefault();
        }
        if(key == 'ArrowUp'){
            handlesettingPropertyValueChange(String(Number(settingProperty)+1))
        }
        if(key == 'ArrowDown'){
            handlesettingPropertyValueChange(String(Number(settingProperty)-1))
        }
    }
    const handlesettingPropertyValueChange = (value: string) => {
        if (update) {
            if (value) {
                update({
                    value: `${value}`,
                    unit: `${settingUnit ? settingUnit : Object.keys(units)[0]}`
                })
                // update(`${value}${settingUnit ? settingUnit : Object.keys(units)[0]}`)
            } else {
                update("")
            }
        }
        setsettingProperty(value)
    };
    const handleClicksettingUnitChange = (value: string) => {
        if (numReplceWithSrignFor.includes(`${value}`)) {
            // update(`${value}`)
            if (update) {
                update({
                    value: value,
                    unit: ""
                })
            }
            setsettingUnit("")
            setsettingProperty(value)
        }
        else if (value) {
            if (settingProperty && settingProperty !== "" && settingProperty !== null) {
                if (update) {
                    update({
                        value: settingProperty,
                        unit: value
                    })
                }
                setsettingUnit(value)
            } else {
                if (update) {
                    update({
                        value: "10",
                        unit: value
                    })
                }
                setsettingUnit(value)
            }
        } else {
            if (update) {
                update("")
            }
            setsettingUnit(value)
        }
    };
    const handleUpdateCustomValue = (value: any) => {
        if (update) {
            update({
                value: value,
                unit: "",
                customValue: true
            })
        }
        setCustomProperty(value)
    }
    const handleReset = () => {
        if (update) {
            update("")
        }
        setsettingProperty("");
        setsettingUnit("");
        setCustomProperty("");
    }
    React.useEffect(() => {
        if (initialValue !== undefined && typeof (initialValue) === "object" && (initialValue.value !== previousValue?.value || initialValue.unit !== previousValue?.unit)) {
            setPreviousValue(initialValue)
            // console.log("checking initalvalue", initialValue)
            if (open || customValue) {
                setsettingProperty("");
                setsettingUnit("");
                setCustomProperty(initialValue.value);
            }
            else if (numReplceWithSrignFor.includes(`${initialValue?.unit}`)) {
                setsettingProperty(`${initialValue.value}`);
                setsettingUnit(initialValue?.unit ? initialValue.unit : "");
            } else if (initialValue?.unit || initialValue?.value) {
                setsettingProperty(initialValue.value || "");
                setsettingUnit(initialValue.unit || "");
            } else {
                setsettingProperty("");
                setsettingUnit("");
                setCustomProperty("");
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
                            <button className='custom-number-input-action-btn' onClick={() => handleReset()}>Reset</button>
                            {acceptCustomValue &&
                                <React.Fragment>
                                    <p className='text-xs'>Set Custom Value</p>
                                    <input type='text'
                                        value={customProperty}
                                        onChange={(e) => handleUpdateCustomValue(e.target.value)}
                                        className='custom-number-unit-input'
                                        autoComplete='off'
                                    />
                                </React.Fragment>
                            }
                        </div>
                    </InputPopoverRight>
                }
                {customProperty ?
                    <React.Fragment>
                        <PopoverRight
                            className='absolute top-0 left-0 custom-number-input-action-btn'
                            label={<span className=''>
                                {customProperty}
                            </span>}
                        >
                            <div className='p-1'>
                                <button className='custom-number-input-action-btn' onClick={() => handleReset()}>Reset</button>
                                {acceptCustomValue &&
                                    <React.Fragment>
                                        <p className='text-xs'>Set Custom Value</p>
                                        <input type='text'
                                            value={customProperty}
                                            onChange={(e) => handleUpdateCustomValue(e.target.value)}
                                            className='custom-number-unit-input'
                                            autoComplete='off'
                                        />
                                    </React.Fragment>
                                }
                            </div>
                        </PopoverRight>
                    </React.Fragment> :
                    <React.Fragment>
                        <input type='text'
                            onKeyDown={acceptOnlyNumberKey}
                            value={settingProperty}
                            onChange={(e) => handlesettingPropertyValueChange(e.target.value)}
                            className='absolute top-0 left-0 custom-number-unit-input'
                            autoComplete='off'
                        />

                        <div className='min-w-[22px] h-[22px] overflow-hidden absolute right-0 top-0'>
                            <PopoverRight
                                className='custom-number-input-action-btn'
                                label={<span className=''>{settingUnit ? settingUnit : "-"}</span>}
                            >
                                <div className=' p-1'>
                                    <div className='flex flex-col gap-0.5'>
                                        {Object.keys(units).map((key: string, index: number) => (
                                            <button className='text-xs p-0.5 custom-number-input-action-btn text-neutral-700 rounded-sm' onClick={() => handleClicksettingUnitChange(key)} key={key}>{units[key]}</button>
                                        ))}
                                    </div>
                                </div>
                            </PopoverRight>
                        </div>
                    </React.Fragment>
                }

            </div>
        </div >
    )
}

export default CssCustomNumUnitObjectInput