// Pure helper: applies a ProductPreset onto a product form state.
// Returns a NEW object (does not mutate). Caller does `formData.value = applyProductPreset(preset, formData.value)`.

const FIELDS = [
  "productType",
  "trackType",
  "hasExpiry",
  "isPerishable",
  "trackWarranty",
  "allowNegativeStock",
  "unitGroup",
  "unitType",
  "unitId",
  "relationalUnitIds",
];

export function applyProductPreset(preset, formData) {
  if (!preset) return { ...formData };
  const next = { ...formData };
  for (const k of FIELDS) {
    if (typeof preset[k] !== "undefined") next[k] = preset[k];
  }
  // Hydrated objects (aggregation-joined) — apply directly to form's display fields.
  if (preset.unitDetails) next.unitDetails = preset.unitDetails;
  if (Array.isArray(preset.relationalUnits)) next.relationalUnits = preset.relationalUnits;
  // Remember which preset was applied (UI badge / "change preset" flow).
  next._presetSlug = preset.slug;
  return next;
}

// Detect if current form matches a preset (used to highlight selected card).
export function matchesPreset(preset, formData) {
  if (!preset || !formData) return false;
  return FIELDS.every((k) => Boolean(preset[k]) === Boolean(formData[k])
    || preset[k] === formData[k]);
}

export const PRESET_FIELDS = FIELDS;
