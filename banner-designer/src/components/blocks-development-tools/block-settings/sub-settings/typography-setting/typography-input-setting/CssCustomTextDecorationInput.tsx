'use client'
import * as React from 'react';
import { useDispatch, useSelector } from '@/store/builderHooks';
import useUpdateStyle from '@/components/blocks-development-tools/block-settings/hooks/update-hooks/useUpdateStyle';
import useInitialCssValue from '@/components/blocks-development-tools/block-settings/hooks/get-hooks/useInitialCssValue';
import PopoverRight from '@/components/blocks-development-tools/block-settings/custom-dropdown-select/PopoverRight';
import "./CssCustomTextDecorationInput.css"
const CssCustomTextDecorationInput = ({ cssKeyType = "" }: { cssKeyType?: string }) => {
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
            <div className='setting-items-box-2-4'>
                <div className='w-full h-[22px] relative'>
                    <div className='text-align-custom-css-input-container overflow-hidden h-[22px] text-xs'>
                        <div className=' setting-input-tab-area'>

                            <div className={`${settingProperty === 'none' ? 'setting-input-active-tab' : 'setting-input-inactive-tab'}`}>
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
                            <div className={`${settingProperty === 'underline' ? 'setting-input-active-tab' : 'setting-input-inactive-tab'}`}>
                                <button className='w-full h-full flex justify-center items-center'
                                    onClick={() => handleUpdateCustomValue("underline")}
                                >
                                    <svg
                                        data-wf-icon="TextDecorationStrikeIcon"
                                        width={16}
                                        height={16}
                                        viewBox="0 0 16 16"
                                        fill="none"
                                        xmlns="http://www.w3.org/2000/svg"
                                    >
                                        <path
                                            fillRule="evenodd"
                                            clipRule="evenodd"
                                            d="M8 5H5V4H8.5H12V5H9V7H14V8H9H8H3V7H8V5ZM8 12V9H9V12H8Z"
                                            fill="currentColor"
                                        />
                                    </svg>
                                </button>
                            </div>
                            <div className={`${settingProperty === 'line-through' ? 'setting-input-active-tab' : 'setting-input-inactive-tab'}`}>
                                <button className='w-full h-full flex justify-center items-center'
                                    onClick={() => handleUpdateCustomValue("line-through")}
                                >
                                    <svg
                                        data-wf-icon="TextDecorationUnderlineIcon"
                                        width={16}
                                        height={16}
                                        viewBox="0 0 16 16"
                                        fill="none"
                                        xmlns="http://www.w3.org/2000/svg"
                                    >
                                        <path d="M5 4.5H8.5M12 4.5H8.5M8.5 4.5V12" stroke="currentColor" />
                                        <path d="M3 14.5H14" stroke="currentColor" />
                                    </svg>
                                </button>
                            </div>
                            <div className={`${settingProperty === 'overline' ? 'setting-input-active-tab' : 'setting-input-inactive-tab'}`}>
                                <button className='w-full h-full flex justify-center items-center'
                                    onClick={() => handleUpdateCustomValue("overline")}
                                >
                                    <svg
                                        data-wf-icon="TextDecorationOverlineIcon"
                                        width={16}
                                        height={16}
                                        viewBox="0 0 16 16"
                                        fill="none"
                                        xmlns="http://www.w3.org/2000/svg"
                                    >
                                        <path
                                            fillRule="evenodd"
                                            clipRule="evenodd"
                                            d="M3 1V2H14V1H3ZM5 5H8V12H9V5H12V4H8.5H5V5Z"
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
                className={`setting-items-name-text-decoration  ${!settingProperty ? "css-key-not-exist-in-style" : settingPropertyInherited ? "css-key-value-inherited-from-default-in-style" : "css-key-value-exist-in-style"}`}
                label={<span>Decoration</span>}
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

export default CssCustomTextDecorationInput