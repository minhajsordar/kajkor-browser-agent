<template>
  <q-page class="q-pa-md">
    <div class="row items-center q-mb-sm q-gutter-sm">
      <div class="text-h6 col">Skills</div>
      <q-input v-model="filter" dense outlined placeholder="Filter…" style="max-width: 240px" clearable />
      <q-btn dense flat round icon="refresh" @click="lib.loadSkills()" />
      <q-btn unelevated no-caps color="primary" icon="add" label="New skill" @click="create" />
    </div>

    <div class="text-caption text-grey q-mb-md">
      Skills can be taught in the browser Teach overlay, or edited here — reorder
      steps, add/remove element refs, and fix the URL pattern.
    </div>

    <q-list bordered separator>
      <q-item v-for="s in filtered" :key="s.skillId">
        <q-item-section>
          <q-item-label>{{ s.name }}</q-item-label>
          <q-item-label caption>
            <q-badge :color="s.kind === 'collection' ? 'teal' : 'indigo'" :label="kindLabel(s)" class="q-mr-xs" />
            <span>{{ s.host }}</span>
            <span v-if="s.urlPattern" class="q-ml-xs text-grey">· {{ s.urlPattern }}</span>
          </q-item-label>
        </q-item-section>
        <q-item-section side>
          <div class="row q-gutter-xs">
            <q-btn dense flat round icon="tune" @click="editSkill(s)"><q-tooltip>Edit steps &amp; pattern</q-tooltip></q-btn>
            <q-btn dense flat round icon="edit" @click="rename(s)"><q-tooltip>Rename</q-tooltip></q-btn>
            <q-btn dense flat round color="negative" icon="delete" @click="remove(s)"><q-tooltip>Delete</q-tooltip></q-btn>
          </div>
        </q-item-section>
      </q-item>
      <q-item v-if="!filtered.length">
        <q-item-section class="text-grey text-caption">No skills{{ filter ? ' match' : ' yet' }}.</q-item-section>
      </q-item>
    </q-list>

    <SkillEditor v-model="editorOpen" :skill="editing" @saved="lib.loadSkills()" />
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import { useLibraryStore } from '@/stores/library'
import SkillEditor from '@/components/SkillEditor.vue'

const lib = useLibraryStore()
const $q = useQuasar()
const filter = ref('')
const editorOpen = ref(false)
const editing = ref(null)

function editSkill(s) {
  editing.value = s
  editorOpen.value = true
}
function create() {
  editing.value = null
  editorOpen.value = true
}

const filtered = computed(() => {
  const q = (filter.value || '').trim().toLowerCase()
  if (!q) return lib.skills
  return lib.skills.filter(
    (s) => s.name.toLowerCase().includes(q) || (s.host || '').toLowerCase().includes(q)
  )
})

function kindLabel(s) {
  if (s.kind === 'collection') return `collection · ${(s.fields || []).length} fields`
  if (Array.isArray(s.steps) && s.steps.length > 1) return `${s.steps.length}-step workflow`
  return s.action ? `action · ${s.action}` : 'action'
}

function rename(s) {
  $q.dialog({
    title: 'Rename skill',
    prompt: { model: s.name, type: 'text' },
    cancel: true
  }).onOk(async (name) => {
    const n = (name || '').trim()
    if (n && n !== s.name) await lib.renameSkill(s.skillId, n)
  })
}

function remove(s) {
  $q.dialog({
    title: 'Delete skill',
    message: `Delete "${s.name}"? Tasks referencing it will no longer find it.`,
    cancel: true
  }).onOk(() => lib.deleteSkill(s.skillId))
}

onMounted(() => lib.loadSkills())
</script>
