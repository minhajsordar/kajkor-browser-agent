import { useBuilderStore, type BuilderState } from './builderStore';

/**
 * Drop-in replacements for react-redux's `useSelector` / `useDispatch`, backed
 * by the Zustand builder store. Lets the builder components keep their existing
 * call sites: `const x = useSelector(s => s.pageBuilder.theme)` and
 * `const dispatch = useDispatch(); dispatch(setSelectedUid(uid))`.
 */

export function useSelector<T>(selector: (state: BuilderState) => T): T {
  return useBuilderStore(selector);
}

type Thunk = () => void;

export function useDispatch(): (thunk: Thunk) => void {
  return (thunk: Thunk) => thunk();
}
