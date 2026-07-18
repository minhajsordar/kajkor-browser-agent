<template>
  <q-layout view="lHh Lpr lff" container style="height: 100vh" class="shadow-2 text-xs">
    <q-header bordered :class="['bg-white text-black']">
      <q-toolbar>
        <q-btn flat @click="drawer = !drawer" round dense icon="menu" />
        <div class="relative">
          <q-img :src="'/logo.png'" style="width: 24px; height: 24px" class="relative top-0 left-0 z-0" />
          <q-img :src="siteSettingsStore?.siteSettings?.data?.site_image" style="width: 24px; height: 24px"
            class="absolute top-0 left-0 z-1" />
        </div>
        <q-toolbar-title class="!font-bold !px-0">
          <div style="max-width: 200px; min-width: 160px" class="!inline-block !ml-2 !align-middle">
            <SwitchBranchInput v-model="headerBranchId" returnType="id" :allBranch="false" />
          </div>
        </q-toolbar-title>
        <q-btn color="primary" to="/dashboard/pos" label="Pos" unelevated />
        <q-btn class="q-ml-sm" color="grey-8" round dense flat icon="refresh" @click="hardReload">
          <q-tooltip>Hard reload (refresh the app)</q-tooltip>
        </q-btn>
        <q-btn v-if="isElectron" class="q-ml-sm" color="teal" round dense flat :loading="syncing"
          :icon="syncing ? undefined : 'sync'" no-caps @click="manualSync">
          <q-tooltip v-if="lastSyncAt">Last sync: {{ lastSyncLabel }}</q-tooltip>
        </q-btn>
        <q-btn-dropdown v-if="hasBackup" class="q-ml-sm" color="blue-grey-7" round dense flat :loading="backupBusy"
          icon="backup">
          <q-tooltip>Backup / Restore database</q-tooltip>
          <q-list>
            <q-item clickable v-close-popup @click="backupExport">
              <q-item-section avatar><q-icon name="save" color="primary" /></q-item-section>
              <q-item-section><q-item-label>Backup database…</q-item-label></q-item-section>
            </q-item>
            <q-item clickable v-close-popup @click="backupRestore">
              <q-item-section avatar><q-icon name="restore" color="warning" /></q-item-section>
              <q-item-section><q-item-label>Restore from backup…</q-item-label></q-item-section>
            </q-item>
          </q-list>
        </q-btn-dropdown>
        <q-btn v-if="updater.isElectron" class="q-ml-sm" :color="updateBtnColor" round dense flat
          :loading="updater.status.value === 'checking'" :icon="updateBtnIcon" no-caps @click="onCheckUpdate">
          <q-badge v-if="updateReady" floating rounded color="red" style="padding: 4px" />
          <q-tooltip>{{ updateTooltip }}</q-tooltip>
        </q-btn>
        <NotificationBell class="q-ml-sm" />
        <div class="!hidden md:!flex gap-1">
          <!-- {{ show online status }} -->
          <q-btn-dropdown class="hide-ri" flat dense no-caps>
            <template v-slot:label>
              <div class="!hidden md:!block">
                <q-chip>
                  <div class="!hidden md:!inline">
                    {{
                      (
                        userAuthStore?.userData?.name ||
                        userAuthStore?.userData?.email ||
                        ""
                      )
                        .slice(0, 2)
                        .toUpperCase()
                    }}
                  </div>
                </q-chip>
              </div>
              <q-avatar size="md" class="!block md:!hidden">
                <img src="https://cdn.quasar.dev/img/boy-avatar.png" />
              </q-avatar>
            </template>
            <q-list style="min-width: 100px">
              <q-item>
                <q-item-section>
                  <div>
                    {{ userAuthStore?.userData?.name }}
                  </div>
                  <div>
                    {{ userAuthStore?.userData?.email }}
                  </div>
                </q-item-section>
              </q-item>
              <q-item clickable v-close-popup :to="`/dashboard/user/${userAuthStore.userData?.id}`">
                <q-item-section>Profile</q-item-section>
              </q-item>
              <q-separator />
              <q-item clickable v-close-popup>
                <q-item-section class="text-red font-bold" @click="userAuthStore.signOut">Sign out</q-item-section>
              </q-item>
            </q-list>
          </q-btn-dropdown>
          <q-btn class="!hidden md:!block" color="primary" @click="$q.fullscreen.toggle()" square
            :icon="$q.fullscreen.isActive ? 'fullscreen_exit' : 'fullscreen'" unelevated />
        </div>
        <div class="!block md:!hidden">
          <!-- {{ show online status }} -->
          <q-btn-dropdown class="hide-ri" dense unelevated size="md" icon="smart_display" color="red">
            <VideoList />
          </q-btn-dropdown>
          <q-btn icon="more_horiz" unelevated dense @click="() => (miniScreenRightDrawer = !miniScreenRightDrawer)" />
          <q-drawer class="dradar" side="right" v-model="miniScreenRightDrawer" :width="265" :breakpoint="500" elevated
            bordered :class="[' bg-white text-black left-drawer']">
            <q-scroll-area :thumb-style="{
              right: '4px',
              borderRadius: '5px',
              background: 'var(--q-primary)',
              width: '10px',
              opacity: 0.2,
            }" style="height: calc(100% - 54px); margin-top: 54px">
              <q-list :bordered="false">
                <q-item class="q-pa-none" v-if="userAuthStore?.userData" clickable v-close-popup
                  :to="`/dashboard/user/${userAuthStore.userData?.id}`">
                  <q-btn flat size="md" class="full-width" align="left" no-caps>
                    <div class="flex items-center gap-4">
                      <div class="!inline">
                        {{
                          userAuthStore?.userData?.name ||
                          userAuthStore?.userData?.email
                        }}
                      </div>
                      <q-avatar size="xs">
                        <img src="https://cdn.quasar.dev/img/boy-avatar.png" />
                      </q-avatar>
                    </div>
                  </q-btn>
                </q-item>
                <q-separator />
                <q-item class="q-pa-none" clickable v-close-popup>
                  <q-btn flat size="md" class="full-width" align="left" no-caps
                    :to="`/dashboard/user/${userAuthStore.userData?.id}`">
                    <div style="width: 200px; text-align: left">
                      <div>Profile</div>
                    </div>
                  </q-btn>
                </q-item>
                <q-separator />
                <q-item class="q-pa-none" v-if="userAuthStore?.userData">
                  <q-btn flat size="md" class="full-width text-weight-bold text-red-7" align="left" no-caps
                    icon="logout" @click="userAuthStore.signOut">
                    <div style="padding-left: 8px; width: 200px; text-align: left">
                      <div>Sign out</div>
                    </div>
                  </q-btn>
                </q-item>
              </q-list>
            </q-scroll-area>
          </q-drawer>
        </div>
      </q-toolbar>
    </q-header>
    <q-drawer v-model="drawer" show-if-above :mini="!drawer || miniState" @click.capture="drawerClick" :width="265"
      :breakpoint="500" bordered :class="[' bg-white text-black left-drawer']">
      <q-scroll-area :thumb-style="{
        right: '4px',
        borderRadius: '5px',
        background: 'var(--q-primary)',
        width: '10px',
        opacity: 0.2,
      }" style="height: calc(100% - 54px); margin-top: 54px">
        <q-list :bordered="false">
          <template v-for="(menu, index) in sidebarMenuLinks" :key="index">
            <template v-if="menu?.label">
              <div v-if="menu?.label" class="q-pa-none">
                <span v-show="!miniState" style="padding-left: 18px">{{
                  menu.label
                }}</span>
              </div>
              <q-separator />
            </template>
            <template v-else-if="shouldShowMenu(menu)">
              <q-item v-if="!menu?.sub" class="q-px-sm w-full">
                <q-btn unelevated size="md" :to="menu?.link || '#'" :class="[
                  `${menu.link === $route.path ? 'text-white bg-primary' : ''} !w-full`,
                ]" no-caps>
                  <div class="flex !w-full justify-start items-center gap-2"
                    :class="[miniState ? 'w-[24px] justify-center' : '']">
                    <img class="" style="width: 18px; height: 18px" :src="menu?.png" />
                    <span v-show="!miniState">{{ menu?.title }}</span>
                    <q-tooltip v-if="miniState" class="bg-cyan text-body2" transition-show="scale"
                      transition-hide="scale">
                      {{ menu?.title }}
                    </q-tooltip>
                  </div>
                </q-btn>
              </q-item>
              <q-expansion-item v-if="menu?.sub" class="q-px-sm text-weight-bold" group="somegroup" expand-separator
                :hide-expand-icon="miniState" :default-opened="menu.sub.some((e) => e.link === $route.path)"
                :header-class="[
                  menu.sub.some((e) => e.link === $route.path)
                    ? 'text-primary'
                    : '',
                  'text-sm',
                ]">
                <template v-slot:header="header">
                  <div class="flex w-full items-center gap-2" :class="[miniState ? 'w-[24px] justify-center' : '']">
                    <img :class="[
                      `${menu.sub.some((e) => e.link === $route.path) ? '' : ''}`,
                    ]" style="width: 18px; height: 18px" :src="menu?.png" />
                    <span v-show="!miniState">{{ menu?.title }}</span>
                    <q-badge v-show="!miniState && menu?.badge">{{
                      menu?.badge
                    }}</q-badge>
                    <q-tooltip v-if="miniState" class="bg-cyan text-body2" transition-show="scale"
                      transition-hide="scale">
                      {{ menu?.title }}
                    </q-tooltip>
                  </div>
                </template>
                <q-list :bordered="false" class="border-top-1">
                  <template v-for="(sub, subIndex) in menu.sub" :key="String(index) + String(subIndex)">
                    <template v-if="sub.permissionSlug ? checkSubMenuShowPermission(sub) : true">
                      <q-item class="q-pa-none">
                        <q-btn unelevated size="md" :to="sub?.link || '#'" :label="sub?.title"
                          class="full-width text-weight-regular" :class="[
                            `${sub.link === $route.path ? 'bg-primary text-white' : ''}`,
                          ]" align="left" no-caps style="padding-left: 40px"></q-btn>
                      </q-item>
                    </template>
                  </template>
                </q-list>
              </q-expansion-item>
              <!-- 
              <q-separator/> -->
            </template>
          </template>
          <q-item class="q-pa-none" v-if="userAuthStore?.userData">
            <q-btn flat size="md" class="full-width text-weight-bold text-red-7" align="left" no-caps icon="logout"
              @click="userAuthStore.signOut">
              <div v-show="!miniState" style="padding-left: 8px; width: 200px; text-align: left">
                <div>Sign out</div>
                <div>
                  {{
                    userAuthStore?.userData?.name ||
                    userAuthStore?.userData?.email
                  }}
                </div>
              </div>
            </q-btn>
          </q-item>
          <q-item class="q-pa-none w-full flex justify-center">
              <a href="https://softrking.com" target="_blank" rel="noopener noreferrer">
                <q-btn flat size="md" class="full-width text-weight-bold text-blue-7" align="left" no-caps>
                  softrking.com
                </q-btn>
              </a>
          </q-item>
        </q-list>
      </q-scroll-area>
      <!--
            in this case, we use a button (can be anything)
            so that user can switch back
            to mini-mode
          -->
      <div class="absolute-top border-b" style="height: 51px">
        <div class="absolute-bottom bg-transparent">
          <div class="q-item flex justify-between items-center no-wrap">
            <router-link to="/dashboard">
              <div class="flex items-center gap-2" v-show="!miniState">
                <q-img src="/icons/speedometer.png" style="width: 18px; height: 18px" />
                <div class="font-bold text-[16px] w-[148px]">Dashboard</div>
              </div>
            </router-link>
            <div v-show="miniState">
              <q-btn dense round unelevated icon="keyboard_double_arrow_right" @click="miniState = true" />
            </div>
            <div class="q-mini-drawer-hide">
              <q-btn dense round unelevated icon="keyboard_double_arrow_left" @click="miniState = true" />
            </div>
          </div>
        </div>
      </div>
    </q-drawer>
    <q-page-container class="bg-blue-100/40">
      <q-page>
        <NotificationCenter />
        <!-- Desktop-only branch opened on the web: show a message instead of
             the app. Keep the header branch switcher so multi-branch users can
             switch to a web-enabled branch. -->
        <div v-if="platformBlocked" class="flex flex-center" style="min-height: calc(100vh - 120px)">
          <q-card flat bordered class="q-pa-lg text-center" style="max-width: 460px">
            <q-icon name="desktop_windows" color="primary" size="56px" />
            <div class="text-h6 q-mt-md">Desktop app required</div>
            <div class="text-body2 text-grey-8 q-mt-sm">
              Your subscription plan supports the Desktop app only for this
              branch. Please use the desktop application to access it.
            </div>
            <div class="q-mt-lg flex flex-center q-gutter-sm">
              <q-btn outline color="negative" icon="logout" label="Logout" no-caps @click="userAuthStore.signOut" />
            </div>
          </q-card>
        </div>
        <router-view v-else />
      </q-page>
    </q-page-container>
    <SoundSection />

    <!-- Desktop app update dialog -->
    <q-dialog v-model="showUpdateDialog" persistent>
      <q-card style="min-width: 340px">
        <q-card-section class="row items-center q-gutter-sm">
          <q-icon name="system_update" color="primary" size="28px" />
          <div class="text-h6">App Update</div>
        </q-card-section>
        <q-separator />
        <q-card-section>
          <div v-if="updater.status.value === 'available'">
            Version <strong>{{ updater.latestVersion.value }}</strong> is available. Downloading…
            <q-linear-progress indeterminate color="primary" class="q-mt-sm" />
          </div>
          <div v-else-if="updater.status.value === 'downloading'">
            Downloading version <strong>{{ updater.latestVersion.value }}</strong>…
            <q-linear-progress :value="updater.percent.value / 100" color="primary" class="q-mt-sm" />
            <div class="text-caption text-grey-7 q-mt-xs">{{ updater.percent.value }}%</div>
          </div>
          <div v-else-if="updater.status.value === 'downloaded'">
            Version <strong>{{ updater.latestVersion.value }}</strong> is ready to install.
            The app will restart to apply the update.
          </div>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Later" color="grey-8" v-close-popup
            :disable="updater.status.value === 'downloaded' ? false : false" />
          <q-btn v-if="updater.status.value === 'downloaded'" unelevated color="primary" label="Restart & Install"
            @click="updater.install()" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-layout>
</template>
<script setup>
import sidebarMenuLinks from "@/constants/sidebarMenuLinks.js";
import SoundSection from "@/components/SoundSection.vue";
import VideoList from "@/pages/dashboard/video-courses/VideoList.vue";
import SwitchBranchInput from "@/components/input/SwitchBranchInput.vue";
import NotificationBell from "@/components/notification/NotificationBell.vue";
import NotificationCenter from "@/components/notification/NotificationCenter.vue";
import { ref, computed, onMounted, watch } from "vue";
import { useUserAuthStore } from "@/stores/userAuthStore.js";
import { useSiteSettingsStore } from "@/stores/siteSettingsStore.js";
import { useMeta, useQuasar } from "quasar";
import { useRoute } from "vue-router";
import { useDesktopUpdater } from "@/composables/useDesktopUpdater.js";

const $q = useQuasar();
const userAuthStore = useUserAuthStore();

// Desktop app updater (electron-updater via IPC).
const updater = useDesktopUpdater();
const manualCheck = ref(false);
const updateReady = computed(() =>
  ["available", "downloading", "downloaded"].includes(updater.status.value)
);
const updateBtnColor = computed(() =>
  updater.status.value === "downloaded" ? "positive" : "primary"
);
const updateBtnIcon = computed(() =>
  updater.status.value === "downloaded" ? "system_update_alt" : "browser_updated"
);
const updateTooltip = computed(() => {
  switch (updater.status.value) {
    case "downloaded": return "Update ready — click to install";
    case "downloading": return "Downloading update…";
    case "available": return "Update available — downloading";
    default: return "Check for updates";
  }
});
const showUpdateDialog = ref(false);
watch(
  () => updater.status.value,
  (s) => {
    if (["available", "downloading", "downloaded"].includes(s)) {
      showUpdateDialog.value = true;
    }
    if (manualCheck.value && s === "not-available") {
      manualCheck.value = false;
      $q.notify({ color: "positive", message: "You're on the latest version.", position: "top" });
    }
    if (manualCheck.value && s === "error") {
      manualCheck.value = false;
      $q.notify({ color: "negative", message: updater.errorMsg.value || "Update check failed", position: "top" });
    }
  }
);
const onCheckUpdate = async () => {
  if (updater.status.value === "downloaded") {
    showUpdateDialog.value = true;
    return;
  }
  manualCheck.value = true;
  await updater.check();
};

// Desktop-only manual sync (embedded sync engine via Electron IPC).
const isElectron =
  typeof window !== "undefined" && !!window.api?.sync;
const syncing = ref(false);
const lastSyncAt = ref(null);
const lastSyncLabel = computed(() =>
  lastSyncAt.value ? new Date(lastSyncAt.value).toLocaleString() : ""
);
const refreshSyncStatus = async () => {
  if (!isElectron) return;
  try {
    const s = await window.api.sync.getStatus();
    lastSyncAt.value = s?.lastSyncAt || lastSyncAt.value;
    syncing.value = !!s?.running;
  } catch {
    /* ignore */
  }
};
// Desktop-only local database backup / restore (Electron IPC).
const hasBackup =
  typeof window !== "undefined" && !!window.api?.backup;
const backupBusy = ref(false);
const backupExport = async () => {
  if (!hasBackup || backupBusy.value) return;
  backupBusy.value = true;
  try {
    const r = await window.api.backup.export();
    if (r?.canceled) return;
    $q.notify({
      color: r?.success ? "positive" : "negative",
      message: r?.success
        ? `Backup saved: ${r.documents} records from ${r.collections} tables`
        : `Backup failed: ${r?.error || "unknown"}`,
      position: "top",
    });
  } catch (e) {
    $q.notify({ color: "negative", message: e?.message || "Backup failed", position: "top" });
  } finally {
    backupBusy.value = false;
  }
};
const backupRestore = async () => {
  if (!hasBackup || backupBusy.value) return;
  $q.dialog({
    title: "Restore from backup",
    message:
      "This REPLACES the current local data on this device with the backup file, then re-syncs with the cloud. Continue?",
    cancel: true,
    persistent: true,
    ok: { label: "Restore", color: "warning" },
  }).onOk(async () => {
    backupBusy.value = true;
    try {
      const r = await window.api.backup.import();
      if (r?.canceled) return;
      $q.notify({
        color: r?.success ? "positive" : "negative",
        message: r?.success
          ? `Restored ${r.documents} records into ${r.collections} tables. Re-syncing…`
          : `Restore failed: ${r?.error || "unknown"}`,
        position: "top",
      });
      if (r?.success) await refreshSyncStatus();
    } catch (e) {
      $q.notify({ color: "negative", message: e?.message || "Restore failed", position: "top" });
    } finally {
      backupBusy.value = false;
    }
  });
};

// Hard reload the app. Works in the browser and inside the Electron renderer
// (window.location.reload reloads the window in both). Prefer the desktop
// bridge when present so it can bypass HTTP cache. Confirm first so an
// accidental click doesn't drop an unsaved cart.
const hardReload = () => {
  $q.dialog({
    title: "Reload app",
    message: "Refresh the whole app now? Any unsaved cart/form data will be lost.",
    cancel: true,
    persistent: true,
    ok: { label: "Reload", color: "negative" },
  }).onOk(() => {
    if (typeof window !== "undefined" && window.api?.reload) {
      window.api.reload();
    } else {
      window.location.reload();
    }
  });
};

const manualSync = async () => {
  if (!isElectron || syncing.value) return;
  syncing.value = true;
  try {
    const r = await window.api.sync.trigger();
    const hasRejects = Number(r?.rejected) > 0;
    $q.notify({
      color: r?.success ? (hasRejects ? "warning" : "positive") : "negative",
      message: r?.success
        ? `Sync: sent ${r.pushed}, accepted ${r.applied ?? r.pushed}` +
        (hasRejects ? `, rejected ${r.rejected}` : "") +
        `, pulled ${r.pulled}`
        : `Sync failed: ${r?.error || "unknown"}`,
      position: "top",
    });
    await refreshSyncStatus();
  } catch (e) {
    $q.notify({ color: "negative", message: e?.message || "Sync failed", position: "top" });
  } finally {
    syncing.value = false;
  }
};
const siteSettingsStore = useSiteSettingsStore();
// A branch set to "desktop only" must not be used on the web. When the app is
// NOT running in Electron (no window.api), show a message page instead.
const platformBlocked = computed(
  () =>
    siteSettingsStore?.siteSettings?.data?.platformAccess === "desktop" &&
    !isElectron
);
const miniState = ref(false);
const drawer = ref(true);
const miniScreenRightDrawer = ref(false);
const headerBranchId = ref(
  userAuthStore?.userData?.selectedBranch ||
  userAuthStore?.userData?.branchId ||
  ""
);
watch(
  () => userAuthStore?.userData?.selectedBranch,
  (v) => {
    if (v !== undefined && v !== headerBranchId.value) headerBranchId.value = v;
  }
);
watch(headerBranchId, (v) => {
  if (v === undefined || v === null) return;
  if (v === userAuthStore?.userData?.selectedBranch) return;
  userAuthStore.setSelectedBranch?.(v);
});

useMeta(() => {
  return {
    title: `${siteSettingsStore?.siteSettings?.data?.name || ""} | Bonik Sheba`,
    description: "Bonik Sheba POS",
  };
});

function drawerClick(e) {
  // console.log("clicked")
  // if in "mini" state and user
  // click on drawer, we switch it to "normal" mode
  if (miniState.value) {
    miniState.value = false;
    // notice we have registered an event with capture flag;
    // we need to stop further propagation as this click is
    // intended for switching drawer to "normal" mode only
    e.stopPropagation();
  }
}
function checkSubMenuShowPermission(sub) {
  // No permissionSlug on a sub item = always visible.
  if (!sub?.permissionSlug) return true;
  return !!userAuthStore?.userData?.permissions?.includes(
    `${sub?.permissionSlug}`
  );
}
function shouldShowMenu(menu) {
  // Parent with children: show only if at least one child is visible.
  if (menu?.sub) {
    return menu.sub.some((sub) => checkSubMenuShowPermission(sub));
  }
  // Leaf without permissionSlug = always visible.
  if (!menu?.permissionSlug) return true;
  return !!userAuthStore?.userData?.permissions?.includes(
    `${menu?.permissionSlug}`
  );
}
onMounted(() => {
  userAuthStore.validateLogin();
  userAuthStore.getUserDataFromSessionStorage();
  siteSettingsStore.getSiteSettings();
  refreshSyncStatus();
  const miniStateLocalStorage = localStorage.getItem("miniState");
  if (JSON.parse(miniStateLocalStorage)) {
    miniState.value = true;
  } else {
    miniState.value = false;
  }
  const drawerLocalStorage = localStorage.getItem("drawer");
  if (JSON.parse(drawerLocalStorage)) {
    drawer.value = true;
  } else {
    drawer.value = false;
  }
});
watch(drawer, function () {
  console.log("Drawer changed: ", drawer.value);
  localStorage.setItem("drawer", drawer.value);
});
watch(miniState, function () {
  localStorage.setItem("miniState", miniState.value);
});
</script>
<style>
.q-item .q-item__section--avatar {
  min-width: 32px;
  padding-right: 0px;
}
</style>
