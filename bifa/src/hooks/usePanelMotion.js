import { useTransform } from 'framer-motion';
import { computeNormDist } from '../lib/trackMath.js';

// Panels are rendered via .map(), so this can't live as a loop of
// useTransform() calls inside HorizontalTrack itself (that would call hooks
// a variable number of times — against the rules of hooks). Instead, each
// panel component calls this hook itself: one component instance per panel,
// a fixed three hook calls per instance, fully rules-compliant. Every value
// here is a plain function of the single shared `smoothProgress` motion
// value, so this stays a real MotionValue chain — no per-frame React
// re-renders, no per-frame DOM reads (see lib/trackMath.js).
export function usePanelMotion(smoothProgress, metricsRef, index) {
  const rotateY = useTransform(smoothProgress, (p) => computeNormDist(index, p, metricsRef.current) * -12);
  const scale = useTransform(smoothProgress, (p) => 1 - Math.abs(computeNormDist(index, p, metricsRef.current)) * 0.08);
  const z = useTransform(smoothProgress, (p) => -Math.abs(computeNormDist(index, p, metricsRef.current)) * 60);
  return { rotateY, scale, z };
}
