"use client";
import { useEffect, useRef, useState } from "react";
import { flushQueuedRegisters, listQueuedRegisters } from "@/lib/offline";

/**
 * Registers the service worker and keeps the offline attendance queue moving.
 *
 * Deliberately no inline <script>: the portal's CSP carries a per-request nonce
 * and a bundled component avoids the whole question. Nothing here is required
 * for the portal to work — if the browser has no service-worker support, or the
 * user has cleared storage, the portal behaves exactly as it did before.
 */
export default function PwaRegister() {
  const [pending, setPending] = useState(0);
  /* A register that the server REJECTED is not "waiting for a connection".
     Saying so would leave a teacher waiting for a sync that is never coming:
     409 means the register was finalized elsewhere, 422 means a pupil in the
     marks is no longer enrolled, 403 means the session ended. Those need a
     human, so they are reported separately. */
  const [rejected, setRejected] = useState<string[]>([]);
  const syncRef = useRef<() => Promise<void>>(async () => {});
  const syncNow = () => syncRef.current();

  useEffect(() => {
    // 1. Service worker (best effort — private mode and old browsers simply skip it).
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/portal/sw.js", { scope: "/portal/" }).catch(() => {});
    }

    // 2. Push anything that was marked offline on a previous visit.
    let cancelled = false;
    async function sync() {
      try {
        const before = await listQueuedRegisters();
        if (!cancelled) setPending(before.length);
        await flushQueuedRegisters();
        const after = await listQueuedRegisters();
        if (cancelled) return;
        setPending(after.length);
        setRejected(after.filter((e) => e.lastError).map((e) => `${e.date}: ${e.lastError}`));
      } catch { /* offline storage unavailable — the register screen says so */ }
    }
    void sync();

    syncRef.current = sync;
    const onOnline = () => void sync();
    window.addEventListener("online", onOnline);
    // Retry periodically while the tab is open: `online` does not fire on a
    // captive-portal connection that technically never dropped.
    const timer = window.setInterval(() => {
      if (navigator.onLine) void sync();
    }, 60_000);

    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
      window.clearInterval(timer);
    };
  }, []);

  if (pending === 0 && rejected.length === 0) return null;
  return (
    <div className={`alert ${rejected.length ? "err" : "warn"}`} role="status" style={{ marginTop: 12 }}>
      {rejected.length > 0 && (
        <div>
          <strong>The school server refused {rejected.length} saved register{rejected.length === 1 ? "" : "s"}:</strong>
          <ul style={{ margin: "6px 0 0 18px" }}>
            {rejected.map((r) => <li key={r}>{r}</li>)}
          </ul>
          <div>Re-take the register for those dates, or ask the office to unlock it.</div>
        </div>
      )}
      {pending > 0 && (
        <div style={{ marginTop: rejected.length ? 8 : 0 }}>
          <strong>{pending} register{pending === 1 ? "" : "s"} saved on this device</strong>
          {" "}— waiting for a connection.{" "}
          <button type="button" className="btn ghost" onClick={() => void syncNow()}>Send now</button>
        </div>
      )}
    </div>
  );
}
