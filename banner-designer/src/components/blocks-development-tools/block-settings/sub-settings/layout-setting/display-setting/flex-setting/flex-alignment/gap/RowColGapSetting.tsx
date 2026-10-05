'use client'
import * as React from 'react';
import { useDispatch, useSelector } from '@/store/builderHooks';
import useUpdateStyle from '@/components/blocks-development-tools/block-settings/hooks/update-hooks/useUpdateStyle';
import useInitialCssValue from '@/components/blocks-development-tools/block-settings/hooks/get-hooks/useInitialCssValue';
import PopoverRight from '@/components/blocks-development-tools/block-settings/custom-dropdown-select/PopoverRight';
import CssCustomNumUnitInput from '@/components/blocks-development-tools/block-settings/custom-input/CssCustomNumUnitInput';
import "./RowColGapSetting.css"

const RowColGapSetting = ({ cssKeyType = "gap" }: { cssKeyType?: string }) => {
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
    }
    // other display Css dropdown open
    const [isRowColSeperated, setisRowColSeperated] = React.useState<boolean>(false);
    const [settingProperty, setsettingProperty] = React.useState<string>('');
    const [settingRowProperty, setsettingRowProperty] = React.useState<string>('');
    const [settingColProperty, setsettingColProperty] = React.useState<string>('');
    const [settingPropertyInherited, setsettingPropertyInherited] = React.useState<boolean>(false);
    const pageBuilder = useSelector((state: any) => state.pageBuilder);
    const { selectedUid, insertIntoUid } = pageBuilder;
    const pageContent = useSelector((state: any) => state.pageContent);
    const {   draftPageContentSet } = pageContent;

    const updateStyleHook = useUpdateStyle()
    const initialCssValueHook = useInitialCssValue()

    const handleUpdateRowValue = (value: string) => {
        if (isRowColSeperated) {
            updateStyleHook.update([{ key: cssKeyType, value: `${value} ${settingColProperty}` }])
        }
        else {
            updateStyleHook.update([{ key: cssKeyType, value: `${value}` }])
        }
    };
    const handleUpdateColValue = (value: string) => {
        if (isRowColSeperated) {
            updateStyleHook.update([{ key: cssKeyType, value: `${settingRowProperty} ${value}` }])
        }
        else {
            updateStyleHook.update([{ key: cssKeyType, value: `${value}` }])
        }
    };
    const toggleRowColSeperated = () => {
        setisRowColSeperated(s => !s)
    }
    React.useEffect(() => {
        if (selectedUid && cssKeyType) {
            const settingCssContentExist = initialCssValueHook.exist(cssKeyType)
            if (settingCssContentExist) {
                // update display Css
                const { value, inheritedFromDefault } = initialCssValueHook.get(cssKeyType);
                const splitted = value.split(" ")
                if (splitted.length === 2) {
                    setsettingRowProperty(splitted[0])
                    setsettingColProperty(splitted[1])
                } else {
                    setsettingRowProperty(value)
                    setsettingColProperty(value)
                }
                setsettingPropertyInherited(inheritedFromDefault);
                setsettingProperty(value);
            } else {
                setsettingPropertyInherited(false);
                setsettingProperty("");
                setsettingRowProperty("")
                setsettingColProperty("")
            }
        }
        // setElementStyle(draftPageContentSet[selectedUid]['style'])
    }, [pageBuilder, draftPageContentSet])

    return (
        <div className='row-col-gap-setting-area'>
            <div className='row-col-gap-setting-lable-outer'>
                <div className='row-col-gap-setting-lable'>Gap</div>
            </div>
            <div className="row-col-gap-input-area">

                <CssCustomNumUnitInput
                    initialValue={settingRowProperty}
                    units={unitsSet}
                    update={handleUpdateRowValue}
                />
                <CssCustomNumUnitInput
                    initialValue={settingColProperty}
                    units={unitsSet}
                    update={handleUpdateColValue}
                />
                {/* <CssCustomColGapInput />
                <CssCustomRowGapInput /> */}
                <div className='col-label'><span>Col</span></div>
                <div className='row-label'><span>Row</span></div>
                <button className='row-col-action-button'
                    onClick={toggleRowColSeperated}
                >
                    {isRowColSeperated ?
                        <svg
                            data-wf-icon="UnlockIcon"
                            width={16}
                            height={16}
                            viewBox="0 0 16 16"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                        >
                            <path
                                fillRule="evenodd"
                                clipRule="evenodd"
                                d="M9 5C9 3.89543 9.89543 3 11 3C12.1046 3 13 3.89543 13 5V6H14V5C14 3.34315 12.6569 2 11 2C9.34315 2 8 3.34315 8 5V7H3C2.44772 7 2 7.44771 2 8V12C2 12.5523 2.44772 13 3 13H9C9.55228 13 10 12.5523 10 12V8C10 7.44772 9.55228 7 9 7V5ZM3 8H9V12H3V8Z"
                                fill="currentColor"
                            />
                        </svg>
                        :
                        <svg
                            data-wf-icon="LockIcon"
                            width={16}
                            height={16}
                            viewBox="0 0 16 16"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                        >
                            <path
                                fillRule="evenodd"
                                clipRule="evenodd"
                                d="M5 7L5 5C5 3.34315 6.34315 2 8 2C9.65685 2 11 3.34315 11 5V7C11.5523 7 12 7.44772 12 8V12C12 12.5523 11.5523 13 11 13H5C4.44772 13 4 12.5523 4 12V8C4 7.44771 4.44772 7 5 7ZM6 5C6 3.89543 6.89543 3 8 3C9.10457 3 10 3.89543 10 5V7H6V5ZM5 12V8H11V12H5Z"
                                fill="currentColor"
                            />
                        </svg>
                    }
                </button>
            </div>
        </div>
    )
}

export default RowColGapSetting