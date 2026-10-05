'use client'
import * as React from 'react';
import { useDispatch, useSelector } from '@/store/builderHooks';
import useUpdateStyle from '@/components/blocks-development-tools/block-settings/hooks/update-hooks/useUpdateStyle';
import useInitialCssValue from '@/components/blocks-development-tools/block-settings/hooks/get-hooks/useInitialCssValue';
import PopoverRight from '@/components/blocks-development-tools/block-settings/custom-dropdown-select/PopoverRight';
import "./CssCustomTextAlignInput.css"
const CssCustomTextAlignInput = ({ cssKeyType = "" }: { cssKeyType?: string }) => {
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
                className={`setting-items-name  ${!settingProperty ? "css-key-not-exist-in-style" : settingPropertyInherited ? "css-key-value-inherited-from-default-in-style" : "css-key-value-exist-in-style"}`}
                label={<span>Align</span>}
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
                            <div className={`${settingProperty === 'left' ? 'setting-input-active-tab' : 'setting-input-inactive-tab'}`}>
                                <button className='w-full h-full flex justify-center items-center'
                                    onClick={() => handleUpdateCustomValue("left")}
                                >
                                    <svg
                                        data-wf-icon="TextAlignLeftIcon"
                                        width={16}
                                        height={16}
                                        viewBox="0 0 16 16"
                                        fill="none"
                                        xmlns="http://www.w3.org/2000/svg"
                                    >
                                        <path
                                            fillRule="evenodd"
                                            clipRule="evenodd"
                                            d="M1 3H15V4H1V3ZM1 7H9V8H1V7ZM11 11H1V12H11V11Z"
                                            fill="currentColor"
                                        />
                                    </svg>
                                </button>
                            </div>
                            <div className={`${settingProperty === 'center' ? 'setting-input-active-tab' : 'setting-input-inactive-tab'}`}>
                                <button className='w-full h-full flex justify-center items-center'
                                    onClick={() => handleUpdateCustomValue("center")}
                                >
                                    <svg
                                        data-wf-icon="TextAlignCenterIcon"
                                        width={16}
                                        height={16}
                                        viewBox="0 0 16 16"
                                        fill="none"
                                        xmlns="http://www.w3.org/2000/svg"
                                    >
                                        <path d="M1 3H15V4H1V3Z" fill="currentColor" />
                                        <path d="M4 7H12V8H4V7Z" fill="currentColor" />
                                        <path d="M13 11H3V12H13V11Z" fill="currentColor" />
                                    </svg>

                                </button>
                            </div>
                            <div className={`${settingProperty === 'right' ? 'setting-input-active-tab' : 'setting-input-inactive-tab'}`}>
                                <button className='w-full h-full flex justify-center items-center'
                                    onClick={() => handleUpdateCustomValue("right")}
                                >
                                    <svg
                                        data-wf-icon="TextAlignRightIcon"
                                        width={16}
                                        height={16}
                                        viewBox="0 0 16 16"
                                        fill="none"
                                        xmlns="http://www.w3.org/2000/svg"
                                    >
                                        <path d="M1 3H15V4H1V3Z" fill="currentColor" />
                                        <path d="M7 7H15V8H7V7Z" fill="currentColor" />
                                        <path d="M15 11H5V12H15V11Z" fill="currentColor" />
                                    </svg>

                                </button>
                            </div>
                            <div className={`${settingProperty === 'justify' ? 'setting-input-active-tab' : 'setting-input-inactive-tab'}`}>
                                <button className='w-full h-full flex justify-center items-center'
                                    onClick={() => handleUpdateCustomValue("justify")}
                                >
                                    <svg
                                        data-wf-icon="TextAlignJustifyIcon"
                                        width={16}
                                        height={16}
                                        viewBox="0 0 16 16"
                                        fill="none"
                                        xmlns="http://www.w3.org/2000/svg"
                                    >
                                        <path d="M1 3H15V4H1V3Z" fill="currentColor" />
                                        <path d="M1 7H15V8H1V7Z" fill="currentColor" />
                                        <path d="M15 11H1V12H15V11Z" fill="currentColor" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </React.Fragment>
    )
}

export default CssCustomTextAlignInput