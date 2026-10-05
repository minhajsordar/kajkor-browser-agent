'use client'
import * as React from 'react';
import { useDispatch, useSelector } from '@/store/builderHooks';
import useUpdateStyle from '@/components/blocks-development-tools/block-settings/hooks/update-hooks/useUpdateStyle';
import useInitialCssValue from '@/components/blocks-development-tools/block-settings/hooks/get-hooks/useInitialCssValue';
import PopoverRight from '@/components/blocks-development-tools/block-settings/custom-dropdown-select/PopoverRight';
import "./CssCustomTextTransformInput.css"
const CssCustomTextTransformInput = ({ cssKeyType = "text-transform" }: { cssKeyType?: string }) => {
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
                        <div className={` hover:bg-neutral-300 ${settingProperty === 'none' && 'bg-neutral-300'}`}>
                            <button className='w-full h-full flex justify-center items-center'
                                onClick={() => handleUpdateCustomValue("none")}
                            >
                                <svg
                                    data-wf-icon="CloseDefaultIcon"
                                    width={16}
                                    height={16}
                                    viewBox="0 0 16 16"
                                    fill="none"
                                    xmlns="http://www.w3.org/2000/svg"
                                >
                                    <path
                                        fillRule="evenodd"
                                        clipRule="evenodd"
                                        d="M8.70714 8.00004L12.3536 4.35359L11.6465 3.64648L8.00004 7.29293L4.35359 3.64648L3.64648 4.35359L7.29293 8.00004L3.64648 11.6465L4.35359 12.3536L8.00004 8.70714L11.6465 12.3536L12.3536 11.6465L8.70714 8.00004Z"
                                        fill="currentColor"
                                    />
                                </svg>
                            </button>
                        </div>
                        <div className={` hover:bg-neutral-300 ${settingProperty === 'uppercase' && 'bg-neutral-300'}`}>
                            <button className='w-full h-full flex justify-center items-center'
                                onClick={() => handleUpdateCustomValue("uppercase")}
                            >
                                <svg
                                    data-wf-icon="TextTransformCapitalizeIcon"
                                    width={16}
                                    height={16}
                                    viewBox="0 0 16 16"
                                    fill="none"
                                    xmlns="http://www.w3.org/2000/svg"
                                >
                                    <path
                                        fillRule="evenodd"
                                        clipRule="evenodd"
                                        d="M4.12583 4H5.87413L8.00003 11.2279L10.1258 4H11.8741L14.2271 12H13.1848L12.5965 9.99994H9.40354L8.8153 12H7.18477L6.5965 9.99994H3.40354L2.8153 12H1.77295L4.12583 4ZM6.30238 8.99994L5.12587 4.9999H4.8741L3.69765 8.99994H6.30238ZM12.3024 8.99994L11.1259 4.9999H10.8741L9.69765 8.99994H12.3024Z"
                                        fill="currentColor"
                                    />
                                </svg>
                            </button>
                        </div>
                        <div className={` hover:bg-neutral-300 ${settingProperty === 'capitalize' && 'bg-neutral-300'}`}>
                            <button className='w-full h-full flex justify-center items-center'
                                onClick={() => handleUpdateCustomValue("capitalize")}
                            >
                                <svg
                                    data-wf-icon="TextTransformSentenceIcon"
                                    width={16}
                                    height={16}
                                    viewBox="0 0 16 16"
                                    fill="none"
                                    xmlns="http://www.w3.org/2000/svg"
                                >
                                    <path
                                        fillRule="evenodd"
                                        clipRule="evenodd"
                                        d="M4.12583 4H5.87413L8.22713 12H7.18477L6.5965 9.99994H3.40354L2.8153 12H1.77295L4.12583 4ZM6.30238 8.99994L5.12587 4.9999H4.8741L3.69765 8.99994H6.30238Z"
                                        fill="currentColor"
                                    />
                                    <path
                                        fillRule="evenodd"
                                        clipRule="evenodd"
                                        d="M12.5 7H10V6H12.5C13.3284 6 14 6.67157 14 7.5V12H13V11.2909C12.4911 11.7327 11.8268 12 11.1 12H11C9.89543 12 9 11.1046 9 10C9 8.89543 9.89543 8 11 8H13V7.5C13 7.22386 12.7761 7 12.5 7ZM13 9V9.1C13 10.1493 12.1493 11 11.1 11H11C10.4477 11 10 10.5523 10 10C10 9.44772 10.4477 9 11 9H13Z"
                                        fill="currentColor"
                                    />
                                </svg>
                            </button>
                        </div>
                        <div className={` hover:bg-neutral-300 ${settingProperty === 'lowercase' && 'bg-neutral-300'}`}>
                            <button className='w-full h-full flex justify-center items-center'
                                onClick={() => handleUpdateCustomValue("lowercase")}
                            >
                                <svg
                                    data-wf-icon="TextTransformLowercaseIcon"
                                    width={16}
                                    height={16}
                                    viewBox="0 0 16 16"
                                    fill="none"
                                    xmlns="http://www.w3.org/2000/svg"
                                >
                                    <path
                                        fillRule="evenodd"
                                        clipRule="evenodd"
                                        d="M4 7H6.5C6.77614 7 7 7.22386 7 7.5V8H5C3.89543 8 3 8.89543 3 10C3 11.1046 3.89543 12 5 12H5.1C5.82677 12 6.49109 11.7327 7 11.2909V12H8V7.5C8 6.67157 7.32843 6 6.5 6H4V7ZM5 9H7V9.1C7 10.1493 6.14934 11 5.1 11H5C4.44772 11 4 10.5523 4 10C4 9.44772 4.44772 9 5 9Z"
                                        fill="currentColor"
                                    />
                                    <path
                                        fillRule="evenodd"
                                        clipRule="evenodd"
                                        d="M10 7H12.5C12.7761 7 13 7.22386 13 7.5V8H11C9.89543 8 9 8.89543 9 10C9 11.1046 9.89543 12 11 12H11.1C11.8268 12 12.4911 11.7327 13 11.2909V12H14V7.5C14 6.67157 13.3284 6 12.5 6H10V7ZM11 9H13V9.1C13 10.1493 12.1493 11 11.1 11H11C10.4477 11 10 10.5523 10 10C10 9.44772 10.4477 9 11 9Z"
                                        fill="currentColor"
                                    />
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            <PopoverRight
                className={`text-transform-setting-title  ${!settingProperty ? "css-key-not-exist-in-style" : settingPropertyInherited ? "css-key-value-inherited-from-default-in-style" : "css-key-value-exist-in-style"}`}
                label={<span>Capitalize</span>}
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

export default CssCustomTextTransformInput