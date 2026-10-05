'use client'
import * as React from 'react';
import { useDispatch, useSelector } from '@/store/builderHooks';
import useUpdateStyle from '@/components/blocks-development-tools/block-settings/hooks/update-hooks/useUpdateStyle';
import useInitialCssValue from '@/components/blocks-development-tools/block-settings/hooks/get-hooks/useInitialCssValue';
import PopoverRight from '@/components/blocks-development-tools/block-settings/custom-dropdown-select/PopoverRight';
const DisplayGridSetting = () => {
    // other display Css dropdown open
    const [justifyContentCss, setJustifyContentCss] = React.useState<string>('flex-start');
    const [justifyContentCssInherited, setJustifyContentCssInherited] = React.useState<boolean>(false);
    const [alignItemsCss, setAlignItemsCss] = React.useState<string>('flex-start');
    const [alignItemsCssInherited, setAlignItemsCssInherited] = React.useState<boolean>(false);
    const [alignContentCss, setAlignContentCss] = React.useState<string>('flex-start');
    const [alignContentCssInherited, setAlignContentCssInherited] = React.useState<boolean>(false);
    const dispatch = useDispatch()
    const pageBuilder = useSelector((state: any) => state.pageBuilder);
    const { selectedUid, insertIntoUid } = pageBuilder;
    const pageContent = useSelector((state: any) => state.pageContent);
    const {   draftPageContentSet } = pageContent;

    const updateStyleHook = useUpdateStyle()
    const initialCssValueHook = useInitialCssValue()

    const handleClickJustifyContentCssChange = (value: string) => {
        setJustifyContentCss(value);
        if (value) {
            updateStyleHook.update([{ key: "justify-content", value: value }])
        } else {
            updateStyleHook.update([{ key: "justify-content", value: null }])
        }
    };
    const handleClickAlignItemsCssChange = (value: string) => {
        setAlignItemsCss(value);
        if (value) {
            updateStyleHook.update([{ key: "align-items", value: value }])
        } else {
            updateStyleHook.update([{ key: "align-items", value: null }])
        }
    };
    const handleClickAlignContentCssChange = (value:string) => {
        setAlignContentCss(value);
        if (value) {
            updateStyleHook.update([{ key: "align-content", value: value }])
        } else {
            updateStyleHook.update([{ key: "align-content", value: null }])
        }
    };
    React.useEffect(() => {
        if (selectedUid) {
            const settingCssContentExist = initialCssValueHook.exist('justify-content')
            if (settingCssContentExist) {
                // update display Css
                const { value, inheritedFromDefault } = initialCssValueHook.get("justify-content")
                setJustifyContentCss(value)
                setJustifyContentCssInherited(inheritedFromDefault)
            } else {
                setJustifyContentCssInherited(false)
                setJustifyContentCss("")
            }
            const alignItemsExist = initialCssValueHook.exist('align-items')
            if (alignItemsExist) {
                // update display Css
                const { value, inheritedFromDefault } = initialCssValueHook.get("align-items")
                setAlignItemsCss(value)
                setAlignItemsCssInherited(inheritedFromDefault)
            } else {
                setAlignItemsCssInherited(false)
                setAlignItemsCss("")
            }
            const alignContentExist = initialCssValueHook.exist('align-content')
            if (alignContentExist) {
                // update display Css
                const { value, inheritedFromDefault } = initialCssValueHook.get("align-content")
                setAlignContentCss(value)
                setAlignContentCssInherited(inheritedFromDefault)
            } else {
                setAlignContentCssInherited(false)
                setAlignContentCss("")
            }
        }
        // setElementStyle(draftPageContentSet[selectedUid]['style'])
    }, [pageBuilder, draftPageContentSet])

    return (
        <div>
            <div className='flex flex-wrap gap-1 items-center'>
                <div className='flex justify-between items-center gap-2'>
                    <h3 className={`text-xs px-1.5 rounded-sm py-0.5 bg-neutral-200 ${!justifyContentCss ? "css-key-not-exist-in-style" : justifyContentCssInherited ? "css-key-value-inherited-from-default-in-style" : "css-key-value-exist-in-style"}`}>Justify Content</h3>
                    <div>
                        <PopoverRight label={<button className='text-xs py-0.5 px-1.5 bg-neutral-200 text-neutral-700 rounded-sm'>{justifyContentCss ? justifyContentCss : "Disabled"}</button>}>
                            <div className='bg-neutral-200 p-1'>
                                <div className='flex flex-wrap gap-0.5'>
                                    <button className='text-xs p-0.5 bg-neutral-100 text-neutral-700 rounded-sm' onClick={() => handleClickJustifyContentCssChange("flex-start")}>Flex Start</button>
                                    <button className='text-xs p-0.5 bg-neutral-100 text-neutral-700 rounded-sm' onClick={() => handleClickJustifyContentCssChange("center")}>Center</button>
                                    <button className='text-xs p-0.5 bg-neutral-100 text-neutral-700 rounded-sm' onClick={() => handleClickJustifyContentCssChange("flex-end")}>Flex End</button>
                                    <button className='text-xs p-0.5 bg-neutral-100 text-neutral-700 rounded-sm' onClick={() => handleClickJustifyContentCssChange("space-between")}>Space Between</button>
                                    <button className='text-xs p-0.5 bg-neutral-100 text-neutral-700 rounded-sm' onClick={() => handleClickJustifyContentCssChange("space-around")}>Space Around</button>
                                    <button className='text-xs p-0.5 bg-neutral-100 text-neutral-700 rounded-sm' onClick={() => handleClickJustifyContentCssChange("space-evenly")}>Space Evenly</button>
                                </div>
                            </div>
                        </PopoverRight>
                    </div>
                </div>
            </div>
            <div className='flex flex-wrap gap-1 items-center'>
                <div className='flex justify-between items-center gap-2'>
                    <h3 className={`text-xs px-1.5 rounded-sm py-0.5 bg-neutral-200 ${!alignItemsCss ? "css-key-not-exist-in-style" : alignItemsCssInherited ? "css-key-value-inherited-from-default-in-style" : "css-key-value-exist-in-style"}`}>Align Items</h3>
                    <div>
                        <PopoverRight label={<button className='text-xs py-0.5 px-1.5 bg-neutral-200 text-neutral-700 rounded-sm'>{alignItemsCss ? alignItemsCss : "Disabled"}</button>}>
                            <div className='bg-neutral-200 p-1'>
                                <div className='flex flex-wrap gap-0.5'>
                                    <button className='text-xs p-0.5 bg-neutral-100 text-neutral-700 rounded-sm' onClick={() => handleClickAlignItemsCssChange("flex-start")}>Flex Start</button>
                                    <button className='text-xs p-0.5 bg-neutral-100 text-neutral-700 rounded-sm' onClick={() => handleClickAlignItemsCssChange("center")}>Center</button>
                                    <button className='text-xs p-0.5 bg-neutral-100 text-neutral-700 rounded-sm' onClick={() => handleClickAlignItemsCssChange("flex-end")}>Flex End</button>
                                    <button className='text-xs p-0.5 bg-neutral-100 text-neutral-700 rounded-sm' onClick={() => handleClickAlignItemsCssChange("stretch")}>Stretch</button>
                                </div>
                            </div>
                        </PopoverRight>
                    </div>
                </div>
            </div>
            <div className='flex flex-wrap gap-1 items-center'>
                <div className='flex justify-between items-center gap-2'>
                    <h3 className={`text-xs px-1.5 rounded-sm py-0.5 bg-neutral-200 ${!alignContentCss ? "css-key-not-exist-in-style" : alignContentCssInherited ? "css-key-value-inherited-from-default-in-style" : "css-key-value-exist-in-style"}`}>Align Content</h3>
                    <div>
                        <PopoverRight label={<button className='text-xs py-0.5 px-1.5 bg-neutral-200 text-neutral-700 rounded-sm'>{alignContentCss ? alignContentCss : "Disabled"}</button>}>
                            <div className='bg-neutral-200 p-1'>
                                <div className='flex flex-wrap gap-0.5'>
                                    <button className='text-xs p-0.5 bg-neutral-100 text-neutral-700 rounded-sm' onClick={() => handleClickAlignContentCssChange("flex-start")}>Flex Start</button>
                                    <button className='text-xs p-0.5 bg-neutral-100 text-neutral-700 rounded-sm' onClick={() => handleClickAlignContentCssChange("center")}>Center</button>
                                    <button className='text-xs p-0.5 bg-neutral-100 text-neutral-700 rounded-sm' onClick={() => handleClickAlignContentCssChange("flex-end")}>Flex End</button>
                                    <button className='text-xs p-0.5 bg-neutral-100 text-neutral-700 rounded-sm' onClick={() => handleClickAlignContentCssChange("stretch")}>Stretch</button>
                                    <button className='text-xs p-0.5 bg-neutral-100 text-neutral-700 rounded-sm' onClick={() => handleClickAlignContentCssChange("space-between")}>Space Between</button>
                                    <button className='text-xs p-0.5 bg-neutral-100 text-neutral-700 rounded-sm' onClick={() => handleClickAlignContentCssChange("space-around")}>Space Around</button>
                                </div>
                            </div>
                        </PopoverRight>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default DisplayGridSetting