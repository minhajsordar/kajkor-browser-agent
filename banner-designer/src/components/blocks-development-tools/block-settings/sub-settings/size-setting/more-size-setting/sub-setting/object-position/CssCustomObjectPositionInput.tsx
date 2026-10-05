'use client'
import * as React from 'react';
import { useDispatch, useSelector } from '@/store/builderHooks';
import useUpdateStyle from '@/components/blocks-development-tools/block-settings/hooks/update-hooks/useUpdateStyle';
import useInitialCssValue from '@/components/blocks-development-tools/block-settings/hooks/get-hooks/useInitialCssValue';
import PopoverRight from '@/components/blocks-development-tools/block-settings/custom-dropdown-select/PopoverRight';
import CssCustomVisualPositionInput from '@/components/blocks-development-tools/block-settings/custom-input/CssCustomVisualPositionInput';
import "./CssCustomObjectPositionInput.css"
import CssCustomNumUnitInput from '@/components/blocks-development-tools/block-settings/custom-input/CssCustomNumUnitInput';
const CssCustomObjectPositionInput = ({ cssKeyType = "object-position" }: { cssKeyType?: string }) => {
    // other display Css dropdown open

    // other display Css dropdown open
    const [left, setLeft] = React.useState<string>('');
    const [top, setTop] = React.useState<string>('');
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
        updateStyleHook.update([{ key: cssKeyType, value: `${value}` }])
    };
    const handleUpdateLeftValue = (value: string) => {
        if (!value && !top) {
            handleUpdateCustomValue("")
        } else {
            updateStyleHook.update([{ key: cssKeyType, value: `${value} ${top}` }])
        }
    };
    const handleUpdateTopValue = (value: string) => {
        if (!value && !left) {
            handleUpdateCustomValue("")
        } else {
            updateStyleHook.update([{ key: cssKeyType, value: `${left} ${value}` }])
        }
    };
    React.useEffect(() => {
        if (selectedUid && cssKeyType) {
            const settingCssContentExist = initialCssValueHook.exist(cssKeyType)
            if (settingCssContentExist) {
                // update display Css
                const { value, inheritedFromDefault } = initialCssValueHook.get(cssKeyType);
                if (value) {
                    const leftTop = value.split(" ");
                    if (leftTop.length == 2) {
                        console.log("setting value ", leftTop[0], leftTop[1])
                        setLeft(leftTop[0])
                        setTop(leftTop[1])
                    } else {
                        setLeft("")
                        setTop("")
                    }
                } else {
                    setIsCustomProperty(false)
                    setLeft("")
                    setTop("")
                }
                setsettingPropertyInherited(inheritedFromDefault);
                setsettingProperty(value);
            } else {
                setIsCustomProperty(false)
                setsettingPropertyInherited(false);
                setsettingProperty("");
                setLeft("")
                setTop("")
            }
        }
        // setElementStyle(draftPageContentSet[selectedUid]['style'])
    }, [pageBuilder, draftPageContentSet])

    return (
        <PopoverRight
            className={`object-position-custom-css-input-container  ${!settingProperty ? "css-key-not-exist-in-style" : settingPropertyInherited ? "css-key-value-inherited-from-default-in-style" : "css-key-value-exist-in-style"}`}
            label={
                <button>
                    <svg
                        data-wf-icon="MoreIcon"
                        width={16}
                        height={16}
                        viewBox="0 0 16 16"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <path
                            d="M3 8C3 7.44772 3.44772 7 4 7C4.55228 7 5 7.44772 5 8C5 8.55228 4.55228 9 4 9C3.44772 9 3 8.55228 3 8Z"
                            fill="currentColor"
                        />
                        <path
                            d="M7 8C7 7.44772 7.44772 7 8 7C8.55228 7 9 7.44772 9 8C9 8.55228 8.55228 9 8 9C7.44772 9 7 8.55228 7 8Z"
                            fill="currentColor"
                        />
                        <path
                            d="M11 8C11 7.44772 11.4477 7 12 7C12.5523 7 13 7.44772 13 8C13 8.55228 12.5523 9 12 9C11.4477 9 11 8.55228 11 8Z"
                            fill="currentColor"
                        />
                    </svg>
                </button>
            }
        >
            <div className='bg-neutral-200 p-1 text-xs'>
                <div className='object-position-setting-container'>
                    <PopoverRight
                        className={`object-position-setting-label  ${!settingProperty ? "css-key-not-exist-in-style" : settingPropertyInherited ? "css-key-value-inherited-from-default-in-style" : "css-key-value-exist-in-style"}`}
                        label={<span>Position</span>}
                    >
                        <div className='bg-neutral-200 p-1 text-xs'>
                            <div>
                                <button className='px-1.5 py-0.5' onClick={() => handleUpdateCustomValue("")}>Reset</button>
                            </div>
                        </div>
                    </PopoverRight>
                    <div className='object-position-setting-items-box'>
                        <div className="object-position-visual-setting">
                            <CssCustomVisualPositionInput
                                initialValue={settingProperty}
                                update={handleUpdateCustomValue}
                            />
                        </div>
                        <div className="object-position-custom-number-setting">
                            <div className='object-left-position-setting'>
                                <div>
                                    <CssCustomNumUnitInput
                                        initialValue={left}
                                        update={handleUpdateLeftValue}
                                    />
                                </div>
                            </div>
                            <div className='object-top-position-setting'>
                                <div>
                                    <CssCustomNumUnitInput
                                        initialValue={top}
                                        update={handleUpdateTopValue}
                                    />
                                </div>
                            </div>
                            <div className='object-left-position-label'>Left</div>
                            <div className='object-top-position-label'>Top</div>
                        </div>
                    </div>
                </div>
            </div>
        </PopoverRight>

    )
}

export default CssCustomObjectPositionInput