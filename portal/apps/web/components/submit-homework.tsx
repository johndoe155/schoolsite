"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/client";

/**
 * Hand work in, or replace what was already handed in.
 *
 * The server decides whether a submission is late and returns the verdict; this
 * form shows it rather than computing it here. A client that says "on time"
 * from its own clock and is wrong tells a student something untrue about their
 * own record.
 */
export default function SubmitHomework({ assignmentId, current }: {
  assignmentId: string;
  current: { body: string | null; submitted: string | null; late: boolean } | null;
}) {
  const router = useRouter();
  const [text, setText] = useState(current?.body ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const res = await api<{ late: boolean }>(`/homework/assignments/${assignmentId}/submit`, {
        method: "POST",
        body: JSON.stringify({ body: text }),
      });
      setMsg({
        kind: "ok",
        text: res.late
          ? "Saved — recorded as late, because the deadline has passed."
          : "Submitted.",
      });
      router.refresh();
    } catch (err) {
      setMsg({
        kind: "err",
        text: err instanceof ApiError ? (err.detail ?? err.message) : "Could not submit.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="hw-submit" onSubmit={save}>
      <label>
        <span className="muted">Your work</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          maxLength={50000}
          placeholder="Type your answer, or paste it in."
        />
      </label>
      <div className="row">
        <button className="btn" type="submit" disabled={busy || text.trim().length === 0}>
          {busy ? "Submitting…" : current?.submitted ? "Update submission" : "Submit"}
        </button>
      </div>
      {msg && <div className={msg.kind === "ok" ? "ok" : "err"} role="status">{msg.text}</div>}
    </form>
  );
}
