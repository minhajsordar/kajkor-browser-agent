// useApiReq.js
import { ref } from "vue";
import { api } from "@/boot/axios";
import { getToken } from "@/utils/token";
import buildQueryParams from "@/utils/buildQueryParams.js";
const inflight = new Map();

export function useApiReq(options) {
  const tokenKey = options?.tokenKey || "token";
  const data = ref(null);
  const loading = ref(false);
  const error = ref(null);
  const apiReq = async (config) => {
    data.value = null;
    error.value = null;
    loading.value = true;
    if (!config?.method) {
      config.method = "GET";
    }
    const tokenK = tokenKey || "token";
    const tokenVal = getToken(tokenK);
    config.headers = {
      Authorization: `Bearer ${tokenVal}`,
      "Content-Type": "application/json",
      ...config.headers,
    };
    if (config?.method?.toString().toUpperCase() === "GET") {
      config.params = {
        ...config.params,
      };
      // Build a stable key for GET request de-duplication
      const qs = buildQueryParams(config.params || {});
      const key = `GET ${config.url}?${qs} :: ${tokenVal || "no-token"}`;

      // Reuse the same in-flight request if present
      let promise = inflight.get(key);
      if (!promise) {
        promise = api.request(config)
          .finally(() => {
            inflight.delete(key);
          });
        inflight.set(key, promise);
      }
      try {
        const response = await promise;
        data.value = response.data;
        return response.data;
      } catch (err) {
        error.value = err;
        console.log("api req: error: ", err?.response?.data?.message);
        throw err;
      } finally {
        loading.value = false;
      }
    }
    try {
      const response = await api.request(config);
      data.value = response.data;
      return response.data;
    } catch (err) {
      error.value = err;
      console.log("api req: error: ", err?.response?.data?.message);
      throw err;
    } finally {
      loading.value = false;
    }
  };

  return { data, error, request: apiReq };
}
