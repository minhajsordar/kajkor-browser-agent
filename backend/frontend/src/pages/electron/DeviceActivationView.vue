<template>
  <div class="activation-page-container flex flex-center">
    <q-card class="activation-card shadow-10">
      <q-card-section class="text-center q-pb-none">
        <q-img src="/logo.png" style="width: 80px; height: 80px" class="q-mb-md" />
        <div class="text-h5 text-weight-bold">Activate Your Device</div>
        <div class="text-subtitle1 text-grey-7 q-mt-sm">
          Enter the activation code provided by your administrator.
        </div>
      </q-card-section>

      <q-banner
        v-if="restoreInfo"
        class="bg-green-1 text-green-9 rounded-borders q-mx-md"
        dense
      >
        <template #avatar><q-icon name="cloud_done" color="positive" /></template>
        Restored <strong>{{ restoreInfo.documents }}</strong> records<span
          v-if="restoreInfo.shopName"
        >
          from <strong>{{ restoreInfo.shopName }}</strong></span
        ><span v-if="restoreInfo.exportedAt">
          (backup taken {{ formatBackupDate(restoreInfo.exportedAt) }})</span
        >. Activation will sync only changes since then — no full re-download.
      </q-banner>

      <q-card-section class="q-pt-lg">
        <q-form @submit="onSubmit" class="q-gutter-md">
          <q-input
            v-model="serverUrl"
            label="Cloud Server URL *"
            outlined
            required
            :disable="loading"
            placeholder="https://easypos.example.com"
            :rules="[(v) => !!v || 'Server URL required']"
          />

          <q-input
            v-model="activationCode"
            label="Activation Code *"
            outlined
            required
            class="text-h6"
            :disable="loading"
            placeholder="e.g. A1B2C3D4"
            :rules="[(v) => !!v || 'Code is required']"
          />

          <q-input
            v-model="deviceName"
            label="Device Name (Optional)"
            outlined
            :disable="loading"
            placeholder="e.g. Main Counter POS"
            hint="Helpful for identifying this device later"
          />

          <div class="q-mt-xl">
            <q-btn
              type="submit"
              label="Activate Device"
              color="primary"
              class="full-width text-weight-bold"
              size="18px"
              unelevated
              :loading="loading"
            />
          </div>
        </q-form>

        <div class="text-center q-mt-md">
          <q-btn
            flat
            dense
            no-caps
            color="primary"
            icon="restore"
            label="Restore From Backup"
            :loading="restoring"
            :disable="loading"
            @click="restoreFromBackup"
          />
          <div class="text-caption text-grey-6 q-mt-xs">
            Recover local data from a backup file, then activate this device.
          </div>
        </div>
      </q-card-section>

      <q-inner-loading :showing="loading" class="activation-loading">
        <div class="full-width q-px-lg text-center">
          <q-spinner-gears size="48px" color="teal" class="q-mb-md" />
          <div class="text-teal text-weight-bold" style="font-size: 1.05em">
            {{ progressLabel || 'Activating and syncing initial data…' }}
          </div>
          <q-linear-progress
            :value="progressPercent / 100"
            :indeterminate="progressPercent <= 0"
            color="teal"
            track-color="teal-1"
            size="14px"
            rounded
            class="q-mt-md"
          />
          <div v-if="progressPercent > 0" class="text-grey-7 text-caption q-mt-xs">
            {{ progressPercent }}%
          </div>
          <div class="text-grey-6 text-caption q-mt-sm">
            Please don't close the application.
          </div>
        </div>
      </q-inner-loading>
    </q-card>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useQuasar } from 'quasar'

const router = useRouter()
const $q = useQuasar()

const serverUrl = ref('')
const activationCode = ref('')
const deviceName = ref('')
const loading = ref(false)
const restoring = ref(false)
const restoreInfo = ref(null)
const progressPercent = ref(0)
const progressLabel = ref('')
let offProgress = null

const formatBackupDate = (iso) => {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

const isElectron = () => typeof window !== 'undefined' && !!window.api?.activation

const checkExistingActivation = async () => {
  if (!isElectron()) return
  try {
    const isActivated = await window.api.device.isActivated()
    if (isActivated) router.push('/local-login')
  } catch (e) {
    console.error('isActivated failed', e)
  }
}

const onSubmit = async () => {
  if (!isElectron()) {
    $q.notify({ color: 'negative', message: 'Electron runtime not available.', position: 'top' })
    return
  }
  if (!activationCode.value || !serverUrl.value) return

  loading.value = true
  progressPercent.value = 0
  progressLabel.value = 'Contacting server…'
  try {
    const url = serverUrl.value.trim().replace(/\/+$/, '')
    localStorage.setItem('lastServerUrl', url)
    const result = await window.api.activation.activate(
      activationCode.value.trim(),
      deviceName.value || undefined,
      url
    )

    if (result.success) {
      $q.notify({
        color: 'positive',
        message: 'Device activated. Initial sync running.',
        icon: 'check_circle',
        position: 'top'
      })
      router.push('/local-login')
    } else {
      throw new Error(result.error || 'Activation failed.')
    }
  } catch (error) {
    console.error('Activation error:', error)
    $q.notify({
      color: 'negative',
      message: error.message || 'Activation failed. Check code, URL, and network.',
      icon: 'error',
      position: 'top',
      timeout: 5000
    })
  } finally {
    loading.value = false
  }
}

const restoreFromBackup = () => {
  if (!window.api?.backup?.import) {
    $q.notify({ color: 'negative', message: 'Backup restore not available.', position: 'top' })
    return
  }
  $q.dialog({
    title: 'Restore From Backup',
    message:
      'This replaces all local data on this device with the contents of the backup file. ' +
      'You will still need to activate the device afterwards. Continue?',
    cancel: true,
    persistent: true,
    ok: { label: 'Choose File & Restore', color: 'primary' }
  }).onOk(async () => {
    restoring.value = true
    try {
      const result = await window.api.backup.import()
      if (result?.canceled) return
      if (!result?.success) throw new Error(result?.error || 'Restore failed')
      restoreInfo.value = {
        documents: result.documents,
        exportedAt: result.exportedAt || null,
        shopName: result.shopName || null
      }
      $q.notify({
        color: 'positive',
        message: `Restored ${result.documents} records from backup. Now activate this device.`,
        icon: 'check_circle',
        position: 'top',
        timeout: 5000
      })
      // A backup never carries device identity (_device_info), so the device is
      // still unactivated — but check anyway in case a prior activation survived.
      try {
        if (await window.api.device.isActivated()) router.push('/local-login')
      } catch {
        /* stay on activate */
      }
    } catch (err) {
      $q.notify({
        color: 'negative',
        message: err.message || 'Restore failed',
        icon: 'error',
        position: 'top',
        timeout: 5000
      })
    } finally {
      restoring.value = false
    }
  })
}

onMounted(() => {
  if (!window.api) {
    console.error('Electron runtime APIs not available.')
  }
  if (window.api?.activation?.onProgress) {
    offProgress = window.api.activation.onProgress((_e, data) => {
      if (typeof data?.percent === 'number') progressPercent.value = data.percent
      if (data?.label) progressLabel.value = data.label
    })
  }
  serverUrl.value = localStorage.getItem('lastServerUrl') || ''
  deviceName.value = `POS Device ${Math.floor(Math.random() * 1000)}`
  checkExistingActivation()
})

onBeforeUnmount(() => {
  if (typeof offProgress === 'function') offProgress()
})
</script>

<style scoped>
.activation-page-container {
  width: 100vw;
  height: 100vh;
  background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
}
.activation-card {
  width: 100%;
  max-width: 500px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.98);
  padding: 16px;
}
</style>
