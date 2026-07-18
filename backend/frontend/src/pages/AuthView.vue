<template>
  <div class="flex justify-center items-center auth-page-container">
    <div>
      <div class="q-gutter-y-md w-[300px] md:w-[420px]">
        <q-card>
          <q-card-section>
            <form class="" @submit="loginSubmit">
              <div class="mb-2">
                <div class="flex gap-1">
                  <q-img src="/logo.png" width="30px" height="30px" />
                  <h6>Welcome back!</h6>
                </div>
                <p class="text-black/50">
                  Let's navigate the sales management together — Bonik Sheba POS
                  is ready to launch you into a world of limitless
                  possibilities.
                </p>

                <p class="text-red-500" v-if="errorHeader">{{ errorHeader }}</p>
              </div>
              <div class="mb-2">
                <label for="email" class="block mb-2 text-sm font-medium text-gray-900">Email address</label>
                <q-input type="email" id="email" v-model="formDataLists.email" placeholder="john.doe@company.com"
                  required outlined dense />
              </div>
              <div class="mb-2">
                <label for="password" class="block mb-2 text-sm font-medium text-gray-900">Password</label>
                <q-input :type="viewPassword ? 'text' : 'password'" id="password" v-model="formDataLists.password"
                  placeholder="•••••••••" required outlined dense>
                  <template v-slot:append>
                    <q-btn round dense flat :icon="viewPassword ? 'visibility_off' : 'visibility'"
                      @click.prevent="togglePassword" class="cursor-pointer" />
                  </template>
                </q-input>
                <div class="flex justify-end">
                  <router-link to="/forgot-password" class="block mt-2 text-sm font-medium text-primary">Forget
                    password</router-link>
                </div>
              </div>
              <div className="w-full flex justify-center">
                <q-btn type="submit" color="primary" unelevated>
                  Sign in
                </q-btn>
              </div>
            </form>
          </q-card-section>
        </q-card>
      </div>
    </div>
  </div>
</template>
<script setup>
import { reactive, ref } from "vue";
import { api } from "@/boot/axios";
import { setToken } from "@/utils/token";
import { useRouter } from "vue-router";
import { useUserAuthStore } from "@/stores/userAuthStore.js";
import { useQuasar } from "quasar";
const $q = useQuasar();
const userAuthStore = useUserAuthStore();
const router = useRouter();
const formDataLists = reactive({
  email: "",
  password: "",
});
const errorHeader = ref("");
const viewPassword = ref(false);
const togglePassword = () => {
  viewPassword.value = !viewPassword.value;
};
const loading = ref(false);
const loginSubmit = async (e) => {
  errorHeader.value = "";
  e.preventDefault();
  const config = {
    method: "POST",
    url: "api/user/auth",
    headers: {
      "Content-Type": "application/json",
    },
    data: {
      email: formDataLists.email,
      password: formDataLists.password,
    },
  };
  loading.value = true;
  try {
    const response = await api.request(config);
    setToken("token", response.data?.data.token);
    console.log(response.data?.data);
    localStorage.setItem("auth-user", JSON.stringify(response.data?.data));
    userAuthStore.userData = response.data?.data;
    setTimeout(() => {
      if (response.data?.data.loginSuccessRedirect) {
        router.push(response.data?.data.loginSuccessRedirect);
      } else {
        router.push("/dashboard/sales/create");
      }
      loading.value = false;
    }, 100);
    setTimeout(() => {
      window.location.reload();
    }, 500);
    $q.notify({
      message: "welcome back",
      color: "primary",
      position: "top",
    });
    formDataLists.email = "";
    formDataLists.password = "";
    formDataLists.confirmpassword = "";
  } catch (error) {
    errorHeader.value =
      error.response.data.message || "Login failed, please try again.";
    $q.notify({
      message: error.response.data.message || "Login failed, please try again.",
      color: "red",
      position: "top",
    });
    loading.value = false;
  }
};
</script>
<style scoped>
.auth-page-container {
  width: 100vw;
  height: calc(100vh - 50px);
  /* background-image: url('/images/loginpage-image.jpg'); */
  background-image: url("/images/bgphoto-1125683587-612x612.jpg");
  background-size: cover;
}
</style>
