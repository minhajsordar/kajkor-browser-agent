import React, { useState, useRef, useEffect } from "react";

interface SliderProps {
  min?: number;
  max?: number;
  step?: number;
  value?: number;
  onChange?: (value: number) => void;
}

const CssCustomSliderInput: React.FC<SliderProps> = ({ min=0, max=100, step=1, value=300, onChange }) => {
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
    const offsetX = event.clientX - trackRect.left;
    let newPercent = (offsetX / trackRect.width) * 100;

    // Clamp between 0% and 100%
    newPercent = Math.max(0, Math.min(newPercent, 100));

    // Calculate value based on percentage
    const newValue = Math.round((min + (newPercent / 100) * (max - min)) / step) * step;
    setCurrentValue(newValue);
    if(onChange){
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
    <div style={{ width: "100%", height:"12px", padding: "1px 2px" }}>
    <div style={{ width: "100%", minWidth:"40px", margin: "5px auto" }}>
      <div
        ref={trackRef}
        style={{
          position: "relative",
          height: "2px",
          background: "rgba(255, 255, 255, 0.13)",
          cursor: "pointer",
        }}
        onClick={(event) => {
          const trackRect = trackRef.current!.getBoundingClientRect();
          const offsetX = event.clientX - trackRect.left;
          const newPercent = (offsetX / trackRect.width) * 100;
          const newValue = Math.round((min + (newPercent / 100) * (max - min)) / step) * step;
          setCurrentValue(newValue);
          if(onChange){
            onChange(newValue);
        }
        }}
      >
        <div
          style={{
            position: "absolute",
            height: "2px",
            background: "rgba(255, 255, 255, 0.13)",
            width: `${getPercent(currentValue)}%`,
          }}
        />
        <div
          ref={thumbRef}
          style={{
            position: "absolute",
            top: "50%",
            left: `${getPercent(currentValue)}%`,
            transform: "translate(-50%, -50%)",
            width: "4px",
            height: "10px",
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

export default CssCustomSliderInput;
