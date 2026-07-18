import { defineStore } from "pinia";
import { ref } from "vue";
import { useQuasar } from "quasar";
import { useDataQuery } from "@/composables/useDataQuery";

export const usecontactStore = defineStore("contact store", () => {
  const dataQuery = useDataQuery();
  const $q = useQuasar();
  const contactResult = ref(null);
  const getcontacts = async () => {
    if (contactResult.value) {
      return;
    }
    try {
      $q.loading.show();
      const response = await dataQuery.get({
        contact: {},
      });
      contactResult.value = response.data;
    } catch (error) {
      console.error("error ", error);
    } finally {
      $q.loading.hide();
    }
  };
  return {
    contactResult,
    getcontacts,
  };
});
