// src/lib/damp.js
// ----------------------------------------------------------------------------
// Exponential-decay damper: current value eases toward target with a given
// half-life in seconds, using real elapsed time (dt) rather than a fixed
// per-tick blend factor. This is the exact fix the original vanilla build
// applied (as window.BIC.dampTowards) after noticing its rAF loops used a
// FIXED factor like `current += (target - current) * 0.12` every frame —
// which implicitly assumes a fixed tick rate. At 60Hz that runs ~60x/sec; on
// a 120Hz display the same loop runs twice as often, so motion converges
// roughly twice as fast purely because of the display, not any deliberate
// tuning. Feeding a real dt in makes convergence speed read identically
// regardless of refresh rate. Used directly inside R3F's useFrame (which
// hands back a real per-frame delta) for the medallion's pointer-tilt and
// the particle field's spring-toward-home simulation.
export function dampTowards(current, target, halfLife, dt) {
  if (dt <= 0) return current;
  const decay = Math.pow(2, -dt / Math.max(halfLife, 0.0001));
  return target + (current - target) * decay;
}
