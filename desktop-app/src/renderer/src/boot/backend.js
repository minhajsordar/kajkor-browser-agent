import axios from 'axios'

// Shared axios instance. Its baseURL is filled in by initBackend() from the
// Electron main process (dev: http://localhost:34730; packaged: the embedded
// server). A stored JWT (set after login) rides along on every request.
export const api = axios.create()

const TOKEN_KEY = 'ba_token'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || ''
}
export function setToken(t) {
  if (t) localStorage.setItem(TOKEN_KEY, t)
  else localStorage.removeItem(TOKEN_KEY)
}

api.interceptors.request.use((config) => {
  const t = getToken()
  if (t) config.headers.Authorization = `Bearer ${t}`
  return config
})

const BASE_KEY = 'ba_backend_url'

export function getBackendUrl() {
  return api.defaults.baseURL || ''
}

// Persist and apply a backend URL override (used by Settings to point at a
// remote backend). Passing empty clears the override → back to the main-process
// default on next init.
export function setBackendUrl(url) {
  const clean = (url || '').trim().replace(/\/$/, '')
  if (clean) {
    localStorage.setItem(BASE_KEY, clean)
    api.defaults.baseURL = clean
  } else {
    localStorage.removeItem(BASE_KEY)
  }
  return clean
}

export async function initBackend() {
  // A saved override wins; otherwise ask the main process (dev: :34730,
  // packaged: the embedded server); otherwise the dev default.
  let base = localStorage.getItem(BASE_KEY) || ''
  if (!base) {
    base = 'http://localhost:34730'
    try {
      if (window.api?.app?.getBackendUrl) {
        const url = await window.api.app.getBackendUrl()
        if (url) base = url.replace(/\/$/, '')
      }
    } catch {
      /* keep the dev default */
    }
  }
  api.defaults.baseURL = base
  return base
}
