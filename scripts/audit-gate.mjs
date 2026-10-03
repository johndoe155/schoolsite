#!/usr/bin/env node
/**
 * Dependency gate for the marketing site (`npm run audit:site`).
 *
 * Why this exists rather than `npm audit --audit-level=high`:
 *
 *   1. `npm audit` fails a build for advisories that have **no in-range fix**.
 *      Right now that is one root cause — `braces` (GHSA-vfj7-8cjw-p6xm, a
 *      stack-exhaustion ReDoS) reached through `micromatch` from both
 *      tailwindcss (build-time) and http-proxy-middleware (runtime). We are
 *      already on the newest releases of braces 3.x (3.0.3) and micromatch
 *      4.x (4.0.8); there is no patched release to move to.
 *   2. npm still reports `fixAvailable` for those, but look at what the "fix"
 *      is: a semver-MAJOR change to a *different* package (Tailwind v4), or a
 *      downgrade (http-proxy-middleware 0.2.0). npm would happily have us
 *      rewrite the styling layer or ship a proxy from 2020 to clear a
 *      transitive ReDoS. Neither is a fix, and gating CI on it forever just
 *      teaches everyone to ignore the gate.
 *   3. So the gate distinguishes: advisory fixable WITHIN the current semver
 *      ranges → red, build fails. Advisory whose only "fix" is a major
 *      version change → amber, printed loudly, re-checked on every bump.
 *
 * Exit 0 = nothing actionable. Exit 1 = at least one fixable high/critical.
 */
import { execFileSync } from "node:child_process";

const SEVERITIES = new Set(["high", "critical"]);

function run(cwd) {
  try {
    // npm audit exits non-zero when it finds anything; the JSON is still valid.
    return execFileSync("npm", ["audit", "--json"], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch (err) {
    if (err.stdout) return err.stdout;
    throw err;
  }
}

let failed = false;
for (const dir of ["."]) {
  const report = JSON.parse(run(dir));
  const vulns = Object.entries(report.vulnerabilities ?? {});

  /** Amber: nothing we can do without a major version change somewhere else. */
  const amber = new Map();
  for (const [name, v] of vulns) {
    if (!SEVERITIES.has(v.severity)) continue;
    const fix = v.fixAvailable;
    if (fix && fix !== true && fix.isSemVerMajor) {
      amber.set(name, { name, severity: v.severity, via: [], fix });
    }
  }

  /* A package whose only vulnerability is *through* an amber package is itself
     amber: npm reports `fixAvailable: true` for it because deleting the whole
     subtree would clear the advisory, not because a patched release exists.
     fast-glob is exactly this case — its `via` is micromatch, at its latest. */
  for (const [name, v] of vulns) {
    if (!SEVERITIES.has(v.severity) || amber.has(name)) continue;
    // `via` is a mix: strings are package names, objects are advisories.
    const viaNames = (v.via ?? []).map((x) => typeof x === "string" ? x : x.name).filter(Boolean);
    const fix = v.fixAvailable;
    const chained = fix === true && viaNames.length > 0 && viaNames.every((n) => amber.has(n));
    if (chained) amber.set(name, { name, severity: v.severity, via: viaNames, fix });
  }

  const fixable = [];
  const unfixable = [];
  for (const [name, v] of vulns) {
    if (!SEVERITIES.has(v.severity)) continue;
    if (amber.has(name)) { unfixable.push(amber.get(name)); continue; }
    const urls = (v.via ?? []).filter((x) => typeof x === "object").map((x) => x.url);
    fixable.push({ name, severity: v.severity, urls, fix: v.fixAvailable });
  }

  if (unfixable.length) {
    console.log(`⚠  ${unfixable.length} high/critical advisor${unfixable.length === 1 ? "y" : "ies"} with NO published fix — not failing the build:`);
    for (const u of unfixable) {
      const via = u.fix && u.fix !== true
        ? ` — npm's only offer is ${u.fix.name}@${u.fix.version} (semver-major elsewhere)`
        : u.via.length ? ` — reached through ${u.via.join(", ")}` : "";
      const urls = u.urls ?? (u.fix && u.fix !== true ? u.fix.url ?? "" : "");
      console.log(`   • ${u.name} (${u.severity}) ${urls}${via}`.trim());
    }
    console.log("   Re-check on every dependency bump; do not silence this line.\n");
  }

  if (fixable.length) {
    console.error(`✗ ${fixable.length} high/critical advisor${fixable.length === 1 ? "y" : "ies"} WITH a fix available:`);
    for (const f of fixable) console.error(`   • ${f.name} (${f.severity}) ${f.urls.join(" ")}`.trim());
    failed = true;
  } else if (!unfixable.length) {
    console.log("✓ no high/critical advisories");
  }
}

process.exit(failed ? 1 : 0);
