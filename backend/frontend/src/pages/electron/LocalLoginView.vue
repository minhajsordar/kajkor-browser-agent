<template>
  <div class="flex justify-center items-center auth-page-container">
    <div>
      <div class="q-gutter-y-md w-[300px] md:w-[420px]">
        <q-card>
          <q-card-section>
            <q-banner v-if="deviceRevoked" class="bg-red-1 text-red-9 q-mb-md" rounded>
              <template #avatar><q-icon name="block" color="negative" /></template>
              This device has been revoked. Contact your admin for a new activation code.
            </q-banner>

            <form @submit="onSubmit">
              <div class="mb-2">
                <div class="flex gap-1 items-center">
                  <q-img src="/logo.png" width="30px" height="30px" />
                  <h6 class="q-my-none">Welcome back!</h6>
                </div>
                <p class="text-black/50 q-mt-sm">
                  Enter your device PIN to sign in. No internet needed.
                </p>
                <p v-if="errorMsg" class="text-red-500">{{ errorMsg }}</p>
                <p v-if="deviceInfo?.userName" class="text-sm text-black/70 q-mt-xs">
                  Signing in as <strong>{{ deviceInfo.userName }}</strong>
                </p>
                <p v-if="deviceInfo" class="text-xs text-black/50 q-mt-xs">
                  Branch: <strong>{{ deviceInfo.branchName || deviceInfo.branchId }}</strong>
                </p>
              </div>

              <div class="mb-2">
                <label class="block mb-2 text-sm font-medium text-gray-900">Device PIN</label>
                <q-input
                  v-model="devicePin"
                  :type="viewPassword ? 'text' : 'password'"
                  placeholder="Enter device PIN"
                  required
                  outlined
                  dense
                  autofocus
                  :disable="deviceRevoked"
                >
                  <template #append>
                    <q-btn
                      round
                      dense
                      flat
                      :icon="viewPassword ? 'visibility_off' : 'visibility'"
                      @click.prevent="viewPassword = !viewPassword"
                    />
                  </template>
                </q-input>
              </div>

              <div class="w-full flex justify-between items-center gap-2 q-mt-md">
                <q-btn
                  type="submit"
                  color="primary"
                  unelevated
                  :loading="loading"
                  :disable="deviceRevoked"
                >
                  Sign in
                </q-btn>
                <q-btn
                  flat
                  dense
                  size="sm"
                  label="Reset Device"
                  color="negative"
                  icon="restart_alt"
                  @click="showResetDialog = true"
                />
              </div>
              <div class="w-full flex justify-center q-mt-sm">
                <q-btn
                  flat
                  dense
                  size="sm"
                  no-caps
                  label="Change Device PIN"
                  color="primary"
                  icon="key"
                  :disable="deviceRevoked"
                  @click="openChangePinDialog"
                />
              </div>
            </form>
          </q-card-section>
        </q-card>
        <div class="text-center text-xs text-white/70 q-mt-sm">
          <a
            href="#"
            class="text-white inline-flex items-center gap-1"
            :class="{ 'pointer-events-none opacity-60': syncing }"
            @click.prevent="forceSync"
          >
            <q-spinner v-if="syncing" size="14px" />
            {{ syncing ? 'Syncing…' : 'Force Sync Now' }}
          </a>
        </div>
      </div>
    </div>

    <q-dialog v-model="showChangePinDialog" persistent>
      <q-card style="max-width: 400px; min-width: 320px">
        <q-card-section class="row items-center">
          <q-avatar icon="key" color="primary" text-color="white" />
          <span class="q-ml-sm text-h6">Change Device PIN</span>
        </q-card-section>
        <q-card-section class="q-pt-none">
          <p class="text-body2 text-black/60 q-mb-md">
            Enter your current PIN, then choose a new one. The change applies on
            this device immediately and syncs to the cloud when online.
          </p>
          <q-form @submit="changePin" class="q-gutter-md">
            <q-input
              v-model="changePinForm.current"
              type="password"
              label="Current PIN *"
              outlined
              dense
              autofocus
              :rules="[(v) => !!v || 'Current PIN is required']"
            />
            <q-input
              v-model="changePinForm.next"
              type="password"
              label="New PIN *"
              outlined
              dense
              :rules="[
                (v) => !!v || 'New PIN is required',
                (v) => v.length >= 6 || 'Minimum 6 characters',
              ]"
            />
            <q-input
              v-model="changePinForm.confirm"
              type="password"
              label="Confirm New PIN *"
              outlined
              dense
              :rules="[
                (v) => !!v || 'Please confirm the new PIN',
                (v) => v === changePinForm.next || 'PINs do not match',
              ]"
            />
            <div class="flex justify-end q-gutter-sm q-mt-md">
              <q-btn flat label="Cancel" @click="closeChangePinDialog" />
              <q-btn
                type="submit"
                label="Update PIN"
                color="primary"
                :loading="changingPin"
              />
            </div>
          </q-form>
        </q-card-section>
      </q-card>
    </q-dialog>

    <q-dialog v-model="showResetDialog" persistent>
      <q-card style="max-width: 400px">
        <q-card-section class="row items-center">
          <q-avatar icon="warning" color="negative" text-color="white" />
          <span class="q-ml-sm text-h6">Reset Device?</span>
        </q-card-section>
        <q-card-section class="q-pt-none">
          <q-banner class="bg-red-1 text-red-9 rounded-borders q-mb-sm">
            <template #avatar><q-icon name="dangerous" /></template>
            This will remove the activation. You will need a new activation code from your admin.
            {{
              wipeData
                ? 'All local data on this device will be permanently erased.'
                : 'Local data is preserved but inaccessible until reactivated.'
            }}
          </q-banner>
          <q-checkbox
            v-model="wipeData"
            color="negative"
            label="Also erase all local data (full reset)"
            class="q-mb-sm"
          />
          <q-banner
            v-if="wipeData"
            dense
            class="bg-orange-1 text-orange-9 rounded-borders q-mb-sm text-caption"
          >
            <template #avatar><q-icon name="delete_forever" size="20px" /></template>
            Unsynced local changes will be lost. Make sure this device has synced
            recently before erasing.
          </q-banner>
          <p class="text-body2">Type <strong>RESET</strong> to confirm:</p>
          <q-input
            v-model="resetConfirmText"
            outlined
            dense
            placeholder="RESET"
            :error="resetConfirmText.length > 0 && resetConfirmText !== 'RESET'"
            error-message="Type exactly: RESET"
          />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancel" @click="closeResetDialog" />
          <q-btn
            label="Reset Device"
            color="negative"
            icon="restart_alt"
            :disable="resetConfirmText !== 'RESET'"
            :loading="resetting"
            @click="resetDevice"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useQuasar } from 'quasar'
import { api } from '@/boot/axios.js'
import { setToken } from '@/utils/token.js'
import { useUserAuthStore } from '@/stores/userAuthStore.js'

const router = useRouter()
const $q = useQuasar()
const userAuthStore = useUserAuthStore()

const devicePin = ref('')
const viewPassword = ref(false)
const loading = ref(false)
const syncing = ref(false)
const errorMsg = ref('')
const deviceRevoked = ref(false)
const deviceInfo = ref(null)

const showResetDialog = ref(false)
const resetConfirmText = ref('')
const resetting = ref(false)
const wipeData = ref(false)

const showChangePinDialog = ref(false)
const changingPin = ref(false)
const changePinForm = ref({ current: '', next: '', confirm: '' })

const isElectron = () => typeof window !== 'undefined' && !!window.api?.activation

const onSubmit = async (e) => {
  e.preventDefault()
  if (!devicePin.value) return
  const deviceId = deviceInfo.value?.deviceId
  if (!deviceId) {
    errorMsg.value = 'Device not activated. Please activate this device first.'
    return
  }
  errorMsg.value = ''
  loading.value = true
  try {
    const response = await api.request({
      method: 'POST',
      url: 'api/device/login',
      headers: { 'Content-Type': 'application/json' },
      data: { deviceId, devicePassword: devicePin.value }
    })
    const data = response.data?.data
    if (!data?.token) throw new Error('No token in response')
    setToken('token', data.token)
    localStorage.setItem('auth-user', JSON.stringify(data))
    userAuthStore.userData = data
    $q.notify({ message: 'Welcome back', color: 'primary', position: 'top' })
    const redirect = data.loginSuccessRedirect || '/dashboard/sales/create'
    router.push(redirect)
    setTimeout(() => window.location.reload(), 400)
  } catch (err) {
    const msg =
      err?.response?.data?.message ||
      err?.message ||
      'Login failed, please try again.'
    errorMsg.value = msg
    $q.notify({ message: msg, color: 'red', position: 'top' })
  } finally {
    loading.value = false
  }
}

const closeResetDialog = () => {
  showResetDialog.value = false
  resetConfirmText.value = ''
  wipeData.value = false
}

const openChangePinDialog = () => {
  changePinForm.value = { current: '', next: '', confirm: '' }
  showChangePinDialog.value = true
}

const closeChangePinDialog = () => {
  showChangePinDialog.value = false
  changePinForm.value = { current: '', next: '', confirm: '' }
}

const changePin = async (e) => {
  e?.preventDefault?.()
  if (!isElectron()) return
  changingPin.value = true
  try {
    const result = await window.api.activation.changeDevicePassword(
      changePinForm.value.current,
      changePinForm.value.next
    )
    if (!result.success) throw new Error(result.error || 'Failed to change PIN')
    $q.notify({
      color: result.syncedToCloud ? 'positive' : 'warning',
      message: result.syncedToCloud
        ? 'Device PIN updated.'
        : 'Device PIN updated on this device. Reconnect to the internet to sync it to the cloud.',
      timeout: 4000,
      position: 'top'
    })
    closeChangePinDialog()
  } catch (err) {
    $q.notify({
      color: 'negative',
      message: err.message || 'Failed to change PIN',
      icon: 'error',
      position: 'top'
    })
  } finally {
    changingPin.value = false
  }
}

const resetDevice = async () => {
  if (!isElectron()) return
  resetting.value = true
  try {
    const result = await window.api.activation.reset({ wipeData: wipeData.value })
    if (!result.success) throw new Error(result.error || 'Reset failed')
    $q.notify({
      color: 'positive',
      message: result.wiped
        ? 'Device reset and local data erased. Activate with a new code.'
        : 'Device reset. Activate with a new code.',
      timeout: 3000
    })
    closeResetDialog()
    router.push('/activate')
  } catch (err) {
    $q.notify({
      color: 'negative',
      message: err.message || 'Failed to reset device',
      icon: 'error'
    })
  } finally {
    resetting.value = false
  }
}

const forceSync = async () => {
  if (!isElectron() || syncing.value) return
  syncing.value = true
  try {
    const r = await window.api.sync.trigger()
    const hasRejects = Number(r?.rejected) > 0
    $q.notify({
      color: r.success ? (hasRejects ? 'warning' : 'positive') : 'negative',
      message: r.success
        ? `Sync OK. sent=${r.pushed} accepted=${r.applied ?? r.pushed}` +
          (hasRejects ? ` rejected=${r.rejected}` : '') +
          ` pulled=${r.pulled}`
        : `Sync failed: ${r.error || 'unknown'}`,
      position: 'top'
    })
  } catch (err) {
    $q.notify({ color: 'negative', message: err.message, position: 'top' })
  } finally {
    syncing.value = false
  }
}

onMounted(async () => {
  if (!isElectron()) {
    console.warn('Electron APIs not available — page meant for desktop runtime.')
    return
  }
  try {
    deviceInfo.value = await window.api.device.getInfo()
  } catch {
    /* ignore */
  }
  try {
    const result = await window.api.activation.verify()
    if (result?.revoked) deviceRevoked.value = true
  } catch {
    /* offline ok */
  }
})
</script>

<style scoped>
.auth-page-container {
  width: 100vw;
  height: 100vh;
  background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
}
</style>
