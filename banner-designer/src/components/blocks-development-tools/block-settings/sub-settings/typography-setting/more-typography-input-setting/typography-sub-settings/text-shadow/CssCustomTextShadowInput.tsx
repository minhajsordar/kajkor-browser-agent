"use client"
import * as React from 'react';
import { useDispatch, useSelector } from '@/store/builderHooks';
import useUpdateStyle from '@/components/blocks-development-tools/block-settings/hooks/update-hooks/useUpdateStyle';
import useInitialCssValue from '@/components/blocks-development-tools/block-settings/hooks/get-hooks/useInitialCssValue';
import CssCustomNumUnitInput from '@/components/blocks-development-tools/block-settings/custom-input/CssCustomNumUnitInput';
import PopoverRight from '@/components/blocks-development-tools/block-settings/custom-dropdown-select/PopoverRight';

import "./CssCustomTextShadowInput.css"
import CssCustomColorInput from '@/components/blocks-development-tools/block-settings/custom-input/CssCustomColorInput';
const CssCustomTextShadowInput = ({ cssKeyType = "text-shadow" }: { cssKeyType?: string }) => {
    // other display Css dropdown open
    const [settingProperty, setsettingProperty] = React.useState<any>([
        {
            x: "5px", y: "5px", blur: "10px", color: "red"
        },
        {
            x: "5px", y: "5px", blur: "10px", color: "yellow"
        }
    ]);
    const [updateIndex, setUpdateIndex] = React.useState<any>(null)
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
    const removeShadow = (index: number) => {
        setsettingProperty((s: any) => [...s.slice(0, index), ...s.slice(index + 1)])
    }
    const addShadow = () => {
        const spO = JSON.parse(JSON.stringify(settingProperty))
        spO.push({
            x: "5px", y: "5px", blur: "10px", color: "#fafafa"
        })
        updateSettingProperty(spO)

    }
    const updateShadowByIndexAndKey = (index: number, key: string, value: string) => {
        const spO = JSON.parse(JSON.stringify(settingProperty))
        spO[index][key] = value
        updateSettingProperty(spO)
    }
    const updateSettingProperty = (spO: any) => {
        const shadows = []
        for (const key in spO) {
            if (Object.prototype.hasOwnProperty.call(spO, key)) {
                const element = spO[key];
                const d = `${element.x} ${element.y} ${element.blur} ${element.color}`
                shadows.push(d)
            }
        }
        handleUpdateCustomValue(shadows.join(","))
    }
    React.useEffect(() => {
        if (selectedUid && cssKeyType) {
            const settingCssContentExist = initialCssValueHook.exist(cssKeyType)
            if (settingCssContentExist) {
                // update display Css
                const { value, inheritedFromDefault } = initialCssValueHook.get(cssKeyType);
                setsettingPropertyInherited(inheritedFromDefault);
                if (value) {
                    const splited = value.split(",")
                    const dt = []
                    for (const element of splited) {
                        const splittedProperty = element.split(" ")
                        const splittedColor = element.split("rgb")
                        const el: any = {}
                        el.x = splittedProperty[0]
                        el.y = splittedProperty[1]
                        el.blur = splittedProperty[2]
                        el.color = `rgb${splittedColor[1]}`
                        dt.push(el)
                    }
                    setsettingProperty(dt);
                } else {
                    setsettingProperty([]);
                }
            } else {
                setsettingPropertyInherited(false);
                setsettingProperty([]);
            }
        }
        // setElementStyle(draftPageContentSet[selectedUid]['style'])
    }, [pageBuilder, draftPageContentSet])
    return (
        <div className='text-shadow-setting-input-container'>
            <PopoverRight
                className={`text-shadow-setting-label ${settingProperty.length == 0 ? "css-key-not-exist-in-style" : settingPropertyInherited ? "css-key-value-inherited-from-default-in-style" : "css-key-value-exist-in-style"}`}
                label={"Shadow"}
            >
                <div className='p-1 text-xs'>
                    <div>
                        <button className='px-1.5 py-0.5' onClick={() => handleUpdateCustomValue("")}>Reset</button>
                    </div>
                </div>
            </PopoverRight>
            <button className='text-shadow-setting-add-action'
                onClick={addShadow}
            >
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
            <div className='text-shadow-list-setting-container'>
                <div className='text-shadow-list-setting-container-inner'>
                    {settingProperty.map((item: any, index: number) => (
                        <React.Fragment key={index}>
                            <div className='text-shadow-setting-item' key={index}>
                                <div
                                    className={`shadow-color`}
                                    style={{ backgroundColor: `${item.color}` }}
                                >
                                    <CssCustomColorInput
                                        initialValue={item.color}
                                        update={(val: string) => updateShadowByIndexAndKey(index, "color", val)}
                                    />
                                </div>
                                <div onClick={() => setUpdateIndex(index)} className='shadow-details'>
                                    <PopoverRight
                                        className={`shadow-details-x-position ${!settingProperty ? "css-key-not-exist-in-style" : settingPropertyInherited ? "css-key-value-inherited-from-default-in-style" : "css-key-value-exist-in-style"}`}
                                        label={<span>{item.x ? item.x : "Auto"}</span>}
                                    >
                                        <div className='p-1 text-xs'>
                                            <div>
                                                <button className='px-1.5 py-0.5' onClick={() => handleUpdateCustomValue("")}>Reset</button>
                                            </div>
                                            <CssCustomNumUnitInput
                                                initialValue={item.x}
                                                update={(val: string) => updateShadowByIndexAndKey(index, "x", val)}
                                            />
                                        </div>
                                    </PopoverRight>
                                    <PopoverRight
                                        className={`shadow-details-y-position ${!settingProperty ? "css-key-not-exist-in-style" : settingPropertyInherited ? "css-key-value-inherited-from-default-in-style" : "css-key-value-exist-in-style"}`}
                                        label={<span>{item.y ? item.y : "Auto"}</span>}
                                    >
                                        <div className='p-1 text-xs'>
                                            <div>
                                                <button className='px-1.5 py-0.5' onClick={() => handleUpdateCustomValue("")}>Reset</button>
                                            </div>
                                            <CssCustomNumUnitInput
                                                initialValue={item.y}
                                                update={(val: string) => updateShadowByIndexAndKey(index, "y", val)}
                                            />
                                        </div>
                                    </PopoverRight>
                                    <PopoverRight
                                        className={`shadow-details-blur-position ${!settingProperty ? "css-key-not-exist-in-style" : settingPropertyInherited ? "css-key-value-inherited-from-default-in-style" : "css-key-value-exist-in-style"}`}
                                        label={<span>{item.blur ? item.blur : "Auto"}</span>}
                                    >
                                        <div className='p-1 text-xs'>
                                            <div>
                                                <button className='px-1.5 py-0.5' onClick={() => handleUpdateCustomValue("")}>Reset</button>
                                            </div>
                                            <CssCustomNumUnitInput
                                                initialValue={item.blur}
                                                update={(val: string) => updateShadowByIndexAndKey(index, "blur", val)}
                                            />
                                        </div>
                                    </PopoverRight>
                                </div>
                                <div className='shadow-remove-action'>
                                    <button onClick={() => removeShadow(index)}>
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
                            </div>
                        </React.Fragment>
                    ))}
                </div>
            </div>
        </div>
    )
}

export default CssCustomTextShadowInput