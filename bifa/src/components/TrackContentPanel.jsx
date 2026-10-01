import React from 'react';
import { motion } from 'framer-motion';
import { usePanelMotion } from '../hooks/usePanelMotion.js';

export default function TrackContentPanel({ panel, accent = 'brass', smoothProgress, metricsRef, index }) {
  const { rotateY, scale, z } = usePanelMotion(smoothProgress, metricsRef, index);
  return (
    <motion.div
      className={`track-panel track-content accent-${accent}`}
      style={{ rotateY, scale, z, transformPerspective: 1200 }}
    >
      <h4 className="kicker">{panel.kicker}</h4>
      <h3>{panel.title}</h3>
      {panel.body && <p>{panel.body}</p>}
      {panel.items && (
        <ul className="feature-list">
          {panel.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
      {panel.priceTag && (
        <div className="price-tag">
          <span className="price-tag-amount">{panel.priceTag.amount}</span>
          <span className="price-tag-note">{panel.priceTag.note}</span>
        </div>
      )}
    </motion.div>
  );
}
