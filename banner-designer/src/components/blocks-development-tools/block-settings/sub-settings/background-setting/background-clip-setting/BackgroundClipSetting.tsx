
'use client'
import * as React from 'react';
import { useDispatch, useSelector } from '@/store/builderHooks';
import useUpdateStyle from '@/components/blocks-development-tools/block-settings/hooks/update-hooks/useUpdateStyle';
import useInitialCssValue from '@/components/blocks-development-tools/block-settings/hooks/get-hooks/useInitialCssValue';
import PopoverRight from '@/components/blocks-development-tools/block-settings/custom-dropdown-select/PopoverRight';
import CssCustomDropdownInput from '@/components/blocks-development-tools/block-settings/custom-input/CssCustomDropdownInput';
import "./BackgroundClipSetting.css"
const BackgroundClipSetting = ({ cssKeyType = "background-clip" }: { cssKeyType?: string }) => {
  // other display Css dropdown open
  const registeredFont: any = {
    "none": "None",
    "border-box": "Border box",
    "padding-box": "Padding box",
    "content-box": "Content box",
  }
  const [settingProperty, setsettingProperty] = React.useState<string>('');
  const [settingPropertyInherited, setsettingPropertyInherited] = React.useState<boolean>(false);
  const pageBuilder = useSelector((state: any) => state.pageBuilder);
  const { selectedUid, insertIntoUid } = pageBuilder;
  const pageContent = useSelector((state: any) => state.pageContent);
  const { draftPageContentSet } = pageContent;

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
      } else {
        setsettingPropertyInherited(false);
        setsettingProperty("");
      }
    }
    // setElementStyle(draftPageContentSet[selectedUid]['style'])
  }, [pageBuilder, draftPageContentSet])

  return (
    <div className='background-clipping-setting-area'>
      <PopoverRight
        className={`background-clipping-setting-label  ${!settingProperty ? "css-key-not-exist-in-style" : settingPropertyInherited ? "css-key-value-inherited-from-default-in-style" : "css-key-value-exist-in-style"}`}
        label={<span>Clipping</span>}
      >
        <div className='bg-neutral-200 p-1 text-xs'>
          <div>
            <button className='px-1.5 py-0.5' onClick={() => handleUpdateCustomValue("")}>Reset</button>
          </div>
        </div>
      </PopoverRight>
      <div className='background-clipping-setting-input-area'>
        <CssCustomDropdownInput options={registeredFont} initialValue={settingProperty}
          update={handleUpdateCustomValue}
        />

      </div>
    </div>
  )
}

export default BackgroundClipSetting
