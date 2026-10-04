/**
 * Skeletons — PORTAL-UX-AUDIT.md Phase 2.
 *
 * Loading used to be the literal text "Loading…" (15 places). A skeleton is
 * better for two reasons: it holds the layout still so the page does not jump
 * when data lands, and it says how much is coming. Each variant is shaped like
 * the thing it replaces (a table, a set of cards, a single form), and the whole
 * block is one polite status so a screen reader hears "loading" once instead
 * of once per row.
 *
 * Animation is CSS-only (`prefers-reduced-motion` freezes it — see
 * app/globals.css), so these stay server components.
 */

function Rows({ count = 4, widths = ["60%", "40%", "52%", "34%"] }: { count?: number; widths?: string[] }) {
  return (
    <div className="skeleton" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="skeleton__row"
          style={{ width: widths[i % widths.length] }}
        />
      ))}
    </div>
  );
}

export function SkeletonRows({ label = "Loading…", count = 4 }: { label?: string; count?: number }) {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <Rows count={count} />
    </div>
  );
}

export function SkeletonTable({ label = "Loading table…", rows = 5 }: { label?: string; rows?: number }) {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div className="skeleton" aria-hidden="true">
        <div className="skeleton__row w-40" />
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="skeleton__row" style={{ width: `${88 - (i % 3) * 12}%` }} />
        ))}
      </div>
    </div>
  );
}

export function SkeletonCards({ label = "Loading…", cards = 3 }: { label?: string; cards?: number }) {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div className="grid cards" aria-hidden="true">
        {Array.from({ length: cards }, (_, i) => (
          <div key={i} className="card">
            <div className="skeleton">
              <div className="skeleton__row w-60" />
              <div className="skeleton__row tall" />
              <div className="skeleton__row w-40" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default SkeletonRows;
