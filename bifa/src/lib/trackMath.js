// src/lib/trackMath.js
// ----------------------------------------------------------------------------
// The original vanilla horizontal-track module called getBoundingClientRect()
// on every panel, on every scroll tick, forever, to work out each panel's
// distance from the viewport centre for the rotateY/scale "3D" effect — a
// real per-frame layout-read cost (the module's own comments elsewhere in
// that file specifically flag exactly this pattern — repeated
// getBoundingClientRect() in a driving loop — as a performance smell to
// avoid, yet the track module itself still did it).
//
// Because the wrapper's translateX is a simple linear function of scroll
// progress, so is every panel's on-screen position — which means each
// panel's "distance from centre" is *also* just an affine function of
// progress. measureTrack() reads the DOM once (mount + resize, never during
// scroll) to capture static layout metrics; computeNormDist() then derives
// each panel's live distance from progress with plain arithmetic, no DOM
// reads at all. Framer Motion's useTransform (see HorizontalTrack.jsx) turns
// that arithmetic directly into a scroll-linked motion value.

export function measureTrack(wrapperEl, stickyEl) {
  if (!wrapperEl || !stickyEl) return null;
  const panels = Array.from(wrapperEl.children);
  if (panels.length === 0) return null;
  return {
    stickyWidth: stickyEl.clientWidth,
    panelOffsets: panels.map((p) => p.offsetLeft),
    panelWidths: panels.map((p) => p.offsetWidth),
    maxTranslate: Math.max(0, wrapperEl.scrollWidth - stickyEl.clientWidth),
  };
}

export function computeTranslateX(progress, metrics) {
  if (!metrics) return 0;
  return -progress * metrics.maxTranslate;
}

// Signed, clamped distance of panel `index`'s centre from the viewport
// centre, in units where +/-1 == exactly one half-viewport away. Clamped a
// little past +/-1 (rather than exactly at it) so panels approaching from
// off-screen ease into rotation/scale instead of snapping the instant they
// cross the edge.
export function computeNormDist(index, progress, metrics) {
  if (!metrics) return 0;
  const offset = metrics.panelOffsets[index] ?? 0;
  const width = metrics.panelWidths[index] ?? 0;
  const centerAtProgress = offset + width / 2 - progress * metrics.maxTranslate;
  const viewportCenter = metrics.stickyWidth / 2 || 1;
  const raw = (centerAtProgress - viewportCenter) / viewportCenter;
  return Math.max(-1.5, Math.min(1.5, raw));
}

export function computeActiveIndex(progress, metrics) {
  if (!metrics || metrics.panelOffsets.length === 0) return 0;
  let closest = 0;
  let closestDist = Infinity;
  metrics.panelOffsets.forEach((_, i) => {
    const d = Math.abs(computeNormDist(i, progress, metrics));
    if (d < closestDist) {
      closestDist = d;
      closest = i;
    }
  });
  return closest;
}
