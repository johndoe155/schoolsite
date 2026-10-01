import React, { useRef } from 'react';
import { motion, useSpring, useReducedMotion } from 'framer-motion';
import { ICONS } from './icons.jsx';

// The original applied a pointer-reactive tilt to hero text, every track
// image, and every card alike via a single [data-depth] module — motion
// competing with itself in three places at once. Here the WebGL emblem
// carries the hero's signature pointer-reactive moment on its own, and
// track images tilt from scroll position (see usePanelMotion), so this
// pointer-tilt is scoped to just these three cards: a contained,
// hover-discovered detail rather than an ambient effect running everywhere.
export default function InfoCard({ card }) {
  const Icon = ICONS[card.icon];
  const ref = useRef(null);
  const prefersReducedMotion = useReducedMotion();
  const rotateX = useSpring(0, { stiffness: 300, damping: 24 });
  const rotateY = useSpring(0, { stiffness: 300, damping: 24 });

  const handleMouseMove = (e) => {
    if (prefersReducedMotion || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    rotateY.set(px * 8);
    rotateX.set(py * -8);
  };

  const resetTilt = () => {
    rotateX.set(0);
    rotateY.set(0);
  };

  return (
    <motion.div
      ref={ref}
      className="info-card"
      style={{ rotateX, rotateY, transformPerspective: 900 }}
      onMouseMove={handleMouseMove}
      onMouseLeave={resetTilt}
      whileHover={prefersReducedMotion ? undefined : { y: -6 }}
      transition={{ duration: 0.3 }}
    >
      <div className="info-card-arc" aria-hidden="true" />
      <div className="info-card-icon">
        <Icon />
      </div>
      <h4>{card.heading}</h4>
      <p>{card.body}</p>
      {card.meta && <div className="meta">{card.meta}</div>}
      {card.detail && (
        <div className="detail-list">
          {card.detail.map((d) => (
            <div className="detail-row" key={d.label}>
              <span>{d.label}</span>
              {d.href ? <a href={d.href}>{d.value}</a> : <span>{d.value}</span>}
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
