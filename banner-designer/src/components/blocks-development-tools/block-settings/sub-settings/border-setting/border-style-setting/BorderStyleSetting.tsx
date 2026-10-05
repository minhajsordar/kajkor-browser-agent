'use client'
import * as React from 'react';
import { useDispatch, useSelector } from '@/store/builderHooks';
import useUpdateStyle from '@/components/blocks-development-tools/block-settings/hooks/update-hooks/useUpdateStyle';
import useInitialCssValue from '@/components/blocks-development-tools/block-settings/hooks/get-hooks/useInitialCssValue';
import PopoverRight from '@/components/blocks-development-tools/block-settings/custom-dropdown-select/PopoverRight';
import CssCustomNumUnitObjectInput from '@/components/blocks-development-tools/block-settings/custom-input/CssCustomNumUnitObjectInput';
import CssCustomColorInput from '@/components/blocks-development-tools/block-settings/custom-input/CssCustomColorInput';
import { borderStyleExample, ValueUniteObject } from './borderStyleExample';
const _ = { cloneDeep: (o: any) => JSON.parse(JSON.stringify(o)), isEqual: (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b) };
const BorderStyleSetting = ({ cssKeyType = "border" }: { cssKeyType?: string }) => {

    // other display Css dropdown open
    const [activeStyle, setActiveStyle] = React.useState<string>("none");
    const [activeColor, setActiveColor] = React.useState<string>("rgba(0 0 0 / 0)");
    const [activeWidth, setActiveWidth] = React.useState<ValueUniteObject>({ value: "0", unit: "px" });
    const [activeSetting, setActiveSetting] = React.useState<string>("all");
    const [sliderValue, setSliderValue] = React.useState<number>(0);
    const [settingProperty, setsettingProperty] = React.useState<any>("");
    const [existCssKey, setExistCssKey] = React.useState<boolean>(false);
    const [isCustomValue, setIsCustomValue] = React.useState<boolean>(false);
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
    const copyObject = (e: any) => {
        if (typeof (e) == 'object') {
            return JSON.parse(JSON.stringify(e))
        } else {
            return e
        }
    }
    const updateActiveSetting = (value: string) => {
        setActiveSetting(value)
        const copySettingProperty = copyObject(settingProperty)
        if (value === 'all') {
            copySettingProperty.isIndividual = false
        } else {
            copySettingProperty.isIndividual = true
            setActiveStyle(copySettingProperty[`${value}`].style)
            setActiveColor(copySettingProperty[`${value}`].color)
            setActiveWidth(copySettingProperty[`${value}`].width)
        }
        setsettingProperty(copySettingProperty)
        // console.log("copySettingProperty ", copySettingProperty)
        updateStyleHook.update([{ key: cssKeyType, value: copySettingProperty }])

    }
    const allBorderKey = ["left", "top", "right", "bottom"]
    const updateBorder = (value: any, key: string) => {
        const copySettingProperty = copyObject(settingProperty)
        if (activeSetting === 'all') {
            for (const element of allBorderKey) {
                copySettingProperty[`${element}`][`${key}`] = value
            }
        } else {
            copySettingProperty[`${activeSetting}`][`${key}`] = value
        }
        setsettingProperty(copySettingProperty)
        updateStyleHook.update([{ key: cssKeyType, value: copySettingProperty }])

        console.log("copySettingProperty ", copySettingProperty)
    }
    const updateStyle = (value: string) => {
        updateBorder(value, "style")
        setActiveStyle(value)
    }
    const updateWidth = (value: any) => {
        updateBorder(value, "width")
        setActiveWidth(value)
    }
    const updateColor = (value: string) => {
        updateBorder(value, "color")
        setActiveColor(value)
    }
    React.useEffect(() => {
        if (selectedUid && cssKeyType) {
            const settingCssContentExist = initialCssValueHook.exist(cssKeyType)
            if (settingCssContentExist) {
                // update display Css
                const { value, inheritedFromDefault } = initialCssValueHook.get(cssKeyType);
                setsettingPropertyInherited(inheritedFromDefault);
                if (!(_.isEqual(value, settingProperty))) {
                    if (Object.keys(value).includes("isIndividual") && value.isIndividual == false) {
                        setsettingProperty(value);
                        setActiveSetting("all")
                        setActiveStyle(value.left.style)
                        setActiveColor(value.left.color)
                        setActiveWidth(value.left.width)
                    }
                    else if (Object.keys(value).includes("isIndividual") && value.isIndividual == true) {
                        setsettingProperty(value);
                        setActiveSetting("left")
                        setActiveStyle(value.left.style)
                        setActiveColor(value.left.color)
                        setActiveWidth(value.left.width)
                    } else {
                        setsettingProperty(borderStyleExample);
                        setActiveSetting("left")
                        setActiveStyle(borderStyleExample.left.style)
                        setActiveColor(borderStyleExample.left.color)
                        setActiveWidth(borderStyleExample.left.width)
                    }
                }
                console.log("is equal value: ", (_.isEqual(value, settingProperty)))
                console.log("setting value: ", settingProperty)
                console.log("updating value: ", value)
                setExistCssKey(true)
            } else {
                setExistCssKey(false)
                setsettingPropertyInherited(false);
                setsettingProperty(borderStyleExample);
            }
        }
    }, [pageBuilder, draftPageContentSet])
    return (
        <React.Fragment>

            <div style={{
                gridColumn: "1 / -1"
            }}>
                <div>
                    <div className='border-setting-area'>
                        <PopoverRight
                            className={`border-setting-label ${!existCssKey ? "css-key-not-exist-in-style" : settingPropertyInherited ? "css-key-value-inherited-from-default-in-style" : "css-key-value-exist-in-style"}`}
                            label={<span>Borders</span>}
                        >
                            <div className='bg-neutral-200 p-1 text-xs'>
                                <div>
                                    <button className='px-1.5 py-0.5' onClick={() => handleUpdateCustomValue("")}>Reset</button>
                                </div>
                            </div>
                        </PopoverRight>
                        <div style={{
                            gridColumn: "1 / 2"
                        }}>
                            <div className='border-visual-area'>
                                <div className={`border-visual-top-icon ${activeSetting == "top" ? "active" : ""}`} onClick={() => updateActiveSetting("top")}>
                                    <svg
                                        data-wf-icon="BorderTopIcon"
                                        width={16}
                                        height={16}
                                        viewBox="0 0 16 16"
                                        fill="none"
                                        xmlns="http://www.w3.org/2000/svg"
                                    >
                                        <path
                                            opacity="0.4"
                                            fillRule="evenodd"
                                            clipRule="evenodd"
                                            d="M2 13C2 13.5523 2.44772 14 3 14H13C13.5523 14 14 13.5523 14 13V5H13V13H3V5H2V13Z"
                                            fill="currentColor"
                                        />
                                        <path
                                            fillRule="evenodd"
                                            clipRule="evenodd"
                                            d="M2 3H14V2H2V3Z"
                                            fill="currentColor"
                                        />
                                    </svg>
                                </div>
                                <div className={`border-visual-right-icon ${activeSetting == "right" ? "active" : ""}`} onClick={() => updateActiveSetting("right")}>
                                    <svg
                                        data-wf-icon="BorderRightIcon"
                                        width={16}
                                        height={16}
                                        viewBox="0 0 16 16"
                                        fill="none"
                                        xmlns="http://www.w3.org/2000/svg"
                                    >
                                        <path
                                            opacity="0.4"
                                            fillRule="evenodd"
                                            clipRule="evenodd"
                                            d="M3 2C2.44772 2 2 2.44772 2 3L2 13C2 13.5523 2.44772 14 3 14L11 14L11 13L3 13L3 3L11 3L11 2L3 2Z"
                                            fill="currentColor"
                                        />
                                        <path
                                            fillRule="evenodd"
                                            clipRule="evenodd"
                                            d="M13 2L13 14L14 14L14 2L13 2Z"
                                            fill="currentColor"
                                        />
                                    </svg>
                                </div>
                                <div className={`border-visual-bottom-icon ${activeSetting == "bottom" ? "active" : ""}`} onClick={() => updateActiveSetting("bottom")}>
                                    <svg
                                        data-wf-icon="BorderBottomIcon"
                                        width={16}
                                        height={16}
                                        viewBox="0 0 16 16"
                                        fill="none"
                                        xmlns="http://www.w3.org/2000/svg"
                                    >
                                        <path
                                            opacity="0.4"
                                            fillRule="evenodd"
                                            clipRule="evenodd"
                                            d="M2 3C2 2.44772 2.44772 2 3 2H13C13.5523 2 14 2.44772 14 3V11H13V3H3V11H2V3Z"
                                            fill="currentColor"
                                        />
                                        <path
                                            fillRule="evenodd"
                                            clipRule="evenodd"
                                            d="M2 13H14V14H2V13Z"
                                            fill="currentColor"
                                        />
                                    </svg>
                                </div>
                                <div className={`border-visual-left-icon ${activeSetting == "left" ? "active" : ""}`} onClick={() => updateActiveSetting("left")}>
                                    <svg
                                        data-wf-icon="BorderLeftIcon"
                                        width={16}
                                        height={16}
                                        viewBox="0 0 16 16"
                                        fill="none"
                                        xmlns="http://www.w3.org/2000/svg"
                                    >
                                        <path
                                            opacity="0.4"
                                            fillRule="evenodd"
                                            clipRule="evenodd"
                                            d="M13 2C13.5523 2 14 2.44772 14 3L14 13C14 13.5523 13.5523 14 13 14L5 14L5 13L13 13L13 3L5 3L5 2L13 2Z"
                                            fill="currentColor"
                                        />
                                        <path
                                            fillRule="evenodd"
                                            clipRule="evenodd"
                                            d="M3 2L3 14L2 14L2 2L3 2Z"
                                            fill="currentColor"
                                        />
                                    </svg>
                                </div>
                                <div className={`border-visual-all-icon ${activeSetting == "all" ? "active" : ""}`} onClick={() => updateActiveSetting("all")}>
                                    <svg
                                        data-wf-icon="BorderAllIcon"
                                        width={16}
                                        height={16}
                                        viewBox="0 0 16 16"
                                        fill="none"
                                        xmlns="http://www.w3.org/2000/svg"
                                    >
                                        <path
                                            fillRule="evenodd"
                                            clipRule="evenodd"
                                            d="M2 3C2 2.44772 2.44772 2 3 2H13C13.5523 2 14 2.44772 14 3V13C14 13.5523 13.5523 14 13 14H3C2.44772 14 2 13.5523 2 13V3ZM13 3L3 3V13H13V3Z"
                                            fill="currentColor"
                                        />
                                    </svg>
                                </div>
                            </div>
                        </div>
                        <div className='all-border-setting-area'>
                            <div className="border-style-setting-label">Style</div>
                            <div className="border-style-setting-tab">
                                <div className='setting-input-tab-area'>
                                    <div className={`${activeStyle == 'none' ? 'setting-input-active-tab' : 'setting-input-inactive-tab'}`} onClick={() => updateStyle("none")}>
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
                                    </div>
                                    <div className={`${activeStyle == 'solid' ? 'setting-input-active-tab' : 'setting-input-inactive-tab'}`} onClick={() => updateStyle("solid")}>
                                        <svg
                                            data-wf-icon="BorderStyleSolidIcon"
                                            width={16}
                                            height={16}
                                            viewBox="0 0 16 16"
                                            fill="none"
                                            xmlns="http://www.w3.org/2000/svg"
                                        >
                                            <path d="M2 7.5H14" stroke="currentColor" />
                                        </svg>
                                    </div>
                                    <div className={`${activeStyle == 'dashed' ? 'setting-input-active-tab' : 'setting-input-inactive-tab'}`} onClick={() => updateStyle("dashed")}>
                                        <svg
                                            data-wf-icon="BorderStyleDashedIcon"
                                            width={16}
                                            height={16}
                                            viewBox="0 0 16 16"
                                            fill="none"
                                            xmlns="http://www.w3.org/2000/svg"
                                        >
                                            <path
                                                fillRule="evenodd"
                                                clipRule="evenodd"
                                                d="M5 7H2V8H5V7ZM11 8H12H14V7H12H11V8ZM9.5 7H6.5V8H9.5V7Z"
                                                fill="currentColor"
                                            />
                                        </svg>
                                    </div>
                                    <div className={`${activeStyle == 'dotted' ? 'setting-input-active-tab' : 'setting-input-inactive-tab'}`} onClick={() => updateStyle("dotted")}>
                                        <svg
                                            data-wf-icon="BorderStyleDottedIcon"
                                            width={16}
                                            height={16}
                                            viewBox="0 0 16 16"
                                            fill="none"
                                            xmlns="http://www.w3.org/2000/svg"
                                        >
                                            <path
                                                fillRule="evenodd"
                                                clipRule="evenodd"
                                                d="M4 7H3V8H4V7ZM6 7H5V8H6V7ZM7 7H8V8H7V7ZM10 7H9V8H10V7ZM11 7H12V8H11V7ZM14 7H13V8H14V7Z"
                                                fill="currentColor"
                                            />
                                        </svg>
                                    </div>
                                </div>
                            </div>
                            <div className="border-width-setting-label">Width</div>
                            <div className="border-width-setting-input">
                                <CssCustomNumUnitObjectInput initialValue={activeWidth}
                                    update={updateWidth}
                                />
                            </div>
                            <div className="border-color-setting-label">Color</div>
                            <div className="border-color-setting-input">
                                <CssCustomColorInput
                                    initialValue={activeColor}
                                    update={updateColor}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </React.Fragment>
    )
}

export default BorderStyleSetting