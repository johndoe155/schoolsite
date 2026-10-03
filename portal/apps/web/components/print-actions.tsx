"use client";
import Link from "next/link";

/**
 * The two buttons every printable document needs.
 *
 * The portal had no way to produce a document: a report card existed only as
 * text on a screen, and a fee payment existed only as a row in a table. Parents
 * asked the office to write receipts by hand.
 *
 * The browser's own print pipeline is the printer here — "Save as PDF" is a
 * destination in every modern browser, it needs no server-side PDF engine, and
 * what gets printed is exactly the sheet on screen (which is why the sheet has
 * its own stylesheet: no navigation, no buttons, A4 margins).
 */
export default function PrintActions({ backHref, backLabel, printLabel }: {
  backHref: string; backLabel: string; printLabel: string;
}) {
  return (
    <div className="sheet-actions">
      <button type="button" className="btn" onClick={() => window.print()}>{printLabel}</button>
      <Link className="btn ghost" href={backHref}>{backLabel}</Link>
      <span className="muted sheet-actions__hint">
        Choose “Save as PDF” in the print dialog to keep a copy.
      </span>
    </div>
  );
}
