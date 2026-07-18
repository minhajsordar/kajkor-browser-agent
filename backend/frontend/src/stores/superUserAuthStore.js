import { defineStore } from "pinia";
import { ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { removeToken } from "@/utils/token";
import { getToken, setToken } from "@/utils/token";
import { useQuasar } from "quasar";
import { api } from "@/boot/axios";
export const useSuperUserAuthStore = defineStore("super user auth store", () => {
  const $q = useQuasar();
  const userData = ref(null);
  const router = useRouter();
  const route = useRoute();
  const checkLogin = () => {
    const authuser = localStorage.getItem("s-auth-user");
    if (authuser) {
      userData.value = JSON.parse(authuser);
    } else {
      router.push("/super-admin/login");
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
  const signOut = () => {
    localStorage.removeItem("s-auth-user");
    removeToken("s-token");
    router.push("/super-admin/login");
  };
  const getUserDataFromSessionStorage = () => {
    const authuser = localStorage.getItem("s-auth-user");
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
    const token = getToken("s-token");
    // console.log("token ", token)
    if (!token) {
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
      localStorage.setItem("s-auth-user", JSON.stringify(response.data?.data));
      userData.value = response.data?.data;
      if(response.data?.data.token){
        setToken("s-token", response.data?.data.token);
      }
      if (["/super-admin/login", "/super-admin"].includes(route.path)) {
        router.push("/super-admin/user");
      }
    } catch (error) {
      router.push("/super-admin/login");
      console.error(error);
    }
  };
  const requestSwitchUser = async (userId) => {
    if (!userId) {
      return;
    }
    const token = getToken("s-token");
    // console.log("token ", token)
    if (!token) {
      return;
    }
    const config = {
      method: "POST",
      url: "api/user/auth/switch-to-user",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      data: {
        userId,
      },
    };
    try {
      const response = await api.request(config);
      localStorage.setItem("auth-user", JSON.stringify(response.data?.data));
      userData.value = response.data?.data;
      if(response.data?.data.token){
        setToken("token", response.data?.data.token);
      }
      window.open("/dashboard", "_blank");
    } catch (error) {
      router.push("/super-admin/login");
      console.error(error);
    }
  };
  const switchToEntireShopOrBranch = async ({
    shopId,
    branchId,
    currentBranchId,
  }) => {
    if (!userData.value) {
      return;
    }
    if (branchId === currentBranchId) {
      return;
    }
    const token = getToken("s-token");
    if (!token) {
      return;
    }
    const params = {};
    if (shopId) {
      params.shopId = shopId;
    }
    if (branchId) {
      params.branchId = branchId;
    }
    const config = {
      method: "POST",
      url: "api/user/auth/switch",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      params,
    };
    try {
      const response = await api.request(config);
      // console.log(response.data?.data);
      const authUser = JSON.parse(localStorage.getItem("s-auth-user"));
      authUser.token = response.data?.data?.token;
      localStorage.setItem("s-auth-user", JSON.stringify(authUser));
      setToken("s-token", response.data?.data?.token);
      userData.value = authUser;
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error) {
      console.error(error);
    }
  };
  return {
    switchToEntireShopOrBranch,
    validateLogin,
    requestSwitchUser,
    userData,
    checkIsSuperAdmin,
    checkIsShopAdmin,
    checkLogin,
    signOut,
    getUserDataFromSessionStorage,
    checkShowOnPermission,
  };
});
