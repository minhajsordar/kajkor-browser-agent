import React, { useState, useRef, useEffect } from "react";

interface CircularSliderProps {
  min?: number;
  max?: number;
  step?: number;
  value?: number;
  onChange?: (value: number) => void;
}

const CssCustomCircularSliderInput: React.FC<CircularSliderProps> = ({ min = 0, max = 360, step = 1, value = 30, onChange }) => {
  const [currentValue, setCurrentValue] = useState(0);
  const sliderRef = useRef<HTMLDivElement>(null);

  const getAngle = (x: number, y: number, cx: number, cy: number) => {
    const dx = x - cx;
    const dy = y - cy;
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
    return angle >= 0 ? angle : 360 + angle;
  };

  const handleMouseMove = (event: MouseEvent) => {
    if (!sliderRef.current) return;
    const rect = sliderRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const angle = getAngle(event.clientX, event.clientY, cx, cy);
    const newValue = Math.round((angle / 360) * (max - min) / step) * step + min;
    setCurrentValue(newValue);
    if (onChange) {
      onChange(newValue);
    }
  };

  const handleMouseUp = () => {
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
  };

  const handleMouseDown = () => {
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  const percent = ((currentValue - min) / (max - min)) * 100;
  const rotation = (percent / 100) * 360;

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

  return (
    <div
      ref={sliderRef}
      style={{
        width: "22px",
        height: "22px",
        borderRadius: "50%",
        border: "1px solid rgba(255, 255, 255, 0.13)",
        backgroundColor: "rgba(255, 255, 255, 0.1)",
        position: "relative",
      }}
      onMouseDown={handleMouseDown}
    >
      <div
        style={{
          position: "absolute",
          width: "4px",
          height: "4px",
          background: "#ffffff",
          borderRadius: "50%",
          top: "50%",
          left: "50%",
          transform: `translate(-50%, -50%) rotate(${rotation}deg) translate(8px)`,
          transformOrigin: "center center",
          cursor: "grab",
        }}
      ></div>
    </div>
  );
};

export default CssCustomCircularSliderInput;
