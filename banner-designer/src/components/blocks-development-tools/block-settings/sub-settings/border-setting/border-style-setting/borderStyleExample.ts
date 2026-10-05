export interface ValueUniteObject {
    value: string,
    unit?: string,
}
export interface BorderInterface {
    style: string,
    width: ValueUniteObject,
    color: string,
}
export const borderStyleExample: {
    isIndividual: boolean,
    left: BorderInterface,
    top: BorderInterface,
    right: BorderInterface,
    bottom: BorderInterface,
} = {
    "isIndividual": false,
    "left": {
        "style": "solid",
        "width": {
            "unit": "px",
            "value": "0"
        },
        "color": "rgba(255 255 255 / 0)"
    },
    "top": {
        "style": "solid",
        "width": {
            "unit": "px",
            "value": "0"
        },
        "color": "rgba(255 255 255 / 0)"
    },
    "right": {
        "style": "solid",
        "width": {
            "unit": "px",
            "value": "0"
        },
        "color": "rgba(255 255 255 / 0)"
    },
    "bottom": {
        "style": "solid",
        "width": {
            "unit": "px",
            "value": "0"
        },
        "color": "rgba(255 255 255 / 0)"
    },
}