import { defineStore } from "pinia";
import { ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { removeToken } from "@/utils/token";
import { getToken, setToken } from "@/utils/token";
import { useQuasar } from "quasar";
import { api, isSubscriptionExpired, SUBSCRIPTION_EXPIRED_KEY } from "@/boot/axios";
export const useUserAuthStore = defineStore("user auth store", () => {
  const $q = useQuasar();
  const userData = ref(null);
  const router = useRouter();
  const route = useRoute();
  const checkLogin = () => {
    const authuser = localStorage.getItem("auth-user");
    if (authuser) {
      userData.value = JSON.parse(authuser);
    } else {
      router.push("/login");
    }
  };
  const checkIsSuperAdmin = () => {
    if (!userData.value) {
      return false;
    }
    return userData.value?.roles?.some((e) => e.slug === "superAdmin");
  };
  const checkIsShopAdmin = () => {
    if (!userData.value) {
      return false;
    }
    return userData.value?.roles?.some((e) => e.slug === "shopAdmin");
  };
  // In the desktop app, sign-out returns to the device PIN login, not the web
  // login (the device stays activated; only the user session is cleared).
  const isElectron = () =>
    typeof window !== "undefined" && !!window.api?.activation;
  const signOut = () => {
    localStorage.removeItem("auth-user");
    localStorage.removeItem(SUBSCRIPTION_EXPIRED_KEY);
    removeToken("token");
    router.push(isElectron() ? "/local-login" : "/login");
  };
  const getUserDataFromSessionStorage = () => {
    const authuser = localStorage.getItem("auth-user");
    if (authuser) {
      userData.value = JSON.parse(authuser);
    }
  };
  function checkShowOnPermission(slug) {
    let hasPermission = false;
    if (slug) {
      if (userData.value?.permissions?.includes(`${slug}`))
        hasPermission = true;
    }
    return hasPermission;
  }
  const validateLogin = async () => {
    if (userData.value) {
      return;
    }
    const token = getToken("token");
    // console.log("token ", token)
    if (!token) {
      return;
    }
    // Subscription expired: skip the (now-blocked) validate call so the user
    // isn't bounced to /login. Keep them on the page with cached user data;
    // the axios guard shows the expired dialog and disables further calls.
    if (isSubscriptionExpired()) {
      getUserDataFromSessionStorage();
      return;
    }
    const config = {
      method: "POST",
      url: "api/user/auth/validate",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    };
    try {
      const response = await api.request(config);
      localStorage.setItem("auth-user", JSON.stringify(response.data?.data));
      userData.value = response.data?.data;
      if(response.data?.data.token){
        setToken("token", response.data?.data.token);
      }
      if (["/login", "/"].includes(route.path)) {
        router.push("/dashboard");
      }
    } catch (error) {
      router.push("/login");
      console.error(error);
    }
  };
  const setSelectedBranch = (branchId) => {
    const raw = localStorage.getItem("auth-user");
    if (!raw) return;
    const parsed = JSON.parse(raw);
    parsed.selectedBranch = branchId ?? "";
    localStorage.setItem("auth-user", JSON.stringify(parsed));
    userData.value = parsed;
  };
  return {
    setSelectedBranch,
    validateLogin,
    userData,
    checkIsSuperAdmin,
    checkIsShopAdmin,
    checkLogin,
    signOut,
    getUserDataFromSessionStorage,
    checkShowOnPermission,
  };
});
