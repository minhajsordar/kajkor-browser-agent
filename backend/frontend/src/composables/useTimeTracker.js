// category.js
import { ref } from "vue";
import { useQuasar } from "quasar";
import { useApiReq } from "@/composables/useApiReq";
import soundPlayer from "@/utils/soundPlayer.js";
export function useTimeTracker() {
  const apiReq = useApiReq();
  const $q = useQuasar();
  const isLoading = ref(true);

  const start = async ({
    employeeId = null,
    data = {},
    onSuccess = () => { },
    onError = () => { },
  }) => {
    const config = {
      data,
      method: "POST",
      url: `api/employees/${employeeId}/start-time-tracking`,
    };

    try {
      const response = await apiReq.request(config);
      console.log(response, config)
      onSuccess(response);
      soundPlayer.success();
      $q.notify({
        message: "Time tracker started successfully",
        color: "green",
        position: "top",
      });
    } catch (error) {
      soundPlayer.failed();
      $q.notify({
        message: error?.response?.data?.message || error.message || "Failed to start time tracking",
        color: "red",
        position: "top",
      });
      console.error("Error: found: ", error);
      onError(error);
    }
  };
  const stop = async ({
    employeeId = null,
    data = {},
    onSuccess = () => { },
    onError = () => { },
  }) => {
    const config = {
      data,
      method: "POST",
      url: `api/employees/${employeeId}/stop-time-tracking`,
    };

    try {
      const response = await apiReq.request(config);
      // console.log(response)
      onSuccess(response);
      soundPlayer.success();
      $q.notify({
        message: "Time tracker stopped successfully",
        color: "green",
        position: "top",
      });
    } catch (error) {
      soundPlayer.failed();
      $q.notify({
        message: error?.response?.data?.message || error.message || "Failed to start time tracking",
        color: "red",
        position: "top",
      });
      console.error("Error: found: ", error);
      onError(error);
    }
  };
  return {
    start,
    stop,
    isLoading,
  };
}
