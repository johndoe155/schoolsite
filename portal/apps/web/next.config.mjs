import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Monorepo root (/home/user) — Turbopack won't auto-detect a root that is the home directory. */
const monorepoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * review-2 #2: Security headers moved to middleware.ts (per-request CSP nonces).
 * next.config headers() cannot generate per-request nonces — middleware can.
 * The middleware sets CSP, XFO, nosniff, Referrer-Policy, Permissions-Policy,
 * and conditional HSTS on every response.
 */

/**
 * INTEGRATION: the portal is served by the main site's Express server under
 * /portal, so it is same-origin with the marketing site (see
 * PORTAL-INTEGRATION-PLAN.md §1). basePath makes Next emit every route, asset
 * and <Link> under that prefix; assetPrefix does the same for /_next/* static
 * chunks, which the proxy serves from the same origin.
 *
 * Next prefixes basePath onto <Link> and router.push() automatically. It does
 * NOT prefix a raw fetch() — see lib/client.ts, which owns the one shared
 * API_BASE constant, and components/shell.tsx.
 */
const basePath = process.env.PORTAL_BASE_PATH ?? "/portal";

/** BFF: /api/** is proxied to the API so the session cookie stays first-party (ADR-012). */
export default {
  basePath,
  assetPrefix: basePath,
  turbopack: { root: monorepoRoot },
  async rewrites() {
    const api = process.env.API_INTERNAL ?? "http://127.0.0.1:8080";
    // Under basePath, Next matches rewrites against the UN-prefixed path, so the
    // source stays /api/:path* and the browser-facing URL is /portal/api/:path*.
    return [{ source: "/api/:path*", destination: `${api}/api/:path*` }];
  },
  // Security headers are now set per-request in middleware.ts (CSP nonces).
  // No static headers() needed here.
};
