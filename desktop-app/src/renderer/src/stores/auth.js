import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api, setToken } from '@/boot/backend'

// Auth model mirrors the backend: LOOPBACK callers are trusted (mode 'local',
// no login needed); a remote backend returns 401 until a JWT is presented
// (mode 'anon' → login screen); a valid token yields mode 'authed'.
export const useAuthStore = defineStore('auth', () => {
  const user = ref(null)
  const mode = ref('unknown') // 'local' | 'authed' | 'anon' | 'unknown'
  const checked = ref(false)
  const error = ref('')

  const needsLogin = computed(() => mode.value === 'anon')
  const canLogout = computed(() => mode.value === 'authed')

  async function checkAuth() {
    checked.value = true
    try {
      const { data } = await api.get('/auth/me')
      if (data.local) {
        mode.value = 'local'
        user.value = null
      } else if (data.user) {
        mode.value = 'authed'
        user.value = data.user
      } else {
        mode.value = 'anon'
        user.value = null
      }
    } catch (e) {
      // 401 → the backend requires a token we don't have. Any other failure
      // (offline/unreachable) shouldn't trap the user on a login screen.
      if (e?.response?.status === 401) {
        mode.value = 'anon'
        user.value = null
      } else {
        mode.value = 'local'
        user.value = null
      }
    }
    return mode.value
  }

  async function login(email, password) {
    error.value = ''
    try {
      const { data } = await api.post('/auth/login', { email, password })
      if (!data.ok) {
        error.value = data.error || 'Login failed.'
        return false
      }
      setToken(data.token)
      user.value = data.user
      mode.value = 'authed'
      return true
    } catch (e) {
      error.value = e?.response?.data?.error || 'Login failed — is the backend reachable?'
      return false
    }
  }

  async function register(name, email, password) {
    error.value = ''
    try {
      const { data } = await api.post('/auth/register', { name, email, password })
      if (!data.ok) {
        error.value = data.error || 'Registration failed.'
        return false
      }
      return await login(email, password) // auto sign-in
    } catch (e) {
      error.value = e?.response?.data?.error || 'Registration failed.'
      return false
    }
  }

  // Drop the token, then re-derive state: a local backend reverts to 'local'
  // (no login wall); a remote one becomes 'anon' (login screen).
  async function logout() {
    setToken('')
    user.value = null
    await checkAuth()
  }

  return { user, mode, checked, error, needsLogin, canLogout, checkAuth, login, register, logout }
})
