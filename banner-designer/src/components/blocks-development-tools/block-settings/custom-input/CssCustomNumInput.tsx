'use client'
import * as React from 'react';
import { useDispatch, useSelector } from '@/store/builderHooks';
import useUpdateStyle from '@/components/blocks-development-tools/block-settings/hooks/update-hooks/useUpdateStyle';
import useInitialCssValue from '@/components/blocks-development-tools/block-settings/hooks/get-hooks/useInitialCssValue';
import PopoverRight from '@/components/blocks-development-tools/block-settings/custom-dropdown-select/PopoverRight';
const CssCustomNumInput = ({ cssKeyType = "" }: { cssKeyType?: string }) => {
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
    // other display Css dropdown open
    const [previousValue, setPreviousValue] = React.useState<string>('');
    const [settingUnit, setsettingUnit] = React.useState<string>('');
    const [settingProperty, setsettingProperty] = React.useState<string>('');
    const [customProperty, setCustomProperty] = React.useState<string>('');
    const [settingPropertyInherited, setsettingPropertyInherited] = React.useState<boolean>(false);
    const dispatch = useDispatch()
    const pageBuilder = useSelector((state: any) => state.pageBuilder);
    const { selectedUid, insertIntoUid } = pageBuilder;
    const pageContent = useSelector((state: any) => state.pageContent);
    const { draftPageContentSet } = pageContent;

    const updateStyleHook = useUpdateStyle()
    const initialCssValueHook = useInitialCssValue()
    const acceptOnlyNumberKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
        const { key } = e;
        if (!/^\d+$/.test(key) && key !== 'Backspace' && key !== 'Delete' && key !== 'ArrowLeft' && key !== 'ArrowRight' && key !== 'ArrowUp' && key !== 'ArrowDown' && key !== '-' && key !== '.') {
            e.preventDefault();
        }
    }
    const handlesettingPropertyValueChange = (value: string) => {
        if (value) {
            // cssKeyType for example margin-left
            updateStyleHook.update([{ key: cssKeyType, value: `${value}${settingUnit}` }])
        } else {
            updateStyleHook.update([{ key: cssKeyType, value: null }])
        }
        setsettingProperty(value)
    };
    const handleClicksettingUnitChange = (value: string) => {
        if (value === 'auto') {
            updateStyleHook.update([{ key: cssKeyType, value: `${value}` }])
        }
        else if (value) {
            // cssKeyType for example margin-left
            if (settingProperty) {
                updateStyleHook.update([{ key: cssKeyType, value: `${settingProperty}${value}` }])
            } else {
                updateStyleHook.update([{ key: cssKeyType, value: `${10}${value}` }])
            }
        } else {
            updateStyleHook.update([{ key: cssKeyType, value: null }])
        }
        setsettingUnit(value)
    };
    const handleUpdateCustomValue = (value: string) => {
        updateStyleHook.update([{ key: cssKeyType, value: `${value}` }])
        setCustomProperty(value)
    };
    React.useEffect(() => {
        if (selectedUid && cssKeyType) {
            const settingCssContentExist = initialCssValueHook.exist(cssKeyType)
            if (settingCssContentExist) {
                // update display Css
                const { value, inheritedFromDefault } = initialCssValueHook.get(cssKeyType);
                if (previousValue !== value) {
                    setPreviousValue(value)
                    setsettingPropertyInherited(inheritedFromDefault);
                    const extractedNumber = value.match(/^\d+/);
                    if (extractedNumber) {
                        console.log(value);
                        setsettingProperty(extractedNumber[0]);
                        const unit = value.match(Object.keys(unitsSet).join("|"));
                        // const unit = value.match(/\D+/)[0];
                        console.log("unit ", unit)
                        if (unit && unit.length > 0) {
                            setsettingUnit(unit[0]);
                        }
                        setCustomProperty("")
                    } else if (value === 'auto') {
                        setsettingProperty("");
                        setsettingUnit("auto");
                        setCustomProperty("");
                    } else if (value.length > 0) {
                        setsettingProperty("");
                        setsettingUnit("");
                        setCustomProperty(value);
                    } else {
                        setsettingPropertyInherited(false);
                        setsettingProperty("");
                        setsettingUnit("");
                        setCustomProperty("");
                    }
                }
            } else {
                setsettingPropertyInherited(false);
                setsettingProperty("");
                setsettingUnit("");
                setCustomProperty("");
            }
        }
        // setElementStyle(draftPageContentSet[selectedUid]['style'])
    }, [pageBuilder, draftPageContentSet])

    return (
        <div className='flex flex-wrap gap-1 items-center'>
            <div className='flex justify-between items-center gap-2'>
                {/* <h3 className={`text-xs h-[22px] px-1.5 rounded-sm py-0.5 bg-neutral-200 ${!settingProperty ? "css-key-not-exist-in-style" : settingPropertyInherited ? "css-key-value-inherited-from-default-in-style" : "css-key-value-exist-in-style"}`}>{cssKeyType}</h3> */}
                <div>

                    <div className='w-[60px] h-[22px] relative'>
                        <PopoverRight
                            className='absolute top-1 left-0 translate-x-[-50%] translate-y-[-50%] w-[8px] hover:w-[14px] h-[8px] hover:h-[14px] bg-white border-2 hover:!border-4 !border-blue-500 rounded-full text-xs z-[999] overflow-hidden flex justify-center items-center'
                            label={""}
                        >
                            <div className='bg-neutral-200 p-1'>
                                <p className='text-xs'>Set Custom Value</p>
                                <input type='text'
                                    value={customProperty}
                                    onChange={(e) => handleUpdateCustomValue(e.target.value)}
                                    className='ps-[5px] pr-[25px] py-[3px] w-full bg-gray-400 outline-none rounded-sm text-xs'
                                />
                            </div>
                        </PopoverRight>
                        {customProperty ?
                            <React.Fragment>
                                <PopoverRight
                                    className='absolute top-0 left-0 ps-[5px] pr-[5px] py-[3px] w-full bg-neutral-300 outline-none rounded-sm text-xs overflow-hidden truncate'
                                    label={<span className=''>
                                        {customProperty}
                                    </span>}
                                >
                                    <div className='bg-neutral-200 p-1'>
                                        <p className='text-xs'>Set Custom Value</p>
                                        <input type='text'
                                            value={customProperty}
                                            onChange={(e) => handleUpdateCustomValue(e.target.value)}
                                            className='ps-[5px] pr-[25px] py-[3px] w-full bg-gray-400 outline-none rounded-sm text-xs'
                                        />
                                    </div>
                                </PopoverRight>
                            </React.Fragment> :
                            <React.Fragment>
                                <input type='text'
                                    onKeyDown={acceptOnlyNumberKey}
                                    value={settingProperty}
                                    onChange={(e) => handlesettingPropertyValueChange(e.target.value)}
                                    className='absolute top-0 left-0 ps-[5px] pr-[25px] py-[3px] w-full bg-neutral-300 outline-none rounded-sm text-xs'
                                />

                                <div className='w-[25px] h-[22px] overflow-hidden absolute right-0 top-0'>
                                    <PopoverRight
                                        className='text-xs w-full h-[22px] flex justify-center items-center hover:bg-neutral-200 text-neutral-700 rounded-sm'
                                        label={<span className=''>{settingUnit ? settingUnit : "-"}</span>}
                                    >
                                        <div className='bg-neutral-200 p-1'>
                                            <div className='flex flex-col gap-0.5'>
                                                {Object.keys(unitsSet).map((key: string, index: number) => (
                                                    <button className='text-xs p-0.5 bg-neutral-100 text-neutral-700 rounded-sm' onClick={() => handleClicksettingUnitChange(key)} key={key}>{unitsSet[key]}</button>
                                                ))}
                                            </div>
                                        </div>
                                    </PopoverRight>
                                </div>
                            </React.Fragment>
                        }

                    </div>
                </div>
            </div >
        </div >
    )
}

export default CssCustomNumInput