<template>
  <q-dialog :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)">
    <q-card style="width: 640px; max-width: 94vw; border-radius: 12px">
      <q-card-section class="row items-center q-pb-none">
        <div class="text-subtitle1 text-weight-medium">{{ isNew ? 'New skill' : 'Edit skill' }}</div>
        <q-space />
        <q-btn v-close-popup flat round dense size="sm" icon="close" />
      </q-card-section>

      <q-card-section class="q-gutter-sm">
        <div class="row q-gutter-sm">
          <q-input v-model="form.name" label="Name" dense outlined class="col" />
          <q-input
            v-model="form.host"
            label="Host"
            dense
            outlined
            style="width: 180px"
            :readonly="!isNew"
            hint="e.g. google.com"
          />
        </div>
        <q-input
          v-model="form.urlPattern"
          label="URL pattern"
          dense
          outlined
          :hint="patternHint"
        />
        <!-- The planner reads this verbatim, so it is where a full instruction
             for the AI goes. autogrow keeps growing, but a min-height makes it
             read as a text area (not a one-line input) so a long instruction is
             the obvious thing to type. -->
        <q-input
          v-model="form.details"
          label="Details / instructions (the planner reads this)"
          hint="Full instructions for the AI — e.g. how to run this flow, step by step. Grows as you type."
          dense
          outlined
          type="textarea"
          autogrow
          input-style="min-height: 96px"
        />

        <div class="text-caption text-grey-7 q-mt-sm">Steps (run in order)</div>
        <div v-if="!steps.length" class="text-caption text-grey q-pb-xs">
          No steps yet — add elements below in the order they should run.
        </div>
        <q-list bordered separator class="rounded-borders">
          <q-item v-for="(st, i) in steps" :key="st.elementId" dense>
            <q-item-section avatar>
              <q-badge :label="i + 1" color="grey-4" text-color="grey-9" />
            </q-item-section>
            <q-item-section>
              <q-item-label>{{ elName(st.elementId) }}</q-item-label>
              <q-item-label caption>
                <q-badge :color="typeColor(elOf(st.elementId)?.type)" :label="elBadge(st.elementId)" class="q-mr-xs" />
                <span class="text-grey">{{ elOf(st.elementId)?.route }}</span>
                <span v-if="!elOf(st.elementId)" class="text-negative">missing element</span>
              </q-item-label>
            </q-item-section>
            <q-item-section side>
              <div class="row items-center no-wrap">
                <q-btn dense flat round size="sm" icon="keyboard_arrow_up" :disable="i === 0" @click="move(i, -1)" />
                <q-btn dense flat round size="sm" icon="keyboard_arrow_down" :disable="i === steps.length - 1" @click="move(i, 1)" />
                <q-btn dense flat round size="sm" color="negative" icon="close" @click="steps.splice(i, 1)" />
              </div>
            </q-item-section>
          </q-item>
        </q-list>

        <q-select
          :model-value="null"
          :options="addableElements"
          label="Add a step (host element)"
          dense
          outlined
          emit-value
          map-options
          options-dense
          @update:model-value="addStep"
        >
          <template #no-option>
            <q-item><q-item-section class="text-grey text-caption">No more elements for this host. Teach them in the browser first.</q-item-section></q-item>
          </template>
        </q-select>
      </q-card-section>

      <q-card-section v-if="error" class="q-py-none text-negative text-caption">{{ error }}</q-card-section>

      <q-card-actions align="right">
        <q-btn v-close-popup flat no-caps label="Cancel" />
        <q-btn unelevated no-caps color="primary" label="Save" :loading="saving" :disable="!canSave" @click="save" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useLibraryStore } from '@/stores/library'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  skill: { type: Object, default: null } // resolved skill row, or null for new
})
const emit = defineEmits(['update:modelValue', 'saved'])

const lib = useLibraryStore()
const saving = ref(false)
const error = ref('')
const form = ref({ name: '', host: '', urlPattern: '', details: '' })
const steps = ref([]) // [{ elementId }] in run order

const isNew = computed(() => !props.skill)
const patternHint = computed(
  () => 'bare host = any path · /path = that page · [slug] = one segment · * = anything'
)

// Elements available for the skill's host (loaded globally; filter locally).
const hostElements = computed(() =>
  lib.elements.filter((e) => !form.value.host || e.host === form.value.host)
)
const elById = computed(() => new Map(lib.elements.map((e) => [e.elementId, e])))
const elOf = (id) => elById.value.get(id)
const elName = (id) => elOf(id)?.name || id.slice(0, 8) + '…'
const elBadge = (id) => {
  const e = elOf(id)
  if (!e) return 'missing'
  return e.type + (e.action ? ':' + e.action : '')
}
const typeColor = (t) =>
  ({ action: 'indigo', input: 'deep-purple', field: 'teal', item: 'orange', container: 'blue-grey' }[t] || 'grey')

const addableElements = computed(() => {
  const used = new Set(steps.value.map((s) => s.elementId))
  return hostElements.value
    .filter((e) => !used.has(e.elementId))
    .map((e) => ({ label: `${e.name} · ${e.type}${e.action ? ':' + e.action : ''} · ${e.route}`, value: e.elementId }))
})

const canSave = computed(() => form.value.name.trim() && form.value.host.trim() && steps.value.length)

function addStep(elementId) {
  if (elementId && !steps.value.some((s) => s.elementId === elementId)) {
    steps.value.push({ elementId })
  }
}
function move(i, d) {
  const j = i + d
  if (j < 0 || j >= steps.value.length) return
  const arr = steps.value
  ;[arr[i], arr[j]] = [arr[j], arr[i]]
}

// Load the skill into the form each time the dialog opens.
watch(
  () => props.modelValue,
  async (open) => {
    if (!open) return
    error.value = ''
    await lib.loadElements()
    if (props.skill) {
      const s = props.skill
      form.value = {
        name: s.name || '',
        host: s.host || '',
        urlPattern: s.urlPattern || '',
        details: s.details || ''
      }
      // Prefer the raw refs; the resolved row keeps them, but re-fetch to be safe.
      const raw = (await lib.getSkill(s.skillId)) || s
      const refs = Array.isArray(raw.elements) ? raw.elements : []
      steps.value = refs
        .slice()
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map((r) => ({ elementId: typeof r === 'string' ? r : r.elementId }))
        .filter((r) => r.elementId)
    } else {
      form.value = { name: '', host: '', urlPattern: '', details: '' }
      steps.value = []
    }
  }
)

async function save() {
  error.value = ''
  saving.value = true
  try {
    const elements = steps.value.map((s, i) => ({ elementId: s.elementId, order: i }))
    const patch = {
      name: form.value.name.trim(),
      urlPattern: form.value.urlPattern.trim() || `${form.value.host.trim()}/*`,
      details: form.value.details.trim(),
      elements
    }
    const res = isNew.value
      ? await lib.createSkill({ host: form.value.host.trim(), ...patch })
      : await lib.updateSkill(props.skill.skillId, patch)
    if (res?.ok) {
      emit('saved')
      emit('update:modelValue', false)
    } else {
      error.value = res?.error || 'Save failed.'
    }
  } catch (e) {
    // Never leave the button spinning — surface whatever went wrong.
    error.value = e?.message || 'Save failed unexpectedly.'
    console.error('SkillEditor save failed:', e)
  } finally {
    saving.value = false
  }
}
</script>
