import { defineStore } from "pinia";
import { ref } from "vue";
import { api } from "@/boot/axios";
import { getToken } from "@/utils/token";

export const useProductPresetStore = defineStore("productPresetStore", () => {
  const presets = ref([]);
  const loaded = ref(false);

  // Always hits the API. No localStorage cache — owner-facing data must reflect
  // super-admin edits immediately.
  // Pass a branchId to scope presets to that branch's business profiles
  // (multi-branch users pick a branch in the product form).
  const fetchPresets = async (branchId = "") => {
    try {
      const params = { limit: 500 };
      if (branchId) params.branchId = branchId;
      const res = await api.request({
        method: "GET",
        url: "api/product-presets",
        params,
        headers: { Authorization: `Bearer ${getToken("token")}` },
      });
      presets.value = res.data?.data || [];
      loaded.value = true;
    } catch (e) {
      console.warn("productPresetStore.fetchPresets failed", e?.response?.status, e?.message);
      presets.value = [];
    }
    return presets.value;
  };

  const getBySlug = (slug) => presets.value.find((p) => p.slug === slug) || null;
  const getBySlugs = (slugs) => {
    if (!Array.isArray(slugs) || !slugs.length) return [];
    const set = new Set(slugs);
    return presets.value.filter((p) => set.has(p.slug));
  };
  const getById = (id) => presets.value.find((p) => p.id === id) || null;

  return {
    presets,
    loaded,
    fetchPresets,
    getBySlug,
    getBySlugs,
    getById,
  };
});
