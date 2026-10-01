import React from 'react';
import { MotionConfig } from 'framer-motion';
import Nav from './components/Nav.jsx';
import Hero from './components/Hero.jsx';
import HorizontalTrack from './components/HorizontalTrack.jsx';
import EnrollSection from './components/EnrollSection.jsx';
import Footer from './components/Footer.jsx';
import { bima, bifa } from './data/content.js';

// MotionConfig reducedMotion="user" replaces the dozen-odd scattered
// `matchMedia('(prefers-reduced-motion: reduce)')` checks the original
// threaded through every module by hand: Framer Motion checks the OS
// preference itself and automatically simplifies every motion-driven
// transform/layout animation site-wide, in one place, for every current and
// future motion.* component — new animated components get the behaviour
// for free instead of needing their own manual guard.
export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <Nav />
      <main id="main">
        <Hero />
        <HorizontalTrack
          id={bima.id}
          accent={bima.accent}
          eyebrow={bima.eyebrow}
          heading={bima.heading}
          body={bima.body}
          photo={bima.photo}
          panels={bima.panels}
        />
        <HorizontalTrack
          id={bifa.id}
          accent={bifa.accent}
          surface={bifa.surface}
          eyebrow={bifa.eyebrow}
          heading={bifa.heading}
          body={bifa.body}
          photo={bifa.photo}
          panels={bifa.panels}
        />
        <EnrollSection />
      </main>
      <Footer />
    </MotionConfig>
  );
}
