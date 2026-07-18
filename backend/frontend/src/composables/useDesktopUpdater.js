import { ref } from "vue";

// Shared singleton state for the Electron auto-updater. Wraps window.api.updater
// (electron-updater) so multiple components can read the same update status
// without re-registering IPC listeners.
const isElectron =
  typeof window !== "undefined" && !!window.api?.updater;

// idle | checking | available | downloading | downloaded | not-available | error
const status = ref("idle");
const latestVersion = ref("");
const percent = ref(0);
const errorMsg = ref("");
const currentVersion = ref("");

let registered = false;
let versionLoaded = false;

const loadVersion = async () => {
  if (!isElectron || versionLoaded) return;
  versionLoaded = true;
  try {
    currentVersion.value = (await window.api.app?.getVersion?.()) || "";
  } catch {
    /* ignore */
  }
};

const register = () => {
  if (!isElectron || registered) return;
  registered = true;
  const u = window.api.updater;
  u.onChecking(() => {
    status.value = "checking";
    errorMsg.value = "";
  });
  u.onAvailable((_e, info) => {
    status.value = "available";
    latestVersion.value = info?.version || "";
  });
  u.onNotAvailable(() => {
    status.value = "not-available";
  });
  u.onProgress((_e, p) => {
    status.value = "downloading";
    percent.value = Math.round(p?.percent || 0);
  });
  u.onDownloaded((_e, info) => {
    status.value = "downloaded";
    latestVersion.value = info?.version || latestVersion.value;
  });
  u.onError((_e, e) => {
    status.value = "error";
    errorMsg.value = e?.error || "Update error";
  });
};

const check = async () => {
  if (!isElectron) return { success: false, error: "not desktop" };
  status.value = "checking";
  errorMsg.value = "";
  try {
    return await window.api.updater.check();
  } catch (e) {
    status.value = "error";
    errorMsg.value = e?.message || "Update check failed";
    return { success: false, error: errorMsg.value };
  }
};

const install = () => {
  if (isElectron) window.api.updater.install();
};

export function useDesktopUpdater() {
  register();
  loadVersion();
  return {
    isElectron,
    status,
    latestVersion,
    percent,
    errorMsg,
    currentVersion,
    check,
    install,
  };
}
