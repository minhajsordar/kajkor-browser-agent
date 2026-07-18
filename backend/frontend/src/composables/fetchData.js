// category.js
import { ref, watchEffect } from "vue";
import { api } from "@/boot/axios";
import { useQuasar } from "quasar";
import { getToken } from "@/utils/token";
import { useUserAuthStore } from "@/stores/userAuthStore.js";
const userAuthStore = useUserAuthStore();
export function useFetchDataList(url, options = {}) {
  const $q = useQuasar();
  const data = ref(null);
  const error = ref(null);
  const fetchData = async () => {
    data.value = null;
    error.value = null;
    const config = {
      method: "GET",
      url: `${url}`,
      headers: {
        Authorization: `Bearer ${getToken("token")}`,
      },
      params: {
        userId: userAuthStore.userData?.id,
        pageNumber: 1,
        pageSize: 10000,
      },
      ...options,
    };
    $q.loading.show();
    try {
      const response = await api.request(config);
      data.value = response.data;
    } catch (error) {
      error.value = error;
    } finally {
      $q.loading.hide();
    }
  };

  // fetchData();
  watchEffect(() => {
    fetchData();
  });

  return { data, error, refetch: fetchData };
}
