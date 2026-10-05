'use client'
import * as React from 'react';
import CssCustomVisualPositionInput from '../../../../custom-input/CssCustomVisualPositionInput'
import { backgroundImageExample } from '../backgroundImageExample';
const _ = { cloneDeep: (o: any) => JSON.parse(JSON.stringify(o)), isEqual: (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b) };
import CssCustomNumUnitObjectInput from '../../../../custom-input/CssCustomNumUnitObjectInput';
import CssCustomCircularSliderInput from '../../../../custom-input/slider-input/CssCustomCircularSliderInput';
import CssCustomLinearGradientPositionSlider from '../../../../custom-input/slider-input/CssCustomLinearGradientPositionSlider';
import CssCustomColorInput from '@/components/blocks-development-tools/block-settings/custom-input/CssCustomColorInput';

const BackgroundRadialGradientObjectInput = ({
    settingProperty,
    activeSettingIndex,
    handleSelectIndex,
    updateByKeyValue,
}: {
    settingProperty: any,
    updateByKeyValue: any,
    handleSelectIndex: any,
    activeSettingIndex: number
}) => {
    return (
        <React.Fragment>
            <div className='horizontal-separator'></div>
            <div className='background-image-position-label'>Position</div>
            <div className="background-image-position-setting-area">
                <CssCustomVisualPositionInput initialValue='' />
                <div className='background-position-setting-input'>
                    <div className='w-[50px]'>
                        <CssCustomNumUnitObjectInput
                            initialValue={settingProperty[activeSettingIndex].position.x}
                        />
                    </div>
                    <div className='w-[50px]'>
                        <CssCustomNumUnitObjectInput
                            initialValue={settingProperty[activeSettingIndex].position.y}
                        />
                    </div>
                    <div className='background-position-x-label'>Left</div>
                    <div className='background-position-y-label'>Right</div>
                </div>
            </div>
            <div className='horizontal-separator'></div>
            <div className='background-radial-gradient-size-label'>Size</div>
            <div className="background-radial-gradient-size-setting-area">
                <div className='setting-input-tab-area'
                    style={{ gridColumn: "1 / -1" }}
                >
                    <button className={`${settingProperty[activeSettingIndex]?.radialSize == 'farthest-corner' ? 'setting-input-active-tab' : 'setting-input-inactive-tab'}`} onClick={() => updateByKeyValue('radialSize', "farthest-corner")}>
                        <svg
                            data-icon="GradientRadialFarthestCorner"
                            aria-hidden="true"
                            focusable="false"
                            width={16}
                            height={16}
                            viewBox="0 0 16 16"
                            className="bem-Svg"
                            style={{ display: "block" }}
                        >
                            <path
                                opacity=".6"
                                fillRule="evenodd"
                                clipRule="evenodd"
                                d="M14 2H2v12h9v1H1V1h14v10h-1V2z"
                                fill="currentColor"
                            />
                            <path
                                opacity=".4"
                                fillRule="evenodd"
                                clipRule="evenodd"
                                d="M11 13.12V14H2V2h12v9h-.88L8.976 6.854a2.5 2.5 0 10-2.12 2.12L11 13.122z"
                                fill="currentColor"
                            />
                            <circle
                                cx="1.5"
                                cy="1.5"
                                r="1.5"
                                transform="translate(5 5)"
                                fill="currentColor"
                            />
                            <path
                                fillRule="evenodd"
                                clipRule="evenodd"
                                d="M8.586 7.88c-.186.28-.427.52-.707.706L13.29 14H12v1h3v-3h-1v1.293L8.586 7.88z"
                                fill="currentColor"
                            />
                        </svg>
                    </button>
                    <button className={`${settingProperty[activeSettingIndex]?.radialSize == 'farthest-side' ? 'setting-input-active-tab' : 'setting-input-inactive-tab'}`} onClick={() => updateByKeyValue('radialSize', "farthest-side")}>
                        <svg
                            data-icon="GradientRadialFarthestSide"
                            aria-hidden="true"
                            focusable="false"
                            width={16}
                            height={16}
                            viewBox="0 0 16 16"
                            className="bem-Svg"
                            style={{ display: "block" }}
                        >
                            <path
                                opacity=".6"
                                fillRule="evenodd"
                                clipRule="evenodd"
                                d="M13 2H2v12h11v1H1V1h12v1z"
                                fill="currentColor"
                            />
                            <path
                                opacity=".4"
                                fillRule="evenodd"
                                clipRule="evenodd"
                                d="M13.85 5a7.465 7.465 0 00-1.35-3H2v10.5A7.503 7.503 0 0013.85 8H8.5a2.5 2.5 0 110-3h5.35z"
                                fill="currentColor"
                            />
                            <path
                                fillRule="evenodd"
                                clipRule="evenodd"
                                d="M14 1h1v14h-1V7H8.95a2.513 2.513 0 000-1H14V1z"
                                fill="currentColor"
                            />
                            <circle
                                cx="1.5"
                                cy="1.5"
                                r="1.5"
                                transform="translate(5 5)"
                                fill="currentColor"
                            />
                        </svg>

                    </button>
                    <button className={`${settingProperty[activeSettingIndex]?.radialSize == 'closest-side' ? 'setting-input-active-tab' : 'setting-input-inactive-tab'}`} onClick={() => updateByKeyValue('radialSize', "closest-side")}>
                        <svg
                            data-icon="GradientRadialClosestSide"
                            aria-hidden="true"
                            focusable="false"
                            width={16}
                            height={16}
                            viewBox="0 0 16 16"
                            className="bem-Svg"
                            style={{ display: "block" }}
                        >
                            <path
                                opacity=".6"
                                fillRule="evenodd"
                                clipRule="evenodd"
                                d="M1 3v12h14V3h-1v11H2V3H1z"
                                fill="currentColor"
                            />
                            <path
                                opacity=".4"
                                fillRule="evenodd"
                                clipRule="evenodd"
                                d="M8 4.5a2.5 2.5 0 11-3 0V2H3.337A5.53 5.53 0 002 3.337v6.326A5.5 5.5 0 109.663 2H8v2.5z"
                                fill="currentColor"
                            />
                            <path
                                fillRule="evenodd"
                                clipRule="evenodd"
                                d="M1 1h14v1H7v2.05a2.51 2.51 0 00-1 0V2H1V1z"
                                fill="currentColor"
                            />
                            <circle
                                cx="1.5"
                                cy="1.5"
                                r="1.5"
                                transform="translate(5 5)"
                                fill="currentColor"
                            />
                        </svg>
                    </button>
                    <button className={`${settingProperty[activeSettingIndex]?.radialSize == 'closest-corner' ? 'setting-input-active-tab' : 'setting-input-inactive-tab'}`} onClick={() => updateByKeyValue('radialSize', "closest-corner")}>
                        <svg
                            data-icon="GradientRadialClosestCorner"
                            aria-hidden="true"
                            focusable="false"
                            width={16}
                            height={16}
                            viewBox="0 0 16 16"
                            className="bem-Svg"
                            style={{ display: "block" }}
                        >
                            <path
                                opacity=".6"
                                fillRule="evenodd"
                                clipRule="evenodd"
                                d="M14 2H5V1h10v14H1V5h1v9h12V2z"
                                fill="currentColor"
                            />
                            <path
                                fillRule="evenodd"
                                clipRule="evenodd"
                                d="M2 1H1v3h1V2.707L4.414 5.12c.186-.28.427-.52.707-.706L2.71 2H4V1H2z"
                                fill="currentColor"
                            />
                            <circle
                                cx="1.5"
                                cy="1.5"
                                r="1.5"
                                transform="translate(5 5)"
                                fill="currentColor"
                            />
                            <path
                                opacity=".4"
                                fillRule="evenodd"
                                clipRule="evenodd"
                                d="M2 5v6.19A6.5 6.5 0 0011.19 2H5v.88l1.146 1.145a2.5 2.5 0 11-2.12 2.12L2.878 5H2z"
                                fill="currentColor"
                            />
                        </svg>

                    </button>
                </div>
            </div>
            <div className='horizontal-separator'></div>
            <div className='background-image-linear-gradient-picker-area'
                style={{ gridColumn: "1 / -1" }}
            >
                <div className='gradient-color-picker-input-area'>
                    <div className='gradient-slider-input-area'>
                        <CssCustomLinearGradientPositionSlider
                            colors={settingProperty[activeSettingIndex].colors}
                            onChange={(val: any) => updateByKeyValue("colors", val)}
                            onSelectIndex={handleSelectIndex}

                        />
                    </div>
                    <div className='gradient-slider-reverse-color-area'>
                        <div className='text-xs'>Repeat</div>
                        <div className='text-xs'>Toggle Order</div>
                    </div>
                    <div className='gradient-slider-color-input-label'>color</div>
                    <div className='gradient-slider-color-picker-input h-[22px]'>
                        <CssCustomColorInput
                            initialValue='#fff'
                        />
                    </div>
                    <div className='gradient-slider-color-position'>
                        <CssCustomNumUnitObjectInput
                            initialValue={{
                                value: "10",
                                unit: "%"
                            }}
                            units={{
                                "%": "%"
                            }}
                        />
                    </div>
                </div>
            </div>
        </React.Fragment>
    )
}

export default BackgroundRadialGradientObjectInput