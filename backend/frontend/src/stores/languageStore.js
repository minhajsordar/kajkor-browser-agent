import { defineStore } from "pinia";
import { ref } from "vue";
import { api } from "@/boot/axios";
import { getToken } from "@/utils/token";

// Languages are super-admin managed but read by the normal app (branch form +
// invoice). Small list (2 today) — load once, cache in memory.
export const useLanguageStore = defineStore("languageStore", () => {
  const languages = ref([]);
  const loaded = ref(false);

  const fetchLanguages = async (force = false) => {
    if (loaded.value && !force) return languages.value;
    try {
      const res = await api.request({
        method: "GET",
        url: "api/languages",
        params: { limit: 100, activeOnly: true },
        headers: { Authorization: `Bearer ${getToken("token")}` },
      });
      languages.value = res.data?.data || [];
      loaded.value = true;
    } catch (e) {
      console.warn("languageStore.fetchLanguages failed", e?.response?.status, e?.message);
      languages.value = [];
    }
    return languages.value;
  };

  const getById = (id) =>
    id ? languages.value.find((l) => String(l.id) === String(id)) || null : null;

  // Default language = English (code "en"), else lowest order. Branches with no
  // languageId render in this default.
  const getDefault = () =>
    languages.value.find((l) => l.code === "en") || languages.value[0] || null;

  // Parse a language's JSON `codes` map (memo-safe: cheap, 2 langs). Falls back
  // to the default language when the id is missing/unknown.
  const codesOf = (id) => {
    const lang = getById(id) || getDefault();
    if (!lang?.codes) return {};
    try {
      return typeof lang.codes === "object" ? lang.codes : JSON.parse(lang.codes);
    } catch {
      return {};
    }
  };

  // Translate a label key for a branch's language. Falls back to `fallback`
  // (the original text) so invoices keep working without a language assigned.
  const t = (languageId, key, fallback = "") => {
    const map = codesOf(languageId);
    return map?.[key] || fallback;
  };

  return { languages, loaded, fetchLanguages, getById, getDefault, codesOf, t };
});
