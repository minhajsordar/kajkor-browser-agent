// category.js
import { ref, watchEffect, toValue, watch } from "vue";
import { api } from "@/boot/axios";
import { useQuasar } from "quasar";
import { getToken } from "@/utils/token";

import { useUserAuthStore } from "@/stores/userAuthStore.js";
export function useDataQuery() {
  const userAuthStore = useUserAuthStore();
  const $q = useQuasar();
  const data = ref(null);
  const loading = ref(false);
  const error = ref(null);
  const fetchData = async (query) => {
    data.value = null;
    error.value = null;
    loading.value = true;
    const config = {
      method: "GET",
      url: `api/dataquery`,
      headers: {
        Authorization: `Bearer ${getToken("token")}`,
      },
      params: {
        user: userAuthStore.userData?.id,
        dataQuery: JSON.stringify(query),
      },
    };
    try {
      const response = await api.request(config);
      data.value = response.data;
      return response.data;
    } catch (error) {
      error.value = error;
      console.log(error);
      return { error: "Could not get data" };
    } finally {
      loading.value = false;
    }
  };
  const postData = async (bodydata) => {
    data.value = null;
    error.value = null;
    loading.value = true;
    const config = {
      method: "POST",
      url: `api/dataquery`,
      headers: {
        Authorization: `Bearer ${getToken("token")}`,
      },
      data: {
        ...bodydata,
      },
    };
    try {
      const response = await api.request(config);
      data.value = response.data;
      $q.notify({
        message: "Data saved successfully",
        color: "green",
        position: "top",
        actions: [
          {
            icon: "close",
            color: "white",
            handler: () => {
              /* ... */
            },
          },
        ],
      });
    } catch (error) {
      error.value = error;
      $q.notify({
        message: error.message,
        color: "red",
        position: "top",
        actions: [
          {
            icon: "close",
            color: "white",
            handler: () => {
              /* ... */
            },
          },
        ],
      });
    } finally {
      loading.value = false;
    }
  };

  return { data, error, get: fetchData, post: postData };
}
