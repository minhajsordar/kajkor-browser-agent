import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { Quasar, Loading, Dialog, Notify } from 'quasar'

import '@quasar/extras/roboto-font/roboto-font.css'
import '@quasar/extras/material-icons/material-icons.css'
import '@quasar/extras/material-symbols-outlined/material-symbols-outlined.css'
import 'quasar/src/css/index.sass'

import App from '@/App.vue'
import router from '@/router'
import { initBackend } from '@/boot/backend'

// Resolve the backend base URL from the main process BEFORE mounting, so the
// first API call already has it. Falls back to the dev default.
initBackend().finally(() => {
  const app = createApp(App)
  app.use(Quasar, { plugins: { Loading, Dialog, Notify } })
  app.use(createPinia())
  app.use(router)
  app.mount('#app')
})
