'use client'
import * as React from 'react';
import { useDispatch, useSelector } from '@/store/builderHooks';
import useUpdateStyle from '@/components/blocks-development-tools/block-settings/hooks/update-hooks/useUpdateStyle';
import useInitialCssValue from '@/components/blocks-development-tools/block-settings/hooks/get-hooks/useInitialCssValue';
import PopoverRight from '@/components/blocks-development-tools/block-settings/custom-dropdown-select/PopoverRight';
import CssCustomDropdownInput from '@/components/blocks-development-tools/block-settings/custom-input/CssCustomDropdownInput';
import "./CssCustomAlignContentInput.css"
const CssCustomAlignContentInput = ({ cssKeyType = "align-content" }: { cssKeyType?: string }) => {
    // other display Css dropdown open
    const registeredFont: any = {
        "flex-start": "Flex Start",
        "center": "Center",
        "flex-end": "Flex End",
        "stretch": "Stretch",
        "space-between": "Space between",
        "space-around": "Space around",
        "space-evenly": "Space evenly",
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
        <div className='more-flex-setting-area'>
            <div className='more-flex-setting-area'>
                <div className='more-row-setting'>
                    <div className='more-row-setting-inner'>
                        <PopoverRight
                            className={`more-row-setting-label ${!settingProperty ? "css-key-not-exist-in-style" : settingPropertyInherited ? "css-key-value-inherited-from-default-in-style" : "css-key-value-exist-in-style"}`}
                            label={<span>Rows</span>}
                        >
                            <div className='bg-neutral-200 p-1 text-xs'>
                                <div>
                                    <button className='px-1.5 py-0.5' onClick={() => handleUpdateCustomValue("")}>Reset</button>
                                </div>
                            </div>
                        </PopoverRight>
                        <div className="row-setting-action-buttons">
                            {/* <CssCustomDropdownInput options={registeredFont} initialValue={settingProperty}
                                update={handleUpdateCustomValue}
                            /> */}
                            <div className='setting-input-tab-area'>
                                <div className={`${settingProperty == "flex-start" ? 'setting-input-active-tab' : 'setting-input-inactive-tab'}`} onClick={() => handleUpdateCustomValue("flex-start")}>
                                    <svg
                                        data-wf-icon="AlignContentStartRowIcon"
                                        width={16}
                                        height={16}
                                        viewBox="0 0 16 16"
                                        fill="none"
                                        xmlns="http://www.w3.org/2000/svg"
                                    >
                                        <path
                                            d="M15 3L11 3V5.5C11 5.77614 10.7761 6 10.5 6H9.5C9.22386 6 9 5.77614 9 5.5V3L8 3L8 5.5C8 5.77614 7.77614 6 7.5 6H6.5C6.22386 6 6 5.77614 6 5.5L6 3L2 3V2H15V3Z"
                                            fill="currentColor"
                                        />
                                        <path
                                            d="M6.5 7C6.22386 7 6 7.22386 6 7.5L6 9.5C6 9.77614 6.22386 10 6.5 10H7.5C7.77614 10 8 9.77614 8 9.5L8 7.5C8 7.22386 7.77614 7 7.5 7H6.5Z"
                                            fill="currentColor"
                                        />
                                        <path
                                            d="M9.5 7C9.22386 7 9 7.22386 9 7.5V9.5C9 9.77614 9.22386 10 9.5 10H10.5C10.7761 10 11 9.77614 11 9.5V7.5C11 7.22386 10.7761 7 10.5 7H9.5Z"
                                            fill="currentColor"
                                        />
                                    </svg>
                                </div>
                                <div className={`${settingProperty == "center" ? 'setting-input-active-tab' : 'setting-input-inactive-tab'}`} onClick={() => handleUpdateCustomValue("center")}>
                                    <svg
                                        data-wf-icon="AlignContentCenterRowIcon"
                                        width={16}
                                        height={16}
                                        viewBox="0 0 16 16"
                                        fill="none"
                                        xmlns="http://www.w3.org/2000/svg"
                                    >
                                        <path
                                            d="M11 7V4.5C11 4.22386 10.7761 4 10.5 4H9.5C9.22386 4 9 4.22386 9 4.5V7L8 7V4.5C8 4.22386 7.77614 4 7.5 4H6.5C6.22386 4 6 4.22386 6 4.5V7L2 7V8L15 8V7H11Z"
                                            fill="currentColor"
                                        />
                                        <path
                                            d="M11 9V11.5C11 11.7761 10.7761 12 10.5 12H9.5C9.22386 12 9 11.7761 9 11.5V9H11Z"
                                            fill="currentColor"
                                        />
                                        <path
                                            d="M8 9V11.5C8 11.7761 7.77614 12 7.5 12H6.5C6.22386 12 6 11.7761 6 11.5V9H8Z"
                                            fill="currentColor"
                                        />
                                    </svg>
                                </div>
                                <div className={`${settingProperty == "flex-end" ? 'setting-input-active-tab' : 'setting-input-inactive-tab'}`} onClick={() => handleUpdateCustomValue("flex-end")}>
                                    <svg
                                        data-wf-icon="AlignContentEndRowIcon"
                                        width={16}
                                        height={16}
                                        viewBox="0 0 16 16"
                                        fill="none"
                                        xmlns="http://www.w3.org/2000/svg"
                                    >
                                        <path
                                            d="M6.5 8C6.22386 8 6 7.77614 6 7.5V5.5C6 5.22386 6.22386 5 6.5 5H7.5C7.77614 5 8 5.22386 8 5.5L8 7.5C8 7.77614 7.77614 8 7.5 8H6.5Z"
                                            fill="currentColor"
                                        />
                                        <path
                                            d="M6.5 9C6.22386 9 6 9.22386 6 9.5V12H2V13L15 13V12L11 12V9.5C11 9.22386 10.7761 9 10.5 9H9.5C9.22386 9 9 9.22386 9 9.5V12H8L8 9.5C8 9.22386 7.77614 9 7.5 9H6.5Z"
                                            fill="currentColor"
                                        />
                                        <path
                                            d="M9.5 8C9.22386 8 9 7.77614 9 7.5V5.5C9 5.22386 9.22386 5 9.5 5H10.5C10.7761 5 11 5.22386 11 5.5V7.5C11 7.77614 10.7761 8 10.5 8H9.5Z"
                                            fill="currentColor"
                                        />
                                    </svg>
                                </div>
                                <div className={`${settingProperty == "space-evenly" ? 'setting-input-active-tab' : 'setting-input-inactive-tab'}`} onClick={() => handleUpdateCustomValue("space-evenly")}>
                                    <svg
                                        data-wf-icon="AlignContentStretchRowIcon"
                                        width={16}
                                        height={16}
                                        viewBox="0 0 16 16"
                                        fill="none"
                                        xmlns="http://www.w3.org/2000/svg"
                                    >
                                        <path
                                            d="M15 3L11 3V6.5C11 6.77614 10.7761 7 10.5 7H9.5C9.22386 7 9 6.77614 9 6.5V3L8 3V6.5C8 6.77614 7.77614 7 7.5 7H6.5C6.22386 7 6 6.77614 6 6.5V3L2 3V2H15V3Z"
                                            fill="currentColor"
                                        />
                                        <path
                                            d="M15 13L2 13V12L6 12V8.5C6 8.22386 6.22386 8 6.5 8H7.5C7.77614 8 8 8.22386 8 8.5V12H9V8.5C9 8.22386 9.22386 8 9.5 8H10.5C10.7761 8 11 8.22386 11 8.5V12H15V13Z"
                                            fill="currentColor"
                                        />
                                    </svg>
                                </div>
                                <div className={`${settingProperty == "space-around" ? 'setting-input-active-tab' : 'setting-input-inactive-tab'}`} onClick={() => handleUpdateCustomValue("space-around")}>
                                    <svg
                                        data-wf-icon="AlignContentSpaceBetweenRowIcon"
                                        width={16}
                                        height={16}
                                        viewBox="0 0 16 16"
                                        fill="none"
                                        xmlns="http://www.w3.org/2000/svg"
                                    >
                                        <path
                                            d="M15 2L11 2V4.5C11 4.77614 10.7761 5 10.5 5H9.5C9.22386 5 9 4.77614 9 4.5V2L8 2V4.5C8 4.77614 7.77614 5 7.5 5H6.5C6.22386 5 6 4.77614 6 4.5V2L2 2V1H15V2Z"
                                            fill="currentColor"
                                        />
                                        <path
                                            d="M15 14L2 14V13L6 13V10.5C6 10.2239 6.22386 10 6.5 10H7.5C7.77614 10 8 10.2239 8 10.5V13H9V10.5C9 10.2239 9.22386 10 9.5 10H10.5C10.7761 10 11 10.2239 11 10.5V13H15V14Z"
                                            fill="currentColor"
                                        />
                                    </svg>
                                </div>
                                <div className={`${settingProperty == "space-between" ? 'setting-input-active-tab' : 'setting-input-inactive-tab'}`} onClick={() => handleUpdateCustomValue("space-between")}>
                                    <svg
                                        data-wf-icon="AlignContentSpaceAroundRowIcon"
                                        width={16}
                                        height={16}
                                        viewBox="0 0 16 16"
                                        fill="none"
                                        xmlns="http://www.w3.org/2000/svg"
                                    >
                                        <path d="M2 1H15V2L2 2V1Z" fill="currentColor" />
                                        <path d="M2 13L15 13V14L2 14V13Z" fill="currentColor" />
                                        <path
                                            d="M8 3.5C8 3.22386 7.77614 3 7.5 3L6.5 3C6.22386 3 6 3.22386 6 3.5L6 5.5C6 5.77614 6.22386 6 6.5 6L7.5 6C7.77614 6 8 5.77614 8 5.5V3.5Z"
                                            fill="currentColor"
                                        />
                                        <path
                                            d="M9 3.5C9 3.22386 9.22386 3 9.5 3L10.5 3C10.7761 3 11 3.22386 11 3.5V5.5C11 5.77614 10.7761 6 10.5 6L9.5 6C9.22386 6 9 5.77614 9 5.5V3.5Z"
                                            fill="currentColor"
                                        />
                                        <path
                                            d="M8 9.5C8 9.22386 7.77614 9 7.5 9L6.5 9C6.22386 9 6 9.22386 6 9.5L6 11.5C6 11.7761 6.22386 12 6.5 12H7.5C7.77614 12 8 11.7761 8 11.5V9.5Z"
                                            fill="currentColor"
                                        />
                                        <path
                                            d="M9 9.5C9 9.22386 9.22386 9 9.5 9L10.5 9C10.7761 9 11 9.22386 11 9.5V11.5C11 11.7761 10.7761 12 10.5 12H9.5C9.22386 12 9 11.7761 9 11.5V9.5Z"
                                            fill="currentColor"
                                        />
                                    </svg>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default CssCustomAlignContentInput