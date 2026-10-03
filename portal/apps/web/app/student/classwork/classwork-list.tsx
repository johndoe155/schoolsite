"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/client";
import { uploadFile, humanBytes, fileUrl } from "@/lib/upload";

/**
 * A pupil's homework list.
 *
 * Handing in is deliberately one screen: type a note, optionally attach a
 * photo of the work, press the button. Re-submitting replaces the previous
 * attempt (the API upserts), so "I attached the wrong page" is not a support
 * call — the pupil just does it again.
 */

export interface AssignmentRow {
  id: string; title: string; instructions: string | null; dueAt: string | null;
  sectionName: string | null; courseTitle: string | null;
  attachmentFileId: string | null; filename: string | null;
  submissionId: string | null; submissionText: string | null; submissionFileId: string | null;
  submittedAt: string | null;
}

function due(dueAt: string | null) {
  if (!dueAt) return { label: "no due date", overdue: false };
  const d = new Date(dueAt);
  return {
    label: d.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
    overdue: d.getTime() < Date.now(),
  };
}

export default function ClassworkList({ assignments }: { assignments: AssignmentRow[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [fileId, setFileId] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [pct, setPct] = useState<number | null>(null);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");

  async function attach(files: FileList | null) {
    if (!files?.[0]) return;
    setErr(""); setPct(0);
    try {
      const up = await uploadFile(files[0], setPct);
      setFileId(up.id); setFileName(up.filename);
    } catch (e) { setErr(e instanceof Error ? e.message : "Upload failed."); }
    setPct(null);
  }

  async function submit(id: string) {
    setErr(""); setInfo("");
    try {
      await api(`/assignments/${id}/submissions`, {
        method: "POST",
        body: JSON.stringify({ body_text: text || null, file_id: fileId }),
      });
      setOpen(null); setText(""); setFileId(null); setFileName("");
      setInfo("Handed in. Your teacher can see it now.");
      router.refresh();
    } catch (e) {
      setErr(e instanceof ApiError ? e.detail ?? e.message : "Could not hand it in.");
    }
  }

  if (assignments.length === 0) {
    return <div className="card muted">No homework has been set yet.</div>;
  }

  return (
    <>
      {err && <div className="alert err" role="alert">{err}</div>}
      {info && <div className="alert ok" role="status">{info}</div>}
      {assignments.map((a) => {
        const d = due(a.dueAt);
        const done = Boolean(a.submissionId);
        return (
          <div className="card" key={a.id}>
            <div className="row">
              <h2 style={{ margin: 0, flex: 1 }}>{a.title}</h2>
              <span className={`chip ${done ? "on-present" : d.overdue ? "on-absent" : "on-late"}`}>
                {done ? "handed in" : d.overdue ? "overdue" : "to do"}
              </span>
            </div>
            <div className="muted">
              {a.courseTitle ?? a.sectionName ?? "class"} · due {d.label}
            </div>
            {a.instructions && <p style={{ whiteSpace: "pre-wrap" }}>{a.instructions}</p>}
            {a.attachmentFileId && (
              <p><a className="btn ghost" href={fileUrl(a.attachmentFileId)}>Download {a.filename ?? "the sheet"}</a></p>
            )}
            {done && (
              <div className="muted">
                Handed in {a.submittedAt ? new Date(a.submittedAt).toLocaleString() : ""}
                {a.submissionFileId ? <> · <a href={fileUrl(a.submissionFileId)}>your file</a></> : null}
                {a.submissionText ? <> · “{a.submissionText}”</> : null}
              </div>
            )}
            {open === a.id ? (
              <div style={{ marginTop: 10 }}>
                <label htmlFor={`body-${a.id}`}>Your answer or a note (optional if you attach a file)</label>
                <textarea id={`body-${a.id}`} rows={3} value={text} onChange={(e) => setText(e.target.value)}
                  placeholder="Finished all ten questions." />
                <label htmlFor={`file-${a.id}`} style={{ marginTop: 8 }}>Photo or file (optional)</label>
                <input id={`file-${a.id}`} type="file" accept="image/*,application/pdf"
                  onChange={(e) => attach(e.target.files)} />
                {pct !== null && <div className="muted" role="status">Uploading… {pct}%</div>}
                {fileId && <div className="muted">Attached: {fileName}</div>}
                <div className="row" style={{ marginTop: 8 }}>
                  <button className="btn" disabled={pct !== null || (!text.trim() && !fileId)}
                    onClick={() => submit(a.id)}>Hand in</button>
                  <button className="btn ghost" onClick={() => { setOpen(null); setText(""); setFileId(null); setFileName(""); }}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button className="btn" style={{ marginTop: 8 }} onClick={() => { setOpen(a.id); setText(a.submissionText ?? ""); }}>
                {done ? "Hand in again" : "Hand in"}
              </button>
            )}
          </div>
        );
      })}
    </>
  );
}
