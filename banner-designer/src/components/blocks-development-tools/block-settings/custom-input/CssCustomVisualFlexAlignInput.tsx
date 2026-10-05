'use client'
import * as React from 'react';
import "./CssCustomVisualFlexAlignInput.css"

const CssCustomVisualFlexAlignInput = ({
    justifyContent = "flex-start",
    alignItemsProperty = "start",
    update,
    unit = "%" }:
    {
        alignItemsProperty: string,
        justifyContent: string,
        update?: any,
        unit?: string
    }) => {
    const availablePositions: any = {
        "0": { justifyContent: "flex-start", alignItems: "start" },
        "1": { justifyContent: "center", alignItems: "start" },
        "2": { justifyContent: "flex-end", alignItems: "start" },
        "3": { justifyContent: "flex-start", alignItems: "center" },
        "4": { justifyContent: "center", alignItems: "center" },
        "5": { justifyContent: "flex-end", alignItems: "center" },
        "6": { justifyContent: "flex-start", alignItems: "end" },
        "7": { justifyContent: "center", alignItems: "end" },
        "8": { justifyContent: "flex-end", alignItems: "end" },
    }

    const handleUpdateCustomValue = (value: string) => {
        if (update) {
            update(availablePositions[value])
        }
    };


    return (
        <React.Fragment>
            {/* {JSON.stringify(`${justifyContent}-${alignItemsProperty}`)} */}
            <div className='visual-flex-xy-input-bg-grid' >
                {Object.keys(availablePositions).map((key, index) => (
                    <div className='flex-xy-input-bg-action-item' data-value={key} key={key} onClick={() => handleUpdateCustomValue(key)}>
                        <svg
                            width={16}
                            height={16}
                            viewBox="0 0 16 16"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                        >
                            <rect
                                x={7}
                                y={7}
                                width={2}
                                height={2}
                                rx={1}
                                fill="currentColor"
                                fillOpacity="0.3"
                            />
                        </svg>
                    </div>
                ))}
            </div >
            <div className={`visual-flex-input-grid ${justifyContent}-${alignItemsProperty} !invisiblepointer-events-none`} >
                <div className='visual-flex-view-grid' >
                    {["flex-start-start", "center-start", "flex-end-start"].includes(`${justifyContent}-${alignItemsProperty}`) &&
                        <TopAlignedIcon />
                    }
                    {["flex-start-center", "center-center", "flex-end-center"].includes(`${justifyContent}-${alignItemsProperty}`) &&
                        <CenterAlignedIcon />
                    }
                    {["flex-start-end", "center-end", "flex-end-end"].includes(`${justifyContent}-${alignItemsProperty}`) &&
                        <BottomAlignedIcon />
                    }
                    {["flex-start-stretch", "center-stretch", "flex-end-stretch"].includes(`${justifyContent}-${alignItemsProperty}`) &&
                        <StretchIcon />
                    }
                    {["space-between-start", "space-between-center", "space-between-end"].includes(`${justifyContent}-${alignItemsProperty}`) &&
                        <SpaceBetweenIcon />
                    }
                    {["space-around-start", "space-around-center", "space-around-end"].includes(`${justifyContent}-${alignItemsProperty}`) &&
                        <SpaceAroundIcon />
                    }
                    {["space-between-stretch", "space-around-stretch"].includes(`${justifyContent}-${alignItemsProperty}`) &&
                        <StretchSpaceBetweenIcon />
                    }
                    {["flex-start-baseline", "center-baseline", "flex-end-baseline"].includes(`${justifyContent}-${alignItemsProperty}`) &&
                        <BaseLineIcon />
                    }
                    {["space-between-baseline", "space-around-baseline"].includes(`${justifyContent}-${alignItemsProperty}`) &&
                        <BaseLineSpaceBetweenIcon />
                    }
                </div>
            </div>
        </React.Fragment>
    )
}

export default CssCustomVisualFlexAlignInput

const TopAlignedIcon = () => {
    return (<svg
        width={16}
        height={16}
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
    >
        <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M3.5 7C3.22386 7 3 6.77614 3 6.5V3.5C3 3.22386 3.22386 3 3.5 3H4.5C4.77614 3 5 3.22386 5 3.5V6.5C5 6.77614 4.77614 7 4.5 7H3.5ZM7.5 13C7.22386 13 7 12.7761 7 12.5V3.5C7 3.22386 7.22386 3 7.5 3H8.5C8.77614 3 9 3.22386 9 3.5V12.5C9 12.7761 8.77614 13 8.5 13H7.5ZM11.5 3C11.2239 3 11 3.22386 11 3.5V8.5C11 8.77614 11.2239 9 11.5 9H12.5C12.7761 9 13 8.77614 13 8.5V3.5C13 3.22386 12.7761 3 12.5 3H11.5Z"
            fill="currentColor"
        />
    </svg>)
}
const CenterAlignedIcon = () => {
    return (<svg
        width={16}
        height={16}
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
    >
        <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M7.5 13C7.22386 13 7 12.7761 7 12.5V3.5C7 3.22386 7.22386 3 7.5 3H8.5C8.77614 3 9 3.22386 9 3.5V12.5C9 12.7761 8.77614 13 8.5 13H7.5ZM3.5 10C3.22386 10 3 9.77614 3 9.5V6.5C3 6.22386 3.22386 6 3.5 6H4.5C4.77614 6 5 6.22386 5 6.5V9.5C5 9.77614 4.77614 10 4.5 10H3.5ZM11.5 5C11.2239 5 11 5.22386 11 5.5V10.5C11 10.7761 11.2239 11 11.5 11H12.5C12.7761 11 13 10.7761 13 10.5V5.5C13 5.22386 12.7761 5 12.5 5H11.5Z"
            fill="currentColor"
        />
    </svg>)
}
const BottomAlignedIcon = () => {
    return (<svg
        width={16}
        height={16}
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
    >
        <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M11.5 7C11.2239 7 11 7.22386 11 7.5L11 12.5C11 12.7761 11.2239 13 11.5 13L12.5 13C12.7761 13 13 12.7761 13 12.5L13 7.5C13 7.22386 12.7761 7 12.5 7L11.5 7ZM7.5 13C7.22386 13 7 12.7761 7 12.5L7 3.5C7 3.22386 7.22386 3 7.5 3L8.5 3C8.77614 3 9 3.22386 9 3.5L9 12.5C9 12.7761 8.77614 13 8.5 13L7.5 13ZM3.5 13C3.22386 13 3 12.7761 3 12.5L3 9.5C3 9.22386 3.22386 9 3.5 9L4.5 9C4.77614 9 5 9.22386 5 9.5L5 12.5C5 12.7761 4.77614 13 4.5 13L3.5 13Z"
            fill="currentColor"
        />
    </svg>)
}
const SpaceBetweenIcon = () => {
    return (
        <svg
            width={60}
            height={20}
            viewBox="0 0 60 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
        >
            <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M9 6.5C9 6.22386 9.22386 6 9.5 6H10.5C10.7761 6 11 6.22386 11 6.5V10.5C11 10.7761 10.7761 11 10.5 11H9.5C9.22386 11 9 10.7761 9 10.5V6.5ZM29 6.5C29 6.22386 29.2239 6 29.5 6H30.5C30.7761 6 31 6.22386 31 6.5V15.5C31 15.7761 30.7761 16 30.5 16H29.5C29.2239 16 29 15.7761 29 15.5V6.5ZM49.5 6C49.2239 6 49 6.22386 49 6.5V12.5C49 12.7761 49.2239 13 49.5 13H50.5C50.7761 13 51 12.7761 51 12.5V6.5C51 6.22386 50.7761 6 50.5 6H49.5Z"
                fill="currentColor"
            />
        </svg>
    )
}
const SpaceAroundIcon = () => {
    return (
        <svg
            width={60}
            height={20}
            viewBox="0 0 60 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
        >
            <rect x={11} y={6} width={2} height={5} rx="0.5" fill="currentColor" />
            <rect x={29} y={6} width={2} height={10} rx="0.5" fill="currentColor" />
            <rect x={47} y={6} width={2} height={7} rx="0.5" fill="currentColor" />
            <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M5 10L8 8L5 6V10ZM55 6L52 8L55 10V6Z"
                fill="currentColor"
                fillOpacity="0.3"
            />
        </svg>

    )
}
const StretchIcon = () => {
    return (
        <svg
            width={20}
            height={60}
            viewBox="0 0 20 60"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
        >
            <g clipPath="url(#clip0_7665_493)">
                <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M7 53.5C7 53.7761 6.77614 54 6.5 54L5.5 54C5.22386 54 5 53.7761 5 53.5L5 6.5C5 6.22386 5.22386 6 5.5 6L6.5 6C6.77614 6 7 6.22386 7 6.5L7 53.5ZM11 53.5C11 53.7761 10.7761 54 10.5 54L9.5 54C9.22386 54 9 53.7761 9 53.5L9 6.5C9 6.22386 9.22386 6 9.5 6L10.5 6C10.7761 6 11 6.22386 11 6.5L11 53.5ZM14.5 54C14.7761 54 15 53.7761 15 53.5L15 6.5C15 6.22386 14.7761 6 14.5 6L13.5 6C13.2239 6 13 6.22386 13 6.5L13 53.5C13 53.7761 13.2239 54 13.5 54L14.5 54Z"
                    fill="currentColor"
                />
            </g>
            <defs>
                <clipPath id="clip0_7665_493">
                    <rect
                        width={60}
                        height={20}
                        fill="white"
                        transform="translate(0 60) rotate(-90)"
                    />
                </clipPath>
            </defs>
        </svg>
    )
}
const StretchSpaceBetweenIcon = () => {
    return (
        <svg
            width={60}
            height={60}
            viewBox="0 0 60 60"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
        >
            <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M11 53.5C11 53.7761 10.7761 54 10.5 54H9.5C9.22386 54 9 53.7761 9 53.5L9 6.5C9 6.22386 9.22386 6 9.5 6H10.5C10.7761 6 11 6.22386 11 6.5L11 53.5ZM31 53.5C31 53.7761 30.7761 54 30.5 54H29.5C29.2239 54 29 53.7761 29 53.5L29 6.5C29 6.22386 29.2239 6 29.5 6H30.5C30.7761 6 31 6.22386 31 6.5L31 53.5ZM50.5 54C50.7761 54 51 53.7761 51 53.5L51 6.5C51 6.22386 50.7761 6 50.5 6H49.5C49.2239 6 49 6.22386 49 6.5L49 53.5C49 53.7761 49.2239 54 49.5 54H50.5Z"
                fill="currentColor"
            />
        </svg>

    )
}
const StretchSpaceAroundIcon = () => {
    return (
        <svg
            width={60}
            height={60}
            viewBox="0 0 60 60"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
        >
            <path opacity="0.4" d="M8 30L5 32L5 28L8 30Z" fill="currentColor" />
            <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M13 53.5C13 53.7761 12.7761 54 12.5 54H11.5C11.2239 54 11 53.7761 11 53.5L11 6.5C11 6.22386 11.2239 6 11.5 6H12.5C12.7761 6 13 6.22386 13 6.5L13 53.5ZM31 53.5C31 53.7761 30.7761 54 30.5 54H29.5C29.2239 54 29 53.7761 29 53.5L29 6.5C29 6.22386 29.2239 6 29.5 6H30.5C30.7761 6 31 6.22386 31 6.5L31 53.5ZM48.5 54C48.7761 54 49 53.7761 49 53.5L49 6.5C49 6.22386 48.7761 6 48.5 6H47.5C47.2239 6 47 6.22386 47 6.5L47 53.5C47 53.7761 47.2239 54 47.5 54H48.5Z"
                fill="currentColor"
            />
            <path opacity="0.4" d="M52 30L55 28L55 32L52 30Z" fill="currentColor" />
        </svg>
    )
}
const BaseLineIcon = () => {
    return (
        <svg
            width={16}
            height={16}
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
        >
            <path
                d="M13 2V8.29289L14.6464 6.64645L15.3536 7.35355L12.5 10.2071L9.64645 7.35355L10.3536 6.64645L12 8.29289V2H13Z"
                fill="currentColor"
            />
            <path d="M16 12L1 12V13L16 13V12Z" fill="currentColor" />
            <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M4.62582 2H6.37412L8.72712 10H7.68476L7.09649 7.99994H3.90349L3.31524 10H2.27288L4.62582 2ZM6.80237 6.99994L5.62585 2.9999H5.37409L4.19761 6.99994H6.80237Z"
                fill="currentColor"
            />
        </svg>

    )
}
const BaseLineSpaceBetweenIcon = () => {
    return (
        <svg
            width={60}
            height={20}
            viewBox="0 0 60 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
        >
            <path
                d="M50.5996 4V10.2929L52.246 8.64645L52.9531 9.35355L50.0996 12.2071L47.246 9.35355L47.9531 8.64645L49.5996 10.2929V4H50.5996Z"
                fill="currentColor"
            />
            <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M9.35294 4H11.1012L13.4542 12H12.4119L11.8236 9.99994H8.63061L8.04236 12H7L9.35294 4ZM11.5295 8.99994L10.353 4.9999H10.1012L8.92473 8.99994H11.5295Z"
                fill="currentColor"
            />
            <path d="M6 14H54V15H6V14Z" fill="currentColor" />
        </svg>


    )
}
const BaseLineSpaceAroundIcon = () => {
    return (
        <svg
            width={60}
            height={20}
            viewBox="0 0 60 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
        >
            <path
                d="M40.8529 4V10.2929L42.4993 8.64645L43.2064 9.35355L40.3529 12.2071L37.4993 9.35355L38.2064 8.64645L39.8529 10.2929V4H40.8529Z"
                fill="currentColor"
            />
            <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M19.3523 4H21.1006L23.4536 12H22.4112L21.8229 9.99994H18.6299L18.0417 12H16.9993L19.3523 4ZM21.5288 8.99994L20.3523 4.9999H20.1005L18.924 8.99994H21.5288Z"
                fill="currentColor"
            />
            <path d="M6 14H54V15H6V14Z" fill="currentColor" />
        </svg>

    )
}