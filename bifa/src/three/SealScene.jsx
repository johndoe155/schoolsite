import React, { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { dampTowards } from '../lib/damp.js';
import Medallion from './Medallion.jsx';
import EagleParticles from './EagleParticles.jsx';

// Composes the whole hero WebGL moment: one shared tilt group holding both
// the medallion and the particle wings (so they read as one lit object, per
// the original's own stated intent), lit by an ambient fill + a
// shadow-casting key light + a low brass rim light, grounded by an
// invisible shadow-catcher plane.
export default function SealScene() {
  const tiltGroupRef = useRef(null);
  const tilt = useRef({ x: 0, z: 0 });
  const idleY = useRef(0);
  const slowFrames = useRef(0);
  const { pointer, gl } = useThree();

  useFrame((_state, rawDelta) => {
    const dt = Math.min(rawDelta, 1 / 15);

    if (tiltGroupRef.current) {
      idleY.current += dt * 0.18;
      tilt.current.x = dampTowards(tilt.current.x, pointer.y * 0.22, 0.28, dt);
      tilt.current.z = dampTowards(tilt.current.z, pointer.x * 0.18, 0.28, dt);
      tiltGroupRef.current.rotation.set(tilt.current.x, idleY.current, tilt.current.z);
    }

    // Lightweight adaptive-resolution guard: if frames run sustainedly slow
    // (sub-~36fps), step pixel ratio down once rather than staying pinned
    // to a resolution the device can't sustain. Deliberately a single
    // one-way step, not a continuous loop — simple, cheap to reason about,
    // and enough to protect low-end hardware without fighting itself.
    if (rawDelta > 0.028) {
      slowFrames.current += 1;
      if (slowFrames.current === 45 && gl.getPixelRatio() > 1) {
        gl.setPixelRatio(1);
      }
    } else if (slowFrames.current > 0) {
      slowFrames.current -= 1;
    }
  });

  return (
    <>
      <ambientLight intensity={0.6} color="#f3ecda" />
      <directionalLight
        position={[-3.2, 4.2, 4.5]}
        intensity={1.15}
        color="#fff2d0"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-near={1}
        shadow-camera-far={15}
      />
      <directionalLight position={[3, -1.5, -3]} intensity={0.55} color="#e7be5a" />

      <group ref={tiltGroupRef}>
        <Medallion />
        <EagleParticles />
      </group>

      <mesh rotation-x={-Math.PI / 2} position-y={-1.6} receiveShadow>
        <planeGeometry args={[8, 8]} />
        <shadowMaterial opacity={0.22} />
      </mesh>
    </>
  );
}
