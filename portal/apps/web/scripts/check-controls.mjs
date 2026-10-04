#!/usr/bin/env node
/* ============================================================
   check:controls — the portal's interactive-layer gate.

   The public site has `npm run verify:interactions` (jsdom, computed styles).
   The portal is a different shape: one CSS layer (`app/globals.css`) plus one
   React component (`components/button.tsx`), and it has no jsdom harness of
   its own. So this check asserts the *source* invariants that the layer
   depends on — the geometry, the elevation stack, the focus ring, the motion
   contract and the accessibility guarantees — and it fails loudly if any of
   them is quietly removed.

   Run: npm run check:controls   (from portal/apps/web)
   ============================================================ */

import fs from "node:fs";
import path from "node:path";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const CSS = read("app/globals.css");
const BUTTON = read("components/button.tsx");
const TOKENS = read("app/tokens.css");

const results = [];
const ok = (l) => results.push({ l, ok: true });
const check = (l, cond, why) => results.push({ l, ok: !!cond, why });

/* ── 1. geometry: one 4pt scale, and the 44px floor ─────────────────────── */
check("the touch floor is 44px on every control", /min-height: 44px;/.test(CSS));
check("padding is vertical-free (flex centring, not line-height maths)",
  /body\.portal-root \.btn \{[\s\S]{0,1200}padding: 0 var\(--space-3\);/.test(CSS));
check("sizes exist for large and for visually-small controls",
  /\.btn\.lg \{ min-height: 56px/.test(CSS) && /\.btn\.small,/.test(CSS));
check("SMALL CONTROLS RESTORE THE 44px HIT AREA rather than shrinking it",
  /\.btn\.small::after,[\s\S]{0,300}min-width: 44px; min-height: 44px;/.test(CSS));

/* ── 2. depth: layered, soft, with a 1px translucent edge ───────────────── */
/* Every elevation declaration in the layer, in order: the base plate, its
   hover, the gold variant and its hover. `none` / fully transparent values
   are legitimate (ghost and outline plates) and are skipped. */
const stacks = [...CSS.matchAll(/--ctl-shadow(?:-hover)?: ([^;]+);/g)]
  .map((m) => m[1].trim())
  .filter((v) => v !== "none" && !/^0 0 0 rgba\(0, 0, 0, 0\)$/.test(v));
check("there is at least one real elevation stack", stacks.length >= 2, `found ${stacks.length}`);
/* Filled plates (primary, secondary, danger) carry a three-layer stack. The
   ghost and outline variants lift only on hover and use two — a third layer
   under a transparent plate is invisible weight, not depth. */
const layerCounts = stacks.map((s) => (s.match(/rgba?\(/g) || []).length);
check("every elevation is a two- or three-layer stack",
  layerCounts.every((n) => n >= 2), layerCounts.join(", "));
check("the filled plates get the full three layers",
  layerCounts.filter((n) => n === 3).length >= 3, layerCounts.join(", "));
check("every layer stays at or under 12% alpha — diffused light, not a grey smear",
  stacks.every((s) => [...s.matchAll(/rgba\([^)]*?,\s*([\d.]+)\)/g)].every((m) => parseFloat(m[1]) <= 0.12)),
  stacks.map((s) => [...s.matchAll(/rgba\([^)]*?,\s*([\d.]+)\)/g)].map((m) => m[1]).join("/")).join(" | "));
check("the plate carries a 1px translucent inner edge",
  /box-shadow: inset 0 1px 0 rgba\(255, 255, 255, \.14\)/.test(CSS));
check("pressed collapses the cast shadow into an inner one",
  /\.btn:active \{[\s\S]{0,300}inset 0 2px 5px/.test(CSS));

/* ── 3. motion ─────────────────────────────────────────────────────────── */
check("hover sells a subtle scale", /transform: translateY\(-1px\) scale\(1\.02\)/.test(CSS));
check("press compresses to .97", /transform: translateY\(1px\) scale\(\.97\)/.test(CSS));
check("press is faster than the hover transition",
  /transition-duration: 130ms/.test(CSS) && /--dur: var\(--dur-fast\)/.test(CSS));

/* ── 4. focus ──────────────────────────────────────────────────────────── */
check("one shared focus ring for every interactive element",
  /:where\(a, button, \[tabindex\], input, select, textarea\):focus-visible \{\n\s*outline: 2px solid var\(--accent\);/.test(CSS));
check("the ring is offset", /outline-offset: 3px/.test(CSS));
check("the ring carries a soft glow", /filter: drop-shadow\(0 0 12px 2px rgba\(176, 125, 63, \.38\)\)/.test(CSS));

/* ── 5. reduced motion and forced colours ──────────────────────────────── */
check("reduced motion keeps the states and drops the travel",
  /@media \(prefers-reduced-motion: reduce\) \{[\s\S]{0,400}transform: none;/.test(CSS));
check("forced colours keep a visible focus ring",
  /@media \(forced-colors: active\) \{[\s\S]{0,400}outline: 2px solid Highlight/.test(CSS));

/* ── 6. the component: the same system, plus the physics ───────────────── */
check("<Button> renders the shared class, not a parallel style",
  /const classes = \[[\s\S]{0,200}"btn",/.test(BUTTON));
check("<Button> offers the full variant set",
  ["primary", "secondary", "ghost", "outline", "danger", "quiet"].every((v) => BUTTON.includes(`"${v}"`)));
check("motion is spring-based, not duration-based",
  /type: "spring"/.test(BUTTON) && /stiffness: \d+/.test(BUTTON) && /damping: \d+/.test(BUTTON));
check("the component honours prefers-reduced-motion",
  /useReducedMotion\(\)/.test(BUTTON) && /reduce\s*\?\s*\{\}/.test(BUTTON));
check("the magnetic pull uses φ and is pointer-fine only",
  /const PHI = 1\.618/.test(BUTTON) && /\(hover: hover\) and \(pointer: fine\)/.test(BUTTON));
check("the magnet writes motion values, so it cannot re-render per mousemove",
  /useMotionValue/.test(BUTTON) && /useSpring\(/.test(BUTTON));
check("busy state is announced, not just styled",
  /"aria-busy": busy \|\| undefined/.test(BUTTON));

/* ── 7. the tokens the layer consumes are really vendored ──────────────── */
check("the tokens the layer uses are in the vendored copy",
  ["--dur-fast", "--ease-out", "--radius-sm", "--space-3", "--color-brand-tint"].every((t) => TOKENS.includes(t)));

/* ── report ────────────────────────────────────────────────────────────── */
const failed = results.filter((r) => !r.ok);
console.log(`\nPortal controls — ${results.length} checks`);
for (const f of failed) console.log(`  FAIL ${f.l}${f.why ? `\n       ${f.why}` : ""}`);
if (!failed.length) console.log("  all checks passed ✓");
else console.log(`\n  ${failed.length} of ${results.length} failed`);
process.exit(failed.length ? 1 : 0);
