'use client'
import * as React from 'react';
import { useDispatch, useSelector } from '@/store/builderHooks';
import useUpdateStyle from '@/components/blocks-development-tools/block-settings/hooks/update-hooks/useUpdateStyle';
import useInitialCssValue from '@/components/blocks-development-tools/block-settings/hooks/get-hooks/useInitialCssValue';
import PopoverRight from '@/components/blocks-development-tools/block-settings/custom-dropdown-select/PopoverRight';
import CssCustomDropdownInput from '@/components/blocks-development-tools/block-settings/custom-input/CssCustomDropdownInput';

const CssCustomFontWeightInput = ({ cssKeyType = "font-weight" }: { cssKeyType?: string }) => {
    const availableFontWeight: any = {
        "100": "Thin 100",
        "200": "Extra Light 200",
        "300": "Light 300",
        "400": "Normal 400",
        "500": "Medium 500",
        "600": "Semi Bold 600",
        "700": "Bold 700",
        "800": "Extra Bold 800",
        "900": "Black 900",
    }
    // other display Css dropdown open
    const [settingProperty, setsettingProperty] = React.useState<string>('');
    const [settingPropertyInherited, setsettingPropertyInherited] = React.useState<boolean>(false);
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
    }, [pageBuilder, draftPageContentSet])

    return (
        <React.Fragment>
            <PopoverRight
                className={`setting-items-name  ${!settingProperty ? "css-key-not-exist-in-style" : settingPropertyInherited ? "css-key-value-inherited-from-default-in-style" : "css-key-value-exist-in-style"}`}
                label={<span>Weight</span>}
            >
                <div className='bg-neutral-200 p-1 text-xs'>
                    <div>
                        <button className='px-1.5 py-0.5' onClick={()=>handleUpdateCustomValue("")}>Reset</button>
                    </div>
                </div>
            </PopoverRight>
            <div className='setting-items-box-1-4'>
                <CssCustomDropdownInput initialValue={settingProperty} options={availableFontWeight}
                    update={handleUpdateCustomValue}
                />
            </div>
        </React.Fragment>
    )
}

export default CssCustomFontWeightInput