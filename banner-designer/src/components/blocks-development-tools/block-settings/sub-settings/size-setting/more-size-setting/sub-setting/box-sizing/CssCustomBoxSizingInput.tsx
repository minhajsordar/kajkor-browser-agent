'use client'
import * as React from 'react';
import { useDispatch, useSelector } from '@/store/builderHooks';
import useUpdateStyle from '@/components/blocks-development-tools/block-settings/hooks/update-hooks/useUpdateStyle';
import useInitialCssValue from '@/components/blocks-development-tools/block-settings/hooks/get-hooks/useInitialCssValue';
import PopoverRight from '@/components/blocks-development-tools/block-settings/custom-dropdown-select/PopoverRight';
import "./CssCustomBoxSizingInput.css"
const CssCustomBoxSizingInput = ({ cssKeyType = "box-sizing" }: { cssKeyType?: string }) => {
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
            <PopoverRight
                className={`box-sizing-setting-label  ${!settingProperty ? "css-key-not-exist-in-style" : settingPropertyInherited ? "css-key-value-inherited-from-default-in-style" : "css-key-value-exist-in-style"}`}
                label={<span>Box Sizing</span>}
            >
                <div className='bg-neutral-200 p-1 text-xs'>
                    <div>
                        <button className='px-1.5 py-0.5' onClick={() => handleUpdateCustomValue("")}>Reset</button>
                    </div>
                </div>
            </PopoverRight>
            <div className='setting-items-box-1-4'>
                <div className='w-full h-[22px] relative'>
                    <div className='box-sizing-custom-css-input-container overflow-hidden h-[22px] text-xs'>
                        <div className='setting-input-tab-area'>
                        <div className={`${settingProperty === 'border-box'  ? 'setting-input-active-tab' : 'setting-input-inactive-tab'}`}>
                            <button className='w-full h-full flex justify-center items-center'
                                onClick={() => handleUpdateCustomValue("border-box")}
                            >
                                <svg
                                    data-wf-icon="BorderBoxIcon"
                                    width={16}
                                    height={16}
                                    viewBox="0 0 16 16"
                                    fill="none"
                                    xmlns="http://www.w3.org/2000/svg"
                                >
                                    <path
                                        fillRule="evenodd"
                                        clipRule="evenodd"
                                        d="M12 6H4V10H12V6ZM4 5C3.44772 5 3 5.44772 3 6V10C3 10.5523 3.44772 11 4 11H12C12.5523 11 13 10.5523 13 10V6C13 5.44772 12.5523 5 12 5H4Z"
                                        fill="currentColor"
                                    />
                                    <path
                                        opacity="0.4"
                                        fillRule="evenodd"
                                        clipRule="evenodd"
                                        d="M12 3H4V13H12V3ZM4 2C3.44772 2 3 2.44772 3 3V13C3 13.5523 3.44772 14 4 14H12C12.5523 14 13 13.5523 13 13V3C13 2.44772 12.5523 2 12 2H4Z"
                                        fill="currentColor"
                                    />
                                </svg>
                            </button>
                        </div>
                        <div className={`${settingProperty === 'content-box'  ? 'setting-input-active-tab' : 'setting-input-inactive-tab'}`}>
                            <button className='w-full h-full flex justify-center items-center'
                                onClick={() => handleUpdateCustomValue("content-box")}
                            >
                                <svg
                                    data-wf-icon="ContentBoxIcon"
                                    width={16}
                                    height={16}
                                    viewBox="0 0 16 16"
                                    fill="none"
                                    xmlns="http://www.w3.org/2000/svg"
                                >
                                    <path
                                        fillRule="evenodd"
                                        clipRule="evenodd"
                                        d="M13 6H3L3 10H13V6ZM3 5C2.44772 5 2 5.44772 2 6V10C2 10.5523 2.44772 11 3 11H13C13.5523 11 14 10.5523 14 10V6C14 5.44772 13.5523 5 13 5H3Z"
                                        fill="currentColor"
                                    />
                                    <path
                                        opacity="0.4"
                                        fillRule="evenodd"
                                        clipRule="evenodd"
                                        d="M10 3H3L3 13H10V3ZM3 2C2.44772 2 2 2.44772 2 3V13C2 13.5523 2.44772 14 3 14H10C10.5523 14 11 13.5523 11 13V3C11 2.44772 10.5523 2 10 2H3Z"
                                        fill="currentColor"
                                    />
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

export default CssCustomBoxSizingInput