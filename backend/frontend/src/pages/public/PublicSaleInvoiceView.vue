<template>
  <div v-if="loading" class="min-h-screen flex items-center justify-center text-gray-500">Loading invoice...</div>
  <div v-else-if="errorMessage" class="min-h-screen flex items-center justify-center">
    <div class="bg-white border border-red-200 rounded-xl p-8 text-center max-w-md">
      <div class="text-2xl font-bold text-red-600 mb-2">Unavailable</div>
      <div class="text-gray-600">{{ errorMessage }}</div>
    </div>
  </div>
  <SaleInvoice v-else :dataObj="sale" :contactDetails="sale?.contactDetails" />
</template>

<script setup>
import { ref, onMounted } from "vue";
import { useRoute } from "vue-router";
import { api } from "@/boot/axios";
import SaleInvoice from "@/pages/dashboard/product-sale/sales_print/SaleInvoice.vue";

const route = useRoute();
const sale = ref(null);
const loading = ref(true);
const errorMessage = ref("");

onMounted(async () => {
  try {
    const res = await api.request({
      method: "GET",
      url: `api/product-sale/public/${route.params.token}`,
    });
    const payload = res.data?.data;
    if (res.data?.success && payload?.sale) {
      // branchDetails is embedded in the sale payload; SaleInvoice reads it.
      sale.value = payload.sale;
    } else {
      errorMessage.value = res.data?.message || "Unable to load invoice";
    }
  } catch (e) {
    errorMessage.value = e?.response?.data?.message || "Invalid or expired link";
  } finally {
    loading.value = false;
  }
});
</script>
