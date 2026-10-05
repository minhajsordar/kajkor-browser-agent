'use client'
import * as React from 'react';
import { useDispatch, useSelector } from '@/store/builderHooks';
import useUpdateStyle from '@/components/blocks-development-tools/block-settings/hooks/update-hooks/useUpdateStyle';
import useInitialCssValue from '@/components/blocks-development-tools/block-settings/hooks/get-hooks/useInitialCssValue';
import PopoverRight from '@/components/blocks-development-tools/block-settings/custom-dropdown-select/PopoverRight';
import "./CssCustomTextStyleInput.css"
const CssCustomTextStyleInput = ({ cssKeyType = "" }: { cssKeyType?: string }) => {
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
            <div className='setting-items-box-1-2'>
                <div className='w-full h-[22px] relative'>
                    <div className='text-align-custom-css-input-container overflow-hidden h-[22px] text-xs'>
                        <div className='setting-input-tab-area'>
                            <div className={`${settingProperty === 'normal' ? 'setting-input-active-tab' : 'setting-input-inactive-tab'}`}>
                                <button className='w-full h-full flex justify-center items-center'
                                    onClick={() => handleUpdateCustomValue("normal")}
                                >
                                    <svg
                                        data-wf-icon="FontStyleNoneIcon"
                                        width={16}
                                        height={16}
                                        viewBox="0 0 16 16"
                                        fill="none"
                                        xmlns="http://www.w3.org/2000/svg"
                                    >
                                        <path
                                            fillRule="evenodd"
                                            clipRule="evenodd"
                                            d="M8 4H6.5V3H8.5H10.5V4H9V12H10.5V13H8.5H6.5V12H8V4Z"
                                            fill="currentColor"
                                        />
                                    </svg>

                                </button>
                            </div>
                            <div className={`${settingProperty === 'italic' ? 'setting-input-active-tab' : 'setting-input-inactive-tab'}`}>
                                <button className='w-full h-full flex justify-center items-center'
                                    onClick={() => handleUpdateCustomValue("italic")}
                                >
                                    <svg
                                        data-wf-icon="FontStyleItalicIcon"
                                        width={16}
                                        height={16}
                                        viewBox="0 0 16 16"
                                        fill="none"
                                        xmlns="http://www.w3.org/2000/svg"
                                    >
                                        <path
                                            fillRule="evenodd"
                                            clipRule="evenodd"
                                            d="M8.80629 4H7V3H9.5H12V4H9.86038L7.19371 12H9V13H6.5H4V12H6.13962L8.80629 4Z"
                                            fill="currentColor"
                                        />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <PopoverRight
                className={`setting-items-name-text-style  ${!settingProperty ? "css-key-not-exist-in-style" : settingPropertyInherited ? "css-key-value-inherited-from-default-in-style" : "css-key-value-exist-in-style"}`}
                label={<span>Style</span>}
            >
                <div className='bg-neutral-200 p-1 text-xs'>
                    <div>
                        <button className='px-1.5 py-0.5' onClick={() => handleUpdateCustomValue("")}>Reset</button>
                    </div>
                </div>
            </PopoverRight>
        </React.Fragment>
    )
}

export default CssCustomTextStyleInput