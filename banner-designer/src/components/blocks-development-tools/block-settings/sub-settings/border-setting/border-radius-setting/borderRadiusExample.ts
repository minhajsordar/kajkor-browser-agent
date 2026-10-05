interface ValueUniteObject {
    value: string,
    unit?: string,
}
export const borderRadiusExample: {
    all: ValueUniteObject,custom:ValueUniteObject, individual: {
        "horizontal-top-left": ValueUniteObject,
        "horizontal-top-right": ValueUniteObject,
        "horizontal-bottom-left": ValueUniteObject,
        "horizontal-bottom-right": ValueUniteObject,
        "vertical-top-left": ValueUniteObject,
        "vertical-top-right": ValueUniteObject,
        "vertical-bottom-left": ValueUniteObject,
        "vertical-bottom-right": ValueUniteObject,
    }
} = {
    "custom": {
        "value": "0px", // var(--radius-px-val), any
        "unit": ""
    },
    "all": {
        "value": "0",
        "unit": "px"
    },
    "individual": {
        "horizontal-top-left": {
            "value": "4",
            "unit": "px"
        },
        "horizontal-top-right": {
            "value": "4",
            "unit": "px"
        },
        "horizontal-bottom-left": {
            "value": "4",
            "unit": "px"
        },
        "horizontal-bottom-right": {
            "value": "4",
            "unit": "px"
        },
        "vertical-top-left": {
            "value": "4",
            "unit": "px"
        },
        "vertical-top-right": {
            "value": "4",
            "unit": "px"
        },
        "vertical-bottom-left": {
            "value": "4",
            "unit": "px"
        },
        "vertical-bottom-right": {
            "value": "4",
            "unit": "px"
        }
    }
}