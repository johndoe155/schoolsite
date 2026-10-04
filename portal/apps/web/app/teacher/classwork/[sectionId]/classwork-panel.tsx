"use client";
import { useEffect, useRef, useState } from "react";
import { SkeletonTable } from "@/components/skeleton";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "@/lib/client";
import { uploadFile, humanBytes, fileUrl, type UploadedFile } from "@/lib/upload";

/**
 * A teacher's classwork console for one section: homework, materials, hand-ins.
 *
 * Everything a teacher types here has to survive a bad connection, so the two
 * things that matter are (a) uploads show progress and fail with a readable
 * reason, and (b) nothing is "created" until the file has landed — an
 * assignment pointing at a file that never uploaded is worse than no
 * assignment, because it looks fine and 404s for every pupil.
 */

interface Assignment {
  id: string; title: string; instructions: string | null; dueAt: string | null;
  attachmentFileId: string | null; filename: string | null; submissionCount: number;
}
interface Material {
  id: string; title: string; description: string | null; url: string | null;
  fileId: string | null; filename: string | null; bytes: number | null; createdAt: string;
}
interface SubmissionRow {
  studentUserId: string; displayName: string; admissionNo: string;
  submission: {
    id: string; bodyText: string | null; fileId: string | null; filename: string | null;
    submittedAt: string; status: string;
  } | null;
}

function dueLabel(dueAt: string | null): string {
  if (!dueAt) return "no due date";
  const d = new Date(dueAt);
  const overdue = d.getTime() < Date.now();
  return `${overdue ? "was due" : "due"} ${d.toLocaleDateString(undefined, { day: "numeric", month: "short" })}, ` +
    d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export default function ClassworkPanel({ sectionId, sectionName, assignments, materials }: {
  sectionId: string; sectionName: string; assignments: Assignment[]; materials: Material[];
}) {
  const router = useRouter();
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [pct, setPct] = useState<number | null>(null);

  const [hwTitle, setHwTitle] = useState("");
  const [hwInstructions, setHwInstructions] = useState("");
  const [hwDue, setHwDue] = useState("");
  const [hwFile, setHwFile] = useState<UploadedFile | null>(null);

  const [matTitle, setMatTitle] = useState("");
  const [matDesc, setMatDesc] = useState("");
  const [matUrl, setMatUrl] = useState("");
  const [matFile, setMatFile] = useState<UploadedFile | null>(null);

  const [openSheet, setOpenSheet] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SubmissionRow[] | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!openSheet) return;
    setSheet(null);
    api<{ data: SubmissionRow[] }>(`/assignments/${openSheet}/submissions`)
      .then((r) => setSheet(r.data))
      .catch((e) => setErr(e instanceof Error ? e.message : "Could not load the hand-ins."));
  }, [openSheet]);

  async function pick(kind: "hw" | "mat") {
    const input = fileInput.current;
    if (!input?.files?.[0]) return;
    const file = input.files[0];
    setErr(""); setInfo(""); setPct(0);
    try {
      const uploaded = await uploadFile(file, setPct);
      if (kind === "hw") setHwFile(uploaded); else setMatFile(uploaded);
      setInfo(`Attached ${uploaded.filename} (${humanBytes(uploaded.bytes)}).`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed.");
    }
    setPct(null);
    input.value = "";
  }

  async function createAssignment(e: React.FormEvent) {
    e.preventDefault();
    setErr(""); setInfo(""); setPct(null);
    try {
      await api("/assignments", {
        method: "POST",
        body: JSON.stringify({
          section_id: sectionId, title: hwTitle,
          instructions: hwInstructions || null,
          due_at: hwDue ? new Date(hwDue).toISOString() : null,
          attachment_file_id: hwFile?.id ?? null,
        }),
      });
      setHwTitle(""); setHwInstructions(""); setHwDue(""); setHwFile(null);
      setInfo("Homework set. Pupils and their guardians have been emailed.");
      router.refresh();
    } catch (e) {
      setErr(e instanceof ApiError ? e.detail ?? e.message : "Could not set the homework.");
    }
  }

  async function createMaterial(e: React.FormEvent) {
    e.preventDefault();
    setErr(""); setInfo("");
    try {
      await api("/materials", {
        method: "POST",
        body: JSON.stringify({
          section_id: sectionId, title: matTitle, description: matDesc || null,
          url: matUrl || null, file_id: matFile?.id ?? null,
        }),
      });
      setMatTitle(""); setMatDesc(""); setMatUrl(""); setMatFile(null);
      setInfo("Material posted to the class.");
      router.refresh();
    } catch (e) {
      setErr(e instanceof ApiError ? e.detail ?? e.message : "Could not post the material.");
    }
  }

  async function remove(path: string, what: string) {
    if (!confirm(`Delete this ${what}?`)) return;
    setErr("");
    try { await api(path, { method: "DELETE" }); router.refresh(); }
    catch (e) { setErr(e instanceof ApiError ? e.detail ?? e.message : "Could not delete it."); }
  }

  return (
    <>
      <h1>Classwork — {sectionName}</h1>
      {err && <div className="alert err" role="alert">{err}</div>}
      {info && <div className="alert ok" role="status">{info}</div>}

      <div className="grid cols2">
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Set homework</h2>
          <form onSubmit={createAssignment}>
            <label htmlFor="hw-title">Title</label>
            <input id="hw-title" required minLength={3} value={hwTitle}
              onChange={(e) => setHwTitle(e.target.value)} placeholder="Exercise 4, questions 1–10" />
            <label htmlFor="hw-due" style={{ marginTop: 8 }}>Due (optional)</label>
            <input id="hw-due" type="datetime-local" value={hwDue} onChange={(e) => setHwDue(e.target.value)} />
            <label htmlFor="hw-instr" style={{ marginTop: 8 }}>Instructions (optional)</label>
            <textarea id="hw-instr" rows={3} value={hwInstructions}
              onChange={(e) => setHwInstructions(e.target.value)}
              placeholder="Show your working. Bring the book to Thursday's lesson." />
            <label htmlFor="hw-file" style={{ marginTop: 8 }}>Attachment (optional)</label>
            <input id="hw-file" ref={fileInput} type="file" onChange={() => pick("hw")} />
            {pct !== null && <div className="muted" role="status">Uploading… {pct}%</div>}
            {hwFile && <div className="muted">Attached: {hwFile.filename} ({humanBytes(hwFile.bytes)})</div>}
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn" type="submit" disabled={pct !== null}>Set homework</button>
            </div>
          </form>
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0 }}>Post a class material</h2>
          <form onSubmit={createMaterial}>
            <label htmlFor="mat-title">Title</label>
            <input id="mat-title" required minLength={3} value={matTitle}
              onChange={(e) => setMatTitle(e.target.value)} placeholder="Revision sheet — fractions" />
            <label htmlFor="mat-desc" style={{ marginTop: 8 }}>Note (optional)</label>
            <textarea id="mat-desc" rows={2} value={matDesc} onChange={(e) => setMatDesc(e.target.value)} />
            <label htmlFor="mat-file" style={{ marginTop: 8 }}>File (or a link below)</label>
            <input id="mat-file" type="file" onChange={() => pick("mat")} />
            {matFile && <div className="muted">Attached: {matFile.filename} ({humanBytes(matFile.bytes)})</div>}
            <label htmlFor="mat-url" style={{ marginTop: 8 }}>Link (optional)</label>
            <input id="mat-url" type="url" value={matUrl} onChange={(e) => setMatUrl(e.target.value)}
              placeholder="https://…" />
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn" type="submit" disabled={pct !== null || (!matFile && !matUrl)}>
                Post material
              </button>
            </div>
            <p className="muted">Accepted: PDF, Word, Excel, PowerPoint, images, text/CSV, ZIP — up to 25 MB.</p>
          </form>
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Homework ({assignments.length})</h2>
        {assignments.length === 0 && <div className="muted">Nothing set yet.</div>}
        {assignments.map((a) => (
          <div key={a.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
            <div className="row">
              <strong style={{ flex: 1 }}>{a.title}</strong>
              <span className="muted">{dueLabel(a.dueAt)}</span>
            </div>
            {a.instructions && <div className="muted" style={{ whiteSpace: "pre-wrap" }}>{a.instructions}</div>}
            <div className="row" style={{ marginTop: 6 }}>
              {a.attachmentFileId && (
                <a className="btn ghost" href={fileUrl(a.attachmentFileId)}>{a.filename ?? "attachment"}</a>
              )}
              <button className="btn ghost" onClick={() => setOpenSheet(openSheet === a.id ? null : a.id)}>
                {openSheet === a.id ? "Hide hand-ins" : `Hand-ins (${a.submissionCount})`}
              </button>
              <button className="btn danger" onClick={() => remove(`/assignments/${a.id}`, "homework")}>Delete</button>
            </div>
            {openSheet === a.id && (
              <div style={{ marginTop: 8 }}>
                {sheet === null ? <SkeletonTable label="Loading submissions…" rows={3} /> : (
                  <table>
                    <thead><tr><th>Pupil</th><th>Handed in</th><th>Work</th></tr></thead>
                    <tbody>
                      {sheet.map((r) => (
                        <tr key={r.studentUserId}>
                          <td>{r.displayName}<div className="muted">{r.admissionNo}</div></td>
                          <td>
                            {r.submission
                              ? <span className="chip on-present">submitted</span>
                              : <span className="chip on-absent">not yet</span>}
                          </td>
                          <td>
                            {r.submission?.fileId && (
                              <a href={fileUrl(r.submission.fileId)}>{r.submission.filename ?? "file"}</a>
                            )}
                            {r.submission?.bodyText && <div>{r.submission.bodyText}</div>}
                            {!r.submission && <span className="muted">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Class materials ({materials.length})</h2>
        {materials.length === 0 && <div className="muted">Nothing posted yet.</div>}
        {materials.map((m) => (
          <div key={m.id} className="row" style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
            <div style={{ flex: 1 }}>
              <strong>{m.title}</strong>
              {m.description && <div className="muted">{m.description}</div>}
              <div className="muted">
                {new Date(m.createdAt).toLocaleDateString()}
                {m.bytes ? ` · ${humanBytes(m.bytes)}` : ""}
              </div>
            </div>
            {m.fileId && <a className="btn ghost" href={fileUrl(m.fileId)}>{m.filename ?? "file"}</a>}
            {m.url && <a className="btn ghost" href={m.url} target="_blank" rel="noreferrer">Open link</a>}
            <button className="btn danger" onClick={() => remove(`/materials/${m.id}`, "material")}>Delete</button>
          </div>
        ))}
      </div>

      <p className="muted">
        Pupils and guardians see homework and materials on their own pages.{" "}
        <Link href={`/teacher/attendance/${sectionId}`}>Take today&apos;s register</Link>.
      </p>
    </>
  );
}
