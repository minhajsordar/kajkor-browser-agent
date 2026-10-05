'use client'
import * as React from 'react';
import { useDispatch, useSelector } from '@/store/builderHooks';
import useUpdateStyle from '@/components/blocks-development-tools/block-settings/hooks/update-hooks/useUpdateStyle';
import useInitialCssValue from '@/components/blocks-development-tools/block-settings/hooks/get-hooks/useInitialCssValue';
import PopoverRight from '@/components/blocks-development-tools/block-settings/custom-dropdown-select/PopoverRight';
const SingleSpacingSetting = ({ spacingType = "margin" }: { spacingType?: string }) => {
    // other display Css dropdown open
    const [settingProperty, setsettingProperty] = React.useState<string>('');
    const [settingPropertyInherited, setsettingPropertyInherited] = React.useState<boolean>(false);
    const dispatch = useDispatch()
    const pageBuilder = useSelector((state: any) => state.pageBuilder);
    const { selectedUid, insertIntoUid } = pageBuilder;
    const pageContent = useSelector((state: any) => state.pageContent);
    const {   draftPageContentSet } = pageContent;

    const updateStyleHook = useUpdateStyle()
    const initialCssValueHook = useInitialCssValue()

    const handleClicksettingPropertyChange = (value: string) => {
        setsettingProperty(value);
        if (value) {
            // spacingType for example margin-left
            updateStyleHook.update([{ key: spacingType, value: value }])
        } else {
            updateStyleHook.update([{ key: spacingType, value: null }])
        }
    };
    React.useEffect(() => {
        if (selectedUid) {
            const settingCssContentExist = initialCssValueHook.exist(spacingType)
            if (settingCssContentExist) {
                // update display Css
                const { value, inheritedFromDefault } = initialCssValueHook.get(spacingType)
                setsettingProperty(value)
                setsettingPropertyInherited(inheritedFromDefault)
            } else {
                setsettingPropertyInherited(false)
                setsettingProperty("")
            }
        }
        // setElementStyle(draftPageContentSet[selectedUid]['style'])
    }, [pageBuilder, draftPageContentSet])

    return (
        <div className='flex flex-wrap gap-1 items-center'>
            <div className='flex justify-between items-center gap-2'>
                <h3 className={`text-xs px-1.5 rounded-sm py-0.5 bg-neutral-200 ${!settingProperty ? "css-key-not-exist-in-style" : settingPropertyInherited ? "css-key-value-inherited-from-default-in-style" : "css-key-value-exist-in-style"}`}>{spacingType}</h3>
                <div>
                    <PopoverRight label={<button className='text-xs py-0.5 px-1.5 bg-neutral-200 text-neutral-700 rounded-sm'>{settingProperty ? settingProperty : "0px"}</button>}>
                        <div className='bg-neutral-200 p-1'>
                            <div className='flex flex-wrap gap-0.5'>
                                <button className='text-xs p-0.5 bg-neutral-100 text-neutral-700 rounded-sm' onClick={() => handleClicksettingPropertyChange("0px")}>0 Px</button>
                                <button className='text-xs p-0.5 bg-neutral-100 text-neutral-700 rounded-sm' onClick={() => handleClicksettingPropertyChange("5px")}>5 Px</button>
                                <button className='text-xs p-0.5 bg-neutral-100 text-neutral-700 rounded-sm' onClick={() => handleClicksettingPropertyChange("10px")}>10 Px</button>
                            </div>
                        </div>
                    </PopoverRight>
                </div>
            </div>
        </div>
    )
}

export default SingleSpacingSetting