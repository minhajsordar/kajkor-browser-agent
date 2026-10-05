'use client'
import * as React from 'react';
import { useDispatch, useSelector } from '@/store/builderHooks';
import useUpdateStyle from '@/components/blocks-development-tools/block-settings/hooks/update-hooks/useUpdateStyle';
import useInitialCssValue from '@/components/blocks-development-tools/block-settings/hooks/get-hooks/useInitialCssValue';
import PopoverRight from '@/components/blocks-development-tools/block-settings/custom-dropdown-select/PopoverRight';
import "./FlexAlignmentSetting.css"
import CssCustomJustifyContentInput from '@/components/blocks-development-tools/block-settings/sub-settings/layout-setting/display-setting/flex-setting/flex-alignment/justify-content/CssCustomJustifyContentInput';
import CssCustomAlignItemsInput from '@/components/blocks-development-tools/block-settings/sub-settings/layout-setting/display-setting/flex-setting/flex-alignment/align-items/CssCustomAlignItemsInput';
import CssCustomVisualFlexAlignInput from '@/components/blocks-development-tools/block-settings/custom-input/CssCustomVisualFlexAlignInput';
import RowColGapSetting from '@/components/blocks-development-tools/block-settings/sub-settings/layout-setting/display-setting/flex-setting/flex-alignment/gap/RowColGapSetting';
import CssCustomAlignContentInput from '@/components/blocks-development-tools/block-settings/sub-settings/layout-setting/display-setting/flex-setting/flex-alignment/align-content/CssCustomAlignContentInput';
const FlexAlignmentSetting = ({ cssKeyType = "flex-direction" }: { cssKeyType?: string }) => {
    // other display Css dropdown open
    const justifyKey = "justify-content";
    const alignItems = "align-items";
    const [settingProperty, setsettingProperty] = React.useState<string>('');
    const [alignItemsProperty, setalignItemsProperty] = React.useState<string>('');
    const [justifyContent, setjustifyContent] = React.useState<string>('');
    const [alignItemsPropertyInherited, setalignItemsPropertyInherited] = React.useState<boolean>(false);
    const [justifyContentInherited, setjustifyContentInherited] = React.useState<boolean>(false);
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
    const handleGridUpdate = (value: any) => {
        updateStyleHook.update([{ key: justifyKey, value: `${value.justifyContent}` },
        { key: alignItems, value: `${value.alignItems}` }
        ])
    }; 
    React.useEffect(() => {
        if (selectedUid && alignItems) {
            const settingCssContentExist = initialCssValueHook.exist(alignItems)
            if (settingCssContentExist) {
                // update display Css
                const { value, inheritedFromDefault } = initialCssValueHook.get(alignItems);
                setalignItemsPropertyInherited(inheritedFromDefault);
                setalignItemsProperty(value);
            } else {
                setalignItemsPropertyInherited(false);
                setalignItemsProperty("");
            }
        }
        if (selectedUid && justifyKey) {
            const settingCssContentExist = initialCssValueHook.exist(justifyKey)
            if (settingCssContentExist) {
                // update display Css
                const { value, inheritedFromDefault } = initialCssValueHook.get(justifyKey);
                setjustifyContentInherited(inheritedFromDefault);
                setjustifyContent(value);
            } else {
                setjustifyContentInherited(false);
                setjustifyContent("");
            }
        }
    }, [pageBuilder, draftPageContentSet])

    return (
        <React.Fragment>
            <PopoverRight
                className={`flex-alignment-setting-label  ${!settingProperty ? "css-key-not-exist-in-style" : alignItemsPropertyInherited || justifyContentInherited ? "css-key-value-inherited-from-default-in-style" : "css-key-value-exist-in-style"}`}
                label={<span>Align</span>}
            >
                <div className='p-1 text-xs'>
                    <div>
                        <button className='text-xs p-0.5 custom-number-input-action-btn text-neutral-700 rounded-sm' onClick={() => handleUpdateCustomValue("")}>Reset</button>
                    </div>
                </div>
            </PopoverRight>
            <div className='flex-alignment-input-area'>
                <div className='flex-alignment-control-area'>
                    <div className='relative w-[62px] h-[62px]'>
                        <CssCustomVisualFlexAlignInput alignItemsProperty={alignItemsProperty} justifyContent={justifyContent}
                            update={handleGridUpdate}
                        />
                    </div>
                </div>
                <div className='flex-xy-control-area'>
                    <CssCustomJustifyContentInput />
                    <CssCustomAlignItemsInput />
                </div>
            </div>
            <RowColGapSetting/>
            <CssCustomAlignContentInput/>
        </React.Fragment>
    )
}

export default FlexAlignmentSetting