import { defineStore } from "pinia";
import { ref } from "vue";
import { useQuasar } from "quasar";
import { api } from "@/boot/axios";
import { useRoute, useRouter } from "vue-router";
import { getToken } from "@/utils/token";
function loadImageAsBase64(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "Anonymous"; // This enables cross-origin image loading for images hosted on external servers
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const dataURL = canvas.toDataURL("image/png");
      // console.log(dataURL)
      resolve(dataURL);
    };
    img.onerror = (err) => {
      reject(err);
    };
    img.src = url;
  });
}
export const useSiteSettingsStore = defineStore("site setting store", () => {
  const route = useRoute();
  const $q = useQuasar();
  const siteSettings = ref(null);

  const miniState = ref(false);
  const drawer = ref(true);
  const miniScreenRightDrawer = ref(false);
  
  const posHeaderImageBase64 = ref(null);
  const router = useRouter();
  const getSiteSettings = async () => {
    // userAuthStore.checkLogin()
    const config = {
      method: "GET",
      url: "api/branch/my-branch-details",
      headers: {
        Authorization: `Bearer ${getToken("token")}`,
      },
    };
    try {
      $q.loading.show();
      const response = await api.request(config);
      $q.loading.hide();
      siteSettings.value = response.data;
    } catch (error) {
      if (error?.response?.status == 401) {
        $q.notify({
          message: error.response.data.message + ". Login to try again.",
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
      } else {
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
      }
      $q.loading.hide();
      console.error("error ", error);
    } finally {
    }
  };
  return {
    miniState,
    drawer,
    miniScreenRightDrawer,

    posHeaderImageBase64,
    siteSettings,
    getSiteSettings,
  };
});
