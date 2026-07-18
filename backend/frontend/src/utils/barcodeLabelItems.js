// Type-aware barcode-label item builders. Turn a purchased-stock row or a
// product into the `{ items, defaultCopies, lockCopies }` shape consumed by
// BarcodeLabelSheet, applying our product-type rules:
//
//  - barcode value: non-Serial -> Product.barcode (auto EAN-13, = what the sale
//    scanner resolves); Serial -> the unit's PurchasedProduct.barcode.
//  - copies: Serial -> 1 (locked, each unit unique); Qty/Batch -> current stock
//    qty (editable); service/bundle -> manual (no stock).
//  - batch/expiry line: only for trackType=Batch or hasExpiry products.

const SERIAL = "Serial";
const BATCH = "Batch";
const NON_STOCK_TYPES = new Set(["service", "bundle"]);

const fmtDate = (d) => {
  if (!d) return "";
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? "" : dt.toISOString().slice(0, 10);
};

// Batch/expiry line text, e.g. "Batch: B12 · Exp: 2027-01-01". Empty unless the
// product is Batch-tracked or has expiry AND a value is present.
const batchTextFor = (product = {}, row = {}) => {
  const wants = product?.trackType === BATCH || !!product?.hasExpiry;
  if (!wants) return "";
  const parts = [];
  if (row?.batchNo) parts.push(`Batch: ${row.batchNo}`);
  const exp = fmtDate(row?.expiryDate);
  if (exp) parts.push(`Exp: ${exp}`);
  return parts.join(" · ");
};

const priceTextFor = (row = {}, getRate) => {
  if (typeof getRate !== "function") return "";
  const rate = getRate({ amount: row?.price, unitId: row?.refUnitId });
  return rate ? `MRP ${rate}/-` : "";
};

// One purchased-stock row (a single batch or serial unit) -> label payload.
export const buildLabelFromPurchasedRow = ({ row, getRate } = {}) => {
  if (!row) return { items: [], defaultCopies: 1, lockCopies: false };
  const product = row.productDetails || {};
  const isSerial = product.trackType === SERIAL;
  const isNonStock = NON_STOCK_TYPES.has(String(product.productType));

  const barcode = isSerial
    ? row.barcode || product.barcode || ""
    : product.barcode || row.barcode || "";

  const item = {
    barcode,
    name: product.name || "",
    priceText: priceTextFor(row, getRate),
    batchText: batchTextFor(product, row),
  };

  if (isSerial) {
    // This row IS one physical unit — exactly one label, count locked.
    return { items: [{ ...item, copies: 1 }], defaultCopies: 1, lockCopies: true };
  }
  // Qty/Batch default to printing one sticker per in-stock unit; service/bundle
  // have no stock so fall back to a manual single copy.
  const stock = Number(row.stock || 0);
  const defaultCopies = !isNonStock && stock > 0 ? stock : 1;
  return { items: [item], defaultCopies, lockCopies: false };
};

// A list of products (e.g. in-stock-by-product) -> one label per product. For
// Serial products with surfaced units, explode into one label per unit.
export const buildLabelsFromProducts = ({ products = [], getRate } = {}) => {
  const items = [];
  for (const p of Array.isArray(products) ? products : []) {
    if (!p) continue;
    const isSerial = p.trackType === SERIAL;
    const units = Array.isArray(p.purchasedProductDetails)
      ? p.purchasedProductDetails
      : p.purchasedProductDetails
        ? [p.purchasedProductDetails]
        : [];

    const unitId = p.refUnitId || p.unitId || p.unitDetails?.id;
    if (isSerial && units.length) {
      for (const u of units) {
        items.push({
          barcode: u.barcode || p.barcode || "",
          name: p.name || "",
          priceText: priceTextFor({ price: p.retailPrice, refUnitId: unitId }, getRate),
          batchText: batchTextFor(p, u),
          copies: 1,
        });
      }
      continue;
    }

    const firstBatch = units[0] || {};
    items.push({
      barcode: p.barcode || "",
      name: p.name || "",
      priceText: priceTextFor({ price: p.retailPrice, refUnitId: unitId }, getRate),
      batchText: batchTextFor(p, firstBatch),
    });
  }
  return { items, defaultCopies: 1, lockCopies: false };
};

export default { buildLabelFromPurchasedRow, buildLabelsFromProducts };
