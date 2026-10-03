"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/client";

/**
 * Mark one student's submission.
 *
 * The maximum is enforced server-side; the client only hints at it. A form that
 * silently clamps a score to the maximum would record a mark the teacher did
 * not give.
 */
export default function MarkSubmission({ assignmentId, studentUserId, maxScore, current }: {
  assignmentId: string;
  studentUserId: string;
  maxScore: number | null;
  current: { score: number | null; feedback: string | null };
}) {
  const router = useRouter();
  const [score, setScore] = useState(current.score?.toString() ?? "");
  const [feedback, setFeedback] = useState(current.feedback ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      await api(`/homework/assignments/${assignmentId}/mark`, {
        method: "POST",
        body: JSON.stringify({
          student_user_id: studentUserId,
          score: score === "" ? null : Number(score),
          feedback: feedback.trim() || null,
        }),
      });
      setMsg({ kind: "ok", text: "Marked." });
      router.refresh();
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof ApiError ? (err.detail ?? err.message) : "Could not save." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="hw-mark" onSubmit={save}>
      <div className="row">
        <label>
          <span className="muted">Score{maxScore ? ` / ${maxScore}` : ""}</span>
          <input type="number" min={0} max={maxScore ?? 1000} value={score}
            onChange={(e) => setScore(e.target.value)} style={{ width: "6rem" }} />
        </label>
      </div>
      <label>
        <span className="muted">Feedback</span>
        <textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={2} maxLength={20000} />
      </label>
      <div className="row">
        <button className="btn" type="submit" disabled={busy}>{busy ? "Saving…" : "Save mark"}</button>
      </div>
      {msg && <div className={msg.kind === "ok" ? "ok" : "err"} role="status">{msg.text}</div>}
    </form>
  );
}
