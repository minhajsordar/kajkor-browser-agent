import * as React from 'react';
import { useDispatch, useSelector } from '@/store/builderHooks';
import useUpdateStyle from '@/components/blocks-development-tools/block-settings/hooks/update-hooks/useUpdateStyle';
import useInitialCssValue from '@/components/blocks-development-tools/block-settings/hooks/get-hooks/useInitialCssValue';
import PopoverRight from '@/components/blocks-development-tools/block-settings/custom-dropdown-select/PopoverRight';
import CssCustomDropdownInput from '@/components/blocks-development-tools/block-settings/custom-input/CssCustomDropdownInput';
import CssCustomNumOnlyInput from '@/components/blocks-development-tools/block-settings/custom-input/CssCustomNumOnlyInput';
import "./CssCustomRatioInput.css"
const CssCustomRatioInput = ({ cssKeyType = "aspect-ratio" }: { cssKeyType?: string }) => {
    const registeredFont: any = {
        "auto": "Automatic",
        "2.39/1": "Anamorphic 2.39:1",
        "2/1": "Univicium/Netflix 2:1",
        "16/9": "Widescreen 16:9",
        "3/2": "Landscape 3:2",
        "2/3": "Portrait 2:3",
        "1/1": "Square 1:1",
        "custom": "Custom",
    }
    // other display Css dropdown open
    const [width, setWidth] = React.useState<string>('');
    const [height, setHeight] = React.useState<string>('');
    const [settingProperty, setsettingProperty] = React.useState<string>('');
    const [isCustomProperty, setIsCustomProperty] = React.useState<boolean>(false);
    const [settingPropertyInherited, setsettingPropertyInherited] = React.useState<boolean>(false);
    const dispatch = useDispatch()
    const pageBuilder = useSelector((state: any) => state.pageBuilder);
    const { selectedUid, insertIntoUid } = pageBuilder;
    const pageContent = useSelector((state: any) => state.pageContent);
    const {   draftPageContentSet } = pageContent;

    const updateStyleHook = useUpdateStyle()
    const initialCssValueHook = useInitialCssValue()

    const handleUpdateCustomValue = (value: string) => {
        if (value === "custom") {
            setIsCustomProperty(true)
            updateStyleHook.update([{ key: cssKeyType, value: `1/1` }])
        } else {
            setIsCustomProperty(false)
            updateStyleHook.update([{ key: cssKeyType, value: `${value}` }])
        }
    };
    const handleUpdateWidthValue = (value: string) => {
        console.log("updating value ", value)
        updateStyleHook.update([{ key: cssKeyType, value: `${value}/${height}` }])
    };
    const handleUpdateHeightValue = (value: string) => {
        console.log("updating value ", value)
        updateStyleHook.update([{ key: cssKeyType, value: `${width}/${value}` }])
    };
    React.useEffect(() => {
        if (selectedUid && cssKeyType) {
            const settingCssContentExist = initialCssValueHook.exist(cssKeyType)
            if (settingCssContentExist) {
                // update display Css
                const { value, inheritedFromDefault } = initialCssValueHook.get(cssKeyType);
                if (value !== "auto") {
                    if (Object.keys(registeredFont).includes(value)) {
                        setIsCustomProperty(false)
                    } else {
                        const widthHeight = value.split("/");
                        if (widthHeight.length == 2) {
                            console.log("setting value ", widthHeight[0], widthHeight[1])
                            setWidth(widthHeight[0])
                            setHeight(widthHeight[1])
                        }
                    }
                } else {
                    setIsCustomProperty(false)
                }
                setsettingPropertyInherited(inheritedFromDefault);
                setsettingProperty(value);
            } else {

                setIsCustomProperty(false)
                setsettingPropertyInherited(false);
                setsettingProperty("");
            }
        }
        // setElementStyle(draftPageContentSet[selectedUid]['style'])
    }, [pageBuilder, draftPageContentSet])

    return (
        <React.Fragment>
            <PopoverRight
                className={`ratio-setting-label  ${!settingProperty ? "css-key-not-exist-in-style" : settingPropertyInherited ? "css-key-value-inherited-from-default-in-style" : "css-key-value-exist-in-style"}`}
                label={<span>Ratio</span>}
            >
                <div className='bg-neutral-200 p-1 text-xs'>
                    <div>
                        <button className='px-1.5 py-0.5' onClick={() => handleUpdateCustomValue("")}>Reset</button>
                    </div>
                </div>
            </PopoverRight>
            <div className='setting-items-box-1-4'>
                <div>
                    <div className='ratio-setting-dropdown-num-input-container'>
                        <div className='ratio-setting-dropdown-input-container'>
                            <CssCustomDropdownInput options={registeredFont} initialValue={settingProperty}
                                update={handleUpdateCustomValue}
                            />
                        </div>
                        {isCustomProperty &&
                            <div className='ratio-setting-num-input-container'>
                                <div className='ratio-setting-width-num-input-container'>
                                    <CssCustomNumOnlyInput initialValue={width}
                                        update={handleUpdateWidthValue}
                                    />
                                </div>
                                <div className="ratio-setting-width-height-seperator">:</div>
                                <div className='ratio-setting-height-num-input-container'>
                                    <CssCustomNumOnlyInput initialValue={height}
                                        update={handleUpdateHeightValue}
                                    />
                                </div>
                                <div className='ratio-setting-width-label'>Width</div>
                                <div className='ratio-setting-height-label'>Height</div>
                            </div>
                        }
                    </div>
                </div>
            </div>
        </React.Fragment>
    )
}

export default CssCustomRatioInput