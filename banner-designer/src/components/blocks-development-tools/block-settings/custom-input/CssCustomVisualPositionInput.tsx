'use client'
import * as React from 'react';
import "./CssCustomVisualPositionInput.css"

const CssCustomVisualPositionInput = ({ initialValue,
    update,
    unit = "%" }:
    {
        initialValue: string,
        update?: any,
        unit?: string
    }) => {
    const availablePositions: any = {
        "0% 0%": "0% 0%",
        "50% 0%": "50% 0%",
        "100% 0%": "100% 0%",
        "0% 50%": "0% 50%",
        "50% 50%": "50% 50%",
        "100% 50%": "100% 50%",
        "0% 100%": "0% 100%",
        "50% 100%": "50% 100%",
        "100% 100%": "100% 100%",
    }
    // other display Css dropdown 
    const [settingProperty, setsettingProperty] = React.useState<string>('');

    const handleUpdateCustomValue = (value: string) => {
        if(update){
            update(`${value}`)
        }
    };
    React.useEffect(() => {
        if (initialValue !== undefined && initialValue !== settingProperty) {
            setsettingProperty(initialValue);
        }
    }, [initialValue])

    return (
        <div className='visual-position-input-grid' >
            {Object.keys(availablePositions).map((key, index) => (
                <div className='cursor-pointer' key={key} onClick={()=>handleUpdateCustomValue(key)}>
                    {settingProperty === key ?
                        <svg
                            width={16}
                            height={16}
                            viewBox="0 0 16 16"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                        >
                            <path
                                d="M8.50008 0.792969L11.3536 3.64652L10.6465 4.35363L8.50008 2.20718L6.35363 4.35363L5.64652 3.64652L8.50008 0.792969Z"
                                fill="currentColor"
                            />
                            <path
                                d="M1.79297 7.50008L4.64652 4.64652L5.35363 5.35363L3.20718 7.50008L5.35363 9.64652L4.64652 10.3536L1.79297 7.50008Z"
                                fill="currentColor"
                            />
                            <path
                                d="M10.0001 7.50008C10.0001 8.3285 9.3285 9.00008 8.50008 9.00008C7.67165 9.00008 7.00008 8.3285 7.00008 7.50008C7.00008 6.67165 7.67165 6.00008 8.50008 6.00008C9.3285 6.00008 10.0001 6.67165 10.0001 7.50008Z"
                                fill="currentColor"
                            />
                            <path
                                d="M8.50008 14.2072L11.3536 11.3536L10.6465 10.6465L8.50008 12.793L6.35363 10.6465L5.64652 11.3536L8.50008 14.2072Z"
                                fill="currentColor"
                            />
                            <path
                                d="M15.2072 7.50008L12.3536 4.64652L11.6465 5.35363L13.793 7.50008L11.6465 9.64652L12.3536 10.3536L15.2072 7.50008Z"
                                fill="currentColor"
                            />
                        </svg> :
                        <svg
                            width={16}
                            height={16}
                            viewBox="0 0 16 16"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                        >
                            <rect
                                fill="currentColor"
                                x={8}
                                y={8}
                                width={3}
                                height={3}
                                rx={2}
                                fillRule="evenodd"
                            />
                        </svg>
                    }
                </div>
            ))}
        </div >
    )
}

export default CssCustomVisualPositionInput