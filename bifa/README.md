# Bodija International Academies — rebuild

A ground-up rebuild of the academies page on a real React pipeline:
**Framer Motion** for every animation/gesture/scroll interaction, **React
Three Fiber** for the hero's WebGL scene, plain hand-authored CSS for the
design system. GSAP has been fully replaced, per the brief.

## Running it for real

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # outputs dist/
```

## Also included: `dist/academies.html`

A single self-contained HTML file with the same app pre-built and inlined —
open it directly in a browser, no server or build step required. It loads
React/Three/R3F/Framer Motion from esm.sh via an import map (see the
"How the standalone file works" section below) and falls back to fully
readable static markup if that CDN load fails or is offline.

To regenerate it after editing `src/`:

```bash
node scripts/build-standalone.mjs
```

(Requires esbuild — `npm install` gets you one via Vite's own dependency
tree, or install it directly with `npm i -D esbuild`.)

## Project structure

```
src/
  data/content.js       All copy/facts in one place (tuition, bank details,
                         phone/email, curriculum) — components are purely
                         presentational.
  lib/                  Pure functions, no React: damping math, horizontal-
                         track geometry, the particle-field formation.
  hooks/                useMediaQuery/useTrackMetrics/usePanelMotion.
  three/                The R3F scene: SealScene, Medallion, EagleParticles.
  components/           Nav, Hero, HorizontalTrack + its panel/dot pieces,
                         EnrollSection, InfoCard, Footer, Reveal (the
                         whileInView/stagger system), ErrorBoundary.
  App.jsx, main.jsx      Composition root + mount.
  fallback.html          Static markup used two ways: inlined into the
                         standalone build's #root pre-mount, and as a
                         reference for wiring the same progressive
                         enhancement into a real deployment's index.html.
```

## What changed, and why

- **Colour system** — indigo deepened from flat web-blue into something
  closer to ink; the flat saturated yellow became an antique brass. Each
  academy now has its own accent (clay for BIMA, pitch-green for BIFA) so
  section colour encodes which academy you're in.
- **Type system** — Fraunces (display) + Inter (body) + IBM Plex Mono
  (kickers, prices, addresses, phone/account numbers) — the mono layer
  gives the enrolment details a "registrar/ledger" feel that fits an
  institution issuing certifications.
- **The hero** — the old 2D canvas eagle-particle field and the separate
  vanilla-Three.js medallion are now one R3F scene: a shared pointer-tilt
  group holding a real physics-simulated particle system (spring-to-home +
  pointer-repel, genuinely frame-rate-independent) and a faceted
  brass/clearcoat medallion, sharing one camera and one set of lights.
- **Horizontal scroll sections** — GSAP ScrollTrigger's pin+scrub is now
  CSS `position: sticky` + Framer Motion's `useScroll`/`useSpring`. Every
  panel's 3D tilt is closed-form arithmetic derived from scroll progress
  (see `lib/trackMath.js`) rather than a `getBoundingClientRect()` read on
  every scroll tick.
- **Reveals** — `whileInView` + `variants` + `staggerChildren` replaces the
  `[data-reveal]`/`ScrollTrigger.batch()` system outright.
- **Reduced motion** — `<MotionConfig reducedMotion="user">` at the app
  root replaces the dozen scattered `matchMedia` checks for every Framer
  Motion animation; the WebGL scene and CSS horizontal-track fallback are
  still gated explicitly, since neither is a Framer Motion animation.
- **Cards** — redesigned with a brass hairline border, a corner arc accent,
  and — on the enrolment cards specifically — a pointer-driven spring tilt
  (real physics, via Framer Motion's spring) scoped to just those three
  cards rather than applied ambiently everywhere.
- **Fixed bugs**: the BIFA section's photo pointed at a local file that was
  never shipped (broken image) — now a designed placeholder plate until a
  real photo is supplied; the two nav links with no real destination used
  `href="#"`, which jumped the page to the top on click — now inert with a
  prevented default instead of a fake link.
- **The loader was removed** at the requester's instruction — the hero now
  reveals directly on mount.

## Known scope boundaries

- No photograph is wired up for BIFA (`src/data/content.js` → `bifa.photo.src`
  is `null` on purpose). Drop in a URL and `TrackImagePanel` picks it up
  automatically, exactly like BIMA's.
- The standalone HTML file loads its dependencies from a public CDN
  (esm.sh) at runtime; this repo's own `npm run dev`/`build` doesn't depend
  on that at all.
