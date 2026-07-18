import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { api } from "@/boot/axios";

const isPassive = (n) => !!n?.isCampaign || n?.displayMode === "watermark";
const countUnread = (list) => list.filter((n) => isPassive(n) || !n.isRead).length;

export const useNotificationStore = defineStore("notification", () => {
  const inbox = ref([]);
  const unreadCount = ref(0);
  const loading = ref(false);
  const seenIds = ref(new Set());
  let pollHandle = null;

  const sortedInbox = computed(() =>
    [...inbox.value].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
  );

  const freshUnseen = computed(() =>
    sortedInbox.value.filter(
      (n) => !seenIds.value.has(n.id) && (n.isCampaign || !n.isRead)
    )
  );

  const watermarkItems = computed(() =>
    sortedInbox.value.filter((n) => n.displayMode === "watermark")
  );

  const fetchInbox = async () => {
    try {
      loading.value = true;
      const res = await api.request({
        method: "GET",
        url: "/api/notification/inbox",
        params: { limit: 200 },
      });
      const list = res?.data?.data || [];
      inbox.value = list;
      unreadCount.value = countUnread(list);
    } catch (err) {
      // silent — polling
    } finally {
      loading.value = false;
    }
  };

  const startPolling = (intervalMs = 60000) => {
    stopPolling();
    fetchInbox();
    pollHandle = setInterval(fetchInbox, intervalMs);
  };
  const stopPolling = () => {
    if (pollHandle) {
      clearInterval(pollHandle);
      pollHandle = null;
    }
  };

  const markSeen = (id) => {
    seenIds.value.add(id);
  };

  const markRead = async (id) => {
    try {
      await api.request({ method: "POST", url: `/api/notification/${id}/read` });
      const n = inbox.value.find((x) => x.id === id);
      if (n) n.isRead = true;
      unreadCount.value = countUnread(inbox.value);
    } catch (_) { /* noop */ }
  };

  const markAllRead = async () => {
    try {
      await api.request({ method: "POST", url: "/api/notification/read-all" });
      inbox.value.forEach((n) => {
        if (!isPassive(n)) n.isRead = true;
      });
      unreadCount.value = countUnread(inbox.value);
    } catch (_) { /* noop */ }
  };

  const dismiss = async (id) => {
    try {
      await api.request({ method: "POST", url: `/api/notification/${id}/dismiss` });
      const idx = inbox.value.findIndex((n) => n.id === id);
      if (idx >= 0 && !isPassive(inbox.value[idx])) inbox.value.splice(idx, 1);
      unreadCount.value = countUnread(inbox.value);
    } catch (_) { /* noop */ }
  };

  const ack = async (id) => {
    try {
      await api.request({ method: "POST", url: `/api/notification/${id}/ack` });
      const n = inbox.value.find((x) => x.id === id);
      if (n) {
        n.isAcked = true;
        n.isRead = true;
      }
      unreadCount.value = countUnread(inbox.value);
    } catch (_) { /* noop */ }
  };

  const sendNotification = async (payload) => {
    const res = await api.request({
      method: "POST",
      url: "/api/notification",
      data: payload,
    });
    return res?.data;
  };

  return {
    inbox: sortedInbox,
    rawInbox: inbox,
    unreadCount,
    loading,
    seenIds,
    freshUnseen,
    watermarkItems,
    fetchInbox,
    startPolling,
    stopPolling,
    markSeen,
    markRead,
    markAllRead,
    dismiss,
    ack,
    sendNotification,
    isPassive,
  };
});
