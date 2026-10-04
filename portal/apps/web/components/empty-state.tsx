/**
 * Empty state — PORTAL-UX-AUDIT.md Phase 2, "empty states".
 *
 * Rule the portal follows from here on: an empty list is a sentence plus the
 * next thing to do, never a bare "No records". A server component by default,
 * so it costs nothing to render inside a data-fetching page.
 */
import type { ReactNode } from "react";

export default function EmptyState({
  icon = "—",
  title,
  children,
  action,
}: {
  /** Decorative glyph; hidden from assistive tech because it carries no meaning. */
  icon?: string;
  title: string;
  /** The explanation: what would put something here. */
  children?: ReactNode;
  /** The one thing the user can do next (link or button). */
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty__icon" aria-hidden="true">{icon}</span>
      <p className="empty__title">{title}</p>
      {children ? <p>{children}</p> : null}
      {action ?? null}
    </div>
  );
}
