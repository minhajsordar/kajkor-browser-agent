// composables/useUpdateSearchParams.js
import { useRoute, useRouter } from "vue-router";

const stripEmpty = (obj = {}) => {
  const out = {};
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v !== "" && v !== null && v !== undefined) out[k] = v;
  }
  return out;
};

export default function useUpdateSearchParams() {
  const route = useRoute();
  const router = useRouter();

  // Replace mode: caller's object becomes the entire query (after stripping
  // empty values). Use this for filter/pagination components that own the
  // full filter snapshot. Old keys not in queryObject get removed.
  // Returns the router.replace promise so callers can await navigation
  // completion (route.query reflects new state on next tick).
  const updateSearchParams = (queryObject = {}) => {
    const cleaned = stripEmpty(queryObject);
    return router
      .replace({ path: route.path, query: cleaned })
      .catch((err) => {
        if (err?.name !== "NavigationDuplicated") return;
        throw err;
      });
  };

  // Merge mode: only overrides provided keys; empty/null/undefined removes
  // that key. Other URL params untouched. Use when caller does NOT own full
  // query state.
  const mergeSearchParams = (queryObject = {}) => {
    const merged = { ...route.query };
    for (const k of Object.keys(queryObject)) {
      const v = queryObject[k];
      if (v === "" || v === null || v === undefined) delete merged[k];
      else merged[k] = v;
    }
    router
      .replace({ path: route.path, query: merged })
      .catch((err) => {
        if (err?.name !== "NavigationDuplicated") throw err;
      });
  };

  const updateSearchParamsShallow = (queryObject = {}) => {
    const merged = { ...route.query };
    for (const k of Object.keys(queryObject)) {
      const v = queryObject[k];
      if (v === "" || v === null || v === undefined) delete merged[k];
      else merged[k] = v;
    }
    const qs = new URLSearchParams(merged).toString();
    history.pushState({}, "", `${route.path}${qs ? "?" + qs : ""}`);
  };

  return {
    updateSearchParams,
    mergeSearchParams,
    updateSearchParamsShallow,
  };
}
