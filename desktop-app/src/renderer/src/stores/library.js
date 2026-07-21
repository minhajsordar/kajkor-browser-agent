import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '@/boot/backend'

// Standalone management surfaces (ported from the deleted extension pages):
// collected data (schemas + records), learned skills, and introduced elements.
export const useLibraryStore = defineStore('library', () => {
  const schemas = ref([])
  const skills = ref([])
  const elements = ref([])
  const notice = ref('')

  // ---- schemas / data ----
  async function loadSchemas() {
    try {
      const { data } = await api.get('/schemas')
      schemas.value = data.schemas || []
    } catch {
      schemas.value = []
    }
  }
  async function loadRecords(schemaId) {
    try {
      const { data } = await api.get(`/schemas/${schemaId}/records`)
      return { records: data.records || [], fields: data.fields || [] }
    } catch {
      return { records: [], fields: [] }
    }
  }
  async function deleteSchema(schemaId) {
    try {
      await api.delete(`/schemas/${schemaId}`)
      await loadSchemas()
      return true
    } catch {
      notice.value = 'Delete failed.'
      return false
    }
  }

  // ---- skills ----
  async function loadSkills() {
    try {
      const { data } = await api.get('/skills?resolve=1')
      skills.value = data.skills || []
    } catch {
      skills.value = []
    }
  }
  async function renameSkill(skillId, name) {
    try {
      const { data } = await api.patch(`/skills/${skillId}`, { name })
      if (data.ok) await loadSkills()
      return data.ok
    } catch {
      return false
    }
  }
  // Raw (unresolved) skill — carries the { elementId, order } refs to edit.
  async function getSkill(skillId) {
    try {
      const { data } = await api.get(`/skills/${skillId}`)
      return data.ok ? data.skill : null
    } catch {
      return null
    }
  }
  // Generic patch: name, urlPattern, details, kind, action, fields, and the
  // ordered element refs (elements: [{elementId, order}]).
  async function updateSkill(skillId, patch) {
    try {
      const { data } = await api.patch(`/skills/${skillId}`, patch)
      if (data.ok) await loadSkills()
      return data.ok ? { ok: true } : { ok: false, error: data.error }
    } catch (e) {
      return { ok: false, error: e?.response?.data?.error || 'request failed' }
    }
  }
  async function createSkill(body) {
    try {
      const { data } = await api.post('/skills', body)
      if (data.ok) await loadSkills()
      return data.ok ? { ok: true, skill: data.skill } : { ok: false, error: data.error }
    } catch (e) {
      return { ok: false, error: e?.response?.data?.error || 'request failed' }
    }
  }
  async function deleteSkill(skillId) {
    try {
      await api.delete(`/skills/${skillId}`)
      await loadSkills()
      return true
    } catch {
      return false
    }
  }

  // ---- elements ----
  async function loadElements(host) {
    try {
      const { data } = await api.get('/elements' + (host ? `?host=${encodeURIComponent(host)}` : ''))
      elements.value = data.elements || []
    } catch {
      elements.value = []
    }
  }
  async function updateElement(elementId, patch) {
    try {
      const { data } = await api.patch(`/elements/${elementId}`, patch)
      if (data.ok) await loadElements()
      return data.ok
    } catch {
      return false
    }
  }
  async function createElement(body) {
    try {
      const { data } = await api.post('/elements', body)
      if (data.ok) await loadElements()
      return data.ok ? { ok: true, element: data.element } : { ok: false, error: data.error }
    } catch (e) {
      return { ok: false, error: e?.response?.data?.error || 'request failed' }
    }
  }
  // Elements used by skills return 409; caller decides whether to force.
  async function deleteElement(elementId, { force = false } = {}) {
    try {
      await api.delete(`/elements/${elementId}${force ? '?force=1' : ''}`)
      await loadElements()
      return { ok: true }
    } catch (e) {
      if (e?.response?.status === 409) return { ok: false, inUse: true, skills: e.response.data?.skills || [] }
      return { ok: false }
    }
  }

  return {
    schemas,
    skills,
    elements,
    notice,
    loadSchemas,
    loadRecords,
    deleteSchema,
    loadSkills,
    renameSkill,
    getSkill,
    updateSkill,
    createSkill,
    deleteSkill,
    loadElements,
    updateElement,
    createElement,
    deleteElement
  }
})
