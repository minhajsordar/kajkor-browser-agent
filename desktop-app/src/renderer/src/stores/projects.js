import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '@/boot/backend'
import { useSessionsStore } from '@/stores/sessions'

const LIST_KEY = 'ba_projects' // cache of the backend list, for instant first paint
const CURRENT_KEY = 'ba_current_project'

// Projects group sessions AND carry default settings their tasks inherit
// (model, skills, a project-wide "dynamic" system prompt…). The BACKEND is the
// source of truth (a `projects` collection); localStorage is only a cache of the
// list plus the current selection. Selection stays keyed by name for the UI.
export const useProjectsStore = defineStore('projects', () => {
  const projects = ref(loadCache())
  const currentName = ref(localStorage.getItem(CURRENT_KEY) || '')
  const loaded = ref(false)

  function loadCache() {
    try {
      const arr = JSON.parse(localStorage.getItem(LIST_KEY) || '[]')
      return Array.isArray(arr) ? arr.filter((p) => p && p.name) : []
    } catch {
      return []
    }
  }
  function cache() {
    localStorage.setItem(LIST_KEY, JSON.stringify(projects.value))
  }

  const current = computed(() => projects.value.find((p) => p.name === currentName.value) || null)

  // Apply a project's defaults to the composer, so a new session under it starts
  // with its model/skills (the user can still change them = override). The
  // project's inline system prompt is applied SERVER-side at task creation.
  function applySettings(p) {
    const s = (p && p.settings) || {}
    const sess = useSessionsStore()
    sess.setWorkDir(p?.dir || '')
    if (s.model) sess.setModel(s.model)
    if (Array.isArray(s.skillIds)) sess.setNewSessionSkills(s.skillIds)
  }

  // Load the authoritative list from the backend, and migrate any project that
  // only ever lived in this install's localStorage (match by name).
  async function loadProjects() {
    let remote = []
    try {
      const { data } = await api.get('/projects')
      remote = data.projects || []
    } catch {
      loaded.value = true
      return
    }
    const names = new Set(remote.map((p) => p.name))
    for (const local of projects.value) {
      if (!local.projectId && !names.has(local.name)) {
        try {
          const { data } = await api.post('/projects', { name: local.name, dir: local.dir || '' })
          if (data.project) remote.push(data.project)
        } catch {
          /* keep going; a failed migration is not fatal */
        }
      }
    }
    projects.value = remote.map((p) => ({ projectId: p.projectId, name: p.name, dir: p.dir || '', settings: p.settings || {} }))
    cache()
    loaded.value = true
    if (current.value) applySettings(current.value)
  }

  function setCurrent(name) {
    currentName.value = name || ''
    if (name) localStorage.setItem(CURRENT_KEY, name)
    else localStorage.removeItem(CURRENT_KEY)
    if (current.value) applySettings(current.value)
    else useSessionsStore().setWorkDir('')
  }

  // Native OS folder picker (Electron main process). Returns '' outside the app.
  async function pickFolder() {
    if (!window.api?.host?.pickDirectory) return ''
    return (await window.api.host.pickDirectory()) || ''
  }

  // Register a folder as a project (name = folder basename), create it on the
  // backend to get a projectId, and select it.
  async function addFolder(dir) {
    if (!dir) return null
    const name = String(dir).replace(/[\\/]+$/, '').split(/[\\/]/).pop() || String(dir)
    let existing = projects.value.find((p) => p.name === name)
    if (!existing) {
      try {
        const { data } = await api.post('/projects', { name, dir: String(dir) })
        if (data.project) existing = { projectId: data.project.projectId, name: data.project.name, dir: data.project.dir || '', settings: data.project.settings || {} }
      } catch {
        /* backend unreachable — keep a local-only entry, migrated on next load */
      }
      if (!existing) existing = { projectId: null, name, dir: String(dir), settings: {} }
      projects.value = [...projects.value, existing]
      cache()
    }
    setCurrent(name)
    return name
  }

  // Save a project's settings (model / skills / system prompt / schemas). Merged
  // server-side, so a partial patch keeps the rest.
  async function updateSettings(projectId, settings) {
    if (!projectId) return
    try {
      const { data } = await api.patch(`/projects/${projectId}`, { settings })
      if (data.project) {
        projects.value = projects.value.map((p) => (p.projectId === projectId ? { ...p, settings: data.project.settings || {} } : p))
        cache()
        if (current.value?.projectId === projectId) applySettings(current.value)
      }
    } catch {
      /* ignore — the dialog surfaces failure via its own state if needed */
    }
  }

  // Resolve a project (WITH its settings) by id — from the loaded list, or by
  // fetching it. A task carries only {projectId, name, dir}, so editing an active
  // session's project needs the full doc looked up here.
  async function getProject(projectId) {
    if (!projectId) return null
    const local = projects.value.find((p) => p.projectId === projectId)
    if (local && local.settings) return local
    try {
      const { data } = await api.get(`/projects/${projectId}`)
      if (!data.project) return local || null
      return { projectId: data.project.projectId, name: data.project.name, dir: data.project.dir || '', settings: data.project.settings || {} }
    } catch {
      return local || null
    }
  }

  async function remove(name) {
    const p = projects.value.find((x) => x.name === name)
    projects.value = projects.value.filter((x) => x.name !== name)
    cache()
    if (currentName.value === name) setCurrent('')
    if (p?.projectId) {
      try {
        await api.delete(`/projects/${p.projectId}`)
      } catch {
        /* the task snapshot keeps history grouped regardless */
      }
    }
  }

  // Sessions created elsewhere may reference projects this install has not seen —
  // surface them so their sessions stay grouped. loadProjects reconciles later.
  function ensure(name, dir) {
    if (!name || projects.value.some((p) => p.name === name)) return
    projects.value = [...projects.value, { projectId: null, name, dir: dir || '', settings: {} }]
    cache()
  }

  return {
    projects, currentName, current, loaded,
    loadProjects, applySettings, setCurrent, pickFolder, addFolder, updateSettings, getProject, remove, ensure,
  }
})
