// category.js
import { ref, watch } from "vue";
import { debounce, useQuasar } from "quasar";
import { useApiReq } from "@/composables/useApiReq";
import { useRouter, useRoute } from "vue-router";
import soundPlayer from "@/utils/soundPlayer.js";
import buildQueryParams from "@/utils/buildQueryParams.js";
const responseStore = {}
const clearCache = (...basePaths) => {
  const paths = basePaths.flat().filter(Boolean);
  if (paths.length === 0) return;
  Object.keys(responseStore).forEach((key) => {
    if (paths.some((p) => key.startsWith(p))) {
      delete responseStore[key];
    }
  });
}
export function useDataStore({
  tokenKey = "token",
  url = "",
  detailsUrl = "",
  dataListConfig = {
    params: {},
  },
  dataDetailsConfig = {},
  duplicateUrl = "",
  createUrl = "",
  updateUrl = "",
  deleteUrl = "",
}) {
  const route = useRoute();
  const router = useRouter();
  const paginationAndFilter = ref({
    page: 1,
    limit: 10,
    sortBy: "createdAt",
    sortOrder: -1,
  });
  const apiReq = useApiReq({tokenKey});
  const $q = useQuasar();
  const dataList = ref(null);
  const listLoading = ref(false);
  const createLoading = ref(false);
  const updateLoading = ref(false);
  const detailsLoading = ref(false);
  const deleteLoading = ref(false);
  const dataDetails = ref(null);

  const clearFilter = () => {
    paginationAndFilter.value = {
      page: 1,
      limit: 10,
      sortBy: "createdAt",
      sortOrder: -1,
    };
    // URL clearing is the caller's responsibility — they may want to preserve
    // some keys (e.g. branch). PurchaseView wipes via mergeSearchParams.
    getDataList();
  };
  const getDataList = async (getArguments = {}) => {
    const { onSuccess = () => { }, onError = () => { }, params = {}, baseUrl = url, refetch = false } = getArguments;
    listLoading.value = true;
    dataList.value = null;
    // URL is the single source of truth for filters. Caller `params` overrides
    // URL for this call only (e.g. always-applied branch). dataListConfig.params
    // is per-store defaults. Empty/null/undefined values are stripped so
    // cleared filters actually disappear instead of round-tripping back.
    const merged = {
      page: 1,
      limit: 10,
      sortBy: "createdAt",
      sortOrder: -1,
      ...route.query,
      ...dataListConfig.params,
      ...params,
    };
    const cleaned = {};
    for (const k of Object.keys(merged)) {
      const v = merged[k];
      if (v !== "" && v !== null && v !== undefined) cleaned[k] = v;
    }
    const config = { method: "GET", url: baseUrl, params: cleaned };
    paginationAndFilter.value = JSON.parse(JSON.stringify(cleaned));
    const fullLinkPath = `${baseUrl}?${buildQueryParams(cleaned)}`;
    if (responseStore[fullLinkPath] && !refetch) {
      dataList.value = responseStore[fullLinkPath];
      onSuccess(responseStore[fullLinkPath]);
      setTimeout(() => {
        listLoading.value = false;
      }, 300);
      return;
    }
    $q.loading.show({
      message: 'Please wait while fetching data...',
      html: true,
      boxClass: 'text-white',
      spinnerColor: 'primary',
    })
    try {
      const response = await apiReq.request(config);
      // console.log("response", response)
      dataList.value = response;
      responseStore[fullLinkPath] = response;
      if (onSuccess) {
        onSuccess(response);
      }
      return response;
    } catch (error) {
      // $q?.notify({
      //   message: error?.response?.data?.message || error.message,
      //   color: "red",
      //   position: "top",
      // });
      console.error(error);
      if (onError) {
        onError(error);
      }
      return error;
    } finally {
      setTimeout(() => {
        $q.loading.hide();
        listLoading.value = false;
      }, 500);
    }
  };
  // watch(() => route.query, debounce(getDataList, 400));
  // watch(paginationAndFilter.value, debounce(getDataList, 400));

  const getDataById = async ({
    id = "",
    onSuccess = () => { },
    onError = () => { },
  } = {}) => {
    if (!id) {
      return;
    }
    const config = {
      method: "GET",
      url: `${detailsUrl ? detailsUrl : url}/${id}`,
    };
    detailsLoading.value = true;

    $q.loading.show({
      message: 'Please wait while fetching data...',
      html: true,
      boxClass: 'text-white',
      spinnerColor: 'primary',
    })
    try {
      const response = await apiReq.request(config);
      dataDetails.value = response.data;
      onSuccess(response);
      return response;
    } catch (error) {
      $q?.notify({
        message: error?.response?.data?.message || error.message,
        color: "red",
        position: "top",
      });
      console.error(error);
      onError(error);
      return error;
    } finally {
      setTimeout(() => {
        $q.loading.hide();
        detailsLoading.value = false;
      }, 300);
    }
  };
  const duplicateDataById = async ({
    confirmConfig = {},
    confirm = true,
    ...rest
  }) => {
    if (!rest.id) {
      $q?.notify({
        message: "Please select a product to duplicate",
        color: "red",
        position: "top",
        actions: [
          {
            icon: "close",
            color: "white",
          },
        ],
      });
      return;
    }
    if (!confirm) {
      fireDuplocateDataById({
        ...rest,
      });
      return;
    }
    $q?.dialog({
      title: "Duplicate Product",
      message: "Press ok to duplicate, or cancel to stay here",
      cancel: true,
      persistent: true,
      ...confirmConfig,
    }).onOk(() => {
      fireDuplocateDataById({
        ...rest,
      });
    });
  };
  const fireDuplocateDataById = async ({
    id = "",
    onSuccess = () => { },
    onError = () => { },
    redirect = "",
    redirectConfirm = false,
    redirectAfterDuplicate = "",
  }) => {
    if (!id) {
      return;
    }
    const config = {
      method: "POST",
      url: `${duplicateUrl ? duplicateUrl : url}/${id}`,
    };

    $q.loading.show({
      message: 'Please wait while duplicating data...',
      html: true,
      boxClass: 'text-white',
      spinnerColor: 'primary',
    })
    try {
      const response = await apiReq.request(config);
      dataDetails.value = response.data;
      onSuccess(response);
      soundPlayer.success();

      if (redirectConfirm || redirect) {
        $q?.dialog({
          title: "Data updated successfully",
          message: "Press ok to go back, or cancel to stay here",
          cancel: true,
          persistent: true,
        }).onOk(() => {
          if (redirect) {
            router.push(redirect);
          } else {
            if (redirectAfterDuplicate)
              router.push(`${redirectAfterDuplicate}/${id}`);
          }
        });
      } else {
        getDataList();
      }
      $q?.notify({
        message: "Product duplicated successfully",
        color: "green",
        position: "top",
      });
    } catch (error) {
      $q.loading.hide()
      soundPlayer.failed();
      $q?.notify({
        message: error?.response?.data?.message || error.message,
        color: "red",
        position: "top",
      });
      console.error(error);
      onError(error);
    }
  };
  const updateDetails = async ({
    id = "create",
    data = {},
    redirect = "",
    redirectConfirm = false,
    onSuccess = () => { },
    onError = () => { },
  }) => {
    const config = {
      data,
    };
    if (!id) {
      id = "create";
    }
    if (id?.toLowerCase() == "create") {
      config.method = "post";
      config.url = `${createUrl ? createUrl : url}`;
    } else {
      config.method = "put";
      config.url = `${updateUrl ? updateUrl : url}/${id}`;
    }
    updateLoading.value = true;
    createLoading.value = true;
    $q.loading.show({
      message: `Please wait while ${id.toLowerCase() == "create" ? "creating" : "updating"} data...`,
      html: true,
      boxClass: 'text-white',
      spinnerColor: 'primary',
    })
    try {
      const response = await apiReq.request(config);
      // console.log(response)
      dataDetails.value = response.data;
      onSuccess(response);
      soundPlayer.success();
      if (["put", "post"].includes(config.method) && redirect) {
        router.push(`${redirect}/${response?.data?.id}`);
      } else if (redirectConfirm) {
        const dialog = $q
          .dialog({
            title: "Data updated successfully",
            message:
              "Press ok to go back, or cancel to stay here, closing in 3 seconds",
            cancel: true,
            persistent: true,
          })
          .onOk(() => {
            if (redirect) {
              router.push(redirect);
            } else {
              router.back();
            }
          });
        let percentage = 3;
        const interval = setInterval(() => {
          percentage = percentage - 1;

          // we update the dialog
          dialog.update({
            message: `Press ok to go back, or cancel to stay here, closing in ${percentage} seconds`,
          });

          // if we are done, we're gonna close it
          if (percentage === 0) {
            clearInterval(interval);
            setTimeout(() => {
              dialog.hide();
            }, 350);
          }
        }, 1000);
      } else if (redirect) {
        router.push(redirect);
      }
      $q?.notify({
        message: "Updated Successfully",
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
      clearCache(url);
    } catch (error) {
      soundPlayer.failed();
      $q?.notify({
        message: error?.response?.data?.message || error.message,
        color: "red",
        position: "top",
      });
      console.error("Error: found: ", error);
      onError(error);
    } finally {
      setTimeout(() => {
        $q.loading.hide()
        updateLoading.value = false;
        createLoading.value = false;
      }, 1000);
    }
  };
  const deleteDataById = async ({
    id = "",
    onSuccess = () => { },
    onError = () => { },
  }) => {
    if (!id) {
      return;
    }
    const config = {
      method: "DELETE",
      url: `${deleteUrl ? deleteUrl : url}/${id}`,
    };
    deleteLoading.value = true;
    $q.loading.show({
      message: 'Please wait while deleting data...',
      html: true,
      boxClass: 'text-white',
      spinnerColor: 'primary',
    })
    try {
      await apiReq.request(config);
      onSuccess();
      $q?.notify({
        message: "Data Deleted Successfully",
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
      soundPlayer.deleted();
      clearCache(url);
    } catch (error) {
      soundPlayer.error();
      $q?.notify({
        message: error?.response?.data?.message || error.message,
        color: "red",
        position: "top",
      });
      console.error(error);
      onError();
    } finally {
      setTimeout(() => {
        $q.loading.hide()
        deleteLoading.value = false;
      }, 300);
    }
  };
  return {
    clearCache,
    dataDetails,
    getDataById,
    duplicateDataById,
    dataList,
    getDataList,
    clearFilter,
    createDetails: updateDetails,
    updateDetails,
    deleteDataById,
    listLoading,
    createLoading,
    updateLoading,
    detailsLoading,
    deleteLoading,
  };
}
