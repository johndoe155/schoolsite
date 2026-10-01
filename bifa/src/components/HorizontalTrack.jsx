import React, { useRef } from 'react';
import { motion, useScroll, useSpring, useTransform } from 'framer-motion';
import { useTrackMetrics } from '../hooks/useTrackMetrics.js';
import { computeTranslateX } from '../lib/trackMath.js';
import TrackImagePanel from './TrackImagePanel.jsx';
import TrackContentPanel from './TrackContentPanel.jsx';
import TrackDots from './TrackDots.jsx';

// Replaces the original's GSAP ScrollTrigger (pin: true, scrub: true) +
// manual xPercent function-value + a getBoundingClientRect()-per-panel
// update loop. One spring-smoothed scroll progress value drives everything
// else here as pure derived motion values — the CSS-sticky element handles
// the pin (no JS pinning logic needed at all), and every panel's 3D tilt is
// closed-form arithmetic (see lib/trackMath.js) rather than a per-frame
// layout read.
export default function HorizontalTrack({ id, accent, surface, eyebrow, heading, body, photo, panels }) {
  const sectionRef = useRef(null);
  const wrapperRef = useRef(null);
  const stickyRef = useRef(null);

  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start start', 'end end'] });
  const smoothProgress = useSpring(scrollYProgress, { stiffness: 120, damping: 26, mass: 0.4 });
  const { metricsRef } = useTrackMetrics(wrapperRef, stickyRef);

  const x = useTransform(smoothProgress, (p) => computeTranslateX(p, metricsRef.current));
  // The heading only needs to announce arrival at the section once, so it's
  // tied directly to the top sliver of scroll progress rather than a
  // separate whileInView/IntersectionObserver trigger — one fewer moving
  // part, and no ambiguity about how intersection observers report entries
  // for a position:sticky element mid-transition into its pinned state.
  const headingOpacity = useTransform(smoothProgress, [0, 0.05], [0, 1]);
  const headingY = useTransform(smoothProgress, [0, 0.05], [22, 0]);

  const totalPanels = 1 + panels.length;
  const isDark = surface === 'dark';

  return (
    <section
      id={id}
      data-track
      ref={sectionRef}
      className={isDark ? 'surface-dark' : undefined}
      style={{ height: `${totalPanels * 78}vh` }}
    >
      <div className="track-sticky" ref={stickyRef}>
        <motion.div className="track-heading" style={{ opacity: headingOpacity, y: headingY }}>
          <span className="kicker">{eyebrow}</span>
          <h2>{heading}</h2>
          <p>{body}</p>
        </motion.div>

        <motion.div className="track-wrapper" ref={wrapperRef} style={{ x }}>
          <TrackImagePanel
            photo={photo}
            accent={accent}
            smoothProgress={smoothProgress}
            metricsRef={metricsRef}
            index={0}
          />
          {panels.map((panel, i) => (
            <TrackContentPanel
              key={panel.title}
              panel={panel}
              accent={accent}
              smoothProgress={smoothProgress}
              metricsRef={metricsRef}
              index={i + 1}
            />
          ))}
        </motion.div>

        <TrackDots count={totalPanels} progress={smoothProgress} metricsRef={metricsRef} layoutId={`${id}-dot`} />
      </div>
    </section>
  );
}
