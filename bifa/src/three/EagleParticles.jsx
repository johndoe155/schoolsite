import React, { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { SimplexNoise } from 'three/addons/math/SimplexNoise.js';
import { buildEagleHomes } from '../lib/eagleFormation.js';

// ----------------------------------------------------------------------------
// The original hero had a 2D canvas particle field (140 points, spring-to-home
// + pointer-repel physics) drawing an eagle-wing silhouette *behind* a
// separate vanilla-Three.js medallion — two different rendering technologies
// bolted together, sharing an anchor point only approximately. This is the
// same spring/repel physics, ported wholesale (SPRING/DAMPING/REPEL constants
// map directly), but as real points living in the same scene, same camera,
// same lights as the medallion — so it's one composition, not two.
//
// Two refinements on top of that port:
//  - The pointer-repel falloff was a rigid linear ramp (1 - dist/radius). It's
//    now smoothstep-eased, so the push cushions in and out instead of
//    starting/stopping abruptly at the repel radius.
//  - Once settled, particles used to sit dead still at their home position —
//    all motion was reactive, nothing was ambient. Each particle's target is
//    now its home position plus a slow-moving 4D Simplex noise offset (x, y,
//    z, and time), sampled in the particle's own space so neighbors drift in
//    the same slow eddies rather than shaking independently. The spring still
//    chases that (now gently moving) target with the same frame-rate-
//    independent integration as before, so the formation continuously
//    breathes instead of freezing once it arrives.
// ----------------------------------------------------------------------------

const VERTEX_SHADER = `
  attribute float aSize;
  attribute vec3 aColor;
  varying vec3 vColor;
  varying float vFade;
  void main() {
    vColor = aColor;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    float dist = -mvPosition.z;
    gl_PointSize = aSize * (6.0 / max(dist, 0.001));
    float t = smoothstep(3.0, 9.0, dist);
    vFade = 1.0 - t * 0.65;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const FRAGMENT_SHADER = `
  varying vec3 vColor;
  varying float vFade;
  void main() {
    vec2 uv = gl_PointCoord - vec2(0.5);
    float d = length(uv);
    float alpha = smoothstep(0.5, 0.02, d) * vFade;
    if (alpha < 0.02) discard;
    gl_FragColor = vec4(vColor, alpha);
  }
`;

const COUNT = 170;
const BRASS = new THREE.Color('#e7be5a');
const PAPER = new THREE.Color('#f3ecda');

// Same spring/damping/repel shape as the original's 2D field, retuned for
// world units instead of pixels.
const SPRING = 3.4;
const DAMPING_HALF_LIFE = 0.22;
const REPEL_RADIUS = 1.15;
const REPEL_STRENGTH = 5.2;

// Ambient drift applied on top of each particle's home position: low
// frequency and low amplitude so it reads as a slow, cohesive breathing
// motion rather than jitter.
const NOISE_FREQ = 0.5;
const NOISE_SPEED = 0.18;
const NOISE_AMP = 0.045;

export default function EagleParticles() {
  const pointsRef = useRef(null);
  const { raycaster, pointer, camera } = useThree();
  const noise = useMemo(() => new SimplexNoise(), []);

  const { positions, velocities, homes, sizes, colors, plane, hitPoint } = useMemo(() => {
    const homes = buildEagleHomes(COUNT);
    const positions = new Float32Array(COUNT * 3);
    const velocities = new Float32Array(COUNT * 3);
    const sizes = new Float32Array(COUNT);
    const colors = new Float32Array(COUNT * 3);
    const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2);

    for (let i = 0; i < COUNT; i++) {
      // Particles start scattered and spring into the eagle formation on
      // mount, rather than appearing already-formed.
      positions[i * 3] = (Math.random() - 0.5) * 7;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 7;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 4;
      sizes[i] = (3 + Math.random() * 5) * dpr;
      const c = i % 6 === 0 ? BRASS : PAPER;
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }

    return {
      positions,
      velocities,
      homes,
      sizes,
      colors,
      plane: new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),
      hitPoint: new THREE.Vector3(),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFrame((state, rawDelta) => {
    const dt = Math.min(rawDelta, 1 / 15);
    const geometry = pointsRef.current?.geometry;
    if (!geometry) return;
    const posAttr = geometry.attributes.position;
    const arr = posAttr.array;
    const time = state.clock.elapsedTime;

    raycaster.setFromCamera(pointer, camera);
    const hasHit = raycaster.ray.intersectPlane(plane, hitPoint);

    for (let i = 0; i < COUNT; i++) {
      const ix = i * 3;
      const iy = ix + 1;
      const iz = ix + 2;

      const hx = homes[ix];
      const hy = homes[iy];
      const hz = homes[iz];

      // Sample the same noise field three times with offset coordinates to
      // get three decorrelated-enough channels for x/y/z drift, all keyed
      // off the particle's own resting position so spatially close
      // particles drift together.
      const nx = noise.noise4d(hx * NOISE_FREQ, hy * NOISE_FREQ, hz * NOISE_FREQ, time * NOISE_SPEED);
      const ny = noise.noise4d(hx * NOISE_FREQ + 19.7, hy * NOISE_FREQ, hz * NOISE_FREQ, time * NOISE_SPEED);
      const nz = noise.noise4d(hx * NOISE_FREQ, hy * NOISE_FREQ + 41.3, hz * NOISE_FREQ, time * NOISE_SPEED);

      const targetX = hx + nx * NOISE_AMP;
      const targetY = hy + ny * NOISE_AMP;
      const targetZ = hz + nz * NOISE_AMP;

      let ax = (targetX - arr[ix]) * SPRING;
      let ay = (targetY - arr[iy]) * SPRING;
      let az = (targetZ - arr[iz]) * SPRING;

      if (hasHit) {
        const dx = arr[ix] - hitPoint.x;
        const dy = arr[iy] - hitPoint.y;
        const dz = arr[iz] - hitPoint.z;
        const distSq = dx * dx + dy * dy + dz * dz;
        if (distSq < REPEL_RADIUS * REPEL_RADIUS) {
          const dist = Math.sqrt(distSq) || 0.001;
          // Smoothstep-eased falloff (was a linear 1 - dist/radius ramp), so
          // the repel force cushions in and out instead of ramping rigidly.
          const n = 1 - dist / REPEL_RADIUS;
          const eased = n * n * (3 - 2 * n);
          const force = eased * REPEL_STRENGTH;
          ax += (dx / dist) * force;
          ay += (dy / dist) * force;
          az += (dz / dist) * force;
        }
      }

      velocities[ix] += ax * dt;
      velocities[iy] += ay * dt;
      velocities[iz] += az * dt;

      const damp = Math.pow(2, -dt / DAMPING_HALF_LIFE);
      velocities[ix] *= damp;
      velocities[iy] *= damp;
      velocities[iz] *= damp;

      arr[ix] += velocities[ix] * dt;
      arr[iy] += velocities[iy] * dt;
      arr[iz] += velocities[iz] * dt;
    }

    posAttr.needsUpdate = true;
  });

  return (
    <points ref={pointsRef} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-aSize" args={[sizes, 1]} />
        <bufferAttribute attach="attributes-aColor" args={[colors, 3]} />
      </bufferGeometry>
      <shaderMaterial
        vertexShader={VERTEX_SHADER}
        fragmentShader={FRAGMENT_SHADER}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}
