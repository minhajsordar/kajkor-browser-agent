function add(a, b) {
  return Number((Number(a || 0) + Number(b || 0)).toFixed(6));
}
function mul(a, b) {
  return Number((Number(a || 1) * Number(b || 1)).toFixed(6));
}
export const getRate = ({ amount, unitId, units }) => {
  const refUnit = units.find((e) => unitId === e.id);
  if (refUnit) {
    return mul(refUnit.multiplier, amount);
  }
};
