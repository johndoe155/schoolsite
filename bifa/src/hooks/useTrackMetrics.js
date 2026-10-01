import { useRef, useEffect, useState } from 'react';
import { measureTrack } from '../lib/trackMath.js';

// Measures track layout (panel offsets/widths, sticky width, max scroll
// distance) once on mount and again whenever the wrapper resizes — never on
// a scroll tick. The metrics live in a ref (metricsRef) so the per-frame
// scroll-linked math in HorizontalTrack.jsx can read the *current* value
// inside a useTransform callback without that callback needing to be
// recreated (and without a resize triggering a React re-render of anything
// that doesn't actually need one). `version` is exposed only so callers can
// key a one-off effect (e.g. re-clamping scroll position) off metrics
// actually changing, without themselves needing to read the ref.
export function useTrackMetrics(wrapperRef, stickyRef) {
  const metricsRef = useRef(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const wrapperEl = wrapperRef.current;
    const stickyEl = stickyRef.current;
    if (!wrapperEl || !stickyEl) return undefined;

    const remeasure = () => {
      metricsRef.current = measureTrack(wrapperEl, stickyEl);
      setVersion((v) => v + 1);
    };

    remeasure();

    let frame = null;
    const debouncedRemeasure = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(remeasure);
    };

    const ro = new ResizeObserver(debouncedRemeasure);
    ro.observe(wrapperEl);
    ro.observe(stickyEl);
    window.addEventListener('orientationchange', debouncedRemeasure);

    return () => {
      ro.disconnect();
      window.removeEventListener('orientationchange', debouncedRemeasure);
      if (frame) cancelAnimationFrame(frame);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { metricsRef, version };
}
