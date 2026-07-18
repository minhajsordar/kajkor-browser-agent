import { api } from "./axios";

function nowIso() {
  try {
    return new Date().toISOString();
  } catch {
    return undefined;
  }
}

function elementDescriptor(el) {
  if (!el || !el.tagName) return "unknown";
  const tag = el.tagName.toLowerCase();
  const id = el.id ? `#${el.id}` : "";
  const cls = (el.className && typeof el.className === "string" && el.className.trim())
    ? "." + el.className.trim().split(/\s+/).slice(0, 3).join(".")
    : "";
  return `${tag}${id}${cls}`;
}

export function initAnalytics({ router }) {
  const queue = [];
  let timer = null;
  const FLUSH_MS = 4000;
  const MAX_BATCH = 20;
  const endpoint = "/api/analytics/track";

  function flush(useBeacon = false) {
    if (!queue.length) return;
    const events = queue.splice(0, queue.length);
    if (useBeacon && navigator.sendBeacon) {
      try {
        const blob = new Blob([JSON.stringify({ events })], { type: "application/json" });
        navigator.sendBeacon(api.defaults.baseURL + endpoint, blob);
        return;
      } catch (_) {
        // fallback to fetch
      }
    }
    api.post(endpoint, { events }).catch(() => {});
  }

  function scheduleFlush() {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      flush(false);
    }, FLUSH_MS);
  }

  function track(e) {
    queue.push({ ...e, ts: e.ts || nowIso() });
    if (queue.length >= MAX_BATCH) {
      flush(false);
    } else {
      scheduleFlush();
    }
  }

  // Route change tracking
  if (router && router.afterEach) {
    router.afterEach((to) => {
      try {
        track({
          type: "page_view",
          path: to.fullPath,
          routeName: to.name,
          pageTitle: document.title,
        });
      } catch (_) {}
    });
  }

  // Click tracking via delegation with opt-in data attributes for naming
  document.addEventListener("click", (evt) => {
    try {
      const target = evt.target;
      const el = target?.closest ? target.closest("[data-analytics], [data-analytics-name], button, a, [role=button]") : target;
      if (!el) return;
      const name = el.getAttribute?.("data-analytics-name") || el.getAttribute?.("data-analytics") || (el.innerText ? el.innerText.trim().slice(0, 60) : undefined);
      const element = elementDescriptor(el);
      // Only log if it is opted in or appears clickable
      const clickable = el.hasAttribute?.("data-analytics") || el.hasAttribute?.("data-analytics-name") || ["a", "button"].includes(el.tagName?.toLowerCase?.()) || el.getAttribute?.("role") === "button";
      if (!clickable) return;
      track({ type: "click", name, element, path: location.pathname + location.search });
    } catch (_) {}
  }, { capture: true });

  // Flush on visibility change / unload
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      flush(true);
    }
  });
  window.addEventListener("beforeunload", () => flush(true));

  // Expose global for debug
  if (typeof window !== "undefined") {
    window.__appAnalytics = { track, flush };
  }
}
