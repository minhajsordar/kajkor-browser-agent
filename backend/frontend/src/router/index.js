import { createRouter, createWebHistory } from "vue-router";
const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: "/",
      name: "root",
      component: () => import("../layouts/DefaultLayout.vue"),
      children: [
        {
          path: "",
          name: "home",
          component: () => import("../pages/AuthView.vue"),
        },
        {
          path: "r",
          name: "root-redirect",
          component: () => import("../pages/r.vue"),
        },
        {
          path: "/login",
          name: "login",
          component: () => import("../pages/AuthView.vue"),
        },
        {
          path: "/forgot-password",
          name: "forgot-password",
          component: () => import("../pages/ForgotPasswordPage.vue"),
        },
      ],
    },
    {
      path: '/activate',
      name: 'electron-activate',
      component: () => import('../pages/electron/DeviceActivationView.vue'),
      meta: { electronOnly: true },
    },
    {
      path: '/local-login',
      name: 'electron-local-login',
      component: () => import('../pages/electron/LocalLoginView.vue'),
      meta: { electronOnly: true },
    },
  ],
});
export default router;
