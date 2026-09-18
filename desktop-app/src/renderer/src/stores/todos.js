import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '@/boot/backend'
import { useSessionsStore } from '@/stores/sessions'

// Daily todos — routines → per-day lists → items.
// Plan: plans/partially-done/daily-todos-scheduler.md (phases 1-2).
//
// An item is "one instruction the agent runs"; the backend creates a normal task
// for it, so anything you can type in Chat can be a todo item. EVERYTHING here
// is manually runnable — a routine, a whole list, one item, even one that
// already ran (`force`) — because the user needs to press things to check they
// work before leaving any of it to a schedule.
//
// The poll below is not cosmetic: `GET /todolists/:id` is what reconciles each
// item against its task AND advances a "Run all" chain to the next item, so
// while a list is active this store has to keep asking.
export const useTodosStore = defineStore('todos', () => {
  const routines = ref([])
  const lists = ref([])
  const current = ref(null)          // the open list
  const loading = ref(false)
  const notice = ref('')
  let poll = null

  const sessions = () => useSessionsStore()
  // The model is stamped on the list by the backend when a run starts, so the
  // chain can keep going after this window is closed. We only supply it.
  const model = () => sessions().model || ''

  const busy = computed(() =>
    !!current.value?.items?.some((i) => i.status === 'running' || i.status === 'queued')
  )
  const counts = computed(() => {
    const out = { todo: 0, running: 0, done: 0, failed: 0, skipped: 0 }
    for (const i of current.value?.items || []) {
      if (i.status === 'queued') out.running++
      else if (out[i.status] !== undefined) out[i.status]++
    }
    return out
  })

  const err = (e, fallback) => e?.response?.data?.error || fallback

  // ---- routines ------------------------------------------------------------
  async function loadRoutines() {
    try {
      const { data } = await api.get('/routines')
      routines.value = data.routines || []
    } catch {
      routines.value = []
      notice.value = 'Could not load routines.'
    }
  }

  async function saveRoutine(routine) {
    try {
      const { data } = routine.routineId
        ? await api.patch(`/routines/${routine.routineId}`, routine)
        : await api.post('/routines', routine)
      await loadRoutines()
      return data.routine
    } catch (e) {
      notice.value = err(e, 'Could not save the routine.')
      return null
    }
  }

  async function deleteRoutine(routineId) {
    try {
      await api.delete(`/routines/${routineId}`)
      routines.value = routines.value.filter((r) => r.routineId !== routineId)
      return true
    } catch {
      return false
    }
  }

  // Build this occurrence's list (today's, for a daily routine). Idempotent —
  // pressing it twice opens the same list rather than making a second one.
  async function materialise(routineId, date = '') {
    try {
      const { data } = await api.post(`/routines/${routineId}/materialise`, date ? { date } : {})
      await loadLists()
      await openList(data.list.listId)
      notice.value = data.already ? 'That list already existed — opened it.' : ''
      return data.list
    } catch (e) {
      notice.value = err(e, 'Could not build the list.')
      return null
    }
  }

  // "Run it now" for a whole routine — builds the list if needed, then runs it.
  // `scope: 'first'` runs a single item, which is the cheap way to test a
  // routine before trusting it with the whole day's work.
  async function runRoutineNow(routineId, { scope = '', reset = '' } = {}) {
    try {
      const { data } = await api.post(`/routines/${routineId}/run-now`, {
        model: model(), ...(scope ? { scope } : {}), ...(reset ? { reset } : {})
      })
      current.value = data.list
      await loadLists()
      notice.value = data.note || ''
      startPoll()
      return data.list
    } catch (e) {
      notice.value = err(e, 'Could not run the routine.')
      return null
    }
  }

  // ---- lists ---------------------------------------------------------------
  async function loadLists({ date = '', routineId = '' } = {}) {
    loading.value = true
    try {
      const params = {}
      if (date) params.date = date
      if (routineId) params.routineId = routineId
      const { data } = await api.get('/todolists', { params })
      lists.value = data.lists || []
    } catch {
      lists.value = []
      notice.value = 'Could not load todo lists.'
    } finally {
      loading.value = false
    }
  }

  async function openList(listId) {
    try {
      const { data } = await api.get(`/todolists/${listId}`, { params: { model: model() } })
      current.value = data.list
      startPoll()
      return data.list
    } catch (e) {
      notice.value = err(e, 'Could not open that list.')
      return null
    }
  }

  async function createAdhoc({ title, items, projectId = null }) {
    try {
      const { data } = await api.post('/todolists', { title, items, projectId })
      await loadLists()
      current.value = data.list
      return data.list
    } catch (e) {
      notice.value = err(e, 'Could not create the list.')
      return null
    }
  }

  async function deleteList(listId) {
    try {
      await api.delete(`/todolists/${listId}`)
      lists.value = lists.value.filter((l) => l.listId !== listId)
      if (current.value?.listId === listId) { current.value = null; stopPoll() }
      return true
    } catch {
      return false
    }
  }

  // ---- items ---------------------------------------------------------------
  // `force` re-runs an item that already finished — a deliberate manual "do it
  // again", the same reasoning as Run again in chat.
  async function runItem(itemId, { force = false } = {}) {
    if (!current.value) return null
    notice.value = ''
    try {
      const { data } = await api.post(
        `/todolists/${current.value.listId}/items/${itemId}/run`,
        { model: model(), force }
      )
      current.value = data.list
      startPoll()
      return data.taskId
    } catch (e) {
      // The Chrome-is-closed refusal comes back with the list attached, so the
      // item's own note explains itself in place.
      if (e?.response?.data?.list) current.value = e.response.data.list
      notice.value = err(e, 'Could not start that item.')
      return null
    }
  }

  async function skipItem(itemId, reason = '') {
    if (!current.value) return
    try {
      const { data } = await api.post(`/todolists/${current.value.listId}/items/${itemId}/skip`, { reason })
      current.value = data.list
    } catch (e) {
      notice.value = err(e, 'Could not skip that item.')
    }
  }

  async function patchItem(itemId, patch) {
    if (!current.value) return
    try {
      const { data } = await api.patch(`/todolists/${current.value.listId}/items/${itemId}`, patch)
      current.value = data.list
    } catch (e) {
      notice.value = err(e, 'Could not update that item.')
    }
  }

  const resetItem = (itemId) => patchItem(itemId, { status: 'todo' })

  // ---- whole-list actions --------------------------------------------------
  async function runAll() {
    if (!current.value) return
    notice.value = ''
    try {
      const { data } = await api.post(`/todolists/${current.value.listId}/run`, { model: model() })
      current.value = data.list
      startPoll()
    } catch (e) {
      notice.value = err(e, 'Could not run the list.')
    }
  }

  // Stops the CHAIN. An item already running keeps going — stop that in Chat,
  // where its transcript is.
  async function stopAll() {
    if (!current.value) return
    try {
      const { data } = await api.post(`/todolists/${current.value.listId}/stop`, {})
      current.value = data.list
    } catch (e) {
      notice.value = err(e, 'Could not stop the list.')
    }
  }

  // Put finished items back to `todo` so the list can be run again — the
  // "computer was off at 09:00" case, and the way you re-test a routine.
  async function resetList(scope = 'failed') {
    if (!current.value) return
    try {
      const { data } = await api.post(`/todolists/${current.value.listId}/reset`, { scope })
      current.value = data.list
      notice.value = data.reset ? `${data.reset} item(s) ready to run again.` : 'Nothing to reset.'
    } catch (e) {
      notice.value = err(e, 'Could not reset the list.')
    }
  }

  // ---- polling -------------------------------------------------------------
  // Every tick both mirrors task statuses onto items and lets the backend start
  // the next item of a "Run all" chain. Stops as soon as nothing is moving, so
  // an idle list costs nothing.
  function startPoll() {
    stopPoll()
    poll = setInterval(async () => {
      if (!current.value) return stopPoll()
      try {
        const { data } = await api.get(`/todolists/${current.value.listId}`, { params: { model: model() } })
        current.value = data.list
        if (!data.list.autoRun && !data.list.items.some((i) => ['running', 'queued'].includes(i.status))) stopPoll()
      } catch {
        stopPoll()
      }
    }, 2500)
  }
  function stopPoll() {
    if (poll) clearInterval(poll)
    poll = null
  }

  return {
    routines, lists, current, loading, notice, busy, counts,
    loadRoutines, saveRoutine, deleteRoutine, materialise, runRoutineNow,
    loadLists, openList, createAdhoc, deleteList,
    runItem, skipItem, patchItem, resetItem,
    runAll, stopAll, resetList, startPoll, stopPoll
  }
})
