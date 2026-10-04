#!/usr/bin/env node
/**
 * WCAG contrast gate — PORTAL-UX-AUDIT.md, "prioritise WCAG 2.1 compliance".
 *
 * The portal's palette lives in two places: app/tokens.css (light, inherited
 * from the marketing site) and the dark-theme block in app/globals.css. Both
 * are hand-maintained, so a colour can drift out of AA without anybody
 * noticing — nothing in a build fails when a hex value gets prettier.
 *
 * This script reads the *shipped* stylesheets (no copies of the values), resolves
 * the `var()` indirection, and asserts every text/background pair the portal
 * actually renders. It exits non-zero on the first failure, so it can be wired
 * into CI unchanged.
 *
 *     node scripts/check-contrast.mjs
 *
 * Thresholds: WCAG 2.1 AA — 4.5:1 for normal text, 3:1 for large text
 * (≥24px, or ≥18.66px bold) and for non-text UI boundaries. Each pair below
 * states which threshold it is being judged against and why.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, "..");
const tokensCss = readFileSync(join(web, "app/tokens.css"), "utf8");
const globalsCss = readFileSync(join(web, "app/globals.css"), "utf8");

/* ── read the variables ──────────────────────────────────────────────────── */

/** Every `--name: value;` inside `text`. */
function varsIn(text) {
  const out = new Map();
  for (const m of text.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) out.set(m[1], m[2].trim());
  return out;
}

const rootVars = varsIn(tokensCss);

/**
 * The dark palette: the `html[data-theme="dark"]` block that declares one.
 * (A second, smaller block sets `color-scheme: dark` only, so the first match
 * is not necessarily the palette.)
 */
function darkVars() {
  for (const m of globalsCss.matchAll(/html\[data-theme="dark"\]\s*\{([^}]*)\}/g)) {
    if (m[1].includes("--bg:")) return varsIn(m[1]);
  }
  throw new Error('no html[data-theme="dark"] palette block in app/globals.css');
}
const dark = darkVars();

/** Follow `var(--a, fallback)` chains until a literal colour appears. */
function resolve(vars, value, seen = new Set()) {
  const m = String(value).trim().match(/^var\(\s*(--[a-z0-9-]+)\s*(?:,\s*(.+))?\)$/i);
  if (!m) return String(value).trim();
  const [, name, fallback] = m;
  if (seen.has(name)) throw new Error(`circular var(): ${[...seen, name].join(" → ")}`);
  seen.add(name);
  const next = vars.get(name) ?? fallback;
  if (next === undefined) throw new Error(`unresolved var(${name})`);
  return resolve(vars, next, seen);
}

/**
 * Colours arrive as hex or as `rgba()` — `--color-ink-60` is a translucent
 * ink, and a translucent foreground has no contrast of its own: it only has
 * the contrast of what it composites to. So colours are parsed to channels
 * plus alpha, the foreground is flattened over the backdrop, and the result
 * is what gets measured.
 */
function parseColor(value) {
  const v = value.trim();
  const hex = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    let c = hex[1];
    if (c.length === 3) c = c.split("").map((h) => h + h).join("");
    return { r: parseInt(c.slice(0, 2), 16), g: parseInt(c.slice(2, 4), 16), b: parseInt(c.slice(4, 6), 16), a: 1 };
  }
  const rgb = v.match(/^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:[ ,/]+([\d.]+))?\s*\)$/i);
  if (rgb) return { r: +rgb[1], g: +rgb[2], b: +rgb[3], a: rgb[4] === undefined ? 1 : +rgb[4] };
  throw new Error(`not a colour: ${value}`);
}

/** A translucent colour has no contrast until it sits on something. */
function flatten(fg, bg) {
  if (fg.a >= 1) return fg;
  if (bg.a < 1) throw new Error("nested translucent colours: needs a real backdrop");
  const mix = (f, b) => Math.round(f * fg.a + b * (1 - fg.a));
  return { r: mix(fg.r, bg.r), g: mix(fg.g, bg.g), b: mix(fg.b, bg.b), a: 1 };
}

/** sRGB → relative luminance (WCAG 2.1, "relative luminance" definition). */
function luminance({ r, g, b }) {
  const [lr, lg, lb] = [r, g, b].map((channel) => {
    const v = channel / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

function contrast(fgValue, bgValue) {
  const bg = parseColor(bgValue);
  const fg = flatten(parseColor(fgValue), bg);
  const [x, y] = [luminance(fg), luminance(bg)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/* ── the pairs the portal actually renders ────────────────────────────────
   Every entry names a real place in the UI, so a failure tells you which
   screen is unreadable rather than which hex value is ugly. */
const pairs = [
  // theme, foreground var, background var, min ratio, where it appears
  ["light", "--color-ink", "--color-surface", 4.5, "body text on cards and surfaces"],
  ["light", "--color-ink", "--color-paper", 4.5, "body text on the page background"],
  ["light", "--color-ink-60", "--color-surface", 4.5, "muted text (.lede, .muted, table captions)"],
  ["light", "--color-warning", "--color-surface", 4.5, "unverified-guardian note, warning badges"],
  ["light", "--color-danger", "--color-surface", 4.5, "errors, absence chips, destructive actions"],
  ["light", "--color-accent", "--color-surface", 3.0, "gold rule/border accents (non-text)"],
  ["light", "--color-brand", "--color-surface", 4.5, "links, headings, .btn ghost text"],
  ["light", "--color-brand-strong", "--color-surface", 4.5, "link hover"],
  ["light", "--color-cream", "--color-brand", 4.5, "primary button label on brand fill"],
  ["light", "--color-cream", "--color-brand-strong", 4.5, "primary button label on hover"],

  ["dark", "--ink", "--card", 4.5, "body text on cards and surfaces"],
  ["dark", "--ink", "--bg", 4.5, "body text on the page background"],
  ["dark", "--muted", "--card", 4.5, "muted text (.lede, .muted, table captions)"],
  ["dark", "--warn", "--card", 4.5, "unverified-guardian note, warning badges"],
  ["dark", "--bad", "--card", 4.5, "errors, absence chips, destructive actions"],
  ["dark", "--ok", "--card", 4.5, "present/paid chips"],
  ["dark", "--accent", "--card", 3.0, "gold rule/border accents (non-text)"],
  ["dark", "--brand", "--card", 4.5, "links, headings, .btn ghost text"],
  ["dark", "--brand-ink", "--brand", 4.5, "primary button label on brand fill"],
];

let failures = 0;
const rows = [];
for (const [theme, fgName, bgName, min, where] of pairs) {
  const vars = theme === "dark" ? dark : rootVars;
  const fg = resolve(theme === "dark" ? dark : rootVars, `var(${fgName})`);
  const bg = resolve(theme === "dark" ? dark : rootVars, `var(${bgName})`);
  const ratio = contrast(fg, bg);
  const ok = ratio >= min;
  if (!ok) failures += 1;
  rows.push({ theme, fgName, bgName, fg, bg, ratio, min, ok, where });
}

const pad = (s, n) => String(s).padEnd(n);
console.log(`\nPortal contrast — WCAG 2.1 AA (${rows.length} pairs, read from the shipped CSS)\n`);
console.log(`${pad("theme", 6)}${pad("pair", 34)}${pad("ratio", 8)}${pad("min", 5)}result  where`);
for (const r of rows) {
  console.log(
    pad(r.theme, 6) +
    pad(`${r.fgName} on ${r.bgName}`, 34) +
    pad(r.ratio.toFixed(2) + ":1", 8) +
    pad(r.min.toFixed(1), 5) +
    pad(r.ok ? "PASS" : "FAIL", 8) +
    r.where
  );
}

if (failures > 0) {
  console.error(`\n✗ ${failures} pair${failures === 1 ? "" : "s"} below the required ratio.\n`);
  process.exit(1);
}
console.log("\n✓ all pairs meet or exceed WCAG 2.1 AA.\n");
