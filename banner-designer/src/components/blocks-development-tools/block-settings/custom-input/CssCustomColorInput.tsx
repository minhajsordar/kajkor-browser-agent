'use client'
import * as React from 'react';
import PopoverRight from '../custom-dropdown-select/PopoverRight';
import { Sketch } from '@uiw/react-color';
const CssCustomColorInput = ({ initialValue,
    update,
}:
    {
        initialValue: string,
        update?: any,
    }) => {
    // other display Css dropdown open
    const [settingProperty, setsettingProperty] = React.useState<string>('');

    const updateCol = (e: any) => {
        const colorString = `rgb(${e.rgba.r} ${e.rgba.g} ${e.rgba.b} / ${Number(e.rgba.a).toFixed(2)})`
        if (colorString !== initialValue) {
            if(update){
                update(colorString)
            }
        }
        setsettingProperty(colorString)
    }
    React.useEffect(() => {
        if (initialValue !== undefined && initialValue !== settingProperty) {
            if (initialValue) {
                setsettingProperty(initialValue);
            } else {
                setsettingProperty("#000000");
            }
        }
    }, [initialValue, open])

    return (
        <div className='flex items-center w-full h-full min-w-[12px] min-h-[12px] border'>
            <PopoverRight
                className={`w-full h-full min-w-[12px] min-h-[12px]`}
                label={""}
                style={{ backgroundColor: `${settingProperty}` }}
            >
                <div className='p-1 text-xs'>
                    <Sketch
                        color={settingProperty}
                        onChange={updateCol}
                    />
                </div>
            </PopoverRight>
        </div >
    )
}

export default CssCustomColorInput