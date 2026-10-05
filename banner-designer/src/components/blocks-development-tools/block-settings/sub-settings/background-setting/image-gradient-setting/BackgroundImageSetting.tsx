'use client'
import * as React from 'react';
import { useDispatch, useSelector } from '@/store/builderHooks';
import useUpdateStyle from '@/components/blocks-development-tools/block-settings/hooks/update-hooks/useUpdateStyle';
import useInitialCssValue from '@/components/blocks-development-tools/block-settings/hooks/get-hooks/useInitialCssValue';
import PopoverRight from '@/components/blocks-development-tools/block-settings/custom-dropdown-select/PopoverRight';
import CssCustomColorInput from '../../../custom-input/CssCustomColorInput';
import "./BackgroundImageSetting.css"
import { backgroundImageExample } from './backgroundImageExample';
const _ = { cloneDeep: (o: any) => JSON.parse(JSON.stringify(o)), isEqual: (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b) };
import BackgroundImageObjectInputArea from './image-input/BackgroundImageObjectInputArea';
import BackgroundLinearGradientObjectInput from './linear-gradient-input/BackgroundLinearGradientObjectInput';
import BackgroundRadialGradientObjectInput from './radial-gradient-input/BackgroundRadialGradientObjectInput';
const BackgroundImageSetting = ({ cssKeyType = "background-image" }: { cssKeyType?: string }) => {

    // other display Css dropdown open
    const [settingProperty, setsettingProperty] = React.useState<any>([]);
    const [activeSettingIndex, setactiveSettingIndex] = React.useState<null | number>(null);
    const [settingPropertyInherited, setsettingPropertyInherited] = React.useState<boolean>(false);
    const dispatch = useDispatch()
    const pageBuilder = useSelector((state: any) => state.pageBuilder);
    const { selectedUid, insertIntoUid } = pageBuilder;
    const pageContent = useSelector((state: any) => state.pageContent);
    const { draftPageContentSet } = pageContent;

    const updateStyleHook = useUpdateStyle()
    const initialCssValueHook = useInitialCssValue()

    const updateType = (value: string) => {
        const clonedSetting = _.cloneDeep(settingProperty)
        if (activeSettingIndex !== null) {
            clonedSetting[activeSettingIndex].type = value
        }
        setsettingProperty(clonedSetting)
    }
    const updateSizeType = (value: string) => {
        const clonedSetting = _.cloneDeep(settingProperty)
        if (activeSettingIndex !== null) {
            clonedSetting[activeSettingIndex].size.type = value
        }
        setsettingProperty(clonedSetting)
        console.log(clonedSetting)
    }
    const updateByKeyValue = (key: string, value: any) => {
        const clonedSetting = _.cloneDeep(settingProperty)
        if (activeSettingIndex !== null) {
            clonedSetting[activeSettingIndex][key] = value
        }
        setsettingProperty(clonedSetting)
        console.log(clonedSetting)
    }
    const handleSelectIndex = (val: any) => {
        console.log("handle select index ", val)
    }
    const updateAngleValue = (value: string) => {
        const clonedSetting = _.cloneDeep(settingProperty)
        if (activeSettingIndex !== null) {
            clonedSetting[activeSettingIndex]["angle"]["value"] = value
        }
        setsettingProperty(clonedSetting)
        console.log(clonedSetting)
    }
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
                setsettingProperty(backgroundImageExample);
            }
        }
        // setElementStyle(draftPageContentSet[selectedUid]['style'])
    }, [pageBuilder, draftPageContentSet])

    return (
        <div className='image-gradient-setting-area'>
            <div>
                <div className='image-gradient-input-setting-area'>
                    <div className='image-gradient-setting-label'>Image & Gradient</div>
                    <button className='image-gradient-setting-popup-button'>
                        <svg
                            data-wf-icon="AddIcon"
                            width={16}
                            height={16}
                            viewBox="0 0 16 16"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                        >
                            <path
                                d="M7.5 8.5V13.5H8.5V8.5H13.5V7.5H8.5V2.5H7.5V7.5H2.5V8.5H7.5Z"
                                fill="currentColor"
                            />
                        </svg>
                    </button>
                    {settingProperty.map((setting: any, index: number) => (
                        <div className='image-gradient-setting-container' key={index} onClick={() => setactiveSettingIndex(index)}>
                            <div className='image-gradient-setting-container-inner'>
                                <div className='image-gradient-setting-item'>
                                    <span className='image-gradient-drag-icon'>
                                        <svg
                                            data-wf-icon="PropListDraggerIcon"
                                            width={3}
                                            height={10}
                                            viewBox="0 0 3 10"
                                            fill="none"
                                            xmlns="http://www.w3.org/2000/svg"
                                        >
                                            <path d="M0 1.5H3M0 4.5H3M0 7.5H3" stroke="currentColor" />
                                        </svg>

                                    </span>
                                    <span className='image-gradient-preview-icon'></span>
                                    <span className='image-gradient-preview-name'>{setting.type}</span>
                                    <div className='image-gradient-preview-actions'>
                                        <button className='image-gradient-preview-eye-icon'>
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
                                        <button className='image-gradient-remove-icon'>
                                            <svg
                                                data-wf-icon="DeleteIcon"
                                                width={16}
                                                height={16}
                                                viewBox="0 0 16 16"
                                                fill="none"
                                                xmlns="http://www.w3.org/2000/svg"
                                            >
                                                <path
                                                    fillRule="evenodd"
                                                    clipRule="evenodd"
                                                    d="M7 2C6.44772 2 6 2.44772 6 3V4H3V5H4V11.5C4 12.3284 4.67157 13 5.5 13H11.5C12.3284 13 13 12.3284 13 11.5V5H14V4H11V3C11 2.44772 10.5523 2 10 2H7ZM10 4V3H7V4H10ZM5 11.5V5H12V11.5C12 11.7761 11.7761 12 11.5 12H5.5C5.22386 12 5 11.7761 5 11.5Z"
                                                    fill="currentColor"
                                                />
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
                {activeSettingIndex !== null &&
                    <div className='w-full'>
                        <div className='background-image-setting-area'>
                            <div className='background-image-setting-title'>Type</div>
                            <div className='setting-input-tab-area'>
                                <button className={`${settingProperty[activeSettingIndex].type == "image" ? "setting-input-active-tab" : "setting-input-inactive-tab"}`} onClick={() => updateType("image")}>
                                    <svg
                                        data-wf-icon="BackgroundImageIcon"
                                        width={16}
                                        height={16}
                                        viewBox="0 0 16 16"
                                        fill="none"
                                        xmlns="http://www.w3.org/2000/svg"
                                    >
                                        <path
                                            d="M6 7C6.55228 7 7 6.55228 7 6C7 5.44772 6.55228 5 6 5C5.44772 5 5 5.44772 5 6C5 6.55228 5.44772 7 6 7Z"
                                            fill="currentColor"
                                        />
                                        <path
                                            fillRule="evenodd"
                                            clipRule="evenodd"
                                            d="M2 3C2 2.44772 2.44772 2 3 2H13C13.5523 2 14 2.44772 14 3V13C14 13.5523 13.5523 14 13 14H3C2.44772 14 2 13.5523 2 13V3ZM13 3L3 3V12.2929L8 7.29289L13 12.2929V3ZM8 8.70711L12.2929 13H3.70711L8 8.70711Z"
                                            fill="currentColor"
                                        />
                                    </svg>
                                </button>
                                <button className={`${settingProperty[activeSettingIndex].type == "linear-gradient" ? "setting-input-active-tab" : "setting-input-inactive-tab"}`} onClick={() => updateType("linear-gradient")}>
                                    <svg
                                        data-wf-icon="BackgroundLinearGradientIcon"
                                        width={16}
                                        height={16}
                                        viewBox="0 0 16 16"
                                        fill="none"
                                        xmlns="http://www.w3.org/2000/svg"
                                    >
                                        <path
                                            d="M2 3C2 2.44772 2.44772 2 3 2H13C13.5523 2 14 2.44772 14 3V13C14 13.5523 13.5523 14 13 14H3C2.44772 14 2 13.5523 2 13V3Z"
                                            fill="url(#paint0_linear_25_15590)"
                                        />
                                        <defs>
                                            <linearGradient
                                                id="paint0_linear_25_15590"
                                                x1={14}
                                                y1={2}
                                                x2={14}
                                                y2={14}
                                                gradientUnits="userSpaceOnUse"
                                            >
                                                <stop stopColor="currentColor" />
                                                <stop offset={1} stopColor="currentColor" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                    </svg>
                                </button>
                                <button className={`${settingProperty[activeSettingIndex].type == "radial-gradient" ? "setting-input-active-tab" : "setting-input-inactive-tab"}`} onClick={() => updateType("radial-gradient")}>
                                    <svg
                                        data-wf-icon="BackgroundRadialGradientIcon"
                                        width={16}
                                        height={16}
                                        viewBox="0 0 16 16"
                                        fill="none"
                                        xmlns="http://www.w3.org/2000/svg"
                                    >
                                        <path
                                            d="M2 3C2 2.44772 2.44772 2 3 2H13C13.5523 2 14 2.44772 14 3V13C14 13.5523 13.5523 14 13 14H3C2.44772 14 2 13.5523 2 13V3Z"
                                            fill="url(#paint0_radial_25_15605)"
                                        />
                                        <defs>
                                            <radialGradient
                                                id="paint0_radial_25_15605"
                                                cx={0}
                                                cy={0}
                                                r={1}
                                                gradientUnits="userSpaceOnUse"
                                                gradientTransform="translate(8 8) rotate(90) scale(6)"
                                            >
                                                <stop stopColor="currentColor" stopOpacity={0} />
                                                <stop offset="0.166246" stopColor="currentColor" stopOpacity={0} />
                                                <stop offset={1} stopColor="currentColor" />
                                            </radialGradient>
                                        </defs>
                                    </svg>
                                </button>
                                <button className={`${settingProperty[activeSettingIndex].type == "color-overlay" ? "setting-input-active-tab" : "setting-input-inactive-tab"}`} onClick={() => updateType("color-overlay")}>
                                    <svg
                                        data-wf-icon="BackgroundColorIcon"
                                        width={16}
                                        height={16}
                                        viewBox="0 0 16 16"
                                        fill="none"
                                        xmlns="http://www.w3.org/2000/svg"
                                    >
                                        <path
                                            d="M2 3C2 2.44772 2.44772 2 3 2H13C13.5523 2 14 2.44772 14 3V13C14 13.5523 13.5523 14 13 14H3C2.44772 14 2 13.5523 2 13V3Z"
                                            fill="currentColor"
                                        />
                                    </svg>
                                </button>
                            </div>
                            {settingProperty[activeSettingIndex].type == "image" &&
                                <BackgroundImageObjectInputArea
                                    settingProperty={settingProperty}
                                    updateByKeyValue={updateByKeyValue}
                                    updateSizeType={updateSizeType}
                                    activeSettingIndex={activeSettingIndex}
                                />
                            }
                            {settingProperty[activeSettingIndex].type == "linear-gradient" &&
                                <BackgroundLinearGradientObjectInput
                                    settingProperty={settingProperty}
                                    updateByKeyValue={updateByKeyValue}
                                    updateAngleValue={updateAngleValue}
                                    activeSettingIndex={activeSettingIndex}
                                    handleSelectIndex={handleSelectIndex}
                                />
                            }
                            {settingProperty[activeSettingIndex].type == "radial-gradient" &&
                                <BackgroundRadialGradientObjectInput
                                    settingProperty={settingProperty}
                                    updateByKeyValue={updateByKeyValue}
                                    activeSettingIndex={activeSettingIndex}
                                    handleSelectIndex={handleSelectIndex}
                                />
                            }
                            {settingProperty[activeSettingIndex].type == "color-overlay" &&
                                <CssCustomColorInput
                                    initialValue={settingProperty[activeSettingIndex].color}
                                />
                            }
                        </div>
                    </div>
                }
            </div>
        </div>
    )
}

export default BackgroundImageSetting