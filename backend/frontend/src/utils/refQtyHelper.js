// sort smallest → largest
const sortedS2L = (refQty) => [...refQty].sort(
    (a, b) => a.unitDetails.multiplier - b.unitDetails.multiplier
);
// sort largest → smallest
const sortedL2S = (refQty) => [...refQty].sort(
    (a, b) => b.unitDetails.multiplier - a.unitDetails.multiplier
);

/**
 * SUM multiple refQuantity lists
 * @param  {...Array} refQtyLists
 * @returns {Array}
 */
export function sumRefQuantities(...refQtyLists) {
    const map = new Map();

    const upsert = (item) => {
        const unitId = item.unitId;

        if (!map.has(unitId)) {
            map.set(unitId, {
                unitId,
                quantity: 0,
                unitDetails: item.unitDetails
            });
        }

        map.get(unitId).quantity += item.quantity;
    };

    refQtyLists.forEach(list => {
        list.forEach(item => upsert(item));
    });

    return sortedL2S(Array.from(map.values()));
}

/**
 * SUBTRACT refQuantity list from base list
 * @param {Array} baseRefQty
 * @param {Array} subRefQty
 * @returns {Array}
 */
export function subRefQuantities(baseRefQty, subRefQty) {
    const map = new Map();

    // Insert base quantities
    baseRefQty.forEach(item => {
        map.set(item.unitId, {
            unitId: item.unitId,
            quantity: item.quantity,
            unitDetails: item.unitDetails
        });
    });

    // Subtract quantities
    subRefQty.forEach(item => {
        if (!map.has(item.unitId)) {
            map.set(item.unitId, {
                unitId: item.unitId,
                quantity: -item.quantity,
                unitDetails: item.unitDetails
            });
        } else {
            map.get(item.unitId).quantity -= item.quantity;
        }
    });

    return sortedL2S(Array.from(map.values()));
}

export function normalizeRefQuantities(refQty) {
    // Clone + sort smallest → largest
    const sorted = sortedS2L(refQty);

    const len = sorted.length;

    // ---------------------------
    // STEP 1: FIX NEGATIVES
    // ---------------------------
    for (let i = 0; i < len - 1; i++) {
        const cur = sorted[i];
        const next = sorted[i + 1];

        const ratio =
            next.unitDetails.multiplier / cur.unitDetails.multiplier;

        if (cur.quantity < 0) {
            const needed = Math.ceil(
                Math.abs(cur.quantity) / ratio
            );

            cur.quantity += needed * ratio;
            next.quantity -= needed;
        }
    }

    // ---------------------------
    // STEP 2: FIX OVERFLOW (CORRECT)
    // ---------------------------
    for (let i = 0; i < len - 1; i++) {
        const cur = sorted[i];
        const next = sorted[i + 1];

        const ratio =
            next.unitDetails.multiplier / cur.unitDetails.multiplier;

        if (cur.quantity >= ratio) {
            const carry = Math.floor(cur.quantity / ratio);

            cur.quantity -= carry * ratio;
            next.quantity += carry;
        }
    }

    return sortedL2S(sorted);
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