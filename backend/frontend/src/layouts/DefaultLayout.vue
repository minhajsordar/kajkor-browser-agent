<template>
  <q-layout view="hHh Lpr lff" container style="height: 100vh" class="shadow-2">
    <q-header bordered :class="$q.dark.isActive ? 'bg-secondary' : 'bg-black'">
      <q-toolbar>
        <div>
          <q-btn to="/">Home</q-btn>
          <q-btn to="/login">Sign in</q-btn>
          <q-btn to="/forgot-password">Forgot Password</q-btn>
        </div>
      </q-toolbar>
    </q-header>
    <q-page-container>
      <router-view />
    </q-page-container>
  </q-layout>
</template>
<script setup>
import { useUserAuthStore } from "@/stores/userAuthStore.js";
import { onMounted } from "vue";
import { useRoute } from "vue-router";

const userAuthStore = useUserAuthStore();
const route = useRoute();
onMounted(() => {
  console.log(route.path);
  if (["/", "/login", "/forgot-password"].includes(route.path)){
    userAuthStore.validateLogin();
  }
});
</script>

<style>
.q-item .q-item__section--avatar {
  min-width: 32px;
  padding-right: 0px;
}
</style>
