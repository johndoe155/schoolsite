"use client";
/**
 * Route announcer — PORTAL-UX-AUDIT.md feature #4.
 *
 * The App Router swaps the page body without a page load and without moving
 * focus, so a screen-reader user who activates a link can end up reading the
 * new page from wherever their virtual cursor happened to be, and no title is
 * announced at all. This component closes that hole the way the ARIA authoring
 * practices recommend:
 *
 *   • focus the new page's <h1> (tabindex="-1") after each client-side
 *     navigation, so Tab continues from the start of the content;
 *   • announce "<page> · <school>" politely, so nothing is interrupted;
 *   • record the destination in the recents list the command palette reads.
 *
 * The <h1> focus is deliberately skipped on the very first render (a landing
 * page should not steal focus) and skipped when focus is inside the palette,
 * so ⌘K never steals the user's place.
 */
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { pushRecent } from "./command-palette";
import { documentTitle, normalizePath, titleFor } from "@/lib/nav";

export default function RouteAnnouncer({ schoolName }: { schoolName: string }) {
  const pathname = usePathname();
  const first = useRef(true);

  useEffect(() => {
    if (!pathname) return;
    const clean = normalizePath(pathname);
    document.title = documentTitle(pathname, schoolName);
    const label = titleFor(pathname);
    if (label) pushRecent(clean, label);

    if (first.current) { first.current = false; return; }
    if (document.querySelector(".palette-scrim")) return;

    const heading = document.querySelector<HTMLElement>("main h1, h1");
    if (!heading) return;
    heading.setAttribute("tabindex", "-1");
    heading.focus({ preventScroll: false });
  }, [pathname, schoolName]);

  const here = titleFor(pathname ?? "/");
  return (
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {here ? `${here} · ${schoolName}` : ""}
    </div>
  );
}
