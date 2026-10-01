import React, { useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { hero } from '../data/content.js';
import { RevealGroup, RevealItem } from './Reveal.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';
import SealScene from '../three/SealScene.jsx';
import { usePrefersReducedMotion, useIsCoarsePointer, useIsNarrowViewport } from '../hooks/useMediaQuery.js';

export default function Hero() {
  const heroRef = useRef(null);
  const [inView, setInView] = useState(true);
  const [ready, setReady] = useState(false);

  const reducedMotion = usePrefersReducedMotion();
  const coarsePointer = useIsCoarsePointer();
  const narrow = useIsNarrowViewport(980);
  // Mirrors the exact three conditions the original gated the WebGL module
  // (and its CSS container) behind: skip it for reduced-motion preference,
  // touch-first devices, and viewports too narrow for the composition to
  // read — protecting battery/GPU budget on precisely the devices least
  // able to spare it.
  const showEmblem = !reducedMotion && !coarsePointer && !narrow;

  useEffect(() => {
    if (!showEmblem) return undefined;
    const el = heroRef.current;
    if (!el) return undefined;
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, [showEmblem]);

  return (
    <header className="hero" id="home" ref={heroRef}>
      <div className="hero-glow" aria-hidden="true" />

      {showEmblem && (
        <div className={`emblem-stage${ready ? ' is-ready' : ''}`} aria-hidden="true">
          <ErrorBoundary fallback={null}>
            <Canvas
              dpr={[1, 2]}
              shadows
              gl={{ alpha: true, antialias: true }}
              camera={{ fov: 35, position: [0, 0.3, 6.2] }}
              frameloop={inView ? 'always' : 'never'}
              onCreated={() => setReady(true)}
            >
              <SealScene />
            </Canvas>
          </ErrorBoundary>
        </div>
      )}

      <RevealGroup as="div" className="container hero-content" mode="mount">
        <RevealItem as="span" className="kicker">
          {hero.eyebrow}
        </RevealItem>
        <RevealItem as="h1">
          {hero.heading[0]} <em>{hero.heading[1]}</em>
        </RevealItem>
        <RevealItem as="p" className="hero-body">
          {hero.body}
        </RevealItem>
        <RevealItem as="div" className="hero-ctas">
          <a href={hero.ctaPrimary.href} className="btn btn-primary">
            {hero.ctaPrimary.label}
          </a>
          <a href={hero.ctaSecondary.href} className="btn btn-secondary">
            {hero.ctaSecondary.label}
          </a>
        </RevealItem>
      </RevealGroup>
    </header>
  );
}
