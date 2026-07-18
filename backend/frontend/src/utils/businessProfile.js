// Pure helpers for BusinessProfile union math.
// All return-shape "no restriction" = empty array. Callers treat empty as "all allowed".

const uniq = (arr) => [...new Set(arr || [])];

export const unionProductTypes = (profiles) => {
  if (!Array.isArray(profiles) || !profiles.length) return [];
  const all = profiles.flatMap((p) => p?.allowedProductTypes || []);
  return uniq(all);
};

export const unionTrackTypes = (profiles) => {
  if (!Array.isArray(profiles) || !profiles.length) return [];
  const all = profiles.flatMap((p) => p?.allowedTrackTypes || []);
  return uniq(all);
};

export const unionDefaultFlags = (profiles) => {
  const out = {
    hasExpiry: false,
    isPerishable: false,
    trackWarranty: false,
    allowNegativeStock: false,
  };
  if (!Array.isArray(profiles)) return out;
  for (const p of profiles) {
    if (!p) continue;
    if (p.defaultHasExpiry) out.hasExpiry = true;
    if (p.defaultIsPerishable) out.isPerishable = true;
    if (p.defaultTrackWarranty) out.trackWarranty = true;
    if (p.defaultAllowNegativeStock) out.allowNegativeStock = true;
  }
  return out;
};

export const unionShowFlags = (profiles) => {
  const out = {
    showWarrantyFields: false,
    showBatchExpiryFields: false,
    showProductionModule: false,
    showBundleModule: false,
    showServiceFields: false,
    showGenericNameField: false,
  };
  if (!Array.isArray(profiles)) return out;
  for (const p of profiles) {
    if (!p) continue;
    if (p.showWarrantyFields) out.showWarrantyFields = true;
    if (p.showBatchExpiryFields) out.showBatchExpiryFields = true;
    if (p.showProductionModule) out.showProductionModule = true;
    if (p.showBundleModule) out.showBundleModule = true;
    if (p.showServiceFields) out.showServiceFields = true;
    if (p.showGenericNameField) out.showGenericNameField = true;
  }
  return out;
};

// Convenience: returns true when no profile is set OR the union allows everything.
// Used to keep legacy branches' UI unchanged.
export const isUnrestricted = (profiles) =>
  !Array.isArray(profiles) || !profiles.length;
