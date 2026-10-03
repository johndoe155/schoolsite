"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { BASE_PATH } from "@/lib/base-path";
import { ATTENDANCE_STATUSES, type AttendanceStatus } from "@/lib/roles";
import {
  flushQueuedRegisters, getQueuedRegister, putQueuedRegister, queueKey,
  saveRosterSnapshot,
} from "@/lib/offline";

interface RosterRow { studentUserId: string; admissionNo: string; gradeLevel: number; displayName: string }
interface AttendanceRow { studentUserId: string; status: string; note: string | null }

export default function Register({ sectionId, sectionName, date, roster, initial, registerStatus }: {
  sectionId: string; sectionName: string; date: string; roster: RosterRow[];
  initial: AttendanceRow[]; registerStatus: string | null;
}) {
  const init = new Map(initial.map((r) => [r.studentUserId, r.status as AttendanceStatus]));
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>(
    Object.fromEntries(roster.map((s) => [s.studentUserId, init.get(s.studentUserId) ?? "present"])),
  );
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [final, setFinal] = useState(registerStatus === "final");
  const [queuedAt, setQueuedAt] = useState<string | null>(null);
  /* `navigator` does not exist while the page is rendered on the server, and
     reading it during render crashed the whole route with "ReferenceError:
     navigator is not defined" the first time this page was opened. The truth
     is only known in the browser, so it is read after mount and kept fresh. */
  const [online, setOnline] = useState(true);
  const keyRef = useRef<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  /**
   * Keep a copy of this class list on the device.
   *
   * Not for this screen — for the offline one. The portal is server-rendered,
   * so once the phone has no signal this page cannot be opened at all; the
   * only way a teacher can still mark the register is if the names are already
   * here. Written on every load so it follows roster changes.
   */
  useEffect(() => {
    if (roster.length === 0) return;
    void saveRosterSnapshot({
      key: queueKey(sectionId, date),
      sectionId, sectionName, date,
      students: roster.map((r) => ({
        studentUserId: r.studentUserId, displayName: r.displayName, admissionNo: r.admissionNo,
      })),
      marks: Object.fromEntries(roster.map((r) => [r.studentUserId, init.get(r.studentUserId) ?? "present"])),
      savedAt: new Date().toISOString(),
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionId, date, roster.length]);

  /**
   * A register that was marked offline on an earlier visit is restored here, so
   * a teacher who reopens the page (or comes back after a restart) sees the
   * marks they typed rather than a fresh all-present register. The queued copy
   * is what will be sent, so the UI must not diverge from it.
   */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const entry = await getQueuedRegister(sectionId, date);
        if (!entry || cancelled) return;
        keyRef.current = entry.idempotencyKey;
        setMarks((m) => ({ ...m, ...Object.fromEntries(entry.records.map((r) => [r.student_user_id, r.status as AttendanceStatus])) }));
        setQueuedAt(entry.savedAt);
        setInfo("Marks saved on this device — waiting to reach the school server.");
      } catch { /* no offline storage: the device keeps working online-only */ }
    })();
    return () => { cancelled = true; };
  }, [sectionId, date]);

  function mark(id: string, status: AttendanceStatus) {
    setErr(""); setInfo("");
    setMarks((m) => ({ ...m, [id]: status }));
  }

  /** Write the register to the device and try to send it. */
  async function persist(records: { student_user_id: string; status: string }[]) {
    const key = queueKey(sectionId, date);
    if (!keyRef.current) keyRef.current = crypto.randomUUID();
    const entry = {
      key, sectionId, date, records,
      idempotencyKey: keyRef.current,
      savedAt: new Date().toISOString(),
      lastError: null as string | null,
    };
    // Always queue first: if the tab is closed mid-request the marks already
    // exist on the device. The queue entry is removed once the server agrees.
    try { await putQueuedRegister(entry); setQueuedAt(entry.savedAt); } catch { /* online-only device */ }

    const result = await flushQueuedRegisters();
    const stillQueued = await getQueuedRegister(sectionId, date).catch(() => null);
    if (!stillQueued) {
      keyRef.current = null;   // delivered: the next save is a new register
      setQueuedAt(null);
      return { delivered: true, error: null as string | null };
    }
    return { delivered: false, error: stillQueued.lastError ?? (result.failed ? "Could not reach the server." : null) };
  }

  async function save() {
    setBusy(true); setErr(""); setInfo("");
    const records = roster.map((s) => ({ student_user_id: s.studentUserId, status: marks[s.studentUserId] }));
    const { delivered, error } = await persist(records);
    if (delivered) {
      setInfo(`Register saved for ${date}. You can keep editing until you finalize.`);
      router.refresh();
    } else if (online) {
      setErr(error ?? "Could not save the register. Try again in a moment.");
    } else {
      setInfo("No connection — the register is saved on this device and will be sent automatically.");
    }
    setBusy(false);
  }

  async function finalize() {
    if (!confirm(`Finalize the ${date} register? This locks it for edits.`)) return;
    setBusy(true); setErr("");
    try {
      // Finalizing must never happen on a server that has not seen the marks:
      // send the register first, then lock it.
      await save();
      await api(`/sections/${sectionId}/attendance/finalize`, { method: "POST", body: JSON.stringify({ date }) });
      setFinal(true);
      setInfo("Register finalized and locked.");
      router.refresh();
    } catch (e: any) {
      setErr(e?.message ?? "Finalize failed");
    }
    setBusy(false);
  }

  const counts = ATTENDANCE_STATUSES.map((st) => ({
    st, n: Object.values(marks).filter((v) => v === st).length,
  }));

  return (
    <>
      <h1>Daily register — {date}</h1>
      <div className="row muted">
        {counts.map(({ st, n }) => <span key={st}>{st}: <strong>{n}</strong></span>)}
        {queuedAt && <span className="chip on-late">saved offline {new Date(queuedAt).toLocaleTimeString()}</span>}
        {!online && <span className="chip on-absent">offline</span>}
      </div>
      {!online && (
        <div className="alert warn" role="status">
          No connection. Marks you save now are kept on this device and sent
          automatically — <a href={`${BASE_PATH}/offline-register`}>offline register</a>.
        </div>
      )}
      {err && <div className="alert err" role="alert">{err}</div>}
      {info && <div className="alert ok" role="status">{info}</div>}
      {final && <div className="alert err">This register is finalized — edits are locked.</div>}

      <div className="card">
        {roster.length === 0 && <div className="muted">No enrolled students.</div>}
        {roster.map((s) => (
          <div key={s.studentUserId} className="row" style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
            <div style={{ flex: 1, minWidth: 140 }}>
              <div>{s.displayName}</div>
              <div className="muted">{s.admissionNo} · Grade {s.gradeLevel}</div>
            </div>
            <div className="row" role="radiogroup" aria-label={`Attendance for ${s.displayName}`}>
              {ATTENDANCE_STATUSES.map((st) => (
                <button key={st} type="button" role="radio" aria-checked={marks[s.studentUserId] === st}
                  className={`chip ${marks[s.studentUserId] === st ? `on-${st}` : ""}`}
                  disabled={final} onClick={() => mark(s.studentUserId, st)}>
                  {st}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn" onClick={save} disabled={busy || final || roster.length === 0}>
          {busy ? "Saving…" : "Save register"}
        </button>
        <button className="btn danger" onClick={finalize} disabled={busy || final || roster.length === 0}>
          Finalize
        </button>
      </div>
      <p className="muted" style={{ marginTop: 8 }}>
        With no connection, Save keeps the register on this device and sends it
        automatically when the signal returns. Finalize needs a connection.{" "}
        {/* If the app is reloaded with no signal this page cannot render at all
            — this link is the way back in. It is precached. */}
        <a href={`${BASE_PATH}/offline-register`}>Open the offline register</a>.
      </p>
    </>
  );
}
