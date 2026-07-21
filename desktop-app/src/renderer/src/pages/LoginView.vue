<template>
  <q-page class="flex flex-center">
    <q-card flat bordered style="width: 380px; max-width: 92vw">
      <q-card-section class="text-center">
        <div class="text-h6">{{ isRegister ? 'Create account' : 'Sign in' }}</div>
        <div class="text-caption text-grey">{{ backendUrl }}</div>
      </q-card-section>

      <q-card-section class="q-gutter-sm">
        <q-input
          v-if="isRegister"
          v-model="name"
          label="Name"
          dense
          outlined
          autocomplete="name"
        />
        <q-input
          v-model="email"
          label="Email"
          type="email"
          dense
          outlined
          autocomplete="email"
          @keydown.enter="submit"
        />
        <q-input
          v-model="password"
          label="Password"
          type="password"
          dense
          outlined
          autocomplete="current-password"
          @keydown.enter="submit"
        />
        <div v-if="auth.error" class="text-caption text-negative">{{ auth.error }}</div>
      </q-card-section>

      <q-card-actions vertical class="q-px-md q-pb-md q-gutter-sm">
        <q-btn
          color="primary"
          no-caps
          :label="isRegister ? 'Create account' : 'Sign in'"
          :loading="busy"
          :disable="!email || !password"
          @click="submit"
        />
        <q-btn
          flat
          dense
          no-caps
          :label="isRegister ? 'Have an account? Sign in' : 'Create an account'"
          @click="toggle"
        />
        <q-btn flat dense no-caps color="grey" label="Backend settings" @click="$router.push('/settings')" />
      </q-card-actions>
    </q-card>
  </q-page>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { getBackendUrl } from '@/boot/backend'

const router = useRouter()
const auth = useAuthStore()

const isRegister = ref(false)
const name = ref('')
const email = ref('')
const password = ref('')
const busy = ref(false)
const backendUrl = getBackendUrl()

function toggle() {
  isRegister.value = !isRegister.value
  auth.error = ''
}

async function submit() {
  if (!email.value || !password.value) return
  busy.value = true
  const ok = isRegister.value
    ? await auth.register(name.value, email.value, password.value)
    : await auth.login(email.value, password.value)
  busy.value = false
  if (ok) router.replace('/chat')
}
</script>
