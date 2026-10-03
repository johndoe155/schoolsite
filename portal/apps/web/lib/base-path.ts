/**
 * The URL prefix the portal is mounted under.
 *
 * MUST match `basePath` in next.config.mjs. Next prefixes `<Link>` and
 * `router.push()` with basePath automatically — it does NOT touch a raw
 * `fetch()`, so every hand-written URL has to add this itself. That is the
 * whole reason this file exists: before integration there were two bare
 * `fetch("/api/v1…")` calls that would 404 once the portal moved under
 * /portal. There are now none — use API_BASE.
 *
 * A literal rather than process.env.PORTAL_BASE_PATH because Next only inlines
 * NEXT_PUBLIC_* variables into the client bundle, so an env read here would
 * silently be undefined in the browser and the fetch would break again.
 */
export const BASE_PATH = "/portal";

/** Browser-facing API base. Goes through Next's BFF rewrite (ADR-012). */
export const API_BASE = `${BASE_PATH}/api/v1`;
