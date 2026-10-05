'use client'
import * as React from 'react';
import { useDispatch, useSelector } from '@/store/builderHooks';
import useUpdateStyle from '@/components/blocks-development-tools/block-settings/hooks/update-hooks/useUpdateStyle';
import useInitialCssValue from '@/components/blocks-development-tools/block-settings/hooks/get-hooks/useInitialCssValue';
import PopoverRight from '@/components/blocks-development-tools/block-settings/custom-dropdown-select/PopoverRight';
import CssCustomDropdownInput from '@/components/blocks-development-tools/block-settings/custom-input/CssCustomDropdownInput';
import "./CssCustomPositionSetting.css"
import FourPositionSetting from '@/components/blocks-development-tools/block-settings/sub-settings/position-setting/custom-position-setting/position-sub-setting/FourPositionSetting';
import CssPositionRelativeToIndicator from '@/components/blocks-development-tools/block-settings/sub-settings/position-setting/custom-position-setting/relative-to-indicator/CssPositionRelativeToIndicator';
import CssCustomZIndexInput from '@/components/blocks-development-tools/block-settings/sub-settings/position-setting/custom-position-setting/z-index-setting/CssCustomZIndexInput';
const CssCustomPositionSetting = ({ cssKeyType = "position" }: { cssKeyType?: string }) => {
    // other display Css dropdown open
    const registeredValues: any = {
        "relative": "Relative",
        "absolute": "Absolute",
        "fixed": "Fixed",
        "sticky": "Sticky",
        "static": "Static",
    }
    const [settingProperty, setsettingProperty] = React.useState<string>('');
    const [existCssKey, setExistCssKey] = React.useState<boolean>(false);
    const [settingPropertyInherited, setsettingPropertyInherited] = React.useState<boolean>(false);
    const pageBuilder = useSelector((state: any) => state.pageBuilder);
    const { selectedUid, insertIntoUid } = pageBuilder;
    const pageContent = useSelector((state: any) => state.pageContent);
    const {   draftPageContentSet } = pageContent;

    const updateStyleHook = useUpdateStyle()
    const initialCssValueHook = useInitialCssValue()

    const handleUpdateCustomValue = (value: string) => {
        updateStyleHook.update([{ key: cssKeyType, value: value }])
    };
    React.useEffect(() => {
        if (selectedUid && cssKeyType) {
            const settingCssContentExist = initialCssValueHook.exist(cssKeyType)
            if (settingCssContentExist) {
                // update display Css
                const { value, inheritedFromDefault } = initialCssValueHook.get(cssKeyType);
                setsettingPropertyInherited(inheritedFromDefault);
                setsettingProperty(value);
                setExistCssKey(true)
            } else {
                setExistCssKey(false)
                setsettingPropertyInherited(false);
                setsettingProperty("static");
            }
        }
        // setElementStyle(draftPageContentSet[selectedUid]['style'])
    }, [pageBuilder, draftPageContentSet])

    return (
        <React.Fragment>
            <PopoverRight
                className={`position-setting-label  ${!existCssKey ? "css-key-not-exist-in-style" : settingPropertyInherited ? "css-key-value-inherited-from-default-in-style" : "css-key-value-exist-in-style"}`}
                label={<span>Position</span>}
            >
                <div className='bg-neutral-200 p-1 text-xs'>
                    <div>
                        <button className='px-1.5 py-0.5' onClick={() => handleUpdateCustomValue("")}>Reset</button>
                    </div>
                </div>
            </PopoverRight>
            <div>
                <div className='css-position-setting-input'>
                    <CssCustomDropdownInput options={registeredValues} initialValue={settingProperty}
                        update={handleUpdateCustomValue}
                    />
                </div>
            </div>
            {["relative", "absolute", "fixed", "sticky"].includes(String(settingProperty)) &&
                <React.Fragment>
                    <div className='position-ltrb-setting-area'>
                        <FourPositionSetting />
                    </div>
                    <div className='position-relatedto-zindex-setting-area'>
                        <CssPositionRelativeToIndicator />
                        <CssCustomZIndexInput />
                    </div>
                </React.Fragment>
            }
        </React.Fragment>
    )
}

export default CssCustomPositionSetting