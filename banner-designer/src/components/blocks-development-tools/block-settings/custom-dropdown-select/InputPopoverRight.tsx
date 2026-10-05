import React, { useState, useRef, useEffect } from 'react';

/**
 * InputPopoverRight Component
 *
 * Props:
 * - label: React node to be used as the trigger element.
 * - children: React node to be displayed inside the popover.
 */
const InputPopoverRight = ({ open, setOpen,className="", children }: { open:boolean, setOpen:any,className?:string, children: React.ReactNode }) => {
  // const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, placement: 'bottom' });
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  // Function to toggle popover visibility
  const togglePopover = () => {
    setOpen((prev:boolean) => !prev);
  };

  // Function to close popover
  const closePopover = () => {
    setOpen(false);
  };

  // Function to handle click outside of popover
  const handleClickOutside = (event: MouseEvent) => {
    if (
      popoverRef.current &&
      !popoverRef.current.contains(event.target as Node) &&
      triggerRef.current &&
      !triggerRef.current.contains(event.target as Node)
    ) {
      closePopover();
    }
  };

  // Function to calculate popover position
  const calculatePosition = () => {
    const trigger = triggerRef.current;
    const popover = popoverRef.current;

    if (!trigger || !popover) return;

    const triggerRect = trigger.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();
    const viewportHeight = window.innerHeight;

    // Default placement is 'bottom'
    let placement = 'bottom';
    let top = triggerRect.bottom + window.scrollY + 4;
    const left = window.innerWidth - popoverRect.width - 2; // 10px from the right

    // Check if there's enough space below; if not, place above
    if (triggerRect.bottom + popoverRect.height > viewportHeight) {
      placement = 'top';
      top = triggerRect.top + window.scrollY - popoverRect.height - 4;
    }

    setPosition({ top, left, placement });
  };

  // Effect to handle positioning when popover opens
  useEffect(() => {
    if (open) {
      calculatePosition();

      // Add event listeners
      window.addEventListener('resize', calculatePosition);
      window.addEventListener('scroll', calculatePosition, true); // Capture scroll on all ancestors
      document.addEventListener('mousedown', handleClickOutside);
    }

    // Cleanup event listeners when popover closes
    return () => {
      if (open) {
        window.removeEventListener('resize', calculatePosition);
        window.removeEventListener('scroll', calculatePosition, true);
        document.removeEventListener('mousedown', handleClickOutside);
      }
    };
  }, [open]);
  const hidePopup = (event: React.MouseEvent<HTMLDivElement>) => {
    // event.stopPropagation()
    // setOpen(false);
  }

  return (
    <>
      {/* Trigger Element */}
      <div
        ref={triggerRef}
        onClick={togglePopover}
        style={{cursor: 'pointer'}}
        className={`${className} absolute top-1 left-0 translate-x-[-50%] translate-y-[-50%] w-[8px] hover:w-[14px] h-[8px] hover:h-[14px] bg-white border-2 hover:!border-4 !border-blue-500 rounded-full text-xs z-[999] overflow-hidden`}
      >
      </div>

      {/* Popover Element */}
      {open && (
        <div
          ref={popoverRef}
          onClick={hidePopup}
          style={{
            position: 'fixed',
            top: position.top,
            left: position.left,
            zIndex: 1000,
            borderRadius: '0px',
            padding: '0px',
            width: '246px', // Fixed width
            backgroundColor: "rgb(66 66 66)"
          }}
        >
          {children}
        </div>
      )}
    </>
  );
};

export default InputPopoverRight;
