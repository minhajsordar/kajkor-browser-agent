export const floatToFixed = (value, decimalPlaces = 2) => {
    if (typeof value !== 'number') {
        return value; // Return the original value if it's not a number
    }
    const isFloatNumber = parseFloat(value.toFixed(decimalPlaces));
    // If the value is a float, return it with the specified decimal places
    // Otherwise, return the value as is
    if (isNaN(isFloatNumber)) {
        return value; // Return the original value if it's NaN
    }
    // If the value is greater than the float representation, return it with fixed decimal places
    // Otherwise, return the value as is
    // This ensures that we only format numbers that are actually floats
    // and not integers or other types
    // This is useful for displaying numbers in a consistent format
    // while avoiding unnecessary formatting for integers
    // This is useful for displaying numbers in a consistent format
    // while avoiding unnecessary formatting for integers
    // This is useful for displaying numbers in a consistent format
    // while avoiding unnecessary formatting for integers   
    if (isFloatNumber) {
        const flotedValue = value.toFixed(decimalPlaces);
        if (Number(flotedValue) === Number(value.toFixed(0))) {
            return value.toFixed(0); // Return as integer if it has no decimal part
        }
        return value.toFixed(decimalPlaces);
    } else {
        return value
    }
}