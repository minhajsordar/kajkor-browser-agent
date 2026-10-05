'use client'
import * as React from 'react';
import CssCustomVisualPositionInput from '../../../../custom-input/CssCustomVisualPositionInput'
import { backgroundImageExample } from '../backgroundImageExample';
const _ = { cloneDeep: (o: any) => JSON.parse(JSON.stringify(o)), isEqual: (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b) };
import CssCustomNumUnitObjectInput from '../../../../custom-input/CssCustomNumUnitObjectInput';
import CssCustomCircularSliderInput from '../../../../custom-input/slider-input/CssCustomCircularSliderInput';
import CssCustomLinearGradientPositionSlider from '../../../../custom-input/slider-input/CssCustomLinearGradientPositionSlider';

const BackgroundImageObjectInputArea = ({
    settingProperty,
    activeSettingIndex,
    updateSizeType,
    updateByKeyValue,
}:{
    settingProperty:any,
    updateSizeType:any,
    updateByKeyValue:any,
    activeSettingIndex:number
}) => {
    return (
        <React.Fragment>
            <div className='horizontal-separator'></div>
            <div className='background-image-picker-title'>Image</div>
            <div className='background-image-picker-area'>
                <div className='background-image-preview-box'>
                    <div className='background-image-preview'>
                    </div>
                </div>
                <div className='background-image-file-name'>Image file name</div>
                <div className='background-image-file-size'>size</div>
                <div className='background-image-input-label'>Label</div>
            </div>
            <div className='background-image-picker-button'>Image</div>
            <div className='horizontal-separator'></div>
            <div className='background-image-size-label'>Size</div>
            <div className='background-image-size-setting-area'>
                <div className='setting-input-tab-area'
                    style={{ gridColumn: "1 / -1" }}
                >
                    <button className={`${settingProperty[activeSettingIndex].size.type == 'custom' ? 'setting-input-active-tab' : 'setting-input-inactive-tab'}`} onClick={() => updateSizeType("custom")}>
                        Custom
                    </button>
                    <button className={`${settingProperty[activeSettingIndex].size.type == 'cover' ? 'setting-input-active-tab' : 'setting-input-inactive-tab'}`} onClick={() => updateSizeType("cover")}>
                        Cover
                    </button>
                    <button className={`${settingProperty[activeSettingIndex].size.type == 'contain' ? 'setting-input-active-tab' : 'setting-input-inactive-tab'}`} onClick={() => updateSizeType("contain")}>
                        Contain
                    </button>
                </div>
                {settingProperty[activeSettingIndex].size.type == 'custom' &&
                    <div className='background-image-size-custom-setting-area'>
                        <div>
                            <CssCustomNumUnitObjectInput
                                initialValue={settingProperty[activeSettingIndex].size.w}
                            />
                        </div>
                        <div>
                            <CssCustomNumUnitObjectInput
                                initialValue={settingProperty[activeSettingIndex].size.h}
                            />
                        </div>
                        <div className='background-image-size-width-label'>Width</div>
                        <div className='background-image-size-height-label'>Height</div>
                    </div>
                }
            </div>
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
            <div className='background-image-size-label'
                title="Background Repeat"
            >Repeat</div>
            <div className='background-image-size-setting-area'>
                <div className='setting-input-tab-area'
                    style={{ gridColumn: "1 / -1" }}
                >
                    <button className={`${settingProperty[activeSettingIndex].imageRepeat == 'repeat' ? 'setting-input-active-tab' : 'setting-input-inactive-tab'}`} onClick={() => updateByKeyValue('imageRepeat', "repeat")}>
                        <svg
                            data-icon="TileXY"
                            aria-hidden="true"
                            focusable="false"
                            width={16}
                            height={16}
                            viewBox="0 0 16 16"
                            className="bem-Svg"
                            style={{ display: "block" }}
                        >
                            <path
                                fill="currentColor"
                                d="M1 1h4v4H1zm5 0h4v4H6zm5 0h4v4h-4zM1 6h4v4H1zm5 0h4v4H6zm5 0h4v4h-4zM1 11h4v4H1zm5 0h4v4H6zm5 0h4v4h-4z"
                            />
                        </svg>
                    </button>
                    <button className={`${settingProperty[activeSettingIndex].imageRepeat == 'repeat-x' ? 'setting-input-active-tab' : 'setting-input-inactive-tab'}`} onClick={() => updateByKeyValue('imageRepeat', "repeat-x")}>
                        <svg
                            data-icon="TileX"
                            aria-hidden="true"
                            focusable="false"
                            width={16}
                            height={16}
                            viewBox="0 0 16 16"
                            className="bem-Svg"
                            style={{ display: "block" }}
                        >
                            <path fill="currentColor" d="M1 6h4v4H1zm5 0h4v4H6zm5 0h4v4h-4z" />
                        </svg>
                    </button>
                    <button className={`${settingProperty[activeSettingIndex].imageRepeat == 'repeat-y' ? 'setting-input-active-tab' : 'setting-input-inactive-tab'}`} onClick={() => updateByKeyValue('imageRepeat', "repeat-y")}>
                        <svg
                            data-wf-icon="TileYIcon"
                            width={5}
                            height={15}
                            viewBox="0 0 5 15"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                        >
                            <path
                                d="M2 2.5H3V3.5H2V2.5ZM2 7H3V8H2V7ZM2 11.5H3V12.5H2V11.5Z"
                                fill="currentColor"
                                stroke="currentColor"
                            />
                        </svg>
                    </button>
                    <button className={`${settingProperty[activeSettingIndex].imageRepeat == 'no-repeat' ? 'setting-input-active-tab' : 'setting-input-inactive-tab'}`} onClick={() => updateByKeyValue('imageRepeat', "no-repeat")}>
                        <svg
                            data-wf-icon="CloseDefaultIcon"
                            width={16}
                            height={16}
                            viewBox="0 0 16 16"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                        >
                            <path
                                fillRule="evenodd"
                                clipRule="evenodd"
                                d="M8.70714 8.00004L12.3536 4.35359L11.6465 3.64648L8.00004 7.29293L4.35359 3.64648L3.64648 4.35359L7.29293 8.00004L3.64648 11.6465L4.35359 12.3536L8.00004 8.70714L11.6465 12.3536L12.3536 11.6465L8.70714 8.00004Z"
                                fill="currentColor"
                            />
                        </svg>
                    </button>
                </div>
            </div>
            <div className='horizontal-separator'></div>
            <div className='background-image-size-label' title="Background Attachment">Attac<br />hment</div>
            <div className='background-image-size-setting-area'>
                <div className='setting-input-tab-area'
                    style={{ gridColumn: "1 / -1" }}
                >
                    <button className={`${settingProperty[activeSettingIndex].attachment == 'scroll' ? 'setting-input-active-tab' : 'setting-input-inactive-tab'}`} onClick={() => updateByKeyValue('attachment', "scroll")}>
                        Scroll
                    </button>
                    <button className={`${settingProperty[activeSettingIndex].attachment == 'fixed' ? 'setting-input-active-tab' : 'setting-input-inactive-tab'}`} onClick={() => updateByKeyValue('attachment', "fixed")}>
                        Fixed
                    </button>
                </div>
            </div>
        </React.Fragment>
    )
}

export default BackgroundImageObjectInputArea