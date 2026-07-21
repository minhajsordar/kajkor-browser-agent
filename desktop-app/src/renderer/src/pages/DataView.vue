<template>
  <q-page class="row no-wrap" style="height: calc(100vh - 50px)">
    <div class="sidebar column">
      <div class="q-pa-sm row items-center">
        <div class="text-subtitle2 col">Data</div>
        <q-btn dense flat round icon="refresh" @click="refresh" />
      </div>
      <q-separator />
      <q-scroll-area class="col">
        <q-list separator>
          <q-item
            v-for="s in lib.schemas"
            :key="s.schemaId"
            clickable
            :active="s.schemaId === selectedId"
            active-class="bg-blue-1 text-primary"
            @click="select(s)"
          >
            <q-item-section>
              <q-item-label lines="1">{{ s.name }}</q-item-label>
              <q-item-label caption>{{ (s.fields || []).length }} fields</q-item-label>
            </q-item-section>
          </q-item>
          <q-item v-if="!lib.schemas.length">
            <q-item-section class="text-grey text-caption">No schemas yet.</q-item-section>
          </q-item>
        </q-list>
      </q-scroll-area>
    </div>

    <q-separator vertical />

    <div class="col column">
      <div v-if="!selected" class="col flex flex-center text-grey">
        Select a schema to view its records.
      </div>
      <template v-else>
        <div class="row items-center q-pa-sm q-gutter-sm">
          <div class="text-subtitle1 col">{{ selected.name }}</div>
          <q-input v-model="filter" dense outlined placeholder="Filter…" style="max-width: 220px" clearable />
          <q-btn dense flat color="negative" icon="delete" no-caps label="Delete schema" @click="confirmDelete" />
        </div>
        <q-separator />
        <div class="col scroll">
          <q-table
            flat
            dense
            :rows="filteredRows"
            :columns="columns"
            row-key="__i"
            :pagination="{ rowsPerPage: 50 }"
            :loading="loading"
          >
            <template #body-cell="props">
              <q-td :props="props">
                <a v-if="isUrl(props.value)" :href="props.value" target="_blank">{{ short(props.value) }}</a>
                <span v-else>{{ props.value }}</span>
              </q-td>
            </template>
          </q-table>
        </div>
      </template>
    </div>
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import { useLibraryStore } from '@/stores/library'

const lib = useLibraryStore()
const $q = useQuasar()

const selected = ref(null)
const selectedId = computed(() => selected.value?.schemaId || null)
const fields = ref([])
const rows = ref([])
const filter = ref('')
const loading = ref(false)

const columns = computed(() =>
  (fields.value || []).map((f) => ({
    name: f.key,
    label: f.label || f.key,
    field: (r) => r[f.key],
    align: 'left',
    sortable: true
  }))
)

const filteredRows = computed(() => {
  const q = (filter.value || '').trim().toLowerCase()
  if (!q) return rows.value
  return rows.value.filter((r) =>
    fields.value.some((f) => String(r[f.key] ?? '').toLowerCase().includes(q))
  )
})

async function select(s) {
  selected.value = s
  loading.value = true
  const { records, fields: f } = await lib.loadRecords(s.schemaId)
  fields.value = f.length ? f : s.fields || []
  rows.value = records.map((r, i) => ({ ...r, __i: i }))
  loading.value = false
}

async function refresh() {
  await lib.loadSchemas()
  if (selected.value) {
    const still = lib.schemas.find((x) => x.schemaId === selected.value.schemaId)
    if (still) await select(still)
    else selected.value = null
  }
}

function confirmDelete() {
  $q.dialog({
    title: 'Delete schema',
    message: `Delete "${selected.value.name}"? Its record collection stays in Mongo; only the schema is removed.`,
    cancel: true
  }).onOk(async () => {
    await lib.deleteSchema(selected.value.schemaId)
    selected.value = null
  })
}

const isUrl = (v) => typeof v === 'string' && /^https?:\/\//i.test(v)
const short = (v) => (v.length > 48 ? v.slice(0, 48) + '…' : v)

onMounted(() => lib.loadSchemas())
</script>

<style scoped>
.sidebar {
  width: 260px;
  min-width: 260px;
}
</style>
