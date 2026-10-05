'use client'
import * as React from 'react';
const CssCustomTextInput = ({ initialValue,
    update,
    classList
}:
    {
        initialValue: string,
        classList?: string,
        update?: any,
    }) => {
    // other display Css dropdown open
    const [settingProperty, setsettingProperty] = React.useState<string>('');

    const updateText = (e: any) => {
        if (e !== initialValue) {
            update(e)
        }
        setsettingProperty(e)
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
        <input type='text'
        value={settingProperty}
        onChange={(e) => updateText(e.target.value)}
        className={`${classList}`}
      />
    )
}

export default CssCustomTextInput