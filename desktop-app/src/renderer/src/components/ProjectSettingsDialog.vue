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
const form = ref({ model: null, skillIds: [], schemaIds: [], promptId: null, systemPrompt: '' })

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
    const s = props.project?.settings || {}
    form.value = {
      model: s.model || null,
      skillIds: Array.isArray(s.skillIds) ? [...s.skillIds] : [],
      schemaIds: Array.isArray(s.schemaIds) ? [...s.schemaIds] : [],
      promptId: s.promptId || null,
      systemPrompt: s.systemPrompt || ''
    }
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
    systemPrompt: form.value.systemPrompt || ''
  })
  saving.value = false
  emit('update:modelValue', false)
}
</script>
