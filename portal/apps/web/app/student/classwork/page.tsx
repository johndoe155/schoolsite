import { requireRole, apiGet } from "@/lib/session";
import Shell from "@/components/shell";
import ClassworkList, { type AssignmentRow } from "./classwork-list";
import { fileUrl, humanBytes } from "@/lib/files";

interface MaterialRow {
  id: string; title: string; description: string | null; url: string | null;
  fileId: string | null; filename: string | null; bytes: number | null;
  sectionName: string | null; createdAt: string;
}

export default async function StudentClasswork() {
  const session = await requireRole("student");
  const [assignments, materials] = await Promise.all([
    apiGet<{ data: AssignmentRow[] }>("/student/assignments"),
    apiGet<{ data: MaterialRow[] }>("/student/materials"),
  ]);

  return (
    <Shell session={session}>
      <h1>Homework</h1>
      <p className="muted">
        Everything set for your classes, newest deadlines first. Hand work in here —
        your teacher sees it immediately.
      </p>
      <ClassworkList assignments={assignments?.data ?? []} />

      <h1 style={{ marginTop: 24 }}>Class materials</h1>
      {(materials?.data ?? []).length === 0
        ? <div className="card muted">No materials have been posted yet.</div>
        : (
          <div className="card">
            {(materials?.data ?? []).map((m) => (
              <div key={m.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
                <strong>{m.title}</strong>
                <div className="muted">
                  {m.sectionName ?? "class"} · {new Date(m.createdAt).toLocaleDateString()}
                  {m.bytes ? ` · ${humanBytes(m.bytes)}` : ""}
                </div>
                {m.description && <div>{m.description}</div>}
                <div className="row" style={{ marginTop: 6 }}>
                  {m.fileId && <a className="btn ghost" href={fileUrl(m.fileId)}>{m.filename ?? "Download"}</a>}
                  {m.url && <a className="btn ghost" href={m.url} target="_blank" rel="noreferrer">Open link</a>}
                </div>
              </div>
            ))}
          </div>
        )}
    </Shell>
  );
}
