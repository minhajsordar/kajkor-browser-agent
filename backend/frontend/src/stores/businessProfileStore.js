import { defineStore } from "pinia";
import { ref } from "vue";
import { api } from "@/boot/axios";
import { getToken } from "@/utils/token";

export const useBusinessProfileStore = defineStore("businessProfileStore", () => {
  const profiles = ref([]);
  const loaded = ref(false);

  // Always hits the API. No localStorage cache.
  const fetchProfiles = async () => {
    try {
      const res = await api.request({
        method: "GET",
        url: "api/business-profiles",
        params: { limit: 500 },
        headers: { Authorization: `Bearer ${getToken("token")}` },
      });
      profiles.value = res.data?.data || [];
      loaded.value = true;
    } catch (e) {
      console.warn("businessProfileStore.fetchProfiles failed", e?.response?.status, e?.message);
      profiles.value = [];
    }
    return profiles.value;
  };

  const getByIds = (ids) => {
    if (!Array.isArray(ids) || !ids.length) return [];
    const set = new Set(ids.map(String));
    return profiles.value.filter((p) => set.has(String(p.id)));
  };

  const getBySlug = (slug) => profiles.value.find((p) => p.slug === slug) || null;

  return {
    profiles,
    loaded,
    fetchProfiles,
    getByIds,
    getBySlug,
  };
});
