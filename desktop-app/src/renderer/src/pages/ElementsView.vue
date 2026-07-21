<template>
  <q-page class="q-pa-md">
    <div class="row items-center q-mb-sm q-gutter-sm">
      <div class="text-h6 col">Elements</div>
      <q-select
        v-model="host"
        :options="hostOptions"
        label="Host"
        dense
        outlined
        emit-value
        map-options
        style="min-width: 200px"
      />
      <q-input v-model="filter" dense outlined placeholder="Filter…" style="max-width: 220px" clearable />
      <q-btn dense flat round icon="refresh" @click="lib.loadElements()" />
      <q-btn unelevated no-caps color="primary" icon="add" label="New element" @click="create" />
    </div>

    <div class="text-caption text-grey q-mb-md">
      Introduced elements power skills. Selectors are captured in the browser via
      Teach, but you can also add an element by hand here, edit its selectors, or
      delete it.
    </div>

    <q-list bordered separator>
      <q-item v-for="e in filtered" :key="e.elementId">
        <q-item-section>
          <q-item-label>{{ e.name }}</q-item-label>
          <q-item-label caption>
            <q-badge :color="typeColor(e.type)" :label="e.type + (e.attr ? ':' + e.attr : '') + (e.action ? ':' + e.action : '')" class="q-mr-xs" />
            <span class="text-grey">{{ e.host }}{{ e.route }}</span>
            <span class="q-ml-xs text-grey-6">· {{ (e.selectors || []).length }} selector(s)</span>
            <span v-if="e.details" class="q-ml-xs">· {{ e.details }}</span>
          </q-item-label>
        </q-item-section>
        <q-item-section side>
          <div class="row q-gutter-xs">
            <q-btn dense flat round icon="edit" @click="edit(e)"><q-tooltip>Edit</q-tooltip></q-btn>
            <q-btn dense flat round color="negative" icon="delete" @click="remove(e)"><q-tooltip>Delete</q-tooltip></q-btn>
          </div>
        </q-item-section>
      </q-item>
      <q-item v-if="!filtered.length">
        <q-item-section class="text-grey text-caption">No elements{{ filter ? ' match' : ' yet' }}.</q-item-section>
      </q-item>
    </q-list>

    <!-- create / edit dialog -->
    <q-dialog v-model="editOpen">
      <q-card style="width: 560px; max-width: 94vw; border-radius: 12px">
        <q-card-section class="row items-center q-pb-none">
          <div class="text-subtitle1 text-weight-medium">{{ creating ? 'New element' : 'Edit element' }}</div>
          <q-space />
          <q-btn v-close-popup flat round dense size="sm" icon="close" />
        </q-card-section>
        <q-card-section class="q-gutter-sm">
          <div class="row q-gutter-sm">
            <q-input v-model="form.name" label="Name" dense outlined class="col" />
            <q-input v-if="creating" v-model="form.host" label="Host" dense outlined style="width: 180px" hint="e.g. google.com" />
          </div>
          <div class="row q-gutter-sm">
            <q-select
              v-model="form.type"
              :options="typeOptions"
              label="Type"
              dense
              outlined
              emit-value
              map-options
              class="col"
            />
            <q-input v-model="form.action" label="Action" dense outlined style="width: 160px" hint="click · type · press · read · hover" />
          </div>
          <q-input v-model="form.route" label="Route pattern" dense outlined hint="/search · [slug] = one segment · /* = any path" />
          <q-input v-model="form.details" label="Details (the planner reads this)" dense outlined type="textarea" autogrow />
          <q-input
            v-model="form.selectorsText"
            label="CSS selectors (one per line, best first)"
            dense
            outlined
            type="textarea"
            autogrow
            hint="Each line is tried in order. Prefer stable selectors (ids, aria-label, role) over long div:nth-of-type chains."
          />
        </q-card-section>
        <q-card-section v-if="error" class="q-py-none text-negative text-caption">{{ error }}</q-card-section>
        <q-card-actions align="right">
          <q-btn flat no-caps label="Cancel" v-close-popup />
          <q-btn color="primary" unelevated no-caps label="Save" :loading="saving" @click="save" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import { useLibraryStore } from '@/stores/library'

const lib = useLibraryStore()
const $q = useQuasar()

const host = ref('')
const filter = ref('')
const editOpen = ref(false)
const creating = ref(false)
const saving = ref(false)
const error = ref('')
const form = ref(blank())

const typeOptions = [
  { label: 'field (read a value)', value: 'field' },
  { label: 'action (click/press)', value: 'action' },
  { label: 'input (type into)', value: 'input' },
  { label: 'item (repeating row)', value: 'item' },
  { label: 'container (wrapper)', value: 'container' }
]

function blank() {
  return { elementId: '', name: '', host: '', type: 'field', action: '', route: '/*', details: '', selectorsText: '' }
}

const typeColor = (t) =>
  ({ action: 'indigo', input: 'deep-purple', field: 'teal', item: 'orange', container: 'blue-grey' }[t] || 'grey')

const hostOptions = computed(() => {
  const hosts = [...new Set(lib.elements.map((e) => e.host))].sort()
  return [{ label: 'All hosts', value: '' }, ...hosts.map((h) => ({ label: h, value: h }))]
})

const filtered = computed(() => {
  const q = (filter.value || '').trim().toLowerCase()
  return lib.elements.filter((e) => {
    if (host.value && e.host !== host.value) return false
    if (q && !`${e.name} ${e.type} ${e.details || ''} ${e.route}`.toLowerCase().includes(q)) return false
    return true
  })
})

// Show existing CSS selector values one per line; non-css strategies are kept
// hidden and preserved on save so hand-editing focuses on the common case.
const nonCssKeep = ref([])
function selectorsToText(sels) {
  nonCssKeep.value = (sels || []).filter((s) => s.strategy !== 'css')
  return (sels || [])
    .filter((s) => s.strategy === 'css' && s.value)
    .map((s) => s.value)
    .join('\n')
}
function textToSelectors(text) {
  const css = String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((value, i) => ({ strategy: 'css', value, score: 95 - i }))
  return [...css, ...nonCssKeep.value]
}

function create() {
  creating.value = true
  error.value = ''
  form.value = blank()
  if (host.value) form.value.host = host.value
  nonCssKeep.value = []
  editOpen.value = true
}
function edit(e) {
  creating.value = false
  error.value = ''
  form.value = {
    elementId: e.elementId,
    name: e.name,
    host: e.host,
    type: e.type || 'field',
    action: e.action || '',
    route: e.route || '/*',
    details: e.details || '',
    selectorsText: selectorsToText(e.selectors)
  }
  editOpen.value = true
}

async function save() {
  error.value = ''
  saving.value = true
  try {
    const selectors = textToSelectors(form.value.selectorsText)
    if (creating.value) {
      const res = await lib.createElement({
        host: form.value.host.trim(),
        name: form.value.name.trim(),
        type: form.value.type,
        action: form.value.action.trim() || null,
        route: form.value.route.trim() || '/*',
        details: form.value.details.trim(),
        selectors
      })
      if (res.ok) editOpen.value = false
      else error.value = res.error || 'Create failed.'
    } else {
      const ok = await lib.updateElement(form.value.elementId, {
        name: form.value.name.trim(),
        type: form.value.type,
        action: form.value.action.trim() || null,
        route: form.value.route.trim() || '/*',
        details: form.value.details.trim(),
        selectors
      })
      if (ok) editOpen.value = false
      else error.value = 'Update failed.'
    }
  } catch (e) {
    error.value = e?.message || 'Save failed unexpectedly.'
    console.error('ElementsView save failed:', e)
  } finally {
    saving.value = false
  }
}

function remove(e) {
  $q.dialog({ title: 'Delete element', message: `Delete "${e.name}"?`, cancel: true }).onOk(async () => {
    const r = await lib.deleteElement(e.elementId)
    if (r.ok) return
    if (r.inUse) {
      const names = (r.skills || []).map((s) => s.name).join(', ')
      $q.dialog({
        title: 'Element in use',
        message: `Used by skill(s): ${names}. Delete anyway and remove it from them?`,
        cancel: true,
        ok: { label: 'Delete anyway', color: 'negative' }
      }).onOk(() => lib.deleteElement(e.elementId, { force: true }))
    } else {
      $q.notify({ type: 'negative', message: 'Delete failed.' })
    }
  })
}

onMounted(() => lib.loadElements())
</script>
