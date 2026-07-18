import { computed } from "vue";
import { useSiteSettingsStore } from "@/stores/siteSettingsStore.js";

// Single source of truth for barcode-label defaults. Mirrors the Branch model
// `barcodeLabel` subdoc so the UI works even when a branch was created before
// the field existed (server sends nothing → we fall back to these).
export const barcodeLabelDefaults = () => ({
  mode: "roll", // "roll" (one label per page) | "sheet" (A4 grid)
  widthMm: 38,
  heightMm: 25,
  paddingTopMm: 1,
  paddingRightMm: 1,
  paddingBottomMm: 1,
  paddingLeftMm: 1,
  columns: 3,
  columnGapMm: 2,
  rowGapMm: 2,
  pageMarginMm: 5,
  barcodeHeightMm: 12,
  barcodeFormat: "CODE128",
  showProductName: true,
  showPrice: true,
  showBarcodeText: true,
  showBranchName: false,
  // Batch no. + expiry line for Batch / hasExpiry products.
  showBatchExpiry: false,
  nameFontPt: 7,
  priceFontPt: 9,
  barcodeTextFontPt: 7,
  branchFontPt: 7,
  batchExpiryFontPt: 7,
});

// Merge a raw (possibly partial / null) settings object over the defaults.
export const mergeBarcodeLabel = (raw) => ({
  ...barcodeLabelDefaults(),
  ...(raw && typeof raw === "object" ? raw : {}),
});

// Reactive accessor reading from the shared site-settings store
// (`siteSettings.data.barcodeLabel`), already default-merged.
export const useBarcodeLabelSettings = () => {
  const siteSettingsStore = useSiteSettingsStore();
  const settings = computed(() =>
    mergeBarcodeLabel(siteSettingsStore?.siteSettings?.data?.barcodeLabel)
  );
  return { settings };
};

export default useBarcodeLabelSettings;
