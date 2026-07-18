import { defineStore } from "pinia";
import { ref } from "vue";
import { useQuasar } from "quasar";
import { useDataStore } from "@/composables/useDataStore.js";
const unifiedStore = {
  variationValueStore: {
    name: "variationValueStore2",
    url: "api/variation-value",
    params: {
      limit: 1000,
    },
  },
};
export const useVariationValueStore = (storeObject = defineStore(
  storeObject.name,
  () => {
    const dataStore = useDataStore({
      url: storeObject.url,
    });
    const $q = useQuasar();
    const dataList = ref(null);
    const getDataList = async () => {
      if (dataList.value) {
        return;
      }
      dataStore.paginationAndFilter.value = storeObject.params;
    };
    const toLabels = (data) => {
      if (!data) {
        return "";
      }
      if (!dataStore.dataList.value) {
        return "";
      }
      const variants = Object.values(data);
      console.log(variants);
      const variationValues = dataStore.dataList.value?.data
        ?.filter((item) => variants.includes(item.id))
        .map((item) => item.name)
        .join(", ");
      return variationValues;
    };
    const detailsByid = (id) => {
      if (!id) {
        return null;
      }
      if (!dataStore.dataList.value) {
        return null;
      }
      const variationValues = dataStore.dataList.value?.data?.find(
        (item) => item.id === id
      );
      return variationValues;
    };
    return {
      dataList: dataStore.dataList,
      getDataList,
      toLabels,
      detailsByid,
    };
  }
)());
