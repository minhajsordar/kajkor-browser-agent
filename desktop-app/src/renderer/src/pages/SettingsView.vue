<template>
  <q-page class="flex flex-center column q-gutter-md q-pa-lg">
    <q-card flat bordered style="width: 460px; max-width: 94vw">
      <q-card-section>
        <div class="text-subtitle1">Backend</div>
        <div class="text-caption text-grey">
          Where the app sends tasks. Leave as the local default unless connecting
          to a remote backend (which requires signing in).
        </div>
      </q-card-section>
      <q-card-section class="q-gutter-sm">
        <q-input v-model="url" label="Backend URL" dense outlined placeholder="http://localhost:34730" />
        <div class="row items-center q-gutter-sm">
          <q-btn color="primary" no-caps label="Save & connect" :loading="saving" @click="save" />
          <q-btn flat no-caps label="Reset to default" @click="resetDefault" />
        </div>
        <div class="row items-center q-gutter-xs">
          <q-icon :name="ok ? 'check_circle' : 'error'" :color="ok ? 'positive' : 'negative'" size="xs" />
          <span class="text-caption">{{ status }}</span>
        </div>
      </q-card-section>
    </q-card>

    <q-card flat bordered style="width: 460px; max-width: 94vw">
      <q-card-section>
        <div class="text-subtitle1">Account</div>
        <div class="text-caption text-grey">
          <template v-if="auth.mode === 'local'">
            Local backend — trusted, no sign-in required.
          </template>
          <template v-else-if="auth.mode === 'authed'">
            Signed in as {{ auth.user?.name }} ({{ auth.user?.email }}) · {{ auth.user?.role }}
          </template>
          <template v-else>Not signed in.</template>
        </div>
      </q-card-section>
      <q-card-actions>
        <q-btn v-if="auth.canLogout" flat no-caps color="negative" label="Sign out" @click="signOut" />
        <q-btn v-else-if="auth.mode === 'anon'" flat no-caps color="primary" label="Sign in" @click="$router.push('/login')" />
      </q-card-actions>
    </q-card>

    <q-card flat bordered style="width: 460px; max-width: 94vw">
      <q-card-section>
        <div class="text-subtitle1">Speech to text</div>
        <div class="text-caption text-grey">
          Dictation model for the mic button. Runs locally — each model downloads
          once on first use, then works offline. Bigger = more accurate, slower.
        </div>
      </q-card-section>
      <q-card-section class="q-gutter-sm">
        <q-select
          v-model="sttModel"
          :options="sttOptions"
          dense
          outlined
          emit-value
          map-options
          options-dense
          label="Whisper model"
        />
        <q-select
          v-model="sttDevice"
          :options="micOptions"
          dense
          outlined
          emit-value
          map-options
          options-dense
          label="Microphone"
          hint="If dictation reports silence, pick the mic you actually use here."
        />
      </q-card-section>
    </q-card>

    <q-card v-if="hasHost" flat bordered style="width: 460px; max-width: 94vw">
      <q-card-section>
        <div class="text-subtitle1">Host commands</div>
        <div class="text-caption text-grey">
          Programs the app may run for <code>/run</code> chat commands (matched by
          name). Each command still needs your per-run confirmation.
        </div>
      </q-card-section>
      <q-card-section>
        <div class="row q-gutter-xs items-center">
          <q-chip
            v-for="p in allowlist"
            :key="p"
            removable
            dense
            :label="p"
            @remove="removeProg(p)"
          />
        </div>
        <div class="row q-gutter-sm q-mt-sm">
          <q-input v-model="newProg" dense outlined placeholder="add program (e.g. git)" class="col" @keydown.enter="addProg" />
          <q-btn no-caps label="Add" @click="addProg" />
        </div>
      </q-card-section>
    </q-card>

    <q-card v-if="hasLaunch" flat bordered style="width: 460px; max-width: 94vw">
      <q-card-section>
        <div class="text-subtitle1">Launchable apps</div>
        <div class="text-caption text-grey">
          Apps the agent may open (e.g. "open chrome with my Work profile"). The
          first launch of each app asks you to confirm; toggle one here to always
          allow it without a prompt.
        </div>
      </q-card-section>
      <q-card-section>
        <q-list dense>
          <q-item v-for="a in knownApps" :key="a.id" class="q-px-none">
            <q-item-section>{{ a.label }}</q-item-section>
            <q-item-section side>
              <q-toggle
                :model-value="remembered.includes(a.id)"
                dense
                label="always allow"
                @update:model-value="(v) => toggleRemembered(a.id, v)"
              />
            </q-item-section>
          </q-item>
        </q-list>
      </q-card-section>
    </q-card>

    <q-card flat bordered style="width: 460px; max-width: 94vw">
      <q-card-section>
        <div class="text-subtitle1">Learned lessons</div>
        <div class="text-caption text-grey">
          Preferences the agent picked up from your feedback and applies to
          matching work. Delete any that no longer fit — each one is added to
          every matching prompt.
        </div>
      </q-card-section>
      <q-card-section>
        <div v-if="!lessons.length" class="text-caption text-grey-6">
          None yet. Thumb-down a step and describe a preference to teach one.
        </div>
        <q-list v-else dense>
          <q-item v-for="l in lessons" :key="l.lessonId" class="q-px-none">
            <q-item-section>
              <q-item-label lines="2">{{ l.text }}</q-item-label>
              <q-item-label caption>
                {{ scopeLabel(l.scope) }}
                <span v-if="l.injectedCount"> · used {{ l.injectedCount }}×</span>
                <span v-if="effectiveness(l)" :class="effectiveness(l).hurting ? 'text-negative' : ''">
                  · {{ effectiveness(l).label }}
                </span>
              </q-item-label>
            </q-item-section>
            <q-item-section side>
              <q-btn flat round dense size="sm" icon="delete_outline" class="text-grey-6" @click="removeLesson(l.lessonId)">
                <q-tooltip>Forget this lesson</q-tooltip>
              </q-btn>
            </q-item-section>
          </q-item>
        </q-list>
      </q-card-section>
    </q-card>

    <q-btn flat no-caps icon="arrow_back" label="Back to chat" @click="$router.push('/chat')" />
  </q-page>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { api, getBackendUrl, setBackendUrl, initBackend } from '@/boot/backend'
import { useAuthStore } from '@/stores/auth'
import { listMicrophones } from '@/composables/useSpeech'

const router = useRouter()
const auth = useAuthStore()

// Dictation model — read by useSpeech on the next mic press (no restart needed).
const STT_KEY = 'ba_stt_model'
const sttOptions = [
  { label: 'Whisper Tiny — fastest, lower accuracy (~30 MB)', value: 'onnx-community/whisper-tiny' },
  { label: 'Whisper Base — balanced (default, ~80 MB)', value: 'onnx-community/whisper-base' },
  { label: 'Whisper Small — best accuracy, slower (~250 MB)', value: 'onnx-community/whisper-small' }
]
// .replace migrates values saved before the switch to onnx-community exports.
const sttModel = ref(
  (localStorage.getItem(STT_KEY) || 'onnx-community/whisper-base').replace(/^Xenova\//, 'onnx-community/')
)
watch(sttModel, (v) => localStorage.setItem(STT_KEY, v))

// Input device for dictation ('' = system default).
const STT_DEVICE_KEY = 'ba_stt_device'
const micOptions = ref([{ label: 'System default', value: '' }])
const sttDevice = ref(localStorage.getItem(STT_DEVICE_KEY) || '')
watch(sttDevice, (v) => {
  if (v) localStorage.setItem(STT_DEVICE_KEY, v)
  else localStorage.removeItem(STT_DEVICE_KEY)
})
async function loadMics() {
  const mics = await listMicrophones()
  micOptions.value = [{ label: 'System default', value: '' }, ...mics]
  // stored device unplugged → fall back to default
  if (sttDevice.value && !mics.some((m) => m.value === sttDevice.value)) sttDevice.value = ''
}

const url = ref('')
const saving = ref(false)
const ok = ref(false)
const status = ref('')

const hasHost = !!window.api?.host
const allowlist = ref([])
const newProg = ref('')

async function loadAllowlist() {
  if (!hasHost) return
  allowlist.value = (await window.api.host.getAllowlist()) || []
}
async function addProg() {
  const p = (newProg.value || '').trim().toLowerCase()
  if (!p) return
  allowlist.value = await window.api.host.setAllowlist([...allowlist.value, p])
  newProg.value = ''
}
async function removeProg(p) {
  allowlist.value = await window.api.host.setAllowlist(allowlist.value.filter((x) => x !== p))
}

const hasLaunch = !!window.api?.launch
const knownApps = ref([])
const remembered = ref([])
async function loadLaunch() {
  if (!hasLaunch) return
  knownApps.value = (await window.api.launch.knownApps()) || []
  remembered.value = (await window.api.launch.getRemembered()) || []
}
async function toggleRemembered(appId, on) {
  const next = on ? [...new Set([...remembered.value, appId])] : remembered.value.filter((x) => x !== appId)
  remembered.value = await window.api.launch.setRemembered(next)
}

// Learned lessons (phase 3). Only the active ones are shown — superseded
// versions are history, not in force.
const lessons = ref([])
async function loadLessons() {
  try {
    const { data } = await api.get('/lessons', { params: { active: 1 } })
    lessons.value = data.lessons || []
  } catch {
    lessons.value = []
  }
}
function scopeLabel(scope) {
  if (!scope || scope.type === 'global') return 'Everywhere'
  if (scope.type === 'host') return scope.value || 'This site'
  if (scope.type === 'task-type') return `${scope.value} tasks`
  if (scope.type === 'tool') return `${scope.value} step`
  return scope.type
}
// Outcome of the rounds this lesson shaped (phase 4). Only meaningful once a few
// rounds have run; flag a lesson that mostly precedes failures so the user can
// consider dropping it.
function effectiveness(l) {
  const ok = l.successCount || 0
  const bad = l.failCount || 0
  const n = ok + bad
  if (n < 2) return null
  const rate = Math.round((ok / n) * 100)
  return { label: `${rate}% ok (${n})`, hurting: rate < 50 }
}
async function removeLesson(id) {
  try {
    await api.delete(`/lessons/${id}`)
    lessons.value = lessons.value.filter((l) => l.lessonId !== id)
  } catch {
    /* ignore */
  }
}

async function check() {
  try {
    const { data } = await api.get('/health')
    ok.value = !!data?.ok
    status.value = ok.value ? `Connected (DB ${data.db ? 'up' : 'down'})` : 'Reachable but not OK'
  } catch {
    ok.value = false
    status.value = 'Not reachable'
  }
}

async function save() {
  saving.value = true
  setBackendUrl(url.value)
  await check()
  await auth.checkAuth()
  saving.value = false
  if (auth.needsLogin) router.push('/login')
}

async function resetDefault() {
  setBackendUrl('')
  url.value = await initBackend()
  await check()
  await auth.checkAuth()
}

async function signOut() {
  await auth.logout()
  if (auth.needsLogin) router.push('/login')
}

onMounted(async () => {
  url.value = getBackendUrl()
  await check()
  await loadAllowlist()
  await loadLaunch()
  await loadLessons()
  await loadMics()
})
</script>
