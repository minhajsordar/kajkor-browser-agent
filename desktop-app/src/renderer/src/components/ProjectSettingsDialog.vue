<template>
  <q-dialog :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)">
    <q-card style="width: 560px; max-width: 94vw; border-radius: 12px">
      <q-card-section class="row items-center q-pb-none">
        <div class="text-subtitle1 text-weight-medium">Project settings — {{ project?.name }}</div>
        <q-space />
        <q-btn v-close-popup flat round dense size="sm" icon="close" />
      </q-card-section>

      <q-card-section class="q-gutter-sm">
        <div class="text-caption text-grey-7">
          New sessions in this project start with these. You can still change any of them per session.
        </div>

        <q-select
          v-model="form.model"
          :options="modelOptions"
          label="Default model"
          dense
          outlined
          clearable
          emit-value
          map-options
          options-dense
          hint="Blank = use the app's current model."
        />

        <q-select
          v-model="form.skillIds"
          :options="skillOptions"
          label="Default skills"
          dense
          outlined
          multiple
          use-chips
          emit-value
          map-options
          options-dense
          hint="Skills attached to every session in this project."
        />

        <q-select
          v-model="form.schemaIds"
          :options="schemaOptions"
          label="Default data schemas"
          dense
          outlined
          multiple
          use-chips
          emit-value
          map-options
          options-dense
          hint="Schemas collected data is saved into for this project."
        />

        <!-- A SAVED (named) system prompt from the prompts library. Distinct from
             the inline text below: a saved prompt is reusable across projects and
             can carry its own attached skills. When set, it takes precedence over
             the inline prompt at task creation (backend), so we say so. -->
        <q-select
          v-model="form.promptId"
          :options="promptOptions"
          label="Saved system prompt"
          dense
          outlined
          clearable
          emit-value
          map-options
          options-dense
          :hint="form.promptId ? 'A saved prompt is used instead of the inline text below.' : 'Pick a reusable prompt from your library, or write inline text below.'"
        />

        <!-- The project's "dynamic" system prompt — free text the planner honours
             for every task here. Min-height so it reads as a text area. Ignored
             when a saved prompt is selected above. -->
        <q-input
          v-model="form.systemPrompt"
          label="Project system prompt (dynamic instructions)"
          :hint="form.promptId ? 'Not used while a saved prompt is selected above.' : 'Standing instructions for the AI in this project — e.g. tone, rules, what to always do.'"
          :disable="!!form.promptId"
          dense
          outlined
          type="textarea"
          autogrow
          input-style="min-height: 110px"
        />

        <!-- Project-scoped launchable apps (Phase 4). For now Chrome; the profile
             is chosen from the machine's Chrome profiles. "open chrome" in this
             project then uses the profile automatically, and only these apps may
             launch here. Empty = no restriction. Hidden outside the desktop app. -->
        <div v-if="hasLaunch" class="q-pt-xs">
          <div class="text-caption text-grey-7 q-mb-xs">
            Launchable apps — which apps this project may open, and the profile to use.
            Say "open chrome" and it uses the profile below. Leave empty to allow any app.
          </div>
          <q-list v-if="form.launchApps.length" dense bordered class="rounded-borders q-mb-sm">
            <q-item v-for="(a, i) in form.launchApps" :key="i">
              <q-item-section avatar style="min-width: 34px"><q-icon name="rocket_launch" size="18px" class="text-grey-7" /></q-item-section>
              <q-item-section>
                <q-item-label>{{ appLabel(a.appId) }}</q-item-label>
                <q-item-label caption>{{ a.profile ? a.profile + ' profile' : 'default profile' }}</q-item-label>
              </q-item-section>
              <q-item-section side>
                <q-btn flat round dense size="sm" icon="close" class="text-grey-6" @click="removeApp(i)" />
              </q-item-section>
            </q-item>
          </q-list>
          <div class="row items-center q-gutter-sm">
            <q-select
              v-model="newApp.appId"
              :options="appOptions"
              dense outlined emit-value map-options options-dense
              label="App"
              style="min-width: 130px"
            />
            <q-select
              v-model="newApp.profile"
              :options="profileOptions"
              dense outlined emit-value map-options options-dense clearable
              label="Chrome profile"
              class="col"
              :hint="profileOptions.length ? '' : 'No Chrome profiles found on this machine'"
            />
            <q-btn dense no-caps icon="add" label="Add" :disable="!newApp.appId" @click="addApp" />
          </div>
        </div>
      </q-card-section>

      <q-card-actions align="right">
        <q-btn v-close-popup flat no-caps label="Cancel" />
        <q-btn unelevated no-caps color="primary" label="Save" :loading="saving" :disable="!project?.projectId" @click="save" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { api } from '@/boot/backend'
import { useProjectsStore } from '@/stores/projects'
import { useSessionsStore } from '@/stores/sessions'
import { useLibraryStore } from '@/stores/library'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  project: { type: Object, default: null }
})
const emit = defineEmits(['update:modelValue'])

const projects = useProjectsStore()
const sessions = useSessionsStore()
const lib = useLibraryStore()
const saving = ref(false)
const form = ref({ model: null, skillIds: [], schemaIds: [], promptId: null, systemPrompt: '', launchApps: [] })

// Project-scoped launchable apps (Phase 4). Only meaningful in the desktop app
// (the launch bridge). Chrome only for now; profiles come from the machine.
const hasLaunch = !!window.api?.launch
const chromeProfiles = ref([])
const appOptions = [{ label: 'Google Chrome', value: 'chrome' }]
const newApp = ref({ appId: 'chrome', profile: '' })
const profileOptions = computed(() => (chromeProfiles.value || []).map((p) => ({ label: p.name, value: p.name })))
function appLabel(id) {
  return (appOptions.find((o) => o.value === id) || {}).label || id
}
function addApp() {
  if (!newApp.value.appId) return
  // One entry per app — re-adding an app replaces its profile rather than duping.
  const rest = form.value.launchApps.filter((a) => a.appId !== newApp.value.appId)
  form.value.launchApps = [...rest, { appId: newApp.value.appId, profile: newApp.value.profile || '' }]
  newApp.value = { appId: 'chrome', profile: '' }
}
function removeApp(i) {
  form.value.launchApps = form.value.launchApps.filter((_, idx) => idx !== i)
}

// Saved prompts (the prompts library) aren't in the library store, so this
// dialog loads them itself — the only place that picks one for a project.
const prompts = ref([])
async function loadPrompts() {
  try {
    const { data } = await api.get('/prompts')
    prompts.value = data.prompts || []
  } catch {
    prompts.value = []
  }
}

const modelOptions = computed(() => (sessions.models || []).map((m) => ({ label: m.name, value: m.name })))
const skillOptions = computed(() => (lib.skills || []).map((s) => ({ label: s.name, value: s.skillId })))
const schemaOptions = computed(() => (lib.schemas || []).map((s) => ({ label: s.name, value: s.schemaId })))
const promptOptions = computed(() => (prompts.value || []).map((p) => ({ label: p.name, value: p.promptId })))

watch(
  () => props.modelValue,
  async (open) => {
    if (!open) return
    if (!sessions.models?.length) await sessions.loadModels()
    if (!lib.skills?.length) await lib.loadSkills()
    if (!lib.schemas?.length) await lib.loadSchemas()
    await loadPrompts()
    if (hasLaunch) chromeProfiles.value = await window.api.launch.profiles().catch(() => [])
    const s = props.project?.settings || {}
    form.value = {
      model: s.model || null,
      skillIds: Array.isArray(s.skillIds) ? [...s.skillIds] : [],
      schemaIds: Array.isArray(s.schemaIds) ? [...s.schemaIds] : [],
      promptId: s.promptId || null,
      systemPrompt: s.systemPrompt || '',
      launchApps: Array.isArray(s.launchApps) ? s.launchApps.map((a) => ({ appId: a.appId, profile: a.profile || '' })) : []
    }
    newApp.value = { appId: 'chrome', profile: '' }
  }
)

async function save() {
  if (!props.project?.projectId) return
  saving.value = true
  await projects.updateSettings(props.project.projectId, {
    model: form.value.model || '',
    skillIds: form.value.skillIds || [],
    schemaIds: form.value.schemaIds || [],
    // Always a string: '' clears the ref server-side (cleanProjectSettings → null).
    promptId: form.value.promptId || '',
    systemPrompt: form.value.systemPrompt || '',
    launchApps: form.value.launchApps || []
  })
  saving.value = false
  emit('update:modelValue', false)
}
</script>
