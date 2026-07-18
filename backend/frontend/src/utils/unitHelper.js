import { floatToFixed } from "./numberHelper";

export const formatUnit = (value=0, unitsArrray=[], isSum = false) => {
    const units = unitsArrray && unitsArrray.length > 0 ? unitsArrray : [];
    if (isSum) {
        const unitFormatted = units.sort((a, b) => a.multiplier - b.multiplier).reduce((acc, unit) => {
            acc += `${floatToFixed((value / unit.multiplier))}/${unit.name} `;
            return acc;
        }, "");

        return unitFormatted
    }
    else {
        // Sort units from largest to smallest
        const sortedUnits = [...units].sort((a, b) => b.multiplier - a.multiplier);

        let remainingValue = Math.abs(value); // work with positive for simplicity
        let result = [];

        for (const unit of sortedUnits) {
            const unitValue = Math.floor(remainingValue / unit.multiplier);
            result.push(`<span class="text-[1em] font-bold">${unitValue}</span><span class="text-[0.8em]">/${unit.name}</span>`);
            remainingValue -= unitValue * unit.multiplier;
        }

        const sign = value < 0 ? "-" : "";
        if(value < 0){
            const res = `${sign + result.join(", ")}`
            return `<span class="text-red-500">${res}</span>`;
        }
        return `${sign + result.join(", ")}`;
    }
} 
export const formatRefQuantity = (refQty=[]) => {
        // Sort units from largest to smallest
        const sortedQty = [...refQty].filter(e=>e.quantity != 0).sort((a, b) => b.unitDetails.multiplier - a.unitDetails.multiplier);

        let result = [];

        for (const qty of sortedQty) {
            result.push(formatValuePerUnit(qty.quantity, qty.unitDetails.name));
        }
        return `${result.join(", ")}`;
} 

export const formatValuePerUnit = (value, label) => {
        return `<span class="text-nowrap"><span class="text-[1em] font-bold">${value}</span><span class="text-[0.8em]">/${label}</span></span>`;
} 

