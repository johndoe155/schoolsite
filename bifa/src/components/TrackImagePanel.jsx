import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { usePanelMotion } from '../hooks/usePanelMotion.js';

// A simple, deliberately generic "photograph pending" mark — not a broken-
// image icon, a designed plate that matches the rest of the system so an
// unset photo still looks like a choice rather than a bug. Swap in a real
// `photo.src` in src/data/content.js and this never renders.
function PlaceholderMark() {
  return (
    <svg viewBox="0 0 48 48" fill="none" stroke="#f7f1e3" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="8" width="40" height="32" rx="3" opacity="0.55" />
      <circle cx="16.5" cy="18.5" r="3.1" opacity="0.75" />
      <path d="M6 35l11-11.5 8 7.5 6-6.5 11 10.5" opacity="0.75" />
    </svg>
  );
}

export default function TrackImagePanel({ photo, accent = 'brass', smoothProgress, metricsRef, index }) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const showPhoto = Boolean(photo?.src) && !errored;
  const { rotateY, scale, z } = usePanelMotion(smoothProgress, metricsRef, index);

  return (
    <motion.div
      className={`track-panel track-image accent-${accent}`}
      style={{ rotateY, scale, z, transformPerspective: 1200 }}
    >
      <div className="track-image-frame" aria-hidden="true" />

      {showPhoto ? (
        <motion.img
          src={photo.src}
          alt={photo.alt || ''}
          loading="lazy"
          decoding="async"
          initial={{ opacity: 0, scale: 1.06 }}
          animate={loaded ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 1.06 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          onLoad={() => setLoaded(true)}
          onError={() => setErrored(true)}
        />
      ) : (
        <div className="track-image-placeholder">
          <PlaceholderMark />
        </div>
      )}

      <div className="track-image-veil" aria-hidden="true" />

      {photo?.badge && (
        <div className="track-badge">
          <span className="dot" aria-hidden="true" />
          {photo.badge}
        </div>
      )}
    </motion.div>
  );
}
