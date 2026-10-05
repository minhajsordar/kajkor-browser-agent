'use client'
import * as React from 'react';
import { useDispatch, useSelector } from '@/store/builderHooks';
import useUpdateStyle from '@/components/blocks-development-tools/block-settings/hooks/update-hooks/useUpdateStyle';
import useInitialCssValue from '@/components/blocks-development-tools/block-settings/hooks/get-hooks/useInitialCssValue';
import PopoverRight from '@/components/blocks-development-tools/block-settings/custom-dropdown-select/PopoverRight';
import "./CssCustomTextDirectionInput.css"
const CssCustomTextDirectionInput = ({ cssKeyType = "direction" }: { cssKeyType?: string }) => {
    // other display Css dropdown open
    const [settingProperty, setsettingProperty] = React.useState<string>('');
    const [settingPropertyInherited, setsettingPropertyInherited] = React.useState<boolean>(false);
    const dispatch = useDispatch()
    const pageBuilder = useSelector((state: any) => state.pageBuilder);
    const { selectedUid, insertIntoUid } = pageBuilder;
    const pageContent = useSelector((state: any) => state.pageContent);
    const {   draftPageContentSet } = pageContent;

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
            <div className=''>
                <div className='w-full h-[22px] relative'>
                    <div className='text-align-custom-css-input-container overflow-hidden h-[22px] text-xs'>
                        <div className={` hover:bg-neutral-300 ${settingProperty === 'ltr' && 'bg-neutral-300'}`}>
                            <button className='w-full h-full flex justify-center items-center'
                                onClick={() => handleUpdateCustomValue("ltr")}
                            >
                                <svg
                                    data-wf-icon="ParagraphDirectionLTRIcon"
                                    width={16}
                                    height={16}
                                    viewBox="0 0 16 16"
                                    fill="none"
                                    xmlns="http://www.w3.org/2000/svg"
                                >
                                    <path
                                        fillRule="evenodd"
                                        clipRule="evenodd"
                                        d="M5 12L12.3111 12L10.6484 10.3555L11.3516 9.64453L13.8516 12.1172L14.2071 12.4688L13.8555 12.8243L11.3555 15.3516L10.6445 14.6484L12.2751 13L5 13L5 12Z"
                                        fill="currentColor"
                                    />
                                    <path
                                        opacity="0.6"
                                        fillRule="evenodd"
                                        clipRule="evenodd"
                                        d="M4.23463 2.15224C4.47728 2.05173 4.73736 2 5 2L5 4L5 6C4.73736 6 4.47728 5.94827 4.23463 5.84776C3.99198 5.74725 3.7715 5.59993 3.58579 5.41421C3.40007 5.2285 3.25275 5.00802 3.15224 4.76537C3.05173 4.52272 3 4.26264 3 4C3 3.73736 3.05173 3.47728 3.15224 3.23463C3.25275 2.99198 3.40007 2.7715 3.58579 2.58579C3.7715 2.40007 3.99198 2.25275 4.23463 2.15224ZM5 6L5 2.5V2H5.5H8.5H11V3H9V10H8V3H6V10H5L5 6Z"
                                        fill="currentColor"
                                    />
                                </svg>
                            </button>
                        </div>
                        <div className={` hover:bg-neutral-300 ${settingProperty === 'rtl' && 'bg-neutral-300'}`}>
                            <button className='w-full h-full flex justify-center items-center'
                                onClick={() => handleUpdateCustomValue("rtl")}
                            >
                                <svg
                                    data-wf-icon="ParagraphDirectionTRLIcon"
                                    width={16}
                                    height={16}
                                    viewBox="0 0 16 16"
                                    fill="none"
                                    xmlns="http://www.w3.org/2000/svg"
                                >
                                    <path
                                        fillRule="evenodd"
                                        clipRule="evenodd"
                                        d="M11.0001 12L3.689 12L5.35169 10.3555L4.64848 9.64453L2.14848 12.1172L1.79297 12.4688L2.14461 12.8243L4.64462 15.3516L5.35556 14.6484L3.72502 13L11.0001 13V12Z"
                                        fill="currentColor"
                                    />
                                    <path
                                        opacity="0.6"
                                        fillRule="evenodd"
                                        clipRule="evenodd"
                                        d="M6.23463 2.15224C6.47728 2.05173 6.73736 2 7 2L7 4L7 6C6.73736 6 6.47728 5.94827 6.23463 5.84776C5.99198 5.74725 5.7715 5.59993 5.58579 5.41421C5.40007 5.2285 5.25275 5.00802 5.15224 4.76537C5.05173 4.52272 5 4.26264 5 4C5 3.73736 5.05173 3.47728 5.15224 3.23463C5.25275 2.99198 5.40007 2.7715 5.58579 2.58579C5.7715 2.40007 5.99198 2.25275 6.23463 2.15224ZM7 6L7 2.5V2H7.5H10.5H13V3H11V10H10V3H8V10H7L7 6Z"
                                        fill="currentColor"
                                    />
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            <PopoverRight
                className={`text-direction-setting-title ${!settingProperty ? "css-key-not-exist-in-style" : settingPropertyInherited ? "css-key-value-inherited-from-default-in-style" : "css-key-value-exist-in-style"}`}
                label={<span>Direction</span>}
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

export default CssCustomTextDirectionInput