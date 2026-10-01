import React, { useState } from 'react';
import { motion, useMotionValueEvent } from 'framer-motion';
import { computeActiveIndex } from '../lib/trackMath.js';

// The original's comments named exactly what this should be: "the nearest
// vanilla-JS equivalent of a Framer Motion layoutId transition," achieved
// there with GSAP's Flip plugin measuring before/after boxes by hand. Here
// it's the literal thing — layoutId lets two differently-positioned
// elements (the same dot's fill, mounted at index i, then at index i+1)
// animate as one continuous shape without any manual measurement at all.
export default function TrackDots({ count, progress, metricsRef, layoutId }) {
  const [active, setActive] = useState(0);

  useMotionValueEvent(progress, 'change', (latest) => {
    const idx = computeActiveIndex(latest, metricsRef.current);
    setActive((prev) => (prev === idx ? prev : idx));
  });

  return (
    <div className="track-progress" role="presentation">
      {Array.from({ length: count }).map((_, i) => (
        <div className="track-dot" key={i}>
          {active === i && (
            <motion.div
              className="track-dot-fill"
              layoutId={layoutId}
              transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            />
          )}
        </div>
      ))}
    </div>
  );
}
