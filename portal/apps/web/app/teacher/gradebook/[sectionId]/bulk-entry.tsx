"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";

interface RosterRow { studentUserId: string; admissionNo: string; displayName: string }
interface GradeRow {
  id: string; studentUserId: string; label: string; sourceType: string;
  points: string; maxPoints: string; releasedAt: string | null; feedbackText: string | null;
}
interface ExamRow { id: string; title: string; examDate: string; maxScore: string; weightPct: string | null }

/**
 * Mark a whole class for one piece of work.
 *
 * The gradebook used to offer one pupil at a time through a form: pick a name,
 * type a mark, save, repeat thirty times, with a fresh form every round. The
 * API had accepted a batch all along (`POST /sections/:id/grades/bulk`, whose
 * contract allows 500 items and reports corrections), so the cost was entirely
 * in this screen — and marking a class set was the single slowest task in the
 * portal.
 *
 * Now: name the work once, then type down the column. Rows are prefilled from
 * any marks already recorded under the same label, so opening a set for
 * corrections shows what is there instead of a blank grid that would look like
 * nobody had been marked. Empty rows are skipped — a pupil who was away does
 * not get a zero, they get no row at all.
 */
export default function BulkEntry({ sectionId, roster, grades, exams, onSaved }: {
  sectionId: string; roster: RosterRow[]; grades: GradeRow[]; exams: ExamRow[];
  onSaved: (info: string) => void;
}) {
  const [label, setLabel] = useState("");
  const [sourceType, setSourceType] = useState<"custom" | "assignment" | "exam">("custom");
  const [examId, setExamId] = useState("");
  const [maxPoints, setMaxPoints] = useState("100");
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [showNotes, setShowNotes] = useState(false);
  const [prefilled, setPrefilled] = useState(0);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  /* Existing marks for the label being entered, keyed by pupil. Exam-linked
     rows are excluded: the same label can legitimately exist for a specific
     exam as well as for coursework, and mixing them would prefill a mark from
     the wrong column. */
  const existing = useMemo(() => {
    const want = label.trim().toLowerCase();
    const map: Record<string, GradeRow> = {};
    if (!want) return map;
    for (const g of grades) {
      if (g.sourceType !== sourceType) continue;
      if (g.label.trim().toLowerCase() !== want) continue;
      map[g.studentUserId] = g;
    }
    return map;
  }, [grades, label, sourceType]);

  /* Prefill whenever the label identifies a set that already exists. Only
     fills cells the teacher has not typed into, so a reload of the page or an
     unrelated re-render cannot wipe work in progress. */
  useEffect(() => {
    if (Object.keys(existing).length === 0) { setPrefilled(0); return; }
    setMarks((prev) => {
      const next = { ...prev };
      let filled = 0;
      for (const [studentId, g] of Object.entries(existing)) {
        if (next[studentId] === undefined) { next[studentId] = g.points; filled++; }
      }
      setPrefilled(filled);
      return next;
    });
    setNotes((prev) => {
      const next = { ...prev };
      for (const [studentId, g] of Object.entries(existing)) {
        if (next[studentId] === undefined && g.feedbackText) next[studentId] = g.feedbackText;
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [label, sourceType, grades]);

  const max = Number(maxPoints);
  const maxValid = maxPoints.trim() !== "" && Number.isFinite(max) && max > 0;
  const filled = roster.filter((r) => (marks[r.studentUserId] ?? "").trim() !== "");

  function overMax(value: string): boolean {
    const n = Number(value);
    return maxValid && value.trim() !== "" && Number.isFinite(n) && n > max;
  }
  const anyOverMax = filled.some((r) => overMax(marks[r.studentUserId]));
  const anyInvalid = filled.some((r) => !Number.isFinite(Number(marks[r.studentUserId])));
  const canSave = Boolean(label.trim()) && maxValid && filled.length > 0 && !anyOverMax && !anyInvalid && !busy;

  async function save() {
    if (!canSave) return;
    setBusy(true); setErr("");
    try {
      const items = filled.map((r) => ({
        student_user_id: r.studentUserId,
        source_type: sourceType,
        label: label.trim(),
        points: String(Number(marks[r.studentUserId])),
        max_points: String(max),
        ...(sourceType === "exam" && examId ? { source_id: examId } : {}),
        ...((notes[r.studentUserId] ?? "").trim()
          ? { feedback_text: (notes[r.studentUserId] ?? "").trim() } : {}),
      }));
      const out = await api<{ written: number; revisions: number }>(`/sections/${sectionId}/grades/bulk`, {
        method: "POST",
        idempotencyKey: crypto.randomUUID(),
        body: JSON.stringify({ items }),
      });
      onSaved(`${out.written} mark(s) saved${out.revisions ? ` (${out.revisions} corrected)` : ""}. ` +
        `Release them when you are ready for families to see them.`);
      setMarks({}); setNotes({}); setPrefilled(0);
      router.refresh();
    } catch (e: any) {
      setErr(e?.code === "grade_exceeds_max"
        ? "A mark is higher than the maximum for this set."
        : e?.message ?? "Could not save these marks.");
    }
    setBusy(false);
  }

  /* A whole column typed in one go is easy to get wrong by one row, so the
     numbers are shown against the roster in order and the counts are stated
     before saving. */
  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Enter marks for the class</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        One row per pupil. Leave anyone who did not sit the work blank — a blank is not a zero.
      </p>
      {err && <div className="alert err" role="alert">{err}</div>}

      <div className="grid cols3">
        <div>
          <label htmlFor="bulk-label">What is being marked</label>
          <input id="bulk-label" value={label} onChange={(e) => setLabel(e.target.value)}
            placeholder="Quiz 3 · Essay draft · Week 6 test" maxLength={120} />
        </div>
        <div>
          <label htmlFor="bulk-max">Out of</label>
          <input id="bulk-max" inputMode="decimal" value={maxPoints}
            onChange={(e) => setMaxPoints(e.target.value)} />
        </div>
        <div>
          <label htmlFor="bulk-type">Type</label>
          <select id="bulk-type" value={sourceType}
            onChange={(e) => {
              const next = e.target.value as typeof sourceType;
              setSourceType(next);
              setExamId("");
              /* Marks recorded as classwork and marks recorded as an exam are
                 different rows, so a change of type has to reset the grid
                 rather than silently retype what is on screen. */
              setMarks({}); setNotes({}); setPrefilled(0);
            }}>
            <option value="custom">Classwork / custom</option>
            <option value="assignment">Assignment</option>
            <option value="exam">Exam</option>
          </select>
        </div>
      </div>

      {sourceType === "exam" && exams.length > 0 && (
        <div style={{ maxWidth: 340 }}>
          <label htmlFor="bulk-exam">Exam</label>
          <select id="bulk-exam" value={examId} onChange={(e) => setExamId(e.target.value)}>
            <option value="">— no specific exam —</option>
            {exams.map((x) => <option key={x.id} value={x.id}>{x.title} ({x.examDate})</option>)}
          </select>
        </div>
      )}

      {prefilled > 0 && (
        <div className="muted" style={{ marginTop: 8 }}>
          {prefilled} existing mark(s) for “{label.trim()}” loaded — change a number to correct it.
        </div>
      )}

      {!label.trim() ? (
        <div className="muted" style={{ marginTop: 12 }}>
          Name the work above, then the class list appears here.
        </div>
      ) : (
        <>
          <div className="row" style={{ justifyContent: "space-between", marginTop: 12 }}>
            <span className="muted">{filled.length} of {roster.length} filled</span>
            <button type="button" className="btn ghost" onClick={() => setShowNotes((v) => !v)}>
              {showNotes ? "Hide feedback column" : "Add a feedback column"}
            </button>
          </div>
          <table>
            <thead>
              <tr>
                <th>Pupil</th>
                {showNotes && <th>Feedback (optional)</th>}
                <th style={{ width: 130 }}>Mark{maxValid ? ` / ${max}` : ""}</th>
                <th style={{ width: 90 }}>Was</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((r) => {
                const value = marks[r.studentUserId] ?? "";
                const before = existing[r.studentUserId]?.points;
                const bad = overMax(value) || (value.trim() !== "" && !Number.isFinite(Number(value)));
                return (
                  <tr key={r.studentUserId}>
                    <td>
                      {r.displayName}
                      <div className="muted">{r.admissionNo}</div>
                    </td>
                    {showNotes && (
                      <td>
                        <input value={notes[r.studentUserId] ?? ""} maxLength={2000}
                          aria-label={`Feedback for ${r.displayName}`}
                          onChange={(e) => setNotes((p) => ({ ...p, [r.studentUserId]: e.target.value }))} />
                      </td>
                    )}
                    <td>
                      <input
                        inputMode="decimal" value={value}
                        aria-label={`Mark for ${r.displayName}`}
                        aria-invalid={bad || undefined}
                        style={bad ? { borderColor: "var(--bad)" } : undefined}
                        onChange={(e) => setMarks((p) => ({ ...p, [r.studentUserId]: e.target.value }))} />
                    </td>
                    <td className="muted">
                      {before ?? "—"}
                      {before !== undefined && String(before) !== value && value.trim() !== "" ? " →" : ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {anyOverMax && <div className="alert err" role="alert">A mark is higher than {max}. Fix it before saving.</div>}
          {anyInvalid && <div className="alert err" role="alert">Every mark must be a number.</div>}
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn" onClick={save} disabled={!canSave}>
              {busy ? "Saving…" : `Save ${filled.length || ""} mark${filled.length === 1 ? "" : "s"}`.trim()}
            </button>
            <button type="button" className="btn ghost" disabled={busy}
              onClick={() => { setMarks({}); setNotes({}); setPrefilled(0); }}>Clear the column</button>
          </div>
        </>
      )}
    </div>
  );
}
