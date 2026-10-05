'use client'
import * as React from 'react';
import { useDispatch, useSelector } from '@/store/builderHooks';
import useUpdateStyle from '@/components/blocks-development-tools/block-settings/hooks/update-hooks/useUpdateStyle';
import useInitialCssValue from '@/components/blocks-development-tools/block-settings/hooks/get-hooks/useInitialCssValue';
import PopoverRight from '@/components/blocks-development-tools/block-settings/custom-dropdown-select/PopoverRight';
import "./FlexDirectionSetting.css"
const FlexDirectionSetting = ({ cssKeyType = "flex-direction" }: { cssKeyType?: string }) => {
    // other display Css dropdown open
    const otherFlexDirectionKey: any = {
        "row": "Row",
        "row-reverse": "Row Reverse",
        "column": "Column",
        "column-reverse": "Column Reverse",
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

            <PopoverRight
                className={`flex-setting-label  ${!settingProperty ? "css-key-not-exist-in-style" : settingPropertyInherited ? "css-key-value-inherited-from-default-in-style" : "css-key-value-exist-in-style"}`}
                label={<span>Direction</span>}
            >
                <div className=' p-1 text-xs'>
                    <div>
                        <button className='text-xs p-0.5 custom-number-input-action-btn text-neutral-700 rounded-sm' onClick={() => handleUpdateCustomValue("")}>Reset</button>
                    </div>
                </div>
            </PopoverRight>
            <div className='relative'>
                <div className='flex-setting-buttons-area'>
                    <div className='setting-input-tab-area'>
                        <div className={`direction-horizontal-input-button ${settingProperty == "row" ? 'setting-input-active-tab' : 'setting-input-inactive-tab'}`}>
                            <button className='direction-horizontal-input-button-inner'
                                onClick={() => handleUpdateCustomValue("row")}
                            >
                                <svg
                                    width={16}
                                    height={16}
                                    viewBox="0 0 16 16"
                                    fill="none"
                                    xmlns="http://www.w3.org/2000/svg"
                                >
                                    <path
                                        d="M12.2929 7.00004L9.14645 3.85359L9.85355 3.14648L14.2071 7.50004L9.85355 11.8536L9.14645 11.1465L12.2929 8.00004H3V7.00004H12.2929Z"
                                        fill="currentColor"
                                    />
                                </svg>
                            </button>
                        </div>
                        <div className={`direction-vertical-input-button ${settingProperty == "column" ? 'setting-input-active-tab' : 'setting-input-inactive-tab'}`}>
                            <button className='direction-vertical-input-button-inner'
                                onClick={() => handleUpdateCustomValue("column")}
                            >
                                <svg
                                    width={16}
                                    height={16}
                                    viewBox="0 0 16 16"
                                    fill="none"
                                    xmlns="http://www.w3.org/2000/svg"
                                >
                                    <path
                                        d="M8.00001 12.2929L4.85356 9.14645L4.14645 9.85355L8.50001 14.2071L12.8536 9.85355L12.1465 9.14645L9.00001 12.2929L9.00001 3H8.00001L8.00001 12.2929Z"
                                        fill="currentColor"
                                    />
                                </svg>
                            </button>
                        </div>
                        <div className={`direction-horizontal-reverse-input-button ${settingProperty == "row-reverse" ? 'setting-input-active-tab' : 'setting-input-inactive-tab'}`}>
                            <button className='direction-horizontal-reverse-input-button-inner'
                                onClick={() => handleUpdateCustomValue("row-reverse")}
                            >
                                <svg
                                    width={16}
                                    height={16}
                                    viewBox="0 0 16 16"
                                    fill="none"
                                    xmlns="http://www.w3.org/2000/svg"
                                    style={{ transform: "rotate(180deg)" }}
                                >
                                    <path
                                        d="M12.2929 7.00004L9.14645 3.85359L9.85355 3.14648L14.2071 7.50004L9.85355 11.8536L9.14645 11.1465L12.2929 8.00004H3V7.00004H12.2929Z"
                                        fill="currentColor"
                                    />
                                </svg>
                            </button>
                        </div>
                        <div className={`direction-vertical-reverse-input-button ${settingProperty == "column-reverse" ? 'setting-input-active-tab' : 'setting-input-inactive-tab'}`}>
                            <button className='direction-vertical-reverse-input-button-inner'
                                onClick={() => handleUpdateCustomValue("column-reverse")}
                            >
                                <svg
                                    width={16}
                                    height={16}
                                    viewBox="0 0 16 16"
                                    fill="none"
                                    xmlns="http://www.w3.org/2000/svg"
                                    style={{ transform: "rotate(180deg)" }}
                                >
                                    <path
                                        d="M8.00001 12.2929L4.85356 9.14645L4.14645 9.85355L8.50001 14.2071L12.8536 9.85355L12.1465 9.14645L9.00001 12.2929L9.00001 3H8.00001L8.00001 12.2929Z"
                                        fill="currentColor"
                                    />
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
                <PopoverRight
                    className={`other-display-option-dropdown-button  ${!settingProperty ? "css-key-not-exist-in-style" : settingPropertyInherited ? "css-key-value-inherited-from-default-in-style" : "css-key-value-exist-in-style"}`}
                    label={
                        <span className='dropdown-inner'>
                            <svg
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
                            {Object.keys(otherFlexDirectionKey).map((key: string, index: number) => (
                                <button className='text-xs p-0.5 custom-number-input-action-btn text-neutral-700 rounded-sm' onClick={() => handleUpdateCustomValue(key)} key={key}>{otherFlexDirectionKey[key]}</button>
                            ))}
                        </div>
                    </div>
                </PopoverRight>
            </div>
        </React.Fragment>
    )
}

export default FlexDirectionSetting