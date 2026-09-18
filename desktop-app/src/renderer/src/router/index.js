import { createRouter, createWebHashHistory } from 'vue-router'
import ChatView from '@/pages/ChatView.vue'
import DataView from '@/pages/DataView.vue'
import SkillsView from '@/pages/SkillsView.vue'
import ElementsView from '@/pages/ElementsView.vue'
import TodosView from '@/pages/TodosView.vue'
import FeedbackView from '@/pages/FeedbackView.vue'
import ConnectionView from '@/pages/ConnectionView.vue'
import LoginView from '@/pages/LoginView.vue'
import SettingsView from '@/pages/SettingsView.vue'
import { useAuthStore } from '@/stores/auth'

// Hash history — required under Electron's file:// protocol in packaged builds.
const routes = [
  { path: '/', redirect: '/chat' },
  { path: '/chat', name: 'chat', component: ChatView },
  { path: '/todos', name: 'todos', component: TodosView },
  { path: '/data', name: 'data', component: DataView },
  { path: '/skills', name: 'skills', component: SkillsView },
  { path: '/elements', name: 'elements', component: ElementsView },
  { path: '/feedback', name: 'feedback', component: FeedbackView },
  { path: '/connection', name: 'connection', component: ConnectionView },
  { path: '/login', name: 'login', component: LoginView, meta: { public: true } },
  { path: '/settings', name: 'settings', component: SettingsView, meta: { public: true } }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

// Force login ONLY when the backend actually rejects us (mode 'anon' from a
// 401). Loopback/offline never traps the user on the login screen.
router.beforeEach(async (to) => {
  if (to.meta?.public) return true
  const auth = useAuthStore()
  if (!auth.checked) await auth.checkAuth()
  if (auth.needsLogin) return { name: 'login' }
  return true
})

export default router
