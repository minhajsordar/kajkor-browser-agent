'use client'
import * as React from 'react';
import { useDispatch, useSelector } from '@/store/builderHooks';
import useUpdateStyle from '@/components/blocks-development-tools/block-settings/hooks/update-hooks/useUpdateStyle';
import useInitialCssValue from '@/components/blocks-development-tools/block-settings/hooks/get-hooks/useInitialCssValue';
import PopoverRight from '@/components/blocks-development-tools/block-settings/custom-dropdown-select/PopoverRight';
import CssCustomSliderInput from '@/components/blocks-development-tools/block-settings/custom-input/slider-input/CssCustomSliderInput';
import { borderRadiusExample } from './borderRadiusExample';
import CssCustomNumUnitObjectInput from '../../../custom-input/CssCustomNumUnitObjectInput';
const BorderRadiusSetting = ({ cssKeyType = "border-radius" }: { cssKeyType?: string }) => {

    // other display Css dropdown open
    const [sliderValue, setSliderValue] = React.useState<number>(0);
    const [settingProperty, setsettingProperty] = React.useState<any>("");
    const [isCustomValue, setIsCustomValue] = React.useState<boolean>(false);
    const [existCssKey, setExistCssKey] = React.useState<boolean>(false);
    const [settingPropertyInherited, setsettingPropertyInherited] = React.useState<boolean>(false);
    const dispatch = useDispatch()

    const pageBuilder = useSelector((state: any) => state.pageBuilder);
    const { selectedUid, insertIntoUid } = pageBuilder;
    const pageContent = useSelector((state: any) => state.pageContent);
    const { draftPageContentSet } = pageContent;

    const updateStyleHook = useUpdateStyle()
    const initialCssValueHook = useInitialCssValue()
    const updateSliderValue = (val: any) => {
        setSliderValue(val)
        if (settingProperty) {
            if (isCustomValue) {
                updateStyleHook.update([{ key: cssKeyType, value: { custom: { value: String(val), unit: settingProperty.unit } } }])
            } else {
                updateStyleHook.update([{ key: cssKeyType, value: { all: { value: String(val), unit: settingProperty.unit } } }])
            }
        } else {
            updateStyleHook.update([{ key: cssKeyType, value: { all: { value: String(val), unit: "px" } } }])
        }
    }
    const handleUpdateCustomValue = (value: any) => {
        console.log("handle update ", value)
        // return;
        if (typeof (value) === "object" && value?.customValue) {
            updateStyleHook.update([{ key: cssKeyType, value: { custom: value } }])
        }
        else if (typeof (value) === "object") {
            updateStyleHook.update([{ key: cssKeyType, value: { all: value } }])
        }
        else {
            setSliderValue(0)
            updateStyleHook.update([{ key: cssKeyType, value: "delete" }])
            setIsCustomValue(false)
        }
    };
    React.useEffect(() => {
        if (selectedUid && cssKeyType) {
            const settingCssContentExist = initialCssValueHook.exist(cssKeyType)
            if (settingCssContentExist) {
                // update display Css
                const { value, inheritedFromDefault } = initialCssValueHook.get(cssKeyType);
                setsettingPropertyInherited(inheritedFromDefault);
                if (Object.keys(value).includes("all")) {
                    setsettingProperty(value?.all);
                    setSliderValue(value.all.value)
                    setIsCustomValue(false)
                }
                else if (Object.keys(value).includes("custom")) {
                    setsettingProperty(value?.custom);
                    setSliderValue(value.custom.value)
                    setIsCustomValue(true)
                } else {
                    setIsCustomValue(false)
                    setsettingProperty("")
                }
                console.log("updating value: ", value)
                setExistCssKey(true)
            } else {
                setExistCssKey(false)
                setIsCustomValue(false)
                setsettingPropertyInherited(false);
                setsettingProperty("");
            }
        }
    }, [pageBuilder, draftPageContentSet])
    return (
        <React.Fragment>
            <PopoverRight
                className={`border-radius-setting-label ${!existCssKey ? "css-key-not-exist-in-style" : settingPropertyInherited ? "css-key-value-inherited-from-default-in-style" : "css-key-value-exist-in-style"}`}
                label={<span>Radius</span>}
            >
                <div className='bg-neutral-200 p-1 text-xs'>
                    <div>
                        <button className='px-1.5 py-0.5' onClick={() => handleUpdateCustomValue("")}>Reset</button>
                    </div>
                </div>
            </PopoverRight>
            <div style={{
                gridColumn: "2 / -1"
            }}>
                <div className='border-radius-setting-area'>
                    <button className='border-radius-action-button active'>
                        <svg
                            data-wf-icon="BorderRadiusSingleIcon"
                            width={16}
                            height={16}
                            viewBox="0 0 16 16"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                        >
                            <path
                                d="M2.5 5.5C2.5 3.84315 3.84315 2.5 5.5 2.5H10.5C12.1569 2.5 13.5 3.84315 13.5 5.5V10.5C13.5 12.1569 12.1569 13.5 10.5 13.5H5.5C3.84315 13.5 2.5 12.1569 2.5 10.5V5.5Z"
                                stroke="currentColor"
                            />
                        </svg>
                    </button>
                    <button className='border-radius-action-button'>
                        {/* <svg
                            data-wf-icon="BorderRadiusAllIcon"
                            width={16}
                            height={16}
                            viewBox="0 0 16 16"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                        >
                            <path
                                d="M4.5 2C3.11929 2 2 3.11929 2 4.5V7H3V4.5C3 3.67157 3.67157 3 4.5 3H7V2H4.5Z"
                                fill="currentColor"
                            />
                            <path
                                d="M9 2V3H11.5C12.3284 3 13 3.67157 13 4.5V7H14V4.5C14 3.11929 12.8807 2 11.5 2H9Z"
                                fill="currentColor"
                            />
                            <path
                                d="M14 9H13V11.5C13 12.3284 12.3284 13 11.5 13H9V14H11.5C12.8807 14 14 12.8807 14 11.5V9Z"
                                fill="currentColor"
                            />
                            <path
                                d="M7 14V13H4.5C3.67157 13 3 12.3284 3 11.5V9H2V11.5C2 12.8807 3.11929 14 4.5 14H7Z"
                                fill="currentColor"
                            />
                        </svg> */}
                    </button>
                    <div className='border-radius-slider-input'>
                        <CssCustomSliderInput
                            min={0}
                            max={20}
                            step={0.5}
                            value={sliderValue}
                            onChange={updateSliderValue}
                        />
                    </div>
                    <div>
                        <CssCustomNumUnitObjectInput
                            initialValue={settingProperty}
                            update={handleUpdateCustomValue}
                            customValue={isCustomValue}
                        />
                    </div>
                </div>
            </div>
            {/* <div style={{
                gridColumn: "1 / -1"
            }}>
                <div>
                    <div className='individual-border-radius-area'>
                        <div className='border-radius-left-top-icon'>
                            <svg
                                data-wf-icon="BorderRadiusTopLeftIcon"
                                width={16}
                                height={16}
                                viewBox="0 0 16 16"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                            >
                                <g opacity="0.4">
                                    <path d="M14 14V9H13V13H9V14H14Z" fill="currentColor" />
                                    <path d="M7 14V13H3V9H2V14H7Z" fill="currentColor" />
                                    <path
                                        d="M2 7H3V6.5C3 4.567 4.567 3 6.5 3H7V2H6.5C4.01472 2 2 4.01472 2 6.5V7Z"
                                        fill="currentColor"
                                    />
                                    <path d="M9 2V3H13V7H14V2H9Z" fill="currentColor" />
                                </g>
                                <path
                                    d="M2.5 7V6.5C2.5 4.29086 4.29086 2.5 6.5 2.5H7"
                                    stroke="currentColor"
                                />
                            </svg>
                        </div>
                        <div className="border-radius-left-top-input-area">
                            input
                        </div>
                        <div className='border-radius-top-right-icon'>
                            <svg
                                data-wf-icon="BorderRadiusTopRightIcon"
                                width={16}
                                height={16}
                                viewBox="0 0 16 16"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                            >
                                <g opacity="0.4">
                                    <path d="M2 14V9H3V13H7V14H2Z" fill="currentColor" />
                                    <path d="M9 14V13H13V9H14V14H9Z" fill="currentColor" />
                                    <path
                                        d="M14 7H13V6.5C13 4.567 11.433 3 9.5 3H9V2H9.5C11.9853 2 14 4.01472 14 6.5V7Z"
                                        fill="currentColor"
                                    />
                                    <path d="M7 2V3H3V7H2V2H7Z" fill="currentColor" />
                                </g>
                                <path
                                    d="M13.5 7V6.5C13.5 4.29086 11.7091 2.5 9.5 2.5H9"
                                    stroke="currentColor"
                                />
                            </svg>
                        </div>
                        <div className="border-radius-top-right-input-area">
                            input
                        </div>
                        <div className='border-radius-left-bottom-icon'>
                            <svg
                                data-wf-icon="BorderRadiusBottomLeftIcon"
                                width={16}
                                height={16}
                                viewBox="0 0 16 16"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                            >
                                <g opacity="0.4">
                                    <path d="M2 2V7H3V3H7V2H2Z" fill="currentColor" />
                                    <path d="M9 2V3H13V7H14V2H9Z" fill="currentColor" />
                                    <path d="M14 9H13V13H9V14H14V9Z" fill="currentColor" />
                                    <path
                                        d="M7 14V13H6.5C4.567 13 3 11.433 3 9.5V9H2V9.5C2 11.9853 4.01472 14 6.5 14H7Z"
                                        fill="currentColor"
                                    />
                                </g>
                                <path
                                    d="M2.5 9V9.5C2.5 11.7091 4.29086 13.5 6.5 13.5H7"
                                    stroke="currentColor"
                                />
                            </svg>
                        </div>
                        <div className="border-radius-left-bottom-input-area">
                            input
                        </div>
                        <div className='border-radius-right-bottom-icon'>
                            <svg
                                data-wf-icon="BorderRadiusBottomRightIcon"
                                width={16}
                                height={16}
                                viewBox="0 0 16 16"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                            >
                                <g opacity="0.4">
                                    <path d="M2 2V7H3V3H7V2H2Z" fill="currentColor" />
                                    <path d="M9 2V3H13V7H14V2H9Z" fill="currentColor" />
                                    <path
                                        d="M14 9H13V11.5C13 12.3284 12.3284 13 11.5 13H9V14H11.5C12.8807 14 14 12.8807 14 11.5V9Z"
                                        fill="currentColor"
                                    />
                                    <path d="M7 14V13H3V9H2V14H7Z" fill="currentColor" />
                                </g>
                                <path
                                    d="M13.5 9V9.5C13.5 11.7091 11.7091 13.5 9.5 13.5H9"
                                    stroke="currentColor"
                                />
                            </svg>
                        </div>
                        <div className="border-radius-right-bottom-input-area">
                            input
                        </div>
                    </div>
                </div>
            </div> */}
        </React.Fragment>
    )
}

export default BorderRadiusSetting