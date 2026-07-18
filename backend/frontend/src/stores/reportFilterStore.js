import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { createDateFilter, toStartOfDay, toEndOfDay } from "@/utils/dateUtils.js";

export const useReportFilterStore = defineStore("report filter store", () => {
  const todayDate = (new Date().toISOString()).split("T")[0]
  const startOfThisMonth = (new Date(new Date().setDate(1)).toISOString()).split("T")[0]

  const filters = ref({
    from: startOfThisMonth,
    to: todayDate,
    contact: null,
    supplier: null,
    product: null,
    category: null,
    employee: null,
  })
  const dateFilters = ref({
    from: toStartOfDay(startOfThisMonth),
    to: toEndOfDay(todayDate),
  })

  const dateFilter = computed(() => {
    return createDateFilter(filters.value.from, filters.value.to);
  });


  return {
    filters,
    dateFilters,
    dateFilter
  };
});
