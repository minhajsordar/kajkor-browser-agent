import React, { useState, useRef, useEffect } from "react";

interface Color {
  color: string;
  position: string; // in percent
}

interface SliderProps {
  colors: Color[];
  onChange?: (updatedColors: Color[]) => void;
  onSelectIndex?: (index: number) => void;
}

const CssCustomLinearGradientPositionSlider: React.FC<SliderProps> = ({
  colors,
  onChange,
  onSelectIndex,
}) => {
  const [currentColors, setCurrentColors] = useState<Color[]>(colors);
  const selectedIndexRef = useRef<number | null>(null); // Ref to track selected index
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCurrentColors(colors);
  }, [colors]);

  const handleThumbMove = (index: number, newPercent: number) => {
    const updatedColors = [...currentColors];
    updatedColors[index] = {
      ...updatedColors[index],
      position: newPercent.toFixed(2),
    };

    // Sort colors by position (ascending order)
    updatedColors.sort((a, b) => parseFloat(a.position) - parseFloat(b.position));

    setCurrentColors(updatedColors);
    if (onChange) onChange(updatedColors);
  };

  const handleMouseMove = (event: MouseEvent) => {
    const index = selectedIndexRef.current;
    if (index === null || !trackRef.current) return;

    const trackRect = trackRef.current.getBoundingClientRect();
    const offsetX = event.clientX - trackRect.left;
    const newPercent = Math.max(
      0,
      Math.min((offsetX / trackRect.width) * 100, 100)
    );

    handleThumbMove(index, newPercent);
  };

  const handleMouseUp = () => {
    selectedIndexRef.current = null; // Clear the ref when the mouse is released
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
  };

  const handleThumbMouseDown = (index: number) => (event: React.MouseEvent) => {
    event.preventDefault();
    selectedIndexRef.current = index; // Update the ref immediately
    if (onSelectIndex) onSelectIndex(index);

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  return (
    <div style={{ width: "100%", padding: "2px 0" }}>
      <div
        ref={trackRef}
        style={{
          position: "relative",
          height: "10px",
          background: `linear-gradient(to right, ${currentColors
            .map((c) => `${c.color} ${c.position}%`)
            .join(", ")})`,
          borderRadius: "5px",
          cursor: "pointer",
        }}
      >
        {currentColors.map((color, index) => (
          <div
            key={index}
            style={{
              position: "absolute",
              top: "50%",
              left: `${color.position}%`,
              transform: "translate(-50%, -50%)",
              width: "16px",
              height: "16px",
              background: color.color,
              border: "2px solid #fff",
              borderRadius: "50%",
              cursor: "grab",
            }}
            onMouseDown={handleThumbMouseDown(index)}
          />
        ))}
      </div>
    </div>
  );
};

export default CssCustomLinearGradientPositionSlider;
