import { useBuilderStore, HISTORY_LIMIT } from './builderStore';

/**
 * Drop-in replacements for the former Redux action creators. Each returns a
 * thunk so call sites stay identical: `dispatch(setSelectedUid(uid))`.
 * `dispatch` (see builderHooks) simply invokes the thunk.
 *
 * Every update produces a new object reference for the touched slice so that
 * `useSelector(s => s.pageBuilder)` / `s.pageContent` subscribers re-render —
 * this is what keeps the ParentState postMessage effects firing.
 */

type Thunk = () => void;

const setBuilder = (updater: (pb: any) => any) =>
  useBuilderStore.setState((s) => ({ pageBuilder: updater(s.pageBuilder) }));

// Maps a breakpoint key to its preview dimensions (ported from pageBuilderSlice).
const breakpointDimensions: Record<string, { cssHelperMediaQuery: string; width: string; height: string }> = {
  screen1920: { cssHelperMediaQuery: '1920px', width: '1920px', height: '100vh' },
  screen1440: { cssHelperMediaQuery: '1440px', width: '1440px', height: '100vh' },
  screen1280: { cssHelperMediaQuery: '1280px', width: '1280px', height: '100vh' },
  screenDefault: { cssHelperMediaQuery: 'default', width: '992px', height: '100vh' },
  screen991: { cssHelperMediaQuery: '991px', width: '768px', height: '100vh' },
  screen767: { cssHelperMediaQuery: '767px', width: '568px', height: '100vh' },
  screen478: { cssHelperMediaQuery: '478px', width: '320px', height: '100vh' },
};

// --- pageBuilder actions ---

export const setSelectedUid = (payload: any): Thunk => () =>
  setBuilder((pb) => ({ ...pb, selectedUid: payload }));

export const setInsertIntoUid = (payload: any): Thunk => () =>
  setBuilder((pb) => ({ ...pb, insertIntoUid: payload }));

export const setDropUidAndIndex = (payload: any): Thunk => () =>
  setBuilder((pb) => ({ ...pb, dropUid: payload.dropUid, dropIndex: payload.dropIndex }));

// Full-replace from the postMessage bridge.
export const updateBuilderState = (payload: any): Thunk => () =>
  useBuilderStore.setState({ pageBuilder: payload });

export const updatePageBreakPointPreview = (payload: any): Thunk => () =>
  setBuilder((pb) => {
    const dims = breakpointDimensions[payload.breakpoint] ?? breakpointDimensions.screenDefault;
    return { ...pb, breakpoint: payload.breakpoint, ...dims };
  });

// --- pageContent actions ---

// Records the previous pageContent into the undo stack before applying a
// new one — every content mutation funnels through here so gestures
// (style edit, insert, drag-commit, AI result) are each one undo step.
const commit = (next: any) =>
  useBuilderStore.setState((s) => ({
    history: {
      past: [...s.history.past, s.pageContent].slice(-HISTORY_LIMIT),
      future: [],
    },
    pageContent: next,
  }));

// Full-replace from the postMessage bridge.
export const updatePageContentState = (payload: any): Thunk => () => commit(payload);

export const undo = (): Thunk => () =>
  useBuilderStore.setState((s) => {
    if (!s.history.past.length) return s;
    const previous = s.history.past[s.history.past.length - 1];
    return {
      history: {
        past: s.history.past.slice(0, -1),
        future: [s.pageContent, ...s.history.future].slice(0, HISTORY_LIMIT),
      },
      pageContent: previous,
    };
  });

export const redo = (): Thunk => () =>
  useBuilderStore.setState((s) => {
    if (!s.history.future.length) return s;
    const next = s.history.future[0];
    return {
      history: {
        past: [...s.history.past, s.pageContent].slice(-HISTORY_LIMIT),
        future: s.history.future.slice(1),
      },
      pageContent: next,
    };
  });

export const updatePageContentSetByKey = (payload: any): Thunk => () => {
  const plain = JSON.parse(JSON.stringify(useBuilderStore.getState().pageContent));
  plain.draftPageContentSet[payload.key] = payload.value;
  commit(plain);
};

export const addPageBlock = (payload: any): Thunk => () => {
  const next = JSON.parse(JSON.stringify(useBuilderStore.getState().pageContent));
  next.draftPageContentSet[`${payload.uid}`].child.splice(payload.index, 0, `${payload.newElement.systemAddedClass}`);
  next.draftPageContentSet[`${payload.newElement.systemAddedClass}`] = payload.newElement;
  commit(next);
};
