'use client'
import * as React from 'react';
import { useDispatch, useSelector } from '@/store/builderHooks';
import useUpdateStyle from '@/components/blocks-development-tools/block-settings/hooks/update-hooks/useUpdateStyle';
import useInitialCssValue from '@/components/blocks-development-tools/block-settings/hooks/get-hooks/useInitialCssValue';
import PopoverRight from '@/components/blocks-development-tools/block-settings/custom-dropdown-select/PopoverRight';
import "./BackgroundColorSetting.css"
import CssCustomColorInput from '../../../custom-input/CssCustomColorInput';
import CssCustomTextInput from '../../../custom-input/CssCustomTextInput';
const BackgroundColorSetting = ({ cssKeyType = "background-color" }: { cssKeyType?: string }) => {

  // other display Css dropdown open
  const [settingProperty, setsettingProperty] = React.useState<string>('');
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
    <div className='background-color-setting-area'>

      <PopoverRight
        className={`background-color-setting-label ${!settingProperty ? "css-key-not-exist-in-style" : settingPropertyInherited ? "css-key-value-inherited-from-default-in-style" : "css-key-value-exist-in-style"}`}
        label={<span>Color</span>}
      >
        <div className='bg-neutral-200 p-1 text-xs'>
          <div>
            <button className='px-1.5 py-0.5' onClick={() => handleUpdateCustomValue("")}>Reset</button>
          </div>
        </div>
      </PopoverRight>
      <div className='background-color-setting-input-area'>
        <div className='w-full h-[22px] relative'>
          <PopoverRight
            className='absolute top-1 left-0 translate-x-[-50%] translate-y-[-50%] w-[8px] hover:w-[14px] h-[8px] hover:h-[14px] bg-white border-2 hover:!border-4 !border-blue-500 rounded-full text-xs z-[999] overflow-hidden flex justify-center items-center'
            label={""}
          >
            <div className='bg-neutral-200 p-1'>
              <p className='text-xs'>Set Custom Value</p>
              <input type='text'
                value={settingProperty}
                onChange={(e) => handleUpdateCustomValue(e.target.value)}
                className='ps-[5px] pr-[25px] py-[3px] w-full bg-gray-400 outline-none rounded-sm text-xs'
              />
            </div>
          </PopoverRight>
          <div className='w-full h-[22px] absolute right-0 top-0'>
            <div className='absolute top-0 left-0 w-[22px] h-[22px] border-0.5 border-white'>
              <CssCustomColorInput initialValue={settingProperty}
                update={handleUpdateCustomValue}
              />
            </div>
            <CssCustomTextInput
              initialValue={settingProperty}
              update={handleUpdateCustomValue}
              classList='absolute top-0 left-[22px] !w-[calc(100%_-_22px)] setting-num-input text-neutral-700 bg-transparent'
            />

          </div>

        </div>
      </div>
    </div>

  )
}

export default BackgroundColorSetting