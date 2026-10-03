"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/client";

/**
 * Set work for a section.
 *
 * The due field is a datetime, not a date, because the API takes a timestamptz
 * and "due Friday" and "due Friday 4pm" are different rules. The browser's
 * datetime-local input produces a local wall-clock string with no zone, so the
 * zone is attached here before sending — otherwise the value would be read as
 * UTC and every deadline would be off by the school's offset from Greenwich.
 */
export default function SetHomework({ sectionId }: { sectionId: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [due, setDue] = useState("");
  const [maxScore, setMaxScore] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      await api("/homework/assignments", {
        method: "POST",
        body: JSON.stringify({
          section_id: sectionId,
          title: title.trim(),
          instructions: instructions.trim() || null,
          // "2026-10-10T16:00" -> a zoned ISO string in the school's own time.
          due_at: new Date(due).toISOString(),
          max_score: maxScore ? Number(maxScore) : null,
        }),
      });
      setMsg({ kind: "ok", text: "Set." });
      setTitle(""); setInstructions(""); setDue(""); setMaxScore("");
      router.refresh();
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof ApiError ? (err.detail ?? err.message) : "Could not set." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card hw-set" onSubmit={save}>
      <h2 style={{ marginTop: 0 }}>Set homework</h2>
      <label>
        <span className="muted">Title</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required />
      </label>
      <label>
        <span className="muted">Instructions</span>
        <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={3} maxLength={20000} />
      </label>
      <div className="row">
        <label>
          <span className="muted">Due</span>
          <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} required />
        </label>
        <label>
          <span className="muted">Max score</span>
          <input type="number" min={1} max={1000} value={maxScore}
            onChange={(e) => setMaxScore(e.target.value)} placeholder="optional" />
        </label>
      </div>
      <div className="row">
        <button className="btn" type="submit" disabled={busy || !title.trim() || !due}>
          {busy ? "Setting…" : "Set homework"}
        </button>
      </div>
      {msg && <div className={msg.kind === "ok" ? "ok" : "err"} role="status">{msg.text}</div>}
    </form>
  );
}
