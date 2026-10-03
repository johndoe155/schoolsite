"use client";
/**
 * The offline register.
 *
 * This page exists because "the marks are saved on the device" and "the teacher
 * can still take the register" are different promises, and only the second one
 * is worth making. The portal is server-rendered: with no signal, navigating to
 * /teacher/attendance/<section> yields no HTML at all. So this screen is a
 * client-only route with no data of its own — the service worker precaches it,
 * and everything it shows comes out of IndexedDB on this device.
 *
 * It is deliberately usable without a session. If it demanded one, it would
 * demand a network call, which is precisely what is missing. What it can show
 * is limited to what this device already holds, and it offers a button to wipe
 * that — see clearDeviceData().
 */
import { useEffect, useState } from "react";
import { ATTENDANCE_STATUSES, type AttendanceStatus } from "@/lib/roles";
import {
  clearDeviceData, flushQueuedRegisters, getQueuedRegister, listQueuedRegisters,
  listRosterSnapshots, putQueuedRegister, queueKey, saveRosterSnapshot,
  type RosterSnapshot,
} from "@/lib/offline";

export default function OfflineRegisterPage() {
  const [snapshots, setSnapshots] = useState<RosterSnapshot[] | null>(null);
  const [active, setActive] = useState<RosterSnapshot | null>(null);
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>({});
  const [state, setState] = useState<"idle" | "saving" | "queued" | "sent" | "error">("idle");
  const [note, setNote] = useState("");
  const [online, setOnline] = useState(false);
  const [unsupported, setUnsupported] = useState(false);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    void (async () => {
      try {
        const rows = await listRosterSnapshots();
        setSnapshots(rows);
        const first = rows[0] ?? null;
        setActive(first);
        if (first) setMarks(first.marks as Record<string, AttendanceStatus>);
      } catch {
        setUnsupported(true);
      }
    })();
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  function open(snap: RosterSnapshot) {
    setActive(snap);
    setMarks(snap.marks as Record<string, AttendanceStatus>);
    setState("idle");
    setNote("");
  }

  async function save() {
    if (!active) return;
    setState("saving");
    setNote("");
    try {
      // Keep the snapshot current even before the send succeeds: if the tab is
      // closed now, the teacher's marks are still on the device.
      const updated: RosterSnapshot = { ...active, marks, savedAt: new Date().toISOString() };
      await saveRosterSnapshot(updated);
      setActive(updated);

      const key = queueKey(active.sectionId, active.date);
      const existing = await getQueuedRegister(active.sectionId, active.date);
      await putQueuedRegister({
        key,
        sectionId: active.sectionId,
        date: active.date,
        records: active.students.map((s) => ({
          student_user_id: s.studentUserId,
          status: marks[s.studentUserId] ?? "present",
        })),
        // Reuse the key from a previous attempt: the server treats a replay as
        // the same register, so a doubled send never doubles the marks.
        idempotencyKey: existing?.idempotencyKey ?? crypto.randomUUID(),
        savedAt: new Date().toISOString(),
        lastError: null,
      });

      const result = await flushQueuedRegisters();
      if (result.sent > 0) {
        // Finalized elsewhere or a rejected pupil: the entry is gone only on
        // success, so anything still queued is still here to look at.
        const left = await listQueuedRegisters();
        if (left.length === 0) { setState("sent"); setNote("Register sent to the school server."); return; }
      }
      const still = await listQueuedRegisters();
      setState("queued");
      setNote(still.some((e) => e.lastError)
        ? "Saved on this device, but the school server refused it — sign in again and reopen the register page."
        : "Saved on this device. It will send itself when the connection returns.");
    } catch (e) {
      setState("error");
      setNote(e instanceof Error ? e.message : "Could not save on this device.");
    }
  }

  async function sendNow() {
    setState("saving");
    const result = await flushQueuedRegisters();
    setState(result.remaining === 0 ? "sent" : "queued");
    setNote(result.remaining === 0
      ? "All queued registers have been sent."
      : `${result.remaining} register${result.remaining === 1 ? "" : "s"} still waiting.`);
  }

  if (unsupported) {
    return (
      <div className="container" style={{ maxWidth: 640, paddingTop: 32 }}>
        <h1>Offline register</h1>
        <div className="alert err">
          This browser will not store data offline, so the register cannot be
          taken without a connection here. Try Safari or Chrome, and avoid
          private browsing.
        </div>
      </div>
    );
  }

  return (
    <div className="container" style={{ maxWidth: 720, paddingTop: 24 }}>
      <h1>Offline register</h1>
      <p className="muted">
        Registers marked here are stored on this device and sent to the school
        server automatically — nothing is lost if you close the tab.
        {" "}
        <span className={`chip ${online ? "on-present" : "on-absent"}`} style={{ cursor: "default" }}>
          {online ? "online" : "offline"}
        </span>
      </p>

      {state === "queued" || state === "sent" || state === "error" ? (
        <div className={`alert ${state === "error" ? "err" : state === "sent" ? "ok" : "warn"}`} role="status">
          {note}
        </div>
      ) : null}

      {snapshots === null ? <div className="card muted">Reading this device…</div> : null}

      {snapshots !== null && snapshots.length === 0 ? (
        <div className="card muted">
          No class list has been opened on this device yet. Open a register while
          you still have a connection and it will be kept here for next time.
        </div>
      ) : null}

      {snapshots !== null && snapshots.length > 0 ? (
        <>
          <div className="card">
            <label htmlFor="pick">Class and date</label>
            <select
              id="pick"
              value={active?.key ?? ""}
              onChange={(e) => {
                const snap = snapshots.find((s) => s.key === e.target.value);
                if (snap) open(snap);
              }}
            >
              {snapshots.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.sectionName} — {s.date}
                </option>
              ))}
            </select>
          </div>

          {active ? (
            <div className="card">
              {active.students.map((s) => (
                <div key={s.studentUserId} className="row"
                  style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
                  <div style={{ flex: 1, minWidth: 140 }}>
                    <div>{s.displayName}</div>
                    <div className="muted">{s.admissionNo}</div>
                  </div>
                  <div className="row" role="radiogroup" aria-label={`Attendance for ${s.displayName}`}>
                    {ATTENDANCE_STATUSES.map((st) => (
                      <button
                        key={st}
                        type="button"
                        role="radio"
                        aria-checked={marks[s.studentUserId] === st}
                        className={`chip ${marks[s.studentUserId] === st ? `on-${st}` : ""}`}
                        onClick={() => setMarks((m) => ({ ...m, [s.studentUserId]: st }))}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <div className="row" style={{ marginTop: 12 }}>
                <button className="btn" onClick={save} disabled={state === "saving"}>
                  {state === "saving" ? "Saving…" : "Save register"}
                </button>
                <button className="btn ghost" onClick={sendNow} disabled={!online || state === "saving"}>
                  Send now
                </button>
              </div>
            </div>
          ) : null}

          <div className="row" style={{ marginTop: 12 }}>
            <button
              className="btn danger"
              onClick={async () => {
                if (!confirm("Remove every register and class list stored on this device?")) return;
                await clearDeviceData();
                setSnapshots([]);
                setActive(null);
                setState("idle");
                setNote("");
              }}
            >
              Clear data on this device
            </button>
          </div>
          <p className="muted">
            Finalizing a register needs a connection — it locks the register for
            everyone. What you can always do offline is mark the class.
          </p>
        </>
      ) : null}
    </div>
  );
}
