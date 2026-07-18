import { computed, onMounted } from "vue";
import { useSiteSettingsStore } from "@/stores/siteSettingsStore.js";
import { useBusinessProfileStore } from "@/stores/businessProfileStore.js";
import {
  unionShowFlags,
  isUnrestricted,
} from "@/utils/businessProfile.js";

// Branch business-profile-driven UI gating, shared across sale + purchase item
// forms. Legacy/no-profile branches stay unrestricted (current UI unchanged).
//
// Pass { autoFetch: false } if the caller already fetches profiles itself.
export function useBranchProfileFlags(options = {}) {
  const { autoFetch = true } = options;
  const siteSettingsStore = useSiteSettingsStore();
  const businessProfileStore = useBusinessProfileStore();

  const branchProfiles = computed(() => {
    const ids = siteSettingsStore?.siteSettings?.data?.businessProfileIds || [];
    return businessProfileStore.getByIds(ids);
  });

  const profileUnrestricted = computed(() =>
    isUnrestricted(branchProfiles.value)
  );
  const profileShowFlags = computed(() => unionShowFlags(branchProfiles.value));

  // Warranty fields show when the branch has no profile restriction OR at least
  // one selected profile (e.g. Electronics) turns warranty on.
  const showWarrantyFields = computed(
    () => profileUnrestricted.value || profileShowFlags.value.showWarrantyFields
  );

  if (autoFetch) {
    onMounted(() => {
      if (!businessProfileStore.loaded) businessProfileStore.fetchProfiles();
    });
  }

  return {
    branchProfiles,
    profileUnrestricted,
    profileShowFlags,
    showWarrantyFields,
  };
}
