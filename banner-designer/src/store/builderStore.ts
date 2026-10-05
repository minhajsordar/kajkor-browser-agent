import { create } from 'zustand';
import { emptyBannerContent } from '@/utils/bannerContent';

/**
 * Page builder state. Replaces the former Redux `pageBuilder` + `pageContent`
 * slices with a single Zustand store keyed the same way, so existing selectors
 * (`state.pageBuilder.*`, `state.pageContent.*`) keep working unchanged.
 *
 * Each browser window gets its own store instance. The preview iframe and the
 * parent window stay in sync via the existing postMessage bridge
 * (ParentState.tsx / IframeState.tsx), which calls the full-replace actions
 * `updateBuilderState` / `updatePageContentState`.
 */

const pageBuilderDefaults = {
  breakpoint: 'screenDefault',
  cssHelperMediaQuery: 'default',
  theme: 'light',
  width: '1200px',
  height: '628px',
  zoom: 'fit',
  selectedUid: 'body',
  insertIntoUid: null,
  dropUid: null,
  dropIndex: null,
};

function initialPageBuilder() {
  if (typeof localStorage === 'undefined') {
    return { ...pageBuilderDefaults };
  }
  const stored = localStorage.getItem('banner_builder');
  return stored ? JSON.parse(stored) : { ...pageBuilderDefaults };
}

export interface BuilderState {
  pageBuilder: any;
  pageContent: { pageContentSet: any; draftPageContentSet: any };
  /** Undo stack of pageContent snapshots (deep copies). Parent window's
   * history is the real one; the iframe accumulates a mirror harmlessly. */
  history: { past: any[]; future: any[] };
}

const HISTORY_LIMIT = 50;
export { HISTORY_LIMIT };

const initialContent = emptyBannerContent();

export const useBuilderStore = create<BuilderState>(() => ({
  pageBuilder: initialPageBuilder(),
  pageContent: { pageContentSet: initialContent, draftPageContentSet: initialContent },
  history: { past: [], future: [] },
}));
