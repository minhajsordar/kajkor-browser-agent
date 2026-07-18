import axios from "axios";
import { Dialog } from "quasar";

// localStorage flag set when the shop subscription is expired. Used to disable
// outgoing API calls client-side (backend 402 stays as the real guard).
export const SUBSCRIPTION_EXPIRED_KEY = "subscription-expired";
export const isSubscriptionExpired = () =>
  typeof window !== "undefined" &&
  localStorage.getItem(SUBSCRIPTION_EXPIRED_KEY) === "1";
const setSubscriptionExpired = (expired) => {
  if (typeof window === "undefined") return;
  if (expired) localStorage.setItem(SUBSCRIPTION_EXPIRED_KEY, "1");
  else localStorage.removeItem(SUBSCRIPTION_EXPIRED_KEY);
};
// Endpoints that must stay callable even when expired: login + subscription
// (so the user can sign in and renew). Mirrors the backend exempt list.
const isExpiredExemptUrl = (url = "") =>
  url.includes("/subscription") ||
  url.endsWith("user/auth") ||
  url.endsWith("user/auth/");
// The expired guard only applies to the shop-user app — never on the login
// page or any super-admin route (super admin bypasses the backend gate).
const isExpiredGuardActive = () => {
  if (typeof window === "undefined") return false;
  const path = window.location.pathname;
  if (path.startsWith("/login")) return false;
  if (path.startsWith("/super-admin")) return false;
  return true;
};

// Show the subscription-expired dialog only once at a time.
let subscriptionDialogOpen = false;
const showSubscriptionExpiredDialog = (message) => {
  if (!isExpiredGuardActive()) return;
  if (subscriptionDialogOpen) return;
  subscriptionDialogOpen = true;
  Dialog.create({
    title: "Subscription Expired",
    message:
      (message ||
        "Your subscription is expired. Contact us if you have any inquery") +
      "<br/><br/>All actions are disabled until your subscription is renewed. Please contact support to continue using the system.",
    html: true,
    // Non-closable except via the action: persistent blocks backdrop + ESC.
    persistent: true,
    ok: { label: "Login Again", color: "negative" },
    cancel: false,
  }).onOk(() => {
    // Clear all auth state and send the user back to login.
    localStorage.removeItem("token");
    localStorage.removeItem("auth-user");
    localStorage.removeItem(SUBSCRIPTION_EXPIRED_KEY);
    window.location.href = "/login";
  });
};
// Be careful when using SSR for cross-request state pollution
// dueAmount to creating a Singleton instance here;
// If any client changes this (global) instance, it might be a
// good idea to move this instance creation inside of the
// "export default () => {}" function below (which runs individually
// for each client)
export const backendUrlLink = import.meta.env.VITE_BACKEND_URL;
export const api = axios.create({
  withCredentials: true,
  baseURL: backendUrlLink,
});

// Add a request interceptor to automatically add the Bearer token from localStorage
api.interceptors.request.use(
  (config) => {
    // Prefer s-token on super-admin routes, otherwise use token
    let token = null;
    if (config.url?.startsWith("/api") && typeof window !== "undefined") {
      const pathname = window.location.pathname;
      if (pathname.startsWith("/super-admin")) {
        token = localStorage.getItem("s-token") || localStorage.getItem("token");
      } else {
        token = localStorage.getItem("token") || localStorage.getItem("s-token");
      }
    }
    if (token) {
      config.headers["Authorization"] = `Bearer ${token}`; // Attach the token to the Authorization header
    }

    // Subscription expired: block every non-exempt API call before it leaves
    // the client and surface the dialog. Skipped on login + super-admin routes.
    if (
      isExpiredGuardActive() &&
      isSubscriptionExpired() &&
      !isExpiredExemptUrl(config.url || "")
    ) {
      showSubscriptionExpiredDialog();
      return Promise.reject(
        new axios.Cancel("Subscription expired: request blocked")
      );
    }
    return config; // Return the modified config object to continue the request
  },
  (error) => {
    // Handle the request error
    return Promise.reject(error);
  }
);

// Retry logic for failed requests
api.interceptors.response.use((response) => {
  // Keep the client expired-flag in sync from any response that reports
  // subscription state (e.g. login). Clears it once an active sub is seen.
  const sub = response?.data?.data?.subscription;
  if (sub && typeof sub.isExpired === "boolean") {
    setSubscriptionExpired(sub.isExpired);
  }
  return response;
}, async (error) => {
  const config = error.config; // Get the request configuration from the error object

  // Client-side cancel from the request interceptor (expired guard) — nothing
  // more to do, the dialog is already shown.
  if (axios.isCancel(error)) {
    return Promise.reject(error);
  }

  // Subscription expired: backend blocks every protected route with 402 +
  // code SUBSCRIPTION_EXPIRED. Mark expired, show dialog, stop retrying.
  if (
    error.response?.status === 402 &&
    error.response?.data?.code === "SUBSCRIPTION_EXPIRED"
  ) {
    setSubscriptionExpired(true);
    showSubscriptionExpiredDialog(error.response?.data?.message);
    return Promise.reject(error);
  }

  // Set a retry count if it doesn't exist
  if (!config.__retryCount) {
    config.__retryCount = 0;
  }

  // Set the maximum number of retries
  const MAX_RETRIES = 0;

  // If the request has not exceeded the max retry count, retry the request
  if (config.__retryCount < MAX_RETRIES) {
    config.__retryCount += 1; // Increment the retry count

    // Calculate the delay time (exponential backoff: 1000ms, 2000ms, 4000ms)
    const delay = Math.pow(2, config.__retryCount) * 1000; // Delay is in milliseconds

    // Wait for the delay before retrying
    await new Promise((resolve) => setTimeout(resolve, delay));

    // Retry the request with the updated configuration
    return api(config);
  }

  // If max retries reached, reject the error
  return Promise.reject(error);
});
