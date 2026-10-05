'use client'
import * as React from 'react';
import { useDispatch, useSelector } from '@/store/builderHooks';
import useUpdateStyle from '@/components/blocks-development-tools/block-settings/hooks/update-hooks/useUpdateStyle';
import useInitialCssValue from '@/components/blocks-development-tools/block-settings/hooks/get-hooks/useInitialCssValue';
import CssCustomNumUnitInput from '@/components/blocks-development-tools/block-settings/custom-input/CssCustomNumUnitInput';
import PopoverRight from '@/components/blocks-development-tools/block-settings/custom-dropdown-select/PopoverRight';
import "./PaddingTopSetting.css"

const PaddingTopSetting = ({ cssKeyType = "padding-top" }: { cssKeyType?: string }) => {
  // other display Css dropdown open
  const unitsSet: any = {
    "px": "PX",
    "%": "%",
    "em": "EM",
    "rem": "REM",
    "ch": "CH",
    "vw": "VW",
    "vh": "VH",
    "svw": "SVW",
    "svh": "SVH",
    "auto": "AUTO",
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
        setsettingProperty(value)
      } else {
        setsettingPropertyInherited(false);
        setsettingProperty("")
      }
    }
  }, [pageBuilder, draftPageContentSet])

  return (
    <div className='padding-top-setting-area'>
      <PopoverRight
        className={`padding-top-setting-label ${!settingProperty ? "css-key-not-exist-in-style" : settingPropertyInherited ? "css-key-value-inherited-from-default-in-style" : "css-key-value-exist-in-style"}`}
        label={<span>{settingProperty ? settingProperty : "Auto"}</span>}
      >
        <div className='p-1 text-xs'>
          <div>
            <button className='px-1.5 py-0.5' onClick={() => handleUpdateCustomValue("")}>Reset</button>
          </div>
          <CssCustomNumUnitInput
            initialValue={settingProperty}
            units={unitsSet}
            update={handleUpdateCustomValue}
          />
        </div>
      </PopoverRight>
    </div>
  )
}

export default PaddingTopSetting
