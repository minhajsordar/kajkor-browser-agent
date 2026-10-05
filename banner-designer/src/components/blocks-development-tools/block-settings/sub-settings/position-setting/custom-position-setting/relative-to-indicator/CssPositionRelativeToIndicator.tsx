import React from 'react'
import "./CssPositionRelativeToIndicator.css"
const CssPositionRelativeToIndicator = () => {
    return (
        <React.Fragment>

            <div className='position-relative-to-indicator-area'>
                <svg
                    data-icon="Target"
                    aria-hidden="true"
                    focusable="false"
                    width={16}
                    height={16}
                    viewBox="0 0 16 16"
                    className="bem-Svg"
                    style={{ display: "block" }}
                >
                    <path
                        fillRule="evenodd"
                        clipRule="evenodd"
                        d="M9 2H7v2H4v3H2v2h2v3h3v2h2v-2h3V9h2V7h-2V4H9V2zm1 5V6H6v4h4V7z"
                        fill="currentColor"
                    />
                </svg>
                <span className="position-relative-to-indicator-label">Self</span>
            </div>
            <div className="position-relative-to-label">Relative to</div>
        </React.Fragment>
    )
}

export default CssPositionRelativeToIndicator