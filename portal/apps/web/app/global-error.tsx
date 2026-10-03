"use client";
/**
 * Last-resort boundary: this one also replaces the root layout, so it has to
 * render <html>/<body> itself and cannot rely on the portal's stylesheet.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, padding: 32, background: "#f8fafc", color: "#0f172a" }}>
        <h1 style={{ color: "#05014A", fontSize: "1.25rem" }}>The portal could not start</h1>
        <p>The page failed before it could render. Nothing you saved has been lost.</p>
        {error.digest ? <p style={{ color: "#64748b", fontSize: ".9rem" }}>Reference: <code>{error.digest}</code></p> : null}
        <button
          onClick={() => reset()}
          style={{ background: "#05014A", color: "#fff", border: 0, borderRadius: 8, padding: "10px 16px", cursor: "pointer" }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
