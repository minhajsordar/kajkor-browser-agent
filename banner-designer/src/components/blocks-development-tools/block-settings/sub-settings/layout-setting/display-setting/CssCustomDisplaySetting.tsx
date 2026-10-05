'use client'
import * as React from 'react';
import { useDispatch, useSelector } from '@/store/builderHooks';
import useUpdateStyle from '@/components/blocks-development-tools/block-settings/hooks/update-hooks/useUpdateStyle';
import useInitialCssValue from '@/components/blocks-development-tools/block-settings/hooks/get-hooks/useInitialCssValue';
import PopoverRight from '@/components/blocks-development-tools/block-settings/custom-dropdown-select/PopoverRight';

import "./CssCustomDisplaySetting.css"
import FlexDirectionSetting from '@/components/blocks-development-tools/block-settings/sub-settings/layout-setting/display-setting/flex-setting/flex-direction/FlexDirectionSetting';
import FlexAlignmentSetting from './flex-setting/flex-alignment/FlexAlignmentSetting';
const CssCustomDisplaySetting = ({ cssKeyType = "display" }: { cssKeyType?: string }) => {
    // other display Css dropdown open
    const otherDisplayKeys: any = {
        "inline-flex": "Inline Flex",
        "inline-block": "Inline Block",
        "inline-grid": "Inline Grid",
        "inline": "Inline",
    }
    const [settingProperty, setsettingProperty] = React.useState<string>('');
    const [settingPropertyInherited, setsettingPropertyInherited] = React.useState<boolean>(false);
    const dispatch = useDispatch()
    const pageBuilder = useSelector((state: any) => state.pageBuilder);
    const { selectedUid, insertIntoUid } = pageBuilder;
    const pageContent = useSelector((state: any) => state.pageContent);
    const { draftPageContentSet } = pageContent;

    const updateStyleHook = useUpdateStyle()
    const initialCssValueHook = useInitialCssValue()

    const handleUpdateCustomValue = (value: string) => {
        updateStyleHook.update([{ key: cssKeyType, value: `${value}` }])
    };
    React.useEffect(() => {
        if (selectedUid && cssKeyType) {
            const settingCssContentExist = initialCssValueHook.exist(cssKeyType)
            if (settingCssContentExist) {
                // update display Css
                const { value, inheritedFromDefault } = initialCssValueHook.get(cssKeyType);
                setsettingPropertyInherited(inheritedFromDefault);
                setsettingProperty(value);
            } else {
                setsettingPropertyInherited(false);
                setsettingProperty("");
            }
        }
        // setElementStyle(draftPageContentSet[selectedUid]['style'])
    }, [pageBuilder, draftPageContentSet])

    return (
        <React.Fragment>
            <div className='display-setting-area'>
                <PopoverRight
                    className={`display-setting-label ${!settingProperty ? "css-key-not-exist-in-style" : settingPropertyInherited ? "css-key-value-inherited-from-default-in-style" : "css-key-value-exist-in-style"}`}
                    label={<span>Display</span>}
                >
                    <div className='bg-neutral-200 p-1 text-xs'>
                        <div>
                            <button className='px-1.5 py-0.5' onClick={() => handleUpdateCustomValue("")}>Reset</button>
                        </div>
                    </div>
                </PopoverRight>
                <div className='relative'>
                    <div className=''>
                        <div className='setting-input-tab-area'>
                            <div className={`display-css-setting-block-input-button ${settingProperty == "block" ? 'setting-input-active-tab' : 'setting-input-inactive-tab'}`}>
                                <button className='display-css-setting-block-input-button-inner'
                                    onClick={() => handleUpdateCustomValue("block")}
                                >Block</button>
                            </div>
                            <div className={`display-css-setting-flex-input-button ${settingProperty == "flex" ? 'setting-input-active-tab' : 'setting-input-inactive-tab'}`}>
                                <button className='display-css-setting-flex-input-button-inner'
                                    onClick={() => handleUpdateCustomValue("flex")}
                                >Flex</button>
                            </div>
                            <div className={`display-css-setting-grid-input-button ${settingProperty == "grid" ? 'setting-input-active-tab' : 'setting-input-inactive-tab'}`}>
                                <button className='display-css-setting-grid-input-button-inner'
                                    onClick={() => handleUpdateCustomValue("grid")}
                                >Grid</button>
                            </div>
                            <div className={`display-css-setting-none-input-button ${settingProperty == "none" ? 'setting-input-active-tab' : 'setting-input-inactive-tab'}`}>
                                <button className='display-css-setting-none-input-button-inner'
                                    onClick={() => handleUpdateCustomValue("none")}
                                >None</button>
                            </div>
                        </div>
                    </div>
                    <PopoverRight
                        className={`other-display-option-dropdown-button  ${!settingProperty ? "css-key-not-exist-in-style" : settingPropertyInherited ? "css-key-value-inherited-from-default-in-style" : "css-key-value-exist-in-style"}`}
                        label={
                            <span className='dropdown-inner'>
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
                            </span>
                        }
                    >
                        <div className=' p-1'>
                            <div className='flex flex-col gap-0.5'>
                                {Object.keys(otherDisplayKeys).map((key: string, index: number) => (
                                    <button className='text-xs p-0.5 custom-number-input-action-btn text-neutral-700 rounded-sm' onClick={() => handleUpdateCustomValue(key)} key={key}>{otherDisplayKeys[key]}</button>
                                ))}
                            </div>
                        </div>
                    </PopoverRight>
                </div>
            </div>
            {settingProperty === "flex"
                &&
                <div className='display-flex-options-area'>
                    <FlexDirectionSetting />
                    <FlexAlignmentSetting />
                </div>
            }
        </React.Fragment>
    )
}

export default CssCustomDisplaySetting
