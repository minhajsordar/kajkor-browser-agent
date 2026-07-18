// Per-branch invoice / print page padding (mm). Stored on the branch as the
// `invoicePadding` subdoc and edited in Site Settings → Invoice tab. Defaults
// are applied here so legacy branches (no subdoc) bind + print safely without a
// migration. Single source of truth — used by SiteSettingsView, SaleInvoice,
// PrintLayout and ReportPrintLayout.

export const DEFAULT_INVOICE_PADDING = {
  topMm: 10,
  rightMm: 8,
  bottomMm: 10,
  leftMm: 8,
};

const num = (v, d) =>
  v === null || v === undefined || v === "" || isNaN(Number(v))
    ? d
    : Number(v);

// Fill missing/invalid sides with defaults. Returns a complete object.
export function mergeInvoicePadding(p) {
  const src = p || {};
  return {
    topMm: num(src.topMm, DEFAULT_INVOICE_PADDING.topMm),
    rightMm: num(src.rightMm, DEFAULT_INVOICE_PADDING.rightMm),
    bottomMm: num(src.bottomMm, DEFAULT_INVOICE_PADDING.bottomMm),
    leftMm: num(src.leftMm, DEFAULT_INVOICE_PADDING.leftMm),
  };
}

// CSS @page margin shorthand: "top right bottom left" in mm.
export function invoicePageMargin(p) {
  const m = mergeInvoicePadding(p);
  return `${m.topMm}mm ${m.rightMm}mm ${m.bottomMm}mm ${m.leftMm}mm`;
}
