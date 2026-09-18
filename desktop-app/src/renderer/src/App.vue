<template>
  <q-layout view="hHh lpR fFf">
    <q-header class="app-head bg-white text-grey-9">
      <q-toolbar style="min-height: 46px">
        <q-avatar size="28px">🤖</q-avatar>
        <q-toolbar-title class="text-body1 text-weight-medium">Kajkor Agent</q-toolbar-title>
        <q-tabs v-if="!isAuthPage" dense shrink stretch active-color="primary" indicator-color="primary" class="text-grey-7">
          <q-route-tab to="/chat" label="Chat" no-caps />
          <q-route-tab to="/todos" label="Todos" no-caps />
          <q-route-tab to="/data" label="Data" no-caps />
          <q-route-tab to="/skills" label="Skills" no-caps />
          <q-route-tab to="/elements" label="Elements" no-caps />
          <q-route-tab to="/feedback" label="Feedback" no-caps />
        </q-tabs>
        <q-space />
        <div v-if="auth.mode === 'authed'" class="text-caption text-grey-6 q-mr-sm">
          {{ auth.user?.email }}
        </div>
        <q-btn flat dense round icon="settings" class="text-grey-7" @click="$router.push('/settings')">
          <q-tooltip>Settings</q-tooltip>
        </q-btn>
        <div class="text-caption text-grey-5 q-ml-sm">v{{ version }}</div>
      </q-toolbar>
    </q-header>

    <q-page-container>
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const auth = useAuthStore()
const version = ref('')

const isAuthPage = computed(() => route.name === 'login')

onMounted(async () => {
  try {
    version.value = (await window.api?.app?.getVersion?.()) || ''
  } catch {
    version.value = ''
  }
})
</script>

<style scoped>
.app-head {
  border-bottom: 1px solid #e6e7ea;
}
</style>

<style>
/* The app must never scroll horizontally at the document level — a fixed
   header + shifted page (sidebar sliding off-screen) is broken UX. Anything
   wide must wrap or scroll inside its own container. */
html,
body {
  overflow-x: hidden;
}
.q-page {
  max-width: 100vw;
}
</style>
