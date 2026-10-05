import React, { useRef, useEffect } from "react";
import styles from "./CustomScrollArea.module.css";

interface CustomScrollAreaProps {
  children: React.ReactNode;
}

const CustomScrollArea: React.FC<CustomScrollAreaProps> = ({ children }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;

    const handleScroll = () => {
      if (container) {
        // Add class to show the scrollbar
        container.classList.add(styles.showScrollbar);

        // Remove the class after 500ms
        clearTimeout((container as any)._scrollTimeout);
        (container as any)._scrollTimeout = setTimeout(() => {
          container.classList.remove(styles.showScrollbar);
        }, 500);
      }
    };

    if (container) {
      container.addEventListener("scroll", handleScroll);
    }

    return () => {
      if (container) {
        container.removeEventListener("scroll", handleScroll);
      }
    };
  }, []);

  return (
    <div className={styles.scrollContainer + " showScrollbar"} ref={containerRef}>
      <div className={styles.scrollContent}>{children}</div>
    </div>
  );
};

export default CustomScrollArea;
