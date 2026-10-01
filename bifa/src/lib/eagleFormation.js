// src/lib/eagleFormation.js
// ----------------------------------------------------------------------------
// Builds the resting ("home") position every particle springs toward. The
// previous version placed particles along one bare quarter-circle arc per
// wing -- two symmetric lines meeting at the origin, uniformly spaced, with
// a fixed sin/cos-of-index jitter for texture. It read as a generic point
// arc rather than a bird.
//
// This version composes four intentional parts instead of one uniform
// sweep: a torso+head column, a small tail fan, and two wings that (a) bias
// particle density toward the root the way real covert feathers cluster
// near the shoulder while primaries spread out toward the tip, (b) rise
// into a soaring mid-wing arc before drooping at the tip, and (c) splay
// their outermost particles into distinct feather "fingers" rather than
// tapering to a single point. The old deterministic sin(i * k)-style index
// jitter is replaced by real Simplex noise sampled in each particle's own
// position, so nearby particles scatter together instead of each one
// wobbling independently -- the same noise primitive used for the swarm's
// idle motion in EagleParticles.jsx, applied here to the resting shape.
// ----------------------------------------------------------------------------
import { SimplexNoise } from 'three/addons/math/SimplexNoise.js';

const shapeNoise = new SimplexNoise();
const SCATTER_FREQ = 2.3;
const SCATTER_AMOUNT = 0.05;

function scatter(x, y, z) {
  const nx = shapeNoise.noise3d(x * SCATTER_FREQ + 7.7, y * SCATTER_FREQ, z * SCATTER_FREQ);
  const ny = shapeNoise.noise3d(x * SCATTER_FREQ, y * SCATTER_FREQ + 7.7, z * SCATTER_FREQ);
  const nz = shapeNoise.noise3d(x * SCATTER_FREQ, y * SCATTER_FREQ, z * SCATTER_FREQ + 7.7);
  return [x + nx * SCATTER_AMOUNT, y + ny * SCATTER_AMOUNT, z + nz * SCATTER_AMOUNT];
}

// Biases a uniform 0..1 sweep so more particles land near u=0. Used to give
// the wing more density at the root (shoulder coverts) than the tip
// (spread primaries), rather than uniform arc spacing.
function rootWeightedT(u) {
  return Math.pow(u, 1.55);
}

const BODY_FRACTION = 0.15;
const TAIL_FRACTION_OF_BODY = 0.32;

function bodyHome(localI, localCount) {
  const tailCount = Math.max(Math.round(localCount * TAIL_FRACTION_OF_BODY), 3);

  if (localI < tailCount) {
    // A small fan trailing below and behind the torso.
    const tt = tailCount <= 1 ? 0 : localI / (tailCount - 1);
    const spread = (tt - 0.5) * 0.5;
    return [spread, -0.52 - tt * 0.26, -0.22 - tt * 0.4];
  }

  // Torso tapering up into a head that leans slightly toward the camera.
  const torsoCount = Math.max(localCount - tailCount, 1);
  const bi = localI - tailCount;
  const bt = torsoCount <= 1 ? 0 : bi / (torsoCount - 1);
  const x = Math.sin(bt * Math.PI * 1.3) * 0.045;
  const y = -0.34 + bt * 0.92;
  const z = 0.05 + Math.pow(bt, 1.5) * 0.26;
  return [x, y, z];
}

function wingHome(localI, localCount, side) {
  const u = localCount <= 1 ? 0 : localI / (localCount - 1);
  const t = rootWeightedT(u);
  const lane = (localI % 5 - 2) / 2; // -1..1, five parallel feather lanes

  const spanX = 1.75;
  const spanZ = 1.05;
  const rootOffset = 0.1;
  const rootRise = 0.28;
  const midLift = 0.32;
  const tipDroop = 0.55;

  let x = side * (rootOffset + t * spanX);
  let y = rootRise + Math.sin(Math.PI * t) * midLift - Math.pow(t, 2.2) * tipDroop;
  let z = -Math.pow(t, 1.6) * spanZ - 0.05;

  // Feather-row thickness: spreads the five lanes across the wing's chord,
  // tapering to zero at both the root and the tip, so the wing resolves as
  // a filled band rather than a single-particle-wide line.
  const chord = Math.sin(Math.PI * Math.pow(t, 0.8)) * 0.16;
  y += lane * chord * 0.5;
  z += lane * chord * 0.9;

  // Past 85% span the lanes stop tracing the chord and splay outward into
  // distinct fingers, like a soaring raptor's spread primary feathers.
  if (t > 0.85) {
    const ft = (t - 0.85) / 0.15;
    const angle = lane * 0.5;
    x += side * Math.sin(angle) * ft * 0.32;
    y += (Math.cos(angle) - 1) * ft * 0.3 - ft * ft * 0.1;
    z -= Math.abs(lane) * ft * 0.12;
  }

  return [x, y, z];
}

export function eagleHome(i, count) {
  const bodyCount = Math.max(Math.round(count * BODY_FRACTION), 8);
  const wingTotal = count - bodyCount;
  const leftCount = Math.floor(wingTotal / 2);
  const rightCount = wingTotal - leftCount;

  let x, y, z;
  if (i < bodyCount) {
    [x, y, z] = bodyHome(i, bodyCount);
  } else {
    const wingI = i - bodyCount;
    if (wingI < leftCount) {
      [x, y, z] = wingHome(wingI, leftCount, -1);
    } else {
      [x, y, z] = wingHome(wingI - leftCount, rightCount, 1);
    }
  }

  return scatter(x, y, z);
}

export function buildEagleHomes(count) {
  const homes = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const [x, y, z] = eagleHome(i, count);
    homes[i * 3] = x;
    homes[i * 3 + 1] = y;
    homes[i * 3 + 2] = z;
  }
  return homes;
}
