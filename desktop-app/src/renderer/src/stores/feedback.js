import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '@/boot/backend'

// The feedback review surface. Captured corrections (👎 / typed) and likes (👍)
// live in the backend `feedback` collection; this store lists them and drives
// the three post-capture actions: analyze (→ approval-gated proposal), dismiss
// (keep the record, stop acting), and delete.
export const useFeedbackStore = defineStore('feedback', () => {
  const items = ref([])
  const loading = ref(false)
  const notice = ref('')

  async function load({ host = '', status = '' } = {}) {
    loading.value = true
    notice.value = ''
    try {
      const params = {}
      if (host) params.host = host
      if (status) params.status = status
      const { data } = await api.get('/feedback', { params })
      items.value = data.feedback || []
    } catch {
      items.value = []
      notice.value = 'Could not load feedback.'
    } finally {
      loading.value = false
    }
  }

  // Turn a correction into a proposal. Returns the backend's { ok, proposal?,
  // error? } so the caller can tell the user whether a fix was suggested. The
  // proposal itself lands in the originating session's transcript.
  async function analyze(id) {
    try {
      const { data } = await api.post(`/feedback/${id}/analyze`, {})
      return data
    } catch (e) {
      return { ok: false, error: e?.response?.data?.error || 'Analyze failed.' }
    }
  }

  async function dismiss(id) {
    try {
      await api.post(`/feedback/${id}/dismiss`, {})
      const it = items.value.find((f) => f.feedbackId === id)
      if (it) it.status = 'dismissed'
      return true
    } catch {
      return false
    }
  }

  async function remove(id) {
    try {
      await api.delete(`/feedback/${id}`)
      items.value = items.value.filter((f) => f.feedbackId !== id)
      return true
    } catch {
      return false
    }
  }

  return { items, loading, notice, load, analyze, dismiss, remove }
})
