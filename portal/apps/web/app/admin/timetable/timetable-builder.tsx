"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/client";

/**
 * The timetable builder.
 *
 * Two halves, because the two jobs are different:
 *
 *   1. The BELL SCHEDULE — which periods exist on which days. It belongs to the
 *      term, not to a class, and it is replaced as a whole (the API deletes and
 *      reinserts), because a half-merged schedule leaves orphaned periods that
 *      silently swallow lessons.
 *   2. The GRID — which class is in which period, with which teacher and room.
 *
 * The grid shows EVERY section side by side. That is the point: a clash ("Tayo
 * Teacher is in Room 4 and Room 9 at 08:45") is invisible one class at a time
 * and obvious in a row. The server refuses clashes too, but nobody should learn
 * about them one failed save at a time.
 */

interface Period {
  id: string; weekday: number; periodIndex: number; label: string | null;
  startsAt: string; endsAt: string; isBreak: boolean;
}
interface Section { id: string; name: string; code: string; title: string }
interface Slot {
  id: string; periodId: string; sectionId: string; sectionName: string | null;
  courseTitle: string | null; teacherUserId: string | null; teacherName: string | null;
  room: string | null;
}
interface Teacher { id: string; name: string }

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type DraftPeriod = {
  weekday: number; period_index: number; label: string;
  starts_at: string; ends_at: string; is_break: boolean;
};

export default function TimetableBuilder({
  termId, termName, periods, sections, slots, teachers,
}: {
  termId: string; termName: string; periods: Period[]; sections: Section[];
  slots: Slot[]; teachers: Teacher[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"grid" | "bells">("grid");
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  /* Which cell is open for editing: `${periodId}:${sectionId}`. */
  const [openCell, setOpenCell] = useState<string | null>(null);
  const [cellTeacher, setCellTeacher] = useState("");
  const [cellRoom, setCellRoom] = useState("");

  const [draft, setDraft] = useState<DraftPeriod[]>(() =>
    periods.length
      ? periods.map((p) => ({
          weekday: p.weekday, period_index: p.periodIndex, label: p.label ?? "",
          starts_at: p.startsAt.slice(0, 5), ends_at: p.endsAt.slice(0, 5), is_break: p.isBreak,
        }))
      : [{ weekday: 1, period_index: 1, label: "Period 1", starts_at: "08:00", ends_at: "08:40", is_break: false }]);

  const slotAt = useMemo(() => {
    const m = new Map<string, Slot>();
    for (const s of slots) m.set(`${s.periodId}:${s.sectionId}`, s);
    return m;
  }, [slots]);

  const sortedPeriods = useMemo(
    () => [...periods].sort((a, b) => (a.weekday - b.weekday) || (a.periodIndex - b.periodIndex)),
    [periods],
  );

  /**
   * Client-side clash check — advisory only. It exists so the person building
   * the timetable sees the problem as they type; the server still enforces it.
   */
  const clashes = useMemo(() => {
    const seen = new Map<string, string>();
    const out = new Set<string>();
    for (const s of slots) {
      if (!s.teacherUserId) continue;
      const key = `${s.periodId}:${s.teacherUserId}`;
      if (seen.has(key)) out.add(`${seen.get(key)} and ${s.sectionName} both use ${s.teacherName}`);
      else seen.set(key, s.sectionName ?? "a section");
    }
    return [...out];
  }, [slots]);

  async function saveCell(periodId: string, sectionId: string) {
    setBusy(true); setErr(""); setInfo("");
    try {
      await api("/timetable/slots", {
        method: "POST",
        body: JSON.stringify({
          period_id: periodId, section_id: sectionId,
          teacher_user_id: cellTeacher || null,
          room: cellRoom || null,
        }),
      });
      setOpenCell(null); setInfo("Lesson placed."); router.refresh();
    } catch (e) {
      setErr(e instanceof ApiError
        ? (e.code === "teacher_clash" ? "That teacher already has a class in this period."
          : e.code === "section_clash" ? "That section already has a lesson in this period."
          : e.code === "break_period" ? "This is a break — nothing can be taught in it."
          : e.detail ?? e.message)
        : "Could not save the lesson.");
    }
    setBusy(false);
  }

  async function clearCell(slotId: string) {
    setBusy(true); setErr("");
    try {
      await api(`/timetable/slots/${slotId}`, { method: "DELETE" });
      setOpenCell(null); setInfo("Lesson cleared — the period is free."); router.refresh();
    } catch (e) { setErr(e instanceof ApiError ? e.detail ?? e.message : "Could not clear it."); }
    setBusy(false);
  }

  /** The selected section's timetable only — export is per class. */
  async function saveBells() {
    setBusy(true); setErr(""); setInfo("");
    try {
      await api(`/timetable/terms/${termId}/periods`, {
        method: "POST", body: JSON.stringify(draft),
      });
      setInfo("Bell schedule saved. Existing lessons keep their periods where the times did not change.");
      setTab("grid"); router.refresh();
    } catch (e) { setErr(e instanceof ApiError ? e.detail ?? e.message : "Could not save the bell schedule."); }
    setBusy(false);
  }

  async function removePeriod(id: string) {
    if (!confirm("Remove this period? Any lesson in it is removed too.")) return;
    setBusy(true); setErr("");
    try {
      await api(`/timetable/periods/${id}`, { method: "DELETE" });
      router.refresh();
    } catch (e) { setErr(e instanceof ApiError ? e.detail ?? e.message : "Could not remove it."); }
    setBusy(false);
  }

  return (
    <>
      <h1>Timetable — {termName}</h1>
      <div className="row" role="tablist" style={{ marginBottom: 12 }}>
        <button className={`btn ${tab === "grid" ? "" : "ghost"}`} role="tab" aria-selected={tab === "grid"}
          onClick={() => setTab("grid")}>Week grid</button>
        <button className={`btn ${tab === "bells" ? "" : "ghost"}`} role="tab" aria-selected={tab === "bells"}
          onClick={() => setTab("bells")}>Bell schedule</button>
      </div>

      {err && <div className="alert err" role="alert">{err}</div>}
      {info && <div className="alert ok" role="status">{info}</div>}
      {clashes.length > 0 && (
        <div className="alert warn" role="status">
          <strong>Possible clashes:</strong>
          <ul style={{ margin: "6px 0 0 18px" }}>
            {clashes.map((c) => <li key={c}>{c}</li>)}
          </ul>
        </div>
      )}

      {tab === "grid" && (
        <>
          {sortedPeriods.length === 0 ? (
            <div className="card muted">
              This term has no bell schedule yet. Open <strong>Bell schedule</strong> and add the
              school day&apos;s periods first.
            </div>
          ) : (
            <div className="card" style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th style={{ position: "sticky", left: 0, background: "var(--card)" }}>Period</th>
                    {sections.map((s) => <th key={s.id}>{s.name}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {sortedPeriods.map((p) => (
                    <tr key={p.id}>
                      <th scope="row" style={{ position: "sticky", left: 0, background: "var(--card)", textAlign: "left" }}>
                        <div>{p.label ?? `Period ${p.periodIndex}`}</div>
                        <div className="muted">
                          {DAY_SHORT[p.weekday]} · {p.startsAt.slice(0, 5)}–{p.endsAt.slice(0, 5)}
                        </div>
                      </th>
                      {sections.map((s) => {
                        const key = `${p.id}:${s.id}`;
                        const slot = slotAt.get(key);
                        if (p.isBreak) {
                          return <td key={key} className="muted" style={{ textAlign: "center" }}>break</td>;
                        }
                        if (openCell === key) {
                          return (
                            <td key={key} style={{ minWidth: 220 }}>
                              <label className="muted" htmlFor={`t-${key}`}>Teacher</label>
                              <select id={`t-${key}`} value={cellTeacher} onChange={(e) => setCellTeacher(e.target.value)}>
                                <option value="">— none —</option>
                                {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                              </select>
                              <label className="muted" htmlFor={`r-${key}`} style={{ marginTop: 6 }}>Room</label>
                              <input id={`r-${key}`} value={cellRoom} onChange={(e) => setCellRoom(e.target.value)}
                                placeholder="Room 12" />
                              <div className="row" style={{ marginTop: 8 }}>
                                <button className="btn" disabled={busy}
                                  onClick={() => saveCell(p.id, s.id)}>Save</button>
                                {slot && (
                                  <button className="btn danger" disabled={busy}
                                    onClick={() => clearCell(slot.id)}>Clear</button>
                                )}
                                <button className="btn ghost" onClick={() => setOpenCell(null)}>Cancel</button>
                              </div>
                            </td>
                          );
                        }
                        return (
                          <td key={key} style={{ cursor: "pointer" }}
                            onClick={() => {
                              setOpenCell(key);
                              setCellTeacher(slot?.teacherUserId ?? "");
                              setCellRoom(slot?.room ?? "");
                            }}>
                            {slot ? (
                              <>
                                <div>{slot.courseTitle ?? s.title}</div>
                                <div className="muted">{slot.teacherName ?? "no teacher"}{slot.room ? ` · ${slot.room}` : ""}</div>
                              </>
                            ) : <span className="muted">free — tap to fill</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="muted">
            Tap any cell to place a lesson. Free periods are a real state — they are
            shown as free rather than filled with a placeholder.
          </p>
        </>
      )}

      {tab === "bells" && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Bell schedule for this term</h2>
          <p className="muted">
            One bell schedule for the whole school. Saving replaces the term&apos;s
            periods as a set — remove a period and its lessons go with it.
          </p>
          <table>
            <thead>
              <tr><th>Day</th><th>#</th><th>Label</th><th>Starts</th><th>Ends</th><th>Break</th><th /></tr>
            </thead>
            <tbody>
              {draft.map((p, i) => (
                <tr key={i}>
                  <td>
                    <select aria-label="Day" value={p.weekday}
                      onChange={(e) => setDraft((d) => d.map((x, j) => j === i ? { ...x, weekday: Number(e.target.value) } : x))}>
                      {DAYS.map((d, idx) => <option key={d} value={idx}>{d}</option>)}
                    </select>
                  </td>
                  <td>
                    <input aria-label="Period number" style={{ width: 60 }} value={p.period_index}
                      onChange={(e) => setDraft((d) => d.map((x, j) => j === i ? { ...x, period_index: Number(e.target.value) || 1 } : x))} />
                  </td>
                  <td>
                    <input aria-label="Label" value={p.label}
                      onChange={(e) => setDraft((d) => d.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} />
                  </td>
                  <td>
                    <input aria-label="Starts at" type="time" value={p.starts_at}
                      onChange={(e) => setDraft((d) => d.map((x, j) => j === i ? { ...x, starts_at: e.target.value } : x))} />
                  </td>
                  <td>
                    <input aria-label="Ends at" type="time" value={p.ends_at}
                      onChange={(e) => setDraft((d) => d.map((x, j) => j === i ? { ...x, ends_at: e.target.value } : x))} />
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <input aria-label="Is a break" type="checkbox" checked={p.is_break}
                      onChange={(e) => setDraft((d) => d.map((x, j) => j === i ? { ...x, is_break: e.target.checked } : x))} />
                  </td>
                  <td>
                    {periods[i] && (
                      <button className="btn danger" disabled={busy}
                        onClick={() => removePeriod(periods[i].id)}>Remove</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn ghost"
              onClick={() => setDraft((d) => [...d, {
                weekday: d.at(-1)?.weekday ?? 1,
                period_index: (d.at(-1)?.period_index ?? 0) + 1,
                label: "", starts_at: "10:00", ends_at: "10:40", is_break: false,
              }])}>Add period</button>
            <button className="btn" disabled={busy || draft.length === 0} onClick={saveBells}>
              {busy ? "Saving…" : "Save bell schedule"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
