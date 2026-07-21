import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '@/boot/backend'

const MODEL_KEY = 'ba_model'
const SKILLS_KEY = 'ba_skill_ids'
const WORKDIR_KEY = 'ba_workdir'
const TERMINAL = new Set(['done', 'error', 'stopped'])

// One task == one conversational session. The extension executes tasks it
// discovers by polling the backend, so the desktop app only needs to create
// tasks / send chat rounds and then follow their state.
export const useSessionsStore = defineStore('sessions', () => {
  const tasks = ref([]) // list summaries (GET /tasks)
  const current = ref(null) // full selected task (GET /tasks/:id)
  const selectedId = ref(null)
  const models = ref([])
  const model = ref(localStorage.getItem(MODEL_KEY) || 'auto')
  // Default working directory for host commands (blank = the executor's home
  // fallback). Persisted; also used to fill a proposal's cwd when the model
  // left it empty.
  const workDir = ref(localStorage.getItem(WORKDIR_KEY) || '')
  // Skills a NEW session starts with ([] = all of them). Remembered, because a
  // user who narrowed the set once usually wants the same set next time.
  const newSessionSkillIds = ref(JSON.parse(localStorage.getItem(SKILLS_KEY) || '[]'))
  const backendOnline = ref(true)
  const sending = ref(false)
  const notice = ref('')
  const pendingHost = ref(null) // host-command proposal awaiting confirmation
  const pendingLaunch = ref(null) // app-launch proposal awaiting confirmation

  const currentBusy = computed(() => current.value && !TERMINAL.has(current.value.status))

  const isTerminal = (t) => !t || TERMINAL.has(t.status)

  function setModel(m) {
    model.value = m
    localStorage.setItem(MODEL_KEY, m)
  }

  function setNewSessionSkills(ids) {
    newSessionSkillIds.value = Array.isArray(ids) ? ids : []
    localStorage.setItem(SKILLS_KEY, JSON.stringify(newSessionSkillIds.value))
  }

  function setWorkDir(d) {
    workDir.value = d || ''
    if (d) localStorage.setItem(WORKDIR_KEY, d)
    else localStorage.removeItem(WORKDIR_KEY)
  }
  async function pickWorkDir() {
    if (!window.api?.host?.pickDirectory) return
    const d = await window.api.host.pickDirectory()
    if (d) setWorkDir(d)
  }

  // Change the model of the OPEN session (persists on the task; later rounds,
  // answers and host proposals use it).
  async function setSessionModel(m) {
    if (!selectedId.value || !m) return
    try {
      const { data } = await api.patch(`/tasks/${selectedId.value}`, { model: m })
      if (data.ok && data.task) current.value = data.task
    } catch {
      /* ignore */
    }
  }

  async function loadModels() {
    try {
      const { data } = await api.get('/models')
      models.value = data.models || []
      backendOnline.value = true
    } catch {
      models.value = []
      backendOnline.value = false
    }
  }

  async function loadTasks() {
    try {
      const { data } = await api.get('/tasks')
      tasks.value = data.tasks || []
      backendOnline.value = true
    } catch {
      backendOnline.value = false
    }
  }

  async function refreshCurrent() {
    if (!selectedId.value) return
    try {
      const { data } = await api.get(`/tasks/${selectedId.value}`)
      if (!data.ok || !data.task) return
      const next = data.task
      const cur = current.value
      // Skip the assignment when nothing actually changed. This polls every
      // 1.5s, and replacing the object re-renders the whole transcript each
      // time — which fights the user's scrolling and makes reading back
      // through a long session impossible.
      const unchanged =
        cur &&
        cur.taskId === next.taskId &&
        cur.updatedAt === next.updatedAt &&
        cur.status === next.status &&
        (cur.chat?.length || 0) === (next.chat?.length || 0) &&
        (cur.events?.length || 0) === (next.events?.length || 0) &&
        (cur.queue?.length || 0) === (next.queue?.length || 0)
      if (unchanged) return
      current.value = next
    } catch {
      /* transient — keep the last snapshot */
    }
  }

  async function selectTask(id) {
    selectedId.value = id
    current.value = tasks.value.find((t) => t.taskId === id) || null
    await refreshCurrent()
  }

  function newSession() {
    selectedId.value = null
    current.value = null
    notice.value = ''
  }

  // Create a session from the first instruction. The extension's poll picks it
  // up (status 'planning') and runs it within ~30s. `project` ({name, dir} or
  // null) groups the session under a folder in the sidebar.
  // `idle` starts a session the extension will not execute — for a first turn
  // that is an image to analyze rather than a browser instruction.
  async function createSession(goal, project = null, { idle = false } = {}) {
    const g = (goal || '').trim()
    if (!g) return
    if (!model.value) {
      notice.value = 'Pick a model first.'
      return
    }
    sending.value = true
    notice.value = ''
    try {
      const platform = (await window.api?.host?.platform?.()) || undefined
      // projectId drives backend inheritance (project defaults → this task).
      const proj = project
        ? { projectId: project.projectId || undefined, name: String(project.name), dir: String(project.dir || '') }
        : null
      const { data } = await api.post('/tasks', {
        goal: g, model: model.value, platform, project: proj,
        useSkills: newSessionSkillIds.value, idle
      })
      // A "/run …" goal returns an idle host session + a command proposal.
      if (data.task) {
        await loadTasks()
        await selectTask(data.task.taskId)
      }
      if (data.mode === 'host' && data.proposal) {
        if (!data.proposal.cwd && workDir.value) data.proposal.cwd = workDir.value
        pendingHost.value = data.proposal
      } else if (data.mode === 'launch' && data.proposal) {
        // The user's own message asked to open this app, so there is nothing to
        // re-confirm — launch it straight away (still gated to the known-app
        // registry in the main process). The result lands in the transcript.
        await runLaunch(data.proposal)
      } else if (!data.ok) notice.value = data.error || 'Could not create session.'
    } catch {
      notice.value = 'Backend not reachable.'
    } finally {
      sending.value = false
    }
  }

  // Upload images for the NEXT turn. Returns the stored file ids; the bytes
  // live in the backend, so the chat request only carries ids.
  // `images` = [{ name, dataUrl }].
  async function uploadImages(images) {
    if (!selectedId.value || !images?.length) return []
    try {
      const { data } = await api.post(`/tasks/${selectedId.value}/attachments`, { images })
      if (!data.ok) {
        notice.value = data.error || 'Upload failed.'
        return []
      }
      return data.files || []
    } catch (e) {
      notice.value = e?.response?.data?.error || 'Upload failed.'
      return []
    }
  }

  // Follow-up in the current session. Browse rounds set status 'planning'
  // (extension resumes them); answer rounds reply immediately in chat.
  // With `imageIds`, the turn is answered by a vision model instead.
  async function sendChat(message, imageIds = []) {
    const m = (message || '').trim()
    if ((!m && !imageIds.length) || !selectedId.value) return
    sending.value = true
    notice.value = ''
    // optimistic echo
    if (current.value) {
      current.value.chat = [...(current.value.chat || []), { role: 'user', text: m, at: new Date().toISOString() }]
    }
    try {
      const platform = (await window.api?.host?.platform?.()) || undefined
      const { data } = await api.post(`/tasks/${selectedId.value}/chat`, { message: m, platform, imageIds })
      if (data.mode === 'queued') {
        notice.value = `Queued — runs when the current step finishes (${data.queued} waiting).`
      } else if (data.mode === 'host' && data.proposal) {
        if (!data.proposal.cwd && workDir.value) data.proposal.cwd = workDir.value
        pendingHost.value = data.proposal
      } else if (data.mode === 'launch' && data.proposal) {
        // Asked-for launch → run it, no confirmation (see createSession).
        await runLaunch(data.proposal)
      } else if (!data.ok) notice.value = data.error || 'Message failed.'
      await refreshCurrent()
    } catch {
      notice.value = 'Backend not reachable.'
    } finally {
      sending.value = false
    }
  }

  // Approve the pending host proposal: run it via the Electron main process
  // (never the backend), then record the outcome in the session transcript.
  async function runHost() {
    const p = pendingHost.value
    if (!p) return
    pendingHost.value = null
    // IMPORTANT: unwrap the reactive proxy to plain values — Electron IPC uses
    // structured clone, which throws "An object could not be cloned" on a Vue
    // Proxy. .map(String) makes a fresh plain array; cwd is a primitive.
    const argv = (p.argv || []).map((s) => String(s))
    const cwd = p.cwd ? String(p.cwd) : ''
    let result
    if (!window.api?.host?.run) {
      result = { error: 'Host execution is only available in the desktop app.', exitCode: null }
    } else {
      try {
        result = await window.api.host.run({ argv, cwd })
      } catch (e) {
        result = { error: e?.message || 'run failed', exitCode: null }
      }
    }
    try {
      await api.post(`/tasks/${selectedId.value}/host-result`, {
        title: p.title,
        argv,
        cwd,
        exitCode: result.exitCode ?? null,
        stdout: result.stdout || '',
        stderr: result.stderr || '',
        timedOut: !!result.timedOut,
        error: result.error || ''
      })
      await refreshCurrent()
    } catch {
      notice.value = 'Backend not reachable.'
    }
  }

  async function denyHost() {
    const p = pendingHost.value
    if (!p) return
    pendingHost.value = null
    try {
      await api.post(`/tasks/${selectedId.value}/host-result`, { title: p.title, argv: p.argv, denied: true })
      await refreshCurrent()
    } catch {
      /* ignore */
    }
  }

  // Run an app-launch via the Electron main process (never the backend).
  // Resolves a profile display name ("Work") to its Chrome directory first, then
  // records the outcome in the transcript. Takes the proposal directly (the
  // instruction already authorised it — no confirmation card); falls back to
  // `pendingLaunch` for any legacy caller.
  async function runLaunch(proposal = null) {
    const p = proposal || pendingLaunch.value
    if (!p) return
    pendingLaunch.value = null
    const appId = String(p.appId || '')
    const label = String(p.label || appId)
    let result
    if (!window.api?.launch?.app) {
      result = { ok: false, error: 'App launching is only available in the desktop app.' }
    } else {
      try {
        // Map a profile NAME to its directory (Chrome stores "Profile 1" etc.,
        // the user says "Work"). Fall back to the raw value if it already looks
        // like a directory.
        let profileDir = ''
        if (p.profile) {
          const profiles = (await window.api.launch.profiles().catch(() => [])) || []
          const hit = profiles.find((x) => String(x.name).toLowerCase() === String(p.profile).toLowerCase())
          profileDir = hit ? hit.dir : String(p.profile)
        }
        // Phase 4: a browser launch can carry a URL to open in the profile —
        // Chrome navigates itself, no extension coordination needed. Only http(s).
        const args = /^https?:\/\//i.test(String(p.url || '')) ? [String(p.url)] : []
        result = await window.api.launch.app({ appId, profileDir, args, approved: true })
        // "always allow this app" — remember so it does not re-prompt.
        if (result.ok) await window.api.launch.remember(appId).catch(() => {})
      } catch (e) {
        result = { ok: false, error: e?.message || 'launch failed' }
      }
    }
    try {
      await api.post(`/tasks/${selectedId.value}/launch-result`, {
        appId, label, error: result.ok ? '' : result.error || 'launch failed'
      })
      await refreshCurrent()
    } catch {
      notice.value = 'Backend not reachable.'
    }
  }

  // Capture a correction on the current session. Phase 1: stored with the
  // round's context so it can later become a proposal or a scoped lesson.
  async function submitFeedback({ round, messageAt, whatWrong, whatExpected, scope }) {
    if (!selectedId.value || !whatWrong) return null
    try {
      const { data } = await api.post(`/tasks/${selectedId.value}/feedback`, {
        kind: 'down',
        round: typeof round === 'number' ? round : undefined,
        messageAt: messageAt || undefined,
        whatWrong,
        whatExpected: whatExpected || '',
        scope: scope || { type: 'host' }
      })
      await refreshCurrent()
      return data.ok ? data.feedback || null : null
    } catch {
      notice.value = 'Could not send feedback.'
      return null
    }
  }

  // Phase 2: ask the backend to turn a captured correction into a concrete,
  // approval-gated proposal. Returns { ok, proposal?, error? }; on success the
  // proposal shows up in the transcript (refreshCurrent picks it up).
  async function analyzeFeedback(feedbackId) {
    if (!feedbackId) return { ok: false, error: 'no feedback' }
    try {
      const { data } = await api.post(`/feedback/${feedbackId}/analyze`, {})
      await refreshCurrent()
      return data
    } catch (e) {
      return { ok: false, error: e?.response?.data?.error || 'Could not analyze feedback.' }
    }
  }

  // Regenerate the last round: re-run its instruction in place. Backend refuses a
  // round that acted (double-post safety); the UI hides the button there too.
  async function regenerate() {
    if (!selectedId.value) return false
    sending.value = true
    notice.value = ''
    try {
      const { data } = await api.post(`/tasks/${selectedId.value}/regenerate`, {})
      if (!data.ok && data.error) notice.value = data.error
      await refreshCurrent()
      return !!data.ok
    } catch (e) {
      notice.value = e?.response?.data?.error || 'Could not regenerate.'
      return false
    } finally {
      sending.value = false
    }
  }

  // Confirm a round was right — a like. No form: a positive example needs no
  // "what went wrong". Stored as kind:'up' with the round's context.
  async function likeRound({ round, messageAt } = {}) {
    if (!selectedId.value) return false
    try {
      const { data } = await api.post(`/tasks/${selectedId.value}/feedback`, {
        kind: 'up',
        round: typeof round === 'number' ? round : undefined,
        messageAt: messageAt || undefined
      })
      await refreshCurrent()
      return !!data.ok
    } catch {
      notice.value = 'Could not send feedback.'
      return false
    }
  }

  async function denyLaunch() {
    const p = pendingLaunch.value
    if (!p) return
    pendingLaunch.value = null
    try {
      await api.post(`/tasks/${selectedId.value}/launch-result`, { appId: p.appId, label: p.label, denied: true })
      await refreshCurrent()
    } catch {
      /* ignore */
    }
  }

  // Rename a session. `title` overrides the goal-derived sidebar label;
  // clearing it falls back to the generated one.
  async function renameSession(taskId, title) {
    if (!taskId) return false
    try {
      const { data } = await api.patch(`/tasks/${taskId}`, { title: String(title || '').trim() })
      if (!data.ok) return false
      if (current.value?.taskId === taskId) current.value = data.task
      await loadTasks()
      return true
    } catch {
      notice.value = 'Rename failed.'
      return false
    }
  }

  async function deleteSession(taskId) {
    if (!taskId) return false
    try {
      await api.delete(`/tasks/${taskId}`)
      // Deleting the open session leaves nothing to show — go back to the
      // new-conversation screen rather than a stale transcript.
      if (selectedId.value === taskId) newSession()
      await loadTasks()
      return true
    } catch {
      notice.value = 'Delete failed.'
      return false
    }
  }

  // Approve or decline a change the agent wants to make to its own saved
  // elements/skills. Nothing is written until this returns approved.
  async function decideProposal(proposalId, decision) {
    if (!selectedId.value || !proposalId) return
    try {
      const { data } = await api.post(`/tasks/${selectedId.value}/proposals/${proposalId}`, { decision })
      if (!data.ok && data.error) notice.value = data.error
      await refreshCurrent()
    } catch {
      notice.value = 'Backend not reachable.'
    }
  }

  // Cancel the running round. The extension polls task status between phases,
  // so the backend flipping it to 'stopped' is what halts execution.
  async function stopTask() {
    if (!selectedId.value) return
    try {
      const { data } = await api.post(`/tasks/${selectedId.value}/stop`)
      if (data.ok) {
        notice.value = data.dropped ? `Stopped. ${data.dropped} queued prompt(s) discarded.` : 'Stopped.'
        await refreshCurrent()
        await loadTasks()
      }
    } catch {
      notice.value = 'Backend not reachable.'
    }
  }

  async function cancelQueued(qid) {
    if (!selectedId.value || !qid) return
    try {
      const { data } = await api.delete(`/tasks/${selectedId.value}/queue/${qid}`)
      if (data.ok && data.task) current.value = data.task
    } catch {
      /* ignore */
    }
  }

  // Narrow which learned skills this session plans with. [] = no restriction.
  async function setSessionSkills(skillIds) {
    if (!selectedId.value) return
    try {
      const { data } = await api.post(`/tasks/${selectedId.value}/skills`, { skillIds: skillIds || [] })
      if (data.ok && data.task) current.value = data.task
    } catch {
      notice.value = 'Could not update skills.'
    }
  }

  async function answer(ans) {
    if (!selectedId.value) return
    try {
      await api.post(`/tasks/${selectedId.value}/answer`, { answer: ans })
      await refreshCurrent()
    } catch {
      /* ignore */
    }
  }

  async function compact() {
    if (!selectedId.value) return
    notice.value = 'Compacting…'
    try {
      const { data } = await api.post(`/tasks/${selectedId.value}/compact`)
      notice.value = data.ok ? 'Session compacted.' : data.error || 'Compact failed.'
      await refreshCurrent()
    } catch {
      notice.value = 'Backend not reachable.'
    }
  }

  return {
    tasks,
    current,
    selectedId,
    models,
    model,
    workDir,
    backendOnline,
    sending,
    notice,
    pendingHost,
    pendingLaunch,
    currentBusy,
    isTerminal,
    newSessionSkillIds,
    setNewSessionSkills,
    stopTask,
    cancelQueued,
    uploadImages,
    renameSession,
    deleteSession,
    decideProposal,
    setSessionSkills,
    setModel,
    setWorkDir,
    pickWorkDir,
    setSessionModel,
    loadModels,
    loadTasks,
    refreshCurrent,
    selectTask,
    newSession,
    createSession,
    sendChat,
    answer,
    compact,
    runHost,
    denyHost,
    runLaunch,
    denyLaunch,
    submitFeedback,
    likeRound,
    analyzeFeedback,
    regenerate
  }
})
