<template>
  <q-page class="flex flex-center column q-gutter-md">
    <div class="text-h5">Backend connection</div>

    <q-card flat bordered style="min-width: 360px">
      <q-card-section class="row items-center q-gutter-sm">
        <q-icon :name="ok ? 'check_circle' : 'error'" :color="ok ? 'positive' : 'negative'" size="sm" />
        <div>
          <div class="text-subtitle2">{{ ok ? 'Connected' : 'Not connected' }}</div>
          <div class="text-caption text-grey">{{ baseUrl }}</div>
        </div>
        <q-space />
        <q-btn dense flat round icon="refresh" :loading="loading" @click="check" />
      </q-card-section>
      <q-separator />
      <q-card-section class="text-caption">
        <div v-if="ok">DB: {{ dbUp ? 'up' : 'down' }}</div>
        <div v-else class="text-negative">{{ error }}</div>
      </q-card-section>
    </q-card>

    <div class="text-caption text-grey">
      M0 shell. Chat &amp; sessions arrive in M1.
    </div>
  </q-page>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { api } from '@/boot/backend'

const loading = ref(false)
const ok = ref(false)
const dbUp = ref(false)
const error = ref('')
const baseUrl = ref('')

async function check() {
  loading.value = true
  error.value = ''
  baseUrl.value = api.defaults.baseURL || '(unset)'
  try {
    const { data } = await api.get('/health')
    ok.value = !!data?.ok
    dbUp.value = !!data?.db
  } catch (e) {
    ok.value = false
    error.value = e?.message || 'Request failed — is the backend running?'
  } finally {
    loading.value = false
  }
}

onMounted(check)
</script>
