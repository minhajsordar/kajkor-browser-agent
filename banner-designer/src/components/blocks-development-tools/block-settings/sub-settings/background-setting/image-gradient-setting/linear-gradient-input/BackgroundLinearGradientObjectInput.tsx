'use client'
import * as React from 'react';
import CssCustomVisualPositionInput from '../../../../custom-input/CssCustomVisualPositionInput'
import { backgroundImageExample } from '../backgroundImageExample';
const _ = { cloneDeep: (o: any) => JSON.parse(JSON.stringify(o)), isEqual: (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b) };
import CssCustomNumUnitObjectInput from '../../../../custom-input/CssCustomNumUnitObjectInput';
import CssCustomCircularSliderInput from '../../../../custom-input/slider-input/CssCustomCircularSliderInput';
import CssCustomLinearGradientPositionSlider from '../../../../custom-input/slider-input/CssCustomLinearGradientPositionSlider';
import CssCustomColorInput from '@/components/blocks-development-tools/block-settings/custom-input/CssCustomColorInput';

const BackgroundLinearGradientObjectInput = ({
    settingProperty,
    activeSettingIndex,
    handleSelectIndex,
    updateAngleValue,
    updateByKeyValue,
}: {
    settingProperty: any,
    updateByKeyValue: any,
    updateAngleValue: any,
    handleSelectIndex: any,
    activeSettingIndex: number
}) => {
    return (
        <React.Fragment>
            <div className='background-image-linear-gradient-angle-label' title="Linear Gradient Angle">Angle</div>
            <div className='background-image-linear-gradient-area'>
                <div>
                    <CssCustomCircularSliderInput
                        value={settingProperty[activeSettingIndex].angle.value}
                        onChange={(val: number) => updateAngleValue(String(val))}
                    />
                </div>
                <div>
                    <CssCustomNumUnitObjectInput
                        initialValue={settingProperty[activeSettingIndex].angle}
                        update={(val: object) => updateByKeyValue("angle", val)}
                        units={
                            {
                                "deg": "Deg",
                                "rad": "Rad",
                                "turn": "Turn",
                                "grad": "Grad",
                            }
                        }
                    />
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

export default BackgroundLinearGradientObjectInput