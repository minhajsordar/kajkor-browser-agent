export interface ValueUniteObject {
    value: string,
    unit?: string,
}

export interface BackgroundImageInterface {
    type: "image" | "linear-gradient" | "radial-gradient" | "color-overlay";
    url?: string;
    radialSize?: string;
    attachment?: "scroll" | "fixed";
    imageRepeat?: string;
    gradientRepeat?: boolean;
    size?: {
        type: "custom" | "auto" | "cover" | "contain";
        w: ValueUniteObject;
        h: ValueUniteObject;
    };
    colors?: Array<{
        color: string;
        position: string;
    }>;
    angle?: ValueUniteObject;
    position?: {
        x: {
            value: string,
            unit: string
        };
        y: {
            value: string,
            unit: string
        };
    };
    color?: string;
}

export const backgroundImageExample: BackgroundImageInterface[] = [
    {
        type: "image",
        url: "image.jpeg",
        imageRepeat: "repeat",
        attachment: "fixed",
        size: {
            type: "custom",
            w: { value: "1", unit: "%" },
            h: { value: "10", unit: "%" },
        },
        position: {
            x: {
                value: "50",
                unit: "%"
            },
            y: {
                value: "50",
                unit: "%"
            }
        },
    },
    {
        type: "linear-gradient",
        colors: [
            {
                color: "#fff",
                position: "10"
            },
            {
                color: "#faf",
                position: "50"
            },
            {
                color: "#faf",
                position: "100"
            }
        ],
        angle: {
            value: "360",
            unit: "deg"
        },
        gradientRepeat: false
    },
    {
        type: "radial-gradient",
        colors: [
            {
                color: "#fff", // any color value
                position: "0" // in percent
            },
            {
                color: "#fff", // any color value
                position: "10" // in percent
            },
            {
                color: "#fff", // any color value
                position: "100" // in percent
            }
        ],
        radialSize: "farthest-corner",
        position: {
            x: {
                value: "50",
                unit: "%"
            },
            y: {
                value: "50",
                unit: "%"
            }
        },
        gradientRepeat: false
    },
    {
        type: "color-overlay",
        color: "#fff"
    }
]