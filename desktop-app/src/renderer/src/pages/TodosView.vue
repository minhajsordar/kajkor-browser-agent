<template>
  <q-page class="q-pa-lg column items-center todos-page">
    <div class="td-wrap column">
      <div class="row items-center q-mb-sm">
        <div class="text-h6 text-weight-medium">Todos</div>
        <q-space />
        <q-btn flat round dense icon="refresh" class="text-grey-7" :loading="store.loading" @click="reload">
          <q-tooltip>Reload</q-tooltip>
        </q-btn>
        <q-btn no-caps dense color="primary" icon="add" label="New routine" class="q-ml-sm" @click="openEditor(null)" />
      </div>

      <div class="text-caption text-grey-7 q-mb-md">
        A routine is work you repeat. It builds a checklist you can work through —
        run one item, run the whole list, or re-run it later. Nothing here fires on
        its own yet: every run is a button you press.
      </div>

      <div v-if="store.notice" class="text-caption text-negative q-mb-sm">{{ store.notice }}</div>

      <div class="row q-col-gutter-md items-start">
        <!-- ---------------------------------------------------- routines -->
        <div class="col-12 col-md-4 min-w-0">
          <div class="text-caption text-grey-6 q-mb-xs">Routines</div>
          <div v-if="!store.routines.length" class="text-caption text-grey-6 q-pa-md text-center bordered-box">
            No routines yet. Create one to describe work you repeat.
          </div>
          <q-card v-for="r in store.routines" :key="r.routineId" flat bordered class="q-mb-sm td-card">
            <q-card-section class="q-pb-xs">
              <div class="row items-center no-wrap">
                <div class="col min-w-0">
                  <div class="text-body2 text-weight-medium ellipsis">{{ r.name }}</div>
                  <div class="text-caption text-grey-6 ellipsis">{{ triggerLabel(r) }}</div>
                </div>
                <q-btn flat round dense size="sm" icon="tune" class="text-grey-7" @click="openEditor(r)">
                  <q-tooltip>Edit</q-tooltip>
                </q-btn>
                <q-btn flat round dense size="sm" icon="delete_outline" class="text-grey-6" @click="removeRoutine(r)">
                  <q-tooltip>Delete</q-tooltip>
                </q-btn>
              </div>
              <div class="text-caption text-grey-6 q-mt-xs">
                {{ r.templates?.length || 0 }} template(s) ·
                {{ r.inputs?.rows?.length || 0 }} input(s) ·
                {{ r.active === false ? 'paused' : 'active' }}
              </div>
            </q-card-section>
            <q-card-actions align="left" class="q-pt-none">
              <q-btn flat dense no-caps size="sm" icon="playlist_add" label="Build list" @click="store.materialise(r.routineId)" />
              <q-btn flat dense no-caps size="sm" icon="play_arrow" label="Test one" @click="store.runRoutineNow(r.routineId, { scope: 'first', reset: 'all' })">
                <q-tooltip>Build if needed, then run a single item — the cheap way to check it works</q-tooltip>
              </q-btn>
              <q-btn flat dense no-caps size="sm" icon="fast_forward" label="Run all" @click="store.runRoutineNow(r.routineId)" />
            </q-card-actions>
          </q-card>

          <div class="text-caption text-grey-6 q-mt-md q-mb-xs">Recent lists</div>
          <q-list bordered separator class="rounded-borders">
            <q-item
              v-for="l in store.lists"
              :key="l.listId"
              clickable
              :active="l.listId === store.current?.listId"
              active-class="bg-blue-1"
              @click="store.openList(l.listId)"
            >
              <q-item-section class="min-w-0">
                <q-item-label class="ellipsis">{{ l.title }}</q-item-label>
                <q-item-label caption>{{ l.date }} · {{ l.items?.length || 0 }} items</q-item-label>
              </q-item-section>
            </q-item>
            <q-item v-if="!store.lists.length">
              <q-item-section class="text-caption text-grey-6">No lists yet.</q-item-section>
            </q-item>
          </q-list>
        </div>

        <!-- ------------------------------------------------- current list -->
        <div class="col-12 col-md-8 min-w-0">
          <div v-if="!store.current" class="text-caption text-grey-6 q-pa-xl text-center bordered-box">
            Pick a list, or press <b>Build list</b> on a routine.
          </div>

          <template v-else>
            <div class="row items-center no-wrap q-mb-sm">
              <div class="col min-w-0">
                <div class="text-body1 text-weight-medium ellipsis">{{ store.current.title }}</div>
                <div class="text-caption text-grey-6">
                  {{ store.current.date }} ·
                  {{ store.counts.done }} done · {{ store.counts.failed }} failed ·
                  {{ store.counts.todo }} to do
                  <span v-if="store.current.autoRun" class="text-primary"> · running the list…</span>
                </div>
              </div>
              <q-btn v-if="store.current.autoRun" flat dense no-caps icon="stop" label="Stop" class="text-grey-8" @click="store.stopAll()" />
              <q-btn v-else flat dense no-caps icon="fast_forward" label="Run all" class="text-primary" :disable="!hasTodo" @click="store.runAll()" />
              <q-btn flat round dense icon="more_vert" class="text-grey-7">
                <q-menu auto-close>
                  <q-list dense style="min-width: 200px">
                    <q-item clickable @click="store.resetList('failed')">
                      <q-item-section>Reset failed items</q-item-section>
                    </q-item>
                    <q-item clickable @click="store.resetList('unfinished')">
                      <q-item-section>Reset failed + skipped</q-item-section>
                    </q-item>
                    <q-item clickable @click="store.resetList('all')">
                      <q-item-section>Run the whole list again</q-item-section>
                    </q-item>
                    <q-separator />
                    <q-item clickable @click="removeList">
                      <q-item-section class="text-negative">Delete this list</q-item-section>
                    </q-item>
                  </q-list>
                </q-menu>
              </q-btn>
            </div>

            <div v-if="store.current.note" class="text-caption text-orange-9 q-mb-sm">{{ store.current.note }}</div>

            <q-card
              v-for="it in store.current.items"
              :key="it.itemId"
              flat
              bordered
              class="q-mb-sm td-card"
            >
              <q-card-section class="q-py-sm">
                <div class="row items-center no-wrap">
                  <q-icon :name="statusIcon(it.status)" :color="statusColor(it.status)" size="18px" class="q-mr-sm" />
                  <div class="col min-w-0">
                    <div class="row items-center no-wrap">
                      <div class="text-body2 text-weight-medium ellipsis">{{ it.label }}</div>
                      <q-badge v-if="it.runAt" outline color="grey-7" class="q-ml-sm">{{ it.runAt }}</q-badge>
                      <q-badge v-if="it.mode === 'draft'" outline color="orange-8" class="q-ml-xs">draft</q-badge>
                    </div>
                    <div class="text-caption text-grey-7 instruction">{{ it.instruction }}</div>
                    <div v-if="it.missing?.length" class="text-caption text-negative">
                      Unfilled: {{ it.missing.map((m) => '{' + m + '}').join(', ') }}
                    </div>
                    <div v-if="it.note" class="text-caption text-orange-9">{{ it.note }}</div>
                    <div v-if="it.reason" class="text-caption text-grey-6">{{ it.reason }}</div>
                  </div>

                  <q-btn
                    v-if="['todo', 'failed', 'skipped'].includes(it.status)"
                    flat round dense icon="play_arrow" color="primary"
                    :disable="store.busy"
                    @click="store.runItem(it.itemId)"
                  >
                    <q-tooltip>{{ store.busy ? 'Another item is running' : 'Run this item now' }}</q-tooltip>
                  </q-btn>
                  <q-btn
                    v-else-if="it.status === 'done'"
                    flat round dense icon="replay" class="text-grey-7"
                    :disable="store.busy"
                    @click="store.runItem(it.itemId, { force: true })"
                  >
                    <q-tooltip>Run it again</q-tooltip>
                  </q-btn>
                  <q-spinner v-else color="primary" size="18px" class="q-mr-sm" />

                  <q-btn flat round dense icon="more_vert" class="text-grey-6">
                    <q-menu auto-close>
                      <q-list dense style="min-width: 190px">
                        <q-item clickable :disable="!it.taskId" @click="openInChat(it)">
                          <q-item-section>Open its session in Chat</q-item-section>
                        </q-item>
                        <q-item clickable :disable="isBusyItem(it)" @click="editItem(it)">
                          <q-item-section>Edit instruction</q-item-section>
                        </q-item>
                        <q-item clickable :disable="isBusyItem(it)" @click="setTime(it)">
                          <q-item-section>Set a time</q-item-section>
                        </q-item>
                        <q-item v-if="['todo', 'failed'].includes(it.status)" clickable @click="store.skipItem(it.itemId, 'Not today')">
                          <q-item-section>Skip today</q-item-section>
                        </q-item>
                        <q-item v-if="it.status !== 'todo'" clickable :disable="isBusyItem(it)" @click="store.resetItem(it.itemId)">
                          <q-item-section>Reset to “to do”</q-item-section>
                        </q-item>
                      </q-list>
                    </q-menu>
                  </q-btn>
                </div>
              </q-card-section>
            </q-card>
          </template>
        </div>
      </div>
    </div>

    <!-- ------------------------------------------------- routine editor -->
    <q-dialog v-model="editorOpen">
      <q-card class="editor-card">
        <q-card-section class="q-pb-none">
          <div class="text-subtitle1">{{ draft.routineId ? 'Edit routine' : 'New routine' }}</div>
        </q-card-section>
        <q-card-section class="q-gutter-sm">
          <q-input v-model="draft.name" dense outlined label="Name" />
          <q-select
            v-model="draft.trigger" dense outlined emit-value map-options
            :options="triggerOptions" label="Trigger"
          />
          <div class="text-caption text-grey-6">{{ triggerHelp }}</div>

          <div v-if="draft.trigger === 'interval'" class="row items-center q-gutter-sm">
            <q-input
              v-model.number="draft.schedule.everyMinutes" dense outlined type="number"
              label="Run every (minutes)" style="max-width: 180px"
            />
            <div class="text-caption text-grey-6">e.g. 60 = hourly, 300 = every 5 hours</div>
          </div>
          <div v-else-if="draft.trigger !== 'manual'" class="row items-center q-gutter-sm">
            <q-input v-model="draft.schedule.materialiseAt" dense outlined label="Build at" placeholder="08:30" style="max-width: 120px" />
            <q-input v-model="draft.schedule.window.from" dense outlined label="From" placeholder="09:00" style="max-width: 110px" />
            <q-input v-model="draft.schedule.window.to" dense outlined label="To" placeholder="18:00" style="max-width: 110px" />
          </div>

          <q-separator class="q-my-sm" />
          <div class="row items-center">
            <div class="text-caption text-grey-7">Templates — one item per input, each</div>
            <q-space />
            <q-btn flat dense no-caps size="sm" icon="add" label="Add" @click="addTemplate" />
          </div>
          <q-card v-for="(t, ti) in draft.templates" :key="ti" flat bordered class="q-pa-sm q-mb-xs">
            <div class="row items-center q-gutter-sm no-wrap">
              <q-input v-model="t.label" dense outlined label="Label" class="col-4 min-w-0" />
              <q-select v-model="t.mode" dense outlined emit-value map-options :options="modeOptions" label="Mode" class="col-4 min-w-0" />
              <q-btn flat round dense size="sm" icon="delete_outline" class="text-grey-6" @click="draft.templates.splice(ti, 1)" />
            </div>
            <!-- Instructions are long — this opens tall and grows further as you
                 type, rather than looking like a one-line field. -->
            <q-input
              v-model="t.instruction" dense outlined type="textarea" autogrow class="q-mt-xs"
              :input-style="{ minHeight: '150px' }"
              label="Instruction" placeholder="Exactly what you would type in Chat — as long as you like.&#10;Use {name} for input values, e.g. Write a post about {topic} and include {link}."
            />
          </q-card>

          <q-separator class="q-my-sm" />
          <div class="row items-center">
            <div class="text-caption text-grey-7">Inputs — rotated so each run uses different ones</div>
            <q-space />
            <q-btn flat dense no-caps size="sm" icon="add" label="Add" @click="addRow" />
          </div>
          <div class="row items-center q-gutter-sm q-mb-xs">
            <q-input v-model.number="draft.inputs.perDay" dense outlined type="number" label="Per run" style="max-width: 110px" />
            <q-input v-model.number="draft.inputs.cooldownDays" dense outlined type="number" label="Cooldown (days)" style="max-width: 160px" />
          </div>
          <div v-for="(row, ri) in draft.inputs.rows" :key="ri" class="row items-center q-gutter-sm no-wrap q-mb-xs">
            <q-input
              :model-value="rowText(row)" dense outlined class="col min-w-0"
              label="key=value, key=value"
              @update:model-value="(v) => setRowText(row, v)"
            />
            <q-btn flat round dense size="sm" icon="delete_outline" class="text-grey-6" @click="draft.inputs.rows.splice(ri, 1)" />
          </div>

          <q-toggle v-model="draft.active" label="Active" />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat no-caps label="Cancel" v-close-popup />
          <q-btn unelevated no-caps color="primary" label="Save" @click="saveDraft" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useQuasar } from 'quasar'
import { useTodosStore } from '@/stores/todos'
import { useSessionsStore } from '@/stores/sessions'

const store = useTodosStore()
const sessions = useSessionsStore()
const router = useRouter()
const $q = useQuasar()

const editorOpen = ref(false)
const draft = ref(blankRoutine())

const hasTodo = computed(() => !!store.current?.items?.some((i) => i.status === 'todo'))
const isBusyItem = (it) => ['running', 'queued'].includes(it.status)

const triggerOptions = [
  { value: 'manual', label: 'Manual — I build and run it myself' },
  { value: 'schedule-todo', label: 'Daily list — build it each morning, I press run' },
  { value: 'schedule', label: 'Daily automatic — build and run it (phase 3)' },
  { value: 'interval', label: 'Every N minutes — a timer (phase 3)' }
]
const modeOptions = [
  { value: 'draft', label: 'Draft — wait for me' },
  { value: 'auto', label: 'Auto — may run unattended' }
]
const triggerHelp = computed(() => ({
  manual: 'Nothing happens until you press a button.',
  'schedule-todo': 'The list is prepared for you; you decide when each item runs.',
  schedule: 'The clock is not built yet — for now this behaves like a daily list you run by hand.',
  interval: 'The clock is not built yet — for now use “Run all” to fire it.'
}[draft.value.trigger] || ''))

function blankRoutine() {
  return {
    name: '',
    trigger: 'schedule-todo',
    schedule: { materialiseAt: '08:30', window: { from: '09:00', to: '18:00' }, everyMinutes: 60 },
    templates: [{ label: '', instruction: '', mode: 'draft' }],
    inputs: { perDay: 5, cooldownDays: 14, rows: [] },
    active: true
  }
}

function openEditor(r) {
  draft.value = r
    ? JSON.parse(JSON.stringify({ ...blankRoutine(), ...r, schedule: { ...blankRoutine().schedule, ...(r.schedule || {}) } }))
    : blankRoutine()
  editorOpen.value = true
}

const addTemplate = () => draft.value.templates.push({ label: '', instruction: '', mode: 'draft' })
const addRow = () => draft.value.inputs.rows.push({ values: {} })

// Input rows are edited as "key=value, key=value" — a full table editor is not
// worth it while the pool lives on the routine (phase 4 moves it to a schema
// collection, which has a real editor already).
const rowText = (row) => Object.entries(row.values || {}).map(([k, v]) => `${k}=${v}`).join(', ')
function setRowText(row, text) {
  const values = {}
  for (const pair of String(text || '').split(',')) {
    const i = pair.indexOf('=')
    if (i <= 0) continue
    const k = pair.slice(0, i).trim()
    const v = pair.slice(i + 1).trim()
    if (/^\w+$/.test(k) && v) values[k] = v
  }
  row.values = values
}

async function saveDraft() {
  const saved = await store.saveRoutine(draft.value)
  if (saved) {
    editorOpen.value = false
    $q.notify({ message: 'Routine saved.', color: 'primary', timeout: 1500 })
  }
}

async function removeRoutine(r) {
  $q.dialog({
    title: 'Delete routine',
    message: `Delete “${r.name}”? Lists it already built are kept.`,
    cancel: true
  }).onOk(async () => {
    await store.deleteRoutine(r.routineId)
  })
}

async function removeList() {
  const id = store.current?.listId
  if (!id) return
  $q.dialog({ title: 'Delete list', message: 'Delete this todo list?', cancel: true })
    .onOk(async () => { await store.deleteList(id) })
}

function editItem(it) {
  $q.dialog({
    title: 'Edit instruction',
    message: 'What should the agent do for this item?',
    prompt: { model: it.instruction, type: 'textarea' },
    cancel: true
  }).onOk((v) => store.patchItem(it.itemId, { instruction: v }))
}

function setTime(it) {
  $q.dialog({
    title: 'Run at',
    message: 'A time like 09:30. Leave empty to clear. (The clock arrives in phase 3 — for now this is a note to yourself.)',
    prompt: { model: it.runAt || '', type: 'text' },
    cancel: true
  }).onOk((v) => store.patchItem(it.itemId, { runAt: String(v || '').trim() || null }))
}

// An item IS a normal session, so its transcript lives in Chat.
async function openInChat(it) {
  if (!it.taskId) return
  await sessions.loadTasks?.()
  await sessions.selectTask(it.taskId)
  router.push('/chat')
}

const triggerLabel = (r) => {
  if (r.trigger === 'interval') return `Every ${r.schedule?.everyMinutes || 60} min`
  if (r.trigger === 'manual') return 'Manual'
  if (r.trigger === 'schedule') return `Daily, automatic at ${r.schedule?.materialiseAt || '08:30'}`
  return `Daily list at ${r.schedule?.materialiseAt || '08:30'}`
}

const statusIcon = (s) => ({
  todo: 'radio_button_unchecked', queued: 'hourglass_empty', running: 'autorenew',
  done: 'check_circle', failed: 'error_outline', skipped: 'remove_circle_outline'
}[s] || 'radio_button_unchecked')
const statusColor = (s) => ({
  done: 'positive', failed: 'negative', running: 'primary', queued: 'primary', skipped: 'grey-6'
}[s] || 'grey-6')

async function reload() {
  await Promise.all([store.loadRoutines(), store.loadLists()])
  if (store.current) await store.openList(store.current.listId)
}

onMounted(reload)
onBeforeUnmount(() => store.stopPoll())
</script>

<style scoped>
.todos-page {
  background: #ffffff;
}
.td-wrap {
  width: 100%;
  max-width: 1100px;
}
/* A flex child that clamps user-supplied text refuses to shrink below its
   content unless min-width is 0 — the repo's recurring "pane looks empty" bug.
   Instructions and labels here are unbounded user text, so every column that
   holds one sets it. */
.min-w-0 {
  min-width: 0;
}
.td-card {
  border-radius: 10px;
}
.bordered-box {
  border: 1px dashed #e0e0e0;
  border-radius: 10px;
}
/* Instructions can be long: wrap and clamp instead of widening the row. */
.instruction {
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
/* Wide enough that a long instruction is readable while you write it. */
.editor-card {
  width: 780px;
  max-width: 94vw;
}
</style>
