import React, { useState, useRef, useEffect } from "react";

interface VerticalSliderProps {
    min?: number;
    max?: number;
    step?: number;
    value?: number;
    onChange?: (value: number) => void;
}

const CssCustomVerticalSliderInput: React.FC<VerticalSliderProps> = ({ min = 0, max = 100, step = 1, value = 0, onChange }) => {
  const [currentValue, setCurrentValue] = useState(min);
    const trackRef = useRef<HTMLDivElement>(null);
    const thumbRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
    if(value !== currentValue){
        if(value >= min && value <= max){
        setCurrentValue(value);
      }
      else if(value < min){
        setCurrentValue(min);
      }
      else if(value > max){
        setCurrentValue(max);
      }
    }
    }, [value]);

    const getPercent = (value: number) => ((value - min) / (max - min)) * 100;

    const handleMouseMove = (event: MouseEvent) => {
        if (!trackRef.current) return;
        const trackRect = trackRef.current.getBoundingClientRect();
        const offsetY = event.clientY - trackRect.top;
        let newPercent = 100 - (offsetY / trackRect.height) * 100; // Invert Y-axis

        // Clamp between 0% and 100%
        newPercent = Math.max(0, Math.min(newPercent, 100));

        // Calculate value based on percentage
        const newValue = Math.round((min + (newPercent / 100) * (max - min)) / step) * step;
        setCurrentValue(newValue);
        if (onChange) {
            onChange(newValue);
        }
    };

    const handleMouseUp = () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
    };

    const handleThumbMouseDown = (event: React.MouseEvent) => {
        event.preventDefault();
        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", handleMouseUp);
    };

    return (
    <div style={{ width: "10px", height:"100px", padding: "2px 0px", position: "relative" }}>
        <div style={{ minHeight: "40px", height: "100%", width: "10px", margin: "2px auto", position: "relative" }}>
            <div
                ref={trackRef}
                style={{
                    position: "relative",
                    left: "4.5px",
                    width: "2px",
                    height: "100%",
                    background: "rgba(255, 255, 255, 0.13)",
                    cursor: "pointer",
                }}
                onClick={(event) => {
                    const trackRect = trackRef.current!.getBoundingClientRect();
                    const offsetY = event.clientY - trackRect.top;
                    const newPercent = 100 - (offsetY / trackRect.height) * 100;
                    const newValue = Math.round((min + (newPercent / 100) * (max - min)) / step) * step;
                    setCurrentValue(newValue);
                    if (onChange) {
                        onChange(newValue);
                    }
                }}
            >
                <div
                    style={{
                        position: "absolute",
                        width: "2px",
                        background: "rgba(255, 255, 255, 0.13)",
                        height: `${getPercent(currentValue)}%`,
                        bottom: 0,
                    }}
                />
                <div
                    ref={thumbRef}
                    style={{
                        position: "absolute",
                        left: "50%",
                        bottom: `${getPercent(currentValue)}%`,
                        transform: "translate(-50%, 50%)",
                        width: "10px",
                        height: "4px",
                        background: "#ffffff",
                        cursor: "grab",
                    }}
                    onMouseDown={handleThumbMouseDown}
                />
            </div>
        </div>
    </div>
    );
};

export default CssCustomVerticalSliderInput;
