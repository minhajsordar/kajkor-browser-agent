import { useEffect } from 'react'

export function useDebounceEffect(
  fn: (...args: any[]) => void, // function type with any arguments and no return value
  waitTime: number, // number type for the debounce delay
  deps: any[] // array of dependencies
) {
  useEffect(() => {
    const t = setTimeout(() => {
      fn.apply(undefined, deps);
    }, waitTime);

    return () => {
      clearTimeout(t);
    };
  }, deps || []);
}
