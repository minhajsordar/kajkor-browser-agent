<template>
  <q-page class="row no-wrap chat-page">
    <div class="sidebar column">
      <SessionList />
    </div>
    <!-- min-width:0 is REQUIRED here, not just inside ChatThread. This is the
         flex child that holds the thread; without it, a long goal in the thread
         header sets this column's minimum size and the whole pane grows wider
         than the window, pushing the centred transcript out of view. The rule
         has to hold on EVERY flex ancestor — one missing link re-widens it. -->
    <div class="col column chat-main">
      <ChatThread />
    </div>
  </q-page>
</template>

<script setup>
import { onMounted, onBeforeUnmount } from 'vue'
import SessionList from '@/components/SessionList.vue'
import ChatThread from '@/components/ChatThread.vue'
import { useSessionsStore } from '@/stores/sessions'
import { useProjectsStore } from '@/stores/projects'

const store = useSessionsStore()
const projects = useProjectsStore()

// Poll the list slowly; poll the open session faster while it's running so the
// live activity + chat replies stream in (rounds are driven by the extension).
let listTimer = null
let currentTimer = null

onMounted(async () => {
  await Promise.all([store.loadModels(), store.loadTasks(), projects.loadProjects()])
  listTimer = setInterval(() => store.loadTasks(), 3000)
  currentTimer = setInterval(() => {
    if (store.selectedId) store.refreshCurrent()
  }, 1500)
})

onBeforeUnmount(() => {
  clearInterval(listTimer)
  clearInterval(currentTimer)
})
</script>

<style scoped>
.chat-page {
  height: calc(100vh - 46px);
  background: #ffffff;
}
.sidebar {
  width: 260px;
  min-width: 260px;
  border-right: 1px solid #e6e7ea;
}
/* overflow:hidden as well as min-width:0 — see ChatThread.vue's .thread-pane.
   min-width:0 permits shrinking; only a formatting context stops the thread's
   content from dictating this column's width. */
.chat-main {
  min-width: 0;
  overflow: hidden;
}
</style>
