'use client'
import * as React from 'react';
import { useDispatch, useSelector } from '@/store/builderHooks';
import useUpdateStyle from '@/components/blocks-development-tools/block-settings/hooks/update-hooks/useUpdateStyle';
import useInitialCssValue from '@/components/blocks-development-tools/block-settings/hooks/get-hooks/useInitialCssValue';
import PopoverRight from '@/components/blocks-development-tools/block-settings/custom-dropdown-select/PopoverRight';
import "./CssCustomOverflowInput.css"
const CssCustomOverflowInput = ({ cssKeyType = "overflow" }: { cssKeyType?: string }) => {
    // other display Css dropdown open
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
            <PopoverRight
                className={`overflow-setting-label  ${!settingProperty ? "css-key-not-exist-in-style" : settingPropertyInherited ? "css-key-value-inherited-from-default-in-style" : "css-key-value-exist-in-style"}`}
                label={<span>Overflow</span>}
            >
                <div className='bg-neutral-200 p-1 text-xs'>
                    <div>
                        <button className='px-1.5 py-0.5' onClick={() => handleUpdateCustomValue("")}>Reset</button>
                    </div>
                </div>
            </PopoverRight>
            <div className='setting-items-box-1-4'>
                <div className='w-full h-[22px] relative'>
                    <div className='text-align-custom-css-input-container overflow-hidden h-[22px] text-xs'>
                        <div className='setting-input-tab-area'>
                            <div className={`${settingProperty === 'visible' ? 'setting-input-active-tab' : 'setting-input-inactive-tab'}`}>
                                <button className='w-full h-full flex justify-center items-center'
                                    onClick={() => handleUpdateCustomValue("visible")}
                                >
                                    <svg
                                        data-wf-icon="ShowIcon"
                                        width={16}
                                        height={16}
                                        viewBox="0 0 16 16"
                                        fill="none"
                                        xmlns="http://www.w3.org/2000/svg"
                                    >
                                        <path
                                            d="M8 9.5C8.82843 9.5 9.5 8.82843 9.5 8C9.5 7.17157 8.82843 6.5 8 6.5C7.17157 6.5 6.5 7.17157 6.5 8C6.5 8.82843 7.17157 9.5 8 9.5Z"
                                            fill="currentColor"
                                        />
                                        <path
                                            fillRule="evenodd"
                                            clipRule="evenodd"
                                            d="M8.00004 4C5.37598 4 3.11613 5.55492 2.08964 7.79148C2.02887 7.92388 2.02888 8.07621 2.08965 8.20861C3.11615 10.4451 5.37597 12 8.00001 12C10.6241 12 12.8839 10.4451 13.9104 8.20852C13.9712 8.07612 13.9712 7.92379 13.9104 7.79139C12.8839 5.55488 10.6241 4 8.00004 4ZM8.00001 11C5.86346 11 4.01048 9.78173 3.09961 8.00004C4.01047 6.21831 5.86347 5 8.00004 5C10.1366 5 11.9896 6.21827 12.9004 7.99996C11.9896 9.78169 10.1366 11 8.00001 11Z"
                                            fill="currentColor"
                                        />
                                    </svg>
                                </button>
                            </div>
                            <div className={`${settingProperty === 'hidden' ? 'setting-input-active-tab' : 'setting-input-inactive-tab'}`}>
                                <button className='w-full h-full flex justify-center items-center'
                                    onClick={() => handleUpdateCustomValue("hidden")}
                                >
                                    <svg
                                        data-wf-icon="HideIcon"
                                        width={16}
                                        height={16}
                                        viewBox="0 0 16 16"
                                        fill="none"
                                        xmlns="http://www.w3.org/2000/svg"
                                    >
                                        <path
                                            fillRule="evenodd"
                                            clipRule="evenodd"
                                            d="M10.705 11.4122L13.6465 14.3536L14.3536 13.6465L2.35359 1.64648L1.64648 2.35359L4.38813 5.09524C3.39358 5.76124 2.59323 6.69436 2.08968 7.79152C2.02891 7.92392 2.02891 8.07624 2.08968 8.20865C3.11619 10.4452 5.37601 12 8.00004 12C8.96543 12 9.88153 11.7896 10.705 11.4122ZM9.94077 10.6479L5.11155 5.81865C4.25768 6.3466 3.55891 7.10172 3.09965 8.00007C4.01052 9.78177 5.8635 11 8.00004 11C8.68311 11 9.33719 10.8755 9.94077 10.6479Z"
                                            fill="currentColor"
                                        />
                                        <path
                                            d="M13.9104 8.20856C13.5777 8.93353 13.1154 9.58688 12.5531 10.1389L11.8461 9.43184C12.2703 9.01685 12.6276 8.5337 12.9005 8C11.9896 6.21831 10.1366 5.00004 8.00008 5.00004C7.81177 5.00004 7.62565 5.0095 7.4422 5.02798L6.5717 4.15749C7.0313 4.05443 7.50932 4.00004 8.00008 4.00004C10.6241 4.00004 12.8839 5.55491 13.9104 7.79143C13.9712 7.92383 13.9712 8.07616 13.9104 8.20856Z"
                                            fill="currentColor"
                                        />
                                    </svg>
                                </button>
                            </div>
                            <div className={`${settingProperty === 'clip' ? 'setting-input-active-tab' : 'setting-input-inactive-tab'}`}>
                                <button className='w-full h-full flex justify-center items-center'
                                    onClick={() => handleUpdateCustomValue("clip")}
                                >
                                    <svg
                                        data-wf-icon="CropIcon"
                                        width={16}
                                        height={16}
                                        viewBox="0 0 16 16"
                                        fill="none"
                                        xmlns="http://www.w3.org/2000/svg"
                                    >
                                        <path
                                            fillRule="evenodd"
                                            clipRule="evenodd"
                                            d="M12 12C12.5523 12 13 11.5523 13 11V5H15.5V4H13V1.5H12V4H5C4.44772 4 4 4.44772 4 5V11H1.5V12H4V14.5H5V12H12ZM5 11H12V5H5V11Z"
                                            fill="currentColor"
                                        />
                                    </svg>
                                </button>
                            </div>
                            <div className={`${settingProperty === 'scroll' ? 'setting-input-active-tab' : 'setting-input-inactive-tab'}`}>
                                <button className='w-full h-full flex justify-center items-center'
                                    onClick={() => handleUpdateCustomValue("scroll")}
                                >
                                    <svg
                                        data-wf-icon="OverflowScrollIcon"
                                        width={16}
                                        height={16}
                                        viewBox="0 0 16 16"
                                        fill="none"
                                        xmlns="http://www.w3.org/2000/svg"
                                    >
                                        <path
                                            opacity="0.4"
                                            d="M3 3H8V11H3V3Z"
                                            fill="currentColor"
                                            fillOpacity="0.67"
                                        />
                                        <path d="M1 2H15V3L1 3V2Z" fill="currentColor" fillOpacity="0.67" />
                                        <path d="M1 11H8V12H1V11Z" fill="currentColor" fillOpacity="0.67" />
                                        <path
                                            d="M12 11.2929L10.3536 9.64645L9.64645 10.3536L12.5 13.2071L15.3536 10.3536L14.6464 9.64645L13 11.2929V5H12V11.2929Z"
                                            fill="currentColor"
                                            fillOpacity="0.67"
                                        />
                                    </svg>
                                </button>
                            </div>
                            <div className={`${settingProperty === 'auto' ? 'setting-input-active-tab' : 'setting-input-inactive-tab'}`}>
                                <button className='w-full h-full flex justify-center items-center'
                                    onClick={() => handleUpdateCustomValue("auto")}
                                >
                                    Auto
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </React.Fragment>
    )
}

export default CssCustomOverflowInput