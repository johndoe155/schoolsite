import Link from "next/link";
import { requireRole, apiGet } from "@/lib/session";
import Shell from "@/components/shell";
import SetHomework from "@/components/set-homework";

interface Assignment {
  id: string;
  title: string;
  instructions: string | null;
  dueAt: string;
  assignedOn: string;
  maxScore: number | null;
  status: string;
  submissionCount: number;
}

export default async function TeacherHomework({ params }: { params: Promise<{ sectionId: string }> }) {
  const { sectionId } = await params;
  const session = await requireRole("teacher", "teacher_assistant");
  const res = await apiGet<{ sectionId: string; assignments: Assignment[] }>(
    `/homework/sections/${sectionId}`);
  const assignments = res?.assignments ?? [];
  const now = Date.now();

  return (
    <Shell session={session}>
      <h1>Homework</h1>
      <div className="row">
        <Link className="btn ghost" href="/teacher">My sections</Link>
      </div>

      <SetHomework sectionId={sectionId} />

      {assignments.length === 0 ? (
        <div className="card muted">Nothing has been set for this section yet.</div>
      ) : (
        <>
          <h2>Set so far</h2>
          <div className="grid cols2">
            {assignments.map((a) => {
              const past = now > Date.parse(a.dueAt);
              return (
                <div className="card" key={a.id}>
                  <h3 style={{ marginTop: 0 }}>{a.title}</h3>
                  {a.status !== "active" && <span className="chip">{a.status}</span>}
                  <div className={past ? "warn" : "muted"}>
                    Due {new Date(a.dueAt).toLocaleString()}
                    {a.maxScore ? ` · ${a.maxScore} marks` : ""}
                  </div>
                  <div className="muted">{a.submissionCount} handed in</div>
                  {a.instructions && <p>{a.instructions}</p>}
                  <div className="row" style={{ marginTop: 8 }}>
                    <Link className="btn" href={`/teacher/homework/assignment/${a.id}`}>
                      Mark &amp; chase
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </Shell>
  );
}
