"use client";
import Link from "next/link";
import { useEffect } from "react";

/**
 * Route-level error boundary.
 *
 * Without this, a thrown server component (a database blip, one bad row) shows
 * Next's unbranded "Application error" screen: no navigation, no explanation,
 * and no way back other than editing the URL. A school's staff should see the
 * school's own page and a way to carry on.
 */
export default function ErrorScreen({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Surfaced in the browser console; the server logs the same digest.
    console.error("[portal] route error", error.digest ?? "", error.message);
  }, [error]);

  return (
    <div className="container" style={{ maxWidth: 560, paddingTop: 48 }}>
      <h1>Something went wrong</h1>
      <div className="alert err" role="alert">
        This page could not be loaded. Nothing you saved has been lost.
      </div>
      <p className="muted">
        {error.digest ? <>Reference: <code>{error.digest}</code>. </> : null}
        If it keeps happening, tell the school office and quote that reference.
      </p>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn" onClick={() => reset()}>Try again</button>
        <Link className="btn ghost" href="/">Back to the portal</Link>
      </div>
    </div>
  );
}
