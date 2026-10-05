import React from 'react';
import { IoClose } from "react-icons/io5";
const positionStyles = {
    center: {
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)"
    },
    left: {
        left: "0px",
        top: "50%",
        transform: "translateY(-50%)"
    },
    right: {
        right: "0px",
        top: "50%",
        transform: "translateY(-50%)"
    },
    top: {
        top: "0px",
        left: "50%",
        transform: "translateX(-50%)"
    },
    bottom: {
        bottom: "0px",
        left: "50%",
        transform: "translateX(-50%)"
    },
};
interface PositionTypes {
    left?: string,
    right?: string,
    center?: string,
    top?: string,
    transform?: string
}
// style={{
//     backgroundColor: "var(--bp-designer-bg-5)",
//     color: "var(--bp-designer-fg-4)",
//     border: "var(--bp-designer-card-border)"
// }}
const Dialog = ({
    left = positionStyles.left,
    right = positionStyles.right,
    top = positionStyles.top,
    bottom = positionStyles.bottom,
    center = positionStyles.center,
    width = "500px",
    height = "300px",
    borderRadius = "0px",
    backgroundColor = "var(--bp-designer-bg-5)",
    border = "var(--bp-designer-card-border)",
    color = "var(--bp-designer-fg-4)",
    padding = "0px",
    persistent = true,
    closeIcon = true,
    dimmed = true,
    position = "center", // "center", "left", "right", "top", "bottom"
    open,
    setOpen,
    children
}: {
    left?: PositionTypes,
    right?: PositionTypes,
    top?: PositionTypes,
    bottom?: PositionTypes,
    center?: PositionTypes,
    width?: string,
    height?: string,
    borderRadius?: string,
    backgroundColor?: string,
    border?: string,
    color?: string,
    padding?: string,
    persistent?: boolean,
    closeIcon?: boolean,
    dimmed?: boolean,
    position?: "center" | "left" | "right" | "top" | "bottom",
    open: boolean,
    setOpen?: any,
    children?: any
}) => {
    const [openDialog, setOpenDialog] = React.useState(false);

    const positionStyle = {
        center: { ...positionStyles.center, ...center },
        left: { ...positionStyles.left, ...left },
        right: { ...positionStyles.right, ...right },
        top: { ...positionStyles.top, ...top },
        bottom: { ...positionStyles.bottom, ...bottom },
    };

    const updateOpen = (e: React.MouseEvent<HTMLDivElement>) => {
        e.preventDefault();
        if (persistent) {
            setOpenDialog(false);
            if (setOpen) {
                setOpen(false);
            }
        }
    };

    const close = (e: React.MouseEvent<HTMLDivElement>) => {
        e.preventDefault();
        setOpenDialog(false);
        if (setOpen) {
            setOpen(false);
        }
    };

    React.useEffect(() => {
        if (open !== openDialog) {
            setOpenDialog(open);
        }
    }, [open]);
    React.useEffect(() => {
        // Save the original overflow property
        const originalOverflow = document.body.style.overflow;

        if (open) {
            // Disable scrolling
            document.body.style.overflow = "hidden";
        } else {
            // Restore the original overflow property
            document.body.style.overflow = originalOverflow;
        }

        // Cleanup on unmount
        return () => {
            document.body.style.overflow = originalOverflow;
        };
    }, [open]);

    if (!open) {
        return null;
    }

    // Map position to animate.css classes
    const animationClass = {
        center: "animate__animated animate__zoomIn animate__faster",
        left: "animate__animated animate__slideInLeft animate__faster",
        right: "animate__animated animate__slideInRight animate__faster",
        top: "animate__animated animate__slideInDown animate__faster",
        bottom: "animate__animated animate__slideInUp animate__faster",
    }[position];

    const closeAnimationClass = {
        center: "animate__animated animate__zoomOut animate__faster",
        left: "animate__animated animate__slideOutLeft animate__faster",
        right: "animate__animated animate__slideOutRight animate__faster",
        top: "animate__animated animate__slideOutUp animate__faster",
        bottom: "animate__animated animate__slideOutDown animate__faster",
    }[position];

    const handleClose = (e: React.MouseEvent<HTMLDivElement>) => {
        e.preventDefault();
        const dialog = document.querySelector('.dialog-container');
        if (dialog) {
            dialog.className = `dialog-container ${closeAnimationClass}`;
            setTimeout(() => {
                close(e);
            }, 500); // Match the animation duration
        }
    };

    return (
        <div
            style={{
                position: "fixed",
                left: "0px",
                top: "0px",
                width: "100vw",
                height: "100vh",
                // backdropFilter: "blur(3px)",
                backgroundColor: dimmed ? "rgba(90, 90, 90, 0.2)" : "transparent",
                zIndex: 99999999999
            }}
        >
            <div
                onClick={updateOpen}
                style={{
                    position: "fixed",
                    left: "0px",
                    top: "0px",
                    width: "100vw",
                    height: "100vh",
                    // backdropFilter: "blur(3px)",
                    // backgroundColor: "rgba(90, 90, 90, 0.2)",
                    zIndex: 1,
                }}
            ></div>
            <div
                style={{
                    width,
                    height,
                    position: "absolute",
                    zIndex: 2,
                    ...positionStyle[position]
                }}
            >
                <div
                    className={`dialog-container ${animationClass}`}
                    style={{
                        width: "100%",
                        height: "100%",
                        backgroundColor,
                        borderRadius,
                        border,
                        color,
                        padding,
                        position:"relative",
                        overflow: "hidden",
                        boxShadow: "0 4px 24px rgba(0,0,0,0.12)"
                    }}
                >
                    {closeIcon &&
                        <div
                            onClick={updateOpen}
                            style={{
                                cursor: 'pointer',
                                position: "absolute",
                                top: "5px",
                                right: "15px",
                                zIndex: 900000
                            }}
                        >
                            <IoClose />
                        </div>
                    }
                    <div style={{ height: "100%", overflowY: "auto", borderRadius: "inherit" }}>
                        {children}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Dialog;
