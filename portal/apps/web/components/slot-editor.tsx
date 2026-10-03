"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/client";
import type { Period } from "./week-grid";

interface UserHit { id: string; displayName: string; email: string }

/**
 * Assign a teacher and room to one period.
 *
 * Teacher lookup is a search rather than a dropdown: /users takes a `q`
 * parameter but no role filter, and a school has hundreds of students whose
 * names would swamp a select. The clash rules live server-side — this form
 * deliberately does not try to pre-validate them, because a client that
 * guesses "no clash" and is wrong is worse than one that just asks.
 */
export default function SlotEditor({ period, sectionId }: { period: Period; sectionId: string }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<UserHit[]>([]);
  const [teacherId, setTeacherId] = useState<string>("");
  const [teacherName, setTeacherName] = useState<string>(period.teacher ?? "");
  const [room, setRoom] = useState(period.room ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (q.trim().length < 2) { setHits([]); return; }
    try {
      const res = await api<{ data: UserHit[] }>(`/users?q=${encodeURIComponent(q.trim())}&per=8`);
      setHits(res.data ?? []);
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof ApiError ? err.message : "Search failed." });
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      await api("/timetable/slots", {
        method: "POST",
        body: JSON.stringify({
          period_id: period.id,
          section_id: sectionId,
          // null clears, which is how a mis-assignment gets undone.
          teacher_user_id: teacherId || null,
          room: room.trim() || null,
        }),
      });
      setMsg({ kind: "ok", text: "Saved." });
      router.refresh();
    } catch (err) {
      // teacher_clash / section_clash / break_period carry a detail worth
      // showing verbatim; a generic "failed" hides the actual reason.
      setMsg({
        kind: "err",
        text: err instanceof ApiError ? (err.detail ?? err.message) : "Could not save.",
      });
    } finally {
      setBusy(false);
    }
  }

  if (period.isBreak) return null;

  return (
    <form className="tt-editor" onSubmit={save}>
      <details>
        <summary>{period.teacher ? "Change assignment" : "Assign"}</summary>

        <label>
          <span className="muted">Teacher</span>
          {teacherName ? <span> — {teacherName}</span> : null}
        </label>

        <div className="row">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name or email…"
            aria-label={`Search for a teacher for ${period.label ?? "period " + period.index}`}
          />
          <button type="button" className="btn ghost" onClick={search}>Find</button>
        </div>

        {hits.length > 0 && (
          <ul className="tt-hits">
            {hits.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  className={teacherId === u.id ? "btn" : "btn ghost"}
                  onClick={() => { setTeacherId(u.id); setTeacherName(u.displayName); setHits([]); }}
                >
                  {u.displayName} <span className="muted">{u.email}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {teacherId && (
          <button type="button" className="btn ghost"
            onClick={() => { setTeacherId(""); setTeacherName(""); }}>
            Clear teacher
          </button>
        )}

        <label>
          <span className="muted">Room</span>
          <input value={room} onChange={(e) => setRoom(e.target.value)} maxLength={80}
            placeholder="e.g. Block B, Room 3" />
        </label>

        <div className="row">
          <button className="btn" type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        </div>

        {msg && <div className={msg.kind === "ok" ? "ok" : "err"} role="status">{msg.text}</div>}
      </details>
    </form>
  );
}
