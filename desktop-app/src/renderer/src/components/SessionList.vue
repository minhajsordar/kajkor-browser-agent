<template>
  <div class="sidebar-root column full-height">
    <!-- New conversation -->
    <div class="q-pa-sm">
      <q-btn
        class="new-conv full-width"
        unelevated
        no-caps
        align="left"
        icon="add"
        label="New Conversation"
        @click="store.newSession()"
      />
    </div>

    <q-list dense class="nav-list q-px-xs">
      <q-item clickable class="nav-item" @click="historyOpen = true">
        <q-item-section avatar><q-icon name="history" size="18px" /></q-item-section>
        <q-item-section>Conversation History</q-item-section>
      </q-item>
      <q-item clickable class="nav-item" @click="scheduledSoon">
        <q-item-section avatar><q-icon name="schedule" size="18px" /></q-item-section>
        <q-item-section>Scheduled Tasks</q-item-section>
      </q-item>
    </q-list>

    <!-- Projects header -->
    <div class="row items-center q-pl-md q-pr-sm q-pt-md q-pb-xs">
      <div class="text-caption text-grey-7">Projects</div>
      <q-space />
      <q-btn dense flat round size="sm" icon="filter_list" class="text-grey-7">
        <q-tooltip>Filter</q-tooltip>
        <q-menu>
          <q-list dense style="min-width: 160px">
            <q-item clickable v-close-popup @click="filterEmpty = false">
              <q-item-section>Show all projects</q-item-section>
              <q-item-section v-if="!filterEmpty" side><q-icon name="check" size="14px" /></q-item-section>
            </q-item>
            <q-item clickable v-close-popup @click="filterEmpty = true">
              <q-item-section>Hide empty projects</q-item-section>
              <q-item-section v-if="filterEmpty" side><q-icon name="check" size="14px" /></q-item-section>
            </q-item>
          </q-list>
        </q-menu>
      </q-btn>
      <q-btn dense flat round size="sm" icon="create_new_folder" class="text-grey-7">
        <q-tooltip>New project</q-tooltip>
        <q-menu>
          <q-list dense style="min-width: 160px">
            <q-item clickable v-close-popup @click="createOpen = true">
              <q-item-section avatar><q-icon name="create_new_folder" size="16px" /></q-item-section>
              <q-item-section>New Project</q-item-section>
            </q-item>
            <q-item clickable v-close-popup @click="quickStart">
              <q-item-section avatar><q-icon name="bolt" size="16px" /></q-item-section>
              <q-item-section>Quick Start</q-item-section>
            </q-item>
          </q-list>
        </q-menu>
      </q-btn>
    </div>

    <!-- Grouped sessions -->
    <q-scroll-area class="col">
      <div v-for="g in visibleGroups" :key="g.key" class="q-mb-xs">
        <div class="group-head row items-center" @click="toggle(g.key)">
          <q-icon
            :name="g.name === null ? 'folder_off' : 'folder'"
            size="16px"
            class="q-mr-sm text-grey-7"
          />
          <div class="col ellipsis text-body2 text-weight-medium">
            {{ g.name === null ? 'No project' : g.name }}
          </div>
          <!-- Per-folder project settings (model / skills / prompt / schemas).
               Shown for a backend-backed project; reveals on hover like the
               conversation menu. -->
          <q-btn
            v-if="g.name !== null && projectOf(g.name)?.projectId"
            dense
            flat
            round
            size="9px"
            icon="tune"
            class="group-menu text-grey-7"
            @click.stop="openProjectSettings(g.name)"
          >
            <q-tooltip>Project settings</q-tooltip>
          </q-btn>
          <q-icon
            :name="collapsed.has(g.key) ? 'chevron_right' : 'expand_more'"
            size="16px"
            class="text-grey-6"
          />
          <q-menu context-menu v-if="g.name !== null">
            <q-list dense style="min-width: 170px">
              <q-item v-if="projectOf(g.name)?.projectId" clickable v-close-popup @click="openProjectSettings(g.name)">
                <q-item-section>Project settings</q-item-section>
              </q-item>
              <q-item clickable v-close-popup @click="projects.setCurrent(g.name)">
                <q-item-section>Use for new conversation</q-item-section>
              </q-item>
              <q-item clickable v-close-popup @click="projects.remove(g.name)">
                <q-item-section class="text-negative">Remove from sidebar</q-item-section>
              </q-item>
            </q-list>
          </q-menu>
        </div>

        <template v-if="!collapsed.has(g.key)">
          <div
            v-for="t in g.tasks"
            :key="t.taskId"
            class="sess row items-center no-wrap"
            :class="{ active: t.taskId === store.selectedId }"
            @click="store.selectTask(t.taskId)"
          >
            <div class="sess-title col" :title="titleOf(t)">{{ titleOf(t) }}</div>
            <span class="dot" :style="{ background: dotColor(t.status) }" />
            <span class="age text-caption text-grey-6">{{ ago(t.createdAt) }}</span>
            <q-btn
              dense
              flat
              round
              size="9px"
              icon="more_vert"
              class="sess-menu text-grey-7"
              @click.stop
            >
              <q-menu auto-close>
                <q-list dense style="min-width: 150px">
                  <q-item clickable @click="askRename(t)">
                    <q-item-section avatar style="min-width: 30px">
                      <q-icon name="edit" size="16px" />
                    </q-item-section>
                    <q-item-section>Edit label</q-item-section>
                  </q-item>
                  <q-item clickable @click="askDelete(t)">
                    <q-item-section avatar style="min-width: 30px">
                      <q-icon name="delete" size="16px" color="negative" />
                    </q-item-section>
                    <q-item-section class="text-negative">Delete</q-item-section>
                  </q-item>
                </q-list>
              </q-menu>
            </q-btn>
          </div>
          <div v-if="!g.tasks.length" class="sess empty text-caption text-grey-5">
            No conversations yet
          </div>
        </template>
      </div>

      <div v-if="!visibleGroups.length" class="q-pa-md text-caption text-grey-6">
        No projects yet. Create one, or just start a conversation.
      </div>
    </q-scroll-area>

    <q-banner v-if="!store.backendOnline" dense class="bg-negative text-white">
      Backend offline — start it on :34730.
    </q-banner>

    <q-separator />
    <q-list dense class="q-px-xs q-py-xs">
      <q-item clickable class="nav-item" @click="$router.push('/settings')">
        <q-item-section avatar><q-icon name="settings" size="18px" /></q-item-section>
        <q-item-section>Settings</q-item-section>
      </q-item>
    </q-list>

    <CreateProjectDialog v-model="createOpen" />
    <ProjectSettingsDialog v-model="settingsOpen" :project="settingsProject" />

    <!-- Rename a conversation -->
    <q-dialog v-model="renameOpen" @hide="renameTarget = null">
      <q-card style="width: 380px; max-width: 92vw; border-radius: 12px">
        <q-card-section class="q-pb-none">
          <div class="text-subtitle1 text-weight-medium">Edit label</div>
        </q-card-section>
        <q-card-section>
          <q-input
            v-model="renameDraft"
            dense
            outlined
            autofocus
            counter
            maxlength="80"
            placeholder="Conversation name"
            @keyup.enter="confirmRename"
          />
          <div class="text-caption text-grey-6 q-mt-xs">
            Leave empty to go back to the automatic label.
          </div>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn v-close-popup flat no-caps label="Cancel" class="text-grey-7" />
          <q-btn unelevated no-caps color="primary" label="Save" @click="confirmRename" />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Conversation history -->
    <q-dialog v-model="historyOpen">
      <q-card style="width: 560px; max-width: 92vw; border-radius: 12px">
        <q-card-section class="row items-center q-pb-none">
          <div class="text-subtitle1 text-weight-medium">Conversation History</div>
          <q-space />
          <q-btn v-close-popup flat round dense size="sm" icon="close" />
        </q-card-section>
        <q-card-section class="q-pb-none">
          <q-input v-model="historyFilter" dense outlined placeholder="Search conversations" autofocus>
            <template #prepend><q-icon name="search" size="18px" /></template>
          </q-input>
        </q-card-section>
        <q-card-section style="max-height: 50vh" class="scroll">
          <q-list separator>
            <q-item
              v-for="t in historyTasks"
              :key="t.taskId"
              clickable
              v-close-popup
              @click="store.selectTask(t.taskId)"
            >
              <q-item-section>
                <q-item-label lines="1">{{ t.goal }}</q-item-label>
                <q-item-label caption>
                  {{ t.project?.name || 'No project' }} · {{ t.status }} · {{ ago(t.createdAt) }}
                </q-item-label>
              </q-item-section>
            </q-item>
            <q-item v-if="!historyTasks.length">
              <q-item-section class="text-caption text-grey">Nothing found.</q-item-section>
            </q-item>
          </q-list>
        </q-card-section>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useQuasar } from 'quasar'
import { useSessionsStore } from '@/stores/sessions'
import { useProjectsStore } from '@/stores/projects'
import CreateProjectDialog from '@/components/CreateProjectDialog.vue'
import ProjectSettingsDialog from '@/components/ProjectSettingsDialog.vue'

const $q = useQuasar()
const store = useSessionsStore()
const projects = useProjectsStore()

const createOpen = ref(false)

// Edit a project's default settings straight from its sidebar folder. The store
// list carries settings; getProject fetches them if this folder came from a task
// snapshot ({projectId,name,dir}) rather than the loaded project list.
const settingsOpen = ref(false)
const settingsProject = ref(null)
function projectOf(name) {
  return projects.projects.find((p) => p.name === name) || null
}
async function openProjectSettings(name) {
  const p = projectOf(name)
  settingsProject.value = p && p.settings ? p : (p?.projectId ? await projects.getProject(p.projectId) : p)
  settingsOpen.value = true
}
const historyOpen = ref(false)
const historyFilter = ref('')
const filterEmpty = ref(false)
const collapsed = ref(new Set())

const renameOpen = ref(false)
const renameTarget = ref(null)
const renameDraft = ref('')

function askRename(t) {
  renameTarget.value = t
  // Seed with the CURRENT custom title, or the generated label as a starting
  // point — editing beats retyping.
  renameDraft.value = t.title || titleOf(t)
  renameOpen.value = true
}

async function confirmRename() {
  const t = renameTarget.value
  if (!t) return
  renameOpen.value = false
  const ok = await store.renameSession(t.taskId, renameDraft.value)
  if (!ok) $q.notify({ message: 'Could not rename.', color: 'negative', timeout: 1800 })
}

function askDelete(t) {
  $q.dialog({
    title: 'Delete conversation',
    message: `"${titleOf(t)}" and its collected data will be removed. This cannot be undone.`,
    ok: { label: 'Delete', color: 'negative', unelevated: true, noCaps: true },
    cancel: { label: 'Cancel', flat: true, noCaps: true, color: 'grey-7' },
    persistent: true
  }).onOk(async () => {
    const ok = await store.deleteSession(t.taskId)
    if (!ok) $q.notify({ message: 'Could not delete.', color: 'negative', timeout: 1800 })
  })
}

function toggle(key) {
  const s = new Set(collapsed.value)
  if (s.has(key)) s.delete(key)
  else s.add(key)
  collapsed.value = s
}

// Quick Start = pick a folder and immediately begin a conversation in it.
async function quickStart() {
  const dir = await projects.pickFolder()
  if (!dir) return
  projects.addFolder(dir)
  store.newSession()
}

function scheduledSoon() {
  $q.notify({ message: 'Scheduled tasks are coming soon.', color: 'grey-8', timeout: 1500 })
}

// Group sessions under their project; registered-but-empty projects still show.
const groups = computed(() => {
  const byName = new Map()
  for (const p of projects.projects) byName.set(p.name, { key: p.name, name: p.name, tasks: [] })
  const none = { key: ' none', name: null, tasks: [] }
  for (const t of store.tasks) {
    const n = t.project?.name || ''
    if (!n) {
      none.tasks.push(t)
      continue
    }
    if (!byName.has(n)) byName.set(n, { key: n, name: n, tasks: [] })
    byName.get(n).tasks.push(t)
  }
  const arr = [...byName.values()]
  if (none.tasks.length) arr.push(none)
  return arr
})

const visibleGroups = computed(() =>
  filterEmpty.value ? groups.value.filter((g) => g.tasks.length) : groups.value
)

// Register projects discovered on tasks (created on another install).
watch(
  () => store.tasks,
  (ts) => {
    for (const t of ts || []) if (t.project?.name) projects.ensure(t.project.name, t.project.dir)
  },
  { immediate: true }
)

const historyTasks = computed(() => {
  const f = historyFilter.value.trim().toLowerCase()
  const all = store.tasks
  return f ? all.filter((t) => (t.goal || '').toLowerCase().includes(f)) : all
})

// A short, tidy sidebar label. A user-set `title` always wins; otherwise derive
// from the goal: first line, no /run prefix or leading emoji, first ~12 words,
// sentence-cased. (12, not 8 — the row now wraps to two lines.)
function titleOf(t) {
  const custom = String(t.title || '').trim()
  if (custom) return custom
  let s = String(t.goal || '').split('\n')[0].trim()
  s = s.replace(/^\/(run|sh|host)\s+/i, '').replace(/^[^\p{L}\p{N}]+/u, '')
  const words = s.split(/\s+/).filter(Boolean)
  s = words.slice(0, 12).join(' ')
  if (words.length > 12) s += '…'
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Untitled session'
}

function dotColor(status) {
  return (
    {
      running: '#2e7d32',
      planning: '#f9a825',
      checking: '#f9a825',
      waiting: '#f9a825',
      done: '#90959e',
      error: '#c62828',
      stopped: '#90959e'
    }[status] || '#90959e'
  )
}

// Compact relative age: 3mo · 4d · 2h · 5m · now
function ago(iso) {
  const t = Date.parse(iso)
  if (!t) return ''
  const s = Math.max(0, (Date.now() - t) / 1000)
  if (s < 60) return 'now'
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  if (s < 30 * 86400) return `${Math.floor(s / 86400)}d`
  if (s < 365 * 86400) return `${Math.floor(s / (30 * 86400))}mo`
  return `${Math.floor(s / (365 * 86400))}y`
}
</script>

<style scoped>
.sidebar-root {
  background: #f7f7f8;
  font-size: 13px;
}
.new-conv {
  background: #ececee;
  color: #2b2c30;
  border-radius: 8px;
  font-size: 13px;
}
.nav-item {
  border-radius: 8px;
  min-height: 32px;
  color: #4a4c52;
}
.nav-list :deep(.q-item__section--avatar) {
  min-width: 28px;
}
.group-head {
  padding: 5px 10px 5px 14px;
  cursor: pointer;
  color: #2b2c30;
  user-select: none;
}
.group-head:hover {
  background: #ededef;
}
/* Same min-width:auto trap as .sess-title — a long project name would widen
   the sidebar and reintroduce the sideways scroll. */
.group-head > .col {
  min-width: 0;
}
/* Quiet until you hover the folder (or focus its menu), like the conversation
   row's overflow button — the folder row stays clean otherwise. */
.group-menu {
  flex: 0 0 auto;
  opacity: 0;
  transition: opacity 0.12s;
}
.group-head:hover .group-menu,
.group-menu:focus-within {
  opacity: 1;
}
.sess {
  padding: 5px 4px 5px 30px;
  cursor: pointer;
  border-radius: 6px;
  margin: 0 4px;
  color: #55575e;
  gap: 6px;
}
/* A flex child defaults to min-width:auto, so a long label pushed the row wider
   than the sidebar and made the whole list scroll sideways. min-width:0 lets it
   shrink and clamp instead. */
.sess-title {
  min-width: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
  line-height: 1.32;
}
/* The overflow menu is quiet until you need it, but stays visible on the open
   conversation and while its own menu is up (or it vanishes under the cursor). */
.sess-menu {
  flex: 0 0 auto;
  opacity: 0;
  transition: opacity 0.12s;
}
.sess:hover .sess-menu,
.sess.active .sess-menu,
.sess-menu:focus-within {
  opacity: 1;
}
.sess:hover {
  background: #ececee;
}
.sess.active {
  background: #e4e6ea;
  color: #1f2023;
}
.sess.empty {
  cursor: default;
}
.sess.empty:hover {
  background: transparent;
}
.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex: 0 0 auto;
}
.age {
  flex: 0 0 auto;
  min-width: 26px;
  text-align: right;
}
</style>
