import { useState, useEffect } from 'react';

// Generic, SSR-safe media query hook. Used to replace the several ad hoc
// `window.matchMedia(...).matches` one-off checks scattered through the
// original vanilla build (reduced motion, coarse pointer, narrow viewport)
// with one small reactive primitive that also *updates* if the condition
// changes after mount (e.g. a user toggles reduced-motion in OS settings, or
// rotates a foldable/tablet across the 980px breakpoint) — the original's
// matchMedia checks ran once at script-init and never re-evaluated.
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(query).matches
      : false
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(query);
    const onChange = (e) => setMatches(e.matches);
    setMatches(mql.matches);
    if (mql.addEventListener) mql.addEventListener('change', onChange);
    else mql.addListener(onChange); // Safari < 14
    return () => {
      if (mql.removeEventListener) mql.removeEventListener('change', onChange);
      else mql.removeListener(onChange);
    };
  }, [query]);

  return matches;
}

export function usePrefersReducedMotion() {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}

export function useIsCoarsePointer() {
  return useMediaQuery('(pointer: coarse)');
}

export function useIsNarrowViewport(breakpoint = 980) {
  return useMediaQuery(`(max-width: ${breakpoint}px)`);
}
